import { checkLoggedIn } from './Utils.js'
import {
  getFileInfo,
  addFileToDatabase,
  addUniqueRequest,
  getAllRequestsResponsesByRequester,
  getAllRequestsResponsesFilesByOwner,
  deleteRequestOfRequester,
  getRequestNotRespondedByIdOfFileOwner,
  addResponse,
  getUserById
} from './StorageDatabase.js'
import { getSocketId } from './LoginDatabase.js'
import CryptoHandler from './CryptoHandler.js'
import { randomUUID } from 'crypto'
import { copyFile } from 'fs/promises'
import { join } from 'path'
import { logger } from './Logger.js'
import ConfigManager from './ConfigManager.js'
import { emitToSocket } from './SocketIO.js'

const requestBinder = (socket) => {
  //! ask for request
  socket.on('request-file', (requestInfo, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    if (!requestInfo) {
      cb('request not valid')
      return
    }
    const { fileId, description } = requestInfo
    logger.info('Client asked for request', {
      ip: socket.ip,
      userId: socket.userId,
      fileId
    })
    try {
      const fileInfo = getFileInfo(fileId)
      if (!fileInfo) {
        logger.warn('File not found when requesting file', {
          ip: socket.ip,
          userId: socket.userId,
          fileId
        })
        cb('file not found')
        return
      }
      if (fileInfo.ownerId === socket.userId) {
        cb('file is owned by you')
        return
      }
      if (fileInfo.permissions === 0) {
        cb('file not found')
        return
      }
      if (addUniqueRequest(fileId, socket.userId, description)) {
        cb(null)
      } else {
        cb('request already exist')
      }
      const ownerSocketIdObj = getSocketId(fileInfo.ownerId)
      if (ownerSocketIdObj) {
        emitToSocket(ownerSocketIdObj.socketId, 'new-request')
      }
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId,
        fileId
      })
      cb('Internal server error')
    }
  })
  //! delete request
  socket.on('delete-request', (requestId, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client requested to delete request`, {
      ip: socket.ip,
      userId: socket.userId,
      requestId
    })
    try {
      if (deleteRequestOfRequester(requestId, socket.userId).changes > 0) {
        logger.info(`Client request deleted`, {
          ip: socket.ip,
          userId: socket.userId,
          requestId
        })
        cb(null)
      } else {
        cb('request not exist')
      }
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId,
        requestId
      })
      cb('Internal server error')
    }
  })
  //! request respond
  socket.on('respond-request', async (requestObj, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    if (!requestObj) {
      cb('request not exist')
      return
    }
    const { requestId, agreed, description, rekey } = requestObj
    logger.info(`Client respond to request`, {
      ip: socket.ip,
      userId: socket.userId,
      requestId,
      agreed
    })
    try {
      const requestInfo = getRequestNotRespondedByIdOfFileOwner(requestId, socket.userId)
      if (requestInfo === undefined) {
        cb('request not exist or already responded')
        return
      }
      addResponse(requestId, agreed ? 1 : 0, description)
      if (agreed) {
        const fileInfo = getFileInfo(requestInfo.fileId)
        const userInfo = getUserById(requestInfo.requester)
        const { recipher: newcipher, spk: newspk } = await CryptoHandler.reencrypt(
          rekey,
          fileInfo.cipher,
          fileInfo.spk,
          userInfo.pk
        )
        const newUUID = randomUUID()
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
        await copyFile(
          join(ConfigManager.uploadDir, fileInfo.ownerId, fileInfo.id),
          join(ConfigManager.uploadDir, requestInfo.requester, newUUID)
        )
        logger.info('File re-encrypted', {
          owner: fileInfo.ownerId,
          requester: requestInfo.requester,
          originId: fileInfo.id,
          newId: newUUID
        })
      }
      const requesterSocketIdObj = getSocketId(requestInfo.requester)
      // console.log(requesterSocketIdObj)
      if (requesterSocketIdObj) {
        emitToSocket(requesterSocketIdObj.socketId, 'new-response')
      }
      cb(null)
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId,
        requestId
      })
      cb('Internal server error')
    }
  })
  //! get request list
  socket.on('get-request-list', (cb) => {
    if (!checkLoggedIn(socket)) {
      cb(null, 'not logged in')
      return
    }
    logger.info(`Client requested to get request list`, {
      ip: socket.ip,
      userId: socket.userId
    })
    try {
      const requests = getAllRequestsResponsesByRequester(socket.userId)
      // console.log({ files, folders })
      cb(JSON.stringify(requests))
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb(null, 'Internal server error')
    }
  })
  //! get requested list
  socket.on('get-requested-list', (cb) => {
    if (!checkLoggedIn(socket)) {
      cb(null, 'not logged in')
      return
    }
    logger.info(`Client requested to get requested list`, {
      ip: socket.ip,
      userId: socket.userId
    })
    try {
      const requests = getAllRequestsResponsesFilesByOwner(socket.userId)
      requests.forEach((request) => {
        if (request.agreed != null) {
          delete request.pk
        }
      })
      // console.log({ files, folders })
      cb(JSON.stringify(requests))
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId
      })
      cb(null, 'Internal server error')
    }
  })
}

export { requestBinder }
