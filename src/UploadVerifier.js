import EvictingMap from './EvictingMap.js'
import { logger } from './Logger.js'
import { getSocketId } from './LoginDatabase.js'
import { blockchainManager, emitToSocket } from './SocketIO.js'
import { calculateFileHash, getFilePath, revertUpload } from './Utils.js'

const uploadInfoMap = new EvictingMap(5 * 60 * 1000)

export const finishUpload = async (userId, fileId) => {
  const hash = await calculateFileHash(getFilePath(userId, fileId))
  uploadInfoMap.set(fileId, { userId, hash })
}

uploadInfoMap.onExpired((key, value) => {
  revertUpload(value.userId, key, 'Did not get blockchain info in time.')
})

blockchainManager.bindEventListener(
  'FileUploaded',
  (fileId, fileHash, metadata, uploader, timestamp) => {
    logger.debug('Contract event FileUploaded emitted', {
      fileId,
      fileHash,
      metadata,
      uploader,
      timestamp
    })
    // TODO: maybe need to check uploader
    try {
      if (uploadInfoMap.has(fileId)) {
        // compare hash. If same, send success message to client. If not, remove file and send fail message to client.
        const value = uploadInfoMap.get(fileId)
        uploadInfoMap.delete(fileId)
        const socketId = getSocketId(value.userId)?.socketId
        if (value.hash == fileHash) {
          if (socketId) emitToSocket(socketId, 'upload-file-res', { fileId })
        } else {
          logger.warning('File hashes do not meet', {
            fileHash: value.hash,
            blockchainHash: fileHash,
            fileId
          })
          revertUpload(value.userId, fileId, 'File hashes do not meet.')
        }
      }
    } catch (error) {
      logger.error(error)
    }
  }
)
