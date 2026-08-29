import 'dart:collection';

import 'agent_models.dart';

class AgentMcpTool {
  AgentMcpTool({
    required this.remoteName,
    required this.exposedName,
    required this.displayName,
    required this.description,
    required this.inputSchema,
    required this.enabled,
  });

  final String remoteName;
  final String exposedName;
  final String displayName;
  final String description;
  final Map<String, dynamic> inputSchema;
  final bool enabled;

  factory AgentMcpTool.fromJson(Map<String, dynamic> json) => AgentMcpTool(
    remoteName: json['remoteName']?.toString() ?? '',
    exposedName: json['exposedName']?.toString() ?? '',
    displayName: json['displayName']?.toString() ?? '',
    description: json['description']?.toString() ?? '',
    inputSchema: UnmodifiableMapView(stringMap(json['inputSchema'])),
    enabled: json['enabled'] != false,
  );

  AgentMcpTool copyWith({bool? enabled}) => AgentMcpTool(
    remoteName: remoteName,
    exposedName: exposedName,
    displayName: displayName,
    description: description,
    inputSchema: inputSchema,
    enabled: enabled ?? this.enabled,
  );

  Map<String, dynamic> toUpdateJson() => {
    'remoteName': remoteName,
    'enabled': enabled,
  };
}

class AgentMcpServer {
  AgentMcpServer({
    required this.id,
    required this.name,
    required this.key,
    required this.url,
    required this.enabled,
    required this.connectTimeoutSeconds,
    required this.callTimeoutSeconds,
    required this.headers,
    required this.tools,
    required this.lastError,
  });

  final String id;
  final String name;
  final String key;
  final String url;
  final bool enabled;
  final int connectTimeoutSeconds;
  final int callTimeoutSeconds;
  final Map<String, String> headers;
  final List<AgentMcpTool> tools;
  final String lastError;

  factory AgentMcpServer.fromJson(Map<String, dynamic> json) {
    final rawHeaders = stringMap(json['headers']);
    return AgentMcpServer(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: json['name']?.toString() ?? '',
      key: json['key']?.toString() ?? '',
      url: json['url']?.toString() ?? '',
      enabled: json['enabled'] != false,
      connectTimeoutSeconds: intValue(
        json['connectTimeoutSeconds'],
        10,
      ).clamp(1, 60),
      callTimeoutSeconds: intValue(json['callTimeoutSeconds'], 60).clamp(1, 60),
      headers: UnmodifiableMapView(
        rawHeaders.map((key, value) => MapEntry(key, value.toString())),
      ),
      tools: mapList(json['tools'])
          .map(AgentMcpTool.fromJson)
          .where((tool) => tool.remoteName.isNotEmpty)
          .toList(growable: false),
      lastError: json['lastError']?.toString() ?? '',
    );
  }

  int get enabledToolCount => tools.where((tool) => tool.enabled).length;
  bool get hasAuthorization =>
      headers.keys.any((name) => name.toLowerCase() == 'authorization');

  AgentMcpServer copyWith({bool? enabled, List<AgentMcpTool>? tools}) =>
      AgentMcpServer(
        id: id,
        name: name,
        key: key,
        url: url,
        enabled: enabled ?? this.enabled,
        connectTimeoutSeconds: connectTimeoutSeconds,
        callTimeoutSeconds: callTimeoutSeconds,
        headers: headers,
        tools: tools ?? this.tools,
        lastError: lastError,
      );
}
