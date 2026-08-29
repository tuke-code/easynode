import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  buildPosixShellCommand,
  buildRsyncCommand,
  quotePosixShellArg,
  validateRsyncCommandInput
} from '../app/utils/rsync-command.js'

function testShellQuotingPreservesArguments() {
  const expectedArgs = [
    '',
    'path with spaces',
    'single\'quote',
    '; printf INJECTED',
    '$(printf INJECTED)',
    '`printf INJECTED`',
    '--leading-option',
    'line1\nline2'
  ]
  const environmentValue = 'value\'; printf ENV_INJECTED; #\''
  const command = buildPosixShellCommand([
    process.execPath,
    '-e',
    'process.stdout.write(JSON.stringify({ args: process.argv.slice(1), environment: process.env.SHELL_QUOTE_TEST }))',
    '--',
    ...expectedArgs
  ], { SHELL_QUOTE_TEST: environmentValue })
  const result = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { args: expectedArgs, environment: environmentValue })
  assert.equal(quotePosixShellArg('a\'b'), '\'a\'"\'"\'b\'')
}

function testPasswordCommandEscapesAllUserControlledValues() {
  const result = buildRsyncCommand({
    sourcePaths: [
      { path: '/data/normal file.txt' },
      { path: '/data/\'; printf SOURCE_INJECTED; #\'' }
    ],
    targetPath: '/backup/$(printf TARGET_INJECTED)/it\'s here',
    targetOptions: {
      host: 'backup.example.com',
      port: '2222',
      username: 'deploy-user',
      password: 'p@ss\'; printf PASSWORD_INJECTED; #\''
    },
    transferOptions: {
      delete: true,
      excludePatterns: ['*.tmp', '\'; printf EXCLUDE_INJECTED; #\'']
    }
  })

  assert.equal(result.environmentKeys.length, 1)
  assert.equal(result.environmentKeys[0], 'SSHPASS')
  assert.ok(result.commandArgs.includes('-s'))
  assert.ok(result.commandArgs.includes('--delete'))
  assert.ok(result.commandArgs.includes('--'))
  assert.equal(result.commandArgs.at(-1), 'deploy-user@backup.example.com:/backup/$(printf TARGET_INJECTED)/it\'s here')
  assert.ok(!result.command.includes('PASSWORD_INJECTED; #\' rsync'))
}

function testKeyCommandAndIpv6Destination() {
  const result = buildRsyncCommand({
    sourcePaths: [{ path: '/data/source' }],
    targetPath: '/backup',
    targetOptions: {
      host: '2001:db8::1',
      port: 22,
      username: 'root',
      privateKey: 'unused-by-builder'
    },
    keyFile: '/tmp/easynode_key_123_abc'
  })

  assert.deepEqual(result.environmentKeys, [])
  assert.equal(result.commandArgs.at(-1), 'root@[2001:db8::1]:/backup')
  const remoteShellIndex = result.commandArgs.indexOf('-e')
  assert.match(result.commandArgs[remoteShellIndex + 1], /-i \/tmp\/easynode_key_123_abc/)
}

function testInvalidConnectionValuesAreRejected() {
  const base = {
    sourcePaths: [{ path: '/data/source' }],
    targetPath: '/backup',
    targetOptions: { host: 'example.com', port: 22, username: 'root', password: 'secret' }
  }

  assert.throws(() => buildRsyncCommand({
    ...base,
    targetOptions: { ...base.targetOptions, host: 'host; printf INJECTED' }
  }), /目标主机地址格式无效/)
  assert.throws(() => buildRsyncCommand({
    ...base,
    targetOptions: { ...base.targetOptions, username: '-oProxyCommand=bad' }
  }), /目标主机用户名格式无效/)
  assert.throws(() => buildRsyncCommand({
    ...base,
    targetOptions: { ...base.targetOptions, port: '22; printf INJECTED' }
  }), /目标主机端口/)
  assert.throws(() => buildRsyncCommand({
    ...base,
    sourcePaths: [{ path: '/data/source\0bad' }]
  }), /空字节/)
  assert.throws(() => buildRsyncCommand({
    ...base,
    targetOptions: { ...base.targetOptions, password: '', privateKey: 'key' },
    keyFile: '/tmp/key; printf INJECTED'
  }), /临时密钥路径格式无效/)
  assert.doesNotThrow(() => validateRsyncCommandInput(base))
}

testShellQuotingPreservesArguments()
testPasswordCommandEscapesAllUserControlledValues()
testKeyCommandAndIpv6Destination()
testInvalidConnectionValuesAreRejected()

console.log('rsync command security tests passed')
