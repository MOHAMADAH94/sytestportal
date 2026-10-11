import Database from 'better-sqlite3'
import { resolveOralBucket, ORAL_BUCKET_META } from '../shared/evaluationMatrix.js'
import { resolveJobProfile, effectiveJobTitle } from '../shared/jobProfiles.js'

const db = new Database('server/data/exams.db')
const examId = 'exam-72d052ad-34ae-4c99-a8cd-247ad73612c0'
const roster = db.prepare('SELECT id, name, job_title, extra_json FROM exam_roster WHERE exam_id=?').all(examId)

for (const r of roster) {
  let extra = {}
  try {
    extra = r.extra_json ? JSON.parse(r.extra_json) : {}
  } catch {}
  const applicant = { jobTitle: r.job_title, extra }
  const eff = effectiveJobTitle(applicant)
  const profile = resolveJobProfile(eff || r.job_title)
  const bucket = resolveOralBucket(applicant)
  const role = ORAL_BUCKET_META[bucket]?.oralRole
  if (role !== 'technician' || /شبك|برمج|مهندس|نظم|سوفت/.test(String(r.job_title || '') + JSON.stringify(extra))) {
    console.log({
      name: r.name,
      job_title: r.job_title,
      effective: eff,
      profileId: profile?.id,
      oralRole: profile?.oralRole,
      specialty: profile?.specialty,
      bucket,
      wantRole: role,
      committee: extra['اللجنة'] || extra.committee || null,
      interview: extra['نوع المقابلة'] || null,
      extraKeys: Object.keys(extra),
    })
  }
}
