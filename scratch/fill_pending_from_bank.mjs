import Database from 'better-sqlite3'
import { createJobExamService } from '../server/jobExams.js'
import { insertExamRoster } from '../server/roster.js'

const db = new Database('server/data/exams.db')
db.pragma('foreign_keys = ON')
const jobExams = createJobExamService(db, {
  getApplicantsByIds: () => [],
  insertExamRoster,
})
const admin = { role: 'admin', username: 'admin' }
const pending = db.prepare(`
  SELECT DISTINCT e.id, e.title, e.category, e.active
  FROM exams e
  JOIN exam_question_sets s ON s.exam_id = e.id
  WHERE json_array_length(s.questions_json) = 0
    AND e.deleted_at IS NULL
`).all()

console.log('Pending exams:', pending.length)
for (const exam of pending) {
  try {
    const result = jobExams.completeGroup(admin, exam, { source: 'bank-all', all: true })
    console.log(JSON.stringify({ id: exam.id, title: exam.title, category: exam.category, ...result }))
  } catch (err) {
    console.log(JSON.stringify({ id: exam.id, title: exam.title, error: err.message }))
  }
}
