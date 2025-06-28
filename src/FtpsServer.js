import { FtpSrv, FileSystem } from 'ftp-srv'
import { readFileSync } from 'fs'
import { stat, mkdir } from 'fs/promises'
import path from 'path'
import ConfigManager from './ConfigManager.js'
import { logFtpsError, logFtpsInfo, logFtpsWarning, logger } from './Logger.js'
import { checkUserLoggedIn, getUpload } from './LoginDatabase.js'
import { getFolderInfo } from './StorageDatabase.js'
import { emitToSocket } from './SocketIO.js'
import { finishUpload } from './UploadVerifier.js'
import { InternalServerErrorMsg, NotLoggedInErrorMsg } from './Utils.js'

class CustomFileSystem extends FileSystem {
  constructor(connection, { root, cwd }, fileId) {
    super(connection, { root, cwd })
    this.fileId = fileId
  }
  write(fileName, { append, start }) {
    this.connection.originalFileName = fileName
    return super.write(this.fileId, { append, start })
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

ftpServer.on('login', async (data, resolve, reject) => {
  const { connection, username: socketId, password: fileId } = data // use password as file id
  let actionStr = 'Client tries to authenticate'
  logFtpsInfo(data, actionStr + '.', { socketId })

  try {
    const userInfo = checkUserLoggedIn(socketId)
    let uploadInfo
    if (!userInfo) {
      logFtpsWarning(data, actionStr + ' but is not logged in.')
      reject(new Error(NotLoggedInErrorMsg))
      return
    }
    data.userId = userInfo.userId
    logFtpsInfo(data, 'Client is logged in.')

    const rootPath = path.resolve(ConfigManager.uploadDir, userInfo.userId)
    await mkdir(rootPath, { recursive: true })

    if (fileId !== 'guest') {
      // meaning this is upload
      actionStr = 'Client tries to upload file'
      logFtpsInfo(data, actionStr + '.')

      uploadInfo = getUpload(fileId)
      if (uploadInfo === undefined) {
        logFtpsWarning(data, actionStr + ' but upload info does not exist.')
        reject(new Error('Upload info not found.'))
        return
      }
      if (uploadInfo.parentFolderId && !getFolderInfo(uploadInfo.parentFolderId)) {
        logFtpsWarning(data, actionStr + ' but parent folder does not exist.')
        reject(new Error('Parent folder not found.'))
        return
      }
    }
    connectionBinder(data, uploadInfo, socketId)
    resolve({
      root: rootPath,
      fs: new CustomFileSystem(connection, { root: rootPath, cwd: '/' }, fileId)
    })
  } catch (error) {
    logFtpsError(data, error)
    reject(new Error(InternalServerErrorMsg))
  }
})

const connectionBinder = (data, uploadInfo, socketId) => {
  data.connection.on('RETR', (error, filePath) => {
    // Download file
    if (error) {
      logFtpsError(data, error, { fileId: path.basename(filePath) })
      return
    }
    logFtpsInfo(data, 'Client downloaded file.', { fileId: path.basename(filePath) })
  })

  data.connection.on('STOR', async (error, fileName) => {
    // Upload file
    if (error) {
      logFtpsError(data, error)
      return
    }

    try {
      const fileSize = (await stat(fileName)).size
      await finishUpload({
        name: data.connection.originalFileName,
        id: path.basename(fileName),
        userId: data.userId,
        originOwnerId: data.userId,
        cipher: uploadInfo.cipher,
        spk: uploadInfo.spk,
        parentFolderId: uploadInfo.parentFolderId,
        size: fileSize
      })
      logFtpsInfo(data, 'Client uploaded file.', {
        fileName: data.connection.originalFileName,
        userId: data.userId
      })
    } catch (error) {
      logFtpsError(data, error)
      emitToSocket(socketId, 'upload-file-res', { errorMsg: InternalServerErrorMsg })
    }
  })
}

logger.info('FTP server initialized.')
export default ftpServer
