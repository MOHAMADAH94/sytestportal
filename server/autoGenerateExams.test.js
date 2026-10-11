import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { createJobExamService } from './jobExams.js'
import { createAutoGenerateExamsService } from './autoGenerateExams.js'
import { groupApplicants } from '../shared/jobProfiles.js'

const bank = JSON.parse(readFileSync(new URL('./question-bank.json', import.meta.url)))
const schema = readFileSync(new URL('./db.js', import.meta.url), 'utf8').match(/db\.exec\(`([\s\S]*?)`\)/)[1]
const admin = { role: 'admin', username: 'test-admin' }

function fixture(t, applicants) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.exec(schema)
  db.pragma('foreign_keys=ON')
  const insertExamRoster = (examId, rows) => {
    return rows.map((applicant, i) => {
      const id = randomUUID()
      db.prepare(
        `INSERT INTO exam_roster (id,exam_id,seq_number,applicant_id,name,username,password_hash,password_plain,qr_token,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        examId,
        applicant.seqNumber || i + 1,
        applicant.id,
        applicant.name,
        `u_${id.slice(0, 8)}`,
        '',
        '',
        id,
        '2026-09-13',
      )
      return { ...applicant, id, applicantId: applicant.id }
    })
  }
  const jobExams = createJobExamService(db, {
    bank,
    getApplicantsByIds: (ids) => applicants.filter((a) => ids.includes(a.id)),
    insertExamRoster,
  })
  const auto = createAutoGenerateExamsService(db, jobExams, { listApplicants: () => applicants })
  return { db, jobExams, auto }
}

test('auto-generate creates theory exams only and skips already covered applicants', (t) => {
  const applicants = [
    { id: 'g1', name: 'حارس أ', jobTitle: 'حارس', seqNumber: 1, extra: { 'نوع المقابلة': 'داخلية' } },
    { id: 'a1', name: 'إداري أ', jobTitle: 'إداري', seqNumber: 2, extra: { 'نوع المقابلة': 'داخلية' } },
    { id: 'p1', name: 'مبرمج أ', jobTitle: 'مبرمج', seqNumber: 3, extra: { 'نوع المقابلة': 'داخلية' } },
    { id: 'n1', name: 'شبكات أ', jobTitle: 'مهندس شبكات', seqNumber: 4, extra: { 'نوع المقابلة': 'داخلية' } },
  ]
  const { auto, db } = fixture(t, applicants)
  const first = auto.generate(admin, { applicantIds: applicants.map((a) => a.id), questionCount: 4 })
  assert.ok(first.createdCount >= 1)
  assert.ok(first.exams.every((e) => e.category === 'theory'))
  assert.ok(first.exams.some((e) => e.category === 'theory'))
  assert.ok(first.warnings.some((w) => /اللجان/.test(w)))

  const second = auto.generate(admin, { applicantIds: applicants.map((a) => a.id), questionCount: 4 })
  assert.equal(second.createdCount, 0)
  assert.ok(second.skippedCount > 0)

  const examCount = db.prepare('SELECT COUNT(*) AS n FROM exams').get().n
  assert.equal(examCount, first.createdCount)
})

test('auto-generate rejects non-admin', (t) => {
  const applicants = [{ id: 'x', name: 'س', jobTitle: 'حارس', seqNumber: 1, extra: {} }]
  const { auto } = fixture(t, applicants)
  assert.throws(() => auto.generate({ role: 'operator', category: 'oral' }, {}), (err) => err.status === 403)
  void groupApplicants
})
