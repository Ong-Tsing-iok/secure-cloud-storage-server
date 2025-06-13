import { test, expect, jest, describe, beforeEach } from '@jest/globals'
import { JsonRpcProvider, Contract, Wallet } from 'ethers'
import { readFileSync, writeFileSync } from 'fs'
import { logger } from '../src/Logger'
import ConfigManager from '../src/ConfigManager'
import BlockchainManager from '../src/BlockchainManager'

// Mock the external dependencies
const mockProvider = {}
jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn(() => mockProvider), // Mock JsonRpcProvider constructor
  Contract: jest.fn(() => ({
    owner: jest.fn(), // Mock the owner method on the Contract instance
    uploadFile: jest.fn(),
    filters: {},
    queryFilter: jest.fn()
  })),
  Wallet: jest.fn()
}))
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}))
jest.mock('../src/Logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  }
}))

jest.mock('../src/ConfigManager', () => ({
  blockchain: {
    abi: ['some_abi_definition'],
    jsonRpcUrl: 'http://mock-rpc-url.com',
    contractAddr: '0xmockContractAddress',
    walletKeyPath: '/some/path'
  }
}))

describe('BlockchainManager', () => {
  const mockWallet = { privateKey: '0x7893157677' }
  let blockchainManager
  let mockContractInstance
  let mockTx
  let readOrCreateWalletSpy

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    readOrCreateWalletSpy = jest
      .spyOn(BlockchainManager.prototype, 'readOrCreateWallet')
      .mockReturnValueOnce(mockWallet)
    // Initialize BlockchainManager for each test
    blockchainManager = new BlockchainManager()

    mockContractInstance = Contract.mock.results[0].value

    mockTx = { wait: jest.fn() }
  })

  describe('constructor', () => {
    test('should initialize JsonRpcProvider and Contract with correct values', () => {
      expect(JsonRpcProvider).toHaveBeenCalledTimes(1)
      expect(JsonRpcProvider).toHaveBeenCalledWith(ConfigManager.blockchain.jsonRpcUrl)
      expect(readOrCreateWalletSpy).toHaveBeenCalledTimes(1)
      expect(readOrCreateWalletSpy).toHaveBeenCalledWith(
        ConfigManager.blockchain.walletKeyPath,
        mockProvider
      )
      expect(Contract).toHaveBeenCalledTimes(1)
      expect(Contract).toHaveBeenCalledWith(
        ConfigManager.blockchain.contractAddr,
        ConfigManager.blockchain.abi,
        mockWallet
      )
    })
    test('should set the contract property', () => {
      expect(blockchainManager.contract).toBeDefined()
      expect(blockchainManager.contract).toBe(mockContractInstance)
    })
    test('should log error if JsonRpcProvider fails to connect', () => {
      JsonRpcProvider.mockImplementationOnce(() => {
        throw new Error('Connection failed')
      })

      blockchainManager = new BlockchainManager()
      // Depending on how you handle it, you might expect logger.error to be called
      // or the constructor to throw, which you would then catch in the test.
      // expect(() => new BlockchainManager()).toThrow('Connection failed'); // If you re-throw
      // OR
      expect(logger.error).toHaveBeenCalledWith(new Error('Connection failed')) // If you log
    })
  })

  describe('readOrCreateWallet', () => {
    const somePath = '/this/is/some/path'
    const someWalletKey = '0x8754697845\n\n'

    beforeEach(() => {
      Wallet.mockReturnValueOnce(mockWallet)
      readFileSync.mockReturnValueOnce(someWalletKey)
    })

    test('should read key and create wallet if file exists', () => {
      const result = blockchainManager.readOrCreateWallet(somePath, mockProvider)
      expect(readFileSync).toHaveBeenCalledTimes(1)
      expect(readFileSync).toHaveBeenCalledWith(somePath, 'utf-8')
      expect(Wallet).toHaveBeenCalledTimes(1)
      expect(Wallet).toHaveBeenCalledWith(someWalletKey.trim(), mockProvider)
      expect(result).toBe(mockWallet)
    })
    test('should create wallet and write key if file do not exist', () => {
      readFileSync.mockReset()
      readFileSync.mockImplementationOnce(() => {
        const err = new Error('File not found')
        err.code = 'ENOENT'
        throw err
      })
      Wallet.createRandom = jest.fn().mockReturnValueOnce(mockWallet)
      const result = blockchainManager.readOrCreateWallet(somePath, mockProvider)
      expect(Wallet.createRandom).toHaveBeenCalledTimes(1)
      expect(Wallet.createRandom).toHaveBeenCalledWith(mockProvider)
      expect(writeFileSync).toHaveBeenCalledTimes(1)
      expect(writeFileSync).toHaveBeenCalledWith(somePath, mockWallet.privateKey)
      expect(result).toBe(mockWallet)
    })
    test('should throw error when unexpected error occurs', () => {
      Wallet.mockReset()
      Wallet.mockImplementationOnce(() => {
        throw new Error('Unexpected')
      })
      expect(() => blockchainManager.readOrCreateWallet(somePath, mockProvider)).toThrow(
        'Unexpected'
      )
    })
  })

  describe('setClientStatus', () => {
    const clientAddr = '0x7335'
    const status = true
    beforeEach(async () => {
      mockContractInstance.setClientStatus = jest.fn().mockResolvedValueOnce(mockTx)
      await blockchainManager.setClientStatus(clientAddr, status)
    })

    test('should call contract.setClientStatus with correct arguments', () => {
      expect(mockContractInstance.setClientStatus).toHaveBeenCalledTimes(1)
      expect(mockContractInstance.setClientStatus).toHaveBeenCalledWith(BigInt(clientAddr), status)
      expect(mockTx.wait).toHaveBeenCalledTimes(1)
    })
    test('should log success message', () => {
      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`${clientAddr}`))
    })
    test('should throw error when transaction error occurs', () => {
      mockContractInstance.setClientStatus = jest
        .fn()
        .mockRejectedValueOnce(new Error('Transaction Error'))

      expect(blockchainManager.setClientStatus(clientAddr, status)).rejects.toThrow(
        'Transaction Error'
      )
    })
  })

  describe('setFileVerification', () => {
    const fileId = '0x68156'
    const uploader = '0x7335'
    const verificationInfo = 'verify_info'
    beforeEach(async () => {
      mockContractInstance.setFileVerification = jest.fn().mockResolvedValueOnce(mockTx)
      await blockchainManager.setFileVerification(fileId, uploader, verificationInfo)
    })

    test('should call contract.setFileVerification with correct arguments', () => {
      expect(mockContractInstance.setFileVerification).toHaveBeenCalledTimes(1)
      expect(mockContractInstance.setFileVerification).toHaveBeenCalledWith(
        BigInt(fileId),
        BigInt(uploader),
        verificationInfo
      )
      expect(mockTx.wait).toHaveBeenCalledTimes(1)
    })
    test('should log success message', () => {
      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`${fileId}`))
    })
    test('should throw error when transaction error occurs', () => {
      mockContractInstance.setClientStatus = jest
        .fn()
        .mockRejectedValueOnce(new Error('Transaction Error'))

      expect(blockchainManager.setClientStatus(fileId, uploader, verificationInfo)).rejects.toThrow(
        'Transaction Error'
      )
    })
  })

  describe('addAuthRecord', () => {
    const fileId = '0x879465'
    const requestor = '0x7918987'
    const authorizer = '0x98787335445'
    const authInfo = 'not replied'
    beforeEach(async () => {
      mockContractInstance.addAuthorization = jest.fn().mockResolvedValueOnce(mockTx)
      await blockchainManager.addAuthRecord(fileId, requestor, authorizer, authInfo)
    })

    test('should call contract.addAuthorization with correct arguments', () => {
      expect(mockContractInstance.addAuthorization).toHaveBeenCalledTimes(1)
      expect(mockContractInstance.addAuthorization).toHaveBeenCalledWith(
        BigInt(fileId),
        BigInt(requestor),
        BigInt(authorizer),
        authInfo
      )
      expect(mockTx.wait).toHaveBeenCalledTimes(1)
    })
    test('should log success message', () => {
      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`${fileId}`))
    })
    test('should throw error when transaction error occurs', async () => {
      mockContractInstance.addAuthorization = jest
        .fn()
        .mockRejectedValueOnce(new Error('Transaction Error'))

      expect(
        blockchainManager.addAuthRecord(fileId, requestor, authorizer, authInfo)
      ).rejects.toThrow(new Error('Transaction Error'))
    })
  })

  describe('uploadReencryptFile', () => {
    const fileId = '0x876546'
    const fileHash = '0x78946587'
    const metadata = 'file_meta'
    const requestor = '0x98722872'
    beforeEach(async () => {
      mockContractInstance.uploadReencryptFile = jest.fn().mockResolvedValueOnce(mockTx)
      await blockchainManager.uploadReencryptFile(fileId, fileHash, metadata, requestor)
    })

    test('should call contract.uploadReencryptFile with correct arguments', () => {
      expect(mockContractInstance.uploadReencryptFile).toHaveBeenCalledTimes(1)
      expect(mockContractInstance.uploadReencryptFile).toHaveBeenCalledWith(
        BigInt(fileId),
        BigInt(fileHash),
        metadata,
        BigInt(requestor)
      )
      expect(mockTx.wait).toHaveBeenCalledTimes(1)
    })
    test('should log success message', () => {
      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`${fileId}`))
    })
    test('should throw error when transaction error occurs', () => {
      mockContractInstance.uploadReencryptFile = jest
        .fn()
        .mockRejectedValueOnce(new Error('Transaction Error'))

      expect(
        blockchainManager.uploadReencryptFile(fileId, fileHash, metadata, requestor)
      ).rejects.toThrow(new Error('Transaction Error'))
    })
  })

  describe('getFileInfo', () => {
    const fileUploadRecord = {
      args: {
        fileId: '0x124',
        fileHash: BigInt('0x456'),
        metadata: 'file_metadata',
        uploader: '0x789',
        timestamp: BigInt('0x486787')
      }
    }
    let result
    beforeEach(async () => {
      mockContractInstance.filters.FileUploaded = jest.fn().mockReturnValueOnce({})
      mockContractInstance.queryFilter.mockResolvedValueOnce([fileUploadRecord])
      result = await blockchainManager.getFileInfo(
        fileUploadRecord.args.fileId,
        fileUploadRecord.args.uploader
      )
    })

    test('should call contract.filters.FileUploaded with correct arguments', () => {
      expect(mockContractInstance.filters.FileUploaded).toHaveBeenCalledTimes(1)
      expect(mockContractInstance.filters.FileUploaded).toHaveBeenCalledWith(
        BigInt(fileUploadRecord.args.fileId),
        BigInt(fileUploadRecord.args.uploader)
      )
    })

    test('should call contract.queryFilter with return value from contract.filters.FileUploaded', () => {
      expect(mockContractInstance.queryFilter).toHaveBeenCalledTimes(1)
      expect(mockContractInstance.queryFilter).toHaveBeenCalledWith(expect.any(Object))
    })

    test('should return correct result', () => {
      expect(result).toEqual(fileUploadRecord)
    })

    test('should return null if contract.queryFilter return empty array', async () => {
      mockContractInstance.queryFilter.mockResolvedValueOnce([])
      result = await blockchainManager.getFileInfo(
        fileUploadRecord.args.fileId,
        fileUploadRecord.args.uploader
      )

      expect(result).toEqual(null)
    })

    test('should log success message', () => {
      expect(logger.info).toHaveBeenCalledTimes(1)
    })
  })
})
