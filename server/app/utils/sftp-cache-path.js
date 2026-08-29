import path from 'node:path'

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/

function assertPathInside(rootPath, candidatePath, { allowRoot = false } = {}) {
  const resolvedRoot = path.resolve(rootPath)
  const resolvedCandidate = path.resolve(candidatePath)
  const relativePath = path.relative(resolvedRoot, resolvedCandidate)
  const escapesRoot = relativePath === '..' ||
    relativePath.startsWith(`..${ path.sep }`) ||
    path.isAbsolute(relativePath)

  if (escapesRoot || (!allowRoot && relativePath === '')) {
    throw new Error('缓存文件路径非法')
  }

  return resolvedCandidate
}

function resolvePathInside(rootPath, ...pathSegments) {
  const candidatePath = path.resolve(rootPath, ...pathSegments)
  return assertPathInside(rootPath, candidatePath)
}

function validateTaskId(taskId) {
  if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
    throw new Error('上传任务ID非法')
  }
  return taskId
}

function validateRemoteFileName(fileName) {
  if (
    typeof fileName !== 'string' ||
    fileName.length === 0 ||
    fileName.length > 255 ||
    fileName === '.' ||
    fileName === '..' ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    CONTROL_CHARACTER_PATTERN.test(fileName)
  ) {
    throw new Error('文件名非法')
  }
  return fileName
}

export {
  assertPathInside,
  resolvePathInside,
  validateTaskId,
  validateRemoteFileName
}
