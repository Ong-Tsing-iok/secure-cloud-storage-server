import { AddUserAndGetId, deleteUserById, getUserByKey, userStatusType } from './StorageDatabase.js'
import { addFailure, getFailure, userDbLogin } from './LoginDatabase.js'
import { InvalidArgumentErrorMsg, InternalServerErrorMsg } from './Utils.js'
import {
  logInvalidSchemaWarning,
  logSocketError,
  logSocketInfo,
  logSocketWarning
} from './Logger.js'
import CryptoHandler from './CryptoHandler.js'
import { mkdir, rmdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import ConfigManager from './ConfigManager.js'
import { AuthResRequestSchema, LoginRequestSchema, RegisterRequestSchema } from './Validation.js'

const authenticationBinder = (socket, blockchainManager) => {
  // Register event
  socket.on('register', async (request, cb) => {
    try {
      const actionStr = 'Client asks to register'
      logSocketInfo(socket, actionStr + '.', request)

      const result = RegisterRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }
      const { publicKey, blockchainAddress, name, email } = result.data

      const userInfo = await getUserByKey(publicKey)
      if (userInfo) {
        socket.userId = userInfo.id
        logSocketWarning(socket, actionStr + ' but is already registered.', request)
        cb({ errorMsg: 'Already registered.' })
        return
      }

      const { message, cipher, spk } = await CryptoHandler.verifyGen(publicKey)
      socket.randKey = message
      socket.pk = publicKey
      socket.name = name
      socket.email = email
      socket.blockchainAddress = blockchainAddress
      logSocketInfo(socket, 'Asking client to respond with correct authentication key.')
      cb({ cipher, spk })
      // Wait for auth-res
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  // Login event
  socket.on('login', async (request, cb) => {
    try {
      const actionStr = 'Client asks to login'
      logSocketInfo(socket, actionStr + '.', request)

      const result = LoginRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }
      const { publicKey } = result.data

      if (socket.authed) {
        logSocketWarning(socket, actionStr + ' but is already logged in.', request)
        cb({ errorMsg: 'Already logged in.' })
        return
      }

      const userInfo = await getUserByKey(publicKey)
      if (!userInfo) {
        logSocketWarning(socket, actionStr + ' but is not registered.', request)
        cb({ errorMsg: 'Not registered.' })
        return
      }
      socket.userId = userInfo.id
      if (userInfo.status === userStatusType.stopped) {
        logSocketWarning(socket, actionStr + ' but the account is stopped.', request)
        cb({ errorMsg: 'Account is stopped.' })
        return
      }

      // Check login attempts
      const failureInfo = getFailure(userInfo.id)
      if (failureInfo && failureInfo.count >= ConfigManager.loginAttemptsLimit) {
        logSocketWarning(socket, actionStr + ' but failed too many login attempts.', {
          failedLoginAttempts: failureInfo.count,
          ...request
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
      logSocketInfo(socket, 'Asking client to respond with correct authentication key.')
      cb({ cipher, spk })
    } catch (error) {
      logSocketError(socket, error, request)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  // Authentication response event for register and login
  socket.on('auth-res', async (request, cb) => {
    try {
      const actionStr = 'Client responds to authentication'
      logSocketInfo(socket, actionStr + '.', request)

      const result = AuthResRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }
      const { decryptedValue } = result.data

      if (!socket.pk || !socket.randKey || !(socket.userId || (socket.name && socket.email))) {
        logSocketWarning(socket, actionStr + ' without asking to login or register.', request)
        cb({ errorMsg: 'Did not ask to log in or register first.' })
        return
      }

      if (socket.randKey !== decryptedValue) {
        logSocketWarning(socket, actionStr + ' with incorrect authentication key.', {
          ...request,
          randKey: socket.randKey
        })
        if (socket.userId) addFailure(socket.userId)
        cb({ errorMsg: 'Incorrect authentication key.' })
        return
      }

      if (!socket.userId && socket.pk && socket.name && socket.email && socket.blockchainAddress) {
        // register
        let folderCreated = false
        let databaseAdded = false
        try {
          const { id, info } = await AddUserAndGetId(
            socket.pk,
            socket.blockchainAddress,
            socket.name,
            socket.email
          )
          if (info.rowCount === 0) {
            throw new Error('Failed to add user to database. Might be id collision.')
          }
          socket.userId = id
          databaseAdded = true

          logSocketInfo(socket, 'Creating folder for user.')
          try {
            await mkdir(resolve(ConfigManager.uploadDir, id))
          } catch (error1) {
            if (error1.code !== 'EEXIST') {
              throw error1
            }
          }
          folderCreated = true

          await blockchainManager.setClientStatus(socket.blockchainAddress, true)

          logSocketInfo(socket, 'User registered.', {
            name: socket.name,
            email: socket.email,
            pk: socket.pk,
            blockchainAddress: socket.blockchainAddress
          })
        } catch (error2) {
          // Error when registering
          logSocketError(socket, error2, {
            name: socket.name,
            email: socket.email,
            pk: socket.pk,
            blockchainAddress: socket.blockchainAddress
          }) // Did not re-throw because need to log extra information
          // Reverting register
          if (socket.userId && databaseAdded) await deleteUserById(socket.userId)
          try {
            if (socket.userId && folderCreated)
              await rmdir(resolve(ConfigManager.uploadDir, socket.userId))
          } catch (error2) {
            if (error2.code !== 'ENOENT') throw error2
          }
          cb({ errorMsg: InternalServerErrorMsg })
          return
        }
      }

      userDbLogin(socket.id, socket.userId)
      socket.authed = true
      logSocketInfo(socket, 'Authentication key correct. Client is authenticated.')
      cb({ userInfo: { userId: socket.userId, name: socket.name, email: socket.email } })
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}

export default authenticationBinder
