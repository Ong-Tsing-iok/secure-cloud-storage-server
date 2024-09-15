import { join, dirname } from 'node:path'
import { fileURLToPath } from 'url'
/**
 * The name of the root directory of the project
 **/
// const __src_dir = dirname(__filename) // get the name of the directory (this file is in the 'src' folder)
const __upload_dir = 'uploads'
const __upload_dir_path = join(__dirname, __upload_dir)
const __crypto_filepath = join(__dirname, 'py', 'crypto.py')
const keyFormatRe = /^[a-zA-Z0-9+/=]+$/

export { __upload_dir, __crypto_filepath, keyFormatRe, __upload_dir_path }
