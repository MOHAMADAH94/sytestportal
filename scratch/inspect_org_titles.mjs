import Database from 'better-sqlite3'
import { resolveOralBucket, ORAL_BUCKET_META } from '../shared/evaluationMatrix.js'
import { resolveJobProfile, effectiveJobTitle } from '../shared/jobProfiles.js'

const db = new Database('server/data/exams.db')
const examId = 'exam-72d052ad-34ae-4c99-a8cd-247ad73612c0'
const roster = db.prepare('SELECT name, job_title, extra_json FROM exam_roster WHERE exam_id=?').all(examId)

const needSamples = new Set(['مهندس', 'تقني', 'فني شبكات', 'فني خبير', 'تقني خبير', 'فني'])
for (const r of roster) {
  if (!needSamples.has(r.job_title) && needSamples.size) {
    // still show one of each
  }
  let extra = {}
  try { extra = JSON.parse(r.extra_json || '{}') } catch {}
  const orgTitle = extra['مسمى العمل طلب الاحتياج']
  if (orgTitle && orgTitle !== r.job_title) {
    console.log({
      name: r.name,
      job_title: r.job_title,
      orgTitle,
      orgBucket: resolveOralBucket({ jobTitle: orgTitle }),
      jobBucket: resolveOralBucket({ jobTitle: r.job_title, extra }),
    })
  }
}

console.log('\n--- sample org titles by job_title ---')
const seen = new Set()
for (const r of roster) {
  if (seen.has(r.job_title)) continue
  seen.add(r.job_title)
  let extra = {}
  try { extra = JSON.parse(r.extra_json || '{}') } catch {}
  console.log(r.job_title, '=>', extra['مسمى العمل طلب الاحتياج'] || '(none)')
}
