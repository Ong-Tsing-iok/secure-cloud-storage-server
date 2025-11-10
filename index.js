import { logger } from './src/Logger.js'
import ConfigManager from './src/ConfigManager.js'
import './src/SocketIO.js'
import ftpServer from './src/FtpsServer.js'
import './src/HttpsServer.js'
import './src/SftpServer.js'
import './src/SecretShareDatabase.js'
import './src/CLIlogger.js'

await ftpServer.listen()
logger.info(`Ftp server listening on port ${ConfigManager.ftps.controlPort}`)
