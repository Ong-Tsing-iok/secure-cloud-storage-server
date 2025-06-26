import { AddUserAndGetId, deleteUserById, getUserByKey, userStatusType } from './StorageDatabase.js'
import { addFailure, getFailure, userDbLogin } from './LoginDatabase.js'
import {
  keyFormatRe,
  emailFormatRe,
  invalidArgumentErrorMsg,
  internalServerErrorMsg
} from './Utils.js'
import {
  logger,
  logInvalidSchemaWarning,
  logSocketError,
  logSocketInfo,
  logSocketWarning
} from './Logger.js'
import CryptoHandler from './CryptoHandler.js'
import { mkdir, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'crypto'
import ConfigManager from './ConfigManager.js'
import { pre_schema1_MessageGen } from '@aldenml/ecc'
import { count } from 'node:console'
import { checkAgainstSchema, LoginRequestSchema, RegisterRequestSchema } from './Validation.js'

const checkValidString = (str) => {
  return str && typeof str === 'string' && str.length > 0
}

const authenticationBinder = (socket, blockchainManager) => {
  socket.on('register', async (request, cb) => {
    logger.info(`Client asked to register`, { ip: socket.ip, ...request })
    const result = RegisterRequestSchema.safeParse(request)
    if (!result.success) {
      logger.warn(`Client register with invalid data.`, { ip: socket.ip, ...request })
      cb({ errorMsg: 'Invalid request data.' })
      return
    }

    const { publicKey, blockchainAddress, name, email } = result.data
    try {
      if (getUserByKey(publicKey)) {
        logger.info(`Client already registered`, {
          ip: socket.ip,
          publicKey,
          name,
          email
        })
        cb({ errorMsg: 'Already registered.' })
        return
      }

      const { message, cipher, spk } = await CryptoHandler.verifyGen(publicKey)
      socket.randKey = message
      socket.pk = publicKey
      socket.name = name
      socket.email = email
      socket.blockchainAddress = blockchainAddress
      cb({ cipher, spk })
      // Wait for login-auth
    } catch (error) {
      logger.error(error, { ip: socket.ip, ...request })
      cb({ errorMsg: 'Internal server error.' })
    }
  })
  /**
   * Handles the 'login-ask' event from a client.
   * If the client is already logged in, it sends a message to the client.
   * Otherwise, it generates a random key, encrypts it, and sends the encrypted key to the client.
   *
   * @param {{publicKey: string}} request - The public key of the client.
   */
  socket.on('login', async (request, cb) => {
    logSocketInfo(socket, 'Client asked to login.', request)

    const result = LoginRequestSchema.safeParse(request)
    if (!result.success) {
      logInvalidSchemaWarning(socket, 'Client login', request)
      cb({ errorMsg: invalidArgumentErrorMsg })
      return
    }
    const { publicKey } = result.data

    if (socket.authed) {
      cb({ errorMsg: 'Already logged in.' })
      return
    }

    try {
      const userInfo = getUserByKey(publicKey)
      if (!userInfo) {
        logSocketWarning(socket, `Non-registered client trying to login.`, request)
        cb({ errorMsg: 'Not registered.' })
        return
      }
      socket.userId = userInfo.id
      if (userInfo.status === userStatusType.stopped) {
        logSocketWarning(socket, 'Stopped client trying to login.', request)
        cb({ errorMsg: 'Account is stopped.' })
        return
      }

      // Check login attempts
      const failureInfo = getFailure(userInfo.id)
      if (failureInfo && failureInfo.count >= ConfigManager.loginAttemptsLimit) {
        logSocketWarning(socket, `Client failed too many login attempts.`, {
          ...request,
          failedLoginAttempts: failureInfo.count
        })
        cb({ errorMsg: 'Too many login attempts.' })
        return
      }

      const { message, cipher, spk } = await CryptoHandler.verifyGen(publicKey)
      socket.userId = userInfo.id
      socket.randKey = message
      socket.pk = publicKey
      socket.name = userInfo.name
      socket.email = userInfo.email
      logSocketInfo(socket, `Asking client to respond with correct authentication key.`, request)
      cb({ cipher, spk })
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: internalServerErrorMsg })
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
    try {
      if (socket.randKey !== decodeValue) {
        logger.warn(`Client sent incorrect auth key`, {
          ip: socket.ip,
          decodeValue,
          randKey: socket.randKey
        })
        if (socket.userId) addFailure(socket.userId)
        cb('incorrect authentication key')
        return
      }

      logger.info(`Client is authenticated`, { ip: socket.ip, userId: socket.userId })

      if (!socket.userId) {
        // register
        try {
          const { id, info } = AddUserAndGetId(
            socket.pk,
            socket.blockchainAddress,
            socket.name,
            socket.email
          )
          if (info.changes === 0) {
            throw new Error('Failed to add user to database. Might be id collision.')
          }
          socket.userId = id

          logger.info('Creating folder for user', { ip: socket.ip, userId: socket.userId })
          try {
            await mkdir(join(ConfigManager.uploadDir, id))
          } catch (error1) {
            if (error1.code !== 'EEXIST') {
              throw error1
            }
          }
          await blockchainManager.setClientStatus(socket.blockchainAddress, true)
          logger.info('User registered', {
            ip: socket.ip,
            userId: socket.userId,
            name: socket.name,
            email: socket.email,
            pk: socket.pk,
            blockchainAddress: socket.blockchainAddress
          })
        } catch (error2) {
          logger.error(error2, { ip: socket.ip, userId: socket.userId })
          if (socket.userId) deleteUserById(socket.userId)
          try {
            if (socket.userId) await rmdir(join(ConfigManager.uploadDir, socket.userId))
          } catch (error2) {
            if (error2.code !== 'ENOENT') throw error2
          }
          cb('Internal server error.')
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
