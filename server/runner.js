import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveAutoNetwork } from './networkIp.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const environmentFile = path.join(projectRoot, '.env.production')
if (fs.existsSync(environmentFile)) {
  for (const raw of fs.readFileSync(environmentFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const at = line.indexOf('='), name = line.slice(0, at).trim()
    let value = line.slice(at + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[name]) process.env[name] = value
  }
}

const { env: resolvedEnv, detected } = resolveAutoNetwork(process.env)
process.env = resolvedEnv
if (detected) {
  if (detected.mode === 'offline') {
    console.log('ℹ لا توجد شبكة محلية متصلة؛ تم ضبط الرابط على الوضع المحلي: ' + process.env.PUBLIC_APP_URL)
  } else {
    console.log(`✓ تم اكتشاف الشبكة الحالية تلقائياً: [${detected.ip}] عبر كرت (${detected.interfaceName})`)
  }
}

let child = null
let stopping = false
let restartDelay = 1000
const required = ['JWT_SECRET', 'APP_ORIGIN', 'PUBLIC_APP_URL', 'ARCHIVE_BACKUP_MIRROR_DIR', 'ARCHIVE_BACKUP_ENCRYPTION_KEY']
const missing = required.filter((name) => !String(process.env[name] || '').trim())
if (missing.length) {
  console.error('إعدادات الإنتاج المطلوبة غير موجودة: ' + missing.join(', '))
  process.exit(1)
}

function start() {
  child = spawn(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
    windowsHide: true,
  })
  child.on('exit', (code, signal) => {
    child = null
    if (stopping) return
    console.error(JSON.stringify({ level: 'error', event: 'server_restarting', code, signal, delayMs: restartDelay }))
    setTimeout(start, restartDelay).unref()
    restartDelay = Math.min(30_000, restartDelay * 2)
  })
  setTimeout(() => { restartDelay = 1000 }, 60_000).unref()
}

function stop(signal) {
  stopping = true
  if (!child) return process.exit(0)
  child.once('exit', () => process.exit(0))
  child.kill(signal)
  setTimeout(() => child?.kill('SIGKILL'), 15_000).unref()
}

process.once('SIGINT', () => stop('SIGINT'))
process.once('SIGTERM', () => stop('SIGTERM'))
start()
