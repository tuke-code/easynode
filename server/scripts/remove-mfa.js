import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Datastore from '@seald-io/nedb'

const DB_DIR = path.join(process.cwd(), 'app/db')

const exitWithError = (message) => {
  console.error(`移除 MFA 失败：${ message }`)
  process.exitCode = 1
}

const removeMfa = async ({ dbDir = DB_DIR } = {}) => {
  const keyDBPath = path.join(dbDir, 'key.db')
  if (!fs.existsSync(keyDBPath)) {
    throw new Error(`未找到登录数据库：${ keyDBPath }`)
  }

  const keyDB = new Datastore({ filename: keyDBPath, autoload: true })
  const keyData = await keyDB.findOneAsync({})
  if (!keyData?._id) {
    throw new Error('登录数据库中没有有效的配置记录')
  }

  await keyDB.updateAsync(
    { _id: keyData._id },
    { $set: { enableMFA2: false, secret: null } }
  )
}

const main = async () => {
  if (!fs.existsSync('/.dockerenv')) {
    throw new Error('此脚本仅允许在 EasyNode Docker 容器内运行')
  }

  await removeMfa()
  console.log('EasyNode 管理员账号的 MFA 已移除。')
  console.log('服务重新启动后可仅使用用户名和密码登录，请尽快重新启用 MFA。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => exitWithError(error.message))
}

export { removeMfa }
