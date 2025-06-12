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
  async setClientStatus(clientAddr, status) {}
  async setFileVerification(fileId, uploader, verificationInfo) {}
  async addAuthRecord(fileId, requestor, authorizer, authInfo) {}
  async uploadReencryptFile(fileId, fileHash, metadata, requestor) {}
}

export default BlockchainManager