import { FtpSrv, FileSystem } from 'ftp-srv'
import { __dirname, __upload_dir } from './Constants.js'
import { logger } from './Logger.js'
import { readFileSync, unlink } from 'fs'
import { checkUserLoggedIn, getUpload } from './LoginDatabase.js'
import { join, basename, dirname } from 'path'
import { randomUUID } from 'crypto'
import { addFileToDatabase, deleteFile, updateFileInDatabase } from './StorageDatabase.js'

const port = process.env.FTP_PORT || 7002

class CustomFileSystem extends FileSystem {
  constructor(connection, { root, cwd }) {
    super(connection, { root, cwd })
  }
  write(fileName, { append, start }) {
    const uuid = randomUUID()
    const userId = Number(basename(this.root))
    addFileToDatabase(fileName, uuid, userId)
    return super.write(uuid, { append, start })
  }
}

const ftpServer = new FtpSrv({
  url: `ftp://127.0.0.1:${port}`,
  pasv_url: 'ftp://127.0.0.1',
  blacklist: ['MKD', 'DELE', 'RNFR', 'RNTO', 'RMD'],
  tls: {
    key: readFileSync('server.key'),
    cert: readFileSync('server.crt')
  }
})

ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
  logger.info('User trying to authenticate', {
    socketId: username,
    ip: connection.ip,
    protocol: 'ftps'
  })
  const userInfo = checkUserLoggedIn(username)
  if (userInfo !== undefined) {
    const rootPath = join(__dirname, __upload_dir, userInfo.userId.toString())
    logger.info('User logged in', {
      socketId: username,
      ip: connection.ip,
      userId: userInfo.userId,
      protocol: 'ftps'
    })
    resolve({
      root: rootPath,
      fs: new CustomFileSystem(connection, { root: rootPath, cwd: '/' })
    })
  } else {
    logger.info('User not logged in', { socketId: username, ip: connection.ip, protocol: 'ftps' })
    reject(new Error('User not logged in'))
  }

  connection.on('RETR', (error, filePath) => {
    if (error) {
      logger.error(error, {
        socketId: username,
        ip: connection.ip,
        userId: userInfo.userId,
        filePath,
        protocol: 'ftps'
      })
      return
    }
    logger.info('User downloaded file', {
      socketId: username,
      ip: connection.ip,
      userId: userInfo.userId,
      filePath,
      protocol: 'ftps'
    })
  })
  connection.on('STOR', (error, fileName) => {
    if (error) {
      logger.error(error, {
        socketId: username,
        ip: connection.ip,
        userId: userInfo.userId,
        fileName,
        protocol: 'ftps'
      })
      return
    }
    const uploadInfo = getUpload(password) // use password as upload id
    if (uploadInfo === undefined) {
      logger.info('Upload ID not found in database', {
        socketId: username,
        ip: connection.ip,
        userId: userInfo.userId,
        fileName,
        protocol: 'ftps'
      })
      deleteFile(basename(fileName))
      unlink(fileName)
      // TODO: send error message to client
      return
    }
    updateFileInDatabase(basename(fileName), uploadInfo.key, uploadInfo.iv, null)
    logger.info('User uploaded file', {
      socketId: username,
      ip: connection.ip,
      userId: userInfo.userId,
      fileName,
      protocol: 'ftps'
    })
  })
})

export default ftpServer

ftpServer.listen().then(() => {
  logger.info(`Ftp server listening on port ${port}`)
})
