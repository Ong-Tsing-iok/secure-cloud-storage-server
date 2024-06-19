import { readFileSync } from 'fs'
import express from 'express'
import { createServer } from 'https'
import { logger } from './Logger.js'
import sessionMiddleware from './SessionMiddleware.js'
import { writeFileSync } from 'fs'
import multer from 'multer'
import { selectUserBySocketId } from './LoginDatabase.js'

const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})


app.set('trust proxy', true)
app.use(sessionMiddleware)

const upload = multer({ dest: 'uploads/' })
/**
 * Check authentication of the user based on the provided socket ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware function.
 * @return {void} This function does not return a value.
 */
const auth = (req, res, next) => {
  const user = selectUserBySocketId(req.headers.socketid)
  logger.debug(`User with socket id ${req.headers.socketid} is authenticating`)
  if (user && user.userId) {
    logger.info(`User with socket id ${req.headers.socketid} is authenticated`)
    req.userId = user.userId
    next()
  } else {
    logger.info(`User with socket id ${req.headers.socketid} is not authenticated`)
    res.sendStatus(401)
  }
}
app.post('/upload', auth, upload.single('file'), (req, res) => {
  // if (req.filename && req.fileData) {
  //   writeFileSync('uploads/' + req.filename, req.fileData)
  // }
  console.log(req.body)
  console.log(req.headers)
  console.log(req.file)
  if (req.file) {
    res.send('File uploaded successfully')
  } else {
    res.status(400).send('No file uploaded')
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
