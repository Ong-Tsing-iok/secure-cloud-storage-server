import { checkLoggedIn } from './Utils.js'
import {
  getFileInfo,
  addFileToDatabase,
  addUniqueRequest,
  getAllRequestsResponsesByRequester,
  getAllRequestsResponsesFilesByOwner,
  deleteRequestOfRequester,
  getRequestNotRespondedByIdOfFileOwner,
  addResponse
} from './StorageDatabase.js'
import { getSocketId } from './LoginDatabase.js'
import CryptoHandler from './CryptoHandler.js'
import { randomUUID } from 'crypto'
import { copyFile } from 'fs/promises'
import { __upload_dir_path } from './Constants.js'
import { join } from 'path'
import { logger } from './Logger.js'
import ConfigManager from './ConfigManager.js'
import { emitToSocket } from './SocketIO.js'

const requestBinder = (socket) => {
  //! ask for request
  socket.on('request-file', ({ fileId, description }, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
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
      cb('unexpected error')
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
      cb('unexpected error')
    }
  })
  //! request respond
  socket.on('respond-request', async ({ requestId, agreed, description, rekey }, cb) => {
    if (!checkLoggedIn(socket)) {
      cb('not logged in')
      return
    }
    logger.info(`Client respond to request`, {
      ip: socket.ip,
      userId: socket.userId,
      requestId,
      agreed
    })
    try {
      const requestObj = getRequestNotRespondedByIdOfFileOwner(requestId, socket.userId)
      if (requestObj === undefined) {
        cb('request not exist or already responded')
        return
      }
      // console.log(requestId, agreed, description)
      addResponse(requestId, agreed ? 1 : 0, description)
      cb(null) // TODO: maybe move after copy file?
      if (agreed) {
        const fileInfo = getFileInfo(requestObj.fileId)
        const newKeyCipher = await CryptoHandler.reencrypt(rekey, fileInfo.keyCipher)
        const newIvCipher = await CryptoHandler.reencrypt(rekey, fileInfo.ivCipher)
        const newUUID = randomUUID()
        addFileToDatabase(
          fileInfo.name,
          newUUID,
          requestObj.requester,
          fileInfo.ownerId,
          newKeyCipher,
          newIvCipher,
          null, // null for root
          fileInfo.size,
          fileInfo.description
        )
        await copyFile(
          join(ConfigManager.uploadDir, fileInfo.ownerId, fileInfo.id),
          join(ConfigManager.uploadDir, requestObj.requester, newUUID)
        )
        logger.info('File re-encrypted', {
          owner: fileInfo.ownerId,
          requester: requestObj.requester,
          originId: fileInfo.id,
          newId: newUUID
        })
      }
      const requesterSocketIdObj = getSocketId(requestObj.requester)
      console.log(requesterSocketIdObj)
      if (requesterSocketIdObj) {
        emitToSocket(requesterSocketIdObj.socketId, 'new-response')
      }
    } catch (error) {
      logger.error(error, {
        ip: socket.ip,
        userId: socket.userId,
        requestId
      })
      cb('unexpected error')
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
      cb(null, 'unexpected error')
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
      cb(null, 'unexpected error')
    }
  })
}

export { requestBinder }
