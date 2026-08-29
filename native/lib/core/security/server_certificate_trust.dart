import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/io.dart';
import 'package:web_socket/io_web_socket.dart';
import 'package:web_socket/web_socket.dart' as ws;

import '../storage/secure_storage.dart';

class PresentedServerCertificate {
  const PresentedServerCertificate({
    required this.origin,
    required this.fingerprint,
    this.previousFingerprint,
  });

  final String origin;
  final String fingerprint;
  final String? previousFingerprint;

  String get displayFingerprint => formatCertificateFingerprint(fingerprint);
  bool get replacesTrustedCertificate => previousFingerprint != null;
}

class UntrustedServerCertificateException implements Exception {
  const UntrustedServerCertificateException(this.certificate);

  final PresentedServerCertificate certificate;

  @override
  String toString() => 'Untrusted certificate for ${certificate.origin}';
}

String canonicalServerOrigin(String address) {
  final uri = Uri.parse(address);
  final scheme = switch (uri.scheme.toLowerCase()) {
    'wss' => 'https',
    'ws' => 'http',
    final value => value,
  };
  return Uri(
    scheme: scheme,
    host: uri.host,
    port: uri.hasPort ? uri.port : null,
  ).origin;
}

String formatCertificateFingerprint(String fingerprint) {
  final normalized = fingerprint.replaceAll(':', '').toUpperCase();
  final pairs = <String>[];
  for (var index = 0; index < normalized.length; index += 2) {
    pairs.add(normalized.substring(index, index + 2));
  }
  return pairs.join(':');
}

class ServerCertificateTrustStore {
  ServerCertificateTrustStore(this._storage);

  final SecureAppStorage _storage;
  final Map<String, String> _trustedFingerprints = {};
  final Map<String, PresentedServerCertificate> _pendingCertificates = {};
  final Set<String> _loadedOrigins = {};
  HttpClient? _systemWebSocketClient;
  HttpClient? _pinnedWebSocketClient;

  Future<void> prepare(String serverAddress) async {
    final origin = canonicalServerOrigin(serverAddress);
    if (_loadedOrigins.contains(origin)) return;
    final stored = await _storage.readServerCertificateFingerprint(origin);
    if (stored != null && stored.isNotEmpty) {
      final normalized = _normalizeFingerprint(stored);
      if (_isValidFingerprint(normalized)) {
        _trustedFingerprints[origin] = normalized;
      }
    }
    _loadedOrigins.add(origin);
  }

  PresentedServerCertificate? pendingCertificateFor(String serverAddress) {
    return _pendingCertificates[canonicalServerOrigin(serverAddress)];
  }

  Future<void> trust(PresentedServerCertificate certificate) async {
    await _storage.writeServerCertificateFingerprint(
      certificate.origin,
      certificate.fingerprint,
    );
    _trustedFingerprints[certificate.origin] = certificate.fingerprint;
    _loadedOrigins.add(certificate.origin);
    _pendingCertificates.remove(certificate.origin);
  }

  IOHttpClientAdapter createDioAdapter() {
    return IOHttpClientAdapter(
      createHttpClient: () {
        final client = HttpClient();
        client.badCertificateCallback = _acceptBadCertificate;
        return client;
      },
      validateCertificate: _validateCertificate,
    );
  }

  Future<ws.WebSocket> connectWebSocket(
    Uri uri, {
    Iterable<String>? protocols,
    Map<String, String>? headers,
  }) async {
    final origin = canonicalServerOrigin(uri.toString());
    final hasPinnedCertificate = _trustedFingerprints.containsKey(origin);
    final client = _webSocketClient(pinned: hasPinnedCertificate);
    final rawSocket = await WebSocket.connect(
      uri.toString(),
      protocols: protocols,
      headers: headers,
      customClient: client,
    );
    return IOWebSocket.fromWebSocket(rawSocket);
  }

  HttpClient _webSocketClient({required bool pinned}) {
    if (pinned) {
      return _pinnedWebSocketClient ??= HttpClient(
        context: SecurityContext(withTrustedRoots: false),
      )..badCertificateCallback = _acceptBadCertificate;
    }
    return _systemWebSocketClient ??= HttpClient()
      ..badCertificateCallback = _acceptBadCertificate;
  }

  bool _acceptBadCertificate(
    X509Certificate certificate,
    String host,
    int port,
  ) {
    final presented = _presentedCertificate(certificate, host, port);
    final trusted = _trustedFingerprints[presented.origin];
    if (trusted == presented.fingerprint) {
      _pendingCertificates.remove(presented.origin);
      return true;
    }
    _pendingCertificates[presented.origin] = presented;
    return false;
  }

  bool _validateCertificate(
    X509Certificate? certificate,
    String host,
    int port,
  ) {
    // Plain HTTP responses do not have a peer certificate. The TLS trust
    // policy must not change the app's existing HTTP behaviour.
    if (certificate == null) return true;
    final presented = _presentedCertificate(certificate, host, port);
    final trusted = _trustedFingerprints[presented.origin];
    if (trusted == null) {
      _pendingCertificates.remove(presented.origin);
      return true;
    }
    if (trusted == presented.fingerprint) {
      _pendingCertificates.remove(presented.origin);
      return true;
    }
    _pendingCertificates[presented.origin] = presented;
    return false;
  }

  PresentedServerCertificate _presentedCertificate(
    X509Certificate certificate,
    String host,
    int port,
  ) {
    final origin = Uri(
      scheme: 'https',
      host: host,
      port: port == 443 ? null : port,
    ).origin;
    final fingerprint = sha256.convert(certificate.der).toString();
    return PresentedServerCertificate(
      origin: origin,
      fingerprint: fingerprint,
      previousFingerprint: _trustedFingerprints[origin],
    );
  }

  String _normalizeFingerprint(String value) =>
      value.replaceAll(':', '').trim().toLowerCase();

  bool _isValidFingerprint(String value) =>
      RegExp(r'^[0-9a-f]{64}$').hasMatch(value);
}
