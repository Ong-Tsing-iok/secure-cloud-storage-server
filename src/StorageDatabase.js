import sqlite from 'better-sqlite3'
import { logger } from './Logger.js'

const storageDb = new sqlite('storage.db', {
  verbose: process.env.NODE_ENV !== 'production' ? console.log : null
})

storageDb.pragma('journal_mode = WAL')
// Prepare the statements
const createUserTable = storageDb.prepare(
  `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  y TEXT not null, 
  g TEXT not null, 
  p TEXT not null
  )`
)
const createFileTable = storageDb.prepare(
  `CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT not null,
  uuid TEXT not null,
  owner INTEGER,
  FOREIGN KEY(owner) REFERENCES users(id)
  )`
)
try {
  createUserTable.run()
  createFileTable.run()
} catch (error) {
  logger.error(`Error creating tables: ${error}`)
}

const selectUserByKeys = storageDb.prepare('SELECT * FROM users WHERE y = ? AND g = ? AND p = ?')
const insertUserWithKeys = storageDb.prepare('INSERT INTO users (y, g, p) VALUES (?, ?, ?)')

logger.info(`Database initialized`)

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
  try {
    const info = selectUserByKeys.get(y, g, p)
    if (info === undefined) {
      // If the user does not exist, add them to the database
      const insertResult = insertUserWithKeys.run(y, g, p)
      if (insertResult.changes === 1) {
        // Set the id to the id of the newly added user
        id = insertResult.lastInsertRowid
      }
    } else {
      // Set the id to the id of the existing user
      id = info.id
    }
  } catch (error) {
    logger.error(`Error checking and adding user: ${error}`)
  }

  // Return the id of the added user or undefined if an error occurred
  return id
}

export { AddUserAndGetId }

// Handle graceful shutdown
process.on('exit', () => storageDb.close())
process.on('SIGHUP', () => process.exit(128 + 1))
process.on('SIGINT', () => process.exit(128 + 2))
process.on('SIGTERM', () => process.exit(128 + 15))
