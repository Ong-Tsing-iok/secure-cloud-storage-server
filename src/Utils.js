import { logger } from './Logger.js'
import { getFolderInfoOfOwnerId } from './StorageDatabase.js'

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
  if (!getFolderInfoOfOwnerId(folderId, userId)) {
    return false
  }
  return true
}

export { checkLoggedIn, checkFolderExistsForUser }
