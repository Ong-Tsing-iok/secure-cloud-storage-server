import sqlite from 'better-sqlite3'
import { logger } from './Logger.js'
import { randomUUID } from 'crypto'

const storageDb = new sqlite('storage.db', {
  verbose: process.env.NODE_ENV !== 'production' ? console.log : null
})

storageDb.pragma('journal_mode = WAL')
/**prepare tables */
try {
  // user table
  storageDb
    .prepare(
      `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY not null, 
      pk TEXT not null,
      timestamp INTEGER default CURRENT_TIMESTAMP
      )`
    )

    .run()
  // file table
  // permissions: 0 = private, 1 = public, 2 = unlisted
  // parentFolderId: null = root
  storageDb
    .prepare(
      `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY not null,
      name TEXT not null,
      ownerId TEXT not null,
      originOwnerId TEXT not null,
      permissions INTEGER not null,
      keyCipher TEXT,
      ivCipher TEXT,
      parentFolderId TEXT,
      size INTEGER,
      description TEXT,
      timestamp INTEGER default CURRENT_TIMESTAMP,
      FOREIGN KEY(ownerId) REFERENCES users(id),
      FOREIGN KEY(originOwnerId) REFERENCES users(id),
      FOREIGN KEY(parentFolderId) REFERENCES folders(id)
      )`
    )
    .run()
  // folder table
  // parentFolderId: null = root
  storageDb
    .prepare(
      `CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY not null,
      name TEXT not null,
      ownerId TEXT not null,
      permissions INTEGER not null,
      parentFolderId TEXT,
      timestamp INTEGER default CURRENT_TIMESTAMP,
      FOREIGN KEY(ownerId) REFERENCES users(id),
      FOREIGN KEY(parentFolderId) REFERENCES folders(id)
      )`
    )
    .run()
  // request table
  storageDb
    .prepare(
      `CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY not null,
      fileId TEXT not null,
      requester INTEGER not null,
      agreed BOOLEAN default null,
      timestamp INTEGER default CURRENT_TIMESTAMP,
      FOREIGN KEY(fileId) REFERENCES files(id),
      FOREIGN KEY(requester) REFERENCES users(id)
      )`
    )
    .run()
} catch (error) {
  logger.error(error)
}

/**
 *! User Related Queries
 */
//* prepare queries
const selectUserByKeys = storageDb.prepare('SELECT * FROM users WHERE pk = ?')
const insertUser = storageDb.prepare('INSERT INTO users (id, pk) VALUES (?, ?)')

//* functions
/**
 * Checks if a user with the given public keys (p, g, y) exists in the database,
 * and if not, adds the user to the database.
 *
 * @param {string} pk - The public key of the user.
 * @return {{id: string|undefined, exists: boolean}} An object containing the id of the added user and a boolean indicating if the user already existed.
 *                  If an error occurred, the id is undefined and the boolean is false.
 */
export const AddUserAndGetId = (pk) => {
  // Initialize the id with undefined
  let id = undefined
  let exists = false

  const info = selectUserByKeys.get(pk)
  if (info === undefined) {
    // If the user does not exist, add them to the database
    id = randomUUID()
    const insertResult = insertUser.run(id, pk)
  } else {
    // Set the id to the id of the existing user
    id = info.id
    exists = true
  }
  // Return the id of the added user or undefined if an error occurred
  return { id, exists }
}

/**
 *! File Related Queries
 */
//* prepare queries
const insertFile = storageDb.prepare(
  'INSERT INTO files (id, name, ownerId, originOwnerId, keyCipher, ivCipher, parentFolderId, permissions, size, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
)
const selectFileById = storageDb.prepare('SELECT * FROM files WHERE id = ?')
const updateFileById = storageDb.prepare(
  'UPDATE files SET keyCipher = ?, ivCipher = ?, parentFolderId = ?, size = ?, description = ? WHERE id = ?'
)
const deleteFileById = storageDb.prepare('DELETE FROM files WHERE id = ?')
const selectFilesByOwnerId = storageDb.prepare('SELECT * FROM files WHERE ownerId = ?')
const selectFilesByParentFolderId = storageDb.prepare(
  'SELECT * FROM files WHERE parentFolderId = ?'
)

//* functions
/**
 * Adds a file to the database with the given name, ID, user ID, key cipher, IV cipher, size, and description.
 *
 * @param {string} name - The name of the file.
 * @param {string} id - The UUID of the file.
 * @param {string} userId - The ID of the user.
 * @param {string} originOwnerId - The ID of the orignal owner of the file.
 * @param {string} keyCipher - The cipher for the key.
 * @param {string} ivCipher - The cipher for the initialization vector.
 * @param {string} parentFolderId - The ID of the parent folder.
 * @param {number} size - The size of the file in bytes.
 * @param {string} description - The description of the file.
 * @return {void} This function does not return a value.
 */
export const addFileToDatabase = (name, id, userId, originOwnerId, keyCipher, ivCipher, parentFolderId, size, description) => {
  insertFile.run(id, name, userId, originOwnerId, keyCipher, ivCipher, parentFolderId, 0, size, description)
}

/**
 * Retrieves file information from the database based on the given UUID.
 *
 * @param {string} uuid - The UUID of the file.
 * @return {{id: string, name: string, uuid: string, ownerId: string, originOwnerId: string,
 * keyCipher: string, ivCipher: string, size: number, description: string, timestamp: number}|undefined}
 * An object of the file information if found, or undefined if not found.
 */
export const getFileInfo = (uuid) => {
  return selectFileById.get(uuid)
}

/**
 * Updates the information of a file in the database.
 *
 * @param {string} uuid - The UUID of the file to be updated.
 * @param {string} keyCipher - The cipher for the key.
 * @param {string} ivCipher - The cipher for the initialization vector.
 * @param {string} parentFolderId - The ID of the parent folder.
 * @param {number} size - The size of the file in bytes.
 * @param {string} description - The description of the file.
 * @return {void} This function does not return a value.
 */
export const updateFileInDatabase = (uuid, keyCipher, ivCipher, parentFolderId, size, description) => {
  updateFileById.run(keyCipher, ivCipher, parentFolderId, size, description, uuid)
}

export const deleteFile = (uuid) => {
  return deleteFileById.run(uuid)
}

/**
 * Retrieves all files associated with a specific user ID.
 *
 * @param {string} userId - The ID of the user.
 * @return {Array} An array of files associated with the user.
 */
export const getAllFilesByUserId = (userId) => {
  return selectFilesByOwnerId.all(userId)
}

export const getAllFilesByParentFolderId = (parentFolderId) => {
  return selectFilesByParentFolderId.all(parentFolderId)
}

/**
 *! Folder Related Queries
 */
//* prepare queries
const insertFolder = storageDb.prepare(
  'INSERT INTO folders (name, parentFolderId, ownerId, permissions) VALUES (?, ?, ?, ?)'
)
const selectFolderById = storageDb.prepare('SELECT * FROM folders WHERE id = ?')
const selectFoldersByOwnerId = storageDb.prepare('SELECT * FROM folders WHERE ownerId = ?')
const selectFoldersByParentFolderId = storageDb.prepare(
  'SELECT * FROM folders WHERE parentFolderId'
)

//* functions
export const insertFolderToDatabase = (name, parentFolderId, userId, permissions = 0) => {
  insertFolder.run(name, parentFolderId, userId, permissions)
}

export const getFolderInfo = (folderId) => {
  return selectFolderById.get(folderId)
}

export const getAllFoldersByUserId = (userId) => {
  return selectFoldersByOwnerId.all(userId)
}

export const getAllFoldersByParentFolderId = (parentFolderId) => {
  return selectFoldersByParentFolderId.all(parentFolderId)
}

/**
 *! Request Related Queries
 */
//* prepare queries
const insertRequest = storageDb.prepare(
  'INSERT INTO requests (fileId, id, requester) VALUES (?, ?, ?)'
)
const selectRequestsByOwner = storageDb.prepare(
  `SELECT requests.id, requests.fileId, requests.agreed, requests.timestamp, files.name
  FROM requests 
  JOIN files ON requests.fileId = files.id 
  WHERE files.ownerId = ?`
)
const selectRequestsByRequester = storageDb.prepare(
  'SELECT id, fileId, agreed, timestamp FROM requests WHERE requester = ?'
)
const selectRequesterPkFileId = storageDb.prepare(
  `SELECT users.pk, requests.requester, requests.fileId FROM requests 
  JOIN users ON requests.requester = users.id 
  WHERE requests.id = ?`
)
const selectRequestByValues = storageDb.prepare(
  'SELECT * FROM requests WHERE fileId = ? AND requester = ?'
)
const selectRequestById = storageDb.prepare('SELECT * FROM requests WHERE id = ?')
const updateRequestAgreed = storageDb.prepare('UPDATE requests SET agreed = ? WHERE id = ?')
const deleteRequestById = storageDb.prepare('DELETE FROM requests WHERE id = ?')

//* functions
/**
 * Adds a unique request to the database with the given file ID, UUID, owner, and requester.
 *
 * @param {string} fileId - The ID of the file in the database.
 * @param {string} uuid - The UUID of the request.
 * @param {string} requester - The ID of the requester.
 * @return {boolean} Returns true if the request was added successfully, false otherwise.
 */
export const addUniqueRequest = (fileId, uuid, requester) => {
  const requestInfo = selectRequestByValues.all(fileId, requester)
  let canAdd = false
  if (requestInfo === undefined) {
    canAdd = true
  } else {
    for (const request of requestInfo) {
      if (request.agreed == null) {
        return false
      }
    }
    canAdd = true
  }

  if (canAdd) {
    insertRequest.run(fileId, uuid, requester)
    return true
  }
  return false
}

/**
 *
 * @param {*} userId
 * @returns {Array<{id: string, fileId: string, agreed: boolean, timestamp: string, name: string}>}An array of requests associated with the user.
 */
export const getAllRequestsByOwner = (userId) => {
  return selectRequestsByOwner.all(userId)
}

/**
 *
 * @param {*} userId
 * @returns {Array<{id: string, fileId: string, agreed: boolean, timestamp: number}>}An array of requests associated with the user.
 */
export const getAllRequestsByRequester = (userId) => {
  return selectRequestsByRequester.all(userId)
}

/**
 *
 * @param {*} requestId
 * @returns {{requester: string, pk: string, fileId: string}} The public key of the requester.
 */
export const getRequesterPkFileId = (requestId) => {
  return selectRequesterPkFileId.get(requestId)
}

/**
 *
 * @param {*} requestId
 * @returns {{id: string, fileId: string, requester: string, agreed: boolean, timestamp: string}|undefined} The information of the request.
 */
export const getRequestById = (requestId) => {
  return selectRequestById.get(requestId)
}

export const runRespondToRequest = (agreed, requestId) => {
  const agree = agreed ? 1 : 0
  return updateRequestAgreed.run(agree, requestId).changes > 0
}

/**
 * Deletes a request from the database based on the given UUID.
 *
 * @param {string} uuid - The UUID of the request to be deleted.
 * @return {boolean} Returns true if the request was deleted successfully, false otherwise.
 */
export const deleteRequest = (uuid) => {
  return deleteRequestById.run(uuid).changes > 0
}

/**
 * Handle graceful shutdown
 */
process.on('exit', () => storageDb.close())
process.on('SIGHUP', () => process.exit(128 + 1))
process.on('SIGINT', () => process.exit(128 + 2))
process.on('SIGTERM', () => process.exit(128 + 15))

logger.info(`Database initialized`)
