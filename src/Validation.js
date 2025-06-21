import { email, z } from "zod/v4";
import { isAddress } from "ethers";

const EthereumAddressSchema = z.string().refine((val) => isAddress(val), {
  message: "Invalid Ethereum address. Check format and checksum.",
});

const NonEmptyStringSchema = z.string().min(1, { message: "Name cannot be empty." });

const PublicKeySchema = z.string().regex(/^[a-zA-Z0-9+/=]+$/)

export const RegisterRequestScheme = z.object({
    publicKey: PublicKeySchema,
    blockchainAddress: EthereumAddressSchema,
    name: NonEmptyStringSchema,
    email: z.email(),
})