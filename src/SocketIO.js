// Node.js
import { writeFile, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'url'
// Servers
import { Server } from 'socket.io'
import server from './HttpsServer.js'
import sessionMiddleware from './SessionMiddleware.js'
import sharedSession from 'express-socket.io-session'
// Logger
import { logger } from './Logger.js'
// ElGamal
import ElGamal from 'basic_simple_elgamal'
import bigInt from 'big-integer'
import { getInRange } from 'basic_simple_elgamal/bigIntManager.js'
// Database
import { AddUserAndGetId } from './StorageDatabase.js'
import { userDbLogin } from './LoginDatabase.js'

const __filename = fileURLToPath(import.meta.url) // get the resolved path to the file
const __dirname = dirname(__filename) // get the name of the directory
const io = new Server(server, {
  cors: {
    origin: '*'
  }
})

// io.use((socket, next) => {
//   sessionMiddleware(socket.request, socket.request.res || {}, next)
// })

io.use(sharedSession(sessionMiddleware, {
  autoSave: true
}))

// server.use(cors())

io.on('connection', (socket) => {
  logger.log('info', `Client connected with socket id ${socket.id}`)

  socket.on('message', (message) => {
    logger.log('info', `Received message as server: ${message}`)
    // Broadcast the message to all connected clients
    io.emit('message', message)
  })

  socket.on('disconnect', () => {
    logger.log('info', `Client with socket id ${socket.id} is disconnected`)
    userDbLogout(socket.id)
  })

  /**
   * @todo Generate a random authentication content, encode it with publicKey,
   * and send back to client for it to decode and send back.
   */
  socket.on('login-ask', async (p, g, y) => {
    logger.info(`Client with socket id ${socket.id} asked to login`)
    try {
      socket.p = String(p)
      socket.g = String(g)
      socket.y = String(y)
      socket.elgamal = new ElGamal(p, g, y, '2') // 2 for private key is filler value (won't use)
      logger.debug(`p: ${socket.elgamal.modulus}, q: ${socket.elgamal.groupOrder}`)
      socket.elgamal.checkSecurity() // TODO: handle errors when p, q, y have problems
      socket.randKey = await getInRange(bigInt(p).prev(), 1)
      const cipherPair = await socket.elgamal.encrypt(socket.randKey)
      logger.info(`Asking client with socket id ${socket.id} to respond with correct auth key`)
      socket.emit('login-res', cipherPair.c1, cipherPair.c2)
    } catch (error) {
      logger.error(`Error occured when ${socket.id} asked to login: ${error}`)
      socket.emit('message', 'error when login-ask')
    }
  })
  /**
   * @todo Compare this decode value with the value above.
   * If is same, then this session is authenticated as this user.
   * Also check if publickey exist. If not, add to database
   * (combine register with login)
   */
  socket.on('login-auth', (decodeValue) => {
    decodeValue = bigInt(decodeValue)
    if (socket.randKey.compare(decodeValue) == 0) {
      logger.info(
        `Client with socket id ${socket.id} respond with correct auth key and is authenticated`
      )
      socket.authed = true
      const id = AddUserAndGetId(socket.p, socket.g, socket.y)
      socket.handshake.session.userId = id
      socket.handshake.session.save()
      userDbLogin(socket.id, id)
      logger.debug(`User id: ${id}`)
      socket.emit('login-auth-res', 'OK')
    } else {
      logger.info(`Client with socket id ${socket.id} respond with incorrect authentication`)
      logger.debug(`respond with ${decodeValue} instead of ${socket.randKey}`)
      socket.emit('login-auth-res', 'incorrect')
    }
  })

  // File Management
  socket.on('file-upload', ({ fileName, fileData }, ack) => {
    logger.info(`Client with socket id ${socket.id} is uploading a file`)
    const folderPath = join(__dirname, 'uploads')
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath)
    }
    const filePath = join(folderPath, fileName)
    writeFile(filePath, fileData, (err) => {
      if (err) {
        logger.error(`Error saving file: ${err}`)
        ack('file upload failed')
        return
      }

      logger.info(`Client with socket id ${socket.id} uploaded a file as ${fileName}`)
      ack('file upload success')
    })
  })
})

export default io
