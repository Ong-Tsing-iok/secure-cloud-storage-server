import { test, expect, jest, describe, beforeEach } from '@jest/globals'
// Mock external dependencies
jest.mock('@aldenml/ecc', () => ({
  pre_schema1_MessageGen: jest.fn(),
  pre_schema1_SigningKeyGen: jest.fn(),
  pre_schema1_Encrypt: jest.fn(),
  pre_schema1_ReEncrypt: jest.fn()
}))

jest.mock('../src/Logger.js', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn()
  }
}))

jest.mock('../src/Validation.js', () => ({
  Base64Schema: {
    parse: jest.fn((value) => value) // Mock to simply return the value, assuming it's valid Base64
  }
}))

// Import the module to be tested
import CryptoHandler from '../src/CryptoHandler.js'

// Import mocked dependencies for easier access and assertion
import {
  pre_schema1_MessageGen,
  pre_schema1_SigningKeyGen,
  pre_schema1_Encrypt,
  pre_schema1_ReEncrypt
} from '@aldenml/ecc'
import { logger } from '../src/Logger.js'
import { Base64Schema } from '../src/Validation.js'

describe('CryptoHandler', () => {
  // Helper function to create a Uint8Array from a string
  const strToUint8 = (str) => new Uint8Array(Buffer.from(str))
  // Helper function to create a Base64 string from a Uint8Array
  const uint8ToBase64 = (arr) => Buffer.from(arr).toString('base64')
  // Helper function to create a Uint8Array from a Base64 string
  const base64ToUint8 = (b64) => new Uint8Array(Buffer.from(b64, 'base64'))

  beforeEach(() => {
    // Clear all mock calls before each test
    jest.clearAllMocks()

    // Reset Base64Schema.parse mock if it was changed in a test
    Base64Schema.parse.mockImplementation((value) => value)
  })

  describe('reencrypt', () => {
    const mockRekey = uint8ToBase64(strToUint8('mock_rekey'))
    const mockCipher = uint8ToBase64(strToUint8('mock_cipher'))
    const mockASpk = uint8ToBase64(strToUint8('mock_a_spk'))
    const mockBPk = uint8ToBase64(strToUint8('mock_b_pk'))

    const mockSigningArray = {
      spk: strToUint8('mock_spk_result'),
      ssk: strToUint8('mock_ssk_result')
    }
    const mockRecipherArray = strToUint8('mock_recipher_result')

    beforeEach(() => {
      pre_schema1_SigningKeyGen.mockResolvedValue(mockSigningArray)
      pre_schema1_ReEncrypt.mockResolvedValue(mockRecipherArray)
    })

    test('should successfully reencrypt with valid inputs', async () => {
      const result = await CryptoHandler.reencrypt(mockRekey, mockCipher, mockASpk, mockBPk)

      expect(Base64Schema.parse).toHaveBeenCalledTimes(4)
      expect(Base64Schema.parse).toHaveBeenCalledWith(mockRekey)
      expect(Base64Schema.parse).toHaveBeenCalledWith(mockCipher)
      expect(Base64Schema.parse).toHaveBeenCalledWith(mockASpk)
      expect(Base64Schema.parse).toHaveBeenCalledWith(mockBPk)

      expect(logger.debug).toHaveBeenCalledWith(
        `rekey: ${mockRekey}, cipher: ${mockCipher}, aSpk: ${mockASpk}, bPk: ${mockBPk}`
      )
      expect(pre_schema1_SigningKeyGen).toHaveBeenCalled()
      expect(pre_schema1_ReEncrypt).toHaveBeenCalledWith(
        base64ToUint8(mockCipher),
        base64ToUint8(mockRekey),
        base64ToUint8(mockASpk),
        base64ToUint8(mockBPk),
        mockSigningArray
      )
      expect(logger.debug).toHaveBeenCalledWith(`spk: ${uint8ToBase64(mockSigningArray.spk)}`)
      expect(logger.debug).toHaveBeenCalledWith(`ssk: ${uint8ToBase64(mockSigningArray.ssk)}`)
      expect(logger.debug).toHaveBeenCalledWith(`recipher: ${uint8ToBase64(mockRecipherArray)}`)

      expect(result).toEqual({
        recipher: uint8ToBase64(mockRecipherArray),
        spk: uint8ToBase64(mockSigningArray.spk)
      })
    })

    test('should throw error if Base64Schema.parse fails', async () => {
      const error = new Error('Invalid Base64 string')
      Base64Schema.parse.mockImplementationOnce(() => {
        throw error
      }) // Make rekey parsing fail

      await expect(
        CryptoHandler.reencrypt('invalid_rekey', mockCipher, mockASpk, mockBPk)
      ).rejects.toThrow(error)
      expect(pre_schema1_SigningKeyGen).not.toHaveBeenCalled()
    })

    test('should throw error if pre_schema1_ReEncrypt returns null', async () => {
      pre_schema1_ReEncrypt.mockResolvedValue(null)

      await expect(
        CryptoHandler.reencrypt(mockRekey, mockCipher, mockASpk, mockBPk)
      ).rejects.toThrow('Failed to reencrypt.')
    })

    test('should throw error if pre_schema1_SigningKeyGen rejects', async () => {
      const error = new Error('Signing key gen failed')
      pre_schema1_SigningKeyGen.mockRejectedValue(error)

      await expect(
        CryptoHandler.reencrypt(mockRekey, mockCipher, mockASpk, mockBPk)
      ).rejects.toThrow(error)
      expect(pre_schema1_ReEncrypt).not.toHaveBeenCalled()
    })

    test('should throw error if pre_schema1_ReEncrypt rejects', async () => {
      const error = new Error('ReEncrypt failed')
      pre_schema1_ReEncrypt.mockRejectedValue(error)

      await expect(
        CryptoHandler.reencrypt(mockRekey, mockCipher, mockASpk, mockBPk)
      ).rejects.toThrow(error)
    })
  })

  describe('messageGen', () => {
    const mockMessageArray = strToUint8('generated_message')

    beforeEach(() => {
      pre_schema1_MessageGen.mockResolvedValue(mockMessageArray)
    })

    test('should successfully generate a message', async () => {
      const result = await CryptoHandler.messageGen()

      expect(pre_schema1_MessageGen).toHaveBeenCalled()
      expect(result).toBe(uint8ToBase64(mockMessageArray))
    })

    test('should throw error if pre_schema1_MessageGen rejects', async () => {
      const error = new Error('MessageGen failed')
      pre_schema1_MessageGen.mockRejectedValue(error)

      await expect(CryptoHandler.messageGen()).rejects.toThrow(error)
    })
  })

  describe('verifyGen', () => {
    const mockPublicKey = uint8ToBase64(strToUint8('mock_public_key'))
    const mockMessageArray = strToUint8('verify_message')
    const mockSignKeyArray = {
      spk: strToUint8('verify_spk'),
      ssk: strToUint8('verify_ssk')
    }
    const mockCipherArray = strToUint8('verify_cipher')

    beforeEach(() => {
      pre_schema1_MessageGen.mockResolvedValue(mockMessageArray)
      pre_schema1_SigningKeyGen.mockResolvedValue(mockSignKeyArray)
      pre_schema1_Encrypt.mockResolvedValue(mockCipherArray)
    })

    test('should successfully generate verification data', async () => {
      const result = await CryptoHandler.verifyGen(mockPublicKey)

      expect(Base64Schema.parse).toHaveBeenCalledWith(mockPublicKey)
      expect(pre_schema1_MessageGen).toHaveBeenCalled()
      expect(pre_schema1_SigningKeyGen).toHaveBeenCalled()
      expect(pre_schema1_Encrypt).toHaveBeenCalledWith(
        mockMessageArray,
        base64ToUint8(mockPublicKey),
        mockSignKeyArray
      )

      expect(result).toEqual({
        message: uint8ToBase64(mockMessageArray),
        cipher: uint8ToBase64(mockCipherArray),
        spk: uint8ToBase64(mockSignKeyArray.spk)
      })
    })

    test('should throw error if Base64Schema.parse fails for publicKey', async () => {
      const error = new Error('Invalid publicKey Base64')
      Base64Schema.parse.mockImplementationOnce(() => {
        throw error
      })

      await expect(CryptoHandler.verifyGen('invalid_public_key')).rejects.toThrow(error)
      expect(pre_schema1_MessageGen).not.toHaveBeenCalled()
    })

    test('should throw error if pre_schema1_Encrypt returns null', async () => {
      pre_schema1_Encrypt.mockResolvedValue(null)

      await expect(CryptoHandler.verifyGen(mockPublicKey)).rejects.toThrow(
        'Failed to create verify message.'
      )
    })

    test('should throw error if pre_schema1_MessageGen rejects', async () => {
      const error = new Error('MessageGen rejected')
      pre_schema1_MessageGen.mockRejectedValue(error)

      await expect(CryptoHandler.verifyGen(mockPublicKey)).rejects.toThrow(error)
      expect(pre_schema1_Encrypt).not.toHaveBeenCalled()
    })

    test('should throw error if pre_schema1_SigningKeyGen rejects', async () => {
      const error = new Error('SigningKeyGen rejected')
      pre_schema1_SigningKeyGen.mockRejectedValue(error)

      await expect(CryptoHandler.verifyGen(mockPublicKey)).rejects.toThrow(error)
      expect(pre_schema1_Encrypt).not.toHaveBeenCalled()
    })

    test('should throw error if pre_schema1_Encrypt rejects', async () => {
      const error = new Error('Encrypt rejected')
      pre_schema1_Encrypt.mockRejectedValue(error)

      await expect(CryptoHandler.verifyGen(mockPublicKey)).rejects.toThrow(error)
    })
  })
})
