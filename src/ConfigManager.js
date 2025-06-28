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
  settings = {
    uploadExpireTimeMin: 10
  }
  constructor() {
    try {
      this.directoryConfig = getConfig('directories')
      for (const key in this.directoryConfig) {
        if (!existsSync(join(this.directoryConfig.root, this.directoryConfig[key]))) {
          mkdirSync(join(this.directoryConfig.root, this.directoryConfig[key]))
        }
      }

      // Blockchain
      this.blockchain = {}
      this.blockchain.abi = config.get('blockchain.abi')
      this.blockchain.jsonRpcUrl = config.get('blockchain.jsonRpcUrl')
      this.blockchain.contractAddr = config.get('blockchain.contractAddr')
      this.blockchain.walletKeyPath = resolve(
        config.get('directories.root'),
        config.get('blockchain.walletKeyPath')
      )

      // Settings
      this.settings.uploadExpireTimeMin = parseInt(config.get('settings.uploadExpireTimeMin'))
    } catch (error) {}
  }
  get cryptoPath() {
    return resolve(getConfig('directories.root'), 'src', 'py', 'crypto')
  }
  get uploadDir() {
    return join(getConfig('directories.root'), getConfig('directories.uploads'))
  }
  get logDir() {
    return join(getConfig('directories.root'), getConfig('directories.logs'))
  }
  get databasePath() {
    return join(
      getConfig('directories.root'),
      getConfig('directories.database'),
      getConfig('database.name')
    )
  }
  get serverCertPath() {
    return join(
      getConfig('directories.root'),
      getConfig('directories.certs'),
      getConfig('server.cert')
    )
  }
  get serverKeyPath() {
    return join(
      getConfig('directories.root'),
      getConfig('directories.certs'),
      getConfig('server.key')
    )
  }
  get ftpsPort() {
    return getConfig('server.ftps.port.control')
  }
  get ftpsPasvPort() {
    return getConfig('server.ftps.port.data')
  }
  get serverHost() {
    return getConfig('server.host')
  }
  get httpsPort() {
    return getConfig('server.https.port')
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
