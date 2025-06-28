import express from 'express'
// Servers
import { Server } from 'socket.io'
// Logger
import { logger, logSocketInfo } from './Logger.js'
// Database
import { userDbLogout } from './LoginDatabase.js'
// File operation binders
import { allFileBinder } from './FileManager.js'
import authenticationBinder from './Authentication.js'
import { requestBinder } from './RequestManager.js'
import BlockchainManager from './BlockchainManager.js'
import ConfigManager from './ConfigManager.js'
import { createServer } from 'https'
import { readFileSync } from 'fs'

const app = express()
app.set('trust proxy', true)
logger.info(`Express app created.`)

const options = {
  key: readFileSync(ConfigManager.serverKeyPath),
  cert: readFileSync(ConfigManager.serverCertPath),
  maxHttpBufferSize: 1e8 // 100 MB, may need to increase
}
//? Redirect http to https?
const server = createServer(options, app)

server.listen(ConfigManager.httpsPort, () => {
  logger.info(`Server is running on port ${ConfigManager.httpsPort}`)
})

const io = new Server(server, {
  cors: {
    origin: '*'
  }
})
const blockchainManager = new BlockchainManager()

io.on('connection', (socket) => {
  socket.ip = socket.handshake.address
  // May need to get address from header if server is behind a proxy
  // See https://socket.io/how-to/get-the-ip-address-of-the-client
  socket.use(([event], next) => {
    socket.event = event
    next()
  })
  logSocketInfo(socket, 'Client connected.')

  socket.on('message', (message) => {
    logger.info(socket, 'Received message.', { message })
    socket.emit('message', message + ' received by server.')
  })

  socket.on('disconnect', () => {
    logSocketInfo(socket, 'Client disconnected.', { event: undefined })
    // Maybe move to Authentication.js?
    userDbLogout(socket.id)
  })

  authenticationBinder(socket, blockchainManager)
  allFileBinder(socket)
  requestBinder(socket, io)
})

const emitToSocket = (socketId, event, ...data) => {
  return io.to(socketId).emit(event, ...data)
}
const disconnectSocket = (socketId) => {
  return io.sockets.sockets.get(socketId).disconnect(true)
}

// export default io
export { emitToSocket, disconnectSocket, blockchainManager, app }
