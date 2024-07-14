import { logger } from './Logger.js'
import { getFileInfo, deleteFile, getAllFilesByUserId } from './StorageDatabase.js'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { __dirname, __upload_dir } from './Constants.js'
import { randomUUID } from 'crypto'
import { insertUpload } from './LoginDatabase.js'

const uploadExpireTime = 1000 * 60 * 10 // 10 minutes

const downloadFileBinder = (socket) => {
  socket.on('download-file-pre', (uuid) => {
    logger.info(`Client ask to prepare download file`, {
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
          socket.emit('message', 'permission denied')
        } else {
          socket.emit(
            'download-file-res',
            uuid,
            fileInfo.name,
            { c1: fileInfo.keyC1, c2: fileInfo.keyC2 },
            { c1: fileInfo.ivC1, c2: fileInfo.ivC2 }
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

const getFileListBinder = (socket) => {
  socket.on('get-file-list', () => {
    logger.info(`Client requested file list`, { socketId: socket.id, ip: socket.ip })
    if (!socket.authed) {
      socket.emit('message', 'not logged in')
      return
    }
    try {
      const files = getAllFilesByUserId(socket.userId)
      socket.emit('file-list-res', JSON.stringify(files))
    } catch (error) {
      logger.error(error, { socketId: socket.id })
      socket.emit('message', 'error when get-file-list')
    }
  })
}

export { downloadFileBinder, deleteFileBinder, getFileListBinder, uploadFileBinder }
