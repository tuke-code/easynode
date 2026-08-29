import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/ui/app_color_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../state/agent_providers.dart';
import '../ai_agent/agent_mcp_models.dart';
import '../ai_agent/agent_ui_tokens.dart';

class AgentMcpSettings extends ConsumerStatefulWidget {
  const AgentMcpSettings({super.key});

  @override
  ConsumerState<AgentMcpSettings> createState() => _AgentMcpSettingsState();
}

class _AgentMcpSettingsState extends ConsumerState<AgentMcpSettings> {
  final Set<String> _busy = {};

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final servers = ref.watch(agentMcpServersProvider);
    return RefreshIndicator(
      onRefresh: ref.read(agentMcpServersProvider.notifier).refresh,
      child: ListView(
        key: const PageStorageKey('agent-mcp-settings'),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          _McpIntro(onAdd: () => _openEditor()),
          const SizedBox(height: 14),
          ...servers.when(
            loading: () => const [
              Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
            error: (error, _) => [
              _McpError(
                error: error.toString(),
                onRetry: ref.read(agentMcpServersProvider.notifier).refresh,
              ),
            ],
            data: (items) => items.isEmpty
                ? [_McpEmpty(text: l.tr('agent.settings.mcp.empty'))]
                : items
                      .map(
                        (server) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _McpServerCard(
                            server: server,
                            busy: _busy.contains(server.id),
                            onEnabled: (enabled) =>
                                _toggleServer(server, enabled),
                            onDiscover: () => _discover(server),
                            onTools: server.tools.isEmpty
                                ? null
                                : () => _openTools(server),
                            onEdit: () => _openEditor(server),
                            onDelete: () => _delete(server),
                          ),
                        ),
                      )
                      .toList(growable: false),
          ),
        ],
      ),
    );
  }

  Future<void> _openEditor([AgentMcpServer? server]) async {
    final result = await showModalBottomSheet<AgentMcpServer>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _McpServerEditor(server: server),
    );
    if (!mounted || result == null) return;
    final l = AppLocalizations.of(context);
    _show(
      result.lastError.isEmpty
          ? l.trf('agent.settings.mcp.saved', [result.tools.length])
          : l.trf('agent.settings.mcp.savedWithError', [result.lastError]),
      warning: result.lastError.isNotEmpty,
    );
  }

  Future<void> _openTools(AgentMcpServer server) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _McpToolsSheet(server: server),
    );
  }

  Future<void> _toggleServer(AgentMcpServer server, bool enabled) =>
      _withBusy(server.id, () async {
        await ref.read(agentMcpServersProvider.notifier).save(server.id, {
          'enabled': enabled,
        });
      });

  Future<void> _discover(AgentMcpServer server) =>
      _withBusy(server.id, () async {
        try {
          final updated = await ref
              .read(agentMcpServersProvider.notifier)
              .discover(server.id);
          if (mounted) {
            _show(
              AppLocalizations.of(
                context,
              ).trf('agent.settings.mcp.discovered', [updated.tools.length]),
            );
          }
        } catch (error) {
          await ref.read(agentMcpServersProvider.notifier).refresh();
          if (mounted) _show(error.toString(), warning: true);
        }
      });

  Future<void> _delete(AgentMcpServer server) async {
    final l = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l.tr('agent.settings.mcp.delete')),
        content: Text(l.trf('agent.settings.mcp.deleteConfirm', [server.name])),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l.tr('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l.tr('common.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _withBusy(
      server.id,
      () => ref.read(agentMcpServersProvider.notifier).remove(server.id),
    );
  }

  Future<void> _withBusy(String id, Future<void> Function() action) async {
    setState(() => _busy.add(id));
    try {
      await action();
    } catch (error) {
      if (mounted) _show(error.toString(), warning: true);
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  void _show(String message, {bool warning = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: warning ? context.colors.warning : null,
      ),
    );
  }
}

class _McpIntro extends StatelessWidget {
  const _McpIntro({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.colors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: context.colors.accentSoft,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.extension_outlined,
                  color: context.colors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l.tr('agent.settings.mcp.title'),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l.tr('agent.settings.mcp.subtitle'),
                      style: TextStyle(
                        color: context.colors.muted,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            key: const Key('agent-mcp-add'),
            onPressed: onAdd,
            icon: const Icon(Icons.add),
            label: Text(l.tr('agent.settings.mcp.add')),
          ),
        ],
      ),
    );
  }
}

class _McpServerCard extends StatelessWidget {
  const _McpServerCard({
    required this.server,
    required this.busy,
    required this.onEnabled,
    required this.onDiscover,
    required this.onTools,
    required this.onEdit,
    required this.onDelete,
  });

  final AgentMcpServer server;
  final bool busy;
  final ValueChanged<bool> onEnabled;
  final VoidCallback onDiscover;
  final VoidCallback? onTools;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: context.colors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: server.lastError.isEmpty
              ? context.colors.border
              : context.colors.dangerBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      server.name,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      server.key,
                      style: TextStyle(
                        color: context.colors.muted,
                        fontFamily: 'monospace',
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              if (busy)
                const Padding(
                  padding: EdgeInsets.only(right: 10),
                  child: SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              Switch(value: server.enabled, onChanged: busy ? null : onEnabled),
            ],
          ),
          const SizedBox(height: 10),
          SelectableText(
            server.url,
            style: TextStyle(
              color: context.colors.muted,
              fontFamily: 'monospace',
              fontSize: 12,
            ),
          ),
          if (server.lastError.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: context.colors.dangerSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                server.lastError,
                style: TextStyle(color: context.colors.danger, fontSize: 12),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.build_outlined, size: 16, color: context.colors.muted),
              const SizedBox(width: 6),
              Text(
                l.trf('agent.settings.mcp.toolCount', [
                  server.enabledToolCount,
                  server.tools.length,
                ]),
                style: TextStyle(color: context.colors.muted, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _McpCardAction(
                  onPressed: busy ? null : onDiscover,
                  icon: Icons.refresh,
                  label: l.tr('agent.settings.mcp.actionRefresh'),
                ),
              ),
              if (onTools != null)
                Expanded(
                  child: _McpCardAction(
                    onPressed: busy ? null : onTools,
                    icon: Icons.tune,
                    label: l.tr('agent.settings.mcp.actionManage'),
                  ),
                ),
              Expanded(
                child: _McpCardAction(
                  onPressed: busy ? null : onEdit,
                  icon: Icons.edit_outlined,
                  label: l.tr('agent.settings.mcp.actionEdit'),
                ),
              ),
              Expanded(
                child: _McpCardAction(
                  onPressed: busy ? null : onDelete,
                  icon: Icons.delete_outline,
                  label: l.tr('common.delete'),
                  danger: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _McpCardAction extends StatelessWidget {
  const _McpCardAction({
    required this.onPressed,
    required this.icon,
    required this.label,
    this.danger = false,
  });

  final VoidCallback? onPressed;
  final IconData icon;
  final String label;
  final bool danger;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: onPressed,
    style: TextButton.styleFrom(
      foregroundColor: danger ? context.colors.danger : null,
      minimumSize: const Size(0, 44),
      padding: const EdgeInsets.symmetric(horizontal: 2),
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
    ),
    child: FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [Icon(icon, size: 18), const SizedBox(width: 4), Text(label)],
      ),
    ),
  );
}

class _McpServerEditor extends ConsumerStatefulWidget {
  const _McpServerEditor({this.server});
  final AgentMcpServer? server;

  @override
  ConsumerState<_McpServerEditor> createState() => _McpServerEditorState();
}

class _McpServerEditorState extends ConsumerState<_McpServerEditor> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _key;
  late final TextEditingController _url;
  late final TextEditingController _connectTimeout;
  late final TextEditingController _callTimeout;
  late final TextEditingController _authorization;
  late String _authType;
  late bool _enabled;
  bool _testing = false;
  bool _saving = false;

  bool get _editing => widget.server != null;

  @override
  void initState() {
    super.initState();
    final server = widget.server;
    _name = TextEditingController(text: server?.name ?? '');
    _key = TextEditingController(text: server?.key ?? '');
    _url = TextEditingController(text: server?.url ?? '');
    _connectTimeout = TextEditingController(
      text: (server?.connectTimeoutSeconds ?? 10).toString(),
    );
    _callTimeout = TextEditingController(
      text: (server?.callTimeoutSeconds ?? 60).toString(),
    );
    _authType = server == null || server.hasAuthorization
        ? 'authorization'
        : 'none';
    _authorization = TextEditingController(
      text: server == null ? 'Bearer ' : '',
    );
    _enabled = server?.enabled ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _key.dispose();
    _url.dispose();
    _connectTimeout.dispose();
    _callTimeout.dispose();
    _authorization.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Material(
      color: context.colors.canvas,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            20,
            14,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 38,
                    height: 4,
                    decoration: BoxDecoration(
                      color: context.colors.strongBorder,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  l.tr(
                    _editing
                        ? 'agent.settings.mcp.edit'
                        : 'agent.settings.mcp.add',
                  ),
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 18),
                _EditorField(
                  label: l.tr('agent.settings.mcp.name'),
                  controller: _name,
                  validator: _required,
                ),
                _EditorField(
                  label: l.tr('agent.settings.mcp.key'),
                  controller: _key,
                  enabled: !_editing,
                  monospace: true,
                  helper: l.tr('agent.settings.mcp.keyHint'),
                  validator: (value) {
                    final text = value?.trim() ?? '';
                    if (text.isEmpty) return l.tr('agent.settings.required');
                    return RegExp(r'^[a-z0-9_-]+$').hasMatch(text)
                        ? null
                        : l.tr('agent.settings.mcp.keyInvalid');
                  },
                ),
                _EditorField(
                  label: 'URL',
                  controller: _url,
                  keyboardType: TextInputType.url,
                  monospace: true,
                  validator: (value) {
                    final uri = Uri.tryParse(value?.trim() ?? '');
                    return uri != null &&
                            (uri.scheme == 'http' || uri.scheme == 'https')
                        ? null
                        : l.tr('agent.settings.invalidUrl');
                  },
                ),
                _EditorField(
                  label: l.tr('agent.settings.mcp.connectTimeout'),
                  controller: _connectTimeout,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  suffixText: l.tr('agent.settings.mcp.seconds'),
                  validator: _timeout,
                ),
                _EditorField(
                  label: l.tr('agent.settings.mcp.callTimeout'),
                  controller: _callTimeout,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  suffixText: l.tr('agent.settings.mcp.seconds'),
                  validator: _timeout,
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: DropdownButtonFormField<String>(
                    initialValue: _authType,
                    decoration: _editorDecoration(
                      context,
                      label: l.tr('agent.settings.mcp.authType'),
                    ),
                    items: [
                      DropdownMenuItem(
                        value: 'none',
                        child: Text(l.tr('agent.settings.mcp.authNone')),
                      ),
                      DropdownMenuItem(
                        value: 'authorization',
                        child: Text(l.tr('agent.settings.mcp.authKey')),
                      ),
                      DropdownMenuItem(
                        value: 'oauth2',
                        enabled: false,
                        child: Text(l.tr('agent.settings.mcp.authOauth')),
                      ),
                    ],
                    onChanged: (value) {
                      if (value != null) setState(() => _authType = value);
                    },
                  ),
                ),
                if (_authType == 'authorization')
                  _EditorField(
                    key: const Key('agent-mcp-authorization'),
                    label: l.tr('agent.settings.mcp.secret'),
                    controller: _authorization,
                    monospace: true,
                    helper: l.tr(
                      _editing
                          ? 'agent.settings.mcp.secretEditHint'
                          : 'agent.settings.mcp.secretHint',
                    ),
                  ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l.tr('agent.settings.mcp.enabled')),
                  value: _enabled,
                  onChanged: (value) => setState(() => _enabled = value),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _testing || _saving ? null : _test,
                        icon: _testing
                            ? const SizedBox.square(
                                dimension: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.cable_outlined),
                        label: Text(l.tr('agent.settings.mcp.test')),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _saving || _testing ? null : _save,
                        icon: _saving
                            ? SizedBox.square(
                                dimension: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: context.colors.fontOnPrimary,
                                ),
                              )
                            : const Icon(Icons.save_outlined),
                        label: Text(l.tr('common.save')),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String? _required(String? value) => value?.trim().isNotEmpty == true
      ? null
      : AppLocalizations.of(context).tr('agent.settings.required');

  String? _timeout(String? value) {
    final seconds = int.tryParse(value ?? '');
    return seconds != null && seconds >= 1 && seconds <= 60
        ? null
        : AppLocalizations.of(context).tr('agent.settings.mcp.timeoutInvalid');
  }

  Map<String, dynamic> _payload() {
    final secret = _authorization.text.trim();
    final headers = switch (_authType) {
      'none' => <String, String>{},
      'authorization' when secret.isNotEmpty => {'Authorization': secret},
      _ => null,
    };
    return {
      'name': _name.text.trim(),
      'key': _key.text.trim(),
      'url': _url.text.trim(),
      'enabled': _enabled,
      'connectTimeoutSeconds': int.parse(_connectTimeout.text),
      'callTimeoutSeconds': int.parse(_callTimeout.text),
      'headers': ?headers,
    };
  }

  Future<void> _test() async {
    if (_formKey.currentState?.validate() != true) return;
    setState(() => _testing = true);
    try {
      final count = await ref
          .read(agentMcpServersProvider.notifier)
          .testConnection({
            ..._payload(),
            if (_editing) 'id': widget.server!.id,
          });
      if (mounted) {
        _show(
          AppLocalizations.of(
            context,
          ).trf('agent.settings.mcp.testSuccess', [count]),
        );
      }
    } catch (error) {
      if (mounted) _show(error.toString(), warning: true);
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  Future<void> _save() async {
    if (_formKey.currentState?.validate() != true) return;
    setState(() => _saving = true);
    try {
      final notifier = ref.read(agentMcpServersProvider.notifier);
      final server = _editing
          ? await notifier.save(widget.server!.id, _payload())
          : await notifier.create(_payload());
      if (mounted) Navigator.pop(context, server);
    } catch (error) {
      if (mounted) _show(error.toString(), warning: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _show(String message, {bool warning = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: warning ? context.colors.warning : null,
      ),
    );
  }
}

class _McpToolsSheet extends ConsumerStatefulWidget {
  const _McpToolsSheet({required this.server});
  final AgentMcpServer server;

  @override
  ConsumerState<_McpToolsSheet> createState() => _McpToolsSheetState();
}

class _McpToolsSheetState extends ConsumerState<_McpToolsSheet> {
  late final List<AgentMcpTool> _tools = List.of(widget.server.tools);
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Material(
      color: context.colors.canvas,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.82,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 12, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l.trf('agent.settings.mcp.toolsTitle', [
                              widget.server.name,
                            ]),
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            l.tr('agent.settings.mcp.toolsHint'),
                            style: TextStyle(color: context.colors.muted),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: l.tr('common.close'),
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  itemCount: _tools.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final tool = _tools[index];
                    return Container(
                      decoration: BoxDecoration(
                        color: context.colors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: context.colors.border),
                      ),
                      child: ExpansionTile(
                        title: Text(
                          tool.displayName.isEmpty
                              ? tool.remoteName
                              : tool.displayName,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(
                          tool.description.isEmpty
                              ? tool.remoteName
                              : tool.description,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Switch(
                          value: tool.enabled,
                          onChanged: (enabled) => setState(
                            () =>
                                _tools[index] = tool.copyWith(enabled: enabled),
                          ),
                        ),
                        childrenPadding: const EdgeInsets.fromLTRB(
                          16,
                          0,
                          16,
                          14,
                        ),
                        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            tool.remoteName,
                            style: TextStyle(
                              color: context.colors.muted,
                              fontFamily: 'monospace',
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: context.colors.chip,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: SelectableText(
                              const JsonEncoder.withIndent(
                                '  ',
                              ).convert(tool.inputSchema),
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: context.colors.fontOnPrimary,
                          ),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(l.tr('agent.settings.mcp.saveTools')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(agentMcpServersProvider.notifier).save(widget.server.id, {
        'tools': _tools.map((tool) => tool.toUpdateJson()).toList(),
      });
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _EditorField extends StatelessWidget {
  const _EditorField({
    super.key,
    required this.label,
    required this.controller,
    this.enabled = true,
    this.helper,
    this.keyboardType,
    this.inputFormatters,
    this.monospace = false,
    this.suffixText,
    this.validator,
  });

  final String label;
  final TextEditingController controller;
  final bool enabled;
  final String? helper;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final bool monospace;
  final String? suffixText;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextFormField(
      controller: controller,
      enabled: enabled,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      validator: validator,
      style: monospace ? const TextStyle(fontFamily: 'monospace') : null,
      decoration: _editorDecoration(
        context,
        label: label,
        helper: helper,
        suffixText: suffixText,
      ),
    ),
  );
}

InputDecoration _editorDecoration(
  BuildContext context, {
  required String label,
  String? helper,
  String? suffixText,
}) => InputDecoration(
  labelText: label,
  helperText: helper,
  suffixText: suffixText,
  helperMaxLines: 2,
  filled: true,
  fillColor: context.colors.card,
  border: OutlineInputBorder(
    borderRadius: BorderRadius.circular(AgentUiTokens.radiusSmall),
  ),
);

class _McpEmpty extends StatelessWidget {
  const _McpEmpty({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(28),
    decoration: BoxDecoration(
      color: context.colors.card,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: context.colors.border),
    ),
    child: Column(
      children: [
        Icon(
          Icons.extension_off_outlined,
          color: context.colors.muted,
          size: 32,
        ),
        const SizedBox(height: 10),
        Text(text, style: TextStyle(color: context.colors.muted)),
      ],
    ),
  );
}

class _McpError extends StatelessWidget {
  const _McpError({required this.error, required this.onRetry});
  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: context.colors.dangerSoft,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: context.colors.dangerBorder),
    ),
    child: Column(
      children: [
        Text(error, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: Text(AppLocalizations.of(context).tr('common.retry')),
        ),
      ],
    ),
  );
}
