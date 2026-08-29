import { isIP } from 'node:net'

const escapedPosixSingleQuote = String.fromCharCode(39, 34, 39, 34, 39)

function requireSafeString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${ label }必须是${ allowEmpty ? '' : '非空' }字符串`)
  }
  if (value.includes('\0')) {
    throw new TypeError(`${ label }不能包含空字节`)
  }
  return value
}

export function quotePosixShellArg(value) {
  const text = requireSafeString(value, 'Shell参数', { allowEmpty: true })
  return `'${ text.replace(/'/g, escapedPosixSingleQuote) }'`
}

export function buildPosixShellCommand(args, environment = {}) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new TypeError('命令参数不能为空')
  }

  const envParts = Object.entries(environment).map(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new TypeError(`无效的环境变量名: ${ key }`)
    }
    return `${ key }=${ quotePosixShellArg(value) }`
  })

  return [...envParts, ...args.map(quotePosixShellArg)].join(' ')
}

function normalizePort(value) {
  const port = value === undefined || value === null || value === '' ? 22 : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('目标主机端口必须是1到65535之间的整数')
  }
  return String(port)
}

function normalizeHost(value) {
  const host = requireSafeString(value, '目标主机地址').trim()
  if (isIP(host) === 6) {
    return `[${ host }]`
  }
  if (isIP(host) === 4) {
    return host
  }
  if (host.length > 253 || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(host)) {
    throw new TypeError('目标主机地址格式无效')
  }
  return host
}

function normalizeUsername(value) {
  const username = requireSafeString(value, '目标主机用户名').trim()
  if (username.length > 128 || !/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(username)) {
    throw new TypeError('目标主机用户名格式无效')
  }
  return username
}

function normalizeKeyFile(value) {
  const keyFile = requireSafeString(value, '临时密钥路径')
  if (!/^\/tmp\/easynode_key_[A-Za-z0-9_]+$/.test(keyFile)) {
    throw new TypeError('临时密钥路径格式无效')
  }
  return keyFile
}

function normalizeSourcePaths(sourcePaths) {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    throw new TypeError('至少需要一个源路径')
  }
  return sourcePaths.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new TypeError(`源路径[${ index }]格式无效`)
    }
    return requireSafeString(item.path, `源路径[${ index }]`)
  })
}

function normalizeExcludePatterns(patterns) {
  if (patterns === undefined || patterns === null) return []
  if (!Array.isArray(patterns)) {
    throw new TypeError('排除规则必须是数组')
  }
  return patterns.map((pattern, index) => requireSafeString(pattern, `排除规则[${ index }]`, { allowEmpty: true }))
}

export function validateRsyncCommandInput({
  sourcePaths,
  targetPath,
  targetOptions,
  transferOptions = {}
}) {
  if (!targetOptions || typeof targetOptions !== 'object') {
    throw new TypeError('目标主机配置无效')
  }
  if (!transferOptions || typeof transferOptions !== 'object' || Array.isArray(transferOptions)) {
    throw new TypeError('传输选项格式无效')
  }

  return {
    paths: normalizeSourcePaths(sourcePaths),
    destinationPath: requireSafeString(targetPath, '目标路径'),
    host: normalizeHost(targetOptions.host),
    username: normalizeUsername(targetOptions.username),
    port: normalizePort(targetOptions.port),
    excludePatterns: normalizeExcludePatterns(transferOptions.excludePatterns)
  }
}

export function buildRsyncCommand({
  sourcePaths,
  targetPath,
  targetOptions,
  transferOptions = {},
  keyFile = null
}) {
  const {
    paths,
    destinationPath,
    host,
    username,
    port,
    excludePatterns
  } = validateRsyncCommandInput({ sourcePaths, targetPath, targetOptions, transferOptions })
  const usesPassword = Boolean(targetOptions.password)
  const commandArgs = []
  const environment = {}

  if (usesPassword) {
    environment.SSHPASS = requireSafeString(targetOptions.password, '目标主机密码', { allowEmpty: true })
    commandArgs.push('sshpass', '-e')
  } else {
    keyFile = normalizeKeyFile(keyFile)
  }

  commandArgs.push(
    'rsync',
    '-avz',
    '--progress',
    '--partial',
    '--inplace',
    '--append',
    '--stats',
    '--human-readable',
    '--itemize-changes',
    '-s'
  )

  const sshArgs = [
    'ssh',
    '-p', port,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'GlobalKnownHostsFile=/dev/null'
  ]

  if (usesPassword) {
    sshArgs.push('-o', 'PreferredAuthentications=password')
  } else {
    sshArgs.push('-o', 'BatchMode=yes', '-i', keyFile)
  }
  sshArgs.push('-o', 'LogLevel=ERROR')
  commandArgs.push('-e', sshArgs.join(' '))

  if (transferOptions.delete) {
    commandArgs.push('--delete')
  }
  excludePatterns.forEach(pattern => commandArgs.push('--exclude', pattern))

  commandArgs.push('--', ...paths, `${ username }@${ host }:${ destinationPath }`)

  return {
    command: buildPosixShellCommand(commandArgs, environment),
    commandArgs,
    environmentKeys: Object.keys(environment)
  }
}
