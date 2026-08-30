import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import Datastore from '@seald-io/nedb'

const DB_DIR = path.join(process.cwd(), 'app/db')
const USERNAME_LENGTH = 8
const PASSWORD_LENGTH = 16

const exitWithError = (message) => {
  console.error(`重置登录凭据失败：${ message }`)
  process.exitCode = 1
}

const randomString = (length) => {
  const characters = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'
  return Array.from({ length }, () => characters[crypto.randomInt(characters.length)]).join('')
}

const confirmReset = async ({ input = process.stdin, output = process.stdout } = {}) => {
  const readline = createInterface({ input, output })
  try {
    const answer = await Promise.race([
      readline.question('此操作将重置管理员用户名和密码，并注销所有现有会话，确认继续？(y/N): '),
      new Promise(resolve => readline.once('close', () => resolve('')))
    ])
    return answer.trim() === 'y' || answer.trim() === 'Y'
  } finally {
    readline.close()
  }
}

const resetPassword = async ({ dbDir = DB_DIR } = {}) => {
  const keyDBPath = path.join(dbDir, 'key.db')
  const sessionDBPath = path.join(dbDir, 'session.db')
  if (!fs.existsSync(keyDBPath)) {
    throw new Error(`未找到登录数据库：${ keyDBPath }`)
  }
  if (!fs.statSync(keyDBPath).isFile()) {
    throw new Error(`登录数据库不是有效文件：${ keyDBPath }`)
  }

  const keyDB = new Datastore({ filename: keyDBPath })
  await keyDB.loadDatabaseAsync()
  const keyData = await keyDB.findOneAsync({})
  if (!keyData?._id) {
    throw new Error('登录数据库中没有有效的管理员账号')
  }

  let sessionDB
  if (fs.existsSync(sessionDBPath)) {
    if (!fs.statSync(sessionDBPath).isFile()) {
      throw new Error(`会话数据库不是有效文件：${ sessionDBPath }`)
    }
    sessionDB = new Datastore({ filename: sessionDBPath })
    await sessionDB.loadDatabaseAsync()
  }

  const username = randomString(USERNAME_LENGTH)
  const password = randomString(PASSWORD_LENGTH)
  const passwordHash = crypto.createHash('sha1').update(password).digest('hex')
  const jwtToken = randomString(32)

  if (sessionDB) {
    await sessionDB.updateAsync({}, { $set: { revoked: true } }, { multi: true })
  }

  await keyDB.updateAsync(
    { _id: keyData._id },
    { $set: { user: username, pwd: passwordHash, jwtToken } }
  )

  return { username, password }
}

const main = async () => {
  if (!fs.existsSync('/.dockerenv')) {
    throw new Error('此脚本仅允许在 EasyNode Docker 容器内运行')
  }
  if (!await confirmReset()) {
    console.log('操作已取消，登录凭据未修改。')
    return
  }

  const { username, password } = await resetPassword()
  console.log('EasyNode 管理员用户名和密码已重置，所有现有登录会话已失效。')
  console.log(`新用户名：${ username }`)
  console.log(`新密码：${ password }`)
  console.log('请登录后立即修改用户名和密码，并妥善保存。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => exitWithError(error.message))
}

export { confirmReset, resetPassword }
