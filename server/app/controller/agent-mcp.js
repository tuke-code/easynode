import {
  createMcpConnectionDraft,
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  listMcpServers,
  publicMcpServer,
  recordMcpDiscoveryError,
  syncMcpDiscovery,
  updateMcpServer
} from '../ai/mcp/store.js'
import { discoverMcpTools } from '../ai/mcp/client.js'

function fail(res, error, fallback) {
  logger.warn(`[agent-mcp] ${ fallback }: ${ error?.message || error }`)
  res.fail({ msg: error?.message || fallback })
}

async function discoverSavedServer(server, { disableOnError = false } = {}) {
  try {
    return await syncMcpDiscovery(server, await discoverMcpTools(server))
  } catch (error) {
    logger.warn(`[agent-mcp] 自动发现工具失败: ${ error?.message || error }`)
    return recordMcpDiscoveryError(server, error?.message || String(error), { disable: disableOnError })
  }
}

function changesConnection(input) {
  return ['url', 'headers', 'connectTimeoutSeconds', 'callTimeoutSeconds']
    .some((key) => Object.hasOwn(input, key))
}

export async function getAgentMcpServers({ res }) {
  try {
    res.success({ data: await listMcpServers() })
  } catch (error) {
    fail(res, error, '获取 MCP Server 列表失败')
  }
}

export async function addAgentMcpServer({ res, request }) {
  try {
    const saved = await createMcpServer(request.body || {})
    const server = await discoverSavedServer(saved, { disableOnError: true })
    res.success({ data: await publicMcpServer(server) })
  } catch (error) {
    fail(res, error, '新增 MCP Server 失败')
  }
}

export async function editAgentMcpServer({ res, request }) {
  try {
    const input = request.body || {}
    const saved = await updateMcpServer(request.params.id, input)
    const server = changesConnection(input)
      ? await discoverSavedServer(saved, { disableOnError: true })
      : saved
    res.success({ data: await publicMcpServer(server) })
  } catch (error) {
    fail(res, error, '更新 MCP Server 失败')
  }
}

export async function removeAgentMcpServer({ res, request }) {
  try {
    const removed = await deleteMcpServer(request.params.id)
    if (!removed) return res.fail({ msg: 'MCP Server 不存在' })
    res.success({ data: { success: true } })
  } catch (error) {
    fail(res, error, '删除 MCP Server 失败')
  }
}

export async function testAgentMcpConnection({ res, request }) {
  try {
    const input = request.body || {}
    const current = input.id ? await getMcpServer(input.id) : null
    if (input.id && !current) return res.fail({ msg: 'MCP Server 不存在' })
    const server = await createMcpConnectionDraft(input, current)
    const tools = await discoverMcpTools(server)
    res.success({ data: { toolCount: tools.length } })
  } catch (error) {
    fail(res, error, '测试 MCP 连接失败')
  }
}

export async function discoverAgentMcpServer({ res, request }) {
  const id = request.params.id
  let server
  try {
    server = await getMcpServer(id)
    if (!server) return res.fail({ msg: 'MCP Server 不存在' })
    const tools = await discoverMcpTools(server)
    res.success({ data: await publicMcpServer(await syncMcpDiscovery(server, tools)) })
  } catch (error) {
    if (server) await recordMcpDiscoveryError(server, error?.message || String(error)).catch(() => {})
    fail(res, error, '发现 MCP 工具失败')
  }
}
