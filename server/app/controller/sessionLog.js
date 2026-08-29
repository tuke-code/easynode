import { SessionDB } from '../utils/db-class.js'
import { cookieSecure } from '../config/index.js'
import { disconnectAllSessionConnections, revokeAllSessions } from '../utils/auth-session.js'
import { pruneLoginLogs } from '../utils/login-log.js'
const sessionDB = new SessionDB().getInstance()

async function getLog({ res }) {
  await pruneLoginLogs(sessionDB)
  let sessionList = await sessionDB.findAsync({})
  sessionList = sessionList.map(item => {
    // eslint-disable-next-line no-unused-vars
    const { session, ...otherInfo } = item
    return { ...otherInfo, id: item._id }
  })
  sessionList?.sort((a, b) => Number(b.create) - Number(a.create))
  res.success({ data: { list: sessionList } })
}

const revokeLoginSid = async (ctx) => {
  const { res, request, cookies } = ctx
  let { params: { id } } = request
  const session = cookies.get('session')
  const { _id: curId, deviceId: curDeviceId } = await sessionDB.findOneAsync({ session })
  let result = await sessionDB.updateAsync({
    $or: [
      { _id: id },
      { deviceId: id }
    ]
  }, { $set: { revoked: true } })
  if (id === curId || id === curDeviceId) {
    logger.warn('注销当前登录凭证，清除cookie')
    ctx.cookies.set('session', '', { expires: new Date(0) })
  }
  if (!result || !result.numAffected) return res.fail({ msg: '注销凭证失败' })
  res.success({ msg: '注销凭证成功' })
}

const revokeAllLoginSessions = async (ctx) => {
  try {
    await revokeAllSessions(sessionDB)
  } finally {
    // 已建立的长连接不会再次经过鉴权，需要主动断开。
    disconnectAllSessionConnections()
  }
  ctx.cookies.set('session', '', {
    httpOnly: true,
    expires: new Date(0),
    sameSite: 'strict',
    secure: cookieSecure
  })
  ctx.res.success({ msg: '已注销所有会话，请重新登录' })
}

export {
  getLog,
  revokeAllLoginSessions,
  revokeLoginSid
}
