import { FtpServer } from 'ftpd'
import path from 'path'
import fs from 'fs'
import FtpsFsModule from './FtpsFsModule.js'
import { logger } from './Logger.js'
import { checkUserLoggedIn } from './LoginDatabase.js'
import { __dirname, __upload_dirname } from './Constants.js'

var keyFile
var certFile
var server
var options = {
  host: process.env.IP || '127.0.0.1',
  port: process.env.PORT || 7002,
  tls: null
}

if (process.env.KEY_FILE && process.env.CERT_FILE) {
  logger.info('Running as FTPS server')
  if (process.env.KEY_FILE.charAt(0) !== '/') {
    keyFile = path.join(__dirname, process.env.KEY_FILE)
  }
  if (process.env.CERT_FILE.charAt(0) !== '/') {
    certFile = path.join(__dirname, process.env.CERT_FILE)
  }
  options.tls = {
    key: fs.readFileSync(keyFile),
    cert: fs.readFileSync(certFile),
    ca: !process.env.CA_FILES
      ? null
      : process.env.CA_FILES.split(':').map(function (f) {
          return fs.readFileSync(f)
        })
  }
} else {
  console.log()
  console.log('*** To run as FTPS server,                 ***')
  console.log('***  set "KEY_FILE", "CERT_FILE"           ***')
  console.log('***  and (optionally) "CA_FILES" env vars. ***')
  console.log()
}

server = new FtpServer(options.host, {
  getInitialCwd: function (connection) {
    return '/'
  },
  getRoot: function (connection) {
    return '/' + path.join(__dirname, __upload_dirname, connection.username)
  },
  pasvPortRangeStart: null,
  pasvPortRangeEnd: null,
  tlsOptions: options.tls,
  allowUnauthorizedTls: true,
  useWriteFile: false,
  useReadFile: false,
  uploadMaxSlurpSize: 7000 // N/A unless 'useWriteFile' is true.
})

server.on('error', function (error) {
  logger.error('FTP Server error:', error)
})

server.on('client:connected', function (connection) {
  var username = null
  logger.info('FTP client connected: ' + connection.remoteAddress)
  connection.on('command:user', function (user, success, failure) {
    // Client should use socketId as username
    const userInfo = checkUserLoggedIn(user)
    if (userInfo !== undefined) {
      username = String(userInfo.userId)
      success()
    } else {
      failure()
    }
  })

  connection.on('command:pass', function (pass, success, failure) {
    // TODO: use to check a one-time password
    if (pass) {
      success(username, FtpsFsModule)
    } else {
      failure()
    }
  })
})

if (process.env.NODE_ENV !== 'production') {
  server.debugging = 4
}
server.listen(options.port)
logger.info('FTP server Listening on port ' + options.port)
