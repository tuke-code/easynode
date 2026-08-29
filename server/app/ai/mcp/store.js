import { createHash } from 'node:crypto'
import { AgentMcpServerDB } from '../../utils/db-class.js'
import { AESEncryptAsync, AESDecryptAsync } from '../../utils/encrypt.js'

const db = new AgentMcpServerDB().getInstance()
const BLOCKED_HEADERS = new Set([
  'host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding',
  'upgrade', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer'
])

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function validateUrl(value) {
  let url
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error('MCP URL 无效')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MCP URL 仅支持 HTTP 或 HTTPS')
  if (url.username || url.password) throw new Error('MCP URL 不能包含用户名或密码')
  return url.toString()
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {}
  const normalized = {}
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = String(rawName || '').trim()
    const value = String(rawValue ?? '').trim()
    if (!name || !value) continue
    const lower = name.toLowerCase()
    if (BLOCKED_HEADERS.has(lower) || lower.startsWith('proxy-')) {
      throw new Error(`不允许设置请求头 ${ name }`)
    }
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error(`请求头名称无效：${ name }`)
    if (/\r|\n/.test(value)) throw new Error(`请求头值无效：${ name }`)
    normalized[name] = value
  }
  return normalized
}

async function encryptHeaders(headers) {
  return AESEncryptAsync(JSON.stringify(normalizeHeaders(headers)))
}

async function resolveInputHeaders(headers, current) {
  if (headers === undefined) return current ? decryptServerHeaders(current) : {}
  return normalizeHeaders(headers)
}

export async function decryptServerHeaders(server) {
  if (!server?.encryptedHeaders) return {}
  const clear = await AESDecryptAsync(server.encryptedHeaders)
  return normalizeHeaders(JSON.parse(clear || '{}'))
}

export async function publicMcpServer(server) {
  const copy = { ...server }
  delete copy.encryptedHeaders
  const headers = await decryptServerHeaders(server)
  return {
    ...copy,
    headers: Object.fromEntries(Object.keys(headers).map((name) => [name, '']))
  }
}

export function toolHash(tool) {
  return createHash('sha256').update(stableStringify({
    name: tool.name,
    description: tool.description || '',
    inputSchema: tool.inputSchema || { type: 'object' }
  })).digest('hex')
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${ value.map(stableStringify).join(',') }]`
  if (value && typeof value === 'object') {
    return `{${ Object.keys(value).sort().map((key) => (
      `${ JSON.stringify(key) }:${ stableStringify(value[key]) }`
    )).join(',') }}`
  }
  return JSON.stringify(value)
}

function exposedName(serverKey, remoteName) {
  const prefix = `mcp_${ normalizeKey(serverKey) || 'server' }_`
  const clean = String(remoteName || 'tool').replace(/[^a-zA-Z0-9_-]+/g, '_')
  const suffix = createHash('sha1').update(String(remoteName || '')).digest('hex').slice(0, 8)
  const maxBase = Math.max(1, 64 - prefix.length - suffix.length - 1)
  return `${ prefix }${ clean.slice(0, maxBase) }_${ suffix }`
}

export function snapshotDiscoveredTools(server, tools) {
  const previous = new Map((server.tools || []).map((tool) => [tool.remoteName, tool]))
  return (tools || []).map((tool) => {
    const previousTool = previous.get(tool.name)
    return {
      remoteName: tool.name,
      exposedName: previousTool?.exposedName || exposedName(server.key, tool.name),
      displayName: tool.annotations?.title || tool.title || tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      hash: toolHash(tool),
      enabled: previousTool?.enabled !== false
    }
  })
}

function normalizeTimeout(value, fallback) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return fallback
  return Math.min(60, Math.max(1, Math.round(seconds)))
}

function hydrateServer(server) {
  if (!server) return server
  return {
    ...server,
    tools: (server.tools || []).map(({ inputSchemaJson, ...tool }) => ({
      ...tool,
      inputSchema: JSON.parse(inputSchemaJson)
    }))
  }
}

function serializeTools(tools) {
  return tools.map(({ inputSchema, ...tool }) => ({
    ...tool,
    inputSchemaJson: JSON.stringify(inputSchema)
  }))
}

export async function listMcpServers({ enabledOnly = false, publicView = true } = {}) {
  const query = enabledOnly ? { enabled: true } : {}
  const servers = (await db.findAsync(query).sort({ createdAt: 1 })).map(hydrateServer)
  return publicView ? Promise.all(servers.map(publicMcpServer)) : servers
}

export async function getMcpServer(id) {
  return hydrateServer(await db.findOneAsync({ _id: id }))
}

export async function createMcpConnectionDraft(input, current = null) {
  const headers = await resolveInputHeaders(input.headers, current)
  return {
    url: validateUrl(input.url ?? current?.url),
    requestHeaders: normalizeHeaders(headers),
    connectTimeoutSeconds: normalizeTimeout(
      input.connectTimeoutSeconds,
      current?.connectTimeoutSeconds || 10
    ),
    callTimeoutSeconds: normalizeTimeout(
      input.callTimeoutSeconds,
      current?.callTimeoutSeconds || 60
    )
  }
}

export async function createMcpServer(input) {
  const name = String(input.name || '').trim()
  const key = normalizeKey(input.key || name)
  if (!name) throw new Error('请输入 MCP Server 名称')
  if (!key) throw new Error('MCP Server 标识无效')
  if (await db.findOneAsync({ key })) throw new Error('MCP Server 标识已存在')
  const now = Date.now()
  const record = {
    name,
    key,
    url: validateUrl(input.url),
    enabled: input.enabled !== false,
    encryptedHeaders: await encryptHeaders(input.headers || {}),
    connectTimeoutSeconds: normalizeTimeout(input.connectTimeoutSeconds, 10),
    callTimeoutSeconds: normalizeTimeout(input.callTimeoutSeconds, 60),
    tools: [],
    lastError: '',
    createdAt: now,
    updatedAt: now
  }
  return db.insertAsync(record)
}

export async function updateMcpServer(id, input) {
  const current = await getMcpServer(id)
  if (!current) throw new Error('MCP Server 不存在')
  const changes = { updatedAt: Date.now() }
  if (input.name !== undefined) {
    changes.name = String(input.name || '').trim()
    if (!changes.name) throw new Error('请输入 MCP Server 名称')
  }
  if (input.url !== undefined) changes.url = validateUrl(input.url)
  if (input.enabled !== undefined) changes.enabled = Boolean(input.enabled)
  if (input.headers !== undefined) {
    const nextHeaders = await resolveInputHeaders(input.headers, current)
    changes.encryptedHeaders = await encryptHeaders(nextHeaders)
  }
  if (input.connectTimeoutSeconds !== undefined) {
    changes.connectTimeoutSeconds = normalizeTimeout(input.connectTimeoutSeconds, current.connectTimeoutSeconds || 10)
  }
  if (input.callTimeoutSeconds !== undefined) {
    changes.callTimeoutSeconds = normalizeTimeout(input.callTimeoutSeconds, current.callTimeoutSeconds || 60)
  }
  if (Array.isArray(input.tools)) {
    const editable = new Map(input.tools.map((tool) => [tool.remoteName, tool]))
    changes.tools = (current.tools || []).map((tool) => {
      const update = editable.get(tool.remoteName)
      return {
        ...tool,
        enabled: update ? update.enabled !== false : tool.enabled !== false
      }
    })
  }
  const storedChanges = changes.tools
    ? { ...changes, tools: serializeTools(changes.tools) }
    : changes
  await db.updateAsync({ _id: id }, { $set: storedChanges })
  return { ...current, ...changes }
}

export async function syncMcpDiscovery(server, tools) {
  const changes = {
    tools: snapshotDiscoveredTools(server, tools),
    lastError: '',
    updatedAt: Date.now()
  }
  await db.updateAsync({ _id: server._id }, { $set: {
    ...changes,
    tools: serializeTools(changes.tools)
  } })
  return { ...server, ...changes }
}

export async function recordMcpDiscoveryError(server, error, { disable = false } = {}) {
  const changes = {
    lastError: String(error || '发现 MCP 工具失败'),
    updatedAt: Date.now()
  }
  if (disable) changes.enabled = false
  await db.updateAsync({ _id: server._id }, { $set: changes })
  return { ...server, ...changes }
}

export async function deleteMcpServer(id) {
  return db.removeAsync({ _id: id }, {})
}
