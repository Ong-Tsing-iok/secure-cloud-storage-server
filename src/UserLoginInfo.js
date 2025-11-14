import ConfigManager from './ConfigManager.js'
import EvictingMap from './EvictingMap.js'
import { logSocketInfo, logSocketWarning } from './Logger.js'

const CLIENT_IDLE_LIMIT_MIN = 30
const loginMap = new EvictingMap(1 * 60 * 1000) // 30 minute for idle timeout
const socketToUserIdMap = new Map()

export function userLogin(userId, socket) {
  if (loginMap.has(userId)) {
    // Already logged in
    logSocketWarning(socket, 'Multiple login for same account.')
    return false
  }
  loginMap.set(userId, { socket, checkTime: 0 })
  socketToUserIdMap.set(socket.id, userId)
  return true
}

export function userLogout(socket) {
  const userId = socketToUserIdMap.get(socket.id)
  if (userId) {
    socketToUserIdMap.delete(socket.id)
    loginMap.delete(userId)
    logSocketInfo(socket, 'User logged out.')
  }
}

export function checkUserLoggedIn(userId) {
  return loginMap.has(userId)
}

export function getLoggedInUserIdOfSocket(socketId) {
  return socketToUserIdMap.get(socketId)
}

export function emitToOnlineUser(userId, event, ...data) {
  if (loginMap.has(userId)) {
    loginMap.get(userId).socket.emit(event, ...data)
  }
}

// Idle timeout
loginMap.onExpired((key, value) => {
  logSocketInfo(value.socket, `Client Idle for ${CLIENT_IDLE_LIMIT_MIN} minutes. Disconnecting...`)
  userLogout(value.socket.id)
  value.socket.disconnect(true)
})

const loginFailureMap = new EvictingMap(5 * 60 * 1000) // 5 minute for failure record
const loginBlockedMap = new EvictingMap(15 * 60 * 1000) // Block login for 15 minutes

export function userLoginFailure(userId) {
  if (loginFailureMap.has(userId)) {
    const failureTimes = loginFailureMap.get(userId) + 1
    if (failureTimes >= ConfigManager.loginAttemptsLimit) {
      loginBlockedMap.set(userId, 0)
    }
    loginFailureMap.set(userId, failureTimes)
  } else {
    loginFailureMap.set(userId, 1)
  }
}

export function checkLoginBlocked(userId) {
  return loginBlockedMap.has(userId)
}
