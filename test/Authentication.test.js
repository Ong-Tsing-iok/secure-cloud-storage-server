import { test, expect, jest, describe, beforeEach } from '@jest/globals'
// Import the module to be tested
import authenticationBinder from '../src/Authentication.js'

// Import mocked dependencies
import {
  AddUserAndGetId,
  deleteUserById,
  getUserByKey,
  userStatusType
} from '../src/StorageDatabase.js'
import { addFailure, getFailure, userDbLogin } from '../src/LoginDatabase.js'
import { InvalidArgumentErrorMsg, InternalServerErrorMsg } from '../src/Utils.js'
import {
  logInvalidSchemaWarning,
  logSocketError,
  logSocketInfo,
  logSocketWarning
} from '../src/Logger.js'
import CryptoHandler from '../src/CryptoHandler.js'
import { mkdir, rmdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import ConfigManager from '../src/ConfigManager.js'
import {
  AuthResRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema
} from '../src/Validation.js'

// Mock all external dependencies
jest.mock('../src/StorageDatabase.js', () => ({
  AddUserAndGetId: jest.fn(),
  deleteUserById: jest.fn(),
  getUserByKey: jest.fn(),
  userStatusType: {
    active: 'active',
    stopped: 'stopped'
    // Add other relevant statuses if they exist in the actual enum
  }
}))

jest.mock('../src/LoginDatabase.js', () => ({
  addFailure: jest.fn(),
  getFailure: jest.fn(),
  userDbLogin: jest.fn()
}))

jest.mock('../src/Utils.js', () => ({
  InvalidArgumentErrorMsg: 'Invalid argument provided.',
  InternalServerErrorMsg: 'Internal server error occurred.'
}))

jest.mock('../src/Logger.js', () => ({
  logInvalidSchemaWarning: jest.fn(),
  logSocketError: jest.fn(),
  logSocketInfo: jest.fn(),
  logSocketWarning: jest.fn()
}))

jest.mock('../src/CryptoHandler.js', () => ({
  __esModule: true, // This is important for mocking default exports
  default: {
    verifyGen: jest.fn()
  }
}))

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  rmdir: jest.fn()
}))

jest.mock('node:path', () => ({
  resolve: jest.fn((...args) => args.join('/')) // Simple mock for path.resolve
}))

jest.mock('../src/ConfigManager.js', () => ({
  __esModule: true,
  default: {
    loginAttemptsLimit: 3,
    uploadDir: '/test/upload/dir'
  }
}))

jest.mock('../src/Validation.js', () => ({
  AuthResRequestSchema: {
    safeParse: jest.fn()
  },
  LoginRequestSchema: {
    safeParse: jest.fn()
  },
  RegisterRequestSchema: {
    safeParse: jest.fn()
  }
}))

describe('Authentication', () => {
  let mockSocket
  let mockBlockchainManager
  let mockCb // Callback function for socket events

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks()

    mockCb = jest.fn() // Mock the callback function passed to socket events

    // Mock socket object with an 'on' method
    mockSocket = {
      on: jest.fn((event, handler) => {
        // Store event handlers so we can trigger them later
        mockSocket.events[event] = handler
      }),
      emit: jest.fn(), // If the binder ever emits, we can test it
      events: {}, // To store registered event handlers
      id: 'socket123',
      userId: null,
      randKey: null,
      pk: null,
      name: null,
      email: null,
      blockchainAddress: null,
      authed: false
    }

    // Mock blockchainManager
    mockBlockchainManager = {
      setClientStatus: jest.fn()
    }

    // Initialize the authentication binder
    authenticationBinder(mockSocket, mockBlockchainManager)
  })

  // Helper to trigger a socket event handler
  const triggerSocketEvent = async (eventName, request, cb = mockCb) => {
    if (mockSocket.events[eventName]) {
      await mockSocket.events[eventName](request, cb)
    } else {
      throw new Error(`Event handler for '${eventName}' not found.`)
    }
  }

  describe('register event', () => {
    const validRegisterRequest = {
      publicKey: 'testPublicKey',
      blockchainAddress: 'testBlockchainAddress',
      name: 'Test User',
      email: 'test@example.com'
    }

    beforeEach(() => {
      RegisterRequestSchema.safeParse.mockReturnValue({ success: true, data: validRegisterRequest })
      CryptoHandler.verifyGen.mockResolvedValue({
        message: 'randKey123',
        cipher: 'cipherVal',
        spk: 'spkVal'
      })
      getUserByKey.mockReturnValue(null) // Assume user not found by default
    })

    test('should successfully register a new user', async () => {
      await triggerSocketEvent('register', validRegisterRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to register.',
        validRegisterRequest
      )
      expect(RegisterRequestSchema.safeParse).toHaveBeenCalledWith(validRegisterRequest)
      expect(getUserByKey).toHaveBeenCalledWith(validRegisterRequest.publicKey)
      expect(CryptoHandler.verifyGen).toHaveBeenCalledWith(validRegisterRequest.publicKey)

      expect(mockSocket.randKey).toBe('randKey123')
      expect(mockSocket.pk).toBe(validRegisterRequest.publicKey)
      expect(mockSocket.name).toBe(validRegisterRequest.name)
      expect(mockSocket.email).toBe(validRegisterRequest.email)
      expect(mockSocket.blockchainAddress).toBe(validRegisterRequest.blockchainAddress)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Asking client to respond with correct authentication key.'
      )
      expect(mockCb).toHaveBeenCalledWith({ cipher: 'cipherVal', spk: 'spkVal' })
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      RegisterRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid field' }] }
      })
      const invalidRequest = { publicKey: 123 }

      await triggerSocketEvent('register', invalidRequest)

      expect(RegisterRequestSchema.safeParse).toHaveBeenCalledWith(invalidRequest)
      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to register',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      expect(getUserByKey).not.toHaveBeenCalled()
    })

    test('should return "Already registered." if user already exists', async () => {
      const existingUser = { id: 'user123', name: 'Existing User' }
      getUserByKey.mockReturnValue(existingUser)

      await triggerSocketEvent('register', validRegisterRequest)

      expect(getUserByKey).toHaveBeenCalledWith(validRegisterRequest.publicKey)
      expect(mockSocket.userId).toBe(existingUser.id)
      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to register but is already registered.',
        validRegisterRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Already registered.' })
      expect(CryptoHandler.verifyGen).not.toHaveBeenCalled()
    })

    test('should return InternalServerErrorMsg if CryptoHandler.verifyGen fails', async () => {
      CryptoHandler.verifyGen.mockRejectedValue(new Error('Crypto error'))

      await triggerSocketEvent('register', validRegisterRequest)

      expect(CryptoHandler.verifyGen).toHaveBeenCalledWith(validRegisterRequest.publicKey)
      expect(logSocketError).toHaveBeenCalledWith(
        mockSocket,
        expect.any(Error),
        validRegisterRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })
  })

  describe('login event', () => {
    const validLoginRequest = { publicKey: 'testPublicKey' }
    const existingUser = {
      id: 'user456',
      publicKey: 'testPublicKey',
      name: 'Logged In User',
      email: 'logged@example.com',
      status: userStatusType.active
    }

    beforeEach(() => {
      LoginRequestSchema.safeParse.mockReturnValue({ success: true, data: validLoginRequest })
      getUserByKey.mockReturnValue(existingUser)
      getFailure.mockReturnValue(null) // No login failures by default
      CryptoHandler.verifyGen.mockResolvedValue({
        message: 'loginRandKey',
        cipher: 'loginCipher',
        spk: 'loginSpk'
      })
    })

    test('should successfully initiate login for an active user', async () => {
      await triggerSocketEvent('login', validLoginRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to login.',
        validLoginRequest
      )
      expect(LoginRequestSchema.safeParse).toHaveBeenCalledWith(validLoginRequest)
      expect(mockSocket.authed).toBe(false) // Ensure not already authed
      expect(getUserByKey).toHaveBeenCalledWith(validLoginRequest.publicKey)
      expect(getFailure).toHaveBeenCalledWith(existingUser.id)
      expect(CryptoHandler.verifyGen).toHaveBeenCalledWith(validLoginRequest.publicKey)

      expect(mockSocket.userId).toBe(existingUser.id)
      expect(mockSocket.randKey).toBe('loginRandKey')
      expect(mockSocket.pk).toBe(validLoginRequest.publicKey)
      expect(mockSocket.name).toBe(existingUser.name)
      expect(mockSocket.email).toBe(existingUser.email)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Asking client to respond with correct authentication key.'
      )
      expect(mockCb).toHaveBeenCalledWith({ cipher: 'loginCipher', spk: 'loginSpk' })
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      LoginRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid login field' }] }
      })
      const invalidRequest = { publicKey: 123 }

      await triggerSocketEvent('login', invalidRequest)

      expect(LoginRequestSchema.safeParse).toHaveBeenCalledWith(invalidRequest)
      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to login',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      expect(getUserByKey).not.toHaveBeenCalled()
    })

    test('should return "Already logged in." if socket is already authenticated', async () => {
      mockSocket.authed = true

      await triggerSocketEvent('login', validLoginRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to login but is already logged in.',
        validLoginRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Already logged in.' })
      expect(getUserByKey).not.toHaveBeenCalled()
    })

    test('should return "Not registered." if user does not exist', async () => {
      getUserByKey.mockReturnValue(null)

      await triggerSocketEvent('login', validLoginRequest)

      expect(getUserByKey).toHaveBeenCalledWith(validLoginRequest.publicKey)
      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to login but is not registered.',
        validLoginRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Not registered.' })
      expect(CryptoHandler.verifyGen).not.toHaveBeenCalled()
    })

    test('should return "Account is stopped." if user status is stopped', async () => {
      getUserByKey.mockReturnValue({ ...existingUser, status: userStatusType.stopped })

      await triggerSocketEvent('login', validLoginRequest)

      expect(getUserByKey).toHaveBeenCalledWith(validLoginRequest.publicKey)
      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to login but the account is stopped.',
        validLoginRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Account is stopped.' })
      expect(CryptoHandler.verifyGen).not.toHaveBeenCalled()
    })

    test('should return "Too many login attempts." if failure count exceeds limit', async () => {
      getFailure.mockReturnValue({ count: ConfigManager.loginAttemptsLimit })

      await triggerSocketEvent('login', validLoginRequest)

      expect(getFailure).toHaveBeenCalledWith(existingUser.id)
      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to login but failed too many login attempts.',
        { failedLoginAttempts: ConfigManager.loginAttemptsLimit, ...validLoginRequest }
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Too many login attempts.' })
      expect(CryptoHandler.verifyGen).not.toHaveBeenCalled()
    })

    test('should return InternalServerErrorMsg if CryptoHandler.verifyGen fails', async () => {
      CryptoHandler.verifyGen.mockRejectedValue(new Error('Login crypto error'))

      await triggerSocketEvent('login', validLoginRequest)

      expect(CryptoHandler.verifyGen).toHaveBeenCalledWith(validLoginRequest.publicKey)
      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error), validLoginRequest)
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })
  })

  describe('auth-res event', () => {
    const validAuthResRequest = { decryptedValue: 'matchedRandKey' }
    const commonSocketProps = {
      pk: 'somePk',
      randKey: 'matchedRandKey',
      name: 'Auth User',
      email: 'auth@example.com',
      blockchainAddress: 'authBlockchainAddress'
    }

    beforeEach(() => {
      AuthResRequestSchema.safeParse.mockReturnValue({ success: true, data: validAuthResRequest })
      userDbLogin.mockImplementation(() => {}) // Mock successful login DB update
    })

    test('should successfully register a new user after correct auth-res', async () => {
      // Setup socket as if it just finished 'register' flow
      mockSocket.pk = commonSocketProps.pk
      mockSocket.randKey = commonSocketProps.randKey
      mockSocket.name = commonSocketProps.name
      mockSocket.email = commonSocketProps.email
      mockSocket.blockchainAddress = commonSocketProps.blockchainAddress
      mockSocket.userId = null // Important: userId is null for registration

      AddUserAndGetId.mockReturnValue({ id: 'newUserId123', info: { changes: 1 } })
      mkdir.mockResolvedValueOnce()
      mockBlockchainManager.setClientStatus.mockResolvedValueOnce()

      await triggerSocketEvent('auth-res', validAuthResRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client responds to authentication.',
        validAuthResRequest
      )
      expect(AuthResRequestSchema.safeParse).toHaveBeenCalledWith(validAuthResRequest)
      expect(mockSocket.randKey).toBe(validAuthResRequest.decryptedValue) // Check if keys match

      // Registration specific checks
      expect(AddUserAndGetId).toHaveBeenCalledWith(
        commonSocketProps.pk,
        commonSocketProps.blockchainAddress,
        commonSocketProps.name,
        commonSocketProps.email
      )
      expect(mkdir).toHaveBeenCalledWith(`${ConfigManager.uploadDir}/${mockSocket.userId}`)
      expect(mockBlockchainManager.setClientStatus).toHaveBeenCalledWith(
        mockSocket.blockchainAddress,
        true
      )
      expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'Creating folder for user.')
      expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'User registered.', {
        name: commonSocketProps.name,
        email: commonSocketProps.email,
        pk: commonSocketProps.pk,
        blockchainAddress: commonSocketProps.blockchainAddress
      })

      // Common authentication success checks
      expect(userDbLogin).toHaveBeenCalledWith(mockSocket.id, mockSocket.userId)
      expect(mockSocket.authed).toBe(true)
      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Authentication key correct. Client is authenticated.'
      )
      expect(mockCb).toHaveBeenCalledWith({
        userInfo: {
          userId: mockSocket.userId,
          name: mockSocket.name,
          email: mockSocket.email
        }
      })
    })

    test('should successfully log in an existing user after correct auth-res', async () => {
      // Setup socket as if it just finished 'login' flow
      mockSocket.pk = commonSocketProps.pk
      mockSocket.randKey = commonSocketProps.randKey
      mockSocket.userId = 'existingUserId456' // Important: userId is set for login
      mockSocket.name = commonSocketProps.name
      mockSocket.email = commonSocketProps.email
      mockSocket.blockchainAddress = 'someOtherAddress' // Not used in login flow, but could be present

      await triggerSocketEvent('auth-res', validAuthResRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client responds to authentication.',
        validAuthResRequest
      )
      expect(AuthResRequestSchema.safeParse).toHaveBeenCalledWith(validAuthResRequest)
      expect(mockSocket.randKey).toBe(validAuthResRequest.decryptedValue) // Check if keys match

      // Ensure registration functions are NOT called
      expect(AddUserAndGetId).not.toHaveBeenCalled()
      expect(mkdir).not.toHaveBeenCalled()
      expect(mockBlockchainManager.setClientStatus).not.toHaveBeenCalled()

      // Common authentication success checks
      expect(userDbLogin).toHaveBeenCalledWith(mockSocket.id, mockSocket.userId)
      expect(mockSocket.authed).toBe(true)
      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Authentication key correct. Client is authenticated.'
      )
      expect(mockCb).toHaveBeenCalledWith({
        userInfo: {
          userId: mockSocket.userId,
          name: mockSocket.name,
          email: mockSocket.email
        }
      })
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      AuthResRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid auth-res field' }] }
      })
      const invalidRequest = { decryptedValue: 123 }

      await triggerSocketEvent('auth-res', invalidRequest)

      expect(AuthResRequestSchema.safeParse).toHaveBeenCalledWith(invalidRequest)
      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client responds to authentication',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      expect(userDbLogin).not.toHaveBeenCalled()
    })

    test('should return "Did not ask to log in or register first." if pre-auth data is missing', async () => {
      // Simulate socket state where initial register/login was not performed
      mockSocket.pk = null // Missing PK
      mockSocket.randKey = null // Missing randKey
      mockSocket.userId = null
      mockSocket.name = null
      mockSocket.email = null

      await triggerSocketEvent('auth-res', validAuthResRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client responds to authentication without asking to login or register.',
        validAuthResRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Did not ask to log in or register first.' })
      expect(userDbLogin).not.toHaveBeenCalled()
      expect(addFailure).not.toHaveBeenCalled()
    })

    test('should return "Incorrect authentication key." and add failure', async () => {
      mockSocket.pk = commonSocketProps.pk
      mockSocket.randKey = 'incorrectRandKey' // Mismatch
      mockSocket.userId = 'testUser123' // User ID exists for addFailure
      mockSocket.name = commonSocketProps.name
      mockSocket.email = commonSocketProps.email
      mockSocket.blockchainAddress = commonSocketProps.blockchainAddress

      await triggerSocketEvent('auth-res', validAuthResRequest) // decryptedValue is 'matchedRandKey'

      expect(mockSocket.randKey).not.toBe(validAuthResRequest.decryptedValue)
      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client responds to authentication with incorrect authentication key.',
        {
          ...validAuthResRequest,
          randKey: 'incorrectRandKey'
        }
      )
      expect(addFailure).toHaveBeenCalledWith(mockSocket.userId)
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Incorrect authentication key.' })
      expect(userDbLogin).not.toHaveBeenCalled()
      expect(mockSocket.authed).toBe(false)
    })

    test('should return InternalServerErrorMsg and rollback if AddUserAndGetId fails', async () => {
      // Setup for registration
      mockSocket.pk = commonSocketProps.pk
      mockSocket.randKey = commonSocketProps.randKey
      mockSocket.name = commonSocketProps.name
      mockSocket.email = commonSocketProps.email
      mockSocket.blockchainAddress = commonSocketProps.blockchainAddress
      mockSocket.userId = null // Signifies registration attempt

      AddUserAndGetId.mockReturnValue({ id: 'tempUserId', info: { changes: 0 } }) // Simulate failure to add user

      await triggerSocketEvent('auth-res', validAuthResRequest)

      expect(AddUserAndGetId).toHaveBeenCalled()
      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error), expect.any(Object)) // Checks for error logging
      expect(deleteUserById).not.toHaveBeenCalled() // Error is thrown before databaseAdded = true
      expect(rmdir).not.toHaveBeenCalled() // folderCreated is false because mkdir not called
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
      expect(userDbLogin).not.toHaveBeenCalled()
      expect(mockSocket.authed).toBe(false)
    })

    test('should return InternalServerErrorMsg and rollback if mkdir fails (not EEXIST)', async () => {
      // Setup for registration
      mockSocket.pk = commonSocketProps.pk
      mockSocket.randKey = commonSocketProps.randKey
      mockSocket.name = commonSocketProps.name
      mockSocket.email = commonSocketProps.email
      mockSocket.blockchainAddress = commonSocketProps.blockchainAddress
      mockSocket.userId = null

      const tempId = 'tempNewUserId'
      AddUserAndGetId.mockReturnValue({ id: tempId, info: { changes: 1 } })
      const mkdirError = new Error('Permission denied')
      mkdirError.code = 'EACCES'
      mkdir.mockRejectedValue(mkdirError) // Simulate mkdir failure

      await triggerSocketEvent('auth-res', validAuthResRequest)

      expect(AddUserAndGetId).toHaveBeenCalled()
      expect(mkdir).toHaveBeenCalledWith(`${ConfigManager.uploadDir}/${tempId}`)
      expect(logSocketError).toHaveBeenCalledWith(mockSocket, mkdirError, expect.any(Object))
      expect(deleteUserById).toHaveBeenCalledWith(tempId) // Rollback database
      expect(rmdir).not.toHaveBeenCalled() // rmdir shouldn't be called if mkdir failed
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
      expect(userDbLogin).not.toHaveBeenCalled()
      expect(mockSocket.authed).toBe(false)
    })

    test('should return InternalServerErrorMsg and rollback if setClientStatus fails', async () => {
      // Setup for registration
      mockSocket.pk = commonSocketProps.pk
      mockSocket.randKey = commonSocketProps.randKey
      mockSocket.name = commonSocketProps.name
      mockSocket.email = commonSocketProps.email
      mockSocket.blockchainAddress = commonSocketProps.blockchainAddress
      mockSocket.userId = null

      const tempId = 'tempNewUserId2'
      AddUserAndGetId.mockReturnValue({ id: tempId, info: { changes: 1 } })
      mkdir.mockResolvedValueOnce()
      mockBlockchainManager.setClientStatus.mockRejectedValue(new Error('Blockchain error')) // Simulate blockchain error

      await triggerSocketEvent('auth-res', validAuthResRequest)

      expect(AddUserAndGetId).toHaveBeenCalled()
      expect(mkdir).toHaveBeenCalled()
      expect(mockBlockchainManager.setClientStatus).toHaveBeenCalled()
      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error), expect.any(Object))
      expect(deleteUserById).toHaveBeenCalledWith(tempId) // Rollback database
      expect(rmdir).toHaveBeenCalledWith(`${ConfigManager.uploadDir}/${tempId}`) // Rollback folder
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
      expect(userDbLogin).not.toHaveBeenCalled()
      expect(mockSocket.authed).toBe(false)
    })

    test('should return InternalServerErrorMsg if a general error occurs in auth-res', async () => {
      // Trigger an error outside of specific registration logic
      AuthResRequestSchema.safeParse.mockImplementation(() => {
        throw new Error('Parsing error')
      })

      await triggerSocketEvent('auth-res', validAuthResRequest)

      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error))
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
      expect(userDbLogin).not.toHaveBeenCalled()
      expect(mockSocket.authed).toBe(false)
    })
  })
})
