import assert from 'node:assert/strict'
import {
  classifyIpAccessRule,
  normalizeIpAccessRules,
  suggestCidrForLegacyRule
} from '../src/utils/ip-access.js'

assert.deepEqual(classifyIpAccessRule('192.168.1.10'), { value: '192.168.1.10', kind: 'exact' })
assert.deepEqual(classifyIpAccessRule('2001:db8::1'), { value: '2001:db8::1', kind: 'exact' })
assert.deepEqual(classifyIpAccessRule('10.0.0.0/8'), { value: '10.0.0.0/8', kind: 'cidr' })
assert.deepEqual(classifyIpAccessRule('2001:db8::/32'), { value: '2001:db8::/32', kind: 'cidr' })
assert.equal(classifyIpAccessRule('192.168').kind, 'legacy')
assert.equal(classifyIpAccessRule('192.168.1.0/33').kind, 'invalid')
assert.equal(classifyIpAccessRule('2001:db8::/129').kind, 'invalid')
assert.deepEqual(normalizeIpAccessRules([' 10.0.0.1 ', '10.0.0.1', '2001:DB8::1',]), [
  '10.0.0.1',
  '2001:db8::1',
])
assert.equal(suggestCidrForLegacyRule('192.168'), '192.168.0.0/16')
assert.equal(suggestCidrForLegacyRule('192.168.1.'), '192.168.1.0/24')
assert.equal(suggestCidrForLegacyRule('168.1.foo'), '')

console.log('Web IP 访问规则测试通过')
