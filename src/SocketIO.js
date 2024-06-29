// Node.js
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
// Servers
import { Server } from 'socket.io'
import server from './HttpsServer.js'
// Logger
import { logger } from './Logger.js'
// ElGamal
import ElGamal from 'basic_simple_elgamal'
import bigInt from 'big-integer'
import { getInRange } from 'basic_simple_elgamal/bigIntManager.js'
// Database
import { AddUserAndGetId, getAllFilesByUserId, getFileInfo } from './StorageDatabase.js'
import { userDbLogin, userDbLogout } from './LoginDatabase.js'
import { __dirname, __upload_dir } from './Constants.js'

const io = new Server(server, {
  cors: {
    origin: '*'
  }
})

io.on('connection', (socket) => {
  socket.ip = socket.handshake.address
  // TODO: need to get address from header if server is behind a proxy
  // See https://socket.io/how-to/get-the-ip-address-of-the-client
  logger.info('Client connected', { socketId: socket.id, ip: socket.ip })

  socket.on('message', (message) => {
    logger.info(`Received message: ${message}`, { socketId: socket.id, ip: socket.ip })
    // Broadcast the message to all connected clients
    io.emit('message', message + ' from server')
  })

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id, ip: socket.ip })
    userDbLogout(socket.id)
  })

  socket.on('login-ask', async (p, g, y) => {
    logger.info(`Client asked to login`, { socketId: socket.id, ip: socket.ip })
    if (socket.authed) {
      socket.emit('message', 'already logged in')
      return
    }
    try {
      socket.p = String(p)
      socket.g = String(g)
      socket.y = String(y)
      socket.elgamal = new ElGamal(p, g, y, '2') // 2 for private key is filler value (won't use)
      logger.debug(`p: ${socket.elgamal.modulus}, q: ${socket.elgamal.groupOrder}`)
      socket.elgamal.checkSecurity()
      socket.randKey = await getInRange(bigInt(p).prev(), 1)
      const cipherPair = await socket.elgamal.encrypt(socket.randKey)
      logger.info(`Asking client to respond with correct auth key`, {
        socketId: socket.id,
        ip: socket.ip
      })
      socket.emit('login-res', cipherPair.c1, cipherPair.c2)
    } catch (error) {
      logger.error(error, { socketId: socket.id, ip: socket.ip })
      socket.emit('message', 'error when login-ask')
    }
  })

  socket.on('login-auth', async (decodeValue) => {
    decodeValue = bigInt(decodeValue)
    if (socket.randKey.compare(decodeValue) == 0) {
      logger.info(`Client respond with correct auth key and is authenticated`, {
        socketId: socket.id,
        ip: socket.ip
      })
      socket.authed = true
      const { id, exists } = AddUserAndGetId(socket.p, socket.g, socket.y)
      if (!exists) {
        logger.info(`User ${id} added to database. Creating folder for user ${id}`, {
          socketId: socket.id,
          ip: socket.ip,
          userId: id
        })
        try {
          await mkdir(join(__dirname, __upload_dir, id.toString()))
        } catch (error) {
          if (error.code !== 'EEXIST') {
            logger.error(error, { socketId: socket.id, ip: socket.ip, userId: id })
          }
        }
      }

      socket.userId = id
      userDbLogin(socket.id, id)
      logger.debug(`User id: ${id}`)
      socket.emit('login-auth-res', 'OK')
    } else {
      logger.info(`Client respond with incorrect auth key`, {
        socketId: socket.id,
        ip: socket.ip
      })
      logger.debug(`respond with ${decodeValue} instead of ${socket.randKey}`)
      socket.emit('login-auth-res', 'incorrect')
    }
  })

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
          socket.emit('download-file-res', uuid, fileInfo.name)
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
})

export default io
