import sqlite from 'better-sqlite3'
import { logger } from './Logger.js'
import ConfigManager from './ConfigManager.js'

const interval = 5 * 60 * 1000 // 5 minutes
const failureExpireInterval = ConfigManager.loginAttemptsTimeout

const loginDb = new sqlite(':memory:', {
  verbose: process.env.NODE_ENV !== 'production' ? console.log : null
})

loginDb.pragma('journal_mode = WAL')

const createLoginTable = loginDb.prepare(
  `CREATE TABLE IF NOT EXISTS users (
  socketId TEXT PRIMARY KEY not null, 
  userId TEXT not null,
  timestamp INTEGER not null default CURRENT_TIMESTAMP
  )`
)
const createUploadsTable = loginDb.prepare(
  `CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY not null, 
  cipher TEXT not null,
  spk TEXT not null,
  parentFolderId TEXT,
  expires INTEGER not null
  )`
)

const createFailureTable = loginDb.prepare(
  `CREATE TABLE IF NOT EXISTS failures (
  id TEXT PRIMARY KEY not null, 
  timestamp INTEGER not null default CURRENT_TIMESTAMP,
  count INTEGER not null default 1
  )`
)

try {
  createLoginTable.run()
  createUploadsTable.run()
  createFailureTable.run()
} catch (error) {
  logger.error(`Error creating login database: ${error}`)
}

const insertUserStmt = loginDb.prepare(`INSERT INTO users (socketId, userId) VALUES (?, ?)`)

const selectUserStmt = loginDb.prepare(`SELECT userId FROM users WHERE socketId = ?`)

const selectAllUsersStmt = loginDb.prepare(`SELECT * FROM users`)

const getSocketIdStmt = loginDb.prepare(`SELECT socketId FROM users WHERE userId = ?`)

const removeUserStmt = loginDb.prepare(`DELETE FROM users WHERE socketId = ?`)

const insertUploadStmt = loginDb.prepare(
  `INSERT INTO uploads (id, cipher, spk, parentFolderId, expires) VALUES (?, ?, ?, ?, ?)`
)

const selectUploadStmt = loginDb.prepare(`SELECT * FROM uploads WHERE id = ?`)

const removeUploadStmt = loginDb.prepare(`DELETE FROM uploads WHERE id = ?`)

const removeUploadExpiredStmt = loginDb.prepare(`DELETE FROM uploads WHERE expires < ?`)

// failure attempt table
const insertFailureStmt = loginDb.prepare(`INSERT INTO failures (id) VALUES (?)`)
const increaseFailureCountStmt = loginDb.prepare(
  `UPDATE failures SET count = count + 1, timestamp = ? WHERE id = ?`
)
const selectFailureStmt = loginDb.prepare(`SELECT * FROM failures WHERE id = ?`)
const removeFailureExpiredStmt = loginDb.prepare(`DELETE FROM failures WHERE timestamp < ?`)

/**
 * Inserts a user into the database with the given socket ID and user ID.
 *
 * @param {string} socketId - The socket ID of the user.
 * @param {string} userId - The user ID of the user.
 * @return {void} This function does not return a value.
 */
const userDbLogin = (socketId, userId) => {
  insertUserStmt.run(socketId, userId)
}

export const getAllLoginUsers = () => {
  return selectAllUsersStmt.all()
}

/**
 * Retrieves a user from the database based on their socket ID.
 *
 * @param {string} socketId - The socket ID of the user.
 * @return {{userId: string}|undefined} The userId in a object if found, or undefined if not found.
 */
const checkUserLoggedIn = (socketId) => {
  return selectUserStmt.get(socketId)
}

const getSocketId = (userId) => {
  return getSocketIdStmt.get(userId)
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

const insertUpload = (id, cipher, spk, parentFolderId, expires) => {
  insertUploadStmt.run(id, cipher, spk, parentFolderId, expires)
}

/**
 * Retrieves the upload information with the given ID from the database, removes it, and returns the upload information.
 *
 * @param {string} id - The ID of the upload.
 * @return {{id: string, cipher: string, spk: string, parentFolderId: string, expires: number}
 * |undefined} The upload information object if found, or undefined if not found.
 */
const getUpload = (id) => {
  const uploadInfo = selectUploadStmt.get(id)
  removeUploadStmt.run(id)
  return uploadInfo
}

export const removeUpload = (id) => {
  return removeUploadStmt.run(id)
}

export const addFailure = (id) => {
  const result = increaseFailureCountStmt.run(Date.now(), id)
  if (result.changes === 0) {
    return insertFailureStmt.run(id)
  }
  return result
}

/**
 * 
 * @param {string} id 
 * @returns {{ id: string, count: number, timestamp: number }|undefined}
 */
export const getFailure = (id) => {
  return selectFailureStmt.get(id)
}

setInterval(() => {
  removeUploadExpiredStmt.run(Date.now() - interval)
  removeFailureExpiredStmt.run(Date.now() - failureExpireInterval)
}, interval)


export { userDbLogin, checkUserLoggedIn, getSocketId, userDbLogout, insertUpload, getUpload }

process.on('exit', () => loginDb.close())
