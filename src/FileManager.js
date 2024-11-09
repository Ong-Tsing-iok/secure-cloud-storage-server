import { logger } from './Logger.js'
import {
  getFileInfo,
  deleteFile,
  addFolderToDatabase,
  deleteFolder,
  getAllFilesByParentFolderIdUserId,
  getAllFoldersByParentFolderIdUserId,
  moveFileToFolder,
  getAllFoldersByUserId,
  getAllPublicFilesNotOwned,
  getFileInfoOfOwnerId,
  updateFileDescPermInDatabase
} from './StorageDatabase.js'
import { unlink, stat } from 'fs/promises'
import { join } from 'path'
import { __upload_dir, __dirname } from './Constants.js'
import { randomUUID } from 'crypto'
import { insertUpload } from './LoginDatabase.js'
import { checkFolderExistsForUser, checkLoggedIn } from './Utils.js'
import ConfigManager from './ConfigManager.js'

const uploadExpireTime = 1000 * 60 * 10 // 10 minutes

const downloadFileBinder = (socket) => {
  socket.on('download-file-pre', (uuid, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client asked for file`, {
      ip: socket.ip,
      userId: socket.userId,
      uuid: uuid
    })

    try {
      const fileInfo = getFileInfo(uuid)
      if (fileInfo === undefined || fileInfo.ownerId !== socket.userId) {
        logger.warn('File not found when downloading file', {
          ip: socket.ip,
          userId: socket.userId,
          uuid: uuid
        })
        cb('file not found')
        return
      }
      cb(null, fileInfo)
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId,
        uuid
      })
      cb('unexpected error')
    }
  })
}
const uploadFileBinder = (socket) => {
  socket.on('upload-file-pre', (key, iv, parentFolderId, cb) => {
    logger.info(`Client ask to prepare upload file`, {
      ip: socket.ip
    })
    if (!socket.authed) {
      cb('not logged in')
      return
    }
    try {
      if (!checkFolderExistsForUser(parentFolderId, socket.userId)) {
        logger.warn(`Client tried to upload file to non-existent folder`, {
          ip: socket.ip,
          userId: socket.userId,
          parentFolderId
        })
        cb('parent folder not found')
        return
      }
      // create random id
      const id = randomUUID()
      // store with key and iv in database with expires time
      insertUpload(id, key, iv, parentFolderId, Date.now() + uploadExpireTime)
      cb(null, id)
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb('unexpected error')
    }
  })
}

const deleteFileBinder = (socket) => {
  socket.on('delete-file', async (uuid, cb) => {
    if (!socket.authed) {
      cb('not logged in')
      return
    }
    logger.info(`Client requested to delete file`, { ip: socket.ip, uuid })
    try {
      const fileInfo = getFileInfo(uuid)
      if (fileInfo !== undefined) {
        if (fileInfo.ownerId !== socket.userId) {
          cb('permission denied')
        } else {
          deleteFile(uuid)
          await unlink(join(__dirname, __upload_dir, socket.userId, uuid))
          logger.info(`File deleted`, {
            ip: socket.ip,
            userId: socket.userId,
            uuid
          })
          cb(null)
        }
      } else {
        cb('file not found')
      }
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId,
        uuid
      })
      cb('unexpected error')
    }
  })
}

const getFileListBinder = (socket) => {
  socket.on('get-file-list', (parentFolderId, cb) => {
    if (!checkLoggedIn(socket)) {
      cb(null, 'not logged in')
      return
    }
    logger.info(`Client requested to get file list`, {
      ip: socket.ip,
      parentFolderId,
      userId: socket.userId
    })
    try {
      const files = getAllFilesByParentFolderIdUserId(parentFolderId, socket.userId)
      const folders = getAllFoldersByParentFolderIdUserId(parentFolderId, socket.userId)
      // console.log({ files, folders })
      cb({ files: JSON.stringify(files), folders: JSON.stringify(folders) })
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb(null, 'unexpected error')
    }
  })
}

const folderBinder = (socket) => {
  // Add folder
  socket.on('add-folder', (parentFolderId, name, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client requested to add folder`, {
      ip: socket.ip,
      parentFolderId,
      name,
      userId: socket.userId
    })
    try {
      addFolderToDatabase(name, parentFolderId, socket.userId)
      logger.info(`Folder added`, {
        ip: socket.ip,
        userId: socket.userId,
        parentFolderId,
        name
      })
      cb(null)
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb('unexpected error')
    }
  })
  // Delete folder
  socket.on('delete-folder', (folderId, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client requested to delete folder`, {
      ip: socket.ip,
      folderId,
      userId: socket.userId
    })
    try {
      const files = getAllFilesByParentFolderIdUserId(folderId, socket.userId)
      const folders = getAllFoldersByParentFolderIdUserId(folderId, socket.userId)
      if (files.length > 0 || folders.length > 0) {
        cb('folder not empty')
        return
      }
      if (deleteFolder(folderId).changes > 0) {
        cb(null)
        logger.info(`Folder deleted`, {
          ip: socket.ip,
          userId: socket.userId,
          folderId
        })
      } else {
        cb("folder don't exists")
        logger.warn(`Client tried to delete a non existing folder`, {
          ip: socket.ip,
          userId: socket.userId,
          folderId
        })
      }
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb('unexpected error')
    }
  })
  // get all folder
  socket.on('get-all-folders', (cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client requested to get all folders`, {
      ip: socket.ip,
      userId: socket.userId
    })
    try {
      const folders = getAllFoldersByUserId(socket.userId)
      cb(JSON.stringify(folders))
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb('unexpected error')
    }
  })
}

const moveFileBinder = (socket) => {
  socket.on('move-file', (fileId, targetFolderId, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client requested to move file`, {
      ip: socket.ip,
      fileId,
      targetFolderId,
      userId: socket.userId
    })
    try {
      if (!checkFolderExistsForUser(targetFolderId, socket.userId)) {
        logger.warn(`Target folder not found when moving file`, {
          ip: socket.ip,
          userId: socket.userId,
          fileId,
          targetFolderId
        })
        cb('target folder not found')
        return
      }
      if (moveFileToFolder(fileId, targetFolderId).changes === 0) {
        logger.warn(`File not found when moving file`, {
          ip: socket.ip,
          userId: socket.userId,
          fileId,
          targetFolderId
        })
        cb('file not found')
        return
      }
      cb(null)
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId,
        fileId,
        targetFolderId
      })
      cb('unexpected error')
    }
  })
}

const getPublicFilesBinder = (socket) => {
  socket.on('get-public-files', (cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client requested to get public files`, {
      ip: socket.ip,
      userId: socket.userId
    })
    try {
      const files = getAllPublicFilesNotOwned(socket.userId)
      cb(JSON.stringify(files))
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb('unexpected error')
    }
  })
}

const updateFileBinder = (socket) => {
  socket.on('update-file-desc-perm', (fileId, description, permission, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client requested to update file description and permission`, {
      ip: socket.ip,
      userId: socket.userId,
      fileId
    })
    if (!getFileInfoOfOwnerId(fileId, socket.userId)) {
      logger.warn(`File not found when updating file description and permission`, {
        ip: socket.ip,
        userId: socket.userId,
        fileId
      })
      cb('file not found')
      return
    }
    permission = parseInt(permission)
    if (!(permission in [0, 1, 2])) {
      logger.warn(`Invalid permission when updating file description and permission`, {
        ip: socket.ip,
        userId: socket.userId,
        fileId,
        permission
      })
      cb('invalid permission')
      return
    }
    description = String(description)
    if (description.length > ConfigManager.databaseConfig.descMaxLength) {
      description = description.substring(0, ConfigManager.databaseConfig.descMaxLength)
    }
    try {
      updateFileDescPermInDatabase(fileId, description, permission)
      cb(null)
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb('unexpected error')
    }
  })
}

const allFileBinder = (socket) => {
  uploadFileBinder(socket)
  downloadFileBinder(socket)
  deleteFileBinder(socket)
  getFileListBinder(socket)
  // getRequestListBinder(socket)
  folderBinder(socket)
  // deleteRequestBinder(socket)
  moveFileBinder(socket)
  getPublicFilesBinder(socket)
  updateFileBinder(socket)
}

export { allFileBinder }
