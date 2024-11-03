import { checkLoggedIn } from './Utils.js'
import {
  runRespondToRequest,
  getRequesterPkFileId,
  getRequestById,
  getFileInfo,
  addFileToDatabase,
  addUniqueRequest,
  getAllRequestsResponsesByRequester,
  getAllRequestsResponsesFilesByOwner,
  deleteRequestOfRequester
} from './StorageDatabase.js'
import { getSocketId } from './LoginDatabase.js'
import CryptoHandler from './CryptoHandler.js'
import { randomUUID } from 'crypto'
import { copyFile } from 'fs/promises'
import { __upload_dir_path } from './Constants.js'
import { join } from 'path'
import { logger } from './Logger.js'

const requestNotExistOrResponded = (socket, uuid) => {
  const info = getRequestById(uuid)
  if (info === undefined || info.agreed != null) {
    socket.emit('message', 'request not exist or already responded')
    return true
  }
  return false
}
// TODO: handle situation where client drop before giving rekey
const requestBinder = (socket, io) => {
  //! ask for request
  socket.on('request-file', ({ fileId, name, email, description }, cb) => {
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
      // if (fileInfo.permissions === 0) {
      //   cb('file not found')
      //   return
      // }
      // if (fileInfo.ownerId === socket.userId) {
      //   cb('file is owned by you')
      //   return
      // }
      if (addUniqueRequest(fileId, socket.userId, name, email, description)) {
        cb(null)
      } else {
        cb('request already exist')
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
  //! request agree
  socket.on('request-agree', (uuid) => {
    if (!checkLoggedIn(socket)) return
    if (requestNotExistOrResponded(socket, uuid)) return
    logger.info('Client agreed to request', {
      ip: socket.ip,
      userId: socket.userId,
      requestId: uuid
    })
    runRespondToRequest(true, uuid)
    const pkObj = getRequesterPkFileId(uuid)
    socket.emit('rekey-ask', pkObj.pk, async (rekey) => {
      const fileInfo = getFileInfo(pkObj.fileId)
      const newKeyCipher = await CryptoHandler.reencrypt(rekey, fileInfo.keyCipher)
      const newIvCipher = await CryptoHandler.reencrypt(rekey, fileInfo.ivCipher)
      const newUUID = randomUUID()
      addFileToDatabase(
        fileInfo.name,
        newUUID,
        pkObj.requester,
        fileInfo.ownerId,
        newKeyCipher,
        newIvCipher,
        null, // null for root
        fileInfo.size,
        fileInfo.description
      )
      await copyFile(
        join(__upload_dir_path, fileInfo.ownerId, fileInfo.id),
        join(__upload_dir_path, pkObj.requester, newUUID)
      )
      logger.info('File reencrypted', {
        owner: fileInfo.ownerId,
        requester: pkObj.requester,
        originId: fileInfo.id,
        newId: newUUID
      })
      // If requester is online, notify requester
      const requesterSocketId = getSocketId(pkObj.requester)
      if (requesterSocketId) {
        io.to(requesterSocketId.socketId)
          .to(requesterSocketId.socketId)
          .emit('message', `request ${uuid} is agreed.`)
      }
    })
    // * could be dead thread if wait for response?
  })
  // TODO: handle receive re-key
  // TODO: use re-key to re-encrypt file, and add into requester's database and file system
  //! request reject
  socket.on('request-reject', (uuid) => {
    if (!checkLoggedIn(socket)) return
    if (requestNotExistOrResponded(socket, uuid)) return
    logger.info('Client rejected request', {
      ip: socket.ip,
      userId: socket.userId,
      requestId: uuid
    })
    runRespondToRequest(false, uuid)
    const info = getRequestById(uuid)
    const requesterSocketId = getSocketId(info.requester)
    // console.log('requesterSocketId', requesterSocketId)
    if (requesterSocketId) {
      io.to(requesterSocketId.socketId)
        .to(requesterSocketId.socketId)
        .emit('message', `request ${uuid} is rejected.`)
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
