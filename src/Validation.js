import { z } from 'zod/v4'
import { isAddress } from 'ethers'

const EthereumAddressSchema = z.string().refine((val) => isAddress(val), {
  message: 'Invalid Ethereum address. Check format and checksum.'
})

const NonEmptyStringSchema = z.string().min(1, { message: 'Name cannot be empty.' })

export const PublicKeySchema = z.string().regex(/^[a-zA-Z0-9+/=]+$/)
const FolderIdSchema = z.uuidv4().nullable()
export const FileIdSchema = z.uuidv4()
const HexStringSchema = z.string().regex(/^[0-9a-fA-F]+$/)

// CryptoHandler.js
export const Base64Schema = z.base64()

// Authentication.js
export const RegisterRequestSchema = z.object({
  publicKey: PublicKeySchema,
  blockchainAddress: EthereumAddressSchema,
  name: NonEmptyStringSchema,
  email: z.email()
})

export const LoginRequestSchema = z.object({
  publicKey: PublicKeySchema
})

export const AuthResRequestSchema = z.object({
  decryptedValue: z.string()
})

export const SecretShareRequestSchema = z.object({
  shares: z.string().array()
})

export const SecretRecoverRequestSchema = z.object({
  email: z.email()
})

export const EmailAuthResRequestSchema = z.object({
  emailAuth: z.string()
})

// FileManager.js
export const DownloadFileRequestSchema = z.object({
  fileId: FileIdSchema
})

// TODO: maybe transform bigint to hex
export const DownloadFileHashErrorRequestSchema = z.object({
  fileId: FileIdSchema,
  blockchainHash: z.bigint(),
  fileHash: z.bigint()
})

export const UploadFileRequestSchema = z.object({
  cipher: z.string(),
  spk: z.string(),
  parentFolderId: FolderIdSchema
})

export const DeleteFileRequestSchema = z.object({
  fileId: FileIdSchema
})

export const GetFileListRequestSchema = z.object({
  parentFolderId: FolderIdSchema
})

export const AddFolderRequestSchema = z.object({
  parentFolderId: FolderIdSchema,
  folderName: NonEmptyStringSchema
})

export const DeleteFolderRequestSchema = z.object({
  folderId: FolderIdSchema
})

export const MoveFileRequestSchema = z.object({
  fileId: FileIdSchema,
  targetFolderId: FolderIdSchema
})

const CTwSchema = z.object({
  ctStar: HexStringSchema,
  ctw: HexStringSchema.array(),
  ct: HexStringSchema.array()
})

export const UpdateFileRequestSchema = z.object({
  fileId: FileIdSchema,
  description: z.string(),
  // Maybe should conenct to storage database via Config Manager
  permission: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  CTw: CTwSchema.nullable()
})

const TKSchema = z.object({
  TStar: HexStringSchema,
  T: HexStringSchema.array(),
  sky: HexStringSchema,
  dPrime: z.number()
})

export const SearchFileRequestSchema = z.object({
  TK: TKSchema,
  tags: z.string().array()
})

// RequestManager.js
export const ReqeustFileRequestSchema = z.object({
  fileId: FileIdSchema,
  description: z.string()
})

export const DeleteRequestRequestSchema = z.object({
  requestId: z.uuidv4()
})

export const RespondRequestRequestSchema = z.object({
  requestId: z.uuidv4(),
  agreed: z.boolean(),
  description: z.string(),
  rekey: z.string().nullable()
})

// HttpsServer.js
export const SocketIDSchema = z.string()
