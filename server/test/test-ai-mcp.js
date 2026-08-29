import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as z from 'zod/v4'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'

const originalCwd = process.cwd()
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easynode-mcp-test-'))
fs.mkdirSync(path.join(tmpDir, 'app/db'), { recursive: true })
process.chdir(tmpDir)
global.logger = { warn() {}, info() {}, error() {} }

const { createMcpClientManager, discoverMcpTools } = await import('../app/ai/mcp/client.js')
const {
  createMcpConnectionDraft,
  snapshotDiscoveredTools
} = await import('../app/ai/mcp/store.js')
const { AgentMcpServerDB, KeyDB } = await import('../app/utils/db-class.js')
const mcpServerDB = new AgentMcpServerDB().getInstance()
const keyDB = new KeyDB().getInstance()
await Promise.all([mcpServerDB.findOneAsync({}), keyDB.findOneAsync({})])
await keyDB.insertAsync({ commonKey: 'test-common-key' })
const {
  addAgentMcpServer,
  editAgentMcpServer
} = await import('../app/controller/agent-mcp.js')

function responseRecorder() {
  return {
    result: null,
    success(payload) { this.result = { success: true, ...payload } },
    fail(payload) { this.result = { success: false, ...payload } }
  }
}

function createServer() {
  const server = new McpServer({ name: 'easynode-test', version: '1.0.0' })
  server.registerTool('greet', {
    title: '问候',
    description: '返回一段问候语',
    inputSchema: { name: z.string() },
    annotations: { readOnlyHint: true }
  }, async ({ name }) => ({ content: [{ type: 'text', text: `Hello, ${ name }!` }] }))
  return server
}

let lastAuthorization = ''
let toolListCalls = 0
const app = createMcpExpressApp()
app.post('/mcp', async (req, res) => {
  lastAuthorization = req.get('authorization') || ''
  if (req.body?.method === 'tools/list') toolListCalls += 1
  const server = createServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
  res.on('close', () => {
    transport.close().catch(() => {})
    server.close().catch(() => {})
  })
})
app.get('/mcp', (_req, res) => res.status(405).end())
app.delete('/mcp', (_req, res) => res.status(405).end())

const running = await new Promise((resolve, reject) => {
  const server = app.listen(0, '127.0.0.1', (error) => {
    if (error) return reject(error)
    resolve({ server, address: server.address() })
  })
})
const httpServer = running.server

try {
  const address = running.address
  const record = {
    _id: 'test-server',
    name: '测试 MCP',
    key: 'test',
    url: `http://127.0.0.1:${ address.port }/mcp`,
    connectTimeoutSeconds: 3,
    callTimeoutSeconds: 3
  }

  const discovered = await discoverMcpTools(record)
  assert.equal(discovered.length, 1)
  assert.equal(discovered[0].name, 'greet')

  const draft = await createMcpConnectionDraft({
    url: record.url,
    headers: { Authorization: 'Bearer test-token' },
    connectTimeoutSeconds: 3,
    callTimeoutSeconds: 3
  })
  const tested = await discoverMcpTools(draft)
  assert.equal(tested.length, 1)
  assert.equal(lastAuthorization, 'Bearer test-token')

  const cappedTimeouts = await createMcpConnectionDraft({
    url: record.url,
    connectTimeoutSeconds: 300,
    callTimeoutSeconds: 300
  })
  assert.equal(cappedTimeouts.connectTimeoutSeconds, 60)
  assert.equal(cappedTimeouts.callTimeoutSeconds, 60)

  const [snapshot] = snapshotDiscoveredTools(record, discovered)
  assert.equal(snapshot.enabled, true)
  assert.equal('effect' in snapshot, false)
  assert.equal('approvalPolicy' in snapshot, false)
  assert.match(snapshot.exposedName, /^mcp_test_greet_/)

  const rediscovered = snapshotDiscoveredTools({
    ...record,
    tools: [{ ...snapshot, enabled: false }]
  }, [
    { ...discovered[0], description: '更新后的说明' },
    { name: 'new_tool', description: '新增工具', inputSchema: { type: 'object' } }
  ])
  assert.equal(rediscovered.length, 2)
  assert.equal(rediscovered[0].enabled, false)
  assert.equal(rediscovered[1].enabled, true)
  assert.equal('effect' in rediscovered[0], false)
  assert.equal('approvalPolicy' in rediscovered[0], false)

  const manager = createMcpClientManager()
  const listCallsBeforeRuntime = toolListCalls
  const result = await manager.callTool(record, snapshot, { name: 'EasyNode' })
  assert.equal(result.content[0].text, 'Hello, EasyNode!')
  await manager.callTool(record, snapshot, { name: 'Again' })
  assert.equal(toolListCalls, listCallsBeforeRuntime + 1)
  await manager.close()

  const changedManager = createMcpClientManager()
  await assert.rejects(
    changedManager.callTool(record, { ...snapshot, hash: 'changed' }, { name: 'EasyNode' }),
    /工具定义已变化/
  )
  await changedManager.close()

  const createResponse = responseRecorder()
  await addAgentMcpServer({
    res: createResponse,
    request: { body: {
      name: '自动发现测试',
      key: 'auto-discovery',
      url: record.url,
      enabled: true,
      headers: { Authorization: 'Bearer saved-token' },
      connectTimeoutSeconds: 3,
      callTimeoutSeconds: 3
    } }
  })
  assert.equal(createResponse.result.success, true)
  assert.equal(
    createResponse.result.data.tools.length,
    1,
    createResponse.result.data.lastError
  )
  assert.equal(createResponse.result.data.enabled, true)
  assert.equal(createResponse.result.data.headers.Authorization, '')
  assert.equal('hasHeaders' in createResponse.result.data, false)
  assert.equal('lastDiscovery' in createResponse.result.data, false)

  const savedServer = createResponse.result.data
  const toggleResponse = responseRecorder()
  await editAgentMcpServer({
    res: toggleResponse,
    request: {
      params: { id: savedServer._id },
      body: { tools: [{ remoteName: 'greet', enabled: false }] }
    }
  })
  assert.equal(toggleResponse.result.data.tools[0].enabled, false)

  const rediscoverResponse = responseRecorder()
  await editAgentMcpServer({
    res: rediscoverResponse,
    request: {
      params: { id: savedServer._id },
      body: { url: record.url }
    }
  })
  assert.equal(rediscoverResponse.result.data.tools[0].enabled, false)
  assert.equal(lastAuthorization, 'Bearer saved-token')

  const failedResponse = responseRecorder()
  await editAgentMcpServer({
    res: failedResponse,
    request: {
      params: { id: savedServer._id },
      body: { url: `http://127.0.0.1:${ address.port }/missing` }
    }
  })
  assert.equal(failedResponse.result.success, true)
  assert.equal(failedResponse.result.data.enabled, false)
  assert.equal(failedResponse.result.data.tools.length, 1)
  assert.match(failedResponse.result.data.lastError, /404|MCP|连接|HTTP/i)

  await mcpServerDB.insertAsync({
    name: '损坏的 MCP 配置',
    key: 'broken-schema',
    enabled: true,
    tools: [{ inputSchemaJson: '{' }]
  })
  const { loadMcpDefinitions } = await import('../app/ai/mcp/registry.js')
  assert.deepEqual(await loadMcpDefinitions(), [])

  console.log('✓ MCP 保存发现、调用缓存、定义校验与故障隔离通过')
} finally {
  await new Promise((resolve) => httpServer.close(resolve))
  process.chdir(originalCwd)
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
