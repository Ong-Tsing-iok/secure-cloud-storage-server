/**
 * This file handles server configs
 */
import config from 'config'
import { join, resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
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
    uploadExpireTimeMin: 10,
    emailAuthExpireTimeMin: 5,
    emailAuthLength: 6
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
  login = {
    idleTimeoutMin: 30,
    failedAttemptLimit: 5,
    failedRecordRefreshMin: 5,
    failedBlockTimeMin: 15
  }
  blockchain = {
    jsonRpcUrl: '',
    contractAddr: '',
    walletKeyPath: '',
    abiPath: '',
    enabled: false
  }
  trustedAuthority = {
    url: ''
  }
  smtp = {
    host: '',
    user: '',
    pass: '',
    from: '',
    enabled: false,
    useMailerSend: false,
    apiKey: ''
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

      this.secretShareDbConfigs = []
      const secretShareInfo = config.get('database.secretShare')
      for (const secretShare of secretShareInfo) {
        this.secretShareDbConfigs.push({
          user: secretShare.user || this.dbPoolConfig.user,
          host: secretShare.host || this.dbPoolConfig.host,
          database: secretShare.database || this.dbPoolConfig.database,
          password: secretShare.password || this.dbPoolConfig.password,
          port: secretShare.port || this.dbPoolConfig.port,
          max: this.dbPoolConfig.max,
          idleTimeoutMillis: this.dbPoolConfig.idleTimeoutMillis,
          connectionTimeoutMillis: this.dbPoolConfig.connectionTimeoutMillis,
          ssl: {
            rejectUnauthorized: this.dbPoolConfig.ssl.rejectUnauthorized
          }
        })
      }

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

      // Login settings
      this.login.idleTimeoutMin = config.get('login.idleTimeoutMin')
      this.login.failedAttemptLimit = config.get('login.failedAttemptLimit')
      this.login.failedRecordRefreshMin = config.get('login.failedRecordRefreshMin')
      this.login.idleTimeofailedBlockTimeMinutMin = config.get('login.failedBlockTimeMin')

      // Trusted Authority
      this.trustedAuthority.url = config.get('trustedAuthority.url')

      // SMTP
      this.smtp.host = config.get('smtp.host')
      this.smtp.user = config.get('smtp.user')
      this.smtp.pass = config.get('smtp.pass')
      this.smtp.from = config.get('smtp.from')
      this.smtp.enabled = config.get('smtp.enabled')
      this.smtp.useMailerSend = config.get('smtp.useMailerSend')
      this.smtp.apiKey = config.get('smtp.apiKey')

      // Other settings
      this.settings.uploadExpireTimeMin = Number.parseInt(
        config.get('settings.uploadExpireTimeMin')
      )
      this.settings.emailAuthExpireTimeMin = Number.parseInt(
        config.get('settings.emailAuthExpireTimeMin')
      )
      this.settings.emailAuthLength = Number.parseInt(config.get('settings.emailAuthLength'))
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
}

export default new ConfigManager()
console.log('ConfigManager.js loaded.')
