const LOGIN_LOG_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

const pruneLoginLogs = (sessionStore, now = Date.now()) => {
  const cutoff = now - LOGIN_LOG_RETENTION_DAYS * DAY_MS
  return sessionStore.removeAsync(
    { create: { $lt: cutoff } },
    { multi: true }
  )
}

export {
  LOGIN_LOG_RETENTION_DAYS,
  pruneLoginLogs
}
