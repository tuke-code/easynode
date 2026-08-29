import { PlusPolicy } from '../tools/spec.js'
import { listMcpServers } from './store.js'

function mcpDefinition(server, tool) {
  return {
    name: tool.exposedName,
    displayName: tool.displayName || tool.remoteName,
    description: tool.description || `调用 ${ server.name } 的 ${ tool.remoteName } 工具`,
    inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    source: { type: 'mcp', id: server._id, name: server.name, remoteName: tool.remoteName },
    scopes: ['ops', 'terminal'],
    requiresSelectedHosts: false,
    hostArg: null,
    plusPolicy: PlusPolicy.FREE,
    approvalPolicy: 'always',
    sensitive: false,
    execute: async (ctx, input) => {
      try {
        const data = await ctx.mcpClients.callTool(server, tool, input)
        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: error?.message || String(error) }
      }
    }
  }
}

export async function loadMcpDefinitions() {
  try {
    const servers = await listMcpServers({ enabledOnly: true, publicView: false })
    return servers.flatMap((server) => (server.tools || [])
      .filter((tool) => tool.enabled !== false)
      .map((tool) => mcpDefinition(server, tool)))
  } catch (error) {
    logger.warn(`[ai-mcp] 加载工具定义失败，已停用本轮外部工具: ${ error?.message || error }`)
    return []
  }
}
