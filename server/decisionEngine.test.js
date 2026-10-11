import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

import {
  evaluateDecision,
  POLICY_VERSION,
  THRESHOLDS,
} from './decisionRules.js'

test('evaluateDecision: qualified when composite high and all above floor', () => {
  const result = evaluateDecision({
    categoryPercents: { theory: 80, oral: 78, driving: 76, personality: 82 },
  })
  assert.equal(result.status, 'qualified')
  assert.equal(result.labelAr, 'مؤهل')
  assert.equal(result.compositePercent, 79)
  assert.equal(result.policyVersion, POLICY_VERSION)
  assert.ok(result.reasons.length > 0)
})

test('evaluateDecision: conditional when composite mid or floor breached', () => {
  const mid = evaluateDecision({
    categoryPercents: { theory: 70, oral: 68, driving: 66, personality: 64 },
  })
  assert.equal(mid.status, 'conditional')
  assert.equal(mid.labelAr, 'مشروط')
  assert.equal(mid.compositePercent, 67)

  const floor = evaluateDecision({
    categoryPercents: { theory: 90, oral: 90, driving: 50, personality: 90 },
  })
  assert.equal(floor.status, 'conditional')
  assert.ok(floor.reasons.some((r) => r.includes('أهلية القيادة')))
  assert.ok(floor.compositePercent >= THRESHOLDS.conditionalComposite)
})

test('evaluateDecision: not_qualified below conditional threshold', () => {
  const result = evaluateDecision({
    categoryPercents: { theory: 50, oral: 55, driving: 40, personality: 45 },
  })
  assert.equal(result.status, 'not_qualified')
  assert.equal(result.labelAr, 'غير مؤهل')
  assert.ok(result.compositePercent < THRESHOLDS.conditionalComposite)
})

test('evaluateDecision: custom thresholds change status without altering defaults', () => {
  const percents = { theory: 80, oral: 78, driving: 76, personality: 82 }
  const defaulted = evaluateDecision({ categoryPercents: percents })
  assert.equal(defaulted.status, 'qualified')
  const stricter = evaluateDecision({
    categoryPercents: percents,
    thresholds: { qualifiedComposite: 90, conditionalComposite: 70, minPerCategory: 60 },
  })
  assert.equal(stricter.status, 'conditional')
  assert.equal(stricter.thresholds.qualifiedComposite, 90)
  const stillDefault = evaluateDecision({ categoryPercents: percents })
  assert.equal(stillDefault.status, 'qualified')
  assert.equal(stillDefault.thresholds.qualifiedComposite, THRESHOLDS.qualifiedComposite)

  const incomplete = evaluateDecision({
    categoryPercents: { theory: 90, oral: 90 },
    thresholds: { qualifiedComposite: 50, conditionalComposite: 40, minPerCategory: 10 },
  })
  assert.equal(incomplete.status, 'incomplete')
})

test('evaluateDecision: incomplete when missing or pending', () => {
  const missing = evaluateDecision({
    categoryPercents: { theory: 80, oral: 80 },
  })
  assert.equal(missing.status, 'incomplete')
  assert.equal(missing.compositePercent, null)
  assert.deepEqual(missing.missingCategories.sort(), ['driving', 'personality'].sort())

  const pending = evaluateDecision({
    categoryPercents: { theory: 80, oral: 80, driving: 80, personality: 70 },
    pendingCategories: ['personality'],
  })
  assert.equal(pending.status, 'incomplete')
  assert.deepEqual(pending.pendingCategories, ['personality'])
})

test('decisionForApplicant integration when sqlite binding is available', async (t) => {
  let db
  let decisionForApplicant
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sytest-decision-engine-'))
  process.env.EXAM_DATA_DIR = testDir

  try {
    ;({ db } = await import('./db.js'))
    ;({ decisionForApplicant } = await import('./decisionEngine.js'))
  } catch (err) {
    t.skip(`تخطي اختبار قاعدة البيانات: ${err.message}`)
    fs.rmSync(testDir, { recursive: true, force: true })
    return
  }

  t.after(() => {
    try {
      db.close()
    } catch {
      /* ignore */
    }
    fs.rmSync(testDir, { recursive: true, force: true })
  })

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

  function seedAttempt({ examId, name, applicantId = null, score, maxScore = 100, evaluationStatus = null }) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO attempts(id, exam_id, examinee_name, applicant_id, answers_json, score, max_score, started_at, finished_at, evaluation_status)
       VALUES (?,?,?,?, '{}',?,?,?,?,?)`,
    ).run(id, examId, name, applicantId, score, maxScore, now, now, evaluationStatus)
    return id
  }

  const qualifiedName = 'مرشح قرار تجريبي'
  const applicantId = crypto.randomUUID()
  db.prepare(
    `INSERT INTO applicants(id, seq_number, name, created_at, updated_at) VALUES (?,?,?,?,?)`,
  ).run(applicantId, 1, qualifiedName, new Date().toISOString(), new Date().toISOString())

  seedAttempt({ examId: seedExam('theory'), name: qualifiedName, applicantId, score: 88 })
  seedAttempt({ examId: seedExam('oral'), name: qualifiedName, applicantId, score: 84 })
  seedAttempt({ examId: seedExam('driving'), name: qualifiedName, applicantId, score: 81 })
  seedAttempt({ examId: seedExam('personality'), name: qualifiedName, applicantId, score: 79 })

  const qualified = decisionForApplicant(applicantId)
  assert.equal(qualified.status, 'qualified')
  assert.equal(qualified.advisoryOnly, true)
  assert.match(qualified.disclaimerAr, /غير ملزم/)
  assert.equal(qualified.examineeName, qualifiedName)

  const pendingName = 'مرشح معلق قرار'
  seedAttempt({ examId: seedExam('theory'), name: pendingName, score: 90 })
  seedAttempt({ examId: seedExam('oral'), name: pendingName, score: 90 })
  seedAttempt({ examId: seedExam('driving'), name: pendingName, score: 90 })
  seedAttempt({
    examId: seedExam('personality'),
    name: pendingName,
    score: 50,
    evaluationStatus: 'pending',
  })
  const pending = decisionForApplicant(pendingName)
  assert.equal(pending.status, 'incomplete')
  assert.ok(pending.pendingCategories.includes('personality'))

  const lowName = 'مرشح غير مؤهل'
  for (const category of ['theory', 'oral', 'driving', 'personality']) {
    seedAttempt({ examId: seedExam(category), name: lowName, score: 40 })
  }
  const low = decisionForApplicant(lowName)
  assert.equal(low.status, 'not_qualified')
  assert.ok(low.compositePercent < THRESHOLDS.conditionalComposite)
})
