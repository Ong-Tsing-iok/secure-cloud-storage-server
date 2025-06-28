import winston, { format } from 'winston'
import 'winston-daily-rotate-file'
import ConfigManager from './ConfigManager.js'
import { Socket } from 'socket.io'

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(format.errors({ stack: true }), format.timestamp(), format.json()),
  // defaultMeta: { service: "user-service" },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.DailyRotateFile({
      filename: '%DATE%-error.log',
      datePattern: 'YYYY-MM-DD',
      dirname: ConfigManager.logDir,
      level: 'error'
    }),
    new winston.transports.DailyRotateFile({
      filename: '%DATE%-combined.log',
      datePattern: 'YYYY-MM-DD',
      dirname: ConfigManager.logDir
    })
  ]
})

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
      level: 'debug'
    })
  )
} else {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
      level: 'error'
    })
  )
}

const getSocketMeta = (socket, metaObj) => {
  return { ip: socket.ip, userId: socket.userId, event: socket.event, ...metaObj }
}

/**
 * Log info in socket events.
 * @param {Socket} socket
 * @param {String} message
 * @param {Object} metaObj
 */
export const logSocketInfo = (socket, message, metaObj = {}) => {
  logger.info(message, getSocketMeta(socket, metaObj))
}

/**
 * Log warning in socket events.
 * @param {Socket} socket
 * @param {String} message
 * @param {Object} metaObj
 */
export const logSocketWarning = (socket, message, metaObj = {}) => {
  logger.warn(message, getSocketMeta(socket, metaObj))
}

/**
 * Log error in socket events.
 * @param {Socket} socket
 * @param {Error} error
 * @param {Object} metaObj
 */
export const logSocketError = (socket, error, metaObj = {}) => {
  logger.error(error, getSocketMeta(socket, metaObj))
}

/**
 * Log invalid schema warning after checking against a schema.
 * @param {Socket} socket
 * @param {string} action The action is happening.
 * @param {Array} issues The issue of the parse result.
 * @param {Object} metaObj
 * @example
 * if(!result.success) {
 *   logInvalidSchemaWarn(socket, 'Client login', result.error.issues, request)
 *   cb({ errorMsg: InvalidArgumentErrorMsg })
 *   return
 * }
 */
export const logInvalidSchemaWarning = (socket, action, issues, metaObj = {}) => {
  logSocketWarning(socket, action + ' with invalid arguments.', { issues, ...metaObj })
}

// FtpsServer.js
const getFtpsMeta = (data, metaObj) => {
  return {
    ip: data.connection.ip,
    userId: data.userId,
    protocol: 'ftps',
    ...(data.password != 'guest' && {fileId: data.password}),
    ...metaObj
  }
}


export const logFtpsInfo = (data, message, metaObj = {}) => {
  logger.info(message, getFtpsMeta(data, metaObj))
}

export const logFtpsWarning = (data, message, metaObj = {}) => {
  logger.warn(message, getFtpsMeta(data, metaObj))
}

export const logFtpsError = (data, error, metaObj = {}) => {
  logger.error(error, getFtpsMeta(data, metaObj))
}

// HttpsServer.js
const getHttpsMeta = (req, metaObj) => {
  return {
    ip: req.ip,
    userId: req.userId,
    protocol: 'https',
    fileId: req.headers.fileid,
    ...metaObj
  }
}

export const logHttpsInfo = (req, message, metaObj = {}) => {
  logger.info(message, getHttpsMeta(req, metaObj))
}

export const logHttpsWarning = (req, message, metaObj = {}) => {
  logger.warn(message, getHttpsMeta(req, metaObj))
}

export const logHttpsError = (req, error, metaObj = {}) => {
  logger.error(error, getHttpsMeta(req, metaObj))
}
