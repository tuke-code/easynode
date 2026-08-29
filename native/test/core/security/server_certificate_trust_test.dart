import 'dart:convert';
import 'dart:io';

import 'package:easynode_native/core/security/server_certificate_trust.dart';
import 'package:easynode_native/core/storage/secure_storage.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:web_socket/web_socket.dart' as ws;

void main() {
  test('canonicalizes HTTP and WebSocket origins consistently', () {
    expect(
      canonicalServerOrigin('https://100.74.175.1:8092/path'),
      'https://100.74.175.1:8092',
    );
    expect(
      canonicalServerOrigin('wss://100.74.175.1:8092/docker/'),
      'https://100.74.175.1:8092',
    );
    expect(
      canonicalServerOrigin('https://example.com:443'),
      'https://example.com',
    );
  });

  test('formats a SHA-256 fingerprint for display', () {
    expect(formatCertificateFingerprint('aabbccdd'), 'AA:BB:CC:DD');
    expect(formatCertificateFingerprint('AA:BB:CC:DD'), 'AA:BB:CC:DD');
  });

  test('keeps plain HTTP requests working', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final subscription = server.listen((request) async {
      request.response
        ..statusCode = HttpStatus.ok
        ..headers.contentType = ContentType.json
        ..write(jsonEncode({'status': 200}));
      await request.response.close();
    });
    final trust = ServerCertificateTrustStore(
      SecureAppStorage(const FlutterSecureStorage()),
    );
    final dio = Dio()..httpClientAdapter = trust.createDioAdapter();

    try {
      final response = await dio.get(
        'http://${server.address.address}:${server.port}/health',
      );
      expect(response.statusCode, HttpStatus.ok);
      expect(response.data, {'status': 200});
    } finally {
      dio.close(force: true);
      await server.close(force: true);
      await subscription.cancel();
    }
  });

  test('keeps plain WebSocket connections working', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final subscription = server.transform(WebSocketTransformer()).listen((
      socket,
    ) {
      socket.listen(socket.add);
    });
    final trust = ServerCertificateTrustStore(
      SecureAppStorage(const FlutterSecureStorage()),
    );
    final client = await trust.connectWebSocket(
      Uri.parse('ws://${server.address.address}:${server.port}/socket'),
    );

    try {
      final event = client.events.first;
      client.sendText('ping');
      final received = await event;
      expect(received, isA<ws.TextDataReceived>());
      expect((received as ws.TextDataReceived).text, 'ping');
    } finally {
      await client.close();
      await server.close(force: true);
      await subscription.cancel();
    }
  });
}
