import { email, z, ZodType } from 'zod/v4'
import { isAddress } from 'ethers'
import { Schema } from 'zod'

const EthereumAddressSchema = z.string().refine((val) => isAddress(val), {
  message: 'Invalid Ethereum address. Check format and checksum.'
})

const NonEmptyStringSchema = z.string().min(1, { message: 'Name cannot be empty.' })

const PublicKeySchema = z.string().regex(/^[a-zA-Z0-9+/=]+$/)

export const RegisterRequestSchema = z.object({
  publicKey: PublicKeySchema,
  blockchainAddress: EthereumAddressSchema,
  name: NonEmptyStringSchema,
  email: z.email()
})

// TODO: maybe transform bigint to hex
export const DownloadFileHashErrorRequestSchema = z.object({
  fildId: z.uuidv4(),
  blockchainHash: z.bigint(),
  fileHash: z.bigint()
})

export const LoginRequestSchema = z.object({
  publicKey: PublicKeySchema
})

/**
 *
 * @param {Object} obj
 * @param {ZodType} schema
 */
export const checkAgainstSchema = (obj, schema) => {
  const result = schema.safeParse(obj)
  if (result.success) return result.data
  else {
    // log
    return null
  }
}
