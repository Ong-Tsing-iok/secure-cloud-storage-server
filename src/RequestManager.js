import { checkLoggedIn } from './Utils'

const requestBinder = (socket) => {
  socket.on('request-agree', (uuid) => {
    if (!checkLoggedIn(socket)) return
    // TODO: store agree in database
    // TODO: send requester public key to owner to ask for re-key
    // * could be dead thread if wait for response
  })
  // TODO: handle receive re-key
  // TODO: use re-key to re-encrypt file, and add into requester's database and file system

  socket.on('request-reject', (uuid) => {
    if (!checkLoggedIn(socket)) return
    // TODO: store reject in database
  })
}

export { requestBinder }
