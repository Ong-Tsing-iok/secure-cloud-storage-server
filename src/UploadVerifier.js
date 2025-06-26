import { bigIntToUuid } from './BlockchainManager.js'
import EvictingMap from './EvictingMap.js'
import { logger } from './Logger.js'
import { getSocketId } from './LoginDatabase.js'
import { blockchainManager, emitToSocket } from './SocketIO.js'
import { calculateFileHash, getFilePath, revertUpload } from './Utils.js'

const uploadInfoMap = new EvictingMap(5 * 60 * 1000)

export const finishUpload = async (userId, fileId) => {
  try {
    const hash = await calculateFileHash(getFilePath(userId, fileId))
    uploadInfoMap.set(fileId, { userId, hash })
    logger.debug(`upload info map set for fileId ${fileId}`, { userId, hash })
  } catch (error) {
    logger.error(error)
    uploadInfoMap.set(fileId, { userId, hash: null })
  }
}

uploadInfoMap.onExpired((key, value) => {
  revertUpload(value.userId, key, 'Did not get blockchain info in time.')
})

blockchainManager.bindEventListener(
  'FileUploaded',
  async (fileId, uploader, fileHash, metadata, timestamp) => {
    fileId = bigIntToUuid(fileId)
    logger.debug('Contract event FileUploaded emitted', {
      fileId,
      uploader,
      fileHash,
      metadata,
      timestamp
    })
    // TODO: maybe need to check uploader
    let userId
    try {
      if (uploadInfoMap.has(fileId)) {
        // compare hash. If same, send success message to client. If not, remove file and send fail message to client.
        const value = uploadInfoMap.get(fileId)
        userId = value.userId
        uploadInfoMap.delete(fileId)
        const socketId = getSocketId(value.userId)?.socketId
        if (BigInt(value.hash) == BigInt(fileHash)) {
          await blockchainManager.setFileVerification(fileId, uploader, 'success')
          if (socketId) emitToSocket(socketId, 'upload-file-res', { fileId })
        } else {
          logger.warn('File hashes do not meet', {
            fileHash: value.hash,
            blockchainHash: fileHash,
            fileId
          })
          await blockchainManager.setFileVerification(fileId, uploader, 'fail')
          revertUpload(value.userId, fileId, 'File hashes do not meet.')
        }
      } else {
        logger.warn(`Blockchain upload event did not find matching upload info.`, { fileId })
      }
    } catch (error) {
      logger.error(error)
      revertUpload(userId, fileId, 'Internal server error.')
    }
  }
)
