/**
 * This file handles communication with SMTP server and send mails.
 */
import nodemailer from 'nodemailer'
import ConfigManager from './ConfigManager.js'
import { logger } from './Logger.js'

// Create a transporter for SMTP
let transporter
if (ConfigManager.smtp.enabled) {
  transporter = nodemailer.createTransport({
    host: ConfigManager.smtp.host,
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: ConfigManager.smtp.user,
      pass: ConfigManager.smtp.pass
    }
  })
}

export async function sendEmailAuth(email, auth) {
  if (!ConfigManager.smtp.enabled) return
  const mailContext = {
    from: ConfigManager.smtp.from, // sender address
    to: email, // list of receivers
    subject: '機敏雲端驗證碼', // Subject line
    text: `您的驗證碼是 ${auth}，請在${ConfigManager.settings.emailAuthExpireTimeMin}分鐘內輸入完畢`, // plain text body
    html: `<b>您的驗證碼是 ${auth}，請在${ConfigManager.settings.emailAuthExpireTimeMin}分鐘內輸入完畢</b>` // html body
  }

  await transporter.sendMail(mailContext)
}
await transporter?.verify()
logger.info('SMTP Server is ready to take our messages')

console.log('SMTPManager.js loaded.')
