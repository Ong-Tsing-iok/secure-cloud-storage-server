import { join, dirname } from 'node:path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url) // get the resolved path to the file
/**
 * The name of the root directory of the project
 **/
const __dirname = dirname(dirname(__filename)) // get the name of the directory (this file is in the 'src' folder)
const __upload_dir = 'uploads'

export { __dirname, __upload_dir }
