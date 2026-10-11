import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { createExamRunService } from './examRuns.js'

const schema = readFileSync(new URL('./db.js', import.meta.url), 'utf8').match(/db\.exec\(`([\s\S]*?)`\)/)[1]

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close()); db.exec(schema)
  for (const [name, type] of [['qr_session_id','TEXT'],['qr_device_id','TEXT'],['display_id','TEXT'],['org','TEXT'],['job_title','TEXT'],['rank','TEXT']]) db.exec(`ALTER TABLE exam_roster ADD COLUMN ${name} ${type}`)
  db.prepare("INSERT INTO exams(id,title,category,level,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at,active) VALUES('e','نظري','theory','technician',1,1,'e','','','[]','[]','now',1)").run()
  db.prepare("INSERT INTO exam_roster(id,exam_id,seq_number,applicant_id,name,username,password_hash,password_plain,qr_token,used,created_at,qr_session_id,qr_device_id) VALUES('r','e',1,'p','مرشح','u','','','q',1,'now','session','device')").run()
  const questions = [{ id:'q1', type:'mcq', text:'؟', choices:['أ','ب'], correctAnswer:'أ', points:10 }]
  const jobExams = {
    questionsFor: () => questions,
    validateAnswers: (_exam, qs, answers) => { for (const key of Object.keys(answers)) if (!qs.some((q) => q.id === key)) throw Error('إجابة دخيلة') },
    scoreSubmission: (_exam, _qs, answers) => ({ score: answers.q1 === 'أ' ? 10 : 0, maxScore:10, correctCount: answers.q1 === 'أ' ? 1 : 0, objectiveCount:1 }),
  }
  let clock = Date.parse('2026-01-01T00:00:00Z')
  const service = createExamRunService(db, { jobExams, now: () => clock })
  const user = { role:'examinee', examId:'e', rosterId:'r', examineeName:'مرشح', sessionId:'session' }
  return { db, service, user, advance: (ms) => { clock += ms }, restart: () => createExamRunService(db, { jobExams, now: () => clock }) }
}

test('standard runs keep server time, reject stale progress and submit idempotently', (t) => {
  const { db, service, user } = fixture(t)
  const started = service.start(user, 'device')
  assert.equal(started.run.revision, 0)
  const saved = service.progress(user, { revision:0, answers:{ q1:'أ' }, questionIndex:0 })
  assert.equal(saved.run.revision, 1)
  assert.throws(() => service.progress(user, { revision:0, answers:{ q1:'ب' } }), { status:409 })
  const first = service.submit(user, { revision:1, answers:{}, submissionKey:'submit-once' })
  const second = service.submit(user, { submissionKey:'submit-once' })
  assert.equal(first.revealScore, true)
  assert.equal(first.percent, 100)
  assert.equal(second.revealScore, true)
  assert.equal(second.percent, 100)
  assert.equal(second.attemptId, first.attemptId)
  assert.equal(second.alreadySubmitted, true)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM assessment_archive').get().n, 1)
})

test('expired standard run ignores late answers and finalizes saved state', (t) => {
  const { db, service, user, advance } = fixture(t)
  const started = service.start(user, 'device')
  assert.ok(started.run.secondsLeft >= 60)
  service.progress(user, { revision:0, answers:{ q1:'أ' } })
  advance((started.run.secondsLeft + 1) * 1000)
  const result = service.submit(user, { answers:{ q1:'ب' }, submissionKey:'late' })
  assert.equal(result.ok, true)
  assert.equal(db.prepare('SELECT score FROM attempts').get().score, 10)
})

test('saved QR progress and the authoritative deadline survive a server interruption', (t) => {
  const { service, user, advance, restart } = fixture(t)
  const started = service.start(user,'device')
  service.progress(user,{ revision:0,answers:{ q1:'أ' },questionIndex:0 })
  advance(20_000)
  const recovered = restart().view(user)
  assert.equal(recovered.run.deadlineAt,started.run.deadlineAt)
  assert.equal(recovered.run.answers.q1,'أ')
  assert.equal(recovered.run.revision,1)
  assert.ok(recovered.run.secondsLeft > 0)
})

test('job exam durationMinutes overrides default per-question timing', (t) => {
  const db = new Database(':memory:'); t.after(() => db.close()); db.exec(schema)
  for (const [name, type] of [['qr_session_id','TEXT'],['qr_device_id','TEXT'],['display_id','TEXT'],['org','TEXT'],['job_title','TEXT'],['rank','TEXT']]) db.exec(`ALTER TABLE exam_roster ADD COLUMN ${name} ${type}`)
  db.prepare("INSERT INTO exams(id,title,category,level,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at,active) VALUES('e','شفهي','oral','technician',1,10,'e','','','[]','[]','now',1)").run()
  db.prepare("INSERT INTO exam_roster(id,exam_id,seq_number,applicant_id,name,username,password_hash,password_plain,qr_token,used,created_at,qr_session_id,qr_device_id) VALUES('r','e',1,'p','مرشح','u','','','q',1,'now','session','device')").run()
  const questions = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, type: 'oral', text: '؟', points: 10 }))
  const jobExams = {
    configOf: () => ({ durationMinutes: 25 }),
    questionsFor: () => questions,
    validateAnswers: () => {},
    scoreSubmission: () => ({ score: 0, maxScore: 0, correctCount: 0, objectiveCount: 0 }),
  }
  const clock = Date.parse('2026-01-01T00:00:00Z')
  const service = createExamRunService(db, { jobExams, now: () => clock })
  const user = { role: 'examinee', examId: 'e', rosterId: 'r', examineeName: 'مرشح', sessionId: 'session' }
  const started = service.start(user, 'device')
  assert.equal(started.run.secondsLeft, 25 * 60)
})
