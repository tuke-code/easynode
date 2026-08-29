import assert from 'node:assert/strict'
import {
  IP_ACCESS_RULE_VERSION,
  IpAccessRuleError,
  describeIpAccessRules,
  isAllowedIp,
  isIpAllowedByRules,
  prepareIpAccessRuleUpdate,
  resolveStoredLegacyIpRules,
  setAllowedIpRules,
  validateIpAccessRules
} from '../app/utils/ip-access.js'

assert.equal(IP_ACCESS_RULE_VERSION, 2)
assert.equal(isIpAllowedByRules('203.0.113.10', []), true)

assert.equal(isIpAllowedByRules('192.168.1.10', ['192.168.1.10']), true)
assert.equal(isIpAllowedByRules('192.168.1.100', ['192.168.1.10']), false)
assert.equal(isIpAllowedByRules('192.168.1.100', ['192.168.1.10'], {
  legacyRules: ['192.168.1.10']
}), true)
assert.equal(isIpAllowedByRules('::ffff:192.168.1.10', ['192.168.1.10']), true)

assert.equal(isIpAllowedByRules('10.12.3.4', ['10.0.0.0/8']), true)
assert.equal(isIpAllowedByRules('11.12.3.4', ['10.0.0.0/8']), false)
assert.equal(isIpAllowedByRules('2001:db8::99', ['2001:db8::/32']), true)
assert.equal(isIpAllowedByRules('2001:db9::99', ['2001:db8::/32']), false)
assert.equal(isIpAllowedByRules('2001:0db8:0:0:0:0:0:1', ['2001:db8::1']), true)

assert.equal(isIpAllowedByRules('192.168.22.7', ['192.168']), true)
assert.equal(isIpAllowedByRules('10.0.0.1', ['192.168']), false)
assert.deepEqual(describeIpAccessRules(['192.168.1.10', '10.0.0.0/8', '192.168']), [
  { value: '192.168.1.10', kind: 'exact' },
  { value: '10.0.0.0/8', kind: 'cidr' },
  { value: '192.168', kind: 'legacy' }
])
assert.deepEqual(describeIpAccessRules(['192.168.1.10'], ['192.168.1.10']), [
  { value: '192.168.1.10', kind: 'legacy' }
])

assert.deepEqual(resolveStoredLegacyIpRules({
  rules: ['192.168.1.10', '10.0.0.0/8', '192.168'],
  ruleVersion: undefined
}), ['192.168.1.10', '10.0.0.0/8', '192.168'])
assert.deepEqual(resolveStoredLegacyIpRules({
  rules: ['192.168.1.10', '10.0.0.0/8', '192.168'],
  legacyRules: ['192.168.1.10'],
  ruleVersion: IP_ACCESS_RULE_VERSION
}), ['192.168.1.10', '192.168'])

assert.deepEqual(
  validateIpAccessRules([' 192.168.1.10 ', '192.168.1.10', '2001:DB8::/32'], []),
  ['192.168.1.10', '2001:db8::/32']
)
assert.deepEqual(validateIpAccessRules(['192.168'], ['192.168']), ['192.168'])
assert.deepEqual(validateIpAccessRules([], ['192.168']), [])

assert.throws(
  () => validateIpAccessRules(['192.168'], []),
  error => error instanceof IpAccessRuleError && error.code === 'LEGACY_IP_RULE_NOT_ALLOWED'
)
assert.throws(
  () => validateIpAccessRules(['192.168.1.0/33'], []),
  error => error instanceof IpAccessRuleError && error.code === 'INVALID_IP_RULE'
)
assert.throws(
  () => validateIpAccessRules([123], []),
  error => error instanceof IpAccessRuleError && error.code === 'INVALID_IP_RULE'
)
assert.throws(
  () => validateIpAccessRules(['x'.repeat(65)], []),
  error => error instanceof IpAccessRuleError && error.code === 'INVALID_IP_RULE'
)
assert.throws(
  () => validateIpAccessRules(Array.from({ length: 101 }, (_, index) => `10.0.0.${ index }`), []),
  error => error instanceof IpAccessRuleError && error.code === 'INVALID_IP_RULE'
)

assert.deepEqual(prepareIpAccessRuleUpdate({
  rules: ['192.168.1.24'],
  existingRules: [],
  currentIp: '192.168.1.24'
}), {
  values: ['192.168.1.24'],
  legacyRules: [],
  currentIpAllowed: true
})
assert.deepEqual(prepareIpAccessRuleUpdate({
  rules: ['192.168.1.0/24'],
  existingRules: [],
  currentIp: '192.168.1.24'
}), {
  values: ['192.168.1.0/24'],
  legacyRules: [],
  currentIpAllowed: true
})
assert.deepEqual(prepareIpAccessRuleUpdate({
  rules: ['192.168'],
  existingRules: ['192.168'],
  currentIp: '192.168.1.24'
}), {
  values: ['192.168'],
  legacyRules: ['192.168'],
  currentIpAllowed: true
})
assert.deepEqual(prepareIpAccessRuleUpdate({
  rules: ['192.168.1.10'],
  existingRules: ['192.168.1.10'],
  existingLegacyRules: ['192.168.1.10'],
  currentIp: '192.168.1.100'
}), {
  values: ['192.168.1.10'],
  legacyRules: ['192.168.1.10'],
  currentIpAllowed: true
})
assert.throws(
  () => prepareIpAccessRuleUpdate({
    rules: ['10.0.0.0/8'],
    existingRules: [],
    currentIp: '192.168.1.24'
  }),
  error => error instanceof IpAccessRuleError && error.code === 'CURRENT_IP_NOT_ALLOWED'
)
assert.deepEqual(prepareIpAccessRuleUpdate({
  rules: ['10.0.0.0/8'],
  existingRules: [],
  currentIp: '192.168.1.24',
  allowCurrentIpMismatch: true
}), {
  values: ['10.0.0.0/8'],
  legacyRules: [],
  currentIpAllowed: false
})
assert.equal(prepareIpAccessRuleUpdate({
  rules: [],
  existingRules: [],
  currentIp: '192.168.1.24'
}).currentIpAllowed, true)

setAllowedIpRules(['127.0.0.1', '10.0.0.0/8'])
assert.equal(isAllowedIp('::ffff:127.0.0.1'), true)
assert.equal(isAllowedIp('10.20.30.40'), true)
assert.equal(isAllowedIp('192.168.1.10'), false)
setAllowedIpRules(['192.168.1.10'], { legacyRules: ['192.168.1.10'] })
assert.equal(isAllowedIp('192.168.1.100'), true)
setAllowedIpRules([])
assert.equal(isAllowedIp('192.168.1.10'), true)

console.log('IP 访问控制规则测试通过')
