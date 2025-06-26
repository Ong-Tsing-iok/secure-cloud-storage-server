import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { readFileSync, writeFileSync } from 'fs'
import ConfigManager from './ConfigManager.js'
import { logger } from './Logger.js'

/**
 * Converts a UUID string to a BigInt for use in smart contracts.
 * The UUID string should be in the standard format (e.g., "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx").
 *
 * @param {string} uuidString The UUID string to convert.
 * @returns {bigint} The BigInt representation of the UUID.
 * @throws {Error} If the UUID string format is invalid.
 */
function uuidToBigInt(uuidString) {
  // Basic validation for UUID format
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  if (!uuidRegex.test(uuidString)) {
    throw new Error(`Invalid UUID string format: ${uuidString}`)
  }

  // Remove hyphens and convert to BigInt
  const hexString = uuidString.replace(/-/g, '')
  return BigInt('0x' + hexString)
}

/**
 * Converts a BigInt (representing a UUID) back to a standard UUID string.
 * This assumes the BigInt was originally derived from a 128-bit UUID.
 *
 * @param {bigint} uuidBigInt The BigInt to convert back to a UUID string.
 * @returns {string} The UUID string in standard format.
 * @throws {Error} If the BigInt is too large to be a 128-bit UUID.
 */
export function bigIntToUuid(uuidBigInt) {
  // A 128-bit number's maximum value in hexadecimal is 16^32 - 1.
  // The maximum BigInt for a 128-bit UUID is 2^128 - 1, which is (2^64)^2 - 1.
  // This translates to 'ffffffffffffffffffffffffffffffff' in hex.
  const max128BitBigInt = (1n << 128n) - 1n // Calculate 2^128 - 1n

  if (uuidBigInt < 0n || uuidBigInt > max128BitBigInt) {
    throw new Error(`BigInt ${uuidBigInt} is out of the valid range for a 128-bit UUID.`)
  }

  // Convert BigInt to hexadecimal string, then pad with leading zeros if necessary
  let hexString = uuidBigInt.toString(16)

  // Ensure the hex string is 32 characters long (128 bits = 32 hex chars)
  hexString = hexString.padStart(32, '0')

  // Insert hyphens to format as a UUID
  return [
    hexString.substring(0, 8),
    hexString.substring(8, 12),
    hexString.substring(12, 16),
    hexString.substring(16, 20),
    hexString.substring(20, 32)
  ].join('-')
}

/**
 * Manages smart contract communication
 */
class BlockchainManager {
  /**
   * Connect to blockchain and smart contract
   */
  constructor() {
    try {
      const abi = ConfigManager.blockchain.abi
      const url = ConfigManager.blockchain.jsonRpcUrl
      const contractAddr = ConfigManager.blockchain.contractAddr
      const provider = new JsonRpcProvider(url)
      const wallet = this.readOrCreateWallet(ConfigManager.blockchain.walletKeyPath, provider)
      this.contract = new Contract(contractAddr, abi, wallet)
      logger.info(`Blockchain Manager initialized with wallet address: ${wallet.address}.`)
    } catch (error) {
      logger.error(error)
    }
  }

  /**
   * Reads the wallet key and create wallet from path.
   * If key file not found, create a random wallet and store the key in key file.
   * @param {string} filepath the file path to the wallet key
   * @param {JsonRpcProvider} provider the provider of connected blockchain
   * @returns a wallet connect to the provider
   * @throws Any error occurred.
   */
  readOrCreateWallet(filepath, provider) {
    try {
      const key = readFileSync(filepath, 'utf-8').trim()
      return new Wallet(key, provider)
    } catch (error) {
      if (error.code == 'ENOENT') {
        const wallet = Wallet.createRandom(provider)
        writeFileSync(filepath, wallet.privateKey)
        return wallet
      } else {
        throw error
      }
    }
  }

  /**
   * Bind a listener to a certain event of the contract
   * @param {string} eventName Name of the event
   * @param {(...args)=> void | Promise<void>} listener The listener to bind to the contract
   * @throws Any error occurred.
   */
  bindEventListener(eventName, listener) {
    this.contract.on(eventName, listener)
  }

  // Error should be handled in layer above
  /**
   * Set or remove privilege of client in smart contract
   * @param {string} clientAddr blockchain address of the client
   * @param {boolean} status to add or remove privilege
   * @throws Any error occurred.
   */
  async setClientStatus(clientAddr, status) {
    const tx = await this.contract.setClientStatus(clientAddr, status)
    await tx.wait()
    logger.info(`set client ${clientAddr} status to ${status}`)
  }

  /**
   * Set verification for a file.
   * @param {string} fileId UUID of the file.
   * @param {string} fileOwnerAddr Blockchain address of the file owner.
   * @param {'success' | 'fail'} verificationInfo Verification information.
   * @throws Any error occurred.
   */
  async setFileVerification(fileId, fileOwnerAddr, verificationInfo) {
    const tx = await this.contract.setFileVerification(
      uuidToBigInt(fileId),
      fileOwnerAddr,
      verificationInfo
    )
    await tx.wait()
    logger.info(`set verification for ${fileId}`)
  }

  /**
   * Add authorization record for a file, requestor, and authorizer.
   * @param {string} fileId UUID of the file.
   * @param {string} requestorAddr Blockchain address of the requestor.
   * @param {string} authorizerAddr Blockchain address of the authorizer.
   * @param {'not-replied' | 'agreed' | 'rejected'} authInfo Authorization information.
   * @throws Any error occurred.
   */
  async addAuthRecord(fileId, requestorAddr, authorizerAddr, authInfo) {
    const tx = await this.contract.addAuthorization(
      uuidToBigInt(fileId),
      requestorAddr,
      authorizerAddr,
      authInfo
    )
    await tx.wait()
    logger.info(`added authorization record for file ${fileId}`)
  }

  /**
   * Upload file information for a reencrypted file.
   * @param {string} fileId UUID of the file.
   * @param {string | BigInt} fileHash SHA256 hash of the file.
   * @param {string} metadata File metadata in JSON format.
   * @param {string} requestorAddr Blockchain address of the requestor.
   * @param {string} authorizerAddr Blockchain address of the authorizer.
   * @param {'success'} verificationInfo Verification information.
   * @param {'agreed'} authInfo Authorization information.
   * @throws Any error occurred.
   */
  async reencryptFile(
    fileId,
    fileHash,
    metadata,
    requestorAddr,
    authorizerAddr,
    verificationInfo = 'success',
    authInfo = 'agreed'
  ) {
    const tx = await this.contract.reencryptFile(
      uuidToBigInt(fileId),
      BigInt(fileHash),
      metadata,
      requestorAddr,
      authorizerAddr,
      verificationInfo,
      authInfo
    )
    await tx.wait()
    logger.info(`Uploaded, verified and added record for reencrypted file ${fileId}.`)
  }

  /**
   * Get hash and metadata of a file.
   * @param {string} fileId UUID of the file.
   * @param {string} fileOwnerAddr Blockchain address of the file owner.
   * @returns Latest event arguments or null if not found.
   * @throws Any error occurred.
   */
  async getFileInfo(fileId, fileOwnerAddr) {
    const events = await this.contract.queryFilter(
      this.contract.filters.FileUploaded(uuidToBigInt(fileId), fileOwnerAddr)
    )
    logger.info(`retrived fileInfo for fileId ${fileId}`)
    if (events.length == 0) {
      return null
    } else {
      const eventArgs = events[events.length - 1].args
      return {
        fileId: bigIntToUuid(eventArgs.fileId),
        fileOwnerAddr: String(eventArgs.fileOwner),
        fileHash: BigInt(eventArgs.fileHash),
        metadata: String(eventArgs.metadata),
        timestamp: BigInt(eventArgs.timestamp)
      }
    }
  }
}

export default BlockchainManager
