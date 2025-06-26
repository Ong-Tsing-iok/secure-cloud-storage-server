import { FtpSrv, FileSystem } from 'ftp-srv'
import { logger } from './Logger.js'
import { readFileSync } from 'fs'
import { mkdir, unlink } from 'node:fs/promises'
import { checkUserLoggedIn, getUpload } from './LoginDatabase.js'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'
import {
  addFileToDatabase,
  deleteFileOfOwnerId,
  getFolderInfo,
  updateFileInDatabase
} from './StorageDatabase.js'
import { stat } from 'fs/promises'
import { emitToSocket } from './SocketIO.js'
import ConfigManager from './ConfigManager.js'
import { finishUpload } from './UploadVerifier.js'

class CustomFileSystem extends FileSystem {
  constructor(connection, { root, cwd }, uploadId) {
    super(connection, { root, cwd })
    this.uploadId = uploadId
  }
  write(fileName, { append, start }) {
    const uuid = this.uploadId // Use uploadId as fileId
    const userId = basename(this.root)
    addFileToDatabase({ name: fileName, id: uuid, userId, originOwnerId: userId })
    return super.write(uuid, { append, start })
  }
}

const ftpServer = new FtpSrv({
  url: `ftp://${ConfigManager.serverHost}:${ConfigManager.ftpsPort}`,
  pasv_url: `ftp://${ConfigManager.serverHost}:${ConfigManager.ftpsPasvPort}`,
  pasv_min: ConfigManager.ftpsPasvPort,
  pasv_max: ConfigManager.ftpsPasvPort,
  blacklist: ['MKD', 'DELE', 'RNFR', 'RNTO', 'RMD'],
  tls: {
    key: readFileSync(ConfigManager.serverKeyPath),
    cert: readFileSync(ConfigManager.serverCertPath)
  }
})

ftpServer.on('login', async ({ connection, username: socketId, password: uploadId }, resolve, reject) => {
  logger.info('User trying to authenticate', {
    ip: connection.ip,
    protocol: 'ftps',
    socketId
  })
  let uploadInfo
  let userInfo
  try {
    userInfo = checkUserLoggedIn(socketId)
    if (!userInfo) {
      logger.warn('User not logged in', {
        ip: connection.ip,
        socketId,
        uploadId,
        protocol: 'ftps'
      })
      reject(new Error('User not logged in'))
    }

    const rootPath = join(ConfigManager.uploadDir, userInfo.userId)
    await mkdir(rootPath, { recursive: true })

    logger.info('User logged in', {
      ip: connection.ip,
      userId: userInfo.userId,
      uploadId,
      protocol: 'ftps'
    })
    if (uploadId !== 'guest') {
      // meaning this is upload
      uploadInfo = getUpload(uploadId) // use password as upload id
      if (uploadInfo === undefined) {
        logger.warn('Upload info not found in database', {
          ip: connection.ip,
          userId: userInfo.userId,
          uploadId,
          protocol: 'ftps'
        })
        reject(new Error('Upload info not found in database'))
        return
      }
      if (uploadInfo.parentFolderId && !getFolderInfo(uploadInfo.parentFolderId)) {
        logger.warn('Parent folder path not found when uploading', {
          ip: connection.ip,
          userId: userInfo.userId,
          uploadId,
          protocol: 'ftps'
        })
        reject(new Error('Parent folder path not found when uploading'))
        return
      }
    }
    resolve({
      root: rootPath,
      fs: new CustomFileSystem(connection, { root: rootPath, cwd: '/' }, uploadId)
    })
  } catch (error) {
    logger.error(error, {
      ip: connection.ip,
      socketId,
      uploadId,
      protocol: 'ftps'
    })
    reject(new Error('Internal server error'))
  }

  connectionBinder(connection, userInfo, uploadInfo, socketId)
})

const connectionBinder = (connection, userInfo, uploadInfo, socketId) => {
  connection.on('RETR', (error, filePath) => {
    // Download file
    if (error) {
      logger.error(error, {
        ip: connection.ip,
        userId: userInfo.userId,
        filePath,
        protocol: 'ftps'
      })
      return
    }
    logger.info('User downloaded file', {
      ip: connection.ip,
      userId: userInfo.userId,
      filePath,
      protocol: 'ftps'
    })
  })

  connection.on('STOR', async (error, fileName) => {
    // Upload file
    if (error) {
      logger.error(error, {
        ip: connection.ip,
        userId: userInfo.userId,
        protocol: 'ftps'
      })
      // emitToSocket(username, 'upload-file-res', 'Error uploading file')
      return
    }
    try {
      const fileSize = (await stat(fileName)).size
      updateFileInDatabase(
        basename(fileName),
        uploadInfo.cipher,
        uploadInfo.spk,
        uploadInfo.parentFolderId,
        fileSize
      )
      await finishUpload(userInfo.userId, basename(fileName))
      // emitToSocket(username, 'upload-file-res', null)
      logger.info('User uploaded file', {
        ip: connection.ip,
        userId: userInfo.userId,
        fileName: basename(fileName),
        size: fileSize,
        protocol: 'ftps'
      })
    } catch (error) {
      logger.error(error, {
        ip: connection.ip,
        userId: userInfo.userId,
        protocol: 'ftps'
      })
      try {
        deleteFileOfOwnerId(basename(fileName), userInfo.userId)
        await unlink(fileName)
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error(error, {
            ip: connection.ip,
            userId: userInfo.userId,
            protocol: 'ftps'
          })
        }
      }
      emitToSocket(socketId, 'upload-file-res', 'Internal server error')
    }
  })
}

export default ftpServer
