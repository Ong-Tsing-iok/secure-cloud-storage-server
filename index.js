import io, { disconnectSocket } from './src/SocketIO.js'
import ftpServer from './src/FtpsServer.js'
import { logger } from './src/Logger.js'
import { input, select, confirm } from '@inquirer/prompts'
import { rm } from 'fs/promises'
import { join } from 'path'
import {
  deleteUserById,
  getAllUsers,
  getFilesOfOwnerId,
  updateUserStatusById,
  userStatusType
} from './src/StorageDatabase.js'
// import { printTable, Table } from 'console-table-printer'
import Table from 'tty-table'
import { getAllLoginUsers, getSocketId, removeUpload } from './src/LoginDatabase.js'
import ConfigManager from './src/ConfigManager.js'

const queryDatabase = async () => {
  while (true) {
    let success = false
    const adminAction = await select({
      message: '選擇要執行的指令',
      choices: [
        { name: '列出所有使用者', value: 'get-users' },
        { name: '列出線上使用者', value: 'get-online-users' },
        { name: '列出使用者檔案', value: 'get-files-of-user' },
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
            const users = getAllUsers()
            const p = new Table(header, users).render()
            console.log(p)
            success = true
          }

          break
        case 'get-online-users':
          const header = [
            { value: 'userId', align: 'left' },
            { value: 'socketId', align: 'left' },
            { value: 'timestamp', alias: 'login time', align: 'left' }
          ]
          const users = getAllLoginUsers()
          const p = new Table(header, users).render()
          console.log(p)
          success = true
          break
        case 'get-files-of-user':
          {
            const userId = await input({
              message: '請輸入使用者ID'
            })
            const header = [
              { value: 'id', align: 'left' },
              { value: 'name', align: 'left' },
              { value: 'size', align: 'left' },
              { value: 'permissions', align: 'left' },
              { value: 'description', align: 'left' },
              { value: 'timestamp', alias: 'created time', align: 'left' }
            ]
            const files = getFilesOfOwnerId(userId)
            const p = new Table(header, files).render()
            console.log(p)
            success = true
          }
        case 'return':
          return
      }
    } catch (error) {
      logger.error(error, { adminAction })
      console.log('指令執行失敗: ' + error)
    }
    logger.info('query database', { adminAction, success })

    break
  }
}

const deleteAccount = async (userId) => {
  let success = false
  try {
    const yes = await confirm({
      message: '確定要刪除此帳號嗎?'
    })
    if (!yes) {
      console.log('刪除已取消')
      return
    }
    const result = updateUserStatusById(userId, userStatusType.stopped)
    if (result.changes === 0) {
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
    const fileInfo = getFilesOfOwnerId(userId)
    await rm(join(ConfigManager.uploadDir, userId), { recursive: true, force: true })
    deleteUserById(userId)
    success = true
    console.log('刪除成功')
  } catch (error) {
    throw error
  }
  return success
}

const manageAccounts = async () => {
  while (true) {
    let success = false
    const adminAction = await select({
      message: '選擇要執行的指令',
      choices: [
        { name: '啟用帳號', value: 'activate-account' },
        { name: '停用帳號', value: 'stop-account' },
        { name: '刪除帳號', value: 'delete-account' },
        { name: '返回', value: 'return' }
      ]
    })
    if (adminAction === 'return') return
    const userId = await input({
      message: '請輸入使用者ID',
      type: 'string'
    })
    try {
      switch (adminAction) {
        case 'stop-account':
          {
            const result = updateUserStatusById(userId, userStatusType.stopped)
            if (result.changes === 0) {
              console.log('查無此使用者')
            } else {
              const loginInfo = getSocketId(userId)
              if (loginInfo) {
                disconnectSocket(loginInfo.socketId)
              }
              console.log('停用成功')
              success = true
            }
          }
          break
        case 'activate-account':
          {
            const result = updateUserStatusById(userId, userStatusType.activate)
            if (result.changes === 0) {
              console.log('查無此使用者')
            } else {
              console.log('啟用成功')
              success = true
            }
          }
          break
        case 'delete-account':
          success = await deleteAccount(userId)
          break
      }
    } catch (error) {
      logger.error(error, { userId, adminAction })
      console.log('指令執行失敗: ' + error)
    }
    logger.info('manage accounts', { userId, adminAction, success })
    break
  }
}

while (true) {
  const adminAction = await select({
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
      const yes = await confirm({
        message: '確定要關閉伺服器嗎?'
      })
      if (yes) process.exit(0)
      break
  }
}
