const socketServers = new Set()
const rdpSockets = new Set()

const registerSocketServer = (serverIo) => {
  socketServers.add(serverIo)
  return serverIo
}

const registerRdpSocket = (socket) => {
  rdpSockets.add(socket)
  socket.once('close', () => rdpSockets.delete(socket))
}

const revokeAllSessions = async (sessionStore) => {
  return sessionStore.updateAsync(
    {},
    { $set: { revoked: true } },
    { multi: true }
  )
}

const disconnectAllSessionConnections = () => {
  for (const serverIo of socketServers) serverIo.disconnectSockets(true)
  for (const socket of rdpSockets) socket.destroy()
  rdpSockets.clear()
}

export {
  disconnectAllSessionConnections,
  registerRdpSocket,
  registerSocketServer,
  revokeAllSessions
}
