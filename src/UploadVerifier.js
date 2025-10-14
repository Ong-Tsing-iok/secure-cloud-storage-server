import { randomUUID } from 'node:crypto'
import { bigIntToUuid, BigIntToHex } from './Utils.js'
import EvictingMap from './EvictingMap.js'
import { logger } from './Logger.js'
import { getSocketId } from './LoginDatabase.js'
import { emitToSocket } from './SocketIO.js'
import { addFileToDatabase, deleteFileOfOwnerId } from './StorageDatabase.js'
import { calculateFileHash, getFilePath, InternalServerErrorMsg } from './Utils.js'
import BlockchainManager from './BlockchainManager.js'
import { unlink } from 'node:fs/promises'
import ConfigManager from './ConfigManager.js'

const uploadInfoMap = new EvictingMap(5 * 60 * 1000)

export const preUpload = (cipher, spk, parentFolderId) => {
  let fileId = randomUUID()
  while (uploadInfoMap.has(fileId)) {
    fileId = randomUUID()
  }
  uploadInfoMap.set(fileId, { id: fileId, cipher, spk, parentFolderId })
  return fileId
}

/**
 *
 * @param {{
 * name,
 * id,
 * userId,
 * originOwnerId,
 * cipher,
 * spk,
 * parentFolderId,
 * size
 * }} uploadInfo
 */
export const finishUpload = async (uploadInfo) => {
  try {
    if (!ConfigManager.blockchain.enabled) {
      // Ignore blockchain and directly accept upload
      const userId = uploadInfo.userId
      const fileId = uploadInfo.id
      uploadInfo = {...uploadInfo, ...uploadInfoMap.get(uploadInfo.id)}
      uploadInfoMap.delete(fileId)
      const socketId = getSocketId(userId)?.socketId
      await addFileToDatabase(uploadInfo)
      if (socketId) emitToSocket(socketId, 'upload-file-res', { fileId })
      logger.info('File uploaded.', { fileId, userId })
      return
    }
    
    const hash = await calculateFileHash(getFilePath(uploadInfo.userId, uploadInfo.id))
    uploadInfoMap.set(uploadInfo.id, {
      uploadInfo: { ...uploadInfo, ...uploadInfoMap.get(uploadInfo.id) },
      hash
    })
    logger.info(`upload info map set.`, { fileId: uploadInfo.id, hash })
  } catch (error) {
    logger.error(error)
    uploadInfoMap.set(uploadInfo.id, { uploadInfo, hash: null })
  }
}

export const hasUpload = (fileId) => {
  return uploadInfoMap.has(fileId)
}

uploadInfoMap.onExpired((key, value) => {
  revertUpload(value.uploadInfo.userId, key, 'Did not get blockchain info in time.')
})

BlockchainManager.bindEventListener(
  'FileUploaded',
  async (fileId, uploader, fileHash, metadata, timestamp) => {
    try {
      fileId = bigIntToUuid(fileId)
      logger.debug('Contract event FileUploaded emitted', {
        fileId,
        uploader,
        fileHash,
        metadata,
        timestamp
      })
      // TODO: maybe need to check uploader
      if (uploadInfoMap.has(fileId)) {
        let userId
        let uploadInfoDeleted = false
        try {
          // compare hash. If same, send success message to client. If not, remove file and send fail message to client.
          const value = uploadInfoMap.get(fileId)
          userId = value.uploadInfo.userId
          uploadInfoMap.delete(fileId)
          uploadInfoDeleted = true
          if (BigInt(value.hash) == BigInt(fileHash)) {
            const socketId = getSocketId(userId)?.socketId
            await addFileToDatabase(value.uploadInfo)
            await BlockchainManager.setFileVerification(fileId, uploader, 'success')
            if (socketId) emitToSocket(socketId, 'upload-file-res', { fileId })
            logger.info('File uploaded and verified.', { fileId, userId })
          } else {
            logger.warn('File hashes do not meet', {
              fileHash: value.hash,
              blockchainHash: BigIntToHex(fileHash, 64), // sha256 have length 64
              fileId,
              userId
            })
            await BlockchainManager.setFileVerification(fileId, uploader, 'fail')
            revertUpload(userId, fileId, 'File hashes do not meet.')
          }
        } catch (error1) {
          if (uploadInfoDeleted) revertUpload(userId, fileId, InternalServerErrorMsg)
          throw error1
        }
      } else {
        logger.warn(`Blockchain upload event did not find matching upload info.`, {
          fileId
        })
      }
    } catch (error) {
      logger.error(error, { fileId, uploader: BigIntToHex(uploader, 40) }) // ethernet address have length 40
    }
  }
)

const revertUpload = async (userId, fileId, errorMsg) => {
  try {
    logger.info(`reverting upload.`, { userId, fileId, errorMsg })
    // remove file from database
    await deleteFileOfOwnerId(fileId, userId)
    // remove file from disc
    const filePath = getFilePath(userId, fileId)
    await unlink(filePath)
    // send message to client if online
    const socketId = getSocketId(userId)?.socketId
    if (socketId) emitToSocket(socketId, 'upload-file-res', { fileId, errorMsg })
  } catch (error) {
    if (error.code != 'ENOENT') {
      logger.error(error)
    }
  }
}
