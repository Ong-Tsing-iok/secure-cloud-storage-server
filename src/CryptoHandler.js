import { execFile } from 'child_process'
import { promisify } from 'util'
import ConfigManager from './ConfigManager.js'
const params =
  '{"g": "ZUp3OVVMc093akFNL0pXb2M0YTRKSTdEcnlBVUZkU3RXd0VKSWY0ZG41MHlPSDdlblozUDFQdDlXL2E5OStrY3B0djdzZTVUREZwOUxkdHp0ZW9sdHhpS3hGQ3JXb2tocTZkMDBxUjVVZFJuOFZ5MFRuT0tvYWtSQVpyY0tCVzBhRVIxOXBrQ0FJR1NHQzNCa1BhcURqTEkxYmNoUURRQUlzN0pNaUROZG1xK0lORWhZbXMyRzZvdWFSU1ZCNThoMkxmT1dDUmxQT1R5QlFrVmw4U3VScDZVUmJUREEydEM4Zy9HdGFVNm50bGpnOWwvQUh0b2VnZFl3bjlpdnZpNU12dnB5Sm11M3gvMjJGSEw=", "u": "ZUp3OVVNc093eUFNK3hYVU00ZUU4Z2o3bFdsQzNkUmJiOTBtVGRQK2ZUR2h2U0JpSE52NE83WDIySlo5YjIyNnVPbitlYTc3NUoyaTcyVjdyUjI5eHVwZEV1K0V2Q3ZzSFhQR29STlRVbmoyTHV0elZVQjBqanFYQ0FZdWNsS3owYktxU1RUcVFhK0tjUWhLaDhVQW9GZUx6c0VXbUdab1JRc2hCUVBiVTRVTFFZU1JWWGtTaGlLem5JblZMU2N6eUIwdDQ0Z3kySW5HS2xCOG9pZURjVlFnNGZQRTQ5OEYyMVNPS01rSzRzQzJtWTRLY3VmRjBZV2xET1lKd1c1SHFKZEhWZWx3WUFvR283UE10OThma1ZwU29RPT0=", "v": "ZUp4TlVEc093akFNdlVxVU9ZT2R4bkhEVlJDS0N1cldyWUNFRUhmSGRzeG5TT1A2MmUrVForejlzaTM3M25zOGhIaCtYTmM5cGlEZCs3TGRWdXNlUzB1QjVoUm11Vm5Pbk9XZlVrREVGQnBySVNqTFFSQ29Dc1JadXdaVldhaGpFYUY0bTdMUEFHb25qM1ZXT0lQQTdHcDZzMCtRb0EwR1V6VTI5VVR1Slp1aWpKVHBUMVdKYkE1Umhvb1VOTG5OWW43aHc4WCtVVG5OcEVybUJXSDZjcUJuTlVVTk05c3pnRk4vMW9CK2oyVldMQmhJMGFUVDFMYUdoSkVKb1hsOEdxQkpHQW1paFdualVTdWVYbTlWMzFNNQ==", "Z": "ZUp4TlVzdE94REFNL0pXcTV4N2lObzRkZmdXaGFrRjcyOXNDRWtMOE94NC9GZzZiVGYyWThVejh2WjduMisxeXY1L24rclNzcjEvdjEvdTZMUmI5dk53K3JoNTladG9XMW0yUnZpMXpic3NZOW0vZmF0L1U3T2lIQmNTS0xDRlp3QTNKM1E3aXlOQnVYOEtaeGgwdDFqNEtjOFpQS1l0Qk1CM0hza01UbEE0Y1ZpY0FiV2dBVGFPYVNMT0RTSEJMZWdBNU13T2RLdE96aXlnMVVLTDdCSWlVWE1ma0kwdGFDeEdQWmlqemJDdG1rQXk3S0VZOGdzdEpkUVFxaFBjVTd5MGRiYlJudVpzSDR0MGdaYzltMFRJV1FqbUgrNHVpM2FuVlVlM29Hb0RkYSt3eU9BSmV4c1lwSUxDQXVETDU1Nmh6aHhJT0Q4R2tMWjBIZlRqUTR6Mm5wQlNIb2xGNEdrVHVyTC81S05remx3Z0RvY3ozeGMyVWNNZTNTbXNLcmZKeUdGdXBYRzh2OVJwSmlDaFdFdHFoRUlDK2QrWDBmSmdpWWZtZ2w1OWZoU3VTK2c9PQ=="}'
const exec = promisify(execFile)
const base64Re = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const keyDataKey = ['g', 'u', 'v', 'Z']
const cipherDataKey = ['c0', 'c1', 'c2', 'c3']
const checkInputValid = (key, dataKey) => {
  const parsedKey = JSON.parse(key)
  for (const key of dataKey) {
    if (!parsedKey.hasOwnProperty(key) || !base64Re.test(parsedKey[key])) {
      return false
    }
  }
  return true
}
const checkMessageValid = (message) => {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRe.test(message)
}
const checkKeyValid = (publicKey) => {
  return base64Re.test(publicKey)
}
const encrypt = async (publicKey, message) => {
  if (!checkKeyValid(publicKey)) {
    throw new Error('Invalid public key format')
  }
  if (!checkMessageValid(message)) {
    throw new Error('Invalid message format')
  }
  const { stdout: result } = await exec(ConfigManager.cryptoPath, [
    '--encrypt',
    '-P',
    `${params}`,
    '-p',
    `${publicKey}`,
    '-m',
    message
  ])
  // console.log(result)
  return result
}

const reencrypt = async (rekey, cipher) => {
  if (!checkKeyValid(rekey)) {
    throw new Error('Invalid rekey format')
  }
  if (!checkInputValid(cipher, cipherDataKey)) {
    throw new Error('Invalid cipher format')
  }
  const { stdout: result } = await exec(ConfigManager.cryptoPath, [
    '--re-encrypt',
    '-P',
    `${params}`,
    '-r',
    `${rekey}`,
    '-c',
    `${cipher}`
  ])
  return result
}

const CryptoHandler = {
  encrypt,
  reencrypt
}
export default CryptoHandler
