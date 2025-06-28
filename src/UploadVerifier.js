import { bigIntToUuid } from './BlockchainManager.js'
import EvictingMap from './EvictingMap.js'
import { logger } from './Logger.js'
import { getSocketId } from './LoginDatabase.js'
import { blockchainManager, emitToSocket } from './SocketIO.js'
import { addFileToDatabase } from './StorageDatabase.js'
import { calculateFileHash, getFilePath, revertUpload } from './Utils.js'

const uploadInfoMap = new EvictingMap(5 * 60 * 1000)

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
    const hash = await calculateFileHash(getFilePath(uploadInfo.userId, uploadInfo.id))
    uploadInfoMap.set(uploadInfo.id, { uploadInfo, hash })
    logger.info(`upload info map set.`, { fileId: uploadInfo.id, hash })
  } catch (error) {
    logger.error(error)
    uploadInfoMap.set(uploadInfo.id, { uploadInfo, hash: null })
  }
}

uploadInfoMap.onExpired((key, value) => {
  revertUpload(value.uploadInfo.userId, key, 'Did not get blockchain info in time.')
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
        userId = value.uploadInfo.userId
        uploadInfoMap.delete(fileId)
        const socketId = getSocketId(userId)?.socketId
        if (BigInt(value.hash) == BigInt(fileHash)) {
          addFileToDatabase(value.uploadInfo)
          await blockchainManager.setFileVerification(fileId, uploader, 'success')
          if (socketId) emitToSocket(socketId, 'upload-file-res', { fileId })
          logger.info('File uploaded and verified.', { fileId: value.uploadInfo.id })
        } else {
          logger.warn('File hashes do not meet', {
            fileHash: value.hash,
            blockchainHash: fileHash,
            fileId
          })
          await blockchainManager.setFileVerification(fileId, uploader, 'fail')
          revertUpload(userId, fileId, 'File hashes do not meet.')
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
