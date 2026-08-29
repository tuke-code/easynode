import assert from 'node:assert/strict'
import {
  LoginAttemptLimiter,
  DEFAULT_LOCK_DURATION_MS
} from '../app/utils/login-attempt-limiter.js'
import { getClientIP } from '../app/utils/tools.js'

let now = 1_000
const createLimiter = (options = {}) => new LoginAttemptLimiter({
  now: () => now,
  ...options
})

const limiter = createLimiter()
assert.deepEqual(limiter.recordFailure('203.0.113.10'), {
  locked: false,
  failedAttempts: 1,
  retryAfterSeconds: 0,
  justLocked: false
})
assert.equal(limiter.recordFailure('203.0.113.10').failedAttempts, 2)

const locked = limiter.recordFailure('203.0.113.10')
assert.equal(locked.locked, true)
assert.equal(locked.justLocked, true)
assert.equal(locked.retryAfterSeconds, 600)
assert.equal(limiter.getStatus('203.0.113.10').locked, true)
assert.equal(limiter.getStatus('198.51.100.20').locked, false)
assert.equal(limiter.recordFailure('203.0.113.10').justLocked, false)
assert.equal(limiter.getStatus('203.0.113.10').retryAfterSeconds, 600)

now += DEFAULT_LOCK_DURATION_MS - 1
assert.equal(limiter.getStatus('203.0.113.10').retryAfterSeconds, 1)
now += 1
assert.deepEqual(limiter.getStatus('203.0.113.10'), {
  locked: false,
  failedAttempts: 0,
  retryAfterSeconds: 0,
  justLocked: false
})

limiter.recordFailure('10.0.0.2')
limiter.recordFailure('10.0.0.2')
limiter.reset('10.0.0.2')
assert.equal(limiter.recordFailure('10.0.0.2').failedAttempts, 1)

const boundedLimiter = createLimiter({ maxEntries: 3 })
boundedLimiter.recordFailure('192.168.1.1')
now += 1
boundedLimiter.recordFailure('192.168.1.2')
now += 1
boundedLimiter.recordFailure('192.168.1.3')
now += 1
boundedLimiter.recordFailure('192.168.1.4')
assert.equal(boundedLimiter.size, 3)
assert.equal(boundedLimiter.getStatus('192.168.1.1').failedAttempts, 0)
assert.equal(boundedLimiter.getStatus('192.168.1.4').failedAttempts, 1)

const cleanupLimiter = createLimiter({ maxAttempts: 1, lockDurationMs: 10, maxEntries: 2 })
cleanupLimiter.recordFailure('172.16.0.1')
now += 10
cleanupLimiter.recordFailure('172.16.0.2')
assert.equal(cleanupLimiter.size, 1)

const defaultCapacityLimiter = createLimiter()
for (let i = 1; i <= 101; i++) {
  now += 1
  defaultCapacityLimiter.recordFailure(`10.0.0.${ i }`)
}
assert.equal(defaultCapacityLimiter.size, 100)
assert.equal(defaultCapacityLimiter.getStatus('10.0.0.1').failedAttempts, 0)

assert.equal(getClientIP('::ffff:192.168.1.10'), '192.168.1.10')
assert.equal(getClientIP('10.1.2.3'), '10.1.2.3')
assert.equal(getClientIP('172.16.2.3'), '172.16.2.3')
assert.equal(getClientIP('172.31.2.3'), '172.31.2.3')
assert.equal(getClientIP('192.168.2.3'), '192.168.2.3')
assert.equal(getClientIP('::1'), '::1')
assert.equal(getClientIP('fd00::10'), 'fd00::10')
assert.equal(getClientIP('192.168.1.10', '10.0.0.8'), '10.0.0.8')
assert.equal(getClientIP('fd00::10', 'fd00::20'), 'fd00::20')
assert.equal(getClientIP('203.0.113.10', '198.51.100.20'), '203.0.113.10')
assert.equal(getClientIP('::1', '2001:db8::10'), '2001:db8::10')

console.log('登录 IP 锁定测试通过')
