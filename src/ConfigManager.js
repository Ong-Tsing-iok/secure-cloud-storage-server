import config from 'config'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { logger } from './Logger'

const getConfig = (key) => {
  if (config.has(key)) {
    return getConfig(key)
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
      this.databaseConfig = getConfig('database')
      this.serverConfig = getConfig('server')
      this.httpsConfig = getConfig('server.https')
      this.ftpsConfig = getConfig('server.ftps')
      for (const key in this.directoryConfig) {
        if (!existsSync(join(this.directoryConfig.root, this.directoryConfig[key]))) {
          mkdirSync(join(this.directoryConfig.root, this.directoryConfig[key]))
        }
      }
    } catch (error) {}
  }
  get uploadDir() {
    return join(this.directoryConfig.root, this.directoryConfig.upload)
  }
  get databasePath() {
    return join(this.directoryConfig.root, this.directoryConfig.database, 'storage.db')
  }
  get serverCertPath() {
    return join(getConfig('directories.root'), getConfig('directories.certs'), getConfig('server.cert'))
  }
  get serverKeyPath() {
    return join(getConfig('directories.root'), getConfig('directories.certs'), getConfig('server.key'))
  }
  get ftpsPort() {
    return getConfig('server.ftps.port')
  }
  get serverHost() {
    return getConfig('server.host')
  }
  get httpsPort() {P
    return getConfig('server.https.port')
  }
}

export default new ConfigManager()
