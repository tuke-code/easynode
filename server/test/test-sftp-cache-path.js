import assert from 'node:assert/strict'
import path from 'node:path'
import {
  assertPathInside,
  resolvePathInside,
  validateRemoteFileName,
  validateTaskId
} from '../app/utils/sftp-cache-path.js'

const cacheRoot = path.resolve('/tmp/easynode-sftp-cache-test')

assert.equal(validateTaskId('1720000000000-abc_123'), '1720000000000-abc_123')
for (const taskId of ['', '../task', '../../../../utils/audit', 'task/name', 'task.name', 'a'.repeat(129)]) {
  assert.throws(() => validateTaskId(taskId), /上传任务ID非法/)
}

assert.equal(validateRemoteFileName('report 2026.tar.gz'), 'report 2026.tar.gz')
for (const fileName of ['', '.', '..', '../audit.js', 'folder/file.txt', 'folder\\file.txt', 'bad\nname']) {
  assert.throws(() => validateRemoteFileName(fileName), /文件名非法/)
}

const safePath = resolvePathInside(cacheRoot, 'task-id', 'report.txt')
assert.equal(safePath, path.join(cacheRoot, 'task-id', 'report.txt'))
assert.equal(assertPathInside(cacheRoot, safePath), safePath)

for (const pathSegments of [
  ['../outside.txt'],
  ['temp_../../../../utils/audit.js'],
  ['/etc/passwd']
]) {
  assert.throws(() => resolvePathInside(cacheRoot, ...pathSegments), /缓存文件路径非法/)
}

assert.throws(
  () => assertPathInside(cacheRoot, `${ cacheRoot }-other/file.txt`),
  /缓存文件路径非法/
)
assert.throws(() => assertPathInside(cacheRoot, cacheRoot), /缓存文件路径非法/)

console.log('SFTP 缓存路径安全测试通过')
