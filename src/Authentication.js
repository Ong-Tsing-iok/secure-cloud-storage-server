import { AddUserAndGetId } from './StorageDatabase.js'
import { userDbLogin } from './LoginDatabase.js'
import { __upload_dir, __crypto_filepath, keyFormatRe, __upload_dir_path } from './Constants.js'
import { logger } from './Logger.js'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PythonShell } from 'python-shell'
import { randomUUID } from 'crypto'

const params =
  '{"g": "eJw9UEsOQjEIvErTdRel/3oVY5qneTt3T02M8e4y0LoooTMwA3zsGLf7dhxj2JOx1/djP6wzjL62+3MX9Jy6M7k5U7IzyFtxhrx3pgJkoDBQ+eXEBHHolT9Bq4mYaZEfoQ2lFQmEhPazqYqscNOMqCEIRCqfoMxU91OjiiqMAzKCa5wjQSJ4baAQQGelyePns+6A6dSPZmhizPKpaUn22thh2XVD5HqHOPdfoutKWDn9tw06luriphiE4L3WbGkdMc46CZit0OX7A0m4Upk=", "u": "eJw1UEEOAjEI/ErTcw/QbQvrV4xpVrO3va2aGOPfhUIPbWCAmYFv7P1xbOfZe7yEeP889zOmIOh7O177QK9lTaFyCm21N/KSAiKlQEsKDJLkLImioIhWqrasXtIBEpJ1PikQGa7dtQn5mCiWIMjHmiwuxRJQ1kSCIhycbUa5EASog0DV8nQkrVXNNJNHoKkDFjAKgS4AxdURcK4xhaqtYwzodNnOMQBuvg64WXM8jWGWnsYuUNjdKS+CntQvQX67Mai3U4cNb78/0oxR1A==", "v": "eJxNUEEOwjAM+8q08w5J1zQpX0GoGmi33QZICPF30iRDXNLUdhy377G127bse2vjaRivr/u6j9Og6HPZHquh51yngWQaWE9MoAW1UOlN6oW0gHaskBivyirRIIpTfzcOHsrhloKypptV+PGqLjXg3Mdn1c2HYUqO1OprMvsdgdyuWD5FSS2FXeGglqIjDL6PbWcO5zy7FAEjhSW0F3Y76Qs7BRAx7CuIPC5FWkTVELu2xlyu4cspvpHFx6S4WiKBRelpC14+X9yjUuI=", "Z": "eJxNUstOxDAM/JWo5x7itI4TfgWtqgXtbW8FJIT4dzx+VBzcJrE9npnkZzmO9+f9PI9jeSnL2/fH41zWoqdf9+fnw05fmdbCYy1Up34aYbWvZehutLWIaLD/Lcu6GVogFZWbZ1E5ugbjMNp2CVSJqgnM6pVEmuXNcQamUndwSQo2Vv+cOIY8RpDT3s6RmRlgC5wabSTB0hFtYWJr7Mi4BO5EG8RfrVQd0IShdgcPmkmzOYyp0pjDiRGZIr7GgZc2sSL0Hk6w93Yt4IYiQ+wunCl7baoupKVR2+VHwPZIw0uMcP49LkqcLGaaN5gpjoW5KLaYSZn2i/fIm5IAkLiBGuOhAoimLL0xKemFJPb1tmCzOwSEnnNBBg/A1Ey3wS7ApfSA8Eu051hDXU1XWsvnwv+d2F0xnkun2+8fa8GTVA=="}'
const checkValidString = (str) => {
  return str && typeof str === 'string' && str.length > 0
}
const authenticationBinder = (socket) => {
  /**
   * Handles the 'login-ask' event from a client.
   * If the client is already logged in, it sends a message to the client.
   * Otherwise, it generates a random key, encrypts it, and sends the encrypted key to the client.
   *
   * @param {string} publicKey - The public key of the client.
   */
  socket.on('login-ask', async (publicKey) => {
    logger.info(`Client asked to login`, { ip: socket.ip })
    if (socket.authed) {
      socket.emit('message', 'already logged in')
      return
    }
    if (!checkValidString(publicKey) || !keyFormatRe.test(publicKey)) {
      logger.warn(`Client sent invalid public key`, { ip: socket.ip })
      socket.emit('message', 'invalid public key')
      return
    }
    try {
      socket.pk = publicKey
      socket.randKey = randomUUID()
      const cipher = await PythonShell.run(__crypto_filepath, {
        args: ['--encrypt', '-P', `${params}`, '-p', `${publicKey}`, '-m', socket.randKey]
      })
      logger.debug(`Asking client to respond with correct auth key`, { ip: socket.ip })
      socket.emit('login-res', cipher[0])
    } catch (error) {
      logger.error(error, { ip: socket.ip })
      socket.emit('message', 'error when login-ask')
    }
  })

  socket.on('login-auth', async (decodeValue) => {
    if (!checkValidString(decodeValue)) {
      logger.warn(`Client sent invalid auth key`, { ip: socket.ip })
      socket.emit('message', 'invalid auth key')
      return
    }
    if (socket.randKey === decodeValue) {
      logger.info(`Client respond with correct auth key and is authenticated`, { ip: socket.ip })
      socket.authed = true
      const { id, exists } = AddUserAndGetId(socket.pk)
      if (!exists) {
        logger.info(`User ${id} added to database. Creating folder for user ${id}`, {
          ip: socket.ip,
          userId: id
        })
        try {
          await mkdir(join(__upload_dir_path, id))
        } catch (error) {
          if (error.code !== 'EEXIST') {
            logger.error(error, { ip: socket.ip, userId: id })
          }
        }
      }

      socket.userId = id
      userDbLogin(socket.id, id)
      logger.debug(`User id: ${id}`)
      socket.emit('login-auth-res', id)
    } else {
      logger.warn(`Client respond with incorrect auth key`, { ip: socket.ip })
      logger.debug(`respond with ${decodeValue} instead of ${socket.randKey}`)
      socket.emit('login-auth-res', null)
    }
  })
}

export default authenticationBinder
