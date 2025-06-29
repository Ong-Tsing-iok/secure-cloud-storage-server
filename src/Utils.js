import { createReadStream } from 'fs'
import crypto from 'crypto'
import { logger } from './Logger.js'
import { deleteFileOfOwnerId, getFolderInfoOfOwnerId } from './StorageDatabase.js'
import { resolve } from 'path'
import ConfigManager from './ConfigManager.js'
import { unlink } from 'fs/promises'
import { getSocketId } from './LoginDatabase.js'
import { emitToSocket } from './SocketIO.js'
const keyFormatRe = /^[a-zA-Z0-9+/=]+$/
const emailFormatRe = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/
const uuidFormatRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export const InvalidArgumentErrorMsg = 'Invalid arguments.'
export const InternalServerErrorMsg = 'Internal server error.'
export const NotLoggedInErrorMsg = 'Not logged in.'
export const FileNotFoundErrorMsg = 'File not found.'

const checkLoggedIn = (socket) => {
  if (!socket.authed) {
    logger.warn('Unauthorized attempt', { ip: socket.ip })
    // socket.emit('message', 'not logged in')
    return false
  }
  return true
}

const checkFolderExistsForUser = (folderId, userId) => {
  if (!folderId) {
    return true
  }
  return !!getFolderInfoOfOwnerId(folderId, userId)
}

const getFilePath = (userId, fileId) => {
  return resolve(ConfigManager.uploadDir, userId, fileId)
}

const calculateFileHash = async (filePath, algorithm = 'sha256') => {
  const hash = crypto.createHash(algorithm)
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return '0x' + hash.digest('hex')
}

const revertUpload = async (userId, fileId, errorMsg) => {
  try {
    logger.info(`reverting upload.`, { userId, fileId, errorMsg })
    // remove file from database
    deleteFileOfOwnerId(fileId, userId)
    // remove file from disc
    const filePath = resolve(ConfigManager.uploadDir, userId, fileId)
    await unlink(filePath)
    // send message to client if online
    const socketId = getSocketId(userId)?.socketId
    if (socketId) emitToSocket(socketId, 'upload-file-res', { fileId, errorMsg })
  } catch (error) {
    if (error.code != 'ENOENT') {
      logger.error(error)
    }
  }
}

/**
 *
 * @param {BigInt} value
 * @returns Hex representation of the value.
 */
export const BigIntToHex = (value) => {
  return '0x' + value.toString(16)
}

export {
  checkLoggedIn,
  checkFolderExistsForUser,
  getFilePath,
  calculateFileHash,
  revertUpload,
  keyFormatRe,
  emailFormatRe,
  uuidFormatRe
}
