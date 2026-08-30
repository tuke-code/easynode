import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Datastore from '@seald-io/nedb'
import { IP_ACCESS_RULE_VERSION } from '../app/utils/ip-access.js'

const DB_DIR = path.join(process.cwd(), 'app/db')

const exitWithError = (message) => {
  console.error(`移除 IP 白名单失败：${ message }`)
  process.exitCode = 1
}

const removeIpWhitelist = async ({ dbDir = DB_DIR } = {}) => {
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
    {
      $set: {
        ipWhiteList: [],
        ipAccessLegacyRules: [],
        ipAccessRuleVersion: IP_ACCESS_RULE_VERSION
      }
    }
  )
}

const main = async () => {
  if (!fs.existsSync('/.dockerenv')) {
    throw new Error('此脚本仅允许在 EasyNode Docker 容器内运行')
  }

  await removeIpWhitelist()
  console.log('EasyNode 的所有 IP 白名单和兼容访问规则已移除。')
  console.log('服务重新启动后，所有来源 IP 均可访问面板，请尽快重新配置访问规则。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => exitWithError(error.message))
}

export { removeIpWhitelist }
