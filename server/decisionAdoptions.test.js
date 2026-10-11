import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sytest-decision-adoptions-'))
process.env.EXAM_DATA_DIR = testDir

let db
let adoptDecision
let getCurrentAdoption
let loadError = null

try {
  ;({ db } = await import('./db.js'))
  ;({ adoptDecision, getCurrentAdoption } = await import('./decisionAdoptions.js'))
} catch (err) {
  loadError = err
}

test.after(() => {
  try {
    db?.close()
  } catch {
    /* ignore */
  }
  fs.rmSync(testDir, { recursive: true, force: true })
})

test('adoptDecision agrees, overrides with reason, rejects operator, does not change attempts', (t) => {
  if (loadError) {
    t.skip(`تخطي اختبار قاعدة البيانات: ${loadError.message}`)
    return
  }

  function seedExam(category) {
    const id = crypto.randomUUID()
    db.prepare(
      `INSERT INTO exams(id, title, category, level, capacity, question_count, username, password_hash, password_plain, question_ids, questions_json, created_at, created_by, active)
       VALUES (?,?,?,?,1,1,?,?,?,'[]','[]',?,?,1)`,
    ).run(
      id,
      `اختبار ${category}`,
      category,
      'practitioner',
      `exam-${id}`,
      '',
      '',
      new Date().toISOString(),
      'admin',
    )
    return id
  }

  const name = 'مرشح اعتماد تجريبي'
  const applicantId = crypto.randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO applicants(id, seq_number, name, created_at, updated_at) VALUES (?,?,?,?,?)`,
  ).run(applicantId, 1, name, now, now)

  const scores = { theory: 80, oral: 78, driving: 76, personality: 82 }
  for (const category of Object.keys(scores)) {
    const examId = seedExam(category)
    db.prepare(
      `INSERT INTO attempts(id, exam_id, examinee_name, applicant_id, answers_json, score, max_score, started_at, finished_at, evaluation_status)
       VALUES (?,?,?,?, '{}',  ?, 100, ?, ?, NULL)`,
    ).run(crypto.randomUUID(), examId, name, applicantId, scores[category], now, now)
  }

  const commander = { id: 2, username: 'commander', role: 'commander' }
  const agreed = adoptDecision(applicantId, { adoptedStatus: 'qualified' }, commander)
  assert.equal(agreed.adoptedStatus, 'qualified')
  assert.equal(agreed.recommendedStatus, 'qualified')
  assert.equal(agreed.agreed, true)
  assert.equal(getCurrentAdoption(applicantId).id, agreed.id)

  assert.throws(
    () => adoptDecision(applicantId, { adoptedStatus: 'not_qualified' }, commander),
    (err) => err.status === 400 && /سبب/.test(err.message),
  )

  const overridden = adoptDecision(
    applicantId,
    { adoptedStatus: 'not_qualified', reason: 'مخالفة معتمدة من جلسة القيادة' },
    commander,
  )
  assert.equal(overridden.adoptedStatus, 'not_qualified')
  assert.equal(overridden.agreed, false)
  assert.equal(getCurrentAdoption(applicantId).id, overridden.id)
  assert.equal(agreed.id !== overridden.id, true)
  const old = db.prepare('SELECT superseded_at FROM decision_adoptions WHERE id=?').get(agreed.id)
  assert.ok(old.superseded_at)

  assert.throws(
    () => adoptDecision(applicantId, { adoptedStatus: 'qualified' }, { role: 'operator', username: 'theory' }),
    (err) => err.status === 403,
  )

  const scoresAfter = db.prepare('SELECT score FROM attempts WHERE applicant_id=?').all(applicantId)
  assert.ok(scoresAfter.every((row) => [80, 78, 76, 82].includes(row.score)))
})
