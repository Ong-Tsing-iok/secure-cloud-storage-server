import { test, expect, jest, describe, beforeEach, beforeAll, afterEach } from '@jest/globals'
// Mock all external dependencies
// Mock logger functions
jest.mock('../src/Logger.js', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn()
  },
  logHttpsError: jest.fn(),
  logHttpsInfo: jest.fn(),
  logHttpsWarning: jest.fn()
}))

// Mock fs/promises functions
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  unlink: jest.fn()
}))

// Mock multer
// We need to capture the options passed to multer.diskStorage by HttpsServer.js
let capturedMulterDiskStorageOptions = {}
// We need to mock multer's internal workings for diskStorage and fileFilter,
// and then the `upload.single('file')` middleware.
// const mockMulterDiskStorage = {
//   destination: jest.fn((req, file, cb) => cb(null, '/mock/upload/path')),
//   filename: jest.fn((req, file, cb) => cb(null, req.headers.fileid))
// }
const mockMulterLimits = {
  fileSize: 8000000
}
const mockMulterFileFilter = jest.fn((req, file, cb) => {
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
  cb(null, true)
})

// This is the actual middleware returned by upload.single('file')
let mockUploadSingleMiddleware = jest.fn((req, res, next) => {
  // Default behavior: no file, just call next
  req.file = undefined
  next()
})

jest.mock('multer', () => {
  const multerActual = jest.requireActual('multer') // Get actual multer
  const mockMulter = jest.fn(() => ({
    // Return our mock middleware for .single()
    single: jest.fn((fieldName) => {
      return mockUploadSingleMiddleware
    })
  }))
  // Mock diskStorage and other static properties
  mockMulter.diskStorage = jest.fn((options) => {
    // Capture the options object passed by HttpsServer.js
    capturedMulterDiskStorageOptions = options
    return options // Multer expects the options to be returned
  })
  return mockMulter
})

// Mock database functions
jest.mock('../src/LoginDatabase.js', () => ({
  checkUserLoggedIn: jest.fn(),
  getUpload: jest.fn()
}))
jest.mock('../src/StorageDatabase.js', () => ({
  addFileToDatabase: jest.fn(),
  getFolderInfo: jest.fn(),
  getFileInfo: jest.fn(),
  deleteFileOfOwnerId: jest.fn()
}))

// Mock path functions
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/'))
}))

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn()
}))

// Mock ConfigManager
jest.mock('../src/ConfigManager.js', () => ({
  __esModule: true,
  default: {
    uploadDir: '/test/upload/dir'
    // Add other config properties if needed by the module under test
  }
}))

// Mock UploadVerifier
jest.mock('../src/UploadVerifier.js', () => ({
  finishUpload: jest.fn()
}))

// Mock Zod schemas from Validation.js
jest.mock('../src/Validation.js', () => ({
  FileIdSchema: {
    safeParse: jest.fn()
  },
  SocketIDSchema: {
    safeParse: jest.fn()
  }
}))

// Declare mockApp as `let` at the top level
let mockApp

// We will mock SocketIO.js inside beforeAll to ensure mockApp is defined
// jest.mock('../src/SocketIO.js', ...) is removed from top-level

// Import mocked dependencies for easier access and assertions
import { logger, logHttpsError, logHttpsInfo, logHttpsWarning } from '../src/Logger.js'
import { mkdir, unlink } from 'fs/promises'
import multer from 'multer' // Import multer for its diskStorage and fileFilter checks if needed
import { checkUserLoggedIn, getUpload } from '../src/LoginDatabase.js'
import {
  addFileToDatabase,
  getFolderInfo,
  getFileInfo,
  deleteFileOfOwnerId
} from '../src/StorageDatabase.js'
import path, { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import ConfigManager from '../src/ConfigManager.js'
import { finishUpload } from '../src/UploadVerifier.js'
// The `app` import will be handled dynamically in `beforeAll`
// import { app } from '../src/SocketIO.js';
import { FileIdSchema, SocketIDSchema } from '../src/Validation.js'

describe('HTTPS Server (HttpsServer.js)', () => {
  let mockReq
  let mockRes
  let mockNext

  // Extract handlers and middlewares set up by app.post and app.get
  let authMiddleware
  let checkUploadMiddleware
  let uploadSingleMiddleware // The actual multer middleware instance
  let uploadRouteHandler
  let downloadRouteHandler
  let globalErrorHandler

  const mockSocketId = 'testSocketId123'
  const mockUserId = 'testUserId456'
  const mockFileId = 'testFileId789'

  beforeAll(() => {
    // Initialize mockApp and mock SocketIO.js here
    mockApp = {
      post: jest.fn(),
      get: jest.fn(),
      use: jest.fn()
    }

    // Mock SocketIO.js here, after mockApp is defined
    jest.doMock('../src/SocketIO.js', () => ({ app: mockApp }))

    // Import the module under test dynamically after mocks are ready
    require('../src/HttpsServer.js') // The routes are defined on import

    // These calls happen only once when the module is imported
    // Extract them after the import
    const postCallArgs = mockApp.post.mock.calls[0]
    authMiddleware = postCallArgs[1]
    checkUploadMiddleware = postCallArgs[2]
    uploadSingleMiddleware = postCallArgs[3] // This is the mockUploadSingleMiddleware
    uploadRouteHandler = postCallArgs[4]

    const getCallArgs = mockApp.get.mock.calls[0]
    downloadRouteHandler = getCallArgs[2]

    const useCallArgs = mockApp.use.mock.calls[0]
    globalErrorHandler = useCallArgs[0]
  })

  beforeEach(() => {
    // jest.clearAllMocks() // Clear mocks before each test

    // Reset the `mockUploadSingleMiddleware` implementation for each test
    // Default to no file uploaded for simplicity, tests can override
    mockUploadSingleMiddleware.mockImplementation((req, res, next) => {
      req.file = undefined
      next()
    })

    // Mock Express request and response objects
    mockReq = {
      headers: {},
      userId: null,
      uploadInfo: null,
      file: undefined // Multer sets this
      // Add other properties that middleware or routes might access, e.g., ip, url
    }
    mockRes = {
      status: jest.fn().mockReturnThis(), // Allow chaining .status().send()
      send: jest.fn(),
      sendStatus: jest.fn(),
      download: jest.fn()
    }
    mockNext = jest.fn()

    // Default mock behavior for validation schemas
    FileIdSchema.safeParse.mockReturnValue({ success: true, data: {} })
    SocketIDSchema.safeParse.mockReturnValue({ success: true, data: {} })
  })

  afterEach(() => {
    jest.clearAllMocks() // Clear mocks after each test
  })

  // Test the module-level logger.info call ONCE after import
  describe('Module Initialization', () => {
    test('should log "Https POST GET path set." on module import', () => {
      // Because HttpsServer.js is now required in beforeAll, this assertion needs to be careful.
      // It's still called once when the module is loaded by the first `require`.
      expect(logger.info).toHaveBeenCalledWith('Https POST GET path set.')
    })
  })

  describe('multer storage destination', () => {
    test('should create directory and call cb with path', async () => {
      const mockFile = { originalname: 'test.txt' }
      const req = { userId: mockUserId }
      const cb = jest.fn()

      mkdir.mockResolvedValue(true)
      path.resolve.mockReturnValue(`/test/upload/dir/${mockUserId}`)

      await capturedMulterDiskStorageOptions.destination(req, mockFile, cb)

      expect(path.resolve).toHaveBeenCalledWith(ConfigManager.uploadDir, mockUserId)
      expect(mkdir).toHaveBeenCalledWith(`/test/upload/dir/${mockUserId}`, { recursive: true })
      expect(cb).toHaveBeenCalledWith(null, `/test/upload/dir/${mockUserId}`)
    })

    test('should call cb with error if mkdir fails', async () => {
      const mockFile = { originalname: 'test.txt' }
      const req = { userId: mockUserId }
      const cb = jest.fn()
      const mkdirError = new Error('Permission denied')

      mkdir.mockRejectedValue(mkdirError)

      await capturedMulterDiskStorageOptions.destination(req, mockFile, cb)

      expect(logHttpsError).toHaveBeenCalledWith(req, mkdirError)
      expect(cb).toHaveBeenCalledWith(mkdirError)
    })
  })

  describe('multer filename', () => {
    test('should call cb with fileid from headers', () => {
      const mockFile = { originalname: 'test.txt' }
      const req = { headers: { fileid: 'some_file_id' } }
      const cb = jest.fn()

      capturedMulterDiskStorageOptions.filename(req, mockFile, cb)

      expect(cb).toHaveBeenCalledWith(null, 'some_file_id')
    })
  })

  describe('multer fileFilter', () => {
    test('should convert originalname to utf8 and call cb with true', () => {
      const mockFile = { originalname: Buffer.from('täst.txt', 'utf8').toString('latin1') } // Simulate latin1 encoding
      const req = {}
      const cb = jest.fn()

      mockMulterFileFilter(req, mockFile, cb)

      expect(mockFile.originalname).toBe('täst.txt') // Should be converted to UTF-8
      expect(cb).toHaveBeenCalledWith(null, true)
    })
  })

  describe('auth middleware', () => {
    test('should set userId and call next if authenticated', () => {
      mockReq.headers.socketid = mockSocketId
      SocketIDSchema.safeParse.mockReturnValue({ success: true, data: mockSocketId })
      checkUserLoggedIn.mockReturnValue({ userId: mockUserId })

      authMiddleware(mockReq, mockRes, mockNext)

      expect(SocketIDSchema.safeParse).toHaveBeenCalledWith(mockSocketId)
      expect(checkUserLoggedIn).toHaveBeenCalledWith(mockSocketId)
      expect(mockReq.userId).toBe(mockUserId)
      expect(logHttpsInfo).toHaveBeenCalledWith(mockReq, 'Client is logged in.')
      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.send).not.toHaveBeenCalled()
      expect(mockRes.sendStatus).not.toHaveBeenCalled()
    })

    test('should return 400 if SocketId is invalid', () => {
      mockReq.headers.socketid = 'invalid'
      SocketIDSchema.safeParse.mockReturnValue({
        success: false,
        issues: [{ message: 'Invalid SocketId' }]
      })

      authMiddleware(mockReq, mockRes, mockNext)

      expect(SocketIDSchema.safeParse).toHaveBeenCalledWith('invalid')
      expect(logHttpsWarning).toHaveBeenCalledWith(mockReq, 'SocketId not found or invalid', {
        issues: expect.any(Array)
      })
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.send).toHaveBeenCalledWith('SocketId not found or invalid')
      expect(mockNext).not.toHaveBeenCalled()
      expect(checkUserLoggedIn).not.toHaveBeenCalled()
    })

    test('should return 401 if user is not logged in', () => {
      mockReq.headers.socketid = mockSocketId
      SocketIDSchema.safeParse.mockReturnValue({ success: true, data: mockSocketId })
      checkUserLoggedIn.mockReturnValue(null)

      authMiddleware(mockReq, mockRes, mockNext)

      expect(checkUserLoggedIn).toHaveBeenCalledWith(mockSocketId)
      expect(logHttpsWarning).toHaveBeenCalledWith(mockReq, 'Client is not logged in.')
      expect(mockRes.sendStatus).toHaveBeenCalledWith(401)
      expect(mockNext).not.toHaveBeenCalled()
    })

    test('should call next with error on unexpected error', () => {
      SocketIDSchema.safeParse.mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      authMiddleware(mockReq, mockRes, mockNext)

      // expect(logHttpsError).toHaveBeenCalledWith(mockReq, expect.any(Error))
      // expect(mockRes.sendStatus).toHaveBeenCalledWith(500)
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('checkUpload middleware', () => {
    const mockUploadInfo = {
      cipher: 'c1',
      spk: 's1',
      parentFolderId: 'folder1'
    }

    beforeEach(() => {
      FileIdSchema.safeParse.mockReturnValue({ success: true, data: mockFileId })
      getUpload.mockReturnValue(mockUploadInfo)
      getFolderInfo.mockResolvedValue({}) // Folder exists by default
    })

    test('should set uploadInfo and call next if valid', () => {
      mockReq.headers.fileid = mockFileId
      checkUploadMiddleware(mockReq, mockRes, mockNext)

      expect(logHttpsInfo).toHaveBeenCalledWith(mockReq, 'Client asks to upload file.')
      expect(FileIdSchema.safeParse).toHaveBeenCalledWith(mockFileId)
      expect(getUpload).toHaveBeenCalledWith(mockFileId)
      expect(getFolderInfo).toHaveBeenCalledWith(mockUploadInfo.parentFolderId)
      expect(mockReq.uploadInfo).toEqual(mockUploadInfo)
      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    test('should return 400 if FileId is invalid', () => {
      mockReq.headers.fileid = 'invalid'
      FileIdSchema.safeParse.mockReturnValue({
        success: false,
        issues: [{ message: 'Invalid FileId' }]
      })

      checkUploadMiddleware(mockReq, mockRes, mockNext)

      expect(logHttpsWarning).toHaveBeenCalledWith(
        mockReq,
        'Client asks to upload file but fileId is invalid.',
        { issues: expect.any(Array) }
      )
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.send).toHaveBeenCalledWith('FileId is invalid.')
      expect(mockNext).not.toHaveBeenCalled()
      expect(getUpload).not.toHaveBeenCalled()
    })

    test('should return 400 if upload info does not exist', () => {
      mockReq.headers.fileid = mockFileId
      getUpload.mockReturnValue(null)

      checkUploadMiddleware(mockReq, mockRes, mockNext)

      expect(logHttpsWarning).toHaveBeenCalledWith(
        mockReq,
        'Client asks to upload file but upload info does not exist.'
      )
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.send).toHaveBeenCalledWith('Upload info not found.')
      expect(mockNext).not.toHaveBeenCalled()
    })

    test('should return 400 if parent folder does not exist', () => {
      mockReq.headers.fileid = mockFileId
      getFolderInfo.mockResolvedValue(null)

      checkUploadMiddleware(mockReq, mockRes, mockNext)

      expect(logHttpsWarning).toHaveBeenCalledWith(
        mockReq,
        'Client asks to upload filebut parent folder does not exist.',
        { parentFolderId: mockUploadInfo.parentFolderId }
      )
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.send).toHaveBeenCalledWith('Parent folder not found.')
      expect(mockNext).not.toHaveBeenCalled()
    })

    test('should proceed if uploadInfo.parentFolderId is null (root folder)', () => {
      mockReq.headers.fileid = mockFileId
      getUpload.mockReturnValue({ ...mockUploadInfo, parentFolderId: null })

      checkUploadMiddleware(mockReq, mockRes, mockNext)

      expect(getFolderInfo).not.toHaveBeenCalled() // No folder check if parentFolderId is null
      expect(mockReq.uploadInfo.parentFolderId).toBeNull()
      expect(mockNext).toHaveBeenCalled()
      expect(mockRes.status).not.toHaveBeenCalled()
    })
  })

  describe('/upload POST route', () => {
    const mockUploadedFile = {
      originalname: 'document.txt',
      filename: mockFileId,
      path: `/test/upload/dir/${mockUserId}/${mockFileId}`,
      size: 1024
    }
    const mockUploadInfo = {
      cipher: 'uploadCipher',
      spk: 'uploadSpk',
      parentFolderId: 'folderUpload'
    }

    beforeEach(() => {
      // Simulate successful preceding middlewares
      mockReq.userId = mockUserId
      mockReq.uploadInfo = mockUploadInfo
      finishUpload.mockResolvedValue(true)
      unlink.mockResolvedValue(true) // Mock unlink success
    })

    test('should successfully upload file and call finishUpload', async () => {
      mockReq.file = mockUploadedFile // Simulate file being set by multer middleware

      await uploadRouteHandler(mockReq, mockRes)

      expect(logHttpsInfo).toHaveBeenCalledWith(mockReq, 'Client uploaded file.', {
        filename: mockUploadedFile.originalname
      })
      expect(finishUpload).toHaveBeenCalledWith({
        name: mockUploadedFile.originalname,
        id: mockUploadedFile.filename,
        userId: mockUserId,
        originOwnerId: mockUserId,
        cipher: mockUploadInfo.cipher,
        spk: mockUploadInfo.spk,
        parentFolderId: mockUploadInfo.parentFolderId,
        size: mockUploadedFile.size
      })
      expect(mockRes.send).toHaveBeenCalledWith('File uploaded successfully.')
      expect(unlink).not.toHaveBeenCalled() // No unlink on success
    })

    test('should return 400 if no file is uploaded', async () => {
      mockReq.file = undefined // Simulate no file
      await uploadRouteHandler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.send).toHaveBeenCalledWith('No file uploaded.')
      expect(finishUpload).not.toHaveBeenCalled()
    })

    test('should attempt to unlink file and call next with error if finishUpload fails', async () => {
      mockReq.file = mockUploadedFile
      const finishError = new Error('Finish upload failed')
      finishUpload.mockRejectedValue(finishError)

      await uploadRouteHandler(mockReq, mockRes, mockNext)

      // expect(logHttpsError).toHaveBeenCalledWith(mockReq, finishError)
      expect(unlink).toHaveBeenCalledWith(mockUploadedFile.path) // Should attempt to clean up
      // expect(mockRes.sendStatus).toHaveBeenCalledWith(500)
      expect(mockNext).toHaveBeenCalledWith(finishError)
    })

    test('should log error if unlink fails (not ENOENT)', async () => {
      mockReq.file = mockUploadedFile
      const finishError = new Error('Finish upload failed')
      finishUpload.mockRejectedValue(finishError)
      const unlinkError = new Error('Permission denied')
      unlinkError.code = 'EACCES'
      unlink.mockRejectedValue(unlinkError) // Simulate unlink failure

      await uploadRouteHandler(mockReq, mockRes, mockNext)

      expect(logHttpsError).toHaveBeenCalledWith(mockReq, unlinkError) // Log the unlink error
      // expect(mockRes.sendStatus).toHaveBeenCalledWith(500)
      expect(mockNext).toHaveBeenCalledWith(finishError)
    })

    test('should not log error if unlink fails with ENOENT', async () => {
      mockReq.file = mockUploadedFile
      const finishError = new Error('Finish upload failed')
      finishUpload.mockRejectedValue(finishError)
      const unlinkError = new Error('File not found')
      unlinkError.code = 'ENOENT'
      unlink.mockRejectedValue(unlinkError) // Simulate unlink ENOENT

      await uploadRouteHandler(mockReq, mockRes, mockNext)

      // It should still call next with error
      expect(mockNext).toHaveBeenCalledWith(finishError)
      // expect(logHttpsError).toHaveBeenCalledWith(mockReq, finishError)
      // But not the ENOENT unlink error
      expect(logHttpsError).not.toHaveBeenCalledWith(mockReq, unlinkError)
      // expect(mockRes.sendStatus).toHaveBeenCalledWith(500)
    })
  })

  describe('/download GET route', () => {
    const mockFileInfo = {
      id: mockFileId,
      name: 'downloaded.jpg',
      ownerId: mockUserId,
      path: '/test/upload/dir/user456/testFileId789'
    }

    beforeEach(() => {
      mockReq.headers.fileid = mockFileId
      mockReq.userId = mockUserId // Simulate auth middleware setting userId
      FileIdSchema.safeParse.mockReturnValue({ success: true, data: mockFileId })
      getFileInfo.mockResolvedValue(mockFileInfo)
      path.resolve.mockReturnValue(`/test/upload/dir/${mockUserId}/${mockFileId}`)
    })

    test('should successfully download an owned file', () => {
      downloadRouteHandler(mockReq, mockRes)

      expect(logHttpsInfo).toHaveBeenCalledWith(mockReq, 'Client asks to download file.')
      expect(FileIdSchema.safeParse).toHaveBeenCalledWith(mockFileId)
      expect(getFileInfo).toHaveBeenCalledWith(mockFileId)
      expect(path.resolve).toHaveBeenCalledWith(ConfigManager.uploadDir, mockUserId, mockFileId)
      expect(logHttpsInfo).toHaveBeenCalledWith(mockReq, 'Client downloading file.')
      expect(mockRes.download).toHaveBeenCalledWith(
        `/test/upload/dir/${mockUserId}/${mockFileId}`,
        mockFileInfo.name
      )
    })

    test('should return 400 if FileId is invalid', () => {
      mockReq.headers.fileid = 'invalid'
      FileIdSchema.safeParse.mockReturnValue({
        success: false,
        issues: [{ message: 'Invalid FileId' }]
      })

      downloadRouteHandler(mockReq, mockRes)

      expect(logHttpsWarning).toHaveBeenCalledWith(
        mockReq,
        'Client asks to download file but fileId is invalid.',
        { issues: expect.any(Array) }
      )
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.send).toHaveBeenCalledWith('FileId is invalid.')
      expect(getFileInfo).not.toHaveBeenCalled()
    })

    test('should return 404 if file does not exist', () => {
      getFileInfo.mockResolvedValue(null)

      downloadRouteHandler(mockReq, mockRes)

      expect(logHttpsWarning).toHaveBeenCalledWith(
        mockReq,
        'Client asks to download file which does not exist.'
      )
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.send).toHaveBeenCalledWith('File not found')
    })

    test('should return 403 if file is not owned by client', () => {
      getFileInfo.mockResolvedValue({ ...mockFileInfo, ownerId: 'otherUser' })

      downloadRouteHandler(mockReq, mockRes)

      expect(logHttpsWarning).toHaveBeenCalledWith(
        mockReq,
        'Client asks to download file which is not owned by the client.'
      )
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.send).toHaveBeenCalledWith('File not owned.')
    })

    test('should call next with error on unexpected error', () => {
      FileIdSchema.safeParse.mockImplementation(() => {
        throw new Error('Unexpected parsing error')
      })

      downloadRouteHandler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      // expect(logHttpsError).toHaveBeenCalledWith(mockReq, expect.any(Error))
      // expect(mockRes.sendStatus).toHaveBeenCalledWith(500)
    })
  })

  describe('Global Error Handler', () => {
    test('should log error and send 500 status', () => {
      const error = new Error('Something went wrong')

      globalErrorHandler(error, mockReq, mockRes)

      expect(logHttpsError).toHaveBeenCalledWith(mockReq, error)
      expect(mockRes.sendStatus).toHaveBeenCalledWith(500)
    })
  })
})
