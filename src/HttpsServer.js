import { logger, logHttpsError, logHttpsInfo, logHttpsWarning } from './Logger.js'
import { mkdir, unlink } from 'fs/promises'
import multer from 'multer'
import { checkUserLoggedIn, getUpload } from './LoginDatabase.js'
import {
  getFolderInfo,
  getFileInfo,
} from './StorageDatabase.js'
import { resolve } from 'path'
import ConfigManager from './ConfigManager.js'
import { finishUpload } from './UploadVerifier.js'
import { app } from './SocketIO.js'
import { FileIdSchema, SocketIDSchema } from './Validation.js'

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const folderPath = resolve(ConfigManager.uploadDir, req.userId)
      await mkdir(folderPath, { recursive: true })
      cb(null, folderPath)
    } catch (error) {
      logHttpsError(req, error)
      cb(error)
    }
  },
  filename: (req, file, cb) => {
    cb(null, req.headers.fileid)
  },
  limits: {
    fileSize: 8000000
  }
})
const checkFileType = (req, file, cb) => {
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')

  cb(null, true)
}
const upload = multer({
  storage: storage,
  fileFilter: checkFileType,
  limits: { fileSize: 8000000 }
})

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
    const result = SocketIDSchema.safeParse(req.headers.socketid)
    if (!result.success) {
      logHttpsWarning(req, 'SocketId not found or invalid', { issues: result.issues })
      res.status(400).send('SocketId not found or invalid')
      return
    }

    const user = checkUserLoggedIn(req.headers.socketid)
    // logger.debug(`User with socket id ${req.headers.socketid} is authenticating`)
    if (!user) {
      logHttpsWarning(req, 'Client is not logged in.')
      res.sendStatus(401)
      return
    }

    logHttpsInfo(req, 'Client is logged in.')
    req.userId = user.userId
    next()
  } catch (error) {
    next(error)
  }
}

const checkUpload = async (req, res, next) => {
  try {
    const actionStr = 'Client asks to upload file'
    logHttpsInfo(req, actionStr + '.')

    const result = FileIdSchema.safeParse(req.headers.fileid)
    if (!result.success) {
      logHttpsWarning(req, actionStr + ' but fileId is invalid.', { issues: result.issues })
      res.status(400).send('FileId is invalid.')
      return
    }
    const uploadInfo = getUpload(req.headers.fileid)
    if (!uploadInfo) {
      logHttpsWarning(req, actionStr + ' but upload info does not exist.')
      res.status(400).send('Upload info not found.')
      return
    }
    // check if path exists
    if (uploadInfo.parentFolderId && !(await getFolderInfo(uploadInfo.parentFolderId))) {
      logHttpsWarning(req, actionStr + 'but parent folder does not exist.', {
        parentFolderId: uploadInfo.parentFolderId
      })
      res.status(400).send('Parent folder not found.')
      return
    }
    req.uploadInfo = uploadInfo
    next()
  } catch (error) {
    next(error)
  }
}

app.post('/upload', auth, checkUpload, upload.single('file'), async (req, res, next) => {
  try {
    if (req.file) {
      logHttpsInfo(req, 'Client uploaded file.', { filename: req.file.originalname })

      await finishUpload({
        name: req.file.originalname,
        id: req.file.filename,
        userId: req.userId,
        originOwnerId: req.userId,
        cipher: req.uploadInfo.cipher,
        spk: req.uploadInfo.spk,
        parentFolderId: req.uploadInfo.parentFolderId,
        size: req.file.size
      })
      res.send('File uploaded successfully.')
    } else {
      res.status(400).send('No file uploaded.')
    }
  } catch (error) {
    try {
      await unlink(req.file.path)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logHttpsError(req, error)
      }
    }
    next(error)
  }
})

app.get('/download', auth, async (req, res, next) => {
  try {
    const actionStr = 'Client asks to download file'
    logHttpsInfo(req, actionStr + '.')

    const result = FileIdSchema.safeParse(req.headers.fileid)
    if (!result.success) {
      logHttpsWarning(req, actionStr + ' but fileId is invalid.', { issues: result.issues })
      res.status(400).send('FileId is invalid.')
      return
    }

    const fileId = req.headers.fileid
    const fileInfo = await getFileInfo(fileId)

    if (!fileInfo) {
      logHttpsWarning(req, actionStr + ' which does not exist.')
      res.status(404).send('File not found')
    } else if (fileInfo.ownerId !== req.userId) {
      logHttpsWarning(req, actionStr + ' which is not owned by the client.')
      res.status(403).send('File not owned.')
    } else {
      logHttpsInfo(req, 'Client downloading file.')
      res.download(resolve(ConfigManager.uploadDir, req.userId, fileInfo.id), fileInfo.name)
    }
  } catch (error) {
    next(error)
  }
})

// Error handler
app.use((err, req, res, next) => {
  logHttpsError(req, err)
  res.sendStatus(500)
})

logger.info(`Https POST GET path set.`)
