import {
  AddUserAndGetId,
  deleteUserById,
  getUserByEmail,
  getUserByKey,
  userStatusType
} from './StorageDatabase.js'
import { addFailure, getFailure, userDbLogin } from './LoginDatabase.js'
import {
  InvalidArgumentErrorMsg,
  InternalServerErrorMsg,
  NoEmailAuthFirstErrorMsg,
  EmailAuthExpiredErrorMsg,
  EmailAuthNotMatchErrorMsg,
  EmailNotRegisteredErrorMsg,
  checkLoggedIn,
  NotLoggedInErrorMsg,
  EmailAlreadyRegisteredErrorMsg,
  ShouldNotReachErrorMsg
} from './Utils.js'
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
import {
  AuthResRequestSchema,
  EmailAuthResRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  SecretRecoverRequestSchema,
  SecretShareRequestSchema
} from './Validation.js'
import BlockchainManager from './BlockchainManager.js'
import { request } from 'node:http'
import { retrieveUserShares, storeUserShares } from './SecretShareDatabase.js'
import { sendEmailAuth } from './SMTPManager.js'

const authenticationBinder = (socket) => {
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

      const emailUserInfo = await getUserByEmail(email)
      if (emailUserInfo) {
        logSocketWarning(socket, actionStr + ' but email is already registered.', request)
        cb({ errorMsg: EmailAlreadyRegisteredErrorMsg })
        return
      }

      const { message, cipher, spk } = await CryptoHandler.verifyGen(publicKey)
      socket.randKey = message
      socket.pk = publicKey
      socket.name = name
      socket.email = email
      socket.blockchainAddress = blockchainAddress
      socket.askRegister = true
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

      if (socket.askLogin) {
        logSocketWarning(socket, actionStr + ' but already asked to logg in.', request)
        cb({ errorMsg: 'Already asked to logg in.' })
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
      socket.askLogin = true
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

      if (!socket.askLogin && !socket.askRegister) {
        logSocketWarning(socket, actionStr + ' without asking to login or register.', request)
        cb({ errorMsg: 'Did not ask to login or register first.' })
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
      logSocketInfo(socket, 'Authentication key correct. Client is authenticated.')

      if (socket.askLogin) {
        delete socket.askLogin
        userDbLogin(socket.id, socket.userId)
        socket.authed = true
        cb({ userInfo: { userId: socket.userId, name: socket.name, email: socket.email } })
        return
      } else if (socket.askRegister) {
        // Send email auth
        socket.emailAuth = await createSendEmailAuth(socket.email)
        cb({}) // Wait for email auth
        return
      }
      throw new Error(ShouldNotReachErrorMsg)
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  socket.on('secret-share', async (request, cb) => {
    try {
      const actionStr = 'Client asks to share secret'
      logSocketInfo(socket, actionStr + '.', request)

      const result = SecretShareRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }
      const { shares } = result.data

      if (!checkLoggedIn(socket)) {
        logSocketWarning(socket, actionStr + ' but is not logged in.', request)
        cb({ errorMsg: NotLoggedInErrorMsg })
        return
      }

      logSocketInfo(socket, 'Storing client secret share to databases.')
      await storeUserShares(socket.userId, shares)
      cb({})
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  socket.on('secret-recover', async (request, cb) => {
    try {
      const actionStr = 'Client asks to recover secret'
      logSocketInfo(socket, actionStr + '.', request)

      const result = SecretRecoverRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }
      const { email } = result.data

      const userInfo = await getUserByEmail(email)
      if (!userInfo) {
        logInvalidSchemaWarning(socket, actionStr + ' but the email is not registered.', request)
        cb({ errorMsg: EmailNotRegisteredErrorMsg })
        return
      }
      socket.userId = userInfo.id
      socket.emailAuth = await createSendEmailAuth(email)
      socket.email = email
      socket.askRecover = true
      socket.emailAuthStartTime = Date.now()
      cb({})
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })

  socket.on('email-auth-res', async (request, cb) => {
    try {
      const actionStr = 'Client asks to respond to email auth'
      logSocketInfo(socket, actionStr + '.', request)

      const result = EmailAuthResRequestSchema.safeParse(request)
      if (!result.success) {
        logInvalidSchemaWarning(socket, actionStr, result.error.issues, request)
        cb({ errorMsg: InvalidArgumentErrorMsg })
        return
      }
      const { emailAuth } = result.data

      if (!socket.emailAuth) {
        logSocketWarning(socket, actionStr + ' but did not ask for one first.')
        cb({ errorMsg: NoEmailAuthFirstErrorMsg })
        return
      }

      if (
        Date.now() - socket.emailAuthStartTime >
        ConfigManager.settings.emailAuthExpireTimeMin * 60 * 1000
      ) {
        cb({ errorMsg: EmailAuthExpiredErrorMsg })
        return
      }

      if (emailAuth !== socket.emailAuth) {
        logSocketWarning(socket, actionStr + ' but the response did not match.', {
          emailAuth,
          socketEmailAuth: socket.emailAuth
        })
        cb({ errorMsg: EmailAuthNotMatchErrorMsg })
        return
      }
      delete socket.emailAuth

      if (socket.askRecover) {
        delete socket.askRecover
        logSocketInfo(socket, 'Retrieving user secret shares')
        const shares = await retrieveUserShares(socket.userId)
        cb({ shares })
        return
      } else if (socket.askRegister) {
        delete socket.askRegister
        await registerProcess(socket)
        socket.authed = true
        cb({ userId: socket.userId })
        return
      }

      throw new Error(ShouldNotReachErrorMsg)
    } catch (error) {
      logSocketError(socket, error)
      cb({ errorMsg: InternalServerErrorMsg })
    }
  })
}
const authChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

async function createSendEmailAuth(email) {
  let emailAuth = ''
  for (let i = 0; i < ConfigManager.settings.emailAuthLength; i++) {
    emailAuth += authChars.charAt(Math.floor(Math.random() * authChars.length))
  }
  await sendEmailAuth(email, emailAuth)

  return emailAuth
}

async function registerProcess(socket) {
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

    await BlockchainManager.setClientStatus(socket.blockchainAddress, true)

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
    } catch (error3) {
      if (error3.code !== 'ENOENT') throw error3
    }
  }
}

export default authenticationBinder
