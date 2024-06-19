import sqlite from 'better-sqlite3'
import { logger } from './Logger.js'

const loginDb = new sqlite(':memory:', {
  verbose: process.env.NODE_ENV !== 'production' ? console.log : null
})

loginDb.pragma('journal_mode = WAL')

const createLoginTable = loginDb.prepare(
  `CREATE TABLE IF NOT EXISTS users (
  socketId TEXT PRIMARY KEY not null, 
  userId INTEGER not null
  )`
)

try {
  createLoginTable.run()
} catch (error) {
  logger.error(`Error creating login table: ${error}`)
}

const insertUserStmt = loginDb.prepare(
  `INSERT INTO users (socketId, userId) VALUES (?, ?)`
)

const selectUserStmt = loginDb.prepare(
  `SELECT userId FROM users WHERE socketId = ?`
)

const removeUserStmt = loginDb.prepare(
  `DELETE FROM users WHERE socketId = ?`
)

/**
 * Inserts a user into the database with the given socket ID and user ID.
 *
 * @param {string} socketId - The socket ID of the user.
 * @param {number} userId - The user ID of the user.
 * @return {void} This function does not return a value.
 */
const userDbLogin = (socketId, userId) => {
  insertUserStmt.run(socketId, userId)
}

/**
 * Retrieves a user from the database based on their socket ID.
 *
 * @param {string} socketId - The socket ID of the user.
 * @return {Object|null} The user object if found, or null if not found.
 */
const selectUserBySocketId = (socketId) => {
  return selectUserStmt.get(socketId)
}

/**
 * Removes a user from the database based on their socket ID.
 *
 * @param {string} socketId - The socket ID of the user to be removed.
 * @return {void} This function does not return a value.
 */
const userDbLogout = (socketId) => {
  removeUserStmt.run(socketId)
}

export { userDbLogin, selectUserBySocketId, userDbLogout }