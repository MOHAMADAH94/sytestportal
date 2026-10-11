import Database from 'better-sqlite3'

const db = new Database('server/data/exams.db')
const exams = db
  .prepare(
    `SELECT id, title, category, oral_role, capacity, created_at
     FROM exams
     WHERE category='oral' AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 30`,
  )
  .all()
console.log('ORAL EXAMS:')
for (const e of exams) {
  console.log(`  ${e.id} | ${e.title} | oral_role=${e.oral_role} | cap=${e.capacity} | ${e.created_at}`)
}

const fanni = exams.find((e) => e.title === 'فني') || exams.find((e) => String(e.title).includes('فني'))
if (!fanni) {
  console.log('No فني exam found')
  process.exit(0)
}

const roster = db.prepare('SELECT id, name, job_title, extra_json FROM exam_roster WHERE exam_id=?').all(fanni.id)
console.log(`\nEXAM ${fanni.id} "${fanni.title}" oral_role=${fanni.oral_role} count=${roster.length}`)
const titles = {}
for (const r of roster) {
  const t = r.job_title || '(empty)'
  titles[t] = (titles[t] || 0) + 1
}
console.log('JOB TITLES:', titles)

import { resolveOralBucket, ORAL_BUCKET_META } from '../shared/evaluationMatrix.js'
const buckets = {}
for (const r of roster) {
  let extra = {}
  try {
    extra = r.extra_json ? JSON.parse(r.extra_json) : {}
  } catch {}
  const b = resolveOralBucket({ jobTitle: r.job_title, extra })
  const role = ORAL_BUCKET_META[b]?.oralRole || '?'
  buckets[`${b}->${role}`] = (buckets[`${b}->${role}`] || 0) + 1
}
console.log('RESOLVED BUCKETS:', buckets)
