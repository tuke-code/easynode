<template>
  <section class="settings_section mcp_settings">
    <div class="section_head">
      <div>
        <h3>外部 MCP</h3>
        <p>接入远程 Streamable HTTP MCP Server。保存后自动发现并启用工具，调用外部工具时始终需要确认。</p>
      </div>
      <el-button type="primary" @click="openCreate">添加 MCP Server</el-button>
    </div>

    <el-empty v-if="!loading && !servers.length" description="还没有配置 MCP Server" :image-size="72" />
    <el-table v-else v-loading="loading" :data="servers" border>
      <el-table-column label="Server" min-width="190">
        <template #default="{ row }">
          <div class="server_name">{{ row.name }}</div>
          <code class="server_key">{{ row.key }}</code>
        </template>
      </el-table-column>
      <el-table-column label="Endpoint" min-width="260">
        <template #default="{ row }">
          <div class="endpoint" :title="row.url">{{ row.url }}</div>
          <div v-if="row.lastError" class="last_error" :title="row.lastError">{{ row.lastError }}</div>
        </template>
      </el-table-column>
      <el-table-column label="已启用工具" width="112" align="center">
        <template #default="{ row }">{{ enabledToolCount(row) }} / {{ row.tools?.length || 0 }}</template>
      </el-table-column>
      <el-table-column label="启用" width="84" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" :loading="savingId === row._id" @change="toggleServer(row, $event)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :loading="discoveringId === row._id" @click="discover(row)">刷新</el-button>
          <el-button v-if="row.tools?.length" link @click="openTools(row)">管理</el-button>
          <el-button link @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="editorVisible" :title="editingId ? '编辑 MCP Server' : '添加 MCP Server'" width="min(640px, 92vw)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-form-item label="名称" prop="name">
          <el-input v-model.trim="form.name" placeholder="例如 GitHub" />
        </el-form-item>
        <el-form-item label="标识" prop="key">
          <el-input v-model.trim="form.key" :disabled="Boolean(editingId)" placeholder="例如 github" />
          <p class="field_tip">用于生成稳定的工具名称，创建后不可修改。</p>
        </el-form-item>
        <el-form-item label="URL" prop="url">
          <el-input v-model.trim="form.url" placeholder="https://example.com/mcp" />
        </el-form-item>
        <el-form-item label="连接超时">
          <div class="timeout_field">
            <el-input-number v-model="form.connectTimeoutSeconds" :min="1" :max="60" />
            <span>秒</span>
          </div>
        </el-form-item>
        <el-form-item label="调用超时">
          <div class="timeout_field">
            <el-input-number v-model="form.callTimeoutSeconds" :min="1" :max="60" />
            <span>秒</span>
          </div>
        </el-form-item>
        <el-form-item label="认证方式">
          <el-select v-model="form.authType" class="auth_select">
            <el-option label="无需认证" value="none" />
            <el-option label="密钥 (Authorization)" value="authorization" />
            <el-option label="OAuth 2.1（后续支持）" value="oauth2" disabled />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.authType === 'authorization'" label="密钥">
          <div class="auth_secret">
            <el-input
              v-model="form.authorization"
              :placeholder="editingId ? '留空保持原密钥' : 'Bearer &lt;token&gt;'"
            />
            <p class="field_tip">
              {{ editingId ? '留空保持原密钥；输入新值则覆盖。' : '密钥将作为 Authorization 请求头发送，并加密保存在服务端。' }}
            </p>
          </div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :loading="testingConnection" @click="testConnection">测试连接</el-button>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="editorSaving" @click="saveServer">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="toolsVisible" :title="toolsDialogTitle" width="min(760px, 96vw)" destroy-on-close>
      <p class="tools_tip">关闭不希望 AI 使用的工具。所有外部工具在调用前都会请求确认。</p>
      <el-table :data="toolDrafts" border max-height="52vh">
        <el-table-column type="expand" width="44">
          <template #default="{ row }">
            <div class="schema_preview">
              <div>参数 Schema</div>
              <pre>{{ formatSchema(row.inputSchema) }}</pre>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="工具" min-width="210">
          <template #default="{ row }">
            <div class="tool_name">{{ row.displayName || row.remoteName }}</div>
            <code>{{ row.remoteName }}</code>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="270">
          <template #default="{ row }">
            <div class="tool_description">{{ row.description || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="76" align="center">
          <template #default="{ row }"><el-switch v-model="row.enabled" /></template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="toolsVisible = false">取消</el-button>
        <el-button type="primary" :loading="toolsSaving" @click="saveTools">保存工具设置</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, getCurrentInstance, onMounted, reactive, ref, toRaw } from 'vue'
import { ElMessageBox } from 'element-plus'

const { proxy: { $api, $message } } = getCurrentInstance()

const servers = ref([])
const loading = ref(false)
const savingId = ref('')
const discoveringId = ref('')
const editorVisible = ref(false)
const editorSaving = ref(false)
const testingConnection = ref(false)
const editingId = ref('')
const formRef = ref(null)
const form = reactive(createForm())

const toolsVisible = ref(false)
const toolsSaving = ref(false)
const selectedServer = ref(null)
const toolDrafts = ref([])

const toolsDialogTitle = computed(() => `${ selectedServer.value?.name || '' } 工具管理`)

const rules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  key: [
    { required: true, message: '请输入标识', trigger: 'blur' },
    { pattern: /^[a-z0-9_-]+$/, message: '仅支持小写字母、数字、下划线和连字符', trigger: 'blur' },
  ],
  url: [
    { required: true, message: '请输入 URL', trigger: 'blur' },
    { pattern: /^https?:\/\/.+/, message: '请输入 HTTP 或 HTTPS URL', trigger: 'blur' },
  ]
}

function createForm(server = {}) {
  const authorizationHeader = Object.entries(server.headers || {})
    .find(([name]) => name.toLowerCase() === 'authorization')
  const editing = Boolean(server._id)
  return {
    name: server.name || '',
    key: server.key || '',
    url: server.url || '',
    enabled: server.enabled !== false,
    connectTimeoutSeconds: server.connectTimeoutSeconds || 10,
    callTimeoutSeconds: server.callTimeoutSeconds || 60,
    authType: editing && !authorizationHeader ? 'none' : 'authorization',
    authorization: editing ? '' : 'Bearer ',
    authorizationHeaderName: authorizationHeader?.[0] || 'Authorization'
  }
}

function resetForm(server = {}) {
  Object.assign(form, createForm(server))
}

async function loadServers() {
  loading.value = true
  try {
    const { data } = await $api.getAgentMcpServers()
    servers.value = Array.isArray(data) ? data : []
  } finally {
    loading.value = false
  }
}

function enabledToolCount(server) {
  return (server.tools || []).filter((tool) => tool.enabled !== false).length
}

function formatSchema(schema) {
  try {
    return JSON.stringify(schema || {}, null, 2)
  } catch {
    return '{}'
  }
}

function openCreate() {
  editingId.value = ''
  resetForm()
  editorVisible.value = true
}

function openEdit(server) {
  editingId.value = server._id
  resetForm(server)
  editorVisible.value = true
}

function headerPayload() {
  if (form.authType !== 'authorization') return {}
  const value = String(form.authorization || '').trim()
  if (!value && editingId.value) return undefined
  return value ? { [form.authorizationHeaderName]: value } : {}
}

function serverPayload() {
  const headers = headerPayload()
  return {
    name: form.name,
    key: form.key,
    url: form.url,
    enabled: form.enabled,
    connectTimeoutSeconds: form.connectTimeoutSeconds,
    callTimeoutSeconds: form.callTimeoutSeconds,
    ...(headers === undefined ? {} : { headers })
  }
}

async function testConnection() {
  await formRef.value?.validate()
  testingConnection.value = true
  try {
    const { data } = await $api.testAgentMcpConnection({
      ...serverPayload(),
      ...(editingId.value ? { id: editingId.value } : {})
    })
    $message.success(`连接成功，发现 ${ data.toolCount } 个工具`)
  } catch (error) {
    const message = error.response?.data?.msg || error.message || '测试 MCP 连接失败'
    $message.error(message)
  } finally {
    testingConnection.value = false
  }
}

async function saveServer() {
  await formRef.value?.validate()
  editorSaving.value = true
  try {
    const payload = serverPayload()
    const { data } = editingId.value
      ? await $api.updateAgentMcpServer(editingId.value, payload)
      : await $api.addAgentMcpServer(payload)
    editorVisible.value = false
    await loadServers()
    if (data.lastError) {
      $message.warning(`配置已保存并停用，发现工具失败：${ data.lastError }`)
    } else {
      $message.success(`保存成功，发现 ${ data.tools?.length || 0 } 个工具`)
    }
  } finally {
    editorSaving.value = false
  }
}

async function toggleServer(server, enabled) {
  savingId.value = server._id
  try {
    await $api.updateAgentMcpServer(server._id, { enabled })
    server.enabled = enabled
  } finally {
    savingId.value = ''
  }
}

async function discover(server) {
  discoveringId.value = server._id
  try {
    const { data } = await $api.discoverAgentMcpServer(server._id)
    Object.assign(server, data)
    $message.success(`重新发现完成，共 ${ data.tools?.length || 0 } 个工具`)
  } catch (error) {
    await loadServers()
    const message = error.response?.data?.msg || error.message || '发现工具失败'
    $message.error(message)
  } finally {
    discoveringId.value = ''
  }
}

function openTools(server) {
  selectedServer.value = server
  toolDrafts.value = structuredClone(toRaw(server.tools || []))
  toolsVisible.value = true
}

async function saveTools() {
  toolsSaving.value = true
  try {
    const server = selectedServer.value
    const tools = toolDrafts.value.map((tool) => ({
      remoteName: tool.remoteName,
      enabled: tool.enabled !== false
    }))
    await $api.updateAgentMcpServer(server._id, { tools })
    toolsVisible.value = false
    await loadServers()
    $message.success('工具设置已保存')
  } finally {
    toolsSaving.value = false
  }
}

async function remove(server) {
  try {
    await ElMessageBox.confirm(`删除 MCP Server「${ server.name }」及其工具？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await $api.deleteAgentMcpServer(server._id)
  await loadServers()
  $message.success('MCP Server 已删除')
}

onMounted(loadServers)
</script>

<style lang="scss" scoped>
.settings_section {
  margin-bottom: 28px;
  padding: 20px;
  background: var(--el-bg-color);
}

.section_head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
  h3 { margin: 0 0 6px; font-size: 16px; }
  p { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
}

.server_name { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.server_key, .tool_name + code { color: var(--el-text-color-secondary); font-size: 12px; }
.endpoint, .last_error { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.last_error { margin-top: 4px; color: var(--el-color-danger); font-size: 12px; }
.timeout_field { display: flex; align-items: center; gap: 8px; }
.auth_select { width: 100%; }
.auth_secret { width: 100%; }
.field_tip, .tools_tip { margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
.tools_tip { margin: 0 0 12px; }
.tool_name { font-weight: 500; }
.tool_description { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.schema_preview { padding: 4px 18px 14px; color: var(--el-text-color-secondary); font-size: 12px; }
.schema_preview pre { margin: 8px 0 0; padding: 10px; border-radius: 6px; background: var(--el-fill-color-light); overflow: auto; }

@media (max-width: 768px) {
  .settings_section { padding: 14px; overflow-x: auto; }
  .section_head { align-items: stretch; flex-direction: column; }
}
</style>
