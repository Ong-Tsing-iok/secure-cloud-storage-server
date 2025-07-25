import { blockchainManager, disconnectSocket } from './src/SocketIO.js'
import ftpServer from './src/FtpsServer.js'
import { logger } from './src/Logger.js'
import { input, select, confirm } from '@inquirer/prompts'
import { rm } from 'fs/promises'
import { join } from 'path'
import {
  deleteUserById,
  getAllFiles,
  getAllRequestsResponsesByRequester,
  getAllRequestsResponsesFilesByOwner,
  getAllUsers,
  getFilesOfOwnerId,
  getUserById,
  updateUserInfoById,
  updateUserStatusById,
  userStatusType
} from './src/StorageDatabase.js'
// import { printTable, Table } from 'console-table-printer'
import Table from 'tty-table'
import { getAllLoginUsers, getSocketId, removeUpload } from './src/LoginDatabase.js'
import ConfigManager from './src/ConfigManager.js'
import { emailFormatRe, uuidFormatRe } from './src/Utils.js'
import './src/HttpsServer.js'

ftpServer.listen().then(() => {
  logger.info(`Ftp server listening on port ${ConfigManager.ftps.controlPort}`)
})

const controller = new AbortController()
const stdin = process.stdin
stdin.resume()

// i don't want binary, do you?
stdin.setEncoding('utf8')

// on any data into stdin
stdin.on('data', function (key) {
  // ctrl-c ( end of text )
  if (key == '\u0003') {
    process.exit()
  }
  if (key == '\u001b') {
    controller.abort()
  }
  // write the key to stdout all normal like
  // process.stdout.write(key)
})
const fileHeaders = [
  { value: 'id', align: 'left' },
  { value: 'name', align: 'left' },
  { value: 'size', align: 'left' },
  { value: 'permissions', align: 'left' },
  { value: 'description', align: 'left' },
  { value: 'timestamp', alias: 'created time', align: 'left' }
]

const getUserIdInput = async () => {
  const userId = (
    await input({
      message: '請輸入使用者ID'
    })
  ).trim()
  if (!uuidFormatRe.test(userId)) {
    console.log('使用者ID格式不正確')
    return null
  }
  return userId
}
const queryDatabase = async () => {
  let success = false
  const adminAction = await select({
    message: '選擇要執行的指令',
    choices: [
      { name: '列出所有使用者', value: 'get-users' },
      { name: '列出線上使用者', value: 'get-online-users' },
      { name: '列出使用者檔案', value: 'get-files-of-user' },
      // { name: '列出所有檔案', value: 'get-all-files' },
      { name: '列出使用者請求', value: 'get-requests' },
      { name: '列出使用者回覆', value: 'get-responses' },
      { name: '返回', value: 'return' }
    ]
  })
  try {
    switch (adminAction) {
      case 'get-users':
        {
          const header = [
            { value: 'id', align: 'left' },
            { value: 'name', align: 'left' },
            { value: 'email', align: 'left' },
            { value: 'pk', align: 'left', width: '30%' },
            { value: 'status', align: 'left' },
            { value: 'timestamp', alias: 'created time', align: 'left' }
          ]
          const users = await getAllUsers()
          const p = new Table(header, users).render()
          console.log(p)
          success = true
        }

        break
      case 'get-online-users':
        {
          const header = [
            { value: 'userId', align: 'left' },
            { value: 'socketId', align: 'left' },
            { value: 'timestamp', alias: 'login time', align: 'left' }
          ]
          const users = getAllLoginUsers()
          const p = new Table(header, users).render()
          console.log(p)
          success = true
        }

        break
      case 'get-files-of-user':
        {
          const userId = await getUserIdInput()
          if (!userId) return
          const files = await getFilesOfOwnerId(userId)
          const p = new Table(fileHeaders, files).render()
          console.log(p)
          success = true
        }
        break
      case 'get-all-files':
        {
          const files = await getAllFiles()
          console.log(new Table(fileHeaders, files).render())
          success = true
        }
        break
      case 'get-requests':
        {
          const userId = await getUserIdInput()
          if (!userId) return
          const requests = await getAllRequestsResponsesByRequester(userId)
          const p = new Table(
            [
              { value: 'requestId', align: 'left' },
              { value: 'fileId', align: 'left' },
              { value: 'requester', align: 'left' },
              { value: 'requestDescription', alias: 'description', align: 'left' },
              { value: 'requestTime', align: 'left' },
              { value: 'agreed', align: 'left' }
            ],
            requests
          ).render()
          console.log(p)
          success = true
        }
        break
      case 'get-responses': {
        const userId = await getUserIdInput()
        if (!userId) return
        const responses = await getAllRequestsResponsesFilesByOwner(userId)
        const p = new Table(
          [
            { value: 'requestId', align: 'left' },
            { value: 'fileId', align: 'left' },
            { value: 'requester', align: 'left' },
            { value: 'ownerId', alias: 'responder', align: 'left' },
            { value: 'agreed', align: 'left' },
            { value: 'responseDescription', alias: 'description', align: 'left' },
            { value: 'responseTime', align: 'left' }
          ],
          responses
        ).render()
        console.log(p)
        success = true
      }
      break
      case 'return':
        return
    }
  } catch (error) {
    logger.error(error, { adminAction })
    console.log('指令執行失敗: ' + error)
  } finally {
    if (adminAction !== 'return') logger.info('query database', { adminAction, success })
  }
}

const deleteAccount = async (userId) => {
  let success = false

  const yes = await confirm({
    message: '確定要刪除此帳號嗎?'
  })
  if (!yes) {
    console.log('刪除已取消')
    return
  }
  const result = await updateUserStatusById(userId, userStatusType.stopped)
  if (result.rowCount === 0) {
    console.log('查無此使用者')
    return
  }
  console.log('刪除中...')
  // check if logined
  const loginInfo = getSocketId(userId)
  if (loginInfo) {
    disconnectSocket(loginInfo.socketId)
    // delete all upload table info
    removeUpload(loginInfo.userId)
  }
  const userInfo = await getUserById(userId)
  await blockchainManager.setClientStatus(userInfo.address, false)
  await rm(join(ConfigManager.uploadDir, userId), { recursive: true, force: true })
  await deleteUserById(userId)
  success = true
  console.log('刪除成功')

  return success
}

const updateAccount = async (userInfo) => {
  let success = false
  try {
    const name = (
      await input(
        {
          message: '請輸入使用者名稱',
          type: 'string',
          required: true,
          default: userInfo.name
        },
        { signal: controller.signal }
      )
    ).trim()
    const email = (
      await input(
        {
          message: '請輸入使用者Email',
          type: 'string',
          required: true,
          default: userInfo.email,
          validate: (email) => {
            if (!emailFormatRe.test(email)) {
              return 'Email格式不正確'
            }
            return true
          }
        },
        { signal: controller.signal }
      )
    ).trim()
    await updateUserInfoById(userInfo.id, name, email)
    console.log('更新成功')
    logger.info('successfully updated account', {
      userId: userInfo.id,
      name,
      email,
      adminAction: 'update-account'
    })
    success = true
  } catch (error) {
    if (error.name === 'AbortPromptError') {
      console.log('更新已取消')
    } else {
      throw error
    }
  }
  return success
}

const manageAccounts = async () => {
  let success = false
  const adminAction = await select({
    message: '選擇要執行的指令',
    choices: [
      { name: '啟用帳號', value: 'activate-account' },
      { name: '停用帳號', value: 'stop-account' },
      { name: '刪除帳號', value: 'delete-account' },
      { name: '更新帳號資訊', value: 'update-account' },
      { name: '返回', value: 'return' }
    ]
  })
  if (adminAction === 'return') return
  let userId = null
  try {
    userId = await getUserIdInput()
    if (!userId) return
    const userInfo = await getUserById(userId)
    if (!userInfo) {
      console.log('查無此使用者')
      return
    }
    switch (adminAction) {
      case 'stop-account':
        {
          await updateUserStatusById(userId, userStatusType.stopped)
          const loginInfo = getSocketId(userId)
          if (loginInfo) {
            disconnectSocket(loginInfo.socketId)
          }
          console.log('停用成功')
          success = true
        }
        break
      case 'activate-account':
        await updateUserStatusById(userId, userStatusType.activate)
        console.log('啟用成功')
        success = true
        break
      case 'delete-account':
        success = await deleteAccount(userId)
        break
      case 'update-account':
        success = await updateAccount(userInfo)
        break
    }
  } catch (error) {
    logger.error(error, { userId, adminAction })
    console.log('指令執行失敗: ' + error)
  } finally {
    logger.info('manage accounts', { userId, adminAction, success })
  }
}

while (true) {
  let adminAction = null
  try {
    adminAction = await select({
      message: '選擇要執行的指令',
      choices: [
        { name: '查看資料庫', value: 'database' },
        { name: '管理帳號', value: 'accounts' },
        { name: '關閉伺服器', value: 'exit' }
      ]
    })
    switch (adminAction) {
      case 'database':
        await queryDatabase()
        break
      case 'accounts':
        await manageAccounts()
        break
      case 'exit':
        {
          const yes = await confirm({
            message: '確定要關閉伺服器嗎?'
          })
          if (yes) process.exit(0)
        }
        break
    }
  } catch (error) {
    logger.error(error, { adminAction })
  }
}
