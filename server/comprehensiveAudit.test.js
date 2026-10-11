import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sytest-comprehensive-audit-'))
process.env.EXAM_DATA_DIR = testDir

const { db } = await import('./db.js')
const { isMcqCorrect, scoreAnswers, applyManualEvaluation } = await import('./examLogic.js')
const { extractClientIp } = await import('./networkIp.js')
const { claimRosterByQrToken } = await import('./roster.js')
const { finalResultForApplicant } = await import('./applicants.js')

test.after(() => {
  db.close()
  fs.rmSync(testDir, { recursive: true, force: true })
})

test('MCQ evaluation: single and multiple correct answers', () => {
  // Single choice
  assert.equal(isMcqCorrect('b', 'b'), true)
  assert.equal(isMcqCorrect('b', 'a'), false)
  assert.equal(isMcqCorrect('1', 1), true)

  // Multiple choices
  assert.equal(isMcqCorrect(['a', 'c'], ['a', 'c']), true)
  assert.equal(isMcqCorrect(['a', 'c'], ['c', 'a']), true, 'Order should not matter')
  assert.equal(isMcqCorrect(['a', 'c'], ['a']), false, 'Partial answer is not full correct')
  assert.equal(isMcqCorrect(['a', 'c'], ['a', 'b', 'c']), false, 'Extra wrong choice is incorrect')
  assert.equal(isMcqCorrect(['a', 'c'], 'a'), false)
})

test('Classic questions scoring engine: pending status and manual evaluation lifecycle', () => {
  const questions = [
    {
      id: 'q1',
      type: 'mcq',
      text: 'ما هو بروتوكول نقل الملفات الآمن؟',
      points: 10,
      correctAnswer: 'sftp',
      choices: [{ id: 'ftp', text: 'FTP' }, { id: 'sftp', text: 'SFTP' }],
    },
    {
      id: 'q2',
      type: 'classic',
      text: 'اشرح مبدأ عمل جدار الحماية (Firewall) وأنواعه.',
      points: 20,
      rubric: [
        { criterion: 'شرح المبدأ الأساسي', maxPoints: 10 },
        { criterion: 'ذكر أنواع الجدران النارية', maxPoints: 10 },
      ],
    },
  ]

  // Candidate answers q1 correctly and types open-ended text for q2
  const candidateAnswers = {
    q1: 'sftp',
    q2: 'جدار الحماية يقوم بفحص حزم البيانات وتطبيق قواعد المرور...',
  }

  // 1. Initial automated scoring at submission
  const initial = scoreAnswers(questions, candidateAnswers)
  assert.equal(initial.score, 10, 'Only objective questions scored initially')
  assert.equal(initial.maxScore, 10, 'Max score reflects evaluated objective items')
  assert.equal(initial.needsManualReview, true)

  const classicEval = initial.questionEvaluations.find((e) => e.questionId === 'q2')
  assert.ok(classicEval)
  assert.equal(classicEval.status, 'pending_evaluation')
  assert.equal(classicEval.awardedScore, null)

  // 2. Staff performs manual evaluation on the classic question
  const manualScores = {
    q2: {
      score: 18,
      feedback: 'إجابة ممتازة وشاملة للمبدأ والأنواع الرئيسية',
    },
  }

  const updated = applyManualEvaluation(questions, initial.questionEvaluations, manualScores)
  assert.equal(updated.evaluationStatus, 'completed')
  assert.equal(updated.score, 28, '10 from MCQ + 18 from classic evaluation')
  assert.equal(updated.maxScore, 30)
  assert.equal(updated.percent, 93.3)

  const updatedClassicEval = updated.evaluations.find((e) => e.questionId === 'q2')
  assert.equal(updatedClassicEval.status, 'evaluated')
  assert.equal(updatedClassicEval.awardedScore, 18)
  assert.equal(updatedClassicEval.feedback, 'إجابة ممتازة وشاملة للمبدأ والأنواع الرئيسية')
})

test('Network IP extraction and normalization', () => {
  // Direct IPv4
  const req1 = { socket: { remoteAddress: '192.168.1.105' }, headers: {} }
  assert.equal(extractClientIp(req1), '192.168.1.105')

  // IPv6 mapped IPv4
  const req2 = { socket: { remoteAddress: '::ffff:192.168.1.200' }, headers: {} }
  assert.equal(extractClientIp(req2), '192.168.1.200')

  // Forwarded header (proxy / reverse-proxy)
  const req3 = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '10.20.30.40, 127.0.0.1' },
  }
  assert.equal(extractClientIp(req3), '10.20.30.40')
})

test('QR code verification and detailed error reporting', () => {
  // Non-existent token
  const notFound = claimRosterByQrToken('completely-invalid-token-12345', 'device-abc')
  assert.equal(notFound.ok, false)
  assert.equal(notFound.code, 'TOKEN_NOT_FOUND')

  // Create an inactive exam in DB to test EXAM_INACTIVE
  const examId = 'test-inactive-exam'
  db.prepare(`
    INSERT INTO exams(id, title, category, level, capacity, question_count, username, password_hash, password_plain, question_ids, questions_json, created_at, active)
    VALUES (?, 'اختبار معطل', 'theory', 'engineer', 10, 5, 'internal_inactive_test', '', '', '[]', '[]', datetime('now'), 0)
  `).run(examId)

  const rosterId = 'test-roster-1'
  const qrToken = 'test-qr-token-999'
  db.prepare(`
    INSERT INTO exam_roster(id, exam_id, seq_number, username, password_hash, password_plain, name, qr_token, created_at)
    VALUES (?, ?, 1, 'usr_test_roster_1', 'hash123', 'pass123', 'متدرب اختباري', ?, datetime('now'))
  `).run(rosterId, examId, qrToken)

  const inactiveResult = claimRosterByQrToken(qrToken, 'device-xyz')
  assert.equal(inactiveResult.ok, false)
  assert.equal(inactiveResult.code, 'EXAM_INACTIVE')
})

test('Database schema: migrations applied and fields present', () => {
  const adminCols = db.prepare('PRAGMA table_info(admins)').all().map((c) => c.name)
  assert.ok(adminCols.includes('active'), 'admins table must have active column')

  const accessAccountCols = db.prepare('PRAGMA table_info(access_accounts)').all().map((c) => c.name)
  assert.ok(accessAccountCols.includes('active'), 'access_accounts table must have active column')
  assert.ok(accessAccountCols.includes('specialization'), 'access_accounts table must have specialization column')

  const attemptCols = db.prepare('PRAGMA table_info(attempts)').all().map((c) => c.name)
  assert.ok(attemptCols.includes('client_ip'), 'attempts table must have client_ip column')
  assert.ok(attemptCols.includes('evaluation_status'), 'attempts table must have evaluation_status column')
  assert.ok(attemptCols.includes('question_evaluations_json'), 'attempts table must have question_evaluations_json column')

  const auditCols = db.prepare('PRAGMA table_info(audit_events)').all().map((c) => c.name)
  assert.ok(auditCols.includes('ip_address'), 'audit_events table must have ip_address column')
})

test('Applicant final result engine: pending evaluation handling', () => {
  const applicantId = 'app-pending-test'
  db.prepare(`
    INSERT INTO applicants(id, name, seq_number, created_at, updated_at)
    VALUES (?, 'مرشح تحت التقييم', 999, datetime('now'), datetime('now'))
  `).run(applicantId)

  const examId = 'exam-theory-pending'
  db.prepare(`
    INSERT INTO exams(id, title, category, level, capacity, question_count, username, password_hash, password_plain, question_ids, questions_json, created_at, active)
    VALUES (?, 'نظري هندسي', 'theory', 'engineer', 10, 5, 'internal_theory_test', '', '', '[]', '[]', datetime('now'), 1)
  `).run(examId)

  // Insert attempt with evaluation_status = 'pending'
  db.prepare(`
    INSERT INTO attempts(id, exam_id, examinee_name, applicant_id, answers_json, score, max_score, started_at, finished_at, evaluation_status)
    VALUES ('att-pending-1', ?, 'مرشح تحت التقييم', ?, '{}', 10, 30, datetime('now'), datetime('now'), 'pending')
  `).run(examId, applicantId)

  const result = finalResultForApplicant('مرشح تحت التقييم')
  assert.equal(result.hasPendingEvaluations, true, 'Result should flag pending evaluations')
  assert.equal(result.finalPercent, null, 'Final percent should not be finalized while pending')
  assert.equal(result.pendingCategories.length, 1)
})
