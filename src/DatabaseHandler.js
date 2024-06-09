import sqlite3 from 'sqlite3'
import { logger } from './Logger.js'

class DatabaseHandler {
  constructor(dbPath) {
    this.db = new (sqlite3.verbose().Database)(dbPath, (err) => {
      if (err) {
        logger.error(`Error opening database: ${err}`)
      }
    })
    this.db.serialize(() => {
      // p, g and y are public keys
      this.db.run(
        `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        y TEXT not null, 
        g TEXT not null, 
        p TEXT not null
        )`
      )
      this.db.run(
        `CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT not null,
        uuid TEXT not null,
        owner INTEGER,
        FOREIGN KEY(owner) REFERENCES users(id)
        )`
      )
    })
    logger.info('Database opened successfully')
  }

  closeDatabase() {
    this.db.close((err) => {
      if (err) {
        logger.error(`Error closing database: ${err}`)
      } else {
        logger.info('Database closed successfully')
      }
    })
  }
}

const DBHandler = new DatabaseHandler('database.db')

/**
 * Checks if a user with the given public keys (p, g, y) exists in the database,
 * and if not, adds the user to the database.
 *
 * @param {string} p - The public key p.
 * @param {string} g - The public key g.
 * @param {string} y - The public key y.
 * @return {boolean} Returns true if the user was added to the database, false otherwise.
 */
const checkAndAddUser = (p, g, y) => {
  DBHandler.db.get('SELECT * FROM users WHERE y = ? AND g = ? AND p = ?', [y, g, p], (err, row) => {
    if (err) {
      logger.error(`Error checking and adding user: ${err}`)
      return false
    }
    if (row === undefined) {
      DBHandler.db.run('INSERT INTO users (y, g, p) VALUES (?, ?, ?)', [y, g, p])
      logger.verbose(`Added user with y = ${y}, g = ${g}, p = ${p}`)
      return true
    } else {
      logger.debug(`User already existed`)
      return false
    }
  })
  return false
}

export { checkAndAddUser }

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT. Shutting down gracefully...')
  DBHandler.closeDatabase()
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Shutting down gracefully...')
  DBHandler.closeDatabase()
  process.exit(0)
})

// In case of unhandled errors
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err}`)
  DBHandler.closeDatabase()
  process.exit(1)
})
