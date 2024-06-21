import { FtpSrv, FileSystem } from 'ftp-srv'
import { __dirname, __upload_dir } from './Constants.js'
import { logger } from './Logger.js'
import { readFileSync } from 'fs'
import { checkUserLoggedIn } from './LoginDatabase.js'
import { join, basename, dirname } from 'path'
import { randomUUID } from 'crypto'
import { addFileToDatabase } from './StorageDatabase.js'

const port = process.env.FTP_PORT || 7002

class CustomFileSystem extends FileSystem {
  constructor(connection, { root, cwd }) {
    super(connection, { root, cwd })
  }
  write(fileName, { append, start }) {
    logger.info(`writing file ${fileName}`)
    // Need to store into database first and change name to uuid
    const uuid = randomUUID()
    const userId = Number(basename(this.root))
    addFileToDatabase(fileName, uuid, userId)
    return super.write(uuid, { append, start })
  }

  read(fileName, { start }) {
    logger.info(`reading file ${fileName}`)
    return super.read(fileName, { start })
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
  logger.info(`User ${username} logged in`)
  const userInfo = checkUserLoggedIn(username)
  if (userInfo !== undefined) {
    const rootPath = join(__dirname, __upload_dir, userInfo.userId.toString())
    resolve({
      root: rootPath,
      fs: new CustomFileSystem(connection, { root: rootPath, cwd: '/' })
    })
  } else {
    reject(new Error('User not logged in'))
  }
})

export default ftpServer

ftpServer.listen().then(() => {
  logger.info(`Ftp server listening on port ${port}`)
})
