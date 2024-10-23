import { checkLoggedIn } from './Utils.js'
import {
  runRespondToRequest,
  getRequesterPkFileId,
  getRequestById,
  getFileInfo,
  addFileToDatabase
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
        io.to(requesterSocketId.socketId).to(requesterSocketId.socketId).emit('message', `request ${uuid} is agreed.`)
      }
    })
    // * could be dead thread if wait for response?
  })
  // TODO: handle receive re-key
  // TODO: use re-key to re-encrypt file, and add into requester's database and file system

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
      io.to(requesterSocketId.socketId).to(requesterSocketId.socketId).emit('message', `request ${uuid} is rejected.`)
    }
  })
}

export { requestBinder }
