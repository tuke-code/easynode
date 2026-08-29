import 'package:easynode_native/features/settings/models/ip_access_rule.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('IP access rule validation', () {
    test('accepts exact IPv4 and IPv6 addresses', () {
      expect(classifyIpAccessRule('192.168.1.10').kind, IpAccessRuleKind.exact);
      expect(classifyIpAccessRule('2001:db8::1').kind, IpAccessRuleKind.exact);
    });

    test('accepts valid IPv4 and IPv6 CIDR boundaries', () {
      expect(classifyIpAccessRule('10.0.0.0/8').kind, IpAccessRuleKind.cidr);
      expect(classifyIpAccessRule('0.0.0.0/0').kind, IpAccessRuleKind.cidr);
      expect(
        classifyIpAccessRule('2001:db8::/128').kind,
        IpAccessRuleKind.cidr,
      );
    });

    test('rejects invalid IP and CIDR rules', () {
      expect(classifyIpAccessRule('01.2.3.4').kind, IpAccessRuleKind.legacy);
      expect(
        classifyIpAccessRule('192.168.1.0/33').kind,
        IpAccessRuleKind.invalid,
      );
      expect(
        classifyIpAccessRule('2001:db8::/129').kind,
        IpAccessRuleKind.invalid,
      );
      expect(classifyIpAccessRule('10.0.0.0/x').kind, IpAccessRuleKind.invalid);
    });

    test('normalizes, trims, lowercases, and deduplicates', () {
      expect(
        normalizeIpAccessRules([
          ' 2001:DB8::1 ',
          '2001:db8::1',
          '',
          '10.0.0.0/8',
        ]),
        ['2001:db8::1', '10.0.0.0/8'],
      );
    });

    test('suggests CIDR replacements for dotted legacy prefixes', () {
      expect(suggestCidrForLegacyRule('192.168'), '192.168.0.0/16');
      expect(suggestCidrForLegacyRule('10.'), '10.0.0.0/8');
      expect(suggestCidrForLegacyRule('not-an-ip'), isEmpty);
    });
  });

  group('IP access response model', () {
    test('parses force-save result and access state', () {
      final result = IpAccessConfig.fromJson({
        'ipWhiteList': ['10.0.0.0/8'],
        'ipWhiteListRules': [
          {'value': '10.0.0.0/8', 'kind': 'cidr'},
        ],
        'ipAccessRuleVersion': 2,
        'currentIp': '203.0.113.8',
        'currentIpAllowed': false,
      });

      expect(result.ipWhiteList, ['10.0.0.0/8']);
      expect(result.currentIpAllowed, isFalse);
      expect(result.rules.single.kind, IpAccessRuleKind.cidr);
    });
  });
}
