import sqlite from 'better-sqlite3'
import { logger } from './Logger.js'

const interval = 5 * 60 * 1000 // 5 minutes

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
const createUploadsTable = loginDb.prepare(
  `CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY not null, 
  keyC1 TEXT not null,
  keyC2 TEXT not null,
  ivC1 TEXT not null,
  ivC2 TEXT not null,
  expires INTEGER not null
  )`
)

try {
  createLoginTable.run()
  createUploadsTable.run()
} catch (error) {
  logger.error(`Error creating login database: ${error}`)
}

const insertUserStmt = loginDb.prepare(`INSERT INTO users (socketId, userId) VALUES (?, ?)`)

const selectUserStmt = loginDb.prepare(`SELECT userId FROM users WHERE socketId = ?`)

const removeUserStmt = loginDb.prepare(`DELETE FROM users WHERE socketId = ?`)

const insertUploadStmt = loginDb.prepare(
  `INSERT INTO uploads (id, keyC1, keyC2, ivC1, ivC2, expires) VALUES (?, ?, ?, ?, ?, ?)`
)

const selectUploadStmt = loginDb.prepare(`SELECT * FROM uploads WHERE id = ?`)

const removeUploadStmt = loginDb.prepare(`DELETE FROM uploads WHERE id = ?`)

const removeUploadExpiredStmt = loginDb.prepare(`DELETE FROM uploads WHERE expires < ?`)

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
 * @return {{userId: number}|undefined} The userId in a object if found, or undefined if not found.
 */
const checkUserLoggedIn = (socketId) => {
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

const insertUpload = (id, keyC1, keyC2, ivC1, ivC2, expires) => {
  insertUploadStmt.run(id, keyC1, keyC2, ivC1, ivC2, expires)
}

/**
 * Retrieves the upload information with the given ID from the database, removes it, and returns the upload information.
 *
 * @param {string} id - The ID of the upload.
 * @return {{id: string, keyC1: string, keyC2: string, ivC1: string, ivC2: string, expires: number}
 * |undefined} The upload information object if found, or undefined if not found.
 */
const getUpload = (id) => {
  const uploadInfo = selectUploadStmt.get(id)
  removeUploadStmt.run(id)
  return uploadInfo
}

setInterval(() => {
  removeUploadExpiredStmt.run(Date.now())
}, interval)

export { userDbLogin, checkUserLoggedIn, userDbLogout, insertUpload, getUpload }

process.on('exit', () => loginDb.close())
