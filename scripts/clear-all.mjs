/**
 * تصفير تشغيلي كامل: اختبارات + متقدمون + أرشيف + جلسات تقييم + ربط اللجان.
 * تبقى حسابات الدخول وهيكل اللجان (بدون متقدمين/اختبارات).
 *
 * الاستخدام: node scripts/clear-all.mjs
 *           node scripts/clear-all.mjs --yes
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { installArchiveProtection } from '../server/archiveProtection.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.join(root, 'server', 'data', 'exams.db')
const force = process.argv.includes('--yes') || process.argv.includes('-y')

/** ترتيب يحترم الاعتماديات قدر الإمكان */
const TABLES = [
  'result_audit_log',
  'audit_events',
  'decision_adoptions',
  'security_reviews',
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
  'committee_scores',
  'committee_results',
  'committee_assignments',
  'committee_candidates',
  'attempts',
  'exam_question_sets',
  'job_exam_configs',
  'exam_roster',
  'exams',
  'examinee_profiles',
  'applicants',
  'applicant_columns',
]

const db = new Database(dbPath)
db.pragma('busy_timeout = 8000')

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)
}

function restoreAuditDeleteGuard() {
  if (!tableExists('audit_events')) return
  db.exec(`CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END`)
}

function count(table) {
  if (!tableExists(table)) return 0
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
}

const before = Object.fromEntries(TABLES.map((table) => [table, count(table)]))
const total = Object.values(before).reduce((sum, n) => sum + n, 0)

if (!total) {
  console.log('البيانات التشغيلية فارغة مسبقاً — لا يوجد شيء للتصفير.')
  db.close()
  process.exit(0)
}

console.log('سيتم تصفير كل البيانات التشغيلية التالية:')
for (const [table, n] of Object.entries(before)) {
  if (n > 0) console.log(`  ${table}: ${n}`)
}
console.log('ملاحظة: حسابات الأدمن/الوصول وهيكل اللجان تبقى.')

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
  for (const row of db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'retain_%_delete' OR name LIKE 'retain_%_update')")
    .all()) {
    db.exec(`DROP TRIGGER IF EXISTS ${row.name}`)
  }
  db.exec('DROP TRIGGER IF EXISTS audit_events_no_delete')

  db.transaction(() => {
    for (const table of TABLES) {
      if (tableExists(table)) db.prepare(`DELETE FROM ${table}`).run()
    }
  })()

  installArchiveProtection(db)
  restoreAuditDeleteGuard()

  console.log('✓ تم التصفير الشامل بنجاح.')
  console.log(`  اختبارات: ${count('exams')} | متقدمون: ${count('applicants')} | أرشيف: ${count('assessment_archive')}`)
  console.log(`  قوائم ممتحنين: ${count('exam_roster')} | إسناد لجان: ${count('committee_candidates')} | ربط اختبارات: ${count('committee_assignments')}`)
} catch (err) {
  console.error('✗ فشل التصفير:', err.message || err)
  try {
    installArchiveProtection(db)
    restoreAuditDeleteGuard()
  } catch {
    /* best effort */
  }
  db.close()
  process.exit(1)
}

db.close()
