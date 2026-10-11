import Database from 'better-sqlite3'
import { createJobExamService } from '../server/jobExams.js'
import { createAutoGenerateExamsService } from '../server/autoGenerateExams.js'
import { getApplicantsByIds, listApplicants } from '../server/applicants.js'
import { insertExamRoster } from '../server/roster.js'

const db = new Database('server/data/exams.db')
const jobExams = createJobExamService(db, { getApplicantsByIds, insertExamRoster })
const auto = createAutoGenerateExamsService(db, jobExams, { listApplicants })

const admin = { role: 'admin', username: 'admin' }
const result = auto.repairOralSpecialtyAssignments(admin)
console.log('REPAIR:', result)

const exams = db
  .prepare(
    `SELECT id, title, oral_role, capacity FROM exams WHERE category='oral' AND deleted_at IS NULL ORDER BY created_at DESC`,
  )
  .all()
for (const e of exams) {
  const titles = db
    .prepare('SELECT job_title, COUNT(*) n FROM exam_roster WHERE exam_id=? GROUP BY job_title')
    .all(e.id)
  console.log(`\n${e.title} (${e.oral_role}) cap=${e.capacity}`)
  console.log(Object.fromEntries(titles.map((t) => [t.job_title || '(empty)', t.n])))
}
