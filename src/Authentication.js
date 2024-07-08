import ElGamal from 'basic_simple_elgamal'
import bigInt from 'big-integer'
import { getInRange } from 'basic_simple_elgamal/bigIntManager.js'
import { AddUserAndGetId } from './StorageDatabase.js'
import { userDbLogin } from './LoginDatabase.js'
import { __dirname, __upload_dir } from './Constants.js'
import { logger } from './Logger.js'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const authenticationBinder = (socket) => {
  /**
   * Handles the 'login-ask' event from a client.
   * If the client is already logged in, it sends a message to the client.
   * Otherwise, it generates a random key, encrypts it, and sends the encrypted key to the client.
   *
   * @param {string} p - The prime number used in the ElGamal cryptosystem.
   * @param {string} g - The generator used in the ElGamal cryptosystem.
   * @param {string} y - The public key used in the ElGamal cryptosystem.
   */
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
}

export default authenticationBinder