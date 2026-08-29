import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_result.dart';
import '../../core/ui/app_color_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../state/api_access_notifier.dart';
import '../../state/api_providers.dart';
import 'models/ip_access_rule.dart';

enum _IpMismatchAction { back, addCurrentIp, forceSave }

class IpAccessPage extends ConsumerStatefulWidget {
  const IpAccessPage({super.key});

  @override
  ConsumerState<IpAccessPage> createState() => _IpAccessPageState();
}

class _IpAccessPageState extends ConsumerState<IpAccessPage> {
  final _addController = TextEditingController();
  List<String> _rules = const [];
  List<String> _savedRules = const [];
  Map<String, IpAccessRuleKind> _ruleKinds = const {};
  String _currentIp = '';
  String? _inputError;
  Object? _loadError;
  bool _loading = true;
  bool _saving = false;

  bool get _dirty => !_sameRules(_rules, _savedRules);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _addController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final result = await ref
          .read(settingsRepositoryProvider)
          .getIpAccessRules();
      if (!mounted) return;
      _applyResult(result);
      setState(() => _loadError = null);
    } catch (error) {
      if (!mounted) return;
      setState(() => _loadError = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _applyResult(IpAccessConfig result) {
    setState(() {
      _rules = List.of(result.ipWhiteList);
      _savedRules = List.of(result.ipWhiteList);
      _ruleKinds = {for (final rule in result.rules) rule.value: rule.kind};
      _currentIp = result.currentIp;
      _inputError = null;
    });
  }

  void _addRule() {
    final raw = _addController.text.trim();
    if (raw.isEmpty) return;
    final parsed = classifyIpAccessRule(raw);
    if (parsed.kind != IpAccessRuleKind.exact &&
        parsed.kind != IpAccessRuleKind.cidr) {
      setState(() {
        _inputError = AppLocalizations.of(context).tr('ipAccess.invalidRule');
      });
      return;
    }
    final value = parsed.value;
    setState(() {
      _rules = normalizeIpAccessRules([..._rules, value]);
      _ruleKinds = {..._ruleKinds, value: parsed.kind};
      _inputError = null;
      _addController.clear();
    });
  }

  void _addCurrentIp() {
    final parsed = classifyIpAccessRule(_currentIp);
    if (parsed.kind != IpAccessRuleKind.exact) return;
    setState(() {
      _rules = normalizeIpAccessRules([..._rules, parsed.value]);
      _ruleKinds = {..._ruleKinds, parsed.value: IpAccessRuleKind.exact};
    });
  }

  Future<void> _save() async {
    final l = AppLocalizations.of(context);
    if (_rules.isEmpty && _savedRules.isNotEmpty) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l.tr('ipAccess.disableConfirmTitle')),
          content: Text(l.tr('ipAccess.disableConfirmBody')),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(l.tr('common.cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(l.tr('ipAccess.disableConfirmAction')),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }

    setState(() => _saving = true);
    try {
      await _persist();
    } on ApiFailure catch (error) {
      if (!mounted) return;
      if (_isCurrentIpMismatch(error)) {
        await _handleCurrentIpMismatch(error);
      } else {
        _showSnack(error.message);
      }
    } catch (error) {
      if (mounted) _showSnack(error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _persist({bool allowCurrentIpMismatch = false}) async {
    final result = await ref
        .read(settingsRepositoryProvider)
        .saveIpAccessRules(
          List.of(_rules),
          allowCurrentIpMismatch: allowCurrentIpMismatch,
        );
    if (!mounted) return;
    _applyResult(result);
    if (!result.currentIpAllowed) {
      ref.read(apiAccessProvider.notifier).markIpAccessDenied();
    }
  }

  bool _isCurrentIpMismatch(ApiFailure failure) {
    final data = failure.data;
    return failure.statusCode == 409 &&
        data is Map &&
        data['code'] == 'CURRENT_IP_NOT_ALLOWED';
  }

  Future<void> _handleCurrentIpMismatch(ApiFailure failure) async {
    final l = AppLocalizations.of(context);
    final data = failure.data;
    final blockedIp = data is Map
        ? (data['currentIp'] ?? _currentIp).toString()
        : _currentIp;
    final action = await showDialog<_IpMismatchAction>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.tr('ipAccess.mismatchTitle')),
        content: Text(l.trf('ipAccess.mismatchBody', [blockedIp])),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(_IpMismatchAction.back),
            child: Text(l.tr('ipAccess.mismatchBack')),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: ctx.colors.danger),
            onPressed: () => Navigator.of(ctx).pop(_IpMismatchAction.forceSave),
            child: Text(l.tr('ipAccess.mismatchForce')),
          ),
          if (classifyIpAccessRule(blockedIp).kind == IpAccessRuleKind.exact)
            FilledButton(
              onPressed: () =>
                  Navigator.of(ctx).pop(_IpMismatchAction.addCurrentIp),
              child: Text(l.tr('ipAccess.mismatchAdd')),
            ),
        ],
      ),
    );
    if (!mounted || action == null || action == _IpMismatchAction.back) return;
    if (action == _IpMismatchAction.addCurrentIp) {
      final value = classifyIpAccessRule(blockedIp).value;
      setState(() {
        _rules = normalizeIpAccessRules([..._rules, value]);
        _ruleKinds = {..._ruleKinds, value: IpAccessRuleKind.exact};
      });
      await _persist();
      return;
    }
    await _persist(allowCurrentIpMismatch: true);
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: context.colors.canvas,
      appBar: AppBar(
        backgroundColor: context.colors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text(l.tr('settings.ipAccess.title')),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
          ? _ErrorBody(
              message: l.trf('sessions.loadFailed', [_loadError.toString()]),
              onRetry: _load,
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  _IpAccessCard(
                    rules: _rules,
                    ruleKinds: _ruleKinds,
                    currentIp: _currentIp,
                    controller: _addController,
                    saving: _saving,
                    dirty: _dirty,
                    inputError: _inputError,
                    onAdd: _addRule,
                    onAddCurrentIp: _addCurrentIp,
                    onRemove: (value) => setState(() {
                      _rules = _rules.where((rule) => rule != value).toList();
                    }),
                    onReset: () => setState(() {
                      _rules = List.of(_savedRules);
                      _inputError = null;
                      _addController.clear();
                    }),
                    onSave: _dirty && !_saving ? _save : null,
                  ),
                ],
              ),
            ),
    );
  }
}

class _IpAccessCard extends StatelessWidget {
  const _IpAccessCard({
    required this.rules,
    required this.ruleKinds,
    required this.currentIp,
    required this.controller,
    required this.saving,
    required this.dirty,
    required this.inputError,
    required this.onAdd,
    required this.onAddCurrentIp,
    required this.onRemove,
    required this.onReset,
    required this.onSave,
  });

  final List<String> rules;
  final Map<String, IpAccessRuleKind> ruleKinds;
  final String currentIp;
  final TextEditingController controller;
  final bool saving;
  final bool dirty;
  final String? inputError;
  final VoidCallback onAdd;
  final VoidCallback onAddCurrentIp;
  final void Function(String value) onRemove;
  final VoidCallback onReset;
  final VoidCallback? onSave;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Container(
      decoration: BoxDecoration(
        color: context.colors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.shield_outlined, color: context.colors.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    l.tr('ipAccess.hint'),
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.4,
                      color: context.colors.muted,
                    ),
                  ),
                ),
                _StatusBadge(count: rules.length),
              ],
            ),
          ),
          Divider(height: 1, color: context.colors.border),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (currentIp.isNotEmpty) ...[
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${l.tr('ipAccess.currentLabel')}\n$currentIp',
                          style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 12,
                            height: 1.5,
                            color: context.colors.text,
                          ),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: rules.contains(currentIp)
                            ? null
                            : onAddCurrentIp,
                        icon: const Icon(Icons.add_rounded, size: 17),
                        label: Text(l.tr('ipAccess.addCurrent')),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
                if (rules.isEmpty)
                  Text(
                    l.tr('ipAccess.empty'),
                    style: TextStyle(color: context.colors.softMuted),
                  )
                else
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: [
                      for (final rule in rules)
                        InputChip(
                          label: Text(rule),
                          avatar: ruleKinds[rule] == IpAccessRuleKind.legacy
                              ? Icon(
                                  Icons.warning_amber_rounded,
                                  size: 16,
                                  color: context.colors.warning,
                                )
                              : null,
                          tooltip: ruleKinds[rule] == IpAccessRuleKind.legacy
                              ? l.trf('ipAccess.legacyTip', [
                                  suggestCidrForLegacyRule(rule),
                                ])
                              : null,
                          onDeleted: () => onRemove(rule),
                        ),
                    ],
                  ),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  onSubmitted: (_) => onAdd(),
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: InputDecoration(
                    hintText: l.tr('ipAccess.addHint'),
                    errorText: inputError,
                    suffixIcon: IconButton(
                      onPressed: onAdd,
                      icon: const Icon(Icons.add_circle_outline_rounded),
                    ),
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  l.tr('ipAccess.ruleHelp'),
                  style: TextStyle(fontSize: 11, color: context.colors.muted),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: context.colors.border),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    dirty ? l.tr('ipAccess.unsaved') : l.tr('ipAccess.saved'),
                    style: TextStyle(
                      fontSize: 11,
                      color: dirty
                          ? context.colors.warning
                          : context.colors.success,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: dirty && !saving ? onReset : null,
                  child: Text(l.tr('ipAccess.reset')),
                ),
                FilledButton.icon(
                  onPressed: onSave,
                  icon: saving
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined, size: 16),
                  label: Text(l.tr('ipAccess.save')),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Text(
      count > 0
          ? l.trf('ipAccess.restricted', [count.toString()])
          : l.tr('ipAccess.unrestricted'),
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: count > 0 ? context.colors.primary : context.colors.muted,
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
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
    );
  }
}

bool _sameRules(List<String> first, List<String> second) {
  if (first.length != second.length) return false;
  for (var index = 0; index < first.length; index++) {
    if (first[index] != second[index]) return false;
  }
  return true;
}
