import {
  logInvalidSchemaWarning,
  logSocketError,
  logSocketInfo,
  logSocketWarning
} from './Logger.js'
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
import { unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { insertUpload } from './LoginDatabase.js'
import {
  checkFolderExistsForUser,
  checkLoggedIn,
  FileNotFoundErrorMsg,
  getFilePath,
  InternalServerErrorMsg,
  InvalidArgumentErrorMsg,
  NotLoggedInErrorMsg
} from './Utils.js'
import ConfigManager from './ConfigManager.js'
import {
  DeleteFileRequestSchema,
  DeleteFolderRequestSchema,
  DownloadFileHashErrorRequestSchema,
  DownloadFileRequestSchema,
  GetFileListRequestSchema,
  MoveFileRequestSchema,
  UpdateFileRequestSchema,
  UploadFileRequestSchema
} from './Validation.js'

const uploadExpireTime = ConfigManager.settings.uploadExpireTimeMin * 60 * 1000

// Download file related events
const downloadFileBinder = (socket) => {
  socket.on('download-file-pre', (request, cb) => {
    const actionStr = 'Client asks to download file'
    logSocketInfo(socket, actionStr + '.', request)

    const result = DownloadFileRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
      cb({ errorMsg: InvalidArgumentErrorMsg })
      return
    }
    const { fileId } = result.data

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.', request)
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      const fileInfo = getFileInfo(fileId)
      if (!fileInfo) {
        logSocketWarning(socket, actionStr + ' which does not exist.', request)
        cb({ errorMsg: FileNotFoundErrorMsg })
        return
      }

      if (fileInfo.ownerId !== socket.userId) {
        logSocketWarning(socket, actionStr + ' which is not owned by the client.', request)
        cb({ errorMsg: 'File not owned.' })
        return
      }
      
      logSocketInfo(socket, 'Responding file info to client.', request)
      cb({ fileInfo })
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  socket.on('download-file-hash-error', (request) => {
    logSocketWarning(socket, 'Client reports download file hash error.', request)
  })
}

// Upload file related events
const uploadFileBinder = (socket) => {
  socket.on('upload-file-pre', (request, cb) => {
    const actionStr = 'Client asks to upload file'
    // cipher and spk do not need to be logged
    logSocketInfo(socket, actionStr + '.', { parentFolderId: request.parentFolderId })

    const result = UploadFileRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
      cb({ errorMsg: InvalidArgumentErrorMsg })
      return
    }
    const { cipher, spk, parentFolderId } = result.data

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.', request)
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      if (!checkFolderExistsForUser(parentFolderId, socket.userId)) {
        logSocketWarning(socket, actionStr + ' to a non-existing folder.', request)
        cb({ errorMsg: 'Parent folder not found.' })
        return
      }
      // Create random id as fileId
      const fileId = randomUUID()
      // Store with key and iv in database with expires time
      insertUpload(fileId, cipher, spk, parentFolderId, Date.now() + uploadExpireTime)
      logSocketInfo(socket, 'Pre-upload information stored in upload database.', {
        parentFolderId: request.parentFolderId,
        fileId
      })
      cb({ fileId })
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

// Delete file event
const deleteFileBinder = (socket) => {
  socket.on('delete-file', async (request, cb) => {
    const actionStr = 'Client asks to delete file'
    logSocketInfo(socket, actionStr + '.', request)

    const result = DeleteFileRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
      cb({ errorMsg: InvalidArgumentErrorMsg })
      return
    }
    const { fileId } = result.data

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.', request)
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      const fileInfo = getFileInfo(fileId)
      if (!fileInfo) {
        logSocketWarning(socket, actionStr + ' which does not exist.', request)
        cb({ errorMsg: FileNotFoundErrorMsg })
        return
      }

      if (fileInfo.ownerId !== socket.userId) {
        logSocketWarning(socket, actionStr + ' which is not owned by the client.', request)
        cb({ errorMsg: 'File not owned.' })
        return
      }
      try {
        deleteFile(fileId)
        await unlink(getFilePath(socket.userId, fileId))
        logSocketInfo(socket, 'File deleted.', request)
        cb({})
      } catch (error1) {
        if (error1.code != 'ENOENT') throw error1
      }
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

// Get file list event
const getFileListBinder = (socket) => {
  socket.on('get-file-list', (request, cb) => {
    const actionStr = 'Client asks to get file list'
    logSocketInfo(socket, actionStr + '.', request)

    const result = GetFileListRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
      cb({ errorMsg: InvalidArgumentErrorMsg })
      return
    }
    const { parentFolderId } = result.data

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.', request)
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      const files = getAllFilesByParentFolderIdUserId(parentFolderId, socket.userId)
      const folders = getAllFoldersByParentFolderIdUserId(parentFolderId, socket.userId)
      logSocketInfo(socket, 'Responding file list to client.', request)
      // console.log({ files, folders })
      cb({ fileList: { files: JSON.stringify(files), folders: JSON.stringify(folders) } })
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

// Folder related events
const folderBinder = (socket) => {
  // Add folder
  socket.on('add-folder', (request, cb) => {
    const actionStr = 'Client asks to add folder'
    logSocketInfo(socket, actionStr + '.', request)

    const result = DeleteFileRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
      cb({ errorMsg: InvalidArgumentErrorMsg })
      return
    }
    const { parentFolderId, folderName } = result.data

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.', request)
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      addFolderToDatabase(folderName, parentFolderId, socket.userId)
      logSocketInfo(socket, 'Folder added to database.', request)
      cb({})
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  // Delete folder
  socket.on('delete-folder', (request, cb) => {
    const actionStr = 'Client asks to delete folder'
    logSocketInfo(socket, actionStr + '.', request)

    const result = DeleteFolderRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
      cb({ errorMsg: InvalidArgumentErrorMsg })
      return
    }
    const { folderId } = result.data

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.', request)
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      const files = getAllFilesByParentFolderIdUserId(folderId, socket.userId)
      const folders = getAllFoldersByParentFolderIdUserId(folderId, socket.userId)
      if (files.length > 0 || folders.length > 0) {
        logSocketWarning(socket, actionStr + ' which is not empty.', request)
        cb({ errorMsg: 'Folder not empty.' })
        return
      }
      if (deleteFolder(folderId).changes <= 0) {
        logSocketWarning(socket, actionStr + ' which does not exist.', request)
        cb({ errorMsg: 'Folder not found.' })
        return
      }
      logSocketInfo(socket, 'Folder deleted.', request)
      cb({})
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  // Get all folder
  socket.on('get-all-folders', (cb) => {
    const actionStr = 'Client asks to get all folders'
    logSocketInfo(socket, actionStr + '.')

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.')
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      const folders = getAllFoldersByUserId(socket.userId)
      logSocketInfo(socket, 'Responding all folders to client.')
      cb({ folders: JSON.stringify(folders) })
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

const moveFileBinder = (socket) => {
  socket.on('move-file', (request, cb) => {
    const actionStr = 'Client asks to move file to target folder'
    logSocketInfo(socket, actionStr + '.', request)

    const result = MoveFileRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
      cb({ errorMsg: InvalidArgumentErrorMsg })
      return
    }
    const { fileId, targetFolderId } = result.data

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.', request)
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      if (!checkFolderExistsForUser(targetFolderId, socket.userId)) {
        logSocketWarning(socket, actionStr + ' but target folder does not exist.', request)
        cb({ errorMsg: 'Target folder not found.' })
        return
      }
      if (moveFileToFolder(fileId, targetFolderId).changes === 0) {
        logSocketWarning(socket, actionStr + ' but file does not exist.', request)
        cb({ errorMsg: FileNotFoundErrorMsg })
        return
      }
      logSocketInfo(socket, 'File moved to target folder.', request)
      cb({})
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

const getPublicFilesBinder = (socket) => {
  socket.on('get-public-files', (cb) => {
    const actionStr = 'Client asks to get public files'
    logSocketInfo(socket, actionStr + '.')

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.')
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      const files = getAllPublicFilesNotOwned(socket.userId)
      logSocketInfo(socket, 'Responding public files to client.')
      cb({ files: JSON.stringify(files) })
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

const updateFileBinder = (socket) => {
  socket.on('update-file-desc-perm', (request, cb) => {
    const actionStr = 'Client asks to update description and permission for file'
    logSocketInfo(socket, actionStr + '.', request)

    const result = UpdateFileRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
      cb({ errorMsg: InvalidArgumentErrorMsg })
      return
    }
    const { fileId, description, permission } = result.data

    if (!checkLoggedIn(socket)) {
      logSocketWarning(socket, actionStr + ' but is not logged in.', request)
      cb({ errorMsg: NotLoggedInErrorMsg })
      return
    }

    try {
      if (!getFileInfoOfOwnerId(fileId, socket.userId)) {
        logSocketWarning(socket, actionStr + ' but file does not exist.', request)
        cb({ errorMsg: FileNotFoundErrorMsg })
        return
      }

      let desc = description
      if (description.length > ConfigManager.databaseLengthLimit) {
        desc = description.substring(0, ConfigManager.databaseLengthLimit)
      }
      updateFileDescPermInDatabase(fileId, desc, permission)
      logSocketInfo(socket, 'Description and permission updated for file.', request)
      cb({})
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

const allFileBinder = (socket) => {
  uploadFileBinder(socket)
  downloadFileBinder(socket)
  deleteFileBinder(socket)
  getFileListBinder(socket)
  folderBinder(socket)
  moveFileBinder(socket)
  getPublicFilesBinder(socket)
  updateFileBinder(socket)
}

export { allFileBinder }
