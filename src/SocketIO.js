// Node.js
import { mkdir, unlink } from 'node:fs/promises'
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
import { AddUserAndGetId, deleteFile, getAllFilesByUserId, getFileInfo } from './StorageDatabase.js'
import { userDbLogin, userDbLogout } from './LoginDatabase.js'
import { __dirname, __upload_dir } from './Constants.js'
// File operation binders
import * as fileManager from './FileManager.js'
import authenticationBinder from './Authentication.js'

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

  authenticationBinder(socket)

  fileManager.downloadFileBinder(socket)
  fileManager.deleteFileBinder(socket)
  fileManager.getFileListBinder(socket)
})

export default io
