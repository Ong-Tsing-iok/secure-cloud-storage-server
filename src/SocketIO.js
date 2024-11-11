// Servers
import { Server } from 'socket.io'
import server from './HttpsServer.js'
// Logger
import { logger } from './Logger.js'
// Database
import { userDbLogout } from './LoginDatabase.js'
// File operation binders
import { allFileBinder } from './FileManager.js'
import authenticationBinder from './Authentication.js'
import { requestBinder } from './RequestManager.js'

const io = new Server(server, {
  cors: {
    origin: '*'
  }
})

io.on('connection', (socket) => {
  socket.ip = socket.handshake.address
  // TODO: may need to get address from header if server is behind a proxy
  // See https://socket.io/how-to/get-the-ip-address-of-the-client
  logger.info('Client connected', { socketId: socket.id, ip: socket.ip })
  // io.to(socket.id).emit('message', 'Welcome to server')

  socket.on('message', (message) => {
    logger.info(`Received message: ${message}`, { socketId: socket.id, ip: socket.ip })
    socket.emit('message', message + ' from server')
  })

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id, ip: socket.ip })
    // TODO: maybe move to Authentication.js?
    userDbLogout(socket.id)
  })

  authenticationBinder(socket)
  allFileBinder(socket)
  requestBinder(socket, io)
})

const emitToSocket = (socketId, event, ...data) => {
  return io.to(socketId).emit(event, ...data)
} 

export default io
export { emitToSocket }
