import assert from 'node:assert/strict'

async function loadCookieSecure(value, cacheKey) {
  if (value === undefined) {
    delete process.env.COOKIE_SECURE
  } else {
    process.env.COOKIE_SECURE = value
  }
  const { cookieSecure } = await import(`../app/config/index.js?${ cacheKey }`)
  return cookieSecure
}

const originalValue = process.env.COOKIE_SECURE

assert.equal(await loadCookieSecure(undefined, 'unset'), false)
assert.equal(await loadCookieSecure('false', 'false'), false)
assert.equal(await loadCookieSecure('TRUE', 'uppercase'), false)
assert.equal(await loadCookieSecure('true', 'true'), true)

if (originalValue === undefined) {
  delete process.env.COOKIE_SECURE
} else {
  process.env.COOKIE_SECURE = originalValue
}

console.log('Cookie security config tests passed')
