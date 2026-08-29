import CryptoJS from 'crypto-js'
import rawCrypto from 'node:crypto'
import NodeRSA from 'node-rsa'
import { KeyDB } from './db-class.js'
const keyDB = new KeyDB().getInstance()

class InvalidCiphertextError extends Error {
  constructor() {
    super('invalid ciphertext')
    this.name = 'InvalidCiphertextError'
  }
}

// rsa非对称 私钥解密
const RSADecryptAsync = async (ciphertext) => {
  if (typeof ciphertext !== 'string' || !ciphertext) throw new InvalidCiphertextError()
  let { privateKey } = await keyDB.findOneAsync({})
  privateKey = await AESDecryptAsync(privateKey) // 先解密私钥
  const rsakey = new NodeRSA(privateKey)
  rsakey.setOptions({ encryptionScheme: 'pkcs1', environment: 'browser' }) // Must Set It When Frontend Use jsencrypt
  try {
    return rsakey.decrypt(ciphertext, 'utf8')
  } catch {
    throw new InvalidCiphertextError()
  }
}

// aes对称 加密(default commonKey)
const AESEncryptAsync = async (text, key) => {
  if (!text) return Promise.reject(new Error('text is empty'))
  let { commonKey } = await keyDB.findOneAsync({})
  let ciphertext = CryptoJS.AES.encrypt(text, key || commonKey).toString()
  return ciphertext
}

// aes对称 解密(default commonKey)
const AESDecryptAsync = async (ciphertext, key) => {
  if (!ciphertext) return Promise.reject(new Error('ciphertext is empty'))
  let { commonKey } = await keyDB.findOneAsync({})
  let bytes = CryptoJS.AES.decrypt(ciphertext, key || commonKey)
  let originalText = bytes.toString(CryptoJS.enc.Utf8)
  return originalText
}

// sha1 加密(不可逆)
const SHA1Encrypt = (clearText) => {
  return rawCrypto.createHash('sha1').update(clearText).digest('hex')
}

const SHA256Encrypt = (clearText) => {
  return rawCrypto.createHash('sha256').update(clearText).digest('hex')
}

export {
  InvalidCiphertextError,
  RSADecryptAsync,
  AESEncryptAsync,
  AESDecryptAsync,
  SHA1Encrypt,
  SHA256Encrypt
}
