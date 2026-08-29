import assert from 'node:assert/strict'
import Datastore from '@seald-io/nedb'
import {
  disconnectAllSessionConnections,
  registerRdpSocket,
  registerSocketServer,
  revokeAllSessions
} from '../app/utils/auth-session.js'

const calls = []
const sessionStore = {
  async updateAsync(query, update, options) {
    calls.push({ query, update, options })
    return { numAffected: 3 }
  }
}

const result = await revokeAllSessions(sessionStore)

assert.deepEqual(calls, [{
  query: {},
  update: { $set: { revoked: true } },
  options: { multi: true }
}])
assert.deepEqual(result, { numAffected: 3 })

const realSessionStore = new Datastore()
await realSessionStore.insertAsync([
  { session: 'session-1', revoked: false },
  { session: 'session-2', revoked: false },
  { session: 'session-3', revoked: true }
])
await revokeAllSessions(realSessionStore)
const storedSessions = await realSessionStore.findAsync({})
assert.equal(storedSessions.length, 3)
assert.ok(storedSessions.every(session => session.revoked === true))

let disconnectCalls = 0
let destroyCalls = 0
const closeListeners = []
registerSocketServer({
  disconnectSockets(close) {
    assert.equal(close, true)
    disconnectCalls++
  }
})
registerRdpSocket({
  once(event, listener) {
    assert.equal(event, 'close')
    closeListeners.push(listener)
  },
  destroy() {
    destroyCalls++
  }
})

disconnectAllSessionConnections()
assert.equal(disconnectCalls, 1)
assert.equal(destroyCalls, 1)

// 已清空的 RDP 连接不得被重复销毁，迟到的 close 事件也必须安全。
closeListeners[0]()
disconnectAllSessionConnections()
assert.equal(disconnectCalls, 2)
assert.equal(destroyCalls, 1)

console.log('全量 Session 吊销测试通过')
