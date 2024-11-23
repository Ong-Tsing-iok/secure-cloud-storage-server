import config from 'config'
import { join } from 'path'
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
  constructor() {
    // TODO: first check if exist
    // TODO: if not exist, create
    try {
      this.directoryConfig = getConfig('directories')
      for (const key in this.directoryConfig) {
        if (!existsSync(join(this.directoryConfig.root, this.directoryConfig[key]))) {
          mkdirSync(join(this.directoryConfig.root, this.directoryConfig[key]))
        }
      }
    } catch (error) {}
  }
  get cryptoPath() {
    return join(getConfig('directories.root'), 'src', 'py', 'crypto')
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
}

export default new ConfigManager()
