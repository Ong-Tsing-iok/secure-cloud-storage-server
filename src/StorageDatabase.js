import sqlite from 'better-sqlite3'
import { logger } from './Logger.js'
import { randomUUID } from 'crypto'
import ConfigManager from './ConfigManager.js'
import exp from 'constants'

const storageDb = new sqlite(ConfigManager.databasePath, {
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
      name TEXT,
      email TEXT,
      description TEXT,
      timestamp INTEGER default CURRENT_TIMESTAMP,
      FOREIGN KEY(fileId) REFERENCES files(id),
      FOREIGN KEY(requester) REFERENCES users(id)
      )`
    )
    .run()
  // response table
  storageDb
    .prepare(
      `CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY not null,
      requestId TEXT not null,
      agreed BOOLEAN not null,
      description TEXT,
      timestamp INTEGER default CURRENT_TIMESTAMP,
      FOREIGN KEY(requestId) REFERENCES requests(id)
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
    id = randomUUID().toString()
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
const selectFileByIdOwnerId = storageDb.prepare('SELECT * FROM files WHERE id = ? AND ownerId = ?')
const updateFileById = storageDb.prepare(
  'UPDATE files SET keyCipher = ?, ivCipher = ?, parentFolderId = ?, size = ?, description = ? WHERE id = ?'
)
const updateFileDescPermById = storageDb.prepare(
  'UPDATE files SET description = ?, permissions = ? WHERE id = ?'
)
const updateFileParentFolderById = storageDb.prepare(
  'UPDATE files SET parentFolderId = ? WHERE id = ?'
)
const deleteFileById = storageDb.prepare('DELETE FROM files WHERE id = ?')
const deleteFileByIdOwnerId = storageDb.prepare('DELETE FROM files WHERE id = ? AND ownerId = ?')
const selectFilesByOwnerId = storageDb.prepare('SELECT * FROM files WHERE ownerId = ?')
const selectFilesByParentFolderId = storageDb.prepare(
  'SELECT * FROM files WHERE parentFolderId = ?'
)
const selectFilesByParentFolderIdOwnerId = storageDb.prepare(
  'SELECT * FROM files WHERE parentFolderId = ? AND ownerId = ?'
)
const selectFilesInRootByOwnerId = storageDb.prepare(
  'SELECT * FROM files WHERE parentFolderId IS NULL AND ownerId = ?'
)
const selectPublicFiles = storageDb.prepare('SELECT * FROM files WHERE permissions = 1')
const selectPublicFilesNotOwned = storageDb.prepare(
  'SELECT * FROM files WHERE permissions = 1 AND ownerId != ?'
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
export const addFileToDatabase = (
  name,
  id,
  userId,
  originOwnerId,
  keyCipher,
  ivCipher,
  parentFolderId,
  size,
  description
) => {
  insertFile.run(
    id,
    name,
    userId,
    originOwnerId,
    keyCipher,
    ivCipher,
    parentFolderId,
    0,
    size,
    description
  )
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

export const getFileInfoOfOwnerId = (uuid, userId) => {
  return selectFileByIdOwnerId.get(uuid, userId)
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
export const updateFileInDatabase = (
  uuid,
  keyCipher,
  ivCipher,
  parentFolderId,
  size,
  description
) => {
  updateFileById.run(keyCipher, ivCipher, parentFolderId, size, description, uuid)
}

export const updateFileDescPermInDatabase = (uuid, description, permissions) => {
  updateFileDescPermById.run(description, permissions, uuid)
}

export const moveFileToFolder = (uuid, parentFolderId) => {
  return updateFileParentFolderById.run(parentFolderId, uuid)
}

export const deleteFile = (uuid) => {
  return deleteFileById.run(uuid)
}

export const deleteFileOfOwnerId = (uuid, userId) => {
  return deleteFileByIdOwnerId.run(uuid, userId)
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

export const getAllFilesByParentFolderIdUserId = (parentFolderId, userId) => {
  if (parentFolderId) return selectFilesByParentFolderIdOwnerId.all(parentFolderId, userId)
  return selectFilesInRootByOwnerId.all(userId)
}

export const getAllPublicFiles = () => {
  return selectPublicFiles.all()
}

export const getAllPublicFilesNotOwned = (userId) => {
  return selectPublicFilesNotOwned.all(userId)
}

/**
 *! Folder Related Queries
 */
//* prepare queries
const insertFolder = storageDb.prepare(
  'INSERT INTO folders (id, name, parentFolderId, ownerId, permissions) VALUES (?, ?, ?, ?, ?)'
)
const deleteFolderById = storageDb.prepare('DELETE FROM folders WHERE id = ?')
const selectFolderById = storageDb.prepare('SELECT * FROM folders WHERE id = ?')
const selectFolderByIdOwnerId = storageDb.prepare(
  'SELECT * FROM folders WHERE id = ? AND ownerId = ?'
)
const selectFoldersByOwnerId = storageDb.prepare('SELECT * FROM folders WHERE ownerId = ?')
const selectFoldersByParentFolderId = storageDb.prepare(
  'SELECT * FROM folders WHERE parentFolderId = ?'
)
const selectFoldersByParentFolderIdOwnerId = storageDb.prepare(
  'SELECT * FROM folders WHERE parentFolderId = ? AND ownerId = ?'
)
const selectFoldersInRootByOwnerId = storageDb.prepare(
  'SELECT * FROM folders WHERE parentFolderId IS NULL AND ownerId = ?'
)

//* functions
export const addFolderToDatabase = (name, parentFolderId, userId, permissions = 0) => {
  const id = randomUUID().toString()
  insertFolder.run(id, name, parentFolderId, userId, permissions)
}

export const deleteFolder = (folderId) => {
  return deleteFolderById.run(folderId)
}

export const getFolderInfo = (folderId) => {
  return selectFolderById.get(folderId)
}

export const getFolderInfoOfOwnerId = (folderId, userId) => {
  return selectFolderByIdOwnerId.get(folderId, userId)
}

export const getAllFoldersByUserId = (userId) => {
  return selectFoldersByOwnerId.all(userId)
}

export const getAllFoldersByParentFolderId = (parentFolderId) => {
  return selectFoldersByParentFolderId.all(parentFolderId)
}

export const getAllFoldersByParentFolderIdUserId = (parentFolderId, userId) => {
  if (parentFolderId) return selectFoldersByParentFolderIdOwnerId.all(parentFolderId, userId)
  return selectFoldersInRootByOwnerId.all(userId)
}

/**
 *! Request Related Queries
 */
//* prepare queries
const insertRequest = storageDb.prepare(
  'INSERT INTO requests (fileId, id, requester, name, email, description) VALUES (?, ?, ?, ?, ?, ?)'
)
const insertResponse = storageDb.prepare(
  'INSERT INTO responses (id, requestId, agreed, description) VALUES (?, ?, ?, ?)'
)
const selectRequestsByOwner = storageDb.prepare(
  `SELECT requests.id, requests.fileId, requests.timestamp, files.name
  FROM requests 
  JOIN files ON requests.fileId = files.id 
  WHERE files.ownerId = ?`
)
const selectRequestsByRequester = storageDb.prepare(
  'SELECT id, fileId, timestamp FROM requests WHERE requester = ?'
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
// const updateRequestAgreed = storageDb.prepare('UPDATE requests SET agreed = ? WHERE id = ?')
const deleteRequestById = storageDb.prepare('DELETE FROM requests WHERE id = ?')
const deleteRequestByIdRequester = storageDb.prepare(
  'DELETE FROM requests WHERE id = ? AND requester = ?'
)
const selectResponseByRequestId = storageDb.prepare('SELECT * FROM responses WHERE requestId = ?')
const selectRequestResponseByFileIdRequester = storageDb.prepare(
  'SELECT * FROM responses JOIN requests ON responses.requestId = requests.id WHERE requests.fileId = ? AND requests.requester = ?'
)
const selectRequestResponseByRequester = storageDb.prepare(
  `SELECT requests.id as requestId, requests.fileId, requests.requester, requests.name as userName, requests.email as userEmail, requests.description as requestDescription, requests.timestamp as requestTime,
  responses.agreed, responses.description as responseDescription, responses.timestamp as responseTime 
  FROM requests LEFT JOIN responses ON responses.requestId = requests.id WHERE requests.requester = ?`
)
const selectRequestResponseFileByFileOwner = storageDb.prepare(
  `SELECT requests.id as requestId, requests.fileId, requests.requester, requests.name as userName, requests.email as userEmail, requests.description as requestDescription, requests.timestamp as requestTime,
  responses.agreed, responses.description as responseDescription, responses.timestamp as responseTime,
  files.name, files.ownerId, files.originOwnerId, files.permissions, files.parentFolderId, files.size, files.description, files.timestamp,
  users.pk
  FROM requests LEFT JOIN responses ON responses.requestId = requests.id JOIN files ON requests.fileId = files.id JOIN users ON files.ownerId = users.id WHERE files.ownerId = ?`
)
const selectRequestNotRespondedByFileOwner = storageDb.prepare(
  `SELECT requests.fileId, requests.requester FROM requests LEFT JOIN responses ON responses.requestId = requests.id JOIN files ON requests.fileId = files.id 
  WHERE requests.id = ? AND files.ownerId = ? AND responses.agreed IS NULL`
)
const selectRequestNotRespondedByFileIdRequester = storageDb.prepare(
  `SELECT requests.fileId, requests.requester FROM requests LEFT JOIN responses ON responses.requestId = requests.id
  WHERE requests.fileId = ? AND requests.requester = ? AND responses.agreed IS NULL`
)

//* functions
/**
 * Adds a unique request to the database with the given file ID, UUID, owner, and requester.
 *
 * @param {string} fileId - The ID of the file in the database.
 * @param {string} requester - The ID of the requester.
 * @param {string} name - The name of the requester.
 * @param {string} email - The email of the requester.
 * @param {string} description - The description of the request.
 * @return {boolean} Returns true if the request was added successfully, false otherwise.
 */
export const addUniqueRequest = (fileId, requester, name, email, description) => {
  if (selectRequestNotRespondedByFileIdRequester.get(fileId, requester)) {
    return false
  }
  const requestId = randomUUID().toString()
  insertRequest.run(fileId, requestId, requester, name, email, description)
  return true
}
export const addResponse = (requestId, agreed, description) => {
  const responseId = randomUUID().toString()
  return insertResponse.run(responseId, requestId, agreed, description)
}

export const getAllRequestsResponsesFilesByOwner = (userId) => {
  return selectRequestResponseFileByFileOwner.all(userId)
}

export const getAllRequestsResponsesByRequester = (userId) => {
  return selectRequestResponseByRequester.all(userId)
}

export const getRequestNotRespondedByIdOfFileOwner = (requestId, ownerId) => {
  return selectRequestNotRespondedByFileOwner.get(requestId, ownerId)
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

export const deleteRequestOfRequester = (requestId, requester) => {
  return deleteRequestByIdRequester.run(requestId, requester)
}

/**
 * Handle graceful shutdown
 */
process.on('exit', () => storageDb.close())
process.on('SIGHUP', () => process.exit(128 + 1))
process.on('SIGINT', () => process.exit(128 + 2))
process.on('SIGTERM', () => process.exit(128 + 15))

logger.info(`Database initialized`)
