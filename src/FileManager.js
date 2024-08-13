import { logger } from './Logger.js'
import {
  getFileInfo,
  deleteFile,
  getAllFilesByUserId,
  addUniqueRequest,
  getAllRequestFilesByRequester,
  getAllRequestFilesByOwner,
  deleteRequest
} from './StorageDatabase.js'
import { unlink, stat } from 'fs/promises'
import { join } from 'path'
import { __dirname, __upload_dir } from './Constants.js'
import { randomUUID } from 'crypto'
import { insertUpload } from './LoginDatabase.js'
import { timeStamp } from 'console'

const uploadExpireTime = 1000 * 60 * 10 // 10 minutes

const downloadFileBinder = (socket) => {
  socket.on('download-file-pre', (uuid) => {
    logger.info(`Client asked for file`, {
      socketId: socket.id,
      ip: socket.ip,
      uuid: uuid
    })
    if (!socket.authed) {
      socket.emit('message', 'not logged in')
      return
    }

    try {
      const fileInfo = getFileInfo(uuid)
      if (fileInfo !== undefined) {
        if (fileInfo.owner !== socket.userId) {
          logger.info('Client requested for file permission', {
            socketId: socket.id,
            ip: socket.ip,
            userId: socket.userId,
            uuid
          })
          if (addUniqueRequest(fileInfo.id, uuid, fileInfo.owner, socket.userId)) {
            socket.emit(
              'message',
              'Requested file permission. You will have to wait for the owner to respond.'
            )
          } else {
            socket.emit('message', 'File already requested.')
          }
        } else {
          socket.emit(
            'download-file-res',
            uuid,
            fileInfo.name,
            { c1: fileInfo.keyC1, c2: fileInfo.keyC2 },
            { c1: fileInfo.ivC1, c2: fileInfo.ivC2 },
            fileInfo.size
          )
        }
      } else {
        socket.emit('message', 'file not found')
      }
    } catch (error) {
      logger.error(error, {
        socketId: socket.id,
        ip: socket.ip,
        userId: socket.userId,
        uuid
      })
      socket.emit('message', 'error when download-file-pre')
    }
  })
}
const uploadFileBinder = (socket) => {
  socket.on('upload-file-pre', (key, iv, cb) => {
    logger.info(`Client ask to prepare upload file`, {
      socketId: socket.id,
      ip: socket.ip
    })
    if (!socket.authed) {
      cb('not logged in')
      return
    }
    try {
      // create random id
      const id = randomUUID()
      // store with key and iv in database with expires time
      insertUpload(id, key.c1, key.c2, iv.c1, iv.c2, Date.now() + uploadExpireTime)
      cb(null, id)
    } catch (error) {
      logger.error(error, {
        socketId: socket.id,
        ip: socket.ip,
        userId: socket.userId
      })
      cb('error when upload-file-pre')
    }
  })
}

const deleteFileBinder = (socket) => {
  socket.on('delete-file', async (uuid) => {
    logger.info(`Client requested to delete file`, { socketId: socket.id, ip: socket.ip })
    if (!socket.authed) {
      socket.emit('message', 'not logged in')
      return
    }
    try {
      const fileInfo = getFileInfo(uuid)
      if (fileInfo !== undefined) {
        if (fileInfo.owner !== socket.userId) {
          socket.emit('message', 'permission denied')
        } else {
          await unlink(join(__dirname, __upload_dir, String(socket.userId), uuid))
          deleteFile(uuid)
          logger.info(`File deleted`, {
            socketId: socket.id,
            ip: socket.ip,
            userId: socket.userId,
            uuid
          })
          socket.emit('message', `file ${fileInfo.name} (${uuid}) deleted`)
        }
      } else {
        socket.emit('message', 'file not found')
      }
    } catch (error) {
      logger.error(error, {
        socketId: socket.id,
        ip: socket.ip,
        userId: socket.userId,
        uuid
      })
      socket.emit('message', 'error when delete-file')
    }
  })
}

const deleteRequestBinder = (socket) => {
  socket.on('delete-request', (uuid) => {
    logger.info(`Client requested to delete request`, { socketId: socket.id, ip: socket.ip })
    if (!socket.authed) {
      socket.emit('message', 'not logged in')
      return
    }
    try {
      if (deleteRequest(uuid).changes > 0) {
        logger.info(`Client request deleted`, {
          socketId: socket.id,
          ip: socket.ip,
          userId: socket.userId,
          uuid
        })
        socket.emit('message', 'request deleted')
      } else {
        socket.emit('message', 'request not found')
      }
    } catch (error) {
      logger.error(error, {
        socketId: socket.id,
        ip: socket.ip,
        userId: socket.userId,
        uuid
      })
      socket.emit('message', 'error when delete-request')
    }
  })
}

const getFileListBinder = (socket) => {
  /**
   * Handles the request for a list of files of a specific type.
   *
   * @param {'file' | 'request' | 'requested'} getType - The type of files to retrieve.
   * @param {(userId: number) => Array} getFilesFunc - The function to retrieve the files.
   * Should return a list of objects with a 'uuid' property.
   * @return {void} Emits the list of files as a JSON string or an error message.
   */
  const getListHandler = (getType, getFilesFunc) => {
    if (getType !== 'file' && getType !== 'request' && getType !== 'requested') {
      logger.error(`Invalid list type ${getType}`, { socketId: socket.id, ip: socket.ip })
      socket.emit('message', 'invalid list type')
      return
    }
    logger.info(`Client asked for ${getType} list`, { socketId: socket.id, ip: socket.ip })
    if (!socket.authed) {
      socket.emit('message', 'not logged in')
      return
    }
    try {
      const files = getFilesFunc(socket.userId)
      socket.emit(`${getType}-list-res`, JSON.stringify(files))
    } catch (error) {
      logger.error(error, { socketId: socket.id })
      socket.emit('message', `error when getting ${getType} list`)
    }
  }

  socket.on('get-file-list', () => {
    getListHandler('file', getAllFilesByUserId)
  })
  socket.on('get-request-list', () => {
    getListHandler('request', (userId) => {
      const fileList = getAllRequestFilesByRequester(userId)
      return fileList.map((file) => {
        return {
          uuid: file.uuid,
          name: file.name,
          timestamp: file.timestamp
        }
      })
    })
  })
  socket.on('get-requested-list', () => {
    getListHandler('requested', (userId) => {
      const fileList = getAllRequestFilesByOwner(userId)
      return fileList.map((file) => {
        return {
          uuid: file.uuid,
          name: file.name,
          timestamp: file.timestamp
        }
      })
    })
  })
}

export { downloadFileBinder, deleteFileBinder, getFileListBinder, uploadFileBinder, deleteRequestBinder }
