import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

global.logger = {
  info: () => {},
  warn: () => {},
  error: () => {}
}

const {
  generateSelfSignedCert,
  SELF_SIGNED_CERT_FILE,
  SELF_SIGNED_KEY_FILE
} = await import('../app/utils/ssl-cert.js')

const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easynode-ssl-'))

try {
  const first = generateSelfSignedCert(temporaryDir)
  const second = generateSelfSignedCert(temporaryDir)

  assert.equal(second.cert, first.cert, 'certificate should be reused')
  assert.equal(second.key, first.key, 'private key should be reused')
  assert.equal(
    new X509Certificate(first.cert).ca,
    false,
    'HTTPS leaf certificate should not be a certificate authority'
  )
  assert.equal(
    fs.readFileSync(path.join(temporaryDir, SELF_SIGNED_CERT_FILE), 'utf8'),
    first.cert
  )
  assert.equal(
    fs.readFileSync(path.join(temporaryDir, SELF_SIGNED_KEY_FILE), 'utf8'),
    first.key
  )
  assert.equal(
    fs.statSync(path.join(temporaryDir, SELF_SIGNED_KEY_FILE)).mode & 0o777,
    0o600,
    'private key should only be readable by its owner'
  )

  fs.writeFileSync(
    path.join(temporaryDir, SELF_SIGNED_KEY_FILE),
    'not a private key'
  )
  const recovered = generateSelfSignedCert(temporaryDir)
  assert.notEqual(recovered.cert, first.cert, 'invalid pair should be replaced')
  assert.notEqual(recovered.key, 'not a private key')
  assert.deepEqual(generateSelfSignedCert(temporaryDir), recovered)

  console.log('SSL certificate persistence tests passed')
} finally {
  fs.rmSync(temporaryDir, { recursive: true, force: true })
}
