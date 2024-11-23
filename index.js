import io from './src/SocketIO.js'
import ftpServer from './src/FtpsServer.js'
import { logger } from './src/Logger.js'
import { input, select } from '@inquirer/prompts'
import { getAllUsers, updateUserStatusById, userStatusType } from './src/StorageDatabase.js'
// import { printTable, Table } from 'console-table-printer'
import Table from 'tty-table'

const queryDatabase = async () => {
  while (true) {
    const action = await select({
      message: '選擇要執行的指令',
      choices: [
        { name: '列出所有使用者', value: 'get-users' },
        { name: '返回', value: 'return' }
      ]
    })
    switch (action) {
      case 'get-users':
        logger.info('Getting all users', { admin: true })
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
        break
      case 'return':
        return
    }
    break
  }
}

const manageAccounts = async () => {
  while (true) {
    const action = await select({
      message: '選擇要執行的指令',
      choices: [
        { name: '啟用帳號', value: 'activate-account' },
        { name: '停用帳號', value: 'stop-account' },
        { name: '返回', value: 'return' }
      ]
    })
    if (action === 'return') return
    const userId = await input({
      message: '請輸入使用者ID',
      type: 'string'
    })
    try {
      switch (action) {
        case 'stop-account':
          {
            const result = updateUserStatusById(userId, userStatusType.stopped)
            if (result.changes === 0) {
              console.log('查無此使用者')
            } else {
              console.log('停用成功')
            }
            logger.info('manage account', {
              admin: true,
              userId,
              action,
              success: result.changes > 0
            })
          }
          break
        case 'activate-account':
          {
            const result = updateUserStatusById(userId, userStatusType.activate)
            if (result.changes === 0) {
              console.log('查無此使用者')
            } else {
              console.log('啟用成功')
            }
            logger.info('manage account', {
              admin: true,
              userId,
              action,
              success: result.changes > 0
            })
          }
          break
      }
    } catch (error) {
      logger.error(error, { admin: true, userId, action })
      console.log('指令執行失敗: ' + error)
    }

    break
  }
}

while (true) {
  const action = await select({
    message: '選擇要執行的指令',
    choices: [
      { name: '查看資料庫', value: 'database' },
      { name: '管理帳號', value: 'accounts' },
      { name: '離開', value: 'exit' }
    ]
  })
  switch (action) {
    case 'database':
      await queryDatabase()
      break
    case 'accounts':
      await manageAccounts()
      break
    case 'exit':
      process.exit(0)
      break
  }
}
