<template>
  <section class="ip_access_panel">
    <div class="access_toolbar">
      <label class="rule_label" for="ip-access-rule-input">允许访问的 IP 规则</label>
      <el-tag :type="allowedIPs.length ? 'success' : 'info'" effect="light" round>
        {{ allowedIPs.length ? `限制中 · ${ allowedIPs.length } 条规则` : '未限制' }}
      </el-tag>
    </div>

    <div class="access_body">
      <div v-if="currentIp" class="current_ip_row">
        <span>当前来源 IP <code>{{ currentIp }}</code></span>
        <el-button
          type="primary"
          plain
          size="small"
          :disabled="allowedIPs.includes(currentIp)"
          @click="handleAddCurrentIp"
        >
          {{ allowedIPs.includes(currentIp) ? '当前 IP 已加入' : '加入当前 IP' }}
        </el-button>
      </div>

      <div v-if="allowedIPs.length" class="rule_list">
        <div v-for="rule in displayRules" :key="rule.value" class="rule_item">
          <el-tag closable :type="rule.kind === 'legacy' ? 'warning' : 'primary'" @close="handleRemoveRule(rule.value)">
            <code>{{ rule.value }}</code>
          </el-tag>
          <span v-if="rule.kind === 'legacy'" class="legacy_hint">
            旧版模糊规则
            <template v-if="rule.suggestion">，建议替换为 <code>{{ rule.suggestion }}</code></template>
          </span>
        </div>
      </div>
      <div v-else class="empty_rules">尚未设置规则，当前允许所有来源 IP 访问。</div>

      <div class="rule_input_row">
        <el-input
          id="ip-access-rule-input"
          v-model.trim="ruleInput"
          placeholder="输入精确 IP 或 CIDR，例如 192.168.1.0/24"
          maxlength="64"
          clearable
          @keyup.enter="handleAddRule"
        />
        <el-button type="primary" :disabled="!ruleInput" @click="handleAddRule">添加</el-button>
      </div>
      <p v-if="ruleInputError" class="rule_error">{{ ruleInputError }}</p>
      <p class="rule_help">
        支持 IPv4、IPv6 与 CIDR 网段；旧版模糊规则可继续保留，但不能新增。
      </p>
    </div>

    <footer class="access_footer">
      <span v-if="rulesDirty" class="is_dirty">有未保存的修改</span>
      <div class="access_footer_actions">
        <el-button :disabled="!rulesDirty || btnLoading" @click="handleResetRules">撤销修改</el-button>
        <el-button
          type="primary"
          :loading="btnLoading"
          :disabled="!rulesDirty"
          @click="handleSaveRules"
        >
          保存设置
        </el-button>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import {
  classifyIpAccessRule,
  normalizeIpAccessRules,
  suggestCidrForLegacyRule
} from '@/utils/ip-access.js'

const { proxy: { $api, $message, $messageBox } } = getCurrentInstance()

const btnLoading = ref(false)
const allowedIPs = ref([])
const savedAllowedIPs = ref([])
const serverRuleKinds = ref(new Map())
const currentIp = ref('')
const ruleInput = ref('')
const ruleInputError = ref('')
const rulesDirty = computed(() => JSON.stringify(allowedIPs.value) !== JSON.stringify(savedAllowedIPs.value))
const displayRules = computed(() => allowedIPs.value.map((value) => {
  const kind = serverRuleKinds.value.get(value) || classifyIpAccessRule(value).kind
  return {
    value,
    kind,
    suggestion: kind === 'legacy' ? suggestCidrForLegacyRule(value) : ''
  }
}))

const applyRuleResponse = (data) => {
  const rules = normalizeIpAccessRules(data?.ipWhiteList)
  allowedIPs.value = rules
  savedAllowedIPs.value = [...rules,]
  currentIp.value = data?.currentIp || ''
  serverRuleKinds.value = new Map(
    (data?.ipWhiteListRules || []).map(rule => [rule.value, rule.kind,])
  )
}

const handleLookupRules = async () => {
  const { data } = await $api.getIpAccessRules()
  applyRuleResponse(data)
}

const handleAddRule = () => {
  const value = ruleInput.value.trim().toLowerCase()
  ruleInputError.value = ''
  if (!value) return
  const rule = classifyIpAccessRule(value)
  if (!['exact', 'cidr',].includes(rule.kind)) {
    ruleInputError.value = rule.kind === 'legacy'
      ? '不能新增模糊 IP 规则，请输入精确 IP 或 CIDR 网段。'
      : '请输入有效的精确 IP 或 CIDR 网段。'
    return
  }
  allowedIPs.value = normalizeIpAccessRules([...allowedIPs.value, value,])
  ruleInput.value = ''
}

const handleAddCurrentIp = () => {
  if (!currentIp.value) return
  allowedIPs.value = normalizeIpAccessRules([...allowedIPs.value, currentIp.value,])
}

const handleRemoveRule = (value) => {
  allowedIPs.value = allowedIPs.value.filter(rule => rule !== value)
}

const handleResetRules = () => {
  allowedIPs.value = [...savedAllowedIPs.value,]
  ruleInput.value = ''
  ruleInputError.value = ''
}

const persistRules = async (allowCurrentIpMismatch = false) => {
  const payload = { ipWhiteList: allowedIPs.value, allowCurrentIpMismatch }
  const response = await $api.saveIpAccessRules(payload)
  if (response.data?.currentIpAllowed === false) {
    window.location.reload()
    return
  }
  if (response.data) applyRuleResponse(response.data)
  else await handleLookupRules()
  $message.success(response.msg || 'IP 访问规则已保存')
}

const handleCurrentIpMismatch = async (error) => {
  const blockedIp = error.response?.data?.data?.currentIp || currentIp.value
  let action = 'close'
  try {
    await $messageBox.confirm(
      `当前来源 IP ${ blockedIp } 不在新规则中，保存后本设备将立即无法访问。`,
      '当前 IP 不在规则中',
      {
        confirmButtonText: '加入当前 IP 并保存',
        cancelButtonText: '仍然保存',
        distinguishCancelAndClose: true,
        type: 'warning',
        cancelButtonClass: 'el-button--danger'
      }
    )
    action = 'confirm'
  } catch (result) {
    action = result
  }

  if (action === 'confirm') {
    allowedIPs.value = normalizeIpAccessRules([...allowedIPs.value, blockedIp,])
    await persistRules(false)
  } else if (action === 'cancel') {
    await persistRules(true)
  }
}

const handleSaveRules = async () => {
  if (!allowedIPs.value.length && savedAllowedIPs.value.length) {
    try {
      await $messageBox.confirm(
        '清空全部规则将关闭 IP 访问限制，任何来源 IP 都可以访问面板。',
        '关闭 IP 访问限制',
        { confirmButtonText: '确认关闭', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return
    }
  }

  btnLoading.value = true
  try {
    await persistRules(false)
  } catch (error) {
    if (error.response?.data?.data?.code === 'CURRENT_IP_NOT_ALLOWED') {
      await handleCurrentIpMismatch(error)
    } else {
      throw error
    }
  } finally {
    btnLoading.value = false
  }
}

onMounted(handleLookupRules)
</script>

<style lang="scss" scoped>
.access_toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.access_body { min-width: 0; }

.current_ip_row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 13px;

  code { margin-left: 6px; color: var(--el-text-color-primary); }
}

.rule_label { font-size: 14px; font-weight: 600; }
.rule_list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.rule_item { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.legacy_hint { color: var(--el-color-warning); font-size: 12px; }
.empty_rules { margin-bottom: 12px; color: var(--el-text-color-secondary); font-size: 13px; }
.rule_input_row { display: flex; gap: 10px; max-width: 760px; }
.rule_help { margin: 8px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
.rule_error { margin: 7px 0 0; color: var(--el-color-danger); font-size: 12px; }

.access_footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-color-success);
  font-size: 12px;

  .is_dirty { color: var(--el-text-color-secondary); }
}

.access_footer_actions { margin-left: auto; }

@media (max-width: 768px) {
  .access_toolbar,
  .access_footer,
  .current_ip_row {
    align-items: flex-start;
    flex-direction: column;
  }
  .rule_input_row { flex-direction: column; }
  .access_footer > div { width: 100%; display: flex; }
  .access_footer .el-button { flex: 1; }
}
</style>
