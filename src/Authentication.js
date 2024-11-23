import { AddUserAndGetId, getUserByKey, userStatusType } from './StorageDatabase.js'
import { addFailure, getFailure, userDbLogin } from './LoginDatabase.js'
import { __upload_dir, __crypto_filepath, keyFormatRe, __upload_dir_path } from './Constants.js'
import { logger } from './Logger.js'
import CryptoHandler from './CryptoHandler.js'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'crypto'
import ConfigManager from './ConfigManager.js'

const emailFormatRe = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/
const checkValidString = (str) => {
  return str && typeof str === 'string' && str.length > 0
}
const checkValidKey = (key) => {
  return checkValidString(key) && keyFormatRe.test(key)
}
const checkValidEmail = (email) => {
  return checkValidString(email) && emailFormatRe.test(email)
}
const checkValidName = (name) => {
  return checkValidString(name)
}
const authenticationBinder = (socket) => {
  socket.on('register', async (publicKey, name, email, cb) => {
    logger.info(`Client asked to register`, { ip: socket.ip, publicKey, name, email })
    if (!checkValidKey(publicKey)) {
      cb('invalid public key')
      return
    }
    try {
      if (getUserByKey(publicKey)) {
        logger.info(`Client already registered`, { ip: socket.ip, publicKey, name, email })
        cb('already registered')
        return
      }
      if (!checkValidName(name)) {
        logger.warn(`Client register with invalid name`, { ip: socket.ip, publicKey, name, email })
        cb('invalid name')
        return
      }
      if (!checkValidEmail(email)) {
        logger.warn(`Client register with invalid email`, { ip: socket.ip, publicKey, name, email })
        cb('invalid email')
        return
      }
      socket.randKey = randomUUID()
      socket.pk = publicKey
      socket.name = name
      socket.email = email
      const cipher = await CryptoHandler.encrypt(publicKey, socket.randKey)
      console.log(cipher)
      cb(null, cipher)
      // Wait for login-auth
    } catch (error) {
      logger.error(error, { ip: socket.ip, publicKey, name, email })
      cb('Internal server error')
    }
  })
  /**
   * Handles the 'login-ask' event from a client.
   * If the client is already logged in, it sends a message to the client.
   * Otherwise, it generates a random key, encrypts it, and sends the encrypted key to the client.
   *
   * @param {string} publicKey - The public key of the client.
   */
  socket.on('login', async (publicKey, cb) => {
    logger.info(`Client asked to login`, { ip: socket.ip, publicKey })
    if (socket.authed) {
      cb('already logged in')
      return
    }
    if (!checkValidKey(publicKey)) {
      logger.warn(`Client login with invalid public key`, { ip: socket.ip, publicKey })
      cb('invalid public key')
      return
    }
    try {
      const userInfo = getUserByKey(publicKey)
      if (!userInfo) {
        logger.warn(`Client login with unknown public key`, { ip: socket.ip, publicKey })
        cb('not registered')
        return
      }
      if (userInfo.status === userStatusType.stopped) {
        logger.warn(`Stopped client tried to login`, {
          ip: socket.ip,
          publicKey,
          userId: userInfo.id
        })
        cb('user account is stopped')
        return
      }

      // Check login attempts
      const failureInfo = getFailure(userInfo.id)
      if (failureInfo && failureInfo.failures > ConfigManager.loginAttemptsLimit) {
        logger.warn(`Block client for too many login attempts`, {
          ip: socket.ip,
          userId: userInfo.id
        })
        cb('too many login attempts')
        return
      }

      socket.userId = userInfo.id
      socket.randKey = randomUUID()
      socket.pk = publicKey
      socket.name = userInfo.name
      socket.email = userInfo.email
      const cipher = await CryptoHandler.encrypt(publicKey, socket.randKey)
      cb(null, cipher)
      // logger.debug(`Asking client to respond with correct auth key`, { ip: socket.ip })
    } catch (error) {
      logger.error(error, { ip: socket.ip, publicKey })
      cb('Internal server error')
    }
  })

  socket.on('auth-res', async (decodeValue, cb) => {
    logger.info(`Client responding with authentication key`, { ip: socket.ip, decodeValue })
    if (!socket.pk || !socket.randKey || !(socket.userId || (socket.name && socket.email))) {
      logger.warn(`Client authenticate without asking`, { ip: socket.ip, decodeValue })
      cb("didn't ask to log in or register first")
      return
    }
    if (!checkValidString(decodeValue)) {
      logger.warn(`Client sent invalid auth key`, { ip: socket.ip, decodeValue })
      cb('invalid authentication key')
      return
    }
    if (socket.randKey !== decodeValue) {
      logger.warn(`Client sent incorrect auth key`, {
        ip: socket.ip,
        decodeValue,
        randKey: socket.randKey
      })
      addFailure(socket.userId)
      cb('incorrect authentication key')
      return
    }

    logger.info(`Client is authenticated`, { ip: socket.ip, userId: socket.userId })
    try {
      if (!socket.userId) {
        // register
        const { id, info } = AddUserAndGetId(socket.pk, socket.name, socket.email)
        if (info.changes === 0) {
          throw new Error('Failed to add user to database. Might be id collision.')
        }
        socket.userId = id
        logger.info('User registered', {
          ip: socket.ip,
          userId: socket.userId,
          name: socket.name,
          email: socket.email,
          pk: socket.pk
        })

        logger.info('Creating folder for user', { ip: socket.ip, userId: socket.userId })
        try {
          await mkdir(join(ConfigManager.uploadDir, id))
        } catch (error) {
          if (error.code !== 'EEXIST') {
            throw error
          }
        }
      }

      userDbLogin(socket.id, socket.userId)
      socket.authed = true
      cb(null, { userId: socket.userId, name: socket.name, email: socket.email })
    } catch (error) {
      logger.error(error, { ip: socket.ip, userId: socket.userId })
      cb('Internal server error')
    }
  })
}

export default authenticationBinder
