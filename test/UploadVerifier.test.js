import { test, expect, jest, describe, beforeEach, beforeAll, fail } from '@jest/globals'
// Mock external dependencies
jest.mock('../src/BlockchainManager.js', () => ({
  bigIntToUuid: jest.fn()
}))

// Custom mock for EvictingMap to control onExpired event
let mockOnExpiredHandler = null // To capture the handler
let mockEvictingMapInstance // To store the instance created by new EvictingMap()

// jest.mock('../src/EvictingMap.js', () => {
//   const EvictingMapMock = jest.fn(function (ttl) {
//     this.ttl = ttl
//     this.map = new Map() // Internal map for tracking
//     this.onExpired = jest.fn((handler) => {
//       mockOnExpiredHandler = handler // Capture the handler
//     })
//     this.set = jest.fn((key, value) => this.map.set(key, value))
//     this.has = jest.fn((key) => this.map.has(key))
//     this.get = jest.fn((key) => this.map.get(key))
//     this.delete = jest.fn((key) => this.map.delete(key))
//     mockEvictingMapInstance = this // Store the instance immediately upon construction
//   })
//   return EvictingMapMock
// })

jest.mock('../src/Logger.js', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}))

jest.mock('../src/LoginDatabase.js', () => ({
  getSocketId: jest.fn()
}))

jest.mock('../src/SocketIO.js', () => ({
  blockchainManager: {
    bindEventListener: jest.fn(),
    setFileVerification: jest.fn()
  },
  emitToSocket: jest.fn()
}))

jest.mock('../src/StorageDatabase.js', () => ({
  addFileToDatabase: jest.fn()
}))

jest.mock('../src/Utils.js', () => ({
  calculateFileHash: jest.fn(),
  getFilePath: jest.fn((userId, fileId) => `/uploads/${userId}/${fileId}`),
  InternalServerErrorMsg: 'Internal server error occurred.',
  revertUpload: jest.fn()
}))

// Import the module to be tested. This import will run the module-level code,
// including the `new EvictingMap()` and `blockchainManager.bindEventListener()` calls.
// import { finishUpload } from '../src/UploadVerifier.js'

// Import mocked dependencies for easier access and assertion
import { bigIntToUuid } from '../src/BlockchainManager.js'
import EvictingMap from '../src/EvictingMap.js' // This will be our mock EvictingMap
import { logger } from '../src/Logger.js'
import { getSocketId } from '../src/LoginDatabase.js'
import { blockchainManager, emitToSocket } from '../src/SocketIO.js'
import { addFileToDatabase } from '../src/StorageDatabase.js'
import {
  calculateFileHash,
  getFilePath,
  InternalServerErrorMsg,
  revertUpload
} from '../src/Utils.js'

describe('UploadVerifier', () => {
  let fileUploadedEventListener // To capture the blockchain event listener
  let finishUpload

  const mockUploadInfo = {
    name: 'test.txt',
    id: 'f11499c2-481b-4deb-9539-e9c564e5965d', // A more UUID-like string
    userId: 'userABC',
    originOwnerId: 'ownerXYZ',
    cipher: 'mockCipher',
    spk: 'mockSpk',
    parentFolderId: 'folder789',
    size: 1000
  }
  // Hashes should be valid numeric strings for BigInt conversion (e.g., hex strings)
  const mockCalculatedHash = '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d'
  const mockMismatchHash = '0xdeadbeefdeadbeefdeadbeefdeadbeef'
  const mockUploaderAddress = '0x987654321'

  // Helper to convert a UUID string to a BigInt (simulation)
  // In a real scenario, bigIntToUuid would likely do the reverse.
  // We need a BigInt that when passed to bigIntToUuid, returns mockUploadInfo.id
  const uuidToBigIntMock = (uuidString) => {
    // This is a simplified mock. In reality, UUIDs are complex to convert to BigInts directly.
    // For testing, we'll map a specific BigInt back to our UUID string.
    // For the actual BigInt value, we can use a fixed BigInt and map it.
    if (uuidString === mockUploadInfo.id) {
      return BigInt('0x' + uuidString.replace(/-/g, '')) // Simplified hex conversion for testing
    }
    return BigInt(0) // Default or throw error for unknown UUIDs
  }

  const mockBlockchainFileIdBigInt = BigInt('0x' + mockUploadInfo.id.replace(/-/g, ''))
  const mockUploaderAddressBigInt = BigInt(mockUploaderAddress)

  beforeAll(() => {
    jest.doMock('../src/EvictingMap.js', () => {
      const EvictingMapMock = jest.fn(function (ttl) {
        this.ttl = ttl
        this.map = new Map() // Internal map for tracking
        this.onExpired = jest.fn((handler) => {
          mockOnExpiredHandler = handler // Capture the handler
        })
        this.set = jest.fn((key, value) => this.map.set(key, value))
        this.has = jest.fn((key) => this.map.has(key))
        this.get = jest.fn((key) => this.map.get(key))
        this.delete = jest.fn((key) => this.map.delete(key))
        mockEvictingMapInstance = this // Store the instance immediately upon construction
      })
      return EvictingMapMock
    })
    ;({ finishUpload } = require('../src/UploadVerifier.js'))

    // Capture the blockchainManager.bindEventListener handler when the module loads
    // It should be called once with 'FileUploaded' and the async function handler
    expect(blockchainManager.bindEventListener).toHaveBeenCalledTimes(1)
    expect(blockchainManager.bindEventListener).toHaveBeenCalledWith(
      'FileUploaded',
      expect.any(Function)
    )
    fileUploadedEventListener = blockchainManager.bindEventListener.mock.calls[0][1]
  })

  beforeEach(() => {
    // Clear mocks before each test. Jest will clear all `jest.fn()` calls,
    // including those on `mockEvictingMapInstance`'s methods.
    jest.clearAllMocks()

    // Default mock behaviors
    calculateFileHash.mockResolvedValue(mockCalculatedHash)
    // bigIntToUuid should convert the BigInt file ID from blockchain to our UUID string
    bigIntToUuid.mockImplementation((bigIntFileId) => {
      // If the bigIntFileId matches our expected mock, return the UUID string
      if (bigIntFileId.toString() === mockBlockchainFileIdBigInt.toString()) {
        return mockUploadInfo.id
      }
      return bigIntFileId.toString() // Fallback for other BigInts
    })
    getSocketId.mockReturnValue({ socketId: 'userSocketId' })
  })

  describe('finishUpload', () => {
    test('should calculate hash, set uploadInfoMap, and log info on success', async () => {
      await finishUpload(mockUploadInfo)

      expect(getFilePath).toHaveBeenCalledWith(mockUploadInfo.userId, mockUploadInfo.id)
      expect(calculateFileHash).toHaveBeenCalledWith(
        `/uploads/${mockUploadInfo.userId}/${mockUploadInfo.id}`
      )
      expect(mockEvictingMapInstance.set).toHaveBeenCalledWith(mockUploadInfo.id, {
        uploadInfo: mockUploadInfo,
        hash: mockCalculatedHash
      })
      expect(logger.info).toHaveBeenCalledWith('upload info map set.', {
        fileId: mockUploadInfo.id,
        hash: mockCalculatedHash
      })
      expect(logger.error).not.toHaveBeenCalled()
    })

    test('should set uploadInfoMap with null hash and log error on hash calculation failure', async () => {
      const hashError = new Error('Hash calculation failed')
      calculateFileHash.mockRejectedValue(hashError)

      await finishUpload(mockUploadInfo)

      expect(getFilePath).toHaveBeenCalledWith(mockUploadInfo.userId, mockUploadInfo.id)
      expect(calculateFileHash).toHaveBeenCalledWith(
        `/uploads/${mockUploadInfo.userId}/${mockUploadInfo.id}`
      )
      expect(mockEvictingMapInstance.set).toHaveBeenCalledWith(mockUploadInfo.id, {
        uploadInfo: mockUploadInfo,
        hash: null
      })
      expect(logger.error).toHaveBeenCalledWith(hashError)
      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('uploadInfoMap.onExpired', () => {
    test('should call revertUpload when an item expires', () => {
      const expiredKey = 'expiredFileId'
      const expiredValue = {
        uploadInfo: { userId: 'expiredUser', id: expiredKey },
        hash: 'expiredHash'
      }

      // Manually trigger the captured onExpired handler
      if (mockOnExpiredHandler) {
        mockOnExpiredHandler(expiredKey, expiredValue)
      } else {
        fail('onExpired handler was not bound or captured')
      }

      expect(revertUpload).toHaveBeenCalledWith(
        expiredValue.uploadInfo.userId,
        expiredKey,
        'Did not get blockchain info in time.'
      )
    })
  })

  describe('blockchainManager.bindEventListener("FileUploaded")', () => {
    // This listener is already captured in beforeAll

    test('should verify file, add to DB, and emit success for matching hashes', async () => {
      // Set up EvictingMap mock to simulate finding uploadInfo
      mockEvictingMapInstance.has.mockReturnValue(true)
      mockEvictingMapInstance.get.mockReturnValue({
        uploadInfo: mockUploadInfo,
        hash: mockCalculatedHash // Hash from file matches blockchain hash
      })

      await fileUploadedEventListener(
        mockBlockchainFileIdBigInt, // fileId from blockchain event (BigInt representation of mockCalculatedHash)
        mockUploaderAddressBigInt,
        BigInt(mockCalculatedHash), // fileHash from blockchain event
        'metadata',
        'timestamp'
      )

      expect(bigIntToUuid).toHaveBeenCalledWith(mockBlockchainFileIdBigInt)
      expect(logger.debug).toHaveBeenCalledWith(
        'Contract event FileUploaded emitted',
        expect.any(Object)
      )
      expect(mockEvictingMapInstance.has).toHaveBeenCalledWith(mockUploadInfo.id) // fileId from event
      expect(mockEvictingMapInstance.get).toHaveBeenCalledWith(mockUploadInfo.id)
      expect(mockEvictingMapInstance.delete).toHaveBeenCalledWith(mockUploadInfo.id)
      expect(getSocketId).toHaveBeenCalledWith(mockUploadInfo.userId)
      // Now, the comparison should be BigInt('0x...') == BigInt('0x...'), which will be true
      expect(BigInt(mockEvictingMapInstance.get(mockUploadInfo.id).hash)).toEqual(
        BigInt(mockCalculatedHash)
      )
      expect(addFileToDatabase).toHaveBeenCalledWith(mockUploadInfo)
      expect(blockchainManager.setFileVerification).toHaveBeenCalledWith(
        mockUploadInfo.id, // fileId (uuid)
        mockUploaderAddressBigInt,
        'success'
      )
      expect(emitToSocket).toHaveBeenCalledWith('userSocketId', 'upload-file-res', {
        fileId: mockUploadInfo.id
      })
      expect(logger.info).toHaveBeenCalledWith('File uploaded and verified.', {
        fileId: mockUploadInfo.id,
        userId: mockUploadInfo.userId
      })
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
      expect(revertUpload).not.toHaveBeenCalled()
    })

    test('should log warning, set verification to fail, and revert for hash mismatch', async () => {
      mockEvictingMapInstance.has.mockReturnValue(true)
      mockEvictingMapInstance.get.mockReturnValue({
        uploadInfo: mockUploadInfo,
        hash: mockCalculatedHash // This hash will NOT match blockchainHash
      })

      await fileUploadedEventListener(
        mockBlockchainFileIdBigInt, // fileId from blockchain event
        mockUploaderAddressBigInt,
        BigInt(mockMismatchHash), // Mismatched blockchain hash
        'metadata',
        'timestamp'
      )

      // Comparison will be BigInt(mockCalculatedHash) == BigInt(mockMismatchHash) -> false
      expect(BigInt(mockEvictingMapInstance.get(mockUploadInfo.id).hash)).not.toEqual(
        BigInt(mockMismatchHash)
      )
      expect(logger.warn).toHaveBeenCalledWith('File hashes do not meet', {
        fileHash: mockCalculatedHash,
        blockchainHash: '0x' + BigInt(mockMismatchHash).toString(16), // Convert BigInt back to string for comparison in log
        fileId: mockUploadInfo.id,
        userId: mockUploadInfo.userId
      })
      expect(blockchainManager.setFileVerification).toHaveBeenCalledWith(
        mockUploadInfo.id,
        mockUploaderAddressBigInt,
        'fail'
      )
      expect(revertUpload).toHaveBeenCalledWith(
        mockUploadInfo.userId,
        mockUploadInfo.id,
        'File hashes do not meet.'
      )
      expect(addFileToDatabase).not.toHaveBeenCalled()
      expect(emitToSocket).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    test('should log warning if no matching upload info found in map', async () => {
      mockEvictingMapInstance.has.mockReturnValue(false)

      await fileUploadedEventListener(
        mockBlockchainFileIdBigInt,
        mockUploaderAddressBigInt,
        BigInt(mockCalculatedHash),
        'metadata',
        'timestamp'
      )

      expect(bigIntToUuid).toHaveBeenCalledWith(mockBlockchainFileIdBigInt) // bigIntToUuid is called first
      expect(mockEvictingMapInstance.has).toHaveBeenCalledWith(mockUploadInfo.id) // check for the converted UUID
      expect(mockEvictingMapInstance.get).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        `Blockchain upload event did not find matching upload info.`,
        {
          fileId: mockUploadInfo.id, // Now it correctly shows the converted UUID
          userId: undefined // userId will be undefined as no matching uploadInfo was retrieved
        }
      )
      expect(revertUpload).not.toHaveBeenCalled()
      expect(addFileToDatabase).not.toHaveBeenCalled()
      expect(blockchainManager.setFileVerification).not.toHaveBeenCalled()
      expect(emitToSocket).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    test('should log error and revert upload on unexpected error during event handling', async () => {
      mockEvictingMapInstance.has.mockReturnValue(true)
      mockEvictingMapInstance.get.mockReturnValue({
        uploadInfo: mockUploadInfo,
        hash: mockCalculatedHash // This hash will NOT match blockchainHash
      })

      // Simulate an error within the event listener (e.g., addFileToDatabase fails)
      addFileToDatabase.mockImplementationOnce(async () => {
        throw new Error('Database error')
      })

      await fileUploadedEventListener(
        mockBlockchainFileIdBigInt,
        mockUploaderAddressBigInt,
        BigInt(mockCalculatedHash),
        'metadata',
        'timestamp'
      )

      expect(logger.error).toHaveBeenCalledWith(expect.any(Error), {
        fileId: expect.any(String), // fileId will be whatever bigIntToUuid returns before it throws, or the default string
        uploader: mockUploaderAddress // userId might not be set in time depending on where error occurs
      })
      expect(revertUpload).toHaveBeenCalledWith(
        mockUploadInfo.userId,
        expect.any(String),
        InternalServerErrorMsg
      ) // userId will be undefined if error before value.uploadInfo.userId is set
      // expect(addFileToDatabase).not.toHaveBeenCalled()
      expect(blockchainManager.setFileVerification).not.toHaveBeenCalled()
      expect(emitToSocket).not.toHaveBeenCalled()
    })

    test('should handle error when userId is available for revertUpload', async () => {
      // Simulate a scenario where userId is set before an error occurs
      mockEvictingMapInstance.has.mockReturnValue(true)
      mockEvictingMapInstance.get.mockReturnValue({
        uploadInfo: mockUploadInfo, // userId is available here
        hash: mockCalculatedHash
      })
      blockchainManager.setFileVerification.mockRejectedValueOnce(
        new Error('Blockchain set verification failed')
      ) // Simulate error after userId is known

      await fileUploadedEventListener(
        mockBlockchainFileIdBigInt,
        mockUploaderAddressBigInt,
        BigInt(mockCalculatedHash),
        'metadata',
        'timestamp'
      )

      expect(logger.error).toHaveBeenCalledWith(expect.any(Error), {
        fileId: mockUploadInfo.id, // fileId should be correctly passed
        uploader: mockUploaderAddress // userId should now be correctly passed to logger
      })
      expect(revertUpload).toHaveBeenCalledWith(
        mockUploadInfo.userId,
        mockUploadInfo.id,
        InternalServerErrorMsg
      )
    })

    test('should not emit to socket if getSocketId returns null', async () => {
      // Set up EvictingMap mock to simulate finding uploadInfo
      mockEvictingMapInstance.has.mockReturnValue(true)
      mockEvictingMapInstance.get.mockReturnValue({
        uploadInfo: mockUploadInfo,
        hash: mockCalculatedHash // Hash from file matches blockchain hash
      })

      // All other conditions are met (due to inner beforeEach)
      // Only getSocketId is explicitly set to null for this test
      getSocketId.mockReturnValue(null)

      await fileUploadedEventListener(
        mockBlockchainFileIdBigInt,
        'blockchainUploader',
        BigInt(mockCalculatedHash),
        'metadata',
        'timestamp'
      )

      expect(getSocketId).toHaveBeenCalledWith(mockUploadInfo.userId)
      expect(emitToSocket).not.toHaveBeenCalled() // This is the core assertion for this test
      expect(logger.info).toHaveBeenCalledWith('File uploaded and verified.', {
        // logger.info should still be called
        fileId: mockUploadInfo.id,
        userId: mockUploadInfo.userId
      })
    })
  })
})
