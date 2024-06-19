import { readFileSync } from 'fs'
import express from 'express'
import { createServer } from 'https'
import { logger } from './Logger.js'
import sessionMiddleware from './SessionMiddleware.js'
import { writeFileSync } from 'fs'
import multer from 'multer'

const app = express()
app.get('/', (req, res) => {
  res.send('Hello World!')
})


app.set('trust proxy', true)
app.use(sessionMiddleware)

const upload = multer({ dest: 'uploads/' })
const auth = (req, res, next) => {
  // req.session.get('userId')
  console.log(req.session)
  next()
  // if (req.session.userId) {
  //   next()
  // } else {
  //   res.sendStatus(401)
  // }
}
app.post('/upload', auth, upload.single('file'), (req, res) => {
  // if (req.filename && req.fileData) {
  //   writeFileSync('uploads/' + req.filename, req.fileData)
  // }
  console.log(req.body)
  console.log(req.headers)
  console.log(req.file)
  req.session.upload = 1
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
