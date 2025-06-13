import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { readFileSync, writeFileSync } from 'fs'
import ConfigManager from './ConfigManager'
import { logger } from './Logger'

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

  // Error should be handled in layer above
  /**
   * Set or remove privilege of client in smart contract
   * @param {string | BigInt} clientAddr blockchain address of the client
   * @param {boolean} status to add or remove privilege
   */
  async setClientStatus(clientAddr, status) {
    const tx = await this.contract.setClientStatus(BigInt(clientAddr), status)
    await tx.wait()
    logger.info(`set client ${clientAddr} status to ${status}`)
  }

  /**
   * Set verification for a file
   * @param {string | BigInt} fileId UUID of the file
   * @param {string | BigInt} uploader blockchain address of the uploader
   * @param {string} verificationInfo verification information in JSON format
   */
  async setFileVerification(fileId, uploader, verificationInfo) {
    const tx = await this.contract.setFileVerification(
      BigInt(fileId),
      BigInt(uploader),
      verificationInfo
    )
    await tx.wait()
    logger.info(`set verification for ${fileId}`)
  }

  /**
   * Add authorization record for a file, requestor, and authorizer
   * @param {string | BigInt} fileId UUID of the file
   * @param {string | BigInt} requestor blockchain address of the requestor
   * @param {string | BigInt} authorizer blockchain address of the authorizer
   * @param {string} authInfo authorization information in JSON format
   */
  async addAuthRecord(fileId, requestor, authorizer, authInfo) {
    const tx = await this.contract.addAuthorization(
      BigInt(fileId),
      BigInt(requestor),
      BigInt(authorizer),
      authInfo
    )
    await tx.wait()
    logger.info(`added authorization record for file ${fileId}`)
  }

  /**
   * Upload file information for a reencrypted file
   * @param {string | BigInt} fileId UUID of the file
   * @param {string | BigInt} fileHash sha256 hash of the file
   * @param {string} metadata file metadata in JSON format
   * @param {string | BigInt} requestor blockchain address of the requestor
   */
  async uploadReencryptFile(fileId, fileHash, metadata, requestor) {
    const tx = await this.contract.uploadReencryptFile(
      BigInt(fileId),
      BigInt(fileHash),
      metadata,
      BigInt(requestor)
    )
    await tx.wait()
    logger.info(`uploaded file hash, metadata for reencrypted file ${fileId}`)
  }

  /**
   * Get hash and metadata of a file
   * @param {string | BigInt} fileId UUID of the file
   * @param {string | BigInt} uploader Blockchain address of the file owner
   * @returns First event log queried or null if not found
   */
  async getFileInfo(fileId, uploader) {
    const events = await this.contract.queryFilter(
      this.contract.filters.FileUploaded(BigInt(fileId), BigInt(uploader))
    )
    logger.info(`retrived fileInfo for fileId ${fileId}`)
    if (events.length == 0) {
      return null
    } else {
      return events[0]
    }
  }
}

export default BlockchainManager
