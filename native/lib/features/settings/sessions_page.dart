import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_result.dart';
import '../../core/ui/app_color_theme.dart';
import '../../core/ui/refresh_feedback.dart';
import '../../l10n/app_localizations.dart';
import '../../state/api_providers.dart';
import '../../state/auth_notifier.dart';
import '../../state/login_log_notifier.dart';
import 'models/login_session.dart';

class SessionsPage extends ConsumerStatefulWidget {
  const SessionsPage({super.key});

  @override
  ConsumerState<SessionsPage> createState() => _SessionsPageState();
}

class _SessionsPageState extends ConsumerState<SessionsPage> {
  bool _revokingAll = false;
  String? _revokingId;

  Future<void> _revokeAll() async {
    final l = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.tr('sessions.revokeAllConfirmTitle')),
        content: Text(l.tr('sessions.revokeAllConfirmBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l.tr('common.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: ctx.colors.warning,
              foregroundColor: ctx.colors.fontOnPrimary,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l.tr('sessions.revokeAll')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _revokingAll = true);
    try {
      await ref.read(settingsRepositoryProvider).revokeAllSessions();
      if (!mounted) return;
      await ref.read(authProvider.notifier).signOut();
    } on ApiFailure catch (error) {
      if (mounted) _showSnack(error.message);
    } finally {
      if (mounted) setState(() => _revokingAll = false);
    }
  }

  Future<void> _revoke(LoginSession session) async {
    final l = AppLocalizations.of(context);
    final currentDeviceId = ref.read(authProvider).session?.deviceId ?? '';
    final revokingCurrent =
        session.deviceId.isNotEmpty && session.deviceId == currentDeviceId;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.tr('sessions.revokeConfirmTitle')),
        content: Text(l.tr('sessions.revokeConfirmBody')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l.tr('common.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: ctx.colors.danger,
              foregroundColor: ctx.colors.fontOnPrimary,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l.tr('sessions.revoke')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _revokingId = session.id);
    try {
      await ref.read(settingsRepositoryProvider).revokeSession(session.id);
      if (!mounted) return;
      if (revokingCurrent) {
        await ref.read(authProvider.notifier).signOut();
        return;
      }
      _showSnack(l.tr('sessions.revokeDone'));
      await ref.read(loginLogProvider.notifier).refresh();
    } on ApiFailure catch (error) {
      if (mounted) _showSnack(error.message);
    } finally {
      if (mounted) setState(() => _revokingId = null);
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  String _formatTimestamp(int milliseconds) {
    if (milliseconds <= 0) return '-';
    final date = DateTime.fromMillisecondsSinceEpoch(milliseconds).toLocal();
    String two(int value) => value.toString().padLeft(2, '0');
    return '${date.year}-${two(date.month)}-${two(date.day)} '
        '${two(date.hour)}:${two(date.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final logAsync = ref.watch(loginLogProvider);
    return Scaffold(
      backgroundColor: context.colors.canvas,
      appBar: AppBar(
        backgroundColor: context.colors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text(l.tr('settings.sessions.title')),
        actions: [
          TextButton.icon(
            onPressed: _revokingAll || logAsync.isLoading ? null : _revokeAll,
            icon: _revokingAll
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.logout_rounded),
            label: Text(l.tr('sessions.revokeAll')),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => runRefreshWithFeedback(
          context,
          () => ref.read(loginLogProvider.notifier).refresh(throwOnError: true),
        ),
        child: logAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorBody(
            message: l.trf('sessions.loadFailed', [error.toString()]),
            onRetry: () => ref.read(loginLogProvider.notifier).refresh(),
          ),
          data: _buildBody,
        ),
      ),
    );
  }

  Widget _buildBody(LoginLogData data) {
    final l = AppLocalizations.of(context);
    final currentDeviceId = ref.watch(authProvider).session?.deviceId ?? '';
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _SectionHeader(
          label: l.tr('sessions.loginRecordsTitle'),
          count: data.sessions.length,
        ),
        _RetentionTip(label: l.tr('sessions.retentionTip')),
        const SizedBox(height: 10),
        if (data.sessions.isEmpty)
          _EmptyState(label: l.tr('sessions.empty'))
        else
          for (final session in data.sessions)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _SessionCard(
                session: session,
                isCurrent:
                    session.deviceId.isNotEmpty &&
                    session.deviceId == currentDeviceId,
                createLabel: _formatTimestamp(session.createAt),
                expireLabel: _formatTimestamp(session.expireAt),
                revoking: _revokingId == session.id,
                onRevoke: session.revoked ? null : () => _revoke(session),
              ),
            ),
      ],
    );
  }
}

class _RetentionTip extends StatelessWidget {
  const _RetentionTip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: context.colors.accentSoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.colors.strongBorder),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, size: 17, color: context.colors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                height: 1.4,
                color: context.colors.muted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 2, 4, 8),
      child: Text(
        '${label.toUpperCase()} · $count',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
          color: context.colors.muted,
        ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({
    required this.session,
    required this.isCurrent,
    required this.createLabel,
    required this.expireLabel,
    required this.revoking,
    required this.onRevoke,
  });

  final LoginSession session;
  final bool isCurrent;
  final String createLabel;
  final String expireLabel;
  final bool revoking;
  final VoidCallback? onRevoke;

  bool get _expired =>
      session.expireAt > 0 &&
      DateTime.now().millisecondsSinceEpoch > session.expireAt;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final status = isCurrent
        ? l.tr('sessions.current')
        : session.revoked
        ? l.tr('sessions.revoked')
        : _expired
        ? l.tr('terminal.status.disconnected')
        : l.tr('sessions.native');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isCurrent ? context.colors.accentSoft : context.colors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isCurrent ? context.colors.primary : context.colors.border,
          width: isCurrent ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                session.isNativeClient
                    ? Icons.smartphone_rounded
                    : Icons.monitor_rounded,
                size: 18,
                color: context.colors.primary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  session.ip.isEmpty ? '-' : session.ip,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.colors.text,
                  ),
                ),
              ),
              Text(
                status,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: context.colors.primary,
                ),
              ),
            ],
          ),
          if (session.location.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              session.location,
              style: TextStyle(color: context.colors.muted),
            ),
          ],
          const SizedBox(height: 10),
          Divider(height: 1, color: context.colors.border),
          const SizedBox(height: 10),
          Text(
            session.agentLabel.isEmpty ? '-' : session.agentLabel,
            style: TextStyle(fontSize: 12, color: context.colors.muted),
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  '${l.tr('sessions.createTime')}  $createLabel\n'
                  '${l.tr('sessions.expireAt')}  $expireLabel',
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.5,
                    color: context.colors.softMuted,
                  ),
                ),
              ),
              if (onRevoke != null && !_expired)
                OutlinedButton(
                  onPressed: revoking ? null : onRevoke,
                  child: revoking
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(l.tr('sessions.revoke')),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 36),
      child: Center(
        child: Text(label, style: TextStyle(color: context.colors.softMuted)),
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return ListView(
      children: [
        const SizedBox(height: 80),
        Center(
          child: Column(
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.tonal(
                onPressed: () => onRetry(),
                child: Text(l.tr('common.retry')),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
