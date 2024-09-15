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
  pk TEXT not null
  )`
)
const createFileTable = storageDb.prepare(
  `CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY not null,
  name TEXT not null,
  ownerId INTEGER not null,
  keyCipher TEXT,
  ivCipher TEXT,
  size INTEGER,
  description TEXT,
  timestamp INTEGER default CURRENT_TIMESTAMP,
  FOREIGN KEY(ownerId) REFERENCES users(id)
  )`
)

const createRequestTable = storageDb.prepare(
  `CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY not null,
  fileId INTEGER not null,
  requester INTEGER not null,
  agreed BOOLEAN default null,
  timestamp INTEGER default CURRENT_TIMESTAMP,
  FOREIGN KEY(fileId) REFERENCES files(id),
  FOREIGN KEY(requester) REFERENCES users(id)
  )`
)
try {
  createUserTable.run()
  createFileTable.run()
  createRequestTable.run()
} catch (error) {
  logger.error(error)
}

const selectUserByKeys = storageDb.prepare('SELECT * FROM users WHERE pk = ?')
const insertUserWithKeys = storageDb.prepare('INSERT INTO users (pk) VALUES (?)')
const insertFile = storageDb.prepare(
  'INSERT INTO files (id, name, ownerId, keyCipher, ivCipher, size, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
)
const updateFile = storageDb.prepare(
  'UPDATE files SET keyCipher = ?, ivCipher = ?, size = ?, description = ? WHERE id = ?'
)
const selectFileByUuid = storageDb.prepare('SELECT * FROM files WHERE id = ?')
const selectAllFilesByUserId = storageDb.prepare('SELECT name, id FROM files WHERE ownerId = ?')
const deleteFileByUuid = storageDb.prepare('DELETE FROM files WHERE id = ?')

// const selectRequestsByOwner = storageDb.prepare('SELECT * FROM requests WHERE owner = ?') //TODO
const selectRequestsByRequester = storageDb.prepare('SELECT * FROM requests WHERE requester = ?')
const selectRequestByValues = storageDb.prepare(
  'SELECT * FROM requests WHERE fileId = ? AND requester = ?'
)


logger.info(`Database initialized`)

/**
 * Checks if a user with the given public keys (p, g, y) exists in the database,
 * and if not, adds the user to the database.
 *
 * @param {string} pk - The public key of the user.
 * @return {{id: number|undefined, exists: boolean}} An object containing the id of the added user and a boolean indicating if the user already existed.
 *                  If an error occurred, the id is undefined and the boolean is false.
 */
const AddUserAndGetId = (pk) => {
  // Initialize the id with undefined
  let id = undefined
  let exists = false

  const info = selectUserByKeys.get(pk)
  if (info === undefined) {
    // If the user does not exist, add them to the database
    const insertResult = insertUserWithKeys.run(pk)
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
 * Adds a file to the database with the given name, ID, user ID, key cipher, IV cipher, size, and description.
 *
 * @param {string} name - The name of the file.
 * @param {number} id - The UUID of the file.
 * @param {number} userId - The ID of the user.
 * @param {string} keyCipher - The cipher for the key.
 * @param {string} ivCipher - The cipher for the initialization vector.
 * @param {number} size - The size of the file in bytes.
 * @param {string} description - The description of the file.
 * @return {void} This function does not return a value.
 */
const addFileToDatabase = (name, id, userId, keyCipher, ivCipher, size, description) => {
  insertFile.run(id, name, userId, keyCipher, ivCipher, size, description)
}


/**
 * Updates the information of a file in the database.
 *
 * @param {string} uuid - The UUID of the file to be updated.
 * @param {string} keyCipher - The cipher for the key.
 * @param {string} ivCipher - The cipher for the initialization vector.
 * @param {number} size - The size of the file in bytes.
 * @param {string} description - The description of the file.
 * @return {void} This function does not return a value.
 */
const updateFileInDatabase = (uuid, keyCipher, ivCipher, size, description) => {
  updateFile.run(keyCipher, ivCipher, size, description, uuid)
}

/**
 * Retrieves file information from the database based on the given UUID.
 *
 * @param {string} uuid - The UUID of the file.
 * @return {{id: number, name: string, uuid: string, ownerId: number,
 * keyCipher: string, ivCipher: string, size: number, description: string, timestamp: number}|undefined}
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

const getAllRequestFilesByOwner = (userId) => {
  return selectRequestsByOwner.all(userId)
}

const getAllRequestFilesByRequester = (userId) => {
  return selectRequestsByRequester.all(userId)
}

const deleteFile = (uuid) => {
  return deleteFileByUuid.run(uuid)
}

const deleteRequestByUuid = storageDb.prepare('DELETE FROM requests WHERE id = ?')
/**
 * Deletes a request from the database based on the given UUID.
 *
 * @param {string} uuid - The UUID of the request to be deleted.
 * @return {boolean} Returns true if the request was deleted successfully, false otherwise.
 */
const deleteRequest = (uuid) => {
  if (deleteRequestByUuid.run(uuid).changes > 0) {
    return true
  } else {
    return false
  }
}

const insertRequest = storageDb.prepare(
  'INSERT INTO requests (fileId, id, requester) VALUES (?, ?, ?)'
)
/**
 * Adds a unique request to the database with the given file ID, UUID, owner, and requester.
 *
 * @param {number} fileId - The ID of the file in the database.
 * @param {string} uuid - The UUID of the file.
 * @param {number} requester - The ID of the requester.
 * @return {boolean} Returns true if the request was added successfully, false otherwise.
 */
const addUniqueRequest = (fileId, uuid, requester) => {
  const requestInfo = selectRequestByValues.get(fileId, requester)
  if (requestInfo === undefined) {
    insertRequest.run(fileId, uuid, requester)
    return true
  }
  return false
}

export {
  AddUserAndGetId,
  addFileToDatabase,
  getFileInfo,
  getAllFilesByUserId,
  deleteFile,
  deleteRequest,
  updateFileInDatabase,
  addUniqueRequest,
  getAllRequestFilesByOwner,
  getAllRequestFilesByRequester
}

// Handle graceful shutdown
process.on('exit', () => storageDb.close())
process.on('SIGHUP', () => process.exit(128 + 1))
process.on('SIGINT', () => process.exit(128 + 2))
process.on('SIGTERM', () => process.exit(128 + 15))
