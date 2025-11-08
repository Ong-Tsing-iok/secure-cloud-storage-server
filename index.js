import ftpServer from './src/FtpsServer.js'
import { logger } from './src/Logger.js'
import ConfigManager from './src/ConfigManager.js'
import './src/HttpsServer.js'
import './src/SftpServer.js'
import './src/SecretShareDatabase.js'

ftpServer.listen().then(() => {
  logger.info(`Ftp server listening on port ${ConfigManager.ftps.controlPort}`)
})
