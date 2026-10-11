/**
 * تصفير الاختبارات والنتائج والأرشيف التشغيلي (الحسابات واللجان والمتقدمون يبقون).
 * الاستخدام: node scripts/clear-exams.mjs
 *           node scripts/clear-exams.mjs --yes
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { installArchiveProtection } from '../server/archiveProtection.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.join(root, 'server', 'data', 'exams.db')
const force = process.argv.includes('--yes') || process.argv.includes('-y')

const TABLES = [
  'result_audit_log',
  'decision_adoptions',
  'assessment_archive',
  'oral_archive',
  'archive_versions',
  'exam_retention_log',
  'evaluation_scores',
  'evaluation_session_checkpoints',
  'evaluation_session_audit',
  'evaluation_sessions',
  'evaluation_runs',
  'evaluation_open_rosters',
  'monitoring_events',
  'exam_monitor_events',
  'live_monitor_sessions',
  'committee_results',
  'committee_assignments',
  'attempts',
  'exam_question_sets',
  'job_exam_configs',
  'exam_roster',
  'exams',
]

const db = new Database(dbPath)
db.pragma('busy_timeout = 8000')

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)
}

function count(table) {
  if (!tableExists(table)) return 0
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
}

const before = Object.fromEntries(TABLES.map((table) => [table, count(table)]))
const total = Object.values(before).reduce((sum, n) => sum + n, 0)

if (!total) {
  console.log('سجلات الاختبارات والنتائج فارغة مسبقاً — لا يوجد شيء للتصفير.')
  db.close()
  process.exit(0)
}

console.log('سيتم تصفير سجلات الاختبارات والنتائج التالية:')
for (const [table, n] of Object.entries(before)) {
  if (n > 0) console.log(`  ${table}: ${n}`)
}
console.log('ملاحظة: حسابات الدخول واللجان والمتقدمون لا تُحذف.')

if (!force && process.stdin.isTTY) {
  process.stdout.write('اكتب نعم للتأكيد ثم Enter: ')
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
    if (chunk.includes('\n') || chunk.includes('\r')) break
  }
  const answer = Buffer.concat(chunks).toString('utf8').trim()
  if (answer !== 'نعم' && answer.toLowerCase() !== 'yes') {
    console.log('أُلغي التصفير.')
    db.close()
    process.exit(1)
  }
} else if (!force) {
  console.error('شغّل مع --yes للتصفير دون تأكيد تفاعلي.')
  db.close()
  process.exit(1)
}

try {
  const deleteTriggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'retain_%_delete'")
    .all()
    .map((r) => r.name)
  for (const name of deleteTriggers) db.exec(`DROP TRIGGER IF EXISTS ${name}`)

  const updateTriggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'retain_%_update'")
    .all()
    .map((r) => r.name)
  for (const name of updateTriggers) db.exec(`DROP TRIGGER IF EXISTS ${name}`)

  db.transaction(() => {
    for (const table of TABLES) {
      if (tableExists(table)) db.prepare(`DELETE FROM ${table}`).run()
    }
  })()

  installArchiveProtection(db)

  console.log('✓ تم تصفير الاختبارات والنتائج بنجاح.')
  console.log(`  الاختبارات المتبقية: ${count('exams')}`)
  console.log(`  المحاولات المتبقية: ${count('attempts')}`)
  console.log(`  أرشيف التقييم المتبقي: ${count('assessment_archive')}`)
  console.log(`  قوائم الممتحنين المتبقية: ${count('exam_roster')}`)
} catch (err) {
  console.error('✗ فشل التصفير:', err.message || err)
  try {
    installArchiveProtection(db)
  } catch {
    /* best effort */
  }
  db.close()
  process.exit(1)
}

db.close()
