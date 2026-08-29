import { Server } from 'socket.io'
import { verifyWsAuthSync } from './verify-auth.js'
import { registerSocketServer } from './auth-session.js'

const createSecureWs = (httpServer, path, otherConfig = {}) => {
  const serverIo = new Server(httpServer, {
    path,
    cors: {
      origin: true,
      credentials: true
    },
    ...otherConfig
  })
  // 鉴权
  serverIo.use(verifyWsAuthSync)
  registerSocketServer(serverIo)

  return serverIo
}

export {
  createSecureWs
}
