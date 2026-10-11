import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sytest-leadership-briefing-'))
process.env.EXAM_DATA_DIR = testDir

let db
let canViewLeadershipBriefing
let summarizeBankShortages
let BANK_SHORTAGE_THRESHOLD
let buildLeadershipBriefing
let loadError = null

try {
  ;({ db } = await import('./db.js'))
  ;({
    canViewLeadershipBriefing,
    summarizeBankShortages,
    BANK_SHORTAGE_THRESHOLD,
    buildLeadershipBriefing,
  } = await import('./leadershipBriefing.js'))
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

test('canViewLeadershipBriefing allows admin and commander only', (t) => {
  if (loadError) {
    t.skip(`تخطي اختبار قاعدة البيانات: ${loadError.message}`)
    return
  }
  assert.equal(canViewLeadershipBriefing({ role: 'admin' }), true)
  assert.equal(canViewLeadershipBriefing({ role: 'commander' }), true)
  assert.equal(canViewLeadershipBriefing({ role: 'operator' }), false)
  assert.equal(canViewLeadershipBriefing({ role: 'committee_member' }), false)
  assert.equal(canViewLeadershipBriefing(null), false)
})

test('summarizeBankShortages flags titles below threshold in oral/driving/personality', (t) => {
  if (loadError) {
    t.skip(`تخطي اختبار قاعدة البيانات: ${loadError.message}`)
    return
  }
  const questions = []
  for (let i = 0; i < BANK_SHORTAGE_THRESHOLD; i += 1) {
    questions.push({ id: `oral-${i}`, category: 'oral', jobTitles: ['network_engineer'] })
    questions.push({ id: `drv-${i}`, category: 'driving', jobTitles: ['network_engineer'] })
    questions.push({ id: `per-${i}`, category: 'personality', jobTitles: ['network_engineer'] })
  }
  for (let i = 0; i < 5; i += 1) {
    questions.push({ id: `tech-oral-${i}`, category: 'oral', jobTitles: ['technician'] })
  }
  const shortages = summarizeBankShortages(questions)
  const network = shortages.find((row) => row.profileId === 'network_engineer')
  const tech = shortages.find((row) => row.profileId === 'technician')
  assert.equal(network, undefined)
  assert.ok(tech)
  assert.ok(tech.shortCategories.includes('oral'))
  assert.ok(tech.shortCategories.includes('driving'))
  assert.equal(tech.counts.oral, 5)
  assert.equal(tech.counts.driving, 0)
})

test('buildLeadershipBriefing aggregates four statuses and period filter', (t) => {
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

  function seedApplicant(seq, name, extra = {}) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO applicants(id, seq_number, name, org, job_title, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(id, seq, name, extra.org || null, extra.jobTitle || null, now, now)
    return id
  }

  function seedAttempt({ examId, name, applicantId = null, score, maxScore = 100, evaluationStatus = null, finishedAt }) {
    const id = crypto.randomUUID()
    const finished = finishedAt || new Date().toISOString()
    db.prepare(
      `INSERT INTO attempts(id, exam_id, examinee_name, applicant_id, answers_json, score, max_score, started_at, finished_at, evaluation_status)
       VALUES (?,?,?,?, '{}',?,?,?,?,?)`,
    ).run(id, examId, name, applicantId, score, maxScore, finished, finished, evaluationStatus)
    return id
  }

  function seedFour({ name, seq, scores, org, jobTitle, finishedAt, pendingCategory = null }) {
    const applicantId = seedApplicant(seq, name, { org, jobTitle })
    for (const category of ['theory', 'oral', 'driving', 'personality']) {
      seedAttempt({
        examId: seedExam(category),
        name,
        applicantId,
        score: scores[category],
        finishedAt,
        evaluationStatus: pendingCategory === category ? 'pending' : null,
      })
    }
    return applicantId
  }

  const recent = new Date().toISOString()
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()

  seedFour({
    name: 'مؤهل حديث',
    seq: 1,
    scores: { theory: 80, oral: 78, driving: 76, personality: 82 },
    org: 'إدارة التقنية',
    jobTitle: 'مهندس شبكات',
    finishedAt: recent,
  })
  seedFour({
    name: 'مشروط حديث',
    seq: 2,
    scores: { theory: 70, oral: 68, driving: 66, personality: 64 },
    org: 'إدارة التقنية',
    jobTitle: 'مهندس شبكات',
    finishedAt: recent,
  })
  seedFour({
    name: 'غير مؤهل حديث',
    seq: 3,
    scores: { theory: 50, oral: 55, driving: 40, personality: 45 },
    org: 'العمليات',
    jobTitle: 'فني حاسب آلي',
    finishedAt: recent,
  })
  const incompleteId = seedApplicant(4, 'غير مكتمل حديث', { org: 'العمليات', jobTitle: 'فني حاسب آلي' })
  seedAttempt({
    examId: seedExam('theory'),
    name: 'غير مكتمل حديث',
    applicantId: incompleteId,
    score: 90,
    finishedAt: recent,
  })
  seedFour({
    name: 'معلّق تقييم',
    seq: 5,
    scores: { theory: 90, oral: 90, driving: 90, personality: 50 },
    org: 'العمليات',
    jobTitle: 'فني حاسب آلي',
    finishedAt: recent,
    pendingCategory: 'personality',
  })
  seedFour({
    name: 'مؤهل قديم',
    seq: 6,
    scores: { theory: 88, oral: 84, driving: 81, personality: 79 },
    org: 'إدارة التقنية',
    jobTitle: 'مهندس شبكات',
    finishedAt: old,
  })

  const all = buildLeadershipBriefing({ period: 'all', bankQuestions: [] })
  assert.equal(all.kpis.applicantCount, 6)
  assert.equal(all.decisions.qualified, 2)
  assert.equal(all.decisions.conditional, 1)
  assert.equal(all.decisions.not_qualified, 1)
  assert.equal(all.decisions.incomplete, 2)
  assert.equal(all.kpis.completeFour, 4)
  assert.equal(all.kpis.pendingManual, 1)
  assert.ok(all.kpis.inProgress >= 1)
  assert.ok(all.kpis.activeExams >= 1)
  assert.equal(all.advisoryOnly, true)
  assert.equal(canViewLeadershipBriefing({ role: 'operator' }), false)

  const jobTech = all.byJob.find((row) => row.label === 'مهندس شبكات')
  assert.ok(jobTech)
  assert.equal(jobTech.applicantCount, 3)

  const incomplete = all.people.find((row) => row.name === 'غير مكتمل حديث')
  assert.ok(incomplete)
  assert.ok(incomplete.categoryPercents.theory)
  assert.ok(incomplete.missingCategories.includes('oral'))
  assert.equal(incomplete.adoption, null)
  assert.ok(all.defaultThresholds.qualifiedComposite)

  const attemptCount = db.prepare('SELECT COUNT(*) AS c FROM attempts').get().c
  const attemptScoreSum = db.prepare('SELECT SUM(score) AS s FROM attempts').get().s
  buildLeadershipBriefing({ period: 'all', bankQuestions: [] })
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM attempts').get().c, attemptCount)
  assert.equal(db.prepare('SELECT SUM(score) AS s FROM attempts').get().s, attemptScoreSum)

  const last30 = buildLeadershipBriefing({ period: '30d', bankQuestions: [] })
  assert.equal(last30.kpis.applicantCount, 5)
  assert.equal(last30.decisions.qualified, 1)
  assert.equal(last30.decisions.incomplete, 2)
  assert.equal(
    last30.people.some((row) => row.name === 'مؤهل قديم'),
    false,
  )
})
