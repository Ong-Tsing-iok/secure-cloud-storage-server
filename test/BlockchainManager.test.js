import { test, expect, jest, describe, beforeEach, beforeAll } from '@jest/globals'
// Mock external dependencies
const mockTxWait = jest.fn().mockResolvedValue({ status: 1 }) // Simulate successful transaction
const mockContractInstance = {
  on: jest.fn(),
  setClientStatus: jest.fn(() => ({ wait: mockTxWait })),
  setFileVerification: jest.fn(() => ({ wait: mockTxWait })),
  addAuthorization: jest.fn(() => ({ wait: mockTxWait })),
  reencryptFile: jest.fn(() => ({ wait: mockTxWait })),
  queryFilter: jest.fn(),
  filters: {
    // Mock contract filters for queryFilter
    FileUploaded: jest.fn((fileId, ownerAddr) => ({ fileId, ownerAddr }))
  }
}

const mockWalletAddress = '0xMockWalletAddress'
const mockWalletPrivateKey = '0xmockprivatekey'
const mockFileId = 'f029755a-e19c-4a21-b856-59bb84f2afb2'
const mockBigIntFileId = BigInt('0xf029755ae19c4a21b85659bb84f2afb2')

const mockWalletInstance = {
  address: mockWalletAddress,
  privateKey: mockWalletPrivateKey
}

jest.mock('ethers', () => {
  const originalEthers = jest.requireActual('ethers') // Get actual ethers for utility classes if needed

  // Define the mock Wallet constructor behavior
  const MockWalletConstructor = jest.fn(function (key, provider) {
    this.address = '0xMockWalletAddressFromKey'
    this.privateKey = key
    this.provider = provider
    if (key === mockWalletPrivateKey) {
      // If it's our mocked valid key
      this.address = mockWalletAddress
    }
    return this
  })

  // Assign the static createRandom method to the mocked Wallet constructor
  MockWalletConstructor.createRandom = jest.fn(() => mockWalletInstance)

  return {
    // Mock the classes directly
    Contract: jest.fn(() => mockContractInstance),
    JsonRpcProvider: jest.fn(function () {
      this.send = jest.fn() // Mock send for provider if ever called directly
    }),
    Wallet: MockWalletConstructor, // Use the consolidated mock Wallet
    // Expose original BigInt for direct use if necessary, or just use global BigInt
    // Or just make sure to use global BigInt() constructor where needed.
    BigNumber: originalEthers.BigNumber // Keep BigNumber for compatibility if used
  }
})

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}))

jest.mock('../src/ConfigManager.js', () => ({
  __esModule: true,
  default: {
    blockchain: {
      abi: ['mockAbi'],
      jsonRpcUrl: 'http://mock-rpc-url.com',
      contractAddr: '0xMockContractAddress',
      walletKeyPath: '/test/wallet.key'
    }
  }
}))

jest.mock('../src/Logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}))

// Import the module under test (this will trigger the BlockchainManager constructor)
import BlockchainManager, { bigIntToUuid } from '../src/BlockchainManager.js'

// Import mocked dependencies for easier access and assertions
import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { readFileSync, writeFileSync } from 'fs'
import ConfigManager from '../src/ConfigManager.js'
import { logger } from '../src/Logger.js'

describe('UUID Conversion Functions', () => {
  describe('uuidToBigInt', () => {
    // Dynamically import the function here to ensure it's from the actual module
    let uuidToBigInt
    beforeAll(() => {
      // Assuming uuidToBigInt is also exported from BlockchainManager.js
      // If it's not exported, you might need to use a more advanced mocking setup
      // or directly test it by importing the module with `require` and accessing its internal functions.
      // For now, assuming it's exported for testability.
      // Or, as it's not exported, we test it directly from the imported module under test.
      // It's defined in the same file, so no separate import needed, we can test it directly.
      // For this particular setup, `uuidToBigInt` is not exported, so it's only called internally
      // by the BlockchainManager class. I'll define a local helper here for direct testing.
      // In a real scenario, this helper would ideally be imported if it was exported.

      // Define a local helper that mirrors the uuidToBigInt logic for isolated testing
      const { uuidToBigInt: actualUuidToBigInt } = jest.requireActual('../src/BlockchainManager.js')
      uuidToBigInt = actualUuidToBigInt
    })

    test('should convert a valid UUID string to BigInt', () => {
      const uuid = '12345678-abcd-ef01-2345-6789abcdef01'
      const expectedBigInt = BigInt('0x12345678abcdef0123456789abcdef01')
      expect(uuidToBigInt(uuid)).toEqual(expectedBigInt)
    })

    test('should throw an error for an invalid UUID format', () => {
      const invalidUuid = 'invalid-uuid-string'
      expect(() => uuidToBigInt(invalidUuid)).toThrow(
        'Invalid UUID string format: invalid-uuid-string'
      )
    })

    test('should handle UUIDs with uppercase letters', () => {
      const uuid = 'ABCDEF12-abcd-EF01-2345-6789ABCDEF01'
      const expectedBigInt = BigInt('0xABCDEF12abcdef0123456789ABCDEF01')
      expect(uuidToBigInt(uuid)).toEqual(expectedBigInt)
    })
  })

  describe('bigIntToUuid', () => {
    test('should convert a BigInt to a valid UUID string', () => {
      const bigInt = BigInt('0x12345678abcdef0123456789abcdef01')
      const expectedUuid = '12345678-abcd-ef01-2345-6789abcdef01'
      expect(bigIntToUuid(bigInt)).toEqual(expectedUuid)
    })

    test('should handle BigInts with leading zeros correctly', () => {
      const bigInt = BigInt('0x00000000000000000000000000000001')
      const expectedUuid = '00000000-0000-0000-0000-000000000001'
      expect(bigIntToUuid(bigInt)).toEqual(expectedUuid)
    })

    test('should throw an error for a negative BigInt', () => {
      const negativeBigInt = -1n
      expect(() => bigIntToUuid(negativeBigInt)).toThrow(
        'BigInt -1 is out of the valid range for a 128-bit UUID.'
      )
    })

    test('should throw an error for a BigInt too large for 128 bits', () => {
      const tooLargeBigInt = 1n << 128n // 2^128
      expect(() => bigIntToUuid(tooLargeBigInt)).toThrow(
        'BigInt 340282366920938463463374607431768211456 is out of the valid range for a 128-bit UUID.'
      )
    })
  })
})

describe('BlockchainManager', () => {
  let blockchainManager

  beforeEach(() => {
    jest.clearAllMocks() // Clear mocks before each test
    // Reset the `ethers` mocks' internal states if they were modified
    Contract.mockClear()
    JsonRpcProvider.mockClear()
    Wallet.mockClear() // Now Wallet is a single mock, clear it directly
    mockContractInstance.on.mockClear()
    mockContractInstance.setClientStatus
      .mockClear()
      .mockImplementation(() => ({ wait: mockTxWait }))
    mockContractInstance.setFileVerification
      .mockClear()
      .mockImplementation(() => ({ wait: mockTxWait }))
    mockContractInstance.addAuthorization
      .mockClear()
      .mockImplementation(() => ({ wait: mockTxWait }))
    mockContractInstance.reencryptFile.mockClear().mockImplementation(() => ({ wait: mockTxWait }))
    mockContractInstance.queryFilter.mockClear()
    mockContractInstance.filters.FileUploaded.mockClear()
    mockTxWait.mockClear().mockResolvedValue({ status: 1 }) // Reset tx.wait for each test

    // Default mock behavior for fs.readFileSync
    readFileSync.mockReturnValue(mockWalletPrivateKey) // Simulate existing key by default
    writeFileSync.mockReturnValue(undefined)
  })

  // Test the constructor separately as it runs on module import
  describe('Constructor', () => {
    test('should initialize contract and log info on success (existing wallet)', () => {
      // Ensure the BlockchainManager is instantiated for this specific test
      // and then clear mocks to only check this constructor's specific calls.
      const manager = new BlockchainManager()

      expect(readFileSync).toHaveBeenCalledWith(ConfigManager.blockchain.walletKeyPath, 'utf-8')
      expect(Wallet).toHaveBeenCalledWith(mockWalletPrivateKey, expect.any(JsonRpcProvider))
      expect(JsonRpcProvider).toHaveBeenCalledWith(ConfigManager.blockchain.jsonRpcUrl)
      expect(Contract).toHaveBeenCalledWith(
        ConfigManager.blockchain.contractAddr,
        ConfigManager.blockchain.abi,
        expect.any(Wallet) // Wallet instance from constructor
      )
      expect(logger.info).toHaveBeenCalledWith(
        `Blockchain Manager initialized with wallet address: ${mockWalletAddress}.`
      )
      expect(logger.error).not.toHaveBeenCalled()
      expect(manager.contract).toBe(mockContractInstance)
    })

    test('should create and store new wallet if key file not found', () => {
      readFileSync.mockImplementation(() => {
        const error = new Error('File not found')
        error.code = 'ENOENT'
        throw error
      })

      const manager = new BlockchainManager()

      expect(readFileSync).toHaveBeenCalledWith(ConfigManager.blockchain.walletKeyPath, 'utf-8')
      expect(Wallet.createRandom).toHaveBeenCalledWith(expect.any(JsonRpcProvider))
      expect(writeFileSync).toHaveBeenCalledWith(
        ConfigManager.blockchain.walletKeyPath,
        mockWalletPrivateKey
      )
      expect(logger.info).toHaveBeenCalledWith(
        `Blockchain Manager initialized with wallet address: ${mockWalletAddress}.`
      )
      expect(logger.error).not.toHaveBeenCalled()
      expect(manager.contract).toBe(mockContractInstance)
    })

    test('should log error if initialization fails (other fs error)', () => {
      readFileSync.mockImplementationOnce(() => {
        throw new Error('Permission denied')
      })

      new BlockchainManager() // Instantiate to trigger the constructor error

      expect(logger.error).toHaveBeenCalledWith(expect.any(Error))
      expect(logger.info).not.toHaveBeenCalled()
      expect(Contract).not.toHaveBeenCalled() // Contract should not be initialized on error
    })
  })

  describe('BlockchainManager methods', () => {
    beforeEach(() => {
      // Re-initialize BlockchainManager for each test in this block
      // This ensures a clean contract instance and wallet for each method test.
      // We assume successful constructor here.
      blockchainManager = new BlockchainManager()
      // Clear mocks again to only count calls within the method being tested
      jest.clearAllMocks()
      mockContractInstance.setClientStatus.mockImplementation(() => ({ wait: mockTxWait }))
      mockContractInstance.setFileVerification.mockImplementation(() => ({ wait: mockTxWait }))
      mockContractInstance.addAuthorization.mockImplementation(() => ({ wait: mockTxWait }))
      mockContractInstance.reencryptFile.mockImplementation(() => ({ wait: mockTxWait }))
      mockTxWait.mockResolvedValue({ status: 1 }) // Reset tx.wait for each test
    })

    test('bindEventListener should call contract.on', () => {
      const listener = jest.fn()
      blockchainManager.bindEventListener('MyEvent', listener)
      expect(mockContractInstance.on).toHaveBeenCalledWith('MyEvent', listener)
    })

    test('setClientStatus should call contract.setClientStatus and wait for tx', async () => {
      const clientAddr = '0xClientAddress'
      const status = true
      await blockchainManager.setClientStatus(clientAddr, status)

      expect(mockContractInstance.setClientStatus).toHaveBeenCalledWith(clientAddr, status)
      expect(mockTxWait).toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(`set client ${clientAddr} status to ${status}`)
    })

    test('setClientStatus should throw error if contract call fails', async () => {
      const clientAddr = '0xClientAddress'
      const status = true
      const error = new Error('Contract call failed')
      mockContractInstance.setClientStatus.mockImplementation(() => {
        throw error
      })

      await expect(blockchainManager.setClientStatus(clientAddr, status)).rejects.toThrow(error)
      expect(logger.info).not.toHaveBeenCalled()
    })

    test('setFileVerification should call contract.setFileVerification with converted fileId and wait for tx', async () => {
      const fileOwnerAddr = '0xOwnerAddress'
      const verificationInfo = 'success'

      await blockchainManager.setFileVerification(mockFileId, fileOwnerAddr, verificationInfo)

      expect(mockContractInstance.setFileVerification).toHaveBeenCalledWith(
        mockBigIntFileId,
        fileOwnerAddr,
        verificationInfo
      )
      expect(mockTxWait).toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(`set verification for ${mockFileId}`)
    })

    test('setFileVerification should throw error if contract call fails', async () => {
      const fileOwnerAddr = '0xOwnerAddress'
      const verificationInfo = 'success'
      const error = new Error('Verification failed')
      mockContractInstance.setFileVerification.mockImplementation(() => {
        throw error
      })

      await expect(
        blockchainManager.setFileVerification(mockFileId, fileOwnerAddr, verificationInfo)
      ).rejects.toThrow(error)
      expect(logger.info).not.toHaveBeenCalled()
    })

    test('addAuthRecord should call contract.addAuthorization with converted fileId and wait for tx', async () => {
      const requestorAddr = '0xRequestor'
      const authorizerAddr = '0xAuthorizer'
      const authInfo = 'agreed'

      await blockchainManager.addAuthRecord(mockFileId, requestorAddr, authorizerAddr, authInfo)

      expect(mockContractInstance.addAuthorization).toHaveBeenCalledWith(
        mockBigIntFileId,
        requestorAddr,
        authorizerAddr,
        authInfo
      )
      expect(mockTxWait).toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(`added authorization record for file ${mockFileId}`)
    })

    test('addAuthRecord should throw error if contract call fails', async () => {
      const error = new Error('Auth record failed')
      mockContractInstance.addAuthorization.mockImplementation(() => {
        throw error
      })

      await expect(
        blockchainManager.addAuthRecord(mockFileId, '0xR', '0xA', 'agreed')
      ).rejects.toThrow(error)
      expect(logger.info).not.toHaveBeenCalled()
    })

    test('reencryptFile should call contract.reencryptFile with converted inputs and wait for tx', async () => {
      const fileHash = '0xabcdef0123456789'
      const metadata = '{"filename":"new.txt"}'
      const requestorAddr = '0xReq'
      const authorizerAddr = '0xAuth'

      await blockchainManager.reencryptFile(
        mockFileId,
        fileHash,
        metadata,
        requestorAddr,
        authorizerAddr
      )

      expect(mockContractInstance.reencryptFile).toHaveBeenCalledWith(
        mockBigIntFileId,
        BigInt(fileHash),
        metadata,
        requestorAddr,
        authorizerAddr,
        'success',
        'agreed'
      )
      expect(mockTxWait).toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        `Uploaded, verified and added record for reencrypted file ${mockFileId}.`
      )
    })

    test('reencryptFile should use default verificationInfo and authInfo if not provided', async () => {
      const fileHash = '0xabcdef0123456789'
      const metadata = '{"filename":"new.txt"}'
      const requestorAddr = '0xReq'
      const authorizerAddr = '0xAuth'

      await blockchainManager.reencryptFile(
        mockFileId,
        fileHash,
        metadata,
        requestorAddr,
        authorizerAddr
      )

      expect(mockContractInstance.reencryptFile).toHaveBeenCalledWith(
        mockBigIntFileId,
        BigInt(fileHash),
        metadata,
        requestorAddr,
        authorizerAddr,
        'success', // Default
        'agreed' // Default
      )
    })

    test('reencryptFile should use provided verificationInfo and authInfo if provided', async () => {
      const fileHash = '0xabcdef0123456789'
      const metadata = '{"filename":"new.txt"}'
      const requestorAddr = '0xReq'
      const authorizerAddr = '0xAuth'
      const customVerification = 'pending'
      const customAuth = 'disputed'

      await blockchainManager.reencryptFile(
        mockFileId,
        fileHash,
        metadata,
        requestorAddr,
        authorizerAddr,
        customVerification,
        customAuth
      )

      expect(mockContractInstance.reencryptFile).toHaveBeenCalledWith(
        mockBigIntFileId,
        BigInt(fileHash),
        metadata,
        requestorAddr,
        authorizerAddr,
        customVerification, // Custom
        customAuth // Custom
      )
    })

    test('reencryptFile should throw error if contract call fails', async () => {
      const error = new Error('Reencrypt failed')
      mockContractInstance.reencryptFile.mockImplementation(() => {
        throw error
      })

      await expect(
        blockchainManager.reencryptFile(mockFileId, '0x0', '{}', '0xR', '0xA')
      ).rejects.toThrow(error)
      expect(logger.info).not.toHaveBeenCalled()
    })

    describe('getFileInfo', () => {
      // Mocked UUIDs should match the pattern used in uuidToBigInt in the actual code
      // and bigIntToUuid in the actual code for consistency.
      const fileOwnerAddr = '0xOwnerAddressForQuery'
      // Expected BigInt from uuidToBigInt(fileId)

      // Helper to generate a BigInt that `bigIntToUuid` can convert back to a specific UUID format
      // This is crucial because `bigIntToUuid` has validation.
      const generateBigIntForUuid = (uuidString) => {
        // Strip hyphens and convert to BigInt
        return BigInt('0x' + uuidString.replace(/-/g, ''))
      }

      test('should return null if no FileUploaded events are found', async () => {
        mockContractInstance.queryFilter.mockResolvedValue([]) // No events
        const result = await blockchainManager.getFileInfo(mockFileId, fileOwnerAddr)

        expect(mockContractInstance.filters.FileUploaded).toHaveBeenCalledWith(
          mockBigIntFileId,
          fileOwnerAddr
        )
        expect(mockContractInstance.queryFilter).toHaveBeenCalledWith(
          mockContractInstance.filters.FileUploaded(mockBigIntFileId, fileOwnerAddr)
        )
        expect(logger.info).toHaveBeenCalledWith(`retrived fileInfo for fileId ${mockFileId}`)
        expect(result).toBeNull()
      })

      test('should return latest event arguments if FileUploaded events are found', async () => {
        const mockBlockchainFileIdBigInt = generateBigIntForUuid(mockFileId)
        const mockCalculatedHash = '0x1234567890abcdef1234567890abcdef' // Example hash

        const mockEvents = [
          {
            args: {
              fileId: generateBigIntForUuid('00000000-0000-0000-0000-000000000001'),
              fileOwner: '0x1',
              fileHash: BigInt('0x11'),
              metadata: '{"a":1}',
              timestamp: BigInt(100)
            }
          },
          {
            args: {
              fileId: mockBlockchainFileIdBigInt,
              fileOwner: fileOwnerAddr,
              fileHash: BigInt(mockCalculatedHash),
              metadata: '{"filename":"test.txt"}',
              timestamp: BigInt(200)
            }
          } // Latest
        ]
        mockContractInstance.queryFilter.mockResolvedValue(mockEvents)

        const result = await blockchainManager.getFileInfo(mockFileId, fileOwnerAddr)

        expect(mockContractInstance.filters.FileUploaded).toHaveBeenCalledWith(
          mockBigIntFileId,
          fileOwnerAddr
        )
        expect(mockContractInstance.queryFilter).toHaveBeenCalledWith(
          mockContractInstance.filters.FileUploaded(mockBigIntFileId, fileOwnerAddr)
        )
        expect(logger.info).toHaveBeenCalledWith(`retrived fileInfo for fileId ${mockFileId}`)
        expect(result).toEqual({
          fileId: bigIntToUuid(mockBlockchainFileIdBigInt), // Converted back
          fileOwnerAddr: fileOwnerAddr,
          fileHash: BigInt(mockCalculatedHash),
          metadata: '{"filename":"test.txt"}',
          timestamp: BigInt(200)
        })
      })

      test('should throw error if queryFilter fails', async () => {
        const error = new Error('Query filter failed')
        mockContractInstance.queryFilter.mockRejectedValue(error)

        await expect(blockchainManager.getFileInfo(mockFileId, fileOwnerAddr)).rejects.toThrow(
          error
        )
        expect(logger.info).not.toHaveBeenCalledWith(`retrived fileInfo for fileId ${mockFileId}`)
      })
    })
  })
})
