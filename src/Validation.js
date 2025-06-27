import { z } from 'zod/v4'
import { isAddress } from 'ethers'

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

export const AuthResRequestSchema = z.object({
  decryptedValue: z.string()
})
