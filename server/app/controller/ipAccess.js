import { KeyDB } from '../utils/db-class.js'
import { getClientIP } from '../utils/tools.js'
import {
  IP_ACCESS_RULE_VERSION,
  IpAccessRuleError,
  describeIpAccessRules,
  normalizeStoredIpRules,
  prepareIpAccessRuleUpdate,
  resolveStoredLegacyIpRules,
  setAllowedIpRules
} from '../utils/ip-access.js'

const keyDB = new KeyDB().getInstance()

const getRequestIP = (ctx) => {
  return getClientIP(ctx.request.socket.remoteAddress, ctx.get('x-forwarded-for'))
}

const getIpAccessData = async (ctx) => {
  const keyData = await keyDB.findOneAsync({}) || {}
  const normalizedRules = normalizeStoredIpRules(keyData.ipWhiteList)
  const legacyRules = resolveStoredLegacyIpRules({
    rules: normalizedRules,
    legacyRules: keyData.ipAccessLegacyRules,
    ruleVersion: keyData.ipAccessRuleVersion
  })
  return {
    ipWhiteList: normalizedRules,
    ipWhiteListRules: describeIpAccessRules(normalizedRules, legacyRules),
    ipAccessRuleVersion: IP_ACCESS_RULE_VERSION,
    currentIp: getRequestIP(ctx)
  }
}

const getIpAccessRules = async (ctx) => {
  ctx.res.success({ data: await getIpAccessData(ctx) })
}

const saveIpAccessRules = async (ctx) => {
  const { res, request } = ctx
  const { ipWhiteList, allowCurrentIpMismatch = false } = request.body || {}
  const keyData = await keyDB.findOneAsync({}) || {}
  const currentIp = getRequestIP(ctx)
  let normalizedRules
  let legacyRules
  let currentIpAllowed
  try {
    const existingLegacyRules = resolveStoredLegacyIpRules({
      rules: keyData.ipWhiteList,
      legacyRules: keyData.ipAccessLegacyRules,
      ruleVersion: keyData.ipAccessRuleVersion
    })
    const prepared = prepareIpAccessRuleUpdate({
      rules: ipWhiteList,
      existingRules: keyData.ipWhiteList || [],
      existingLegacyRules,
      currentIp,
      allowCurrentIpMismatch
    })
    normalizedRules = prepared.values
    legacyRules = prepared.legacyRules
    currentIpAllowed = prepared.currentIpAllowed
  } catch (error) {
    if (!(error instanceof IpAccessRuleError)) throw error
    const currentIpMismatch = error.code === 'CURRENT_IP_NOT_ALLOWED'
    return res.fail({
      status: currentIpMismatch ? 409 : 400,
      msg: error.message,
      data: currentIpMismatch
        ? { code: error.code, currentIp }
        : { code: error.code, rule: error.rule }
    })
  }

  await keyDB.updateAsync({ _id: keyData._id }, {
    $set: {
      ipWhiteList: normalizedRules,
      ipAccessLegacyRules: legacyRules,
      ipAccessRuleVersion: IP_ACCESS_RULE_VERSION
    }
  })
  setAllowedIpRules(normalizedRules, { legacyRules })
  res.success({
    msg: 'IP 访问规则已保存',
    data: {
      ipWhiteList: normalizedRules,
      ipWhiteListRules: describeIpAccessRules(normalizedRules, legacyRules),
      ipAccessRuleVersion: IP_ACCESS_RULE_VERSION,
      currentIp,
      currentIpAllowed
    }
  })
}

const rejectLegacyIpAccessApi = ({ res }) => {
  return res.fail({
    status: 410,
    msg: 'IP 访问控制接口已升级，请升级移动端版本后重试',
    data: { code: 'CLIENT_UPGRADE_REQUIRED' }
  })
}

export {
  getIpAccessRules,
  rejectLegacyIpAccessApi,
  saveIpAccessRules
}
