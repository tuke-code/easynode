const DEFAULT_MAX_ATTEMPTS = 3 // 最大重试次数
const DEFAULT_LOCK_DURATION_MS = 10 * 60 * 1000 // 封锁时间
const DEFAULT_MAX_ENTRIES = 100 // 最大记录 IP 数

class LoginAttemptLimiter {
  constructor({
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    lockDurationMs = DEFAULT_LOCK_DURATION_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
    now = () => Date.now()
  } = {}) {
    this.maxAttempts = maxAttempts
    this.lockDurationMs = lockDurationMs
    this.maxEntries = maxEntries
    this.now = now
    this.records = new Map()
  }

  getStatus(ip) {
    const now = this.now()
    const record = this.records.get(ip)
    if (!record) return this.#emptyStatus()

    if (record.lockedUntil > 0 && record.lockedUntil <= now) {
      this.records.delete(ip)
      return this.#emptyStatus()
    }

    if (record.lockedUntil > now) {
      record.lastActivityAt = now
      return this.#status(record)
    }

    return this.#status(record)
  }

  recordFailure(ip) {
    const now = this.now()
    let record = this.records.get(ip)

    if (record?.lockedUntil > 0 && record.lockedUntil <= now) {
      this.records.delete(ip)
      record = null
    }

    if (record?.lockedUntil > now) {
      record.lastActivityAt = now
      return this.#status(record)
    }

    if (!record) {
      this.#makeRoom(now)
      record = { failedAttempts: 0, lockedUntil: 0, lastActivityAt: now }
      this.records.set(ip, record)
    }

    record.failedAttempts += 1
    record.lastActivityAt = now
    let justLocked = false
    if (record.failedAttempts >= this.maxAttempts) {
      record.failedAttempts = this.maxAttempts
      record.lockedUntil = now + this.lockDurationMs
      justLocked = true
    }

    return { ...this.#status(record), justLocked }
  }

  reset(ip) {
    this.records.delete(ip)
  }

  clear() {
    this.records.clear()
  }

  get size() {
    return this.records.size
  }

  #makeRoom(now) {
    for (const [ip, record] of this.records) {
      if (record.lockedUntil > 0 && record.lockedUntil <= now) this.records.delete(ip)
    }

    while (this.records.size >= this.maxEntries) {
      let oldestIp = null
      let oldestActivityAt = Infinity
      for (const [ip, record] of this.records) {
        if (record.lastActivityAt < oldestActivityAt) {
          oldestIp = ip
          oldestActivityAt = record.lastActivityAt
        }
      }
      if (oldestIp === null) break
      this.records.delete(oldestIp)
    }
  }

  #status(record) {
    const remainingMs = Math.max(0, record.lockedUntil - this.now())
    return {
      locked: remainingMs > 0,
      failedAttempts: record.failedAttempts,
      retryAfterSeconds: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
      justLocked: false
    }
  }

  #emptyStatus() {
    return {
      locked: false,
      failedAttempts: 0,
      retryAfterSeconds: 0,
      justLocked: false
    }
  }
}

const loginAttemptLimiter = new LoginAttemptLimiter()

export {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_LOCK_DURATION_MS,
  DEFAULT_MAX_ENTRIES,
  LoginAttemptLimiter,
  loginAttemptLimiter
}
