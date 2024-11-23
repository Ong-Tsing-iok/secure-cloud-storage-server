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
      message: 'What do you want to do?',
      choices: [
        { name: 'Get users', value: 'get-users' },
        { name: 'Return', value: 'return' }
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
        // p.push(users)
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
      message: 'What do you want to do?',
      choices: [
        { name: '啟用帳號', value: 'activate-account' },
        { name: '停用帳號', value: 'stop-account' },
        { name: '返回', value: 'return' }
      ]
    })
    if (action === 'return') return
    userId = await input({
      message: '請輸入使用者ID',
      type: 'string'
    })
    try {
      switch (action) {
        case 'stop-account':
          logger.info('manage account', { admin: true, userId, action })
          updateUserStatusById(userId, userStatusType.stopped)
          break
        case 'activate-account':
          logger.info('manage account', { admin: true, userId, action })
          updateUserStatusById(userId, userStatusType.activate)
          break
      }
    } catch (error) {
      logger.error(error, { admin: true, userId, action })
    }

    break
  }
}

while (true) {
  const action = await select({
    message: '選擇要執行的指令',
    choices: [
      { name: 'Query Database', value: 'database' },
      { name: 'Manage accounts', value: 'accounts' },
      { name: 'Exit', value: 'exit' }
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
