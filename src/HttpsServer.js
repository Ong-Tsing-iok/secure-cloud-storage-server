import { readFileSync } from 'fs'
import express from 'express'
import { createServer } from 'https'
import { logger } from './Logger.js'
import { mkdir, unlink } from 'fs/promises'
import multer from 'multer'
import { checkUserLoggedIn, getUpload } from './LoginDatabase.js'
import {
  addFileToDatabase,
  getFolderInfo,
  getFileInfo,
  deleteFileOfOwnerId
} from './StorageDatabase.js'
import { join } from 'path'
import { randomUUID } from 'crypto'
import ConfigManager from './ConfigManager.js'

const app = express()
app.set('trust proxy', true)

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const folderPath = join(ConfigManager.uploadDir, req.userId)
    try {
      await mkdir(folderPath, { recursive: true })
      cb(null, folderPath)
    } catch (error) {
      logger.error(error, {
        userId: req.userId,
        ip: req.ip,
        protocol: 'https'
      })
      cb(error)
    }
  },
  filename: (req, file, cb) => {
    cb(null, randomUUID())
  },
  limits: {
    fileSize: 8000000
  }
})
const upload = multer({ storage: storage, limits: { fileSize: 8000000 } })

/**
 * Check authentication of the user based on the provided socket ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware function.
 * @return {void} This function does not return a value.
 */
const auth = (req, res, next) => {
  if (!req.headers.socketid || (typeof req.headers.socketid !== 'string')) {
    logger.warn('Socket Id not found in request headers', {
      ip: req.ip,
      protocol: 'https'
    })
    res.status(400).send('Socket Id not found or invalid')
    return
  }
  try {
    const user = checkUserLoggedIn(req.headers.socketid)
    // logger.debug(`User with socket id ${req.headers.socketid} is authenticating`)
    if (user !== undefined) {
      logger.info(`User is authenticated`, {
        ip: req.ip,
        userId: user.userId,
        protocol: 'https'
      })
      req.userId = user.userId
      next()
    } else {
      logger.warn(`User is not authenticated`, {
        ip: req.ip,
        protocol: 'https'
      })
      res.sendStatus(401)
    }
  } catch (error) {
    logger.error(error, {
      ip: req.ip,
      protocol: 'https'
    })
    res.sendStatus(500)
  }
}
const checkUpload = (req, res, next) => {
  if (!req.headers.uploadid || (typeof req.headers.uploadid !== 'string')) {
    logger.warn(`Upload Id not found in request headers`, {
      ip: req.ip,
      protocol: 'https'
    })
    res.status(400).send('Upload Id not found or invalid')
    return
  }
  const uploadInfo = getUpload(req.headers.uploadid)
  if (uploadInfo === undefined) {
    logger.warn(`Upload Id not found in database`, {
      ip: req.ip,
      userId: req.userId,
      protocol: 'https'
    })
    res.status(400).send('Upload Id not found or invalid')
    return
  }
  // check if path exists
  if (uploadInfo.parentFolderId && !getFolderInfo(uploadInfo.parentFolderId)) {
    logger.warn(`Parent folder path not found when uploading`, {
      ip: req.ip,
      userId: req.userId,
      protocol: 'https'
    })
    res.status(400).send('Parent folder path not found or invalid')
    return
  }
  req.uploadInfo = uploadInfo
  next()
}
app.post('/upload', auth, checkUpload, upload.single('file'), async (req, res) => {
  try {
    if (req.file) {
      logger.info(`User uploaded a file`, {
        ip: req.ip,
        userId: req.userId,
        filename: req.file.originalname,
        size: req.file.size,
        uuid: req.file.filename,
        protocol: 'https'
      })
      addFileToDatabase({
        name: req.file.originalname,
        id: req.file.filename,
        userId: req.userId,
        originOwnerId: req.userId,
        cipher: req.uploadInfo.cipher,
        spk: req.uploadInfo.spk,
        parentFolderId: req.uploadInfo.parentFolderId,
        size: req.file.size
      })
      res.send('File uploaded successfully')
    } else {
      res.status(400).send('No file uploaded')
    }
  } catch (error) {
    logger.error(error, {
      ip: req.ip,
      userId: req.userId,
      protocol: 'https'
    })
    try {
      deleteFileOfOwnerId(req.file.filename, req.userId)
      await unlink(req.file.path)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(error, {
          ip: req.ip,
          userId: req.userId,
          protocol: 'https'
        })
      }
    }

    res.sendStatus(500)
  }
})

app.get('/download', auth, (req, res) => {
  if (!req.headers.uuid || (typeof req.headers.socketid !== 'string')) {
    logger.info(`File Id not found in request headers`, {
      ip: req.ip,
      protocol: 'https'
    })
    res.status(400).send('File Id not found or invalid')
  }
  try {
    const uuid = req.headers.uuid
    logger.info(`User is asking for file`, {
      ip: req.ip,
      userId: req.userId,
      uuid: uuid,
      protocol: 'https'
    })
    const fileInfo = getFileInfo(uuid)
    if (!fileInfo) {
      logger.info(`File not found`, {
        ip: req.ip,
        userId: req.userId,
        uuid: uuid,
        protocol: 'https'
      })
      res.status(404).send('File not found')
    } else if (fileInfo.ownerId !== req.userId) {
      logger.warn(`User don't have permission to download file`, {
        ip: req.ip,
        userId: req.userId,
        uuid: uuid,
        protocol: 'https'
      })
      res.status(403).send('File not permitted')
    } else {
      logger.info(`User downloading file`, {
        ip: req.ip,
        userId: req.userId,
        uuid: uuid,
        protocol: 'https'
      })
      res.download(join(ConfigManager.uploadDir, req.userId, fileInfo.id), fileInfo.name)
    }
  } catch (error) {
    logger.error(error, {
      ip: req.ip,
      uuid: req.headers.uuid,
      protocol: 'https'
    })
    res.sendStatus(500)
  }
})

const options = {
  key: readFileSync(ConfigManager.serverKeyPath),
  cert: readFileSync(ConfigManager.serverCertPath),
  maxHttpBufferSize: 1e8 // 100 MB, may need to increase
}
//? Redirect http to https?
const server = createServer(options, app)

export default server

server.listen(ConfigManager.httpsPort, () => {
  logger.log('info', `Server is running on port ${ConfigManager.httpsPort}`)
})
