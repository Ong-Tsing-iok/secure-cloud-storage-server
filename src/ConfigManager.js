import config from 'config'
import { join, resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { logger } from './Logger.js'

const getConfig = (key) => {
  if (config.has(key)) {
    return config.get(key)
  }
  logger.error(`Config ${key} not found`)
  return undefined
}

class ConfigManager {
  ftps = {
    dataPort: 989,
    controlPort: 990,
    pasv_url: 'localhost:989'
  }
  settings = {
    uploadExpireTimeMin: 10
  }
  dbPoolConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: '',
    port: 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: {
      rejectUnauthorized: true
    }
  }
  directoryConfig = {}
  blockchain = {
    jsonRpcUrl: '',
    contractAddr: '',
    walletKeyPath: '',
    abiPath: '',
    enabled: false
  }
  constructor() {
    try {
      this.directoryConfig = getConfig('directories')
      for (const key in this.directoryConfig) {
        if (!existsSync(join(this.directoryConfig[key]))) {
          mkdirSync(join(this.directoryConfig[key]))
        }
      }

      // Ftps server
      this.ftps.dataPort = config.get('server.ftps.port.data')
      this.ftps.controlPort = config.get('server.ftps.port.control')
      this.ftps.pasv_url = config.get('server.ftps.pasv_url')

      // Database
      this.dbPoolConfig.user = config.get('database.user')
      this.dbPoolConfig.host = config.get('database.host')
      this.dbPoolConfig.database = config.get('database.database')
      this.dbPoolConfig.password = config.get('database.password')
      this.dbPoolConfig.port = config.get('database.port')
      this.dbPoolConfig.max = config.get('database.pool.max')
      this.dbPoolConfig.idleTimeoutMillis = config.get('database.pool.idleTimeoutMillis')
      this.dbPoolConfig.connectionTimeoutMillis = config.get(
        'database.pool.connectionTimeoutMillis'
      )
      this.dbPoolConfig.ssl.rejectUnauthorized = config.get('database.ssl.rejectUnauthorized')

      // Blockchain
      this.blockchain = {}
      this.blockchain.jsonRpcUrl = config.get('blockchain.jsonRpcUrl')
      this.blockchain.contractAddr = config.get('blockchain.contractAddr')
      this.blockchain.walletKeyPath = resolve(
        config.get('directories.blockchain'),
        config.get('blockchain.walletKeyPath')
      )
      this.blockchain.abiPath = resolve(
        config.get('directories.blockchain'),
        config.get('blockchain.abiPath')
      )
      this.blockchain.enabled = config.get('blockchain.enabled')

      // Settings
      this.settings.uploadExpireTimeMin = parseInt(config.get('settings.uploadExpireTimeMin'))
    } catch (error) {
      logger.error(error)
    }
  }
  get uploadDir() {
    return getConfig('directories.uploads')
  }
  get databasePath() {
    return join(getConfig('directories.database'), getConfig('database.name'))
  }
  get serverCertPath() {
    return join(getConfig('directories.certs'), getConfig('server.cert'))
  }
  get serverKeyPath() {
    return join(getConfig('directories.certs'), getConfig('server.key'))
  }
  get sshKeyPath() {
    return join(getConfig('directories.ssh'), getConfig('server.ssh.key'))
  }
  get serverHost() {
    return getConfig('server.host')
  }
  get httpsPort() {
    return getConfig('server.https.port')
  }
  get sftpPort() {
    return getConfig('server.sftp.port')
  }
  get databaseLengthLimit() {
    return getConfig('database.descMaxLength')
  }
  get loginAttemptsLimit() {
    return parseInt(getConfig('loginAttempts.limit'))
  }
  get loginAttemptsTimeout() {
    return parseFloat(getConfig('loginAttempts.timeout')) * 60 * 1000
  }
  get uploadExpireTimMiliSec() {
    return this.settings.uploadExpireTimeMin * 60 * 1000
  }
}

export default new ConfigManager()
