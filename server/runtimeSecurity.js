import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function loadJwtSecret(dataDirectory) {
  const configured = String(process.env.JWT_SECRET || '').trim()
  if (configured) {
    if (configured.length < 32) throw new Error('JWT_SECRET يجب ألا يقل عن 32 محرفًا')
    return configured
  }
  const file = path.join(dataDirectory, 'jwt-secret.key')
  try {
    const existing = fs.readFileSync(file, 'utf8').trim()
    if (existing.length < 32) throw new Error('ملف سر الجلسات تالف أو قصير')
    return existing
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const secret = crypto.randomBytes(48).toString('base64url')
  const temporary = file + '.' + process.pid + '.partial'
  fs.writeFileSync(temporary, secret, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  try {
    fs.renameSync(temporary, file)
  } catch (error) {
    try { fs.unlinkSync(temporary) } catch { /* another process completed creation */ }
    if (error?.code !== 'EEXIST') throw error
    return fs.readFileSync(file, 'utf8').trim()
  }
  return secret
}

export function parseCookies(header = '') {
  const cookies = {}
  for (const part of String(header).split(';')) {
    const at = part.indexOf('=')
    if (at < 1) continue
    const key = part.slice(0, at).trim()
    try { cookies[key] = decodeURIComponent(part.slice(at + 1).trim()) } catch { /* invalid cookie */ }
  }
  return cookies
}

export const SESSION_MAX_AGE_SECONDS = Math.max(24 * 60 * 60, Number(process.env.SESSION_MAX_AGE_SECONDS) || 30 * 24 * 60 * 60)

function requestUsesHttps(req) {
  if (!req) return process.env.NODE_ENV === 'production'
  if (req.secure) return true
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase()
  if (forwardedProto) return forwardedProto === 'https'
  return false
}

export function sessionCookie(token, maxAgeSeconds = SESSION_MAX_AGE_SECONDS, req = null) {
  const secure = requestUsesHttps(req) ? '; Secure' : ''
  return 'exam_session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSeconds + secure
}

export function clearSessionCookie(req = null) {
  const secure = requestUsesHttps(req) ? '; Secure' : ''
  return 'exam_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + secure
}

