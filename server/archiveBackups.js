import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

async function digest(file) { return createHash('sha256').update(await fs.readFile(file)).digest('hex') }
async function removeSqliteSidecars(file) {
  await Promise.all([
    fs.rm(file + '-wal', { force:true }),
    fs.rm(file + '-shm', { force:true }),
  ])
}
export async function verifyBackup(file) {
  const manifest = JSON.parse(await fs.readFile(file + '.json', 'utf8'))
  if (manifest.sha256 !== await digest(file)) throw new Error('بصمة النسخة الاحتياطية غير مطابقة')
  const copy = new Database(file, { readonly: true, fileMustExist: true })
  try { if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('فشل فحص سلامة قاعدة البيانات') }
  finally { copy.close(); await removeSqliteSidecars(file) }
  return manifest
}

export async function restoreBackup(source, target) {
  const manifest = JSON.parse(await fs.readFile(source + '.json', 'utf8'))
  if (manifest.encrypted) {
    await verifyEncryptedBackup(source, process.env.ARCHIVE_BACKUP_ENCRYPTION_KEY, target)
  } else {
    await verifyBackup(source)
    await fs.copyFile(source, target, constants.COPYFILE_EXCL)
    if (await digest(source) !== await digest(target)) throw new Error('فشل التحقق من الملف المستعاد')
  }
}

const MAGIC = Buffer.from('EXBK1')
function encryptionKey(secret) {
  if (!secret || String(secret).length < 32) throw new Error('مفتاح تشفير النسخ الخارجية يجب ألا يقل عن 32 محرفًا')
  return createHash('sha256').update(String(secret)).digest()
}
async function encryptBackup(source, target, secret) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  await fs.writeFile(target, Buffer.concat([MAGIC, iv]), { flag:'wx' })
  await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags:'a' }))
  await fs.appendFile(target, cipher.getAuthTag())
}
async function decryptBackup(source, target, secret) {
  const stat = await fs.stat(source)
  if (stat.size < 34) throw new Error('ملف النسخة المشفرة تالف')
  const handle = await fs.open(source, 'r')
  const head = Buffer.alloc(17), tag = Buffer.alloc(16)
  try { await handle.read(head, 0, 17, 0); await handle.read(tag, 0, 16, stat.size - 16) } finally { await handle.close() }
  if (!head.subarray(0, 5).equals(MAGIC)) throw new Error('صيغة النسخة المشفرة غير معروفة')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), head.subarray(5)); decipher.setAuthTag(tag)
  await pipeline(createReadStream(source, { start:17, end:stat.size - 17 }), decipher, createWriteStream(target, { flags:'wx' }))
}
export async function verifyEncryptedBackup(file, secret, restoredTarget = null) {
  const manifest = JSON.parse(await fs.readFile(file + '.json', 'utf8'))
  if (!manifest.encrypted || manifest.sha256 !== await digest(file)) throw new Error('بصمة النسخة المشفرة غير مطابقة')
  const temporary = restoredTarget || file + '.verify-' + randomUUID() + '.db'
  try {
    await decryptBackup(file, temporary, secret)
    if (manifest.plaintextSha256 !== await digest(temporary)) throw new Error('بصمة محتوى النسخة المشفرة غير مطابقة')
    const copy = new Database(temporary, { readonly:true, fileMustExist:true })
    try { if (copy.pragma('integrity_check', { simple:true }) !== 'ok') throw new Error('فشل فحص سلامة النسخة المشفرة') } finally { copy.close() }
  } catch (error) {
    if (restoredTarget) await fs.rm(restoredTarget, { force:true })
    throw error
  } finally {
    await removeSqliteSidecars(temporary)
    if (!restoredTarget) await fs.rm(temporary, { force:true })
  }
  return manifest
}

export function createArchiveBackups(db, directory, { mirrorDirectory = null, encryptionKey: mirrorEncryptionKey = process.env.ARCHIVE_BACKUP_ENCRYPTION_KEY || null } = {}) {
  let pending, timer, lastSuccess = null, lastError = null, changeVersion = -1
  const intervalSeconds = Math.max(60, Number(process.env.ARCHIVE_BACKUP_INTERVAL_SECONDS || 60))
  const retentionCount = Math.max(10, Number(process.env.ARCHIVE_BACKUP_RETENTION || 60))
  async function prune(folder) {
    if (!folder) return
    const names = (await fs.readdir(folder)).filter((name) => name.endsWith('.json')).sort().reverse()
    const records = []
    for (const name of names) {
      try { records.push({ name, manifest: JSON.parse(await fs.readFile(path.join(folder, name), 'utf8')) }) } catch { /* retain unknown evidence */ }
    }
    const automatic = records.filter((item) => ['automatic', 'startup'].includes(item.manifest.reason))
    const keep = new Set(automatic.slice(0, retentionCount).map((item) => item.name))
    const buckets = [
      { max: 30, key: (date) => date.toISOString().slice(0, 10) },
      { max: 12, key: (date) => String(Math.floor(date.getTime() / (7 * 86400000))) },
      { max: 12, key: (date) => date.toISOString().slice(0, 7) },
    ]
    for (const bucket of buckets) {
      const used = new Set()
      for (const item of automatic) {
        const date = new Date(item.manifest.createdAt)
        if (!Number.isFinite(date.getTime())) continue
        const key = bucket.key(date)
        if (used.has(key) || used.size >= bucket.max) continue
        used.add(key); keep.add(item.name)
      }
    }
    for (const item of automatic.filter((entry) => !keep.has(entry.name))) {
      const dbName = item.name.slice(0, -5)
      await fs.rm(path.join(folder, item.name), { force: true })
      await fs.rm(path.join(folder, dbName), { force: true })
      await fs.rm(path.join(folder, dbName + '-wal'), { force: true })
      await fs.rm(path.join(folder, dbName + '-shm'), { force: true })
    }
  }
  async function run(reason) {
    const version = db.prepare('SELECT total_changes() AS n').get().n
    await fs.mkdir(directory, { recursive: true })
    const name = 'exams-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.db'
    const file = path.join(directory, name), temporary = file + '.partial'
    await db.backup(temporary)
    const copy = new Database(temporary, { readonly: true, fileMustExist: true })
    let archiveCount
    try {
      if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('فشل فحص سلامة النسخة الاحتياطية')
      archiveCount = copy.prepare('SELECT COUNT(*) AS n FROM assessment_archive').get().n
    } finally { copy.close(); await removeSqliteSidecars(temporary) }
    const manifest = { file: name, createdAt: new Date().toISOString(), reason, archiveCount, sha256: await digest(temporary) }
    await fs.rename(temporary, file)
    await fs.writeFile(file + '.json', JSON.stringify(manifest, null, 2), { flag: 'wx' })
    await verifyBackup(file)
    if (mirrorDirectory) {
      await fs.mkdir(mirrorDirectory, { recursive: true })
      if (mirrorEncryptionKey) {
        const mirrored = path.join(mirrorDirectory, name + '.enc')
        await encryptBackup(file, mirrored, mirrorEncryptionKey)
        const encryptedManifest = { ...manifest, file:path.basename(mirrored), encrypted:true, plaintextSha256:manifest.sha256, sha256:await digest(mirrored) }
        await fs.writeFile(mirrored + '.json', JSON.stringify(encryptedManifest, null, 2), { flag:'wx' })
        await verifyEncryptedBackup(mirrored, mirrorEncryptionKey)
      } else {
        const mirrored = path.join(mirrorDirectory, name)
        await fs.copyFile(file, mirrored, constants.COPYFILE_EXCL)
        await fs.copyFile(file + '.json', mirrored + '.json', constants.COPYFILE_EXCL)
        await verifyBackup(mirrored)
      }
    }
    await prune(directory)
    if (mirrorDirectory) await prune(mirrorDirectory)
    lastSuccess = manifest; lastError = null; changeVersion = version
    return manifest
  }
  function backup(reason = 'manual') {
    // Each caller requesting a pre-delete backup waits for a fresh snapshot of its own.
    const next = (pending || Promise.resolve()).catch(() => {}).then(() => run(reason))
    const settled = next.then((value) => { if (pending === settled) pending = null; return value }, (error) => {
      lastError = error.message
      console.error('[archive-backup]', error.message)
      if (pending === settled) pending = null
      throw error
    })
    pending = settled
    return settled
  }
  function start() {
    if (timer) return
    void backup('startup').catch(() => {})
    timer = setInterval(() => {
      if (!pending && (changeVersion !== db.prepare('SELECT total_changes() AS n').get().n || !lastSuccess || Date.now() - Date.parse(lastSuccess.createdAt) >= 3600000)) void backup('automatic').catch(() => {})
    }, intervalSeconds * 1000)
    timer.unref()
  }
  return { backup, start, stop: () => clearInterval(timer), status: () => ({ lastSuccess, lastError, busy: !!pending, directory, mirrorDirectory, intervalSeconds, retentionCount, externalCopyConfigured: !!mirrorDirectory, encryptedExternalCopy: !!(mirrorDirectory && mirrorEncryptionKey) }) }
}
