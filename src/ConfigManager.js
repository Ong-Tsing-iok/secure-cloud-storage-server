import config from 'config'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

class ConfigManager {
  constructor() {
    // TODO: first check if exist
    // TODO: if not exist, create
    try {
      this.directoryConfig = config.get('directories')
      this.databaseConfig = config.get('database')
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
}

export default new ConfigManager()
