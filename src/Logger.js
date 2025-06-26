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

/**
 * Log info in socket events.
 * @param {Socket} socket
 * @param {String} message
 * @param {Object} metadObj
 */
export const logSocketInfo = (socket, message, metadObj) => {
  logger.info(message, { ip: socket.ip, userId: socket.userId, ...metadObj })
}

/**
 * Log warning in socket events.
 * @param {Socket} socket
 * @param {String} message
 * @param {Object} metaObj
 */
export const logSocketWarning = (socket, message, metaObj) => {
  logger.warn(message, { ip: socket.ip, userId: socket.userId, ...metaObj })
}

/**
 * Log error in socket events.
 * @param {Socket} socket
 * @param {Error} error
 * @param {Object} metaObj
 */
export const logSocketError = (socket, error, metaObj) => {
  logger.error(error, { ip: socket.ip, userId: socket.userId, ...metaObj })
}

/**
 * Log invalid schema warning after checking against a schema.
 * @param {Socket} socket
 * @param {string} action The action is happening.
 * @param {Object} metaObj
 * @example if(!result.success) { logInvalidSchemaWarn(socket, 'Client login', request) }
 */
export const logInvalidSchemaWarning = (socket, action, metaObj) => {
  logSocketWarning(socket, action + ' with invalid arguments.', metaObj)
}
