import 'dart:io';

enum IpAccessRuleKind { exact, cidr, legacy, invalid }

class IpAccessRule {
  const IpAccessRule({required this.value, required this.kind});

  final String value;
  final IpAccessRuleKind kind;

  factory IpAccessRule.fromJson(Map<String, dynamic> json) {
    final value = (json['value'] ?? '').toString().trim().toLowerCase();
    final kind = switch ((json['kind'] ?? '').toString()) {
      'exact' => IpAccessRuleKind.exact,
      'cidr' => IpAccessRuleKind.cidr,
      'legacy' => IpAccessRuleKind.legacy,
      _ => classifyIpAccessRule(value).kind,
    };
    return IpAccessRule(value: value, kind: kind);
  }
}

class IpAccessConfig {
  const IpAccessConfig({
    required this.ipWhiteList,
    required this.rules,
    required this.currentIp,
    required this.currentIpAllowed,
  });

  final List<String> ipWhiteList;
  final List<IpAccessRule> rules;
  final String currentIp;
  final bool currentIpAllowed;

  factory IpAccessConfig.fromJson(Map<String, dynamic> json) {
    final whitelist = normalizeIpAccessRules(
      json['ipWhiteList'] is List
          ? (json['ipWhiteList'] as List).map((value) => value.toString())
          : const <String>[],
    );
    final rawRules = json['ipWhiteListRules'];
    final rules = rawRules is List
        ? rawRules
              .whereType<Map>()
              .map(
                (rule) =>
                    IpAccessRule.fromJson(Map<String, dynamic>.from(rule)),
              )
              .where((rule) => rule.value.isNotEmpty)
              .toList(growable: false)
        : whitelist.map(classifyIpAccessRule).toList(growable: false);
    return IpAccessConfig(
      ipWhiteList: whitelist,
      rules: rules,
      currentIp: (json['currentIp'] ?? '').toString(),
      currentIpAllowed: _parseBool(json['currentIpAllowed'], fallback: true),
    );
  }
}

IpAccessRule classifyIpAccessRule(String rawValue) {
  final value = rawValue.trim().toLowerCase();
  if (_ipFamily(value) != 0) {
    return IpAccessRule(value: value, kind: IpAccessRuleKind.exact);
  }
  if (value.contains('/')) {
    final parts = value.split('/');
    if (parts.length != 2 || !RegExp(r'^\d+$').hasMatch(parts[1])) {
      return IpAccessRule(value: value, kind: IpAccessRuleKind.invalid);
    }
    final family = _ipFamily(parts[0]);
    final prefix = int.tryParse(parts[1]);
    final maxPrefix = family == 4 ? 32 : 128;
    if (family == 0 || prefix == null || prefix < 0 || prefix > maxPrefix) {
      return IpAccessRule(value: value, kind: IpAccessRuleKind.invalid);
    }
    return IpAccessRule(value: value, kind: IpAccessRuleKind.cidr);
  }
  return IpAccessRule(value: value, kind: IpAccessRuleKind.legacy);
}

List<String> normalizeIpAccessRules(Iterable<String> rules) {
  final seen = <String>{};
  return rules
      .map((rule) => rule.trim().toLowerCase())
      .where((rule) => rule.isNotEmpty && seen.add(rule))
      .toList(growable: false);
}

String suggestCidrForLegacyRule(String rawValue) {
  final value = rawValue.trim().replaceFirst(RegExp(r'\.$'), '');
  final parts = value.split('.');
  if (parts.isEmpty || parts.length > 3) return '';
  if (!parts.every(_isValidIpv4Part)) return '';
  final address = [...parts, ...List.filled(4 - parts.length, '0')].join('.');
  return '$address/${parts.length * 8}';
}

int _ipFamily(String value) {
  if (_isStrictIpv4(value)) return 4;
  if (!value.contains(':') || value.contains('%')) return 0;
  final parsed = InternetAddress.tryParse(value);
  return parsed?.type == InternetAddressType.IPv6 ? 6 : 0;
}

bool _isStrictIpv4(String value) {
  final parts = value.split('.');
  return parts.length == 4 && parts.every(_isValidIpv4Part);
}

bool _isValidIpv4Part(String part) {
  if (!RegExp(r'^\d+$').hasMatch(part)) return false;
  if (part.length > 1 && part.startsWith('0')) return false;
  final value = int.tryParse(part);
  return value != null && value >= 0 && value <= 255;
}

bool _parseBool(Object? raw, {required bool fallback}) {
  if (raw is bool) return raw;
  if (raw == 1 || raw == '1' || raw == 'true') return true;
  if (raw == 0 || raw == '0' || raw == 'false') return false;
  return fallback;
}
