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
  owner INTEGER not null,
  key TEXT,
  iv TEXT,
  description TEXT,
  timestamp INTEGER default CURRENT_TIMESTAMP,
  FOREIGN KEY(owner) REFERENCES users(id)
  )`
) // TODO: add time to storage?
try {
  createUserTable.run()
  createFileTable.run()
} catch (error) {
  logger.error(error)
}

const selectUserByKeys = storageDb.prepare('SELECT * FROM users WHERE y = ? AND g = ? AND p = ?')
const insertUserWithKeys = storageDb.prepare('INSERT INTO users (y, g, p) VALUES (?, ?, ?)')
const insertFile = storageDb.prepare(
  'INSERT INTO files (name, uuid, owner, key, iv, description) VALUES (?, ?, ?, ?, ?, ?)'
)
const updateFile = storageDb.prepare(
  'UPDATE files SET key = ?, iv = ?, description = ? WHERE uuid = ?'
)
const selectFileByUuid = storageDb.prepare('SELECT * FROM files WHERE uuid = ?')
const selectAllFilesByUserId = storageDb.prepare('SELECT name, uuid FROM files WHERE owner = ?')
const deleteFileByUuid = storageDb.prepare('DELETE FROM files WHERE uuid = ?')

logger.info(`Database initialized`)

/**
 * Checks if a user with the given public keys (p, g, y) exists in the database,
 * and if not, adds the user to the database.
 *
 * @param {string} p - The public key p.
 * @param {string} g - The public key g.
 * @param {string} y - The public key y.
 * @return {{id: number|undefined, exists: boolean}} An object containing the id of the added user and a boolean indicating if the user already existed.
 *                  If an error occurred, the id is undefined and the boolean is false.
 */
const AddUserAndGetId = (p, g, y) => {
  // Initialize the id with undefined
  let id = undefined
  let exists = false

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
    exists = true
  }
  // Return the id of the added user or undefined if an error occurred
  return { id, exists }
}

/**
 * Adds a file to the database with the given name, UUID, user ID, key, IV, and description.
 *
 * @param {string} name - The name of the file.
 * @param {string} uuid - The UUID of the file.
 * @param {number} userId - The ID of the user who owns the file.
 * @param {string} key - The key associated with the file.
 * @param {string} iv - The initialization vector associated with the file.
 * @param {string} description - The description of the file.
 * @return {void} This function does not return a value.
 */
const addFileToDatabase = (name, uuid, userId, key, iv, description) => {
  insertFile.run(name, uuid, userId, key, iv, description)
}

const updateFileInDatabase = (uuid, key, iv, description) => {
  updateFile.run(key, iv, description, uuid)
}

/**
 * Retrieves file information from the database based on the given UUID.
 *
 * @param {string} uuid - The UUID of the file.
 * @return {{id: number, name: string, uuid: string, owner: number, 
 * key: string, iv: string, description: string, timestamp: number}|undefined}
 * An object of the file information if found, or undefined if not found.
 */
const getFileInfo = (uuid) => {
  return selectFileByUuid.get(uuid)
}

/**
 * Retrieves all files associated with a specific user ID.
 *
 * @param {number} userId - The ID of the user.
 * @return {Array} An array of files associated with the user.
 */
const getAllFilesByUserId = (userId) => {
  return selectAllFilesByUserId.all(userId)
}

const deleteFile = (uuid) => {
  return deleteFileByUuid.run(uuid)
}

export { AddUserAndGetId, addFileToDatabase, getFileInfo, getAllFilesByUserId, deleteFile, updateFileInDatabase }

// Handle graceful shutdown
process.on('exit', () => storageDb.close())
process.on('SIGHUP', () => process.exit(128 + 1))
process.on('SIGINT', () => process.exit(128 + 2))
process.on('SIGTERM', () => process.exit(128 + 15))
