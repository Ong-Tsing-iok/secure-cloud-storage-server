import { readFileSync, unlink } from 'fs'
import express from 'express'
import { createServer } from 'https'
import { logger } from './Logger.js'
import { mkdir } from 'fs/promises'
import multer from 'multer'
import { checkUserLoggedIn, getUpload } from './LoginDatabase.js'
import { addFileToDatabase, getFileInfo } from './StorageDatabase.js'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { __upload_dir, __dirname } from './Constants.js'

const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.set('trust proxy', true)

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const folderPath = join(__dirname, __upload_dir, String(req.userId))
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
    fileSize: 1024 * 1024 * 1024
  } // 1GB
})
const upload = multer({ storage: storage })

/**
 * Check authentication of the user based on the provided socket ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware function.
 * @return {void} This function does not return a value.
 */
const auth = (req, res, next) => {
  if (!req.headers.socketid || !(typeof req.headers.socketid === 'string')) {
    logger.info('Socket ID not found in request headers', {
      ip: req.ip,
      protocol: 'https'
    })
    res.status(400).send('Socket ID not found or invalid')
    return
  }
  try {
    const user = checkUserLoggedIn(req.headers.socketid)
    logger.debug(`User with socket id ${req.headers.socketid} is authenticating`)
    if (user !== undefined) {
      logger.info(`User is authenticated`, {
        ip: req.ip,
        userId: user.userId,
        protocol: 'https'
      })
      req.userId = user.userId
      next()
    } else {
      logger.info(`User is not authenticated`, {
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
app.post('/upload', auth, upload.single('file'), (req, res) => {
  try {
    if (req.file) {
      if (!req.headers.uploadid || !(typeof req.headers.uploadid === 'string')) {
        logger.info(`Upload ID not found in request headers`, {
          ip: req.ip,
          protocol: 'https'
        })
        res.status(400).send('Upload ID not found or invalid')
        unlink(req.file.path)
        return
      }
      const uploadInfo = getUpload(req.headers.uploadid)
      if (uploadInfo === undefined) {
        logger.info(`Upload ID not found in database`, {
          ip: req.ip,
          protocol: 'https'
        })
        res.status(400).send('Upload ID not found or invalid')
        unlink(req.file.path)
        return
      }
      logger.info(`User uploaded a file`, {
        ip: req.ip,
        userId: req.userId,
        filename: req.file.originalname,
        size: req.file.size,
        uuid: req.file.filename,
        protocol: 'https'
      })
      addFileToDatabase(
        req.file.originalname,
        req.file.filename,
        req.userId,
        uploadInfo.keyCipher,
        uploadInfo.ivCipher,
        req.file.size,
        null
      )
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
    res.sendStatus(500)
  }
})
app.get('/download', auth, (req, res) => {
  if (!req.headers.uuid || !(typeof req.headers.socketid === 'string')) {
    logger.info(`UUID not found in request headers`, {
      ip: req.ip,
      protocol: 'https'
    })
    res.status(400).send('UUID not found or invalid')
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
      logger.info(`User don't have permission to download file`, {
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
      res.download(join(__dirname, __upload_dir, String(req.userId), fileInfo.id), fileInfo.name)
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
  key: readFileSync('server.key'),
  cert: readFileSync('server.crt'),
  maxHttpBufferSize: 1e8 // 100 MB TODO: May need to increase
}
/**
 * @todo Redirect http to https?
 */
const server = createServer(options, app)

export default server

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  logger.log('info', `Server is running on port ${PORT}`)
})
