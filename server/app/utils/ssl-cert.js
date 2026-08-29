import selfsigned from 'selfsigned'
import fs from 'node:fs'
import path from 'node:path'
import tls from 'node:tls'

const SELF_SIGNED_CERT_FILE = 'https-selfsigned-cert.pem'
const SELF_SIGNED_KEY_FILE = 'https-selfsigned-key.pem'

const writeFileAtomically = (targetPath, contents, mode) => {
  const temporaryPath = `${ targetPath }.${ process.pid }.tmp`
  fs.writeFileSync(temporaryPath, contents, { mode })
  fs.renameSync(temporaryPath, targetPath)
}

const loadPersistedCertificate = (certPath, keyPath) => {
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) return null

  try {
    const cert = fs.readFileSync(certPath, 'utf8')
    const key = fs.readFileSync(keyPath, 'utf8')
    // Besides checking PEM syntax, this verifies that the certificate and
    // private key belong to the same keypair. A partially written or manually
    // damaged pair is regenerated instead of breaking HTTPS startup forever.
    tls.createSecureContext({ cert, key })
    fs.chmodSync(keyPath, 0o600)
    return { cert, key }
  } catch (error) {
    logger.warn(`持久化自签名证书无效，将重新生成: ${ error.message }`)
    return null
  }
}

/**
 * 加载持久化的自签名证书；首次运行时生成并保存。
 * 默认保存在 app/db，Docker Compose 已持久化该目录。
 * @returns {Object} 包含 cert 和 key 的对象
 */
function generateSelfSignedCert(storageDir = path.join(process.cwd(), 'app/db')) {
  const certPath = path.join(storageDir, SELF_SIGNED_CERT_FILE)
  const keyPath = path.join(storageDir, SELF_SIGNED_KEY_FILE)

  const persisted = loadPersistedCertificate(certPath, keyPath)
  if (persisted) {
    logger.info(`已加载持久化自签名证书: ${ certPath }`)
    return persisted
  }

  const attrs = [{ name: 'commonName', value: 'localhost' }]
  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 3650, // 10年有效期
    algorithm: 'sha256',
    extensions: [
      {
        name: 'basicConstraints',
        cA: false
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true
      },
      {
        name: 'subjectAltName',
        altNames: [
          {
            type: 2, // DNS
            value: 'localhost'
          },
          {
            type: 7, // IP
            ip: '127.0.0.1'
          }
        ]
      }
    ]
  })

  fs.mkdirSync(storageDir, { recursive: true })
  writeFileAtomically(certPath, pems.cert, 0o644)
  writeFileAtomically(keyPath, pems.private, 0o600)
  logger.info(`已生成并持久化自签名证书: ${ certPath }`)
  return {
    cert: pems.cert,
    key: pems.private
  }
}

export {
  generateSelfSignedCert,
  SELF_SIGNED_CERT_FILE,
  SELF_SIGNED_KEY_FILE
}
