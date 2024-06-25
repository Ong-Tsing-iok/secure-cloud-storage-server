import { readFileSync } from 'fs'
import express from 'express'
import { createServer } from 'https'
import { logger } from './Logger.js'
import { mkdir } from 'fs/promises'
import multer from 'multer'
import { checkUserLoggedIn } from './LoginDatabase.js'
import { addFileToDatabase, getFileInfo } from './StorageDatabase.js'
import { join } from 'path'
import { randomUUID } from 'crypto'

const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.set('trust proxy', true)

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const folderPath = join(/*__dirname, */ 'uploads', String(req.userId))
    try {
      await mkdir(folderPath, { recursive: true })
      cb(null, folderPath)
    } catch (error) {
      logger.error(`Error creating folder ${folderPath}: ${error}`)
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
  try {
    const user = checkUserLoggedIn(req.headers.socketid)
    logger.debug(`User with socket id ${req.headers.socketid} is authenticating`)
    if (user !== undefined) {
      logger.info(`User with socket id ${req.headers.socketid} is authenticated`)
      req.userId = user.userId
      next()
    } else {
      logger.info(`User with socket id ${req.headers.socketid} is not authenticated`)
      res.sendStatus(401)
    }
  } catch (error) {
    logger.error(`Error checking user authentication with socket id ${req.headers.socketid}: ${error}`)
    res.sendStatus(500)
  }
}
app.post('/upload', auth, upload.single('file'), (req, res) => {
  // if (req.filename && req.fileData) {
  //   writeFileSync('uploads/' + req.filename, req.fileData)
  // }
  // console.log(req.body)
  // console.log(req.headers)
  console.log(req.file)
  try {
    if (req.file) {
      logger.info(`User with socket id ${req.headers.socketid} uploaded a file`)
      addFileToDatabase(req.file.originalname, req.file.filename, req.userId)
      res.send('File uploaded successfully')
    } else {
      res.status(400).send('No file uploaded')
    }
  } catch (error) {
    logger.error(`Error uploading file for user with socket id ${req.headers.socketid}: ${error}`)
    res.sendStatus(500)
  }
})
app.get('/download', auth, (req, res) => {
  try {
    const uuid = req.headers.uuid
    logger.info(`User with socket id ${req.headers.socketid} is asking for file with UUID ${uuid}`)
    const fileInfo = getFileInfo(uuid)
    if (!fileInfo) {
      logger.info(`File with UUID ${uuid} not found`)
      res.status(404).send('File not found')
    } else if (fileInfo.owner !== req.userId) {
      logger.info(`User with socket id ${req.headers.socketid} does not have permission to download file with UUID ${uuid}`)
      res.status(403).send('File not permitted')
    } else {
      logger.info(`User with socket id ${req.headers.socketid} is downloading file with UUID ${uuid}`)
      res.download(join(/*__dirname, */ 'uploads', String(req.userId), fileInfo.uuid), fileInfo.name)
    }
  } catch (error) {
    logger.error(`Error downloading file with UUID ${req.headers.uuid} for user with socket id ${req.headers.socketid}: ${error}`)
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
