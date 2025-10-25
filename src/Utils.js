import { createReadStream } from 'fs'
import crypto from 'crypto'
import { logger } from './Logger.js'
import { getFolderInfoOfOwnerId } from './StorageDatabase.js'
import { resolve } from 'path'
import ConfigManager from './ConfigManager.js'
const keyFormatRe = /^[a-zA-Z0-9+/=]+$/
const emailFormatRe = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/
const uuidFormatRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export const InvalidArgumentErrorMsg = 'Invalid arguments.'
export const InternalServerErrorMsg = 'Internal server error.'
export const NotLoggedInErrorMsg = 'Not logged in.'
export const FileNotFoundErrorMsg = 'File not found.'
export const EmailNotRegisteredErrorMsg = 'Email not registered.'
export const EmailAlreadyRegisteredErrorMsg = 'Email already registered.'
export const NoEmailAuthFirstErrorMsg = 'Did not ask for email authentication first.'
export const EmailAuthExpiredErrorMsg = 'Email authentication code is expired.'
export const EmailAuthNotMatchErrorMsg = 'Email authentication code did not match.'
export const ShouldNotReachErrorMsg = 'Should not reach.'

const checkLoggedIn = (socket) => {
  if (!socket.authed) {
    logger.warn('Unauthorized attempt', { ip: socket.ip })
    // socket.emit('message', 'not logged in')
    return false
  }
  return true
}

const checkFolderExistsForUser = async (folderId, userId) => {
  if (!folderId) {
    return true
  }
  return await getFolderInfoOfOwnerId(folderId, userId)
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

/**
 *
 * @param {BigInt} value
 * @param {number} maxLength The length to pad to without '0x'
 * @returns Hex representation of the value.
 */
export const BigIntToHex = (value, maxLength = 0) => {
  return '0x' + value.toString(16).padStart(maxLength, '0')
}

/**
 * Converts a BigInt (representing a UUID) back to a standard UUID string.
 * This assumes the BigInt was originally derived from a 128-bit UUID.
 *
 * @param {bigint} uuidBigInt The BigInt to convert back to a UUID string.
 * @returns {string} The UUID string in standard format.
 * @throws {Error} If the BigInt is too large to be a 128-bit UUID.
 */
export function bigIntToUuid(uuidBigInt) {
  // A 128-bit number's maximum value in hexadecimal is 16^32 - 1.
  // The maximum BigInt for a 128-bit UUID is 2^128 - 1, which is (2^64)^2 - 1.
  // This translates to 'ffffffffffffffffffffffffffffffff' in hex.
  const max128BitBigInt = (1n << 128n) - 1n // Calculate 2^128 - 1n

  if (uuidBigInt < 0n || uuidBigInt > max128BitBigInt) {
    throw new Error(`BigInt ${uuidBigInt} is out of the valid range for a 128-bit UUID.`)
  }

  // Convert BigInt to hexadecimal string, then pad with leading zeros if necessary
  let hexString = uuidBigInt.toString(16)

  // Ensure the hex string is 32 characters long (128 bits = 32 hex chars)
  hexString = hexString.padStart(32, '0')

  // Insert hyphens to format as a UUID
  return [
    hexString.substring(0, 8),
    hexString.substring(8, 12),
    hexString.substring(12, 16),
    hexString.substring(16, 20),
    hexString.substring(20, 32)
  ].join('-')
}

export {
  checkLoggedIn,
  checkFolderExistsForUser,
  getFilePath,
  calculateFileHash,
  keyFormatRe,
  emailFormatRe,
  uuidFormatRe
}
