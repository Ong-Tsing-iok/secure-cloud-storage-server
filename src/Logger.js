import winston, { format } from 'winston'
import 'winston-daily-rotate-file'
import ConfigManager from './ConfigManager.js'

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
}
