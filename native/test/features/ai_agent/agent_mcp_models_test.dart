import 'package:easynode_native/features/ai_agent/agent_mcp_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses MCP servers, tools and public authorization metadata', () {
    final server = AgentMcpServer.fromJson({
      '_id': 'server-1',
      'name': 'AnySearch',
      'key': 'anysearch',
      'url': 'https://example.com/mcp',
      'enabled': true,
      'connectTimeoutSeconds': 300,
      'callTimeoutSeconds': 0,
      'headers': {'Authorization': ''},
      'tools': [
        {
          'remoteName': 'search',
          'exposedName': 'mcp_anysearch_search',
          'displayName': 'Search',
          'description': 'Search the web',
          'inputSchema': {
            'type': 'object',
            'properties': {
              'query': {'type': 'string'},
            },
          },
          'enabled': true,
        },
      ],
    });

    expect(server.id, 'server-1');
    expect(server.hasAuthorization, isTrue);
    expect(server.connectTimeoutSeconds, 60);
    expect(server.callTimeoutSeconds, 1);
    expect(server.enabledToolCount, 1);
    expect(server.tools.single.displayName, 'Search');
    expect(server.tools.single.toUpdateJson(), {
      'remoteName': 'search',
      'enabled': true,
    });
  });
}
