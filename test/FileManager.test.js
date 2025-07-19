import { test, expect, jest, describe, beforeEach } from '@jest/globals'
// Mock all external dependencies
jest.mock('../src/Logger.js', () => ({
  logInvalidSchemaWarning: jest.fn(),
  logSocketError: jest.fn(),
  logSocketInfo: jest.fn(),
  logSocketWarning: jest.fn()
}))

jest.mock('../src/StorageDatabase.js', () => ({
  getFileInfo: jest.fn(),
  deleteFile: jest.fn(),
  addFolderToDatabase: jest.fn(),
  deleteFolder: jest.fn(),
  getAllFilesByParentFolderIdUserId: jest.fn(),
  getAllFoldersByParentFolderIdUserId: jest.fn(),
  moveFileToFolder: jest.fn(),
  getAllFoldersByUserId: jest.fn(),
  getAllPublicFilesNotOwned: jest.fn(),
  getFileInfoOfOwnerId: jest.fn(),
  updateFileDescPermInDatabase: jest.fn()
}))

jest.mock('fs/promises', () => ({
  unlink: jest.fn()
}))

jest.mock('crypto', () => ({
  randomUUID: jest.fn()
}))

jest.mock('../src/LoginDatabase.js', () => ({
  insertUpload: jest.fn()
}))

jest.mock('../src/Utils.js', () => ({
  checkFolderExistsForUser: jest.fn(),
  checkLoggedIn: jest.fn(),
  FileNotFoundErrorMsg: 'File not found.',
  InternalServerErrorMsg: 'Internal server error occurred.',
  InvalidArgumentErrorMsg: 'Invalid argument provided.',
  NotLoggedInErrorMsg: 'Not logged in.',
  getFilePath: jest.fn((userId, fileId) => `/uploads/${userId}/${fileId}`) // Mock for file paths
}))

jest.mock('../src/ConfigManager.js', () => ({
  __esModule: true,
  default: {
    settings: {
      uploadExpireTimeMin: 10 // 10 minutes for testing
    },
    databaseLengthLimit: 255 // Max length for description
  }
}))

jest.mock('../src/Validation.js', () => ({
  DeleteFileRequestSchema: { safeParse: jest.fn() },
  DeleteFolderRequestSchema: { safeParse: jest.fn() },
  DownloadFileHashErrorRequestSchema: { safeParse: jest.fn() }, // Not used in provided code but good to mock
  DownloadFileRequestSchema: { safeParse: jest.fn() },
  GetFileListRequestSchema: { safeParse: jest.fn() },
  MoveFileRequestSchema: { safeParse: jest.fn() },
  UpdateFileRequestSchema: { safeParse: jest.fn() },
  UploadFileRequestSchema: { safeParse: jest.fn() }
}))

// Import the module to be tested
import { allFileBinder } from '../src/FileManager.js' // Assuming the original file is FileManager.js

// Import mocked dependencies for easier access and assertion
import {
  logInvalidSchemaWarning,
  logSocketError,
  logSocketInfo,
  logSocketWarning
} from '../src/Logger.js'
import {
  getFileInfo,
  deleteFile,
  addFolderToDatabase,
  deleteFolder,
  getAllFilesByParentFolderIdUserId,
  getAllFoldersByParentFolderIdUserId,
  moveFileToFolder,
  getAllFoldersByUserId,
  getAllPublicFilesNotOwned,
  getFileInfoOfOwnerId,
  updateFileDescPermInDatabase
} from '../src/StorageDatabase.js'
import { unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { insertUpload } from '../src/LoginDatabase.js'
import {
  checkFolderExistsForUser,
  checkLoggedIn,
  FileNotFoundErrorMsg,
  InternalServerErrorMsg,
  InvalidArgumentErrorMsg,
  NotLoggedInErrorMsg,
  getFilePath
} from '../src/Utils.js'
import ConfigManager from '../src/ConfigManager.js'
import {
  DeleteFileRequestSchema,
  DeleteFolderRequestSchema,
  DownloadFileRequestSchema,
  GetFileListRequestSchema,
  MoveFileRequestSchema,
  UpdateFileRequestSchema,
  UploadFileRequestSchema
} from '../src/Validation.js'

describe('File Binders', () => {
  let mockSocket
  let mockCb // Callback function for socket events
  const mockUserId = 'user123'

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks()

    mockCb = jest.fn() // Mock the callback function passed to socket events

    // Mock socket object with an 'on' method and common properties
    mockSocket = {
      on: jest.fn((event, handler) => {
        // Store event handlers so we can trigger them later
        mockSocket.events[event] = handler
      }),
      emit: jest.fn(), // If the binder ever emits, we can test it
      events: {}, // To store registered event handlers
      id: 'socketId456',
      userId: mockUserId, // Simulate a logged-in user by default
      authed: true // Simulate authenticated by default
    }

    // By default, assume user is logged in and folder exists for user checks
    checkLoggedIn.mockReturnValue(true)
    checkFolderExistsForUser.mockResolvedValue(true)

    // Initialize all binders
    allFileBinder(mockSocket)
  })

  // Helper to trigger a socket event handler
  const triggerSocketEvent = async (eventName, request, cb = mockCb) => {
    if (mockSocket.events[eventName]) {
      await mockSocket.events[eventName](request, cb)
    } else {
      throw new Error(`Event handler for '${eventName}' not found.`)
    }
  }

  describe('downloadFileBinder', () => {
    const validDownloadRequest = { fileId: 'file123' }
    const mockFileInfo = {
      fileId: 'file123',
      ownerId: mockUserId,
      fileName: 'test.txt',
      size: 100,
      description: 'a test file',
      permission: 'private'
    }

    beforeEach(() => {
      DownloadFileRequestSchema.safeParse.mockReturnValue({
        success: true,
        data: validDownloadRequest
      })
      getFileInfo.mockResolvedValue(mockFileInfo)
    })

    test('should successfully respond with file info for owned file', async () => {
      await triggerSocketEvent('download-file-pre', validDownloadRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to download file.',
        validDownloadRequest
      )
      expect(DownloadFileRequestSchema.safeParse).toHaveBeenCalledWith(validDownloadRequest)
      expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
      expect(getFileInfo).toHaveBeenCalledWith(validDownloadRequest.fileId)
      expect(mockCb).toHaveBeenCalledWith({ fileInfo: mockFileInfo })
      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Responding file info to client.',
        validDownloadRequest
      )
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      DownloadFileRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid fileId' }] }
      })
      const invalidRequest = { fileId: 123 }

      await triggerSocketEvent('download-file-pre', invalidRequest)

      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to download file',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      expect(checkLoggedIn).not.toHaveBeenCalled()
    })

    test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
      checkLoggedIn.mockReturnValue(false)

      await triggerSocketEvent('download-file-pre', validDownloadRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to download file but is not logged in.',
        validDownloadRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
      expect(getFileInfo).not.toHaveBeenCalled()
    })

    test('should return FileNotFoundErrorMsg if file does not exist', async () => {
      getFileInfo.mockResolvedValue(null)

      await triggerSocketEvent('download-file-pre', validDownloadRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to download file which does not exist.',
        validDownloadRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: FileNotFoundErrorMsg })
    })

    test('should return "File not owned." if file is not owned by client', async () => {
      getFileInfo.mockResolvedValue({ ...mockFileInfo, ownerId: 'otherUser' })

      await triggerSocketEvent('download-file-pre', validDownloadRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to download file which is not owned by the client.',
        validDownloadRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'File not owned.' })
    })

    test('should return InternalServerErrorMsg on unexpected error', async () => {
      DownloadFileRequestSchema.safeParse.mockImplementation(() => {
        throw new Error('Unexpected parsing error')
      })

      await triggerSocketEvent('download-file-pre', validDownloadRequest)

      expect(logSocketError).toHaveBeenCalledWith(
        mockSocket,
        expect.any(Error),
        validDownloadRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })

    test('should log warning for download-file-hash-error', async () => {
      const hashErrorRequest = { fileId: 'file123', hash: 'incorrectHash' }
      // Note: download-file-hash-error does not have schema validation or callback in the provided code
      mockSocket.events['download-file-hash-error'](hashErrorRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client reports download file hash error.',
        hashErrorRequest
      )
    })
  })

  describe('uploadFileBinder', () => {
    const validUploadRequest = {
      cipher: 'mockCipher',
      spk: 'mockSpk',
      parentFolderId: 'folder123'
    }
    const mockFileId = 'newFileUUID'

    beforeEach(() => {
      UploadFileRequestSchema.safeParse.mockReturnValue({ success: true, data: validUploadRequest })
      randomUUID.mockReturnValue(mockFileId)
    })

    test('should successfully initiate file upload', async () => {
      const expectedExpireTime =
        Date.now() + ConfigManager.settings.uploadExpireTimeMin * 60 * 1000
      jest
        .spyOn(global.Date, 'now')
        .mockReturnValue(
          expectedExpireTime - ConfigManager.settings.uploadExpireTimeMin * 60 * 1000
        ) // Mock Date.now for predictable expiration

      await triggerSocketEvent('upload-file-pre', validUploadRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'Client asks to upload file.', {
        parentFolderId: validUploadRequest.parentFolderId
      })
      expect(UploadFileRequestSchema.safeParse).toHaveBeenCalledWith(validUploadRequest)
      expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
      expect(checkFolderExistsForUser).toHaveBeenCalledWith(
        validUploadRequest.parentFolderId,
        mockUserId
      )
      expect(randomUUID).toHaveBeenCalled()
      expect(insertUpload).toHaveBeenCalledWith(
        mockFileId,
        validUploadRequest.cipher,
        validUploadRequest.spk,
        validUploadRequest.parentFolderId,
        expect.any(Number) // Check that the expiration time is set, value depends on Date.now()
      )
      expect(insertUpload.mock.calls[0][4]).toBeGreaterThanOrEqual(expectedExpireTime - 1000) // Check within a reasonable range
      expect(insertUpload.mock.calls[0][4]).toBeLessThanOrEqual(expectedExpireTime + 1000) // Check within a reasonable range

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Pre-upload information stored in upload database.',
        {
          parentFolderId: validUploadRequest.parentFolderId,
          fileId: mockFileId
        }
      )
      expect(mockCb).toHaveBeenCalledWith({ fileId: mockFileId })

      global.Date.now.mockRestore() // Restore Date.now()
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      UploadFileRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid cipher' }] }
      })
      const invalidRequest = { cipher: 123 }

      await triggerSocketEvent('upload-file-pre', invalidRequest)

      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to upload file',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      expect(checkLoggedIn).not.toHaveBeenCalled()
    })

    test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
      checkLoggedIn.mockReturnValue(false)

      await triggerSocketEvent('upload-file-pre', validUploadRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to upload file but is not logged in.',
        validUploadRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
      expect(checkFolderExistsForUser).not.toHaveBeenCalled()
    })

    test('should return "Parent folder not found." if parent folder does not exist for user', async () => {
      checkFolderExistsForUser.mockResolvedValue(false)

      await triggerSocketEvent('upload-file-pre', validUploadRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to upload file to a non-existing folder.',
        validUploadRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Parent folder not found.' })
      expect(randomUUID).not.toHaveBeenCalled()
    })

    test('should return InternalServerErrorMsg on unexpected error', async () => {
      UploadFileRequestSchema.safeParse.mockImplementation(() => {
        throw new Error('Unexpected parsing error')
      })

      await triggerSocketEvent('upload-file-pre', validUploadRequest)

      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error), validUploadRequest)
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })
  })

  describe('deleteFileBinder', () => {
    const validDeleteRequest = { fileId: 'fileToDelete123' }
    const mockFileInfo = {
      fileId: 'fileToDelete123',
      ownerId: mockUserId,
      fileName: 'to_delete.txt'
    }

    beforeEach(() => {
      DeleteFileRequestSchema.safeParse.mockReturnValue({ success: true, data: validDeleteRequest })
      getFileInfo.mockResolvedValue(mockFileInfo)
      deleteFile.mockResolvedValue({ rowCount: 1 }) // Simulate successful DB delete
      unlink.mockResolvedValue() // Simulate successful file system unlink
    })

    test('should successfully delete an owned file', async () => {
      await triggerSocketEvent('delete-file', validDeleteRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to delete file.',
        validDeleteRequest
      )
      expect(DeleteFileRequestSchema.safeParse).toHaveBeenCalledWith(validDeleteRequest)
      expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
      expect(getFileInfo).toHaveBeenCalledWith(validDeleteRequest.fileId)
      expect(deleteFile).toHaveBeenCalledWith(validDeleteRequest.fileId)
      expect(getFilePath).toHaveBeenCalledWith(mockUserId, validDeleteRequest.fileId)
      expect(unlink).toHaveBeenCalledWith(`/uploads/${mockUserId}/${validDeleteRequest.fileId}`)
      expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'File deleted.', validDeleteRequest)
      expect(mockCb).toHaveBeenCalledWith({})
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      DeleteFileRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid fileId' }] }
      })
      const invalidRequest = { fileId: 123 }

      await triggerSocketEvent('delete-file', invalidRequest)

      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to delete file',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      expect(checkLoggedIn).not.toHaveBeenCalled()
    })

    test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
      checkLoggedIn.mockReturnValue(false)

      await triggerSocketEvent('delete-file', validDeleteRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to delete file but is not logged in.',
        validDeleteRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
      expect(getFileInfo).not.toHaveBeenCalled()
    })

    test('should return FileNotFoundErrorMsg if file does not exist in DB', async () => {
      getFileInfo.mockResolvedValue(null)

      await triggerSocketEvent('delete-file', validDeleteRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to delete file which does not exist.',
        validDeleteRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: FileNotFoundErrorMsg })
      expect(deleteFile).not.toHaveBeenCalled()
    })

    test('should return "File not owned." if file is not owned by client', async () => {
      getFileInfo.mockResolvedValue({ ...mockFileInfo, ownerId: 'otherUser' })

      await triggerSocketEvent('delete-file', validDeleteRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to delete file which is not owned by the client.',
        validDeleteRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'File not owned.' })
      expect(deleteFile).not.toHaveBeenCalled()
    })

    test('should not throw error if unlink returns ENOENT', async () => {
      unlink.mockRejectedValueOnce(Object.assign(new Error('File not found'), { code: 'ENOENT' }))

      await triggerSocketEvent('delete-file', validDeleteRequest)

      expect(deleteFile).toHaveBeenCalledWith(validDeleteRequest.fileId) // DB delete should still happen
      expect(unlink).toHaveBeenCalled()
      expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'File deleted.', validDeleteRequest) // Should still report success
      expect(mockCb).toHaveBeenCalledWith({})
    })

    test('should return InternalServerErrorMsg on unexpected unlink error', async () => {
      unlink.mockRejectedValueOnce(new Error('Permission denied'))

      await triggerSocketEvent('delete-file', validDeleteRequest)

      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error), validDeleteRequest)
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })

    test('should return InternalServerErrorMsg on unexpected error before unlink', async () => {
      DeleteFileRequestSchema.safeParse.mockImplementation(() => {
        throw new Error('Unexpected parsing error')
      })

      await triggerSocketEvent('delete-file', validDeleteRequest)

      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error), validDeleteRequest)
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })
  })

  describe('getFileListBinder', () => {
    const validGetListRequest = { parentFolderId: 'rootFolder' }
    const mockFiles = [{ id: 'fileA' }, { id: 'fileB' }]
    const mockFolders = [{ id: 'folderX' }, { id: 'folderY' }]

    beforeEach(() => {
      GetFileListRequestSchema.safeParse.mockReturnValue({
        success: true,
        data: validGetListRequest
      })
      getAllFilesByParentFolderIdUserId.mockResolvedValue(mockFiles)
      getAllFoldersByParentFolderIdUserId.mockResolvedValue(mockFolders)
    })

    test('should successfully respond with file and folder lists', async () => {
      await triggerSocketEvent('get-file-list', validGetListRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to get file list.',
        validGetListRequest
      )
      expect(GetFileListRequestSchema.safeParse).toHaveBeenCalledWith(validGetListRequest)
      expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
      expect(getAllFilesByParentFolderIdUserId).toHaveBeenCalledWith(
        validGetListRequest.parentFolderId,
        mockUserId
      )
      expect(getAllFoldersByParentFolderIdUserId).toHaveBeenCalledWith(
        validGetListRequest.parentFolderId,
        mockUserId
      )
      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Responding file list to client.',
        validGetListRequest
      )
      expect(mockCb).toHaveBeenCalledWith({
        fileList: {
          files: JSON.stringify(mockFiles),
          folders: JSON.stringify(mockFolders)
        }
      })
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      GetFileListRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid parentFolderId' }] }
      })
      const invalidRequest = { parentFolderId: 123 }

      await triggerSocketEvent('get-file-list', invalidRequest)

      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to get file list',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      expect(checkLoggedIn).not.toHaveBeenCalled()
    })

    test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
      checkLoggedIn.mockReturnValue(false)

      await triggerSocketEvent('get-file-list', validGetListRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to get file list but is not logged in.',
        validGetListRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
      expect(getAllFilesByParentFolderIdUserId).not.toHaveBeenCalled()
    })

    test('should return InternalServerErrorMsg on unexpected error', async () => {
      GetFileListRequestSchema.safeParse.mockImplementation(() => {
        throw new Error('Unexpected parsing error')
      })

      await triggerSocketEvent('get-file-list', validGetListRequest)

      expect(logSocketError).toHaveBeenCalledWith(
        mockSocket,
        expect.any(Error),
        validGetListRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })
  })

  describe('folderBinder', () => {
    describe('add-folder', () => {
      const validAddFolderRequest = { parentFolderId: 'root', folderName: 'New Folder' }

      // NOTE: The original code uses DeleteFileRequestSchema.safeParse for add-folder.
      // This is likely a copy-paste error in the original code, but we must test it as is.
      // In a real scenario, this would be `AddFolderRequestSchema`.
      beforeEach(() => {
        DeleteFileRequestSchema.safeParse.mockReturnValue({
          success: true,
          data: validAddFolderRequest
        })
      })

      test('should successfully add a folder', async () => {
        await triggerSocketEvent('add-folder', validAddFolderRequest)

        expect(logSocketInfo).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to add folder.',
          validAddFolderRequest
        )
        expect(DeleteFileRequestSchema.safeParse).toHaveBeenCalledWith(validAddFolderRequest) // Testing original code's typo
        expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
        expect(addFolderToDatabase).toHaveBeenCalledWith(
          validAddFolderRequest.folderName,
          validAddFolderRequest.parentFolderId,
          mockUserId
        )
        expect(logSocketInfo).toHaveBeenCalledWith(
          mockSocket,
          'Folder added to database.',
          validAddFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({})
      })

      test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
        DeleteFileRequestSchema.safeParse.mockReturnValue({
          success: false,
          error: { issues: [{ message: 'Invalid folderName' }] }
        })
        const invalidRequest = { parentFolderId: 'root', folderName: 123 }

        await triggerSocketEvent('add-folder', invalidRequest)

        expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to add folder',
          expect.any(Array),
          invalidRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      })

      test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
        checkLoggedIn.mockReturnValue(false)

        await triggerSocketEvent('add-folder', validAddFolderRequest)

        expect(logSocketWarning).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to add folder but is not logged in.',
          validAddFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
        expect(addFolderToDatabase).not.toHaveBeenCalled()
      })

      test('should return InternalServerErrorMsg on unexpected error', async () => {
        DeleteFileRequestSchema.safeParse.mockImplementation(() => {
          throw new Error('Unexpected parsing error')
        })

        await triggerSocketEvent('add-folder', validAddFolderRequest)

        expect(logSocketError).toHaveBeenCalledWith(
          mockSocket,
          expect.any(Error),
          validAddFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
      })
    })

    describe('delete-folder', () => {
      const validDeleteFolderRequest = { folderId: 'folderToDelete123' }

      beforeEach(() => {
        DeleteFolderRequestSchema.safeParse.mockReturnValue({
          success: true,
          data: validDeleteFolderRequest
        })
        getAllFilesByParentFolderIdUserId.mockResolvedValue([]) // Empty folder by default
        getAllFoldersByParentFolderIdUserId.mockResolvedValue([]) // Empty folder by default
        deleteFolder.mockResolvedValue({ rowCount: 1 }) // Simulate successful DB delete
      })

      test('should successfully delete an empty folder', async () => {
        await triggerSocketEvent('delete-folder', validDeleteFolderRequest)

        expect(logSocketInfo).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to delete folder.',
          validDeleteFolderRequest
        )
        expect(DeleteFolderRequestSchema.safeParse).toHaveBeenCalledWith(validDeleteFolderRequest)
        expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
        expect(getAllFilesByParentFolderIdUserId).toHaveBeenCalledWith(
          validDeleteFolderRequest.folderId,
          mockUserId
        )
        expect(getAllFoldersByParentFolderIdUserId).toHaveBeenCalledWith(
          validDeleteFolderRequest.folderId,
          mockUserId
        )
        expect(deleteFolder).toHaveBeenCalledWith(validDeleteFolderRequest.folderId)
        expect(logSocketInfo).toHaveBeenCalledWith(
          mockSocket,
          'Folder deleted.',
          validDeleteFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({})
      })

      test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
        DeleteFolderRequestSchema.safeParse.mockReturnValue({
          success: false,
          error: { issues: [{ message: 'Invalid folderId' }] }
        })
        const invalidRequest = { folderId: 123 }

        await triggerSocketEvent('delete-folder', invalidRequest)

        expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to delete folder',
          expect.any(Array),
          invalidRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
      })

      test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
        checkLoggedIn.mockReturnValue(false)

        await triggerSocketEvent('delete-folder', validDeleteFolderRequest)

        expect(logSocketWarning).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to delete folder but is not logged in.',
          validDeleteFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
        expect(getAllFilesByParentFolderIdUserId).not.toHaveBeenCalled()
      })

      test('should return "Folder not empty." if folder contains files', async () => {
        getAllFilesByParentFolderIdUserId.mockResolvedValue([{ id: 'fileInFolder' }])

        await triggerSocketEvent('delete-folder', validDeleteFolderRequest)

        expect(logSocketWarning).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to delete folder which is not empty.',
          validDeleteFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Folder not empty.' })
        expect(deleteFolder).not.toHaveBeenCalled()
      })

      test('should return "Folder not empty." if folder contains sub-folders', async () => {
        getAllFoldersByParentFolderIdUserId.mockResolvedValue([{ id: 'subFolder' }])

        await triggerSocketEvent('delete-folder', validDeleteFolderRequest)

        expect(logSocketWarning).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to delete folder which is not empty.',
          validDeleteFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Folder not empty.' })
        expect(deleteFolder).not.toHaveBeenCalled()
      })

      test('should return "Folder not found." if deleteFolder reports no changes', async () => {
        deleteFolder.mockResolvedValue({ rowCount: 0 })

        await triggerSocketEvent('delete-folder', validDeleteFolderRequest)

        expect(logSocketWarning).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to delete folder which does not exist.',
          validDeleteFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Folder not found.' })
      })

      test('should return InternalServerErrorMsg on unexpected error', async () => {
        DeleteFolderRequestSchema.safeParse.mockImplementation(() => {
          throw new Error('Unexpected parsing error')
        })

        await triggerSocketEvent('delete-folder', validDeleteFolderRequest)

        expect(logSocketError).toHaveBeenCalledWith(
          mockSocket,
          expect.any(Error),
          validDeleteFolderRequest
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
      })
    })

    describe('get-all-folders', () => {
      const mockAllFolders = [
        { id: 'f1', name: 'Folder 1' },
        { id: 'f2', name: 'Folder 2' }
      ]

      beforeEach(() => {
        getAllFoldersByUserId.mockResolvedValue(mockAllFolders)
      })

      test('should successfully respond with all folders for the user', async () => {
        await triggerSocketEvent('get-all-folders', mockCb) // get-all-folders takes no request

        expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'Client asks to get all folders.')
        expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
        expect(getAllFoldersByUserId).toHaveBeenCalledWith(mockUserId)
        expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'Responding all folders to client.')
        expect(mockCb).toHaveBeenCalledWith({ folders: JSON.stringify(mockAllFolders) })
      })

      test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
        checkLoggedIn.mockReturnValue(false)

        await triggerSocketEvent('get-all-folders', mockCb)

        expect(logSocketWarning).toHaveBeenCalledWith(
          mockSocket,
          'Client asks to get all folders but is not logged in.'
        )
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
        expect(getAllFoldersByUserId).not.toHaveBeenCalled()
      })

      test('should return InternalServerErrorMsg on unexpected error', async () => {
        getAllFoldersByUserId.mockImplementation(async () => {
          throw new Error('DB error')
        })

        await triggerSocketEvent('get-all-folders', mockCb)

        expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error))
        expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
      })
    })
  })

  describe('moveFileBinder', () => {
    const validMoveRequest = { fileId: 'fileToMove', targetFolderId: 'targetFolder' }

    beforeEach(() => {
      MoveFileRequestSchema.safeParse.mockReturnValue({ success: true, data: validMoveRequest })
      moveFileToFolder.mockResolvedValue({ rowCount: 1 }) // Simulate successful move
    })

    test('should successfully move a file to a target folder', async () => {
      await triggerSocketEvent('move-file', validMoveRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to move file to target folder.',
        validMoveRequest
      )
      expect(MoveFileRequestSchema.safeParse).toHaveBeenCalledWith(validMoveRequest)
      expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
      expect(checkFolderExistsForUser).toHaveBeenCalledWith(
        validMoveRequest.targetFolderId,
        mockUserId
      )
      expect(moveFileToFolder).toHaveBeenCalledWith(
        validMoveRequest.fileId,
        validMoveRequest.targetFolderId
      )
      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'File moved to target folder.',
        validMoveRequest
      )
      expect(mockCb).toHaveBeenCalledWith({})
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      MoveFileRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid fileId' }] }
      })
      const invalidRequest = { fileId: 123 }

      await triggerSocketEvent('move-file', invalidRequest)

      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to move file to target folder',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
    })

    test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
      checkLoggedIn.mockReturnValue(false)

      await triggerSocketEvent('move-file', validMoveRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to move file to target folder but is not logged in.',
        validMoveRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
      expect(checkFolderExistsForUser).not.toHaveBeenCalled()
    })

    test('should return "Target folder not found." if target folder does not exist for user', async () => {
      checkFolderExistsForUser.mockResolvedValue(false)

      await triggerSocketEvent('move-file', validMoveRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to move file to target folder but target folder does not exist.',
        validMoveRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: 'Target folder not found.' })
      expect(moveFileToFolder).not.toHaveBeenCalled()
    })

    test('should return FileNotFoundErrorMsg if moveFileToFolder reports no changes', async () => {
      moveFileToFolder.mockResolvedValue({ rowCount: 0 }) // Simulate file not found or not moved

      await triggerSocketEvent('move-file', validMoveRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to move file to target folder but file does not exist.',
        validMoveRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: FileNotFoundErrorMsg })
    })

    test('should return InternalServerErrorMsg on unexpected error', async () => {
      MoveFileRequestSchema.safeParse.mockImplementation(() => {
        throw new Error('Unexpected parsing error')
      })

      await triggerSocketEvent('move-file', validMoveRequest)

      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error))
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })
  })

  describe('getPublicFilesBinder', () => {
    const mockPublicFiles = [{ id: 'publicFile1', ownerId: 'otherUser' }]

    beforeEach(() => {
      getAllPublicFilesNotOwned.mockResolvedValue(mockPublicFiles)
    })

    test('should successfully respond with public files not owned by the user', async () => {
      await triggerSocketEvent('get-public-files', mockCb) // get-public-files takes no request

      expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'Client asks to get public files.')
      expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
      expect(getAllPublicFilesNotOwned).toHaveBeenCalledWith(mockUserId)
      expect(logSocketInfo).toHaveBeenCalledWith(mockSocket, 'Responding public files to client.')
      expect(mockCb).toHaveBeenCalledWith({ files: JSON.stringify(mockPublicFiles) })
    })

    test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
      checkLoggedIn.mockReturnValue(false)

      await triggerSocketEvent('get-public-files', mockCb)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to get public files but is not logged in.'
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
      expect(getAllPublicFilesNotOwned).not.toHaveBeenCalled()
    })

    test('should return InternalServerErrorMsg on unexpected error', async () => {
      getAllPublicFilesNotOwned.mockImplementation(async () => {
        throw new Error('DB error')
      })

      await triggerSocketEvent('get-public-files', mockCb)

      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error))
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })
  })

  describe('updateFileBinder', () => {
    const validUpdateRequest = {
      fileId: 'fileToUpdate',
      description: 'new description',
      permission: 'public'
    }
    const mockFileInfoOwned = {
      fileId: 'fileToUpdate',
      ownerId: mockUserId
    }

    beforeEach(() => {
      UpdateFileRequestSchema.safeParse.mockReturnValue({ success: true, data: validUpdateRequest })
      getFileInfoOfOwnerId.mockResolvedValue(mockFileInfoOwned)
      updateFileDescPermInDatabase.mockResolvedValue({}) // Success for DB update
    })

    test('should successfully update file description and permission', async () => {
      await triggerSocketEvent('update-file-desc-perm', validUpdateRequest)

      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to update description and permission for file.',
        validUpdateRequest
      )
      expect(UpdateFileRequestSchema.safeParse).toHaveBeenCalledWith(validUpdateRequest)
      expect(checkLoggedIn).toHaveBeenCalledWith(mockSocket)
      expect(getFileInfoOfOwnerId).toHaveBeenCalledWith(validUpdateRequest.fileId, mockUserId)
      expect(updateFileDescPermInDatabase).toHaveBeenCalledWith(
        validUpdateRequest.fileId,
        validUpdateRequest.description,
        validUpdateRequest.permission
      )
      expect(logSocketInfo).toHaveBeenCalledWith(
        mockSocket,
        'Description and permission updated for file.',
        validUpdateRequest
      )
      expect(mockCb).toHaveBeenCalledWith({})
    })

    test('should truncate description if it exceeds databaseLengthLimit', async () => {
      const longDescription = 'a'.repeat(ConfigManager.databaseLengthLimit + 50)
      const truncatedDescription = 'a'.repeat(ConfigManager.databaseLengthLimit)
      const requestWithLongDesc = { ...validUpdateRequest, description: longDescription }
      UpdateFileRequestSchema.safeParse.mockReturnValue({
        success: true,
        data: requestWithLongDesc
      })

      await triggerSocketEvent('update-file-desc-perm', requestWithLongDesc)

      expect(updateFileDescPermInDatabase).toHaveBeenCalledWith(
        requestWithLongDesc.fileId,
        truncatedDescription, // Expect truncated description
        requestWithLongDesc.permission
      )
    })

    test('should return InvalidArgumentErrorMsg for invalid request schema', async () => {
      UpdateFileRequestSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid permission' }] }
      })
      const invalidRequest = { fileId: 'file1', permission: 'invalid' }

      await triggerSocketEvent('update-file-desc-perm', invalidRequest)

      expect(logInvalidSchemaWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to update description and permission for file',
        expect.any(Array),
        invalidRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InvalidArgumentErrorMsg })
    })

    test('should return NotLoggedInErrorMsg if client is not logged in', async () => {
      checkLoggedIn.mockReturnValue(false)

      await triggerSocketEvent('update-file-desc-perm', validUpdateRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to update description and permission for file but is not logged in.',
        validUpdateRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: NotLoggedInErrorMsg })
      expect(getFileInfoOfOwnerId).not.toHaveBeenCalled()
    })

    test('should return FileNotFoundErrorMsg if file does not exist or is not owned', async () => {
      getFileInfoOfOwnerId.mockResolvedValue(null) // Simulate file not found or not owned

      await triggerSocketEvent('update-file-desc-perm', validUpdateRequest)

      expect(logSocketWarning).toHaveBeenCalledWith(
        mockSocket,
        'Client asks to update description and permission for file but file does not exist.',
        validUpdateRequest
      )
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: FileNotFoundErrorMsg })
      expect(updateFileDescPermInDatabase).not.toHaveBeenCalled()
    })

    test('should return InternalServerErrorMsg on unexpected error', async () => {
      UpdateFileRequestSchema.safeParse.mockImplementation(() => {
        throw new Error('Unexpected parsing error')
      })

      await triggerSocketEvent('update-file-desc-perm', validUpdateRequest)

      expect(logSocketError).toHaveBeenCalledWith(mockSocket, expect.any(Error))
      expect(mockCb).toHaveBeenCalledWith({ errorMsg: InternalServerErrorMsg })
    })
  })
})
