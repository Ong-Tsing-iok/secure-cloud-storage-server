import { join, dirname } from 'node:path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url) // get the resolved path to the file
/**
 * The name of the root directory of the project
 **/
const __dirname = dirname(dirname(__filename)) // get the name of the dire
const __upload_dir = 'uploads'
const __upload_dir_path = join(__dirname, __upload_dir)
const __crypto_filepath = join(__dirname, 'src', 'py', 'crypto.py')
const keyFormatRe = /^[a-zA-Z0-9+/=]+$/

export { __upload_dir, __crypto_filepath, keyFormatRe, __upload_dir_path, __dirname }
