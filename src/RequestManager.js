import {
  calculateFileHash,
  checkLoggedIn,
  FileNotFoundErrorMsg,
  InternalServerErrorMsg,
  InvalidArgumentErrorMsg,
  NotLoggedInErrorMsg
} from './Utils.js'
import {
  getFileInfo,
  addFileToDatabase,
  addUniqueRequest,
  getAllRequestsResponsesByRequester,
  getAllRequestsResponsesFilesByOwner,
  deleteRequestOfRequester,
  getRequestNotRespondedByIdOfFileOwner,
  addResponse,
  getUserById,
  deleteFile,
  deleteResponseById
} from './StorageDatabase.js'
import { getSocketId } from './LoginDatabase.js'
import CryptoHandler from './CryptoHandler.js'
import { randomUUID } from 'crypto'
import { copyFile, unlink } from 'fs/promises'
import { join } from 'path'
import {
  logInvalidSchemaWarning,
  logSocketError,
  logSocketInfo,
  logSocketWarning
} from './Logger.js'
import ConfigManager from './ConfigManager.js'
import { blockchainManager, emitToSocket } from './SocketIO.js'
import {
  DeleteRequestRequestSchema,
  ReqeustFileRequestSchema,
  RespondRequestRequestSchema
} from './Validation.js'

// Reqeust related events
const requestBinder = (socket) => {
  //! Ask for request
  socket.on('request-file', async (request, cb) => {
    let requestId
    try {
      const actionStr = 'Client asks to request file'
      logSocketInfo(socket, actionStr + '.', request)

      const result = ReqeustFileRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }
      const { fileId, description } = result.data

      if (!checkLoggedIn(socket)) {
        logSocketWarning(socket, actionStr + ' but is not logged in.', request)
        cb({ errorMsg: NotLoggedInErrorMsg })
        return
      }

      const fileInfo = getFileInfo(fileId)
      if (!fileInfo) {
        logSocketWarning(socket, actionStr + ' which does not exist.', request)
        cb({ errorMsg: FileNotFoundErrorMsg })
        return
      }
      if (fileInfo.ownerId === socket.userId) {
        logSocketWarning(socket, actionStr + ' which is owned by the client.', request)
        cb({ errorMsg: 'File is owned.' })
        return
      }
      if (fileInfo.permissions === 0) {
        logSocketWarning(socket, actionStr + ' which is not public.', request)
        cb({ errorMsg: FileNotFoundErrorMsg })
        return
      }
      requestId = addUniqueRequest(fileId, socket.userId, description)
      if (!requestId) {
        logSocketWarning(socket, actionStr + ' which is already requested.', request)
        cb({ errorMsg: 'File already requested.' })
        return
      }
      // Add record to blockchain
      const requestorInfo = getUserById(socket.userId)
      const authorizerInfo = getUserById(fileInfo.ownerId)
      await blockchainManager.addAuthRecord(
        fileId,
        requestorInfo.address,
        authorizerInfo.address,
        'not-replied'
      )
      logSocketInfo(socket, 'Request added to database.', request)
      cb({})

      // Forward request to file owner
      const ownerSocketIdObj = getSocketId(fileInfo.ownerId)
      if (ownerSocketIdObj) {
        emitToSocket(ownerSocketIdObj.socketId, 'new-request')
      }
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
      // Revert request
      if (requestId) deleteRequestOfRequester(requestId, socket.userId)
    }
  })

  //! Delete request
  socket.on('delete-request', (request, cb) => {
    try {
      const actionStr = 'Client asks to delete request'
      logSocketInfo(socket, actionStr + '.', request)

      const result = DeleteRequestRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }
      const { requestId } = result.data

      if (!checkLoggedIn(socket)) {
        logSocketWarning(socket, actionStr + ' but is not logged in.', request)
        cb({ errorMsg: NotLoggedInErrorMsg })
        return
      }

      if (deleteRequestOfRequester(requestId, socket.userId).changes <= 0) {
        logSocketWarning(socket, actionStr + ' which does not exist.', request)
        cb({ errorMsg: 'Request not found.' })
        return
      }
      logSocketInfo(socket, 'Request deleted.', request)
      cb({})
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  //! Respond request
  socket.on('respond-request', async (request, cb) => {
    let responseId
    try {
      const actionStr = 'Client asks to respond to request'
      logSocketInfo(socket, actionStr + '.', request)

      const result = RespondRequestRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }

      const { requestId, agreed, description, rekey } = request

      if (!checkLoggedIn(socket)) {
        logSocketWarning(socket, actionStr + ' but is not logged in.', request)
        cb({ errorMsg: NotLoggedInErrorMsg })
        return
      }

      const requestInfo = getRequestNotRespondedByIdOfFileOwner(requestId, socket.userId)
      if (requestInfo === undefined) {
        logSocketWarning(socket, actionStr + ' which does not exist or already responded.', request)
        cb({ errorMsg: 'Request not exist or already responded.' })
        return
      }
      ;({ responseId } = addResponse(requestId, agreed ? 1 : 0, description))

      const authorizerInfo = getUserById(socket.userId)
      const requestorInfo = getUserById(requestInfo.requester)
      const fileInfo = getFileInfo(requestInfo.fileId)
      if (agreed) {
        const newFileId = await reencryptFile(
          rekey,
          fileInfo,
          requestInfo,
          authorizerInfo,
          requestorInfo
        )
        logSocketInfo(socket, 'File reencrypted.', { newFileId })
      } else {
        await blockchainManager.addAuthRecord(
          fileInfo.id,
          requestorInfo.address,
          authorizerInfo.address,
          'rejected'
        )
      }
      logSocketInfo(socket, 'Request responded.', request)
      cb({})
      // Forward response to requesting client
      const requesterSocketIdObj = getSocketId(requestInfo.requester)
      if (requesterSocketIdObj) {
        emitToSocket(requesterSocketIdObj.socketId, 'new-response')
      }
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
      // Revert response
      if (responseId) deleteResponseById(responseId)
    }
  })

  //! Get request list
  socket.on('get-request-list', (cb) => {
    try {
      const actionStr = 'Client asks to get request list requested by this client'
      logSocketInfo(socket, actionStr + '.')

      if (!checkLoggedIn(socket)) {
        logSocketWarning(socket, actionStr + ' but is not logged in.')
        cb({ errorMsg: NotLoggedInErrorMsg })
        return
      }

      const requests = getAllRequestsResponsesByRequester(socket.userId)
      // console.log({ files, folders })
      logSocketInfo(socket, 'Responding request list to client.')
      cb({ requests: JSON.stringify(requests) })
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  //! Get requested list
  socket.on('get-requested-list', (cb) => {
    try {
      const actionStr = 'Client asks to get request list requested by other clients'
      logSocketInfo(socket, actionStr + '.')

      if (!checkLoggedIn(socket)) {
        logSocketWarning(socket, actionStr + ' but is not logged in.')
        cb({ errorMsg: NotLoggedInErrorMsg })
        return
      }

      const requests = getAllRequestsResponsesFilesByOwner(socket.userId)
      requests.forEach((request) => {
        if (request.agreed != null) {
          delete request.pk
        }
      })
      // console.log({ files, folders })
      logSocketInfo(socket, 'Responding requested list to client.')
      cb({ requests: JSON.stringify(requests) })
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

// Reencrypt file sub-process
const reencryptFile = async (rekey, fileInfo, requestInfo, authorizerInfo, requestorInfo) => {
  // Reencrypt file
  let newUUID
  let hasAddToDatabase = false
  let copiedFilePath
  let hasCopiedFile = false
  try {
    const { recipher: newcipher, spk: newspk } = await CryptoHandler.reencrypt(
      rekey,
      fileInfo.cipher,
      fileInfo.spk,
      requestorInfo.pk
    )
    newUUID = randomUUID()
    addFileToDatabase({
      name: fileInfo.name,
      id: newUUID,
      userId: requestInfo.requester,
      originOwnerId: fileInfo.ownerId,
      cipher: newcipher,
      spk: newspk,
      parentFolderId: null, // null for root
      size: fileInfo.size,
      description: fileInfo.description
    })
    hasAddToDatabase = true
    copiedFilePath = join(ConfigManager.uploadDir, requestInfo.requester, newUUID)
    await copyFile(join(ConfigManager.uploadDir, fileInfo.ownerId, fileInfo.id), copiedFilePath)
    hasCopiedFile = true

    const fileHash = await calculateFileHash(copiedFilePath)
    await blockchainManager.reencryptFile(
      newUUID,
      fileHash,
      JSON.stringify({ filename: fileInfo.name }),
      requestorInfo.address,
      authorizerInfo.address
    )
    return newUUID
  } catch (error) {
    // Revert reencrypt
    if (hasAddToDatabase && newUUID) deleteFile(newUUID)
    if (hasCopiedFile && copiedFilePath) await unlink(copiedFilePath)
    throw error
  }
}

export { requestBinder }
