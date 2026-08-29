import net from 'node:net'

const IP_ACCESS_RULE_VERSION = 2
const MAX_IP_ACCESS_RULES = 100
const MAX_IP_ACCESS_RULE_LENGTH = 64

let activeRuleSet

class IpAccessRuleError extends Error {
  constructor(code, message, rule) {
    super(message)
    this.name = 'IpAccessRuleError'
    this.code = code
    this.rule = rule
  }
}

const normalizeIpAddress = (ip) => {
  if (typeof ip !== 'string') return ''
  ip = ip.trim().toLowerCase()
  if (ip.startsWith('::ffff:')) {
    const ipv4Part = ip.slice(7)
    if (net.isIPv4(ipv4Part)) return ipv4Part
  }
  return ip
}

const normalizeRuleValue = (value) => value.trim().toLowerCase()

const parseCidrRule = (value) => {
  const parts = value.split('/')
  if (parts.length !== 2) return null
  const [address, prefixText] = parts
  const family = net.isIP(address)
  if (!family || !/^\d+$/.test(prefixText)) return null
  const prefix = Number(prefixText)
  const maxPrefix = family === 4 ? 32 : 128
  if (prefix < 0 || prefix > maxPrefix) return null
  return { address, prefix, family }
}

const classifyStrictIpRule = (value) => {
  const family = net.isIP(value)
  if (family) return { value, kind: 'exact', family }
  if (value.includes('/')) {
    const cidr = parseCidrRule(value)
    return cidr ? { value, kind: 'cidr', ...cidr } : { value, kind: 'invalid' }
  }
  return { value, kind: 'legacy' }
}

const normalizeStoredIpRules = (rules) => {
  if (!Array.isArray(rules)) return []
  const seen = new Set()
  return rules.reduce((result, rule) => {
    if (typeof rule !== 'string') return result
    const value = normalizeRuleValue(rule)
    if (!value || seen.has(value)) return result
    seen.add(value)
    result.push(value)
    return result
  }, [])
}

const normalizeLegacyIpRules = (rules, legacyRules = []) => {
  const values = normalizeStoredIpRules(rules)
  const valueSet = new Set(values)
  return normalizeStoredIpRules(legacyRules).filter(value => valueSet.has(value))
}

const resolveStoredLegacyIpRules = ({ rules, legacyRules = [], ruleVersion }) => {
  const values = normalizeStoredIpRules(rules)
  if (Number(ruleVersion) < IP_ACCESS_RULE_VERSION || !Number.isFinite(Number(ruleVersion))) return values

  const explicitLegacyRules = normalizeLegacyIpRules(values, legacyRules)
  const syntacticLegacyRules = values.filter(value => classifyStrictIpRule(value).kind === 'legacy')
  return normalizeLegacyIpRules(values, [...explicitLegacyRules, ...syntacticLegacyRules])
}

const describeIpAccessRules = (rules, legacyRules = []) => {
  const legacyRuleSet = new Set(normalizeLegacyIpRules(rules, legacyRules))
  return normalizeStoredIpRules(rules).map((value) => {
    if (legacyRuleSet.has(value)) return { value, kind: 'legacy' }
    const rule = classifyStrictIpRule(value)
    if (rule.kind === 'exact' || rule.kind === 'cidr') {
      return { value, kind: rule.kind }
    }
    return { value, kind: 'legacy' }
  })
}

const validateIpAccessRules = (rules, existingRules = [], existingLegacyRules = []) => {
  if (!Array.isArray(rules)) {
    throw new IpAccessRuleError('INVALID_IP_RULE', 'IP 访问规则必须是数组')
  }

  const existingLegacyRuleSet = new Set(
    describeIpAccessRules(existingRules, existingLegacyRules)
      .filter(({ kind }) => kind === 'legacy')
      .map(({ value }) => value)
  )
  const values = normalizeStoredIpRules(rules)
  if (values.length > MAX_IP_ACCESS_RULES) {
    throw new IpAccessRuleError('INVALID_IP_RULE', `IP 访问规则不能超过 ${ MAX_IP_ACCESS_RULES } 条`)
  }

  for (const rawRule of rules) {
    if (typeof rawRule !== 'string') {
      throw new IpAccessRuleError('INVALID_IP_RULE', 'IP 访问规则必须是字符串', rawRule)
    }
  }

  for (const value of values) {
    if (value.length > MAX_IP_ACCESS_RULE_LENGTH && !existingLegacyRuleSet.has(value)) {
      throw new IpAccessRuleError('INVALID_IP_RULE', `IP 访问规则长度不能超过 ${ MAX_IP_ACCESS_RULE_LENGTH } 个字符`, value)
    }
    const rule = classifyStrictIpRule(value)
    if (rule.kind === 'exact' || rule.kind === 'cidr') continue
    if (existingLegacyRuleSet.has(value)) continue
    if (rule.kind === 'invalid') {
      throw new IpAccessRuleError('INVALID_IP_RULE', '请输入有效的精确 IP 或 CIDR 网段', value)
    }
    throw new IpAccessRuleError('LEGACY_IP_RULE_NOT_ALLOWED', '不能新增旧版模糊 IP 规则，请使用精确 IP 或 CIDR 网段', value)
  }

  return values
}

function compileIpAccessRules(rules, legacyRules = []) {
  const values = normalizeStoredIpRules(rules)
  const legacyRuleSet = new Set(normalizeLegacyIpRules(values, legacyRules))
  const blockList = new net.BlockList()
  const compiledLegacyRules = []

  for (const value of values) {
    if (legacyRuleSet.has(value)) {
      compiledLegacyRules.push(value)
      continue
    }
    const rule = classifyStrictIpRule(value)
    if (rule.kind === 'exact') {
      blockList.addAddress(value, rule.family === 4 ? 'ipv4' : 'ipv6')
    } else if (rule.kind === 'cidr') {
      blockList.addSubnet(rule.address, rule.prefix, rule.family === 4 ? 'ipv4' : 'ipv6')
    } else {
      compiledLegacyRules.push(value)
    }
  }

  return { values, blockList, legacyRules: compiledLegacyRules }
}

const matchesCompiledIpRules = (requestIP, compiledRules) => {
  if (compiledRules.values.length === 0) return true
  const normalizedIP = normalizeIpAddress(requestIP)
  const family = net.isIP(normalizedIP)
  if (!family) return false
  if (compiledRules.blockList.check(normalizedIP, family === 4 ? 'ipv4' : 'ipv6')) return true
  return compiledRules.legacyRules.some(rule => normalizedIP.includes(rule))
}

const isIpAllowedByRules = (requestIP, rules, { legacyRules = [] } = {}) => {
  return matchesCompiledIpRules(requestIP, compileIpAccessRules(rules, legacyRules))
}

const prepareIpAccessRuleUpdate = ({
  rules,
  existingRules,
  existingLegacyRules = [],
  currentIp,
  allowCurrentIpMismatch = false
}) => {
  const values = validateIpAccessRules(rules, existingRules, existingLegacyRules)
  const existingLegacyRuleSet = new Set(
    describeIpAccessRules(existingRules, existingLegacyRules)
      .filter(({ kind }) => kind === 'legacy')
      .map(({ value }) => value)
  )
  const retainedLegacyRules = values.filter(value => existingLegacyRuleSet.has(value))
  const currentIpAllowed = isIpAllowedByRules(currentIp, values, { legacyRules: retainedLegacyRules })
  if (values.length > 0 && !currentIpAllowed && allowCurrentIpMismatch !== true) {
    throw new IpAccessRuleError(
      'CURRENT_IP_NOT_ALLOWED',
      '当前来源 IP 不在新的访问规则中，保存后本设备将无法继续访问',
      currentIp
    )
  }
  return { values, legacyRules: retainedLegacyRules, currentIpAllowed }
}

const setAllowedIpRules = (rules, { legacyRules = [] } = {}) => {
  activeRuleSet = compileIpAccessRules(rules, legacyRules)
  return [...activeRuleSet.values]
}

const isAllowedIp = (requestIP) => matchesCompiledIpRules(requestIP, activeRuleSet)

activeRuleSet = compileIpAccessRules([])

export {
  IP_ACCESS_RULE_VERSION,
  MAX_IP_ACCESS_RULES,
  MAX_IP_ACCESS_RULE_LENGTH,
  IpAccessRuleError,
  describeIpAccessRules,
  isAllowedIp,
  isIpAllowedByRules,
  normalizeIpAddress,
  normalizeLegacyIpRules,
  normalizeStoredIpRules,
  prepareIpAccessRuleUpdate,
  resolveStoredLegacyIpRules,
  setAllowedIpRules,
  validateIpAccessRules
}
