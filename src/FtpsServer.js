import { FtpSrv, FileSystem } from 'ftp-srv'
import { logger } from './Logger.js'
import { readFileSync, unlink } from 'fs'
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

class CustomFileSystem extends FileSystem {
  constructor(connection, { root, cwd }) {
    super(connection, { root, cwd })
  }
  write(fileName, { append, start }) {
    const uuid = randomUUID()
    const userId = basename(this.root)
    addFileToDatabase(fileName, uuid, userId, userId)
    return super.write(uuid, { append, start })
  }
}

const ftpServer = new FtpSrv({
  url: `ftp://${ConfigManager.serverHost}:${ConfigManager.ftpsPort}`,
  pasv_url: `ftp://${ConfigManager.serverHost}`,
  blacklist: ['MKD', 'DELE', 'RNFR', 'RNTO', 'RMD'],
  tls: {
    key: readFileSync(join(ConfigManager.serverCertPath, 'server.key')),
    cert: readFileSync('server.crt')
  }
})

ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
  logger.info('User trying to authenticate', {
    ip: connection.ip,
    protocol: 'ftps',
    userId: username
  })
  let uploadInfo = undefined
  let userInfo = undefined
  try {
    userInfo = checkUserLoggedIn(username)
    if (!userInfo) {
      logger.warn('User not logged in', {
        ip: connection.ip,
        userId: username,
        uploadId: password,
        protocol: 'ftps'
      })
      reject(new Error('User not logged in'))
    }

    const rootPath = join(ConfigManager.uploadDir, userInfo.userId)
    logger.info('User logged in', {
      ip: connection.ip,
      userId: userInfo.userId,
      uploadId: password,
      protocol: 'ftps'
    })
    if (password !== 'guest') {
      // meaning this is upload
      uploadInfo = getUpload(password) // use password as upload id
      if (uploadInfo === undefined) {
        logger.warn('Upload info not found in database', {
          ip: connection.ip,
          userId: userInfo.userId,
          uploadId: password,
          protocol: 'ftps'
        })
        reject(new Error('Upload info not found in database'))
        return
      }
      if (uploadInfo.parentFolderId && !getFolderInfo(uploadInfo.parentFolderId)) {
        logger.warn('Parent folder path not found when uploading', {
          ip: connection.ip,
          userId: userInfo.userId,
          uploadId: password,
          protocol: 'ftps'
        })
        reject(new Error('Parent folder path not found when uploading'))
        return
      }
    }
    resolve({
      root: rootPath,
      fs: new CustomFileSystem(connection, { root: rootPath, cwd: '/' })
    })
  } catch (error) {
    logger.error(error, {
      ip: connection.ip,
      userId: username,
      uploadId: password,
      protocol: 'ftps'
    })
    reject(new Error('Unexpected error'))
  }

  connectionBinder(connection)
})

const connectionBinder = (connection, userInfo, uploadInfo) => {
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
        uploadInfo.keyCipher,
        uploadInfo.ivCipher,
        uploadInfo.parentFolderId,
        fileSize,
        null
      )
      // emitToSocket(username, 'upload-file-res', null)
      logger.info('User uploaded file', {
        ip: connection.ip,
        userId: userInfo.userId,
        fileName,
        size: fileSize,
        protocol: 'ftps'
      })
    } catch (error) {
      logger.error(error, {
        ip: connection.ip,
        userId: userInfo.userId,
        protocol: 'ftps'
      })
      unlink(fileName)
      deleteFileOfOwnerId(basename(fileName), userInfo.userId)
      emitToSocket(username, 'upload-file-res', 'Unexpected error')
    }
  })
}

export default ftpServer

ftpServer.listen().then(() => {
  logger.info(`Ftp server listening on port ${ConfigManager.ftpsPort}`)
})
