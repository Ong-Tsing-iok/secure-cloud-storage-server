import {
  pre_schema1_MessageGen,
  pre_schema1_SigningKeyGen,
  pre_schema1_Encrypt,
  pre_schema1_ReEncrypt
} from '@aldenml/ecc'
import { logger } from './Logger'

const base64Re = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

const checkKeyValid = (publicKey) => {
  return base64Re.test(publicKey)
}

const reencrypt = async (rekey, cipher, aSpk, bPk) => {
  if (!checkKeyValid(rekey)) {
    throw new Error('Invalid rekey format')
  }
  if (!checkKeyValid(cipher)) {
    throw new Error('Invalid cipher format')
  }
  if (!checkKeyValid(aSpk)) {
    throw new Error('Invalid aSpk format')
  }
  if (!checkKeyValid(bPk)) {
    throw new Error('Invalid bPk format')
  }
  logger.debug(`rekey: ${rekey}, cipher: ${cipher}, aSpk: ${aSpk}, bPk: ${bPk}`)
  const signingArray = await pre_schema1_SigningKeyGen()
  const rekeyArray = new Uint8Array(Buffer.from(rekey, 'base64'))
  const cipherArray = new Uint8Array(Buffer.from(cipher, 'base64'))
  const aSpkArray = new Uint8Array(Buffer.from(aSpk, 'base64'))
  const bPkArray = new Uint8Array(Buffer.from(bPk, 'base64'))
  const recipherArray = await pre_schema1_ReEncrypt(
    cipherArray,
    rekeyArray,
    aSpkArray,
    bPkArray,
    signingArray
  )
  logger.debug(`spk: ${Buffer.from(signingArray.spk).toString('base64')}`)
  logger.debug(`ssk: ${Buffer.from(signingArray.ssk).toString('base64')}`)
  logger.debug(`recipher: ${Buffer.from(recipherArray).toString('base64')}`)
  if (recipherArray === null) {
    throw new Error('Failed to reencrypt')
  }
  return {
    recipher: Buffer.from(recipherArray).toString('base64'),
    spk: Buffer.from(signingArray.spk).toString('base64')
  }
}

/**
 *
 * @returns {Promise<string>}
 */
const messageGen = async () => {
  const message = await pre_schema1_MessageGen()
  return Buffer.from(message).toString('base64')
}

/**
 *
 * @param {string} publicKey
 * @returns {Promise<{message: string, cipher: string, spk: string}>}
 */
const verifyGen = async (publicKey) => {
  const publicKeyArray = new Uint8Array(Buffer.from(publicKey, 'base64'))
  const messageArray = await pre_schema1_MessageGen()
  const signKeyArray = await pre_schema1_SigningKeyGen()
  const cipherArray = await pre_schema1_Encrypt(messageArray, publicKeyArray, signKeyArray)
  if (cipherArray === null) {
    throw new Error('Failed to create verity message')
  }
  // const messageStr = Buffer.from(message).toString('base64')
  return {
    message: Buffer.from(messageArray).toString('base64'),
    cipher: Buffer.from(cipherArray).toString('base64'),
    spk: Buffer.from(signKeyArray.spk).toString('base64')
  }
}

const CryptoHandler = {
  reencrypt,
  messageGen,
  verifyGen
}
export default CryptoHandler
