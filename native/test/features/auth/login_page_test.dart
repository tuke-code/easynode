import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:easynode_native/features/auth/auth_session.dart';
import 'package:easynode_native/features/auth/login_controller.dart';
import 'package:easynode_native/features/auth/login_page.dart';
import 'package:easynode_native/core/ui/app_color_theme.dart';
import 'package:easynode_native/core/security/server_certificate_trust.dart';
import 'package:easynode_native/core/utils/jwt_expiry.dart';
import 'package:easynode_native/l10n/app_localizations.dart';

class _CertificateLoginController extends LoginController {
  _CertificateLoginController(this.certificate)
    : super(
        apiClientFactory: (_, {String? token}) =>
            throw StateError('API client is not used by this UI test'),
      );

  final PresentedServerCertificate certificate;

  @override
  Future<LoginResult> login({
    required String serverAddress,
    required String username,
    required String password,
    required String mfa2Token,
    required bool httpRiskAccepted,
    required bool savePassword,
    LoginExpiry expiry = LoginExpiry.threeDays,
  }) async => LoginResult(certificate: certificate);
}

PresentedServerCertificate _certificate() => PresentedServerCertificate(
  origin: 'https://100.74.175.1:8092',
  fingerprint: List.filled(32, 'ab').join(),
);

void main() {
  Widget wrap(Widget child) => ProviderScope(
    child: MaterialApp(
      theme: ThemeData(extensions: const [AppColorTheme.defaultLight]),
      locale: const Locale('zh'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: child,
    ),
  );

  Future<void> pumpLoginPage(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(wrap(child));
    await tester.pumpAndSettle();
  }

  Finder byKey(Key key) => find.byKey(key, skipOffstage: false);

  testWidgets('renders all required fields with prefilled values', (
    tester,
  ) async {
    final controller = LoginController.fake();
    await pumpLoginPage(
      tester,
      LoginPage(
        controller: controller,
        initialServerAddress: 'https://example.com',
        initialUsername: 'root',
        initialPassword: 'secret',
        initialSavePassword: true,
        onLoginSuccess: (_) {},
      ),
    );

    expect(byKey(const Key('field-server')), findsOneWidget);
    expect(byKey(const Key('field-username')), findsOneWidget);
    expect(byKey(const Key('field-password')), findsOneWidget);
    expect(byKey(const Key('field-mfa')), findsOneWidget);
    expect(byKey(const Key('switch-save-password')), findsOneWidget);
    expect(byKey(const Key('btn-login')), findsOneWidget);

    expect(find.text('https://example.com'), findsWidgets);
    expect(find.text('root'), findsWidgets);
  });

  testWidgets('shows local validation error for empty username', (
    tester,
  ) async {
    final controller = LoginController.fake();
    await pumpLoginPage(
      tester,
      LoginPage(
        controller: controller,
        initialServerAddress: 'https://example.com',
        initialUsername: '',
        initialSavePassword: false,
        onLoginSuccess: (_) {},
      ),
    );

    await tester.ensureVisible(byKey(const Key('field-password')));
    await tester.enterText(byKey(const Key('field-password')), 'secret');
    await tester.tap(byKey(const Key('btn-login')));
    await tester.pumpAndSettle();

    expect(byKey(const Key('login-error')), findsOneWidget);
  });

  testWidgets('does not invoke onLoginSuccess when login fails', (
    tester,
  ) async {
    final controller = LoginController.fake();
    var called = 0;
    AuthSession? captured;
    await pumpLoginPage(
      tester,
      LoginPage(
        controller: controller,
        initialServerAddress: 'https://example.com',
        initialUsername: 'root',
        initialSavePassword: false,
        onLoginSuccess: (s) {
          called++;
          captured = s;
        },
      ),
    );

    await tester.ensureVisible(byKey(const Key('field-password')));
    await tester.enterText(byKey(const Key('field-password')), '');
    await tester.tap(byKey(const Key('btn-login')));
    await tester.pumpAndSettle();

    expect(called, 0);
    expect(captured, isNull);
    expect(byKey(const Key('login-error')), findsOneWidget);
  });

  testWidgets('exposes loginPageShouldWarnHttp helper', (tester) async {
    expect(loginPageShouldWarnHttp('http://10.0.0.1'), isTrue);
    expect(loginPageShouldWarnHttp('https://10.0.0.1'), isFalse);
  });

  testWidgets('offers cancel and permanent trust for an invalid certificate', (
    tester,
  ) async {
    final certificate = _certificate();
    final controller = _CertificateLoginController(certificate);
    await pumpLoginPage(
      tester,
      LoginPage(
        controller: controller,
        initialServerAddress: certificate.origin,
        initialUsername: 'root',
        initialSavePassword: false,
        onLoginSuccess: (_) {},
      ),
    );

    await tester.ensureVisible(byKey(const Key('field-password')));
    await tester.enterText(byKey(const Key('field-password')), 'secret');
    await tester.tap(byKey(const Key('btn-login')));
    await tester.pumpAndSettle();

    expect(find.text('无法验证服务器证书'), findsOneWidget);
    expect(find.text('取消'), findsOneWidget);
    expect(find.text('信任此证书'), findsOneWidget);
    expect(find.text('仅本次继续'), findsNothing);
    expect(find.text(certificate.displayFingerprint), findsOneWidget);
  });
}
