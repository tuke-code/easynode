import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { decryptServerHeaders, toolHash } from './store.js'

function timeoutError(error, action) {
  if (error?.name === 'AbortError' || /timeout/i.test(error?.message || '')) {
    return new Error(`${ action }超时`)
  }
  return error
}

async function createConnectedClient(server, signal) {
  const headers = server.requestHeaders || await decryptServerHeaders(server)
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers, redirect: 'manual' },
    reconnectionOptions: {
      maxReconnectionDelay: 1000,
      initialReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0
    }
  })
  const client = new Client({ name: 'easynode', version: '1.0.0' }, { capabilities: {} })
  try {
    await client.connect(transport, {
      signal,
      timeout: (server.connectTimeoutSeconds || 10) * 1000
    })
    return client
  } catch (error) {
    await transport.close().catch(() => {})
    throw timeoutError(error, '连接 MCP Server')
  }
}

export async function discoverMcpTools(server, signal) {
  const totalTimeout = ((server.connectTimeoutSeconds || 10) + (server.callTimeoutSeconds || 60)) * 1000
  const timeoutSignal = AbortSignal.timeout(totalTimeout)
  const discoverySignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const client = await createConnectedClient(server, discoverySignal)
  try {
    return await listAllTools(client, server, discoverySignal)
  } catch (error) {
    throw timeoutError(error, '发现 MCP 工具')
  } finally {
    await client.close().catch(() => {})
  }
}

async function listAllTools(client, server, signal) {
  const tools = []
  let cursor
  do {
    const result = await client.listTools(cursor ? { cursor } : undefined, {
      signal,
      timeout: (server.callTimeoutSeconds || 60) * 1000
    })
    tools.push(...result.tools)
    cursor = result.nextCursor
  } while (cursor)
  return tools
}

export function createMcpClientManager(signal) {
  const clients = new Map()
  const toolHashes = new Map()

  async function getClient(server) {
    if (!clients.has(server._id)) {
      clients.set(server._id, createConnectedClient(server, signal).catch((error) => {
        clients.delete(server._id)
        throw error
      }))
    }
    return clients.get(server._id)
  }

  async function getToolHashes(server, client) {
    if (!toolHashes.has(server._id)) {
      toolHashes.set(server._id, listAllTools(client, server, signal).then((tools) => (
        new Map(tools.map((tool) => [tool.name, toolHash(tool)]))
      )).catch((error) => {
        toolHashes.delete(server._id)
        throw error
      }))
    }
    return toolHashes.get(server._id)
  }

  return {
    async callTool(server, tool, input) {
      const client = await getClient(server)
      const hashes = await getToolHashes(server, client)
      const currentHash = hashes.get(tool.remoteName)
      if (!currentHash) throw new Error('MCP 工具已不存在，请在设置中重新发现后再使用')
      if (currentHash !== tool.hash) {
        throw new Error('MCP 工具定义已变化，请在设置中重新发现后再使用')
      }
      try {
        const result = await client.callTool({
          name: tool.remoteName,
          arguments: input || {}
        }, undefined, {
          signal,
          timeout: (server.callTimeoutSeconds || 60) * 1000
        })
        if (result.isError) {
          const message = result.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n')
          throw new Error(message || 'MCP 工具执行失败')
        }
        return {
          content: result.content || [],
          ...(result.structuredContent ? { structuredContent: result.structuredContent } : {})
        }
      } catch (error) {
        throw timeoutError(error, 'MCP 工具调用')
      }
    },

    async close() {
      const settled = await Promise.allSettled([...clients.values()])
      await Promise.allSettled(settled
        .filter((item) => item.status === 'fulfilled')
        .map((item) => item.value.close()))
      clients.clear()
      toolHashes.clear()
    }
  }
}
