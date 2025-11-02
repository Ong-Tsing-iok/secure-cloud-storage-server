/**
 * This file handles operations related to blockchain. Including initializing wallet, communicating with smart contract.
 */
import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { readFileSync, writeFileSync } from 'fs'
import ConfigManager from './ConfigManager.js'
import { logger } from './Logger.js'
import { bigIntToUuid } from './Utils.js'

/**
 * Converts a UUID string to a BigInt for use in smart contracts.
 * The UUID string should be in the standard format (e.g., "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx").
 *
 * @param {string} uuidString The UUID string to convert.
 * @returns {bigint} The BigInt representation of the UUID.
 * @throws {Error} If the UUID string format is invalid.
 */
export function uuidToBigInt(uuidString) {
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
 * Manages smart contract communication
 */
class BlockchainManager {
  /**
   * Connect to blockchain and smart contract
   */
  constructor() {
    if (!ConfigManager.blockchain.enabled) return
    try {
      const abi = readFileSync(ConfigManager.blockchain.abiPath, 'utf-8')
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
    if (!ConfigManager.blockchain.enabled) return
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
    if (!ConfigManager.blockchain.enabled) return
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
    if (!ConfigManager.blockchain.enabled) return
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
    if (!ConfigManager.blockchain.enabled) return
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
    if (!ConfigManager.blockchain.enabled) return
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
    if (!ConfigManager.blockchain.enabled) return null
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

export default new BlockchainManager()
