import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(projectRoot, '.env.production')

function randomSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function parseEnv(text) {
  const values = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const at = line.indexOf('=')
    const name = line.slice(0, at).trim()
    let value = line.slice(at + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[name] = value
  }
  return values
}

function desktopDir() {
  return path.join(os.homedir(), 'Desktop')
}

function keepSecret(existing, name) {
  const value = String(existing[name] || '').trim()
  return value || randomSecret()
}

const existing = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {}

// BAT local launcher: bind on LAN and auto-detect router IP for QR/CORS.
const values = {
  ...existing,
  PORT: existing.PORT || '3001',
  HOST: '0.0.0.0',
  APP_ORIGIN: 'AUTO',
  PUBLIC_APP_URL: 'AUTO',
  ALLOW_HTTP_LAN: 'true',
  TRUST_PROXY: existing.TRUST_PROXY || 'loopback',
  JWT_SECRET: keepSecret(existing, 'JWT_SECRET'),
  SESSION_MAX_AGE_SECONDS: existing.SESSION_MAX_AGE_SECONDS || '2592000',
  EXAM_SECONDS_PER_QUESTION_THEORY: existing.EXAM_SECONDS_PER_QUESTION_THEORY || '60',
  EXAM_SECONDS_PER_QUESTION_ORAL: existing.EXAM_SECONDS_PER_QUESTION_ORAL || '300',
  EXAM_SECONDS_PER_QUESTION_DRIVING: existing.EXAM_SECONDS_PER_QUESTION_DRIVING || '300',
  EXAM_SECONDS_PER_QUESTION_PERSONALITY: existing.EXAM_SECONDS_PER_QUESTION_PERSONALITY || '90',
  ARCHIVE_BACKUP_DIR: existing.ARCHIVE_BACKUP_DIR || path.join(projectRoot, 'backups', 'archive'),
  ARCHIVE_BACKUP_MIRROR_DIR: path.join(desktopDir(), 'النسخة الاحتياطية لمنصة الاختبارات'),
  ARCHIVE_BACKUP_ENCRYPTION_KEY: keepSecret(existing, 'ARCHIVE_BACKUP_ENCRYPTION_KEY'),
  ARCHIVE_BACKUP_INTERVAL_SECONDS: existing.ARCHIVE_BACKUP_INTERVAL_SECONDS || '300',
  ARCHIVE_BACKUP_RETENTION: existing.ARCHIVE_BACKUP_RETENTION || '72',
}

const lines = Object.entries(values).map(([key, value]) => `${key}="${String(value).replace(/"/g, '')}"`)
fs.writeFileSync(envFile, lines.join('\n') + '\n', 'utf8')
console.log('Environment ready for LAN access: HOST=0.0.0.0, APP_ORIGIN=AUTO, PUBLIC_APP_URL=AUTO')
