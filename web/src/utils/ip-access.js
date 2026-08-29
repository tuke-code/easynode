const isIPv4 = (value) => {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => {
    return /^\d+$/.test(part) &&
      (part === '0' || !part.startsWith('0')) &&
      Number(part) >= 0 && Number(part) <= 255
  })
}

const isIPv6 = (value) => {
  if (!value.includes(':') || value.includes('%')) return false
  try {
    return new URL(`http://[${ value }]/`).hostname.startsWith('[')
  } catch {
    return false
  }
}

const ipFamily = (value) => {
  if (isIPv4(value)) return 4
  if (isIPv6(value)) return 6
  return 0
}

const classifyIpAccessRule = (rawValue) => {
  const value = String(rawValue || '').trim().toLowerCase()
  const family = ipFamily(value)
  if (family) return { value, kind: 'exact' }
  if (value.includes('/')) {
    const parts = value.split('/')
    if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return { value, kind: 'invalid' }
    const cidrFamily = ipFamily(parts[0])
    const prefix = Number(parts[1])
    const maxPrefix = cidrFamily === 4 ? 32 : 128
    if (!cidrFamily || prefix < 0 || prefix > maxPrefix) return { value, kind: 'invalid' }
    return { value, kind: 'cidr' }
  }
  return { value, kind: 'legacy' }
}

const normalizeIpAccessRules = (rules) => {
  const seen = new Set()
  return (Array.isArray(rules) ? rules : []).reduce((result, rule) => {
    const value = String(rule || '').trim().toLowerCase()
    if (!value || seen.has(value)) return result
    seen.add(value)
    result.push(value)
    return result
  }, [])
}

const suggestCidrForLegacyRule = (rawValue) => {
  const value = String(rawValue || '').trim().replace(/\.$/, '')
  const parts = value.split('.')
  if (parts.length < 1 || parts.length > 3) return ''
  if (!parts.every(part => /^\d+$/.test(part) && Number(part) <= 255)) return ''
  const address = [...parts, ...Array(4 - parts.length).fill('0'),].join('.')
  return `${ address }/${ parts.length * 8 }`
}

export {
  classifyIpAccessRule,
  normalizeIpAccessRules,
  suggestCidrForLegacyRule
}
