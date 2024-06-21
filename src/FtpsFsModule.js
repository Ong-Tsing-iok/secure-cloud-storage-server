import fs from 'fs'
import { logger } from './Logger.js'
import { addFileToDatabase } from './StorageDatabase.js'
import { randomUUID } from 'crypto'
import { basename, dirname, join } from 'path'

const unlink = (path, callback) => {
  // currently shouldn't be called
  logger.error('unlink should not be called')
  callback(new Error('unlink should not be called'))
  // fs.unlink(path, callback)
}

const readdir = (path, callback) => {
  fs.readdir(path, callback)
}

const mkdir = (path, options, callback) => {
  // currently shouldn't be called
  logger.error('mkdir should not be called')
  callback(new Error('mkdir should not be called'))
  // fs.mkdir(path, options, callback)
}

const open = (path, flags, callback) => {
  fs.open(path, flags, callback)
}

const close = (fd, callback) => {
  fs.close(fd, callback)
}

const rmdir = (path, callback) => {
  // currently shouldn't be called
  logger.error('rmdir should not be called')
  callback(new Error('rmdir should not be called'))
  // fs.rmdir(path, callback)
}

const rename = (oldPath, newPath, callback) => {
  // currently shouldn't be called
  logger.error('rename should not be called')
  callback(new Error('rename should not be called'))
  // fs.rename(oldPath, newPath, callback)
}

const stat = (path, callback) => {
  fs.stat(path, callback)
}

const createWriteStream = (path, options) => {
  // Need to store into database first and change name to uuid
  const uuid = randomUUID()
  const filename = basename(path)
  const dir_name = dirname(path) // Should be the userId at end of path
  const userId = Number(basename(dir_name))
  logger.info(`Creating write stream for ${path}`)
  addFileToDatabase(filename, uuid, userId)
  return fs.createWriteStream(path, options)
}

const createReadStream = (path, options) => {
  logger.info(`Creating read stream for ${path}`)
  return fs.createReadStream(path, options)
}

export default {
  unlink,
  readdir,
  mkdir,
  open,
  close,
  rmdir,
  rename,
  stat,
  createWriteStream,
  createReadStream
}
