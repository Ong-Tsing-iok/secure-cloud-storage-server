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
 * @return {number|undefined} The id of the added user or undefined if an error occurred.
 */
const AddUserAndGetId = (p, g, y) => {
  // Initialize the id with undefined
  let id = undefined

  // Query the database for a user with the given public keys
  DBHandler.db.get('SELECT * FROM users WHERE y = ? AND g = ? AND p = ?', [y, g, p], (err, row) => {
    if (err) {
      // Log the error if there was an issue with the database query
      logger.error(`Error checking and adding user: ${err}`)
    } else {
      if (row === undefined) {
        // If the user does not exist, add them to the database
        DBHandler.db.run('INSERT INTO users (y, g, p) VALUES (?, ?, ?)', [y, g, p], function (err) {
          if (err) {
            // Log the error if there was an issue with adding the user to the database
            logger.error(`Error adding user: ${err}`)
          } else {
            // Set the id to the id of the newly added user
            id = this.lastID
            logger.verbose(`Added user with y = ${y}, g = ${g}, p = ${p}`)
          }
        })
      } else {
        // If the user already exists, set the id to the id of the existing user
        id = row.id
        logger.debug(`User already existed`)
      }
    }
  })

  // Return the id of the added user or undefined if an error occurred
  return id
}

export { AddUserAndGetId }

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
