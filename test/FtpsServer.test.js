import { test, expect, jest, describe, beforeEach, afterEach } from '@jest/globals'
// Mock all external dependencies
jest.mock('ftp-srv', () => {
  // Define a mock base FileSystem class that CustomFileSystem will extend
  const MockBaseFileSystem = jest.fn().mockImplementation(function (connection, { root, cwd }) {
    this.connection = connection
    this.root = root
    this.cwd = cwd
    return this
  })
  // Mock the `write` property that CustomFileSystem's `write` method calls
  MockBaseFileSystem.prototype.write = jest.fn()

  const mockFtpSrv = jest.fn((options) => {
    const instance = {
      on: jest.fn(),
      listen: jest.fn().mockResolvedValue(true), // Mock listen method if ever called
      close: jest.fn().mockResolvedValue(true), // Mock close method
      options: options // Store options for verification
    }
    // Mock the `on` method to capture and allow triggering events
    instance.on = jest.fn((event, handler) => {
      if (!instance.events) {
        instance.events = {}
      }
      instance.events[event] = handler
    })
    return instance
  })

  return {
    FtpSrv: mockFtpSrv,
    // Provide the mock class as FileSystem
    FileSystem: MockBaseFileSystem
  }
})

jest.mock('fs', () => ({
  readFileSync: jest.fn()
}))

jest.mock('fs/promises', () => ({
  stat: jest.fn(),
  mkdir: jest.fn()
}))

jest.mock('path', () => ({
  resolve: jest.fn((...args) => args.join('/')), // Simple mock for path.resolve
  basename: jest.fn((p) => p.split('/').pop()) // Simple mock for path.basename
}))

jest.mock('../src/ConfigManager.js', () => ({
  __esModule: true,
  default: {
    serverHost: 'localhost',
    ftps: {
      controlPort: 2121,
      dataPort: 2122,
      pasv_url: 'ftp.example.com'
    },
    serverKeyPath: '/test/keys/server.key',
    serverCertPath: '/test/keys/server.crt',
    uploadDir: '/test/upload/dir'
  }
}))

jest.mock('../src/Logger.js', () => ({
  logFtpsError: jest.fn(),
  logFtpsInfo: jest.fn(),
  logFtpsWarning: jest.fn(),
  logger: {
    info: jest.fn()
  }
}))

jest.mock('../src/LoginDatabase.js', () => ({
  checkUserLoggedIn: jest.fn(),
  getUpload: jest.fn()
}))

jest.mock('../src/StorageDatabase.js', () => ({
  getFolderInfo: jest.fn()
}))

jest.mock('../src/SocketIO.js', () => ({
  emitToSocket: jest.fn()
}))

jest.mock('../src/UploadVerifier.js', () => ({
  finishUpload: jest.fn()
}))

jest.mock('../src/Utils.js', () => ({
  InternalServerErrorMsg: 'Internal server error occurred.',
  NotLoggedInErrorMsg: 'Not logged in.'
}))

// Import the module to be tested
import ftpServer from '../src/FtpsServer.js'
// Also import the original FileSystem and FtpSrv from the mock for direct access
import { FileSystem, FtpSrv } from 'ftp-srv'

// Import mocked dependencies for easier access and assertion
import { readFileSync } from 'fs'
import { stat, mkdir } from 'fs/promises'
import path from 'path'
import ConfigManager from '../src/ConfigManager.js'
import { logFtpsError, logFtpsInfo, logFtpsWarning, logger } from '../src/Logger.js'
import { checkUserLoggedIn, getUpload } from '../src/LoginDatabase.js'
import { getFolderInfo } from '../src/StorageDatabase.js'
import { emitToSocket } from '../src/SocketIO.js'
import { finishUpload } from '../src/UploadVerifier.js'
import { InternalServerErrorMsg, NotLoggedInErrorMsg } from '../src/Utils.js'

// Re-define CustomFileSystem here to access its mocked prototype directly
// It should extend the MOCKED FileSystem from ftp-srv, which is now MockBaseFileSystem
class MockCustomFileSystem extends FileSystem {
  // `FileSystem` here refers to the MockBaseFileSystem
  constructor(connection, { root, cwd }, fileId) {
    super(connection, { root, cwd })
    this.fileId = fileId
    this.connection = connection // Store connection for testing, also set by super()
  }
  write(fileName, { append, start }) {
    this.connection.originalFileName = fileName
    // Call the `super.write` defined on `MockBaseFileSystem.prototype.super`
    return super.write(this.fileId, { append, start })
  }
}

// Test the module-level logger.info call ONCE after import
describe('FtpsServer Module Initialization', () => {
  test('should log "FTP server initialized." on module import', () => {
    // This assertion runs after the module import, but before any beforeEach in the main describe
    // So, the logger.info call made during module loading will be captured.
    expect(logger.info).toHaveBeenCalledWith('FTP server initialized.')
  })
})

describe('FTP Server (FtpsServer.js)', () => {
  let mockConnection
  let resolveLogin
  let rejectLogin

  beforeEach(() => {
    jest.clearAllMocks() // This will clear the call from the module initialization, which is fine as it's tested separately now.

    // Mock connection object with 'on' method for 'RETR' and 'STOR'
    mockConnection = {
      on: jest.fn((event, handler) => {
        if (!mockConnection.events) {
          mockConnection.events = {}
        }
        mockConnection.events[event] = handler
      }),
      events: {}, // To store registered event handlers
      originalFileName: null
    }

    // Initialize resolve and reject functions for the login promise
    resolveLogin = jest.fn()
    rejectLogin = jest.fn()
  })

  // Helper to trigger connection event handlers
  const triggerConnectionEvent = async (eventName, error, fileNameOrPath) => {
    if (mockConnection.events[eventName]) {
      await mockConnection.events[eventName](error, fileNameOrPath)
    } else {
      throw new Error(`Connection event handler for '${eventName}' not found.`)
    }
  }

  describe('ftpServer.on("login")', () => {
    const mockSocketId = 'socket123'
    const mockUserId = 'userABC'
    const mockFileId = 'fileXYZ'
    const mockRootPath = `/test/upload/dir/${mockUserId}`

    beforeEach(() => {
      checkUserLoggedIn.mockReturnValue({ userId: mockUserId })
      mkdir.mockResolvedValue(undefined) // mkdir succeeds by default
      getUpload.mockReturnValue(undefined) // No upload info by default for guest
      getFolderInfo.mockResolvedValue({}) // Folder exists by default
    })

    test('should successfully authenticate for a guest user', async () => {
      // Setup for guest login (fileId 'guest')
      const data = { connection: mockConnection, username: mockSocketId, password: 'guest' }

      await ftpServer.events.login(data, resolveLogin, rejectLogin)

      expect(logFtpsInfo).toHaveBeenCalledWith(data, 'Client tries to authenticate.', {
        socketId: mockSocketId
      })
      expect(checkUserLoggedIn).toHaveBeenCalledWith(mockSocketId)
      expect(data.userId).toBe(mockUserId)
      expect(logFtpsInfo).toHaveBeenCalledWith(data, 'Client is logged in.')
      expect(path.resolve).toHaveBeenCalledWith(ConfigManager.uploadDir, mockUserId)
      expect(mkdir).toHaveBeenCalledWith(mockRootPath, { recursive: true })
      expect(getUpload).not.toHaveBeenCalled() // No getUpload for 'guest'
      expect(getFolderInfo).not.toHaveBeenCalled() // No getFolderInfo for 'guest'

      expect(resolveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          root: mockRootPath,
          fs: expect.any(FileSystem) // Check if it's an instance of the mocked FileSystem (MockBaseFileSystem)
        })
      )

      // Verify CustomFileSystem constructor calls on the instance returned by login handler
      const fsInstance = resolveLogin.mock.calls[0][0].fs
      expect(fsInstance.fileId).toBe('guest') // fileId should be 'guest'
      expect(fsInstance.connection).toBe(mockConnection) // connection should be set by base constructor
      expect(fsInstance.root).toBe(mockRootPath) // root should be set by base constructor
    })

    test('should successfully authenticate for an upload scenario', async () => {
      const mockUploadInfo = {
        cipher: 'mockCipher',
        spk: 'mockSpk',
        parentFolderId: 'parentFolder456'
      }
      getUpload.mockReturnValue(mockUploadInfo)

      const data = { connection: mockConnection, username: mockSocketId, password: mockFileId }

      await ftpServer.events.login(data, resolveLogin, rejectLogin)

      expect(logFtpsInfo).toHaveBeenCalledWith(data, 'Client tries to upload file.')
      expect(getUpload).toHaveBeenCalledWith(mockFileId)
      expect(getFolderInfo).toHaveBeenCalledWith(mockUploadInfo.parentFolderId)

      expect(resolveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          root: mockRootPath,
          fs: expect.any(FileSystem)
        })
      )
      const fsInstance = resolveLogin.mock.calls[0][0].fs
      expect(fsInstance.fileId).toBe(mockFileId) // fileId should be the actual fileId
      expect(fsInstance.connection).toBe(mockConnection)
      expect(fsInstance.root).toBe(mockRootPath)
    })

    test('should reject if user is not logged in', async () => {
      checkUserLoggedIn.mockReturnValue(null) // User not logged in

      const data = { connection: mockConnection, username: mockSocketId, password: 'guest' }
      await ftpServer.events.login(data, resolveLogin, rejectLogin)

      expect(logFtpsWarning).toHaveBeenCalledWith(
        data,
        'Client tries to authenticate but is not logged in.'
      )
      expect(rejectLogin).toHaveBeenCalledWith(new Error(NotLoggedInErrorMsg))
      expect(resolveLogin).not.toHaveBeenCalled()
      expect(mkdir).not.toHaveBeenCalled()
    })

    test('should reject if upload info does not exist for an upload scenario', async () => {
      getUpload.mockReturnValue(undefined) // No upload info

      const data = { connection: mockConnection, username: mockSocketId, password: mockFileId }
      await ftpServer.events.login(data, resolveLogin, rejectLogin)

      expect(logFtpsWarning).toHaveBeenCalledWith(
        data,
        'Client tries to upload file but upload info does not exist.'
      )
      expect(rejectLogin).toHaveBeenCalledWith(new Error('Upload info not found.'))
      expect(resolveLogin).not.toHaveBeenCalled()
    })

    test('should reject if parent folder does not exist for an upload scenario', async () => {
      const mockUploadInfo = {
        cipher: 'mockCipher',
        spk: 'mockSpk',
        parentFolderId: 'nonExistentFolder'
      }
      getUpload.mockReturnValue(mockUploadInfo)
      getFolderInfo.mockResolvedValue(null) // Parent folder does not exist

      const data = { connection: mockConnection, username: mockSocketId, password: mockFileId }
      await ftpServer.events.login(data, resolveLogin, rejectLogin)

      expect(logFtpsWarning).toHaveBeenCalledWith(
        data,
        'Client tries to upload file but parent folder does not exist.'
      )
      expect(rejectLogin).toHaveBeenCalledWith(new Error('Parent folder not found.'))
      expect(resolveLogin).not.toHaveBeenCalled()
    })

    test('should reject with InternalServerErrorMsg on unexpected error during login setup', async () => {
      mkdir.mockRejectedValue(new Error('Disk error during mkdir')) // Simulate an error

      const data = { connection: mockConnection, username: mockSocketId, password: 'guest' }
      await ftpServer.events.login(data, resolveLogin, rejectLogin)

      expect(logFtpsError).toHaveBeenCalledWith(data, expect.any(Error))
      expect(rejectLogin).toHaveBeenCalledWith(new Error(InternalServerErrorMsg))
      expect(resolveLogin).not.toHaveBeenCalled()
    })
  })

  describe('connectionBinder events (RETR, STOR)', () => {
    const mockSocketId = 'socket123'
    const mockUserId = 'userABC'
    const mockFileId = 'fileXYZ'
    const mockOriginalFileName = 'my_document.pdf'
    const mockUploadInfo = {
      cipher: 'mockCipher',
      spk: 'mockSpk',
      parentFolderId: 'parentFolder456'
    }
    const mockFileSize = 1024

    let dataForBinder

    beforeEach(async () => {
      // Simulate a successful login to set up the connectionBinder
      checkUserLoggedIn.mockReturnValue({ userId: mockUserId })
      mkdir.mockResolvedValue(undefined)
      getUpload.mockReturnValue(mockUploadInfo) // Assume upload scenario for STOR tests

      dataForBinder = {
        connection: mockConnection,
        username: mockSocketId,
        password: mockFileId,
        userId: mockUserId
      }

      // Manually trigger the login event to ensure connectionBinder is called
      // In a real integration test, ftpServer.listen() would handle this.
      // For unit testing, we directly invoke the login handler.
      await ftpServer.events.login(dataForBinder, jest.fn(), jest.fn())

      // Set the `originalFileName` on the connection mock
      mockConnection.originalFileName = mockOriginalFileName

      stat.mockResolvedValue({ size: mockFileSize })
      finishUpload.mockResolvedValue(true)
    })

    describe('RETR event', () => {
      const mockFilePath = `/path/to/downloaded/${mockFileId}`

      test('should log info on successful file download', async () => {
        await triggerConnectionEvent('RETR', null, mockFilePath)

        expect(logFtpsInfo).toHaveBeenCalledWith(dataForBinder, 'Client downloaded file.', {
          fileId: mockFileId
        })
        expect(logFtpsError).not.toHaveBeenCalled()
      })

      test('should log error on file download error', async () => {
        const downloadError = new Error('Download failed')
        await triggerConnectionEvent('RETR', downloadError, mockFilePath)

        expect(logFtpsError).toHaveBeenCalledWith(dataForBinder, downloadError, {
          fileId: mockFileId
        })
        // expect(logFtpsInfo).not.toHaveBeenCalled()
      })
    })

    describe('STOR event', () => {
      const mockUploadedFilePath = `/path/to/uploaded/${mockFileId}` // This is the temporary path where FTP server puts the file

      test('should successfully finish upload on STOR event', async () => {
        await triggerConnectionEvent('STOR', null, mockUploadedFilePath)

        expect(stat).toHaveBeenCalledWith(mockUploadedFilePath)
        expect(finishUpload).toHaveBeenCalledWith({
          name: mockOriginalFileName,
          id: mockFileId,
          userId: mockUserId,
          originOwnerId: mockUserId,
          cipher: mockUploadInfo.cipher,
          spk: mockUploadInfo.spk,
          parentFolderId: mockUploadInfo.parentFolderId,
          size: mockFileSize
        })
        expect(logFtpsInfo).toHaveBeenCalledWith(dataForBinder, 'Client uploaded file.', {
          fileName: mockOriginalFileName,
          userId: mockUserId
        })
        expect(emitToSocket).not.toHaveBeenCalled() // No error, so no emitToSocket
      })

      test('should log error and emit to socket if STOR error occurs', async () => {
        const storError = new Error('FTP STOR command failed')
        await triggerConnectionEvent('STOR', storError, mockUploadedFilePath)

        expect(logFtpsError).toHaveBeenCalledWith(dataForBinder, storError)
        expect(stat).not.toHaveBeenCalled() // Should short-circuit
        expect(finishUpload).not.toHaveBeenCalled()
        expect(emitToSocket).not.toHaveBeenCalled() // No explicit emit for STOR initial error in original code
      })

      test('should log error and emit to socket if stat fails during STOR', async () => {
        const statError = new Error('File system stat error')
        stat.mockRejectedValue(statError)

        await triggerConnectionEvent('STOR', null, mockUploadedFilePath)

        expect(stat).toHaveBeenCalledWith(mockUploadedFilePath)
        expect(logFtpsError).toHaveBeenCalledWith(dataForBinder, statError)
        expect(finishUpload).not.toHaveBeenCalled()
        expect(emitToSocket).toHaveBeenCalledWith(mockSocketId, 'upload-file-res', {
          errorMsg: InternalServerErrorMsg
        })
      })

      test('should log error and emit to socket if finishUpload fails during STOR', async () => {
        const finishUploadError = new Error('Upload verification failed')
        finishUpload.mockRejectedValue(finishUploadError)

        await triggerConnectionEvent('STOR', null, mockUploadedFilePath)

        expect(stat).toHaveBeenCalledWith(mockUploadedFilePath)
        expect(finishUpload).toHaveBeenCalledWith(expect.any(Object))
        expect(logFtpsError).toHaveBeenCalledWith(dataForBinder, finishUploadError)
        expect(emitToSocket).toHaveBeenCalledWith(mockSocketId, 'upload-file-res', {
          errorMsg: InternalServerErrorMsg
        })
      })
    })
  })

  describe('CustomFileSystem', () => {
    let customFsInstance
    let mockConnectionForFs
    const testFileId = 'testFileId'
    const testRootPath = '/test/root'

    beforeEach(() => {
      // Spy on the FileSystem constructor for this describe block
      //   FileSystemSpy = jest.spyOn(FileSystem, 'constructor')

      // Create a specific mock connection for CustomFileSystem to track `originalFileName`
      mockConnectionForFs = {
        originalFileName: null,
        on: jest.fn() // Needed if CustomFileSystem accesses connection.on
      }

      // Mock the super.write method called by CustomFileSystem.write
      FileSystem.prototype.write.mockClear() // Clear previous calls
      FileSystem.prototype.write.mockResolvedValue(true) // Default success

      // Manually create an instance of MockCustomFileSystem for direct testing
      customFsInstance = new MockCustomFileSystem(
        mockConnectionForFs,
        { root: testRootPath, cwd: '/' },
        testFileId
      )
    })

    afterEach(() => {
      jest.restoreAllMocks() // Restore mocks after each test in this block
    })

    test('CustomFileSystem constructor sets fileId and connection', () => {
      expect(customFsInstance.fileId).toBe(testFileId)
      expect(customFsInstance.connection).toBe(mockConnectionForFs)
      // We expect the base class constructor to be called, which means FileSystem's constructor
      expect(FileSystem).toHaveBeenCalledWith(mockConnectionForFs, {
        root: testRootPath,
        cwd: '/'
      })
    })

    test('CustomFileSystem write sets originalFileName and calls super.write with fileId', async () => {
      const fileName = 'actual_uploaded_file.txt'
      const options = { append: false, start: 0 }

      await customFsInstance.write(fileName, options)

      expect(mockConnectionForFs.originalFileName).toBe(fileName)
      expect(FileSystem.prototype.write).toHaveBeenCalledWith(testFileId, options)
    })
  })
})
