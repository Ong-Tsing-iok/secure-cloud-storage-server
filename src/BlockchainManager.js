import { Contract, JsonRpcProvider } from 'ethers'
import ConfigManager from './ConfigManager'
import { logger } from './Logger'

class BlockchainManager {
  constructor() {
    try {
      const abi = ConfigManager.blockchain.abi
      const url = ConfigManager.blockchain.jsonRpcUrl
      const contractAddr = ConfigManager.blockchain.contractAddr
      const provider = new JsonRpcProvider(url)
      this.contract = new Contract(contractAddr, abi, provider)
    } catch (error) {
      logger.error(error)
    }
  }

  // Error should be handled in layer above
  async setClientStatus(clientAddr, status) {
    const tx = await this.contract.setClientStatus(BigInt(clientAddr), status)
    await tx.wait()
    logger.info(`set client ${clientAddr} status to ${status}`)
  }
  async setFileVerification(fileId, uploader, verificationInfo) {
    const tx = await this.contract.setFileVerification(BigInt(fileId), BigInt(uploader), verificationInfo)
    await tx.wait()
    logger.info(`set verification for ${fileId}`)
  }
  async addAuthRecord(fileId, requestor, authorizer, authInfo) {
    const tx = await this.contract.addAuthorization(BigInt(fileId), BigInt(requestor), BigInt(authorizer), authInfo)
    await tx.wait()
    logger.info(`added authorization record for file ${fileId}`)
  }
  async uploadReencryptFile(fileId, fileHash, metadata, requestor) {
    const tx = await this.contract.uploadReencryptFile(BigInt(fileId), BigInt(fileHash), metadata, BigInt(requestor))
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