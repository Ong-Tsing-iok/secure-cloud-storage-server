import { logger } from './Logger.js'
import { getFolderInfoOfOwnerId } from './StorageDatabase.js'
const keyFormatRe = /^[a-zA-Z0-9+/=]+$/
const emailFormatRe = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/

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

export { checkLoggedIn, checkFolderExistsForUser, keyFormatRe, emailFormatRe }
