const checkLoggedIn = (socket) => {
  if (!socket.authed) {
    // TODO: log unauthorized attempt
    socket.emit('message', 'not logged in')
    return false
  }
  return true
}

export { checkLoggedIn }
