import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { createCommitteeService } from './committees.js'
import { createEvaluationService, weightedQuestionPercent } from './evaluationSessions.js'
import { createMonitoringStore } from './monitoring.js'

const schema = readFileSync(new URL('./db.js', import.meta.url), 'utf8').match(/db\.exec\(`([\s\S]*?)`\)/)[1]
const admin = { role: 'admin', username: 'admin', label: 'المسؤول' }
function fixture(t, committee = false, category = 'oral', configuredMode = null) {
  const db = new Database(':memory:'); t.after(() => db.close()); db.exec(schema); db.pragma('foreign_keys=ON')
  for (const name of ['display_id', 'org', 'job_title', 'rank']) db.exec('ALTER TABLE exam_roster ADD COLUMN ' + name + ' TEXT')
  const committees = createCommitteeService(db), monitoring = createMonitoringStore(db)
  db.prepare("INSERT INTO exams(id,title,category,level,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at) VALUES ('exam','اختبار',?,'engineer',2,3,'test','','','[]','[]','2026-09-13')").run(category)
  for (const id of ['one', 'two']) db.prepare("INSERT INTO exam_roster(id,exam_id,seq_number,name,username,password_hash,password_plain,qr_token,created_at,job_title) VALUES (?,'exam',1,?,?,'','',?,'2026-09-13','مهندس شبكات')").run(id, id, id, id.padEnd(45, 'x'))
  const sample = [{ id: 'bank-1', category, text: 'سؤال من البنك', type: category === 'personality' ? 'scale' : 'oral', answerKey: 'إجابة سرية', rubric: [{ criterion: 'معيار سري', maxPoints: 2 }], points: 2, trait: 'دقة', difficulty: 'medium' }]
  const jobExams = { isJobBased: () => true, evaluationMode: () => configuredMode, questionsFor: () => structuredClone(sample) }
  let clock = Date.parse('2026-09-13T12:00:00Z')
  const service = createEvaluationService(db, { jobExams, committees, monitoring, now: () => clock, assertExamAccess: (u, e) => ['admin', 'commander'].includes(u.role) || (u.role === 'operator' && u.category === e.category) })
  let manager, member, committeeId, assignmentId
  if (committee) {
    const password = 'Testing-pass-123'
    committeeId = committees.create(admin, { name: 'لجنة', managerName: 'المدير', username: 'manager', password }).id
    manager = committees.login('manager', password)
    const old = committees.detail(manager, committeeId)
    committees.saveMembers(manager, committeeId, { revision: old.revision, members: [{ ...old.members[0], weight: 60 }, { name: 'عضو', username: 'member', password, active: true, weight: 40 }] })
    manager = committees.login('manager', password); member = committees.login('member', password)
    committees.assign(admin, committeeId, 'exam'); assignmentId = committees.detail(manager, committeeId).assignments[0].id
  }
  const examinee = { role: 'examinee', examId: 'exam', rosterId: 'one', examineeName: 'one' }
  function ready(user = admin, mode = 'manual', name = 'one') {
    let s = service.create(user, 'exam', { name, mode })
    const qs = mode === 'manual' ? [1, 2, 3].map((weight, i) => ({ text: 'سؤال ' + i, weight: i === 2 ? 1 : weight, status: 'approved' })) : s.questions.map((q) => ({ ...q, status: 'approved' }))
    return service.save(user, s.id, { version: s.version, questions: qs, ready: true })
  }
  function grade(user, s, value = 8) { return service.grade(user, s.id, { version: s.version, grades: s.questions.filter((q) => q.status === 'approved').map((q) => ({ id: q.id, grade: value, answer: 'إجابة المتقدم' })) }) }
  return { db, service, monitoring, committees, manager, member, assignmentId, committeeId, examinee, ready, grade, advance: (ms) => { clock += ms } }
}
test('8,7,9 with weights 1,2,1 produces 77.5; excluded questions never count', () => {
  const qs = [8, 7, 9].map((grade, i) => ({ grade, weight: [1, 2, 1][i], status: 'approved' }))
  assert.equal(weightedQuestionPercent([...qs, { grade: 0, weight: 100, status: 'excluded' }]), 77.5)
  for (const grade of ['', null, -1, 11, NaN]) assert.throws(() => weightedQuestionPercent([{ grade, weight: 1, status: 'approved' }]))
  assert.throws(() => weightedQuestionPercent([{ grade: 8, weight: 0, status: 'approved' }]))
})
test('proposals must be approved; excluded/deleted snapshots and audit survive changes', (t) => {
  const f = fixture(t), s = f.service.create(admin, 'exam', { name: 'one', mode: 'suggested' })
  assert.equal(s.questions[0].status, 'proposed')
  assert.throws(() => f.grade(admin, s), /اعتمد/)
  assert.throws(() => f.service.save(admin, s.id, { version: s.version, questions: s.questions, ready: true }), /اعتمد/)
  const ready = f.service.save(admin, s.id, { version: s.version, questions: s.questions.map((q) => ({ ...q, status: 'approved', text: 'نسخة معدلة' })), ready: true })
  assert.equal(ready.questions[0].text, 'نسخة معدلة')
  assert.throws(() => f.service.save(admin, s.id, { version: s.version, questions: [] }), /تغير/)
  const removed = f.service.save(admin, s.id, { version: ready.version, questions: [] })
  assert.equal(removed.questions[0].status, 'excluded')
  assert.equal(removed.history.length, 3)
})
test('interview checkpoint survives a reload and is cleared only after an explicit save', (t) => {
  const f = fixture(t), session = f.service.create(admin, 'exam', { name: 'one', mode: 'manual' })
  const draft = [{ id: 'draft-question', text: 'سؤال محفوظ تلقائيًا', answerKey: 'الإجابة', weight: 1, status: 'approved', grade: 8, answer: 'إجابة المتقدم' }]
  const saved = f.service.checkpoint(admin, session.id, { version: session.version, questions: draft, editing: true })
  assert.ok(saved.checkpointAt)
  const restored = f.service.view(admin, session.id)
  assert.equal(restored.hasCheckpoint, true)
  assert.equal(restored.checkpointEditing, true)
  assert.equal(restored.questions[0].answer, 'إجابة المتقدم')
  const committed = f.service.save(admin, session.id, { version: session.version, questions: [...draft, { id: 'blank', text: '   ', status: 'excluded', weight: 1 }] })
  assert.equal(committed.hasCheckpoint, false)
  assert.equal(committed.questions.some((q) => q.id === 'blank'), false)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM evaluation_session_checkpoints').get().n, 0)
})
test('the execution mode selected during exam creation is shown and cannot be replaced in the evaluation session', (t) => {
  const f = fixture(t, false, 'oral', 'qr')
  assert.equal(f.service.list(admin, 'exam').defaultMode, 'qr')
  assert.throws(() => f.service.create(admin, 'exam', { name:'one', mode:'interview' }), /المحدد عند إنشاء/)
  assert.equal(f.service.create(admin, 'exam', { name:'one', mode:'qr' }).mode, 'qr')
})
for (const category of ['oral', 'driving', 'personality']) test(category + ': single evaluator publishes atomically into existing results and archive', (t) => {
  const f = fixture(t, false, category)
  const scored = f.grade(admin, f.ready())
  assert.equal(scored.percent, 80)
  const published = f.service.publish(admin, scored.id, { version: scored.version })
  assert.equal(published.finalized, true)
  assert.equal(f.db.prepare('SELECT score FROM attempts').get().score, 80)
  const archived = JSON.parse(f.db.prepare('SELECT detail_json FROM assessment_archive').get().detail_json)
  assert.equal(archived.mode, 'manual'); assert.equal(archived.questions.length, 3)
  assert.equal(archived.questions[0].grade, 8)
  assert.throws(() => f.grade(admin, published), /معتمد/)
  assert.throws(() => f.service.publish(admin, scored.id, { version: scored.version }), /معتمد/)
})
test('an archive failure rolls back result publication', (t) => {
  const f = fixture(t), s = f.grade(admin, f.ready())
  f.db.exec("CREATE TRIGGER break_archive BEFORE INSERT ON assessment_archive BEGIN SELECT RAISE(ABORT, 'archive failed'); END")
  assert.throws(() => f.service.publish(admin, s.id, { version: s.version }), /archive failed/)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM attempts').get().n, 0)
  assert.equal(f.service.view(admin, s.id).status, 'scored')
})
test('committee members have independent questions, grades, permissions and weighted final publication', (t) => {
  const f = fixture(t, true)
  const a = f.ready(f.manager), b = f.ready(f.member, 'interview')
  assert.notEqual(a.questions[0].id, b.questions[0].id)
  assert.throws(() => f.service.view(f.member, a.id), /مستقل/)
  assert.throws(() => f.service.save(f.manager, b.id, { version: b.version, questions: [] }), /الشخصي/)
  assert.throws(() => f.committees.score(f.member, f.assignmentId, { examineeName: 'one', percent: 99 }), /أسئلة/)
  f.grade(f.manager, a, 9); const gradedMember = f.grade(f.member, b, 7)
  f.committees.score(f.member, f.assignmentId, { examineeName: 'one', percent: 100 })
  assert.equal(f.committees.evaluations(f.member, f.assignmentId).scores[0].percent, 70)
  const state = f.committees.detail(f.manager, f.committeeId), data = f.committees.evaluations(f.manager, f.assignmentId)
  const result = f.committees.publish(f.manager, f.assignmentId, { examineeName: 'one', revision: state.revision, scoreVersion: data.candidates.find((c) => c.name === 'one').scoreVersion })
  assert.equal(result.percent, 82)
  assert.equal(JSON.parse(f.db.prepare('SELECT detail_json FROM assessment_archive').get().detail_json).evaluationSessions.length, 2)
  assert.throws(() => f.grade(f.member, gradedMember), /معتمد/)
})
test('QR joins independently approved member questions and freezes them, without publishing grades', (t) => {
  const f = fixture(t, true)
  const a = f.ready(f.manager, 'qr'), b = f.ready(f.member, 'qr')
  assert.equal(f.service.qrReady('one'), true)
  const started = f.service.startRun(f.examinee)
  assert.equal(started.questions.length, 2)
  assert.throws(() => f.service.save(f.member, b.id, { version: b.version, questions: b.questions, ready: true }), /أصبحت/)
  assert.throws(() => f.service.progress(f.examinee, { answers: { stranger: 'answer' } }), /غير صالحة/)
  const answers = Object.fromEntries(started.questions.map((q) => [q.id, 'إجابة خاصة']))
  f.service.progress(f.examinee, { answers, questionIndex: 1 })
  const resumed = f.service.runView(f.examinee)
  assert.equal(resumed.run.questionIndex, 1)
  assert.equal(resumed.run.startedAt, started.run.startedAt)
  assert.deepEqual(resumed.run.answers, answers)
  f.service.progress(f.examinee, { answers }, true)
  assert.equal(f.service.view(f.manager, a.id).questions[0].answer, 'إجابة خاصة')
  assert.equal(f.service.view(f.member, b.id).questions.length, 1)
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM attempts').get().n, 0)
})
test('server deadline survives reload and late submissions cannot alter saved answers', (t) => {
  const f = fixture(t), s = f.ready(admin, 'qr')
  const started = f.service.startRun(f.examinee)
  assert.ok(started.run.secondsLeft >= 300)
  f.service.progress(f.examinee, { answers: { [s.questions[0].id]: 'قبل انتهاء الوقت' } })
  f.advance((started.run.secondsLeft + 1) * 1000)
  f.service.progress(f.examinee, { answers: { [s.questions[0].id]: 'متأخر' } }, true)
  assert.equal(f.service.runView(f.examinee).run.answers[s.questions[0].id], 'قبل انتهاء الوقت')
  assert.equal(f.service.runView(f.examinee).run.status, 'submitted')
})
test('monitor events are persistent, deduplicated, bounded and carry actual reported state', (t) => {
  const f = fixture(t)
  const s = { sessionId: 'exam:one', examId: 'exam', rosterId: 'one', examineeName: 'one', connected: true, monitoringStatus: 'unavailable' }
  f.monitoring.record(s, 'screen_unavailable', undefined, 'event1')
  f.monitoring.record(s, 'screen_unavailable', undefined, 'event1')
  f.monitoring.record({ ...s, connected: false }, 'disconnected', 3000)
  assert.equal(f.monitoring.record(s, 'definite_cheating'), null)
  const rows = f.monitoring.list('exam', 'one')
  assert.equal(rows.length, 2); assert.equal(rows[0].state.monitoringStatus, 'unavailable'); assert.equal(rows[1].durationMs, 3000)
})

test('legacy central-candidate evaluation keeps its roster workflow and enrolls only the selected person', (t) => {
  const f = fixture(t, false, 'driving')
  f.db.prepare('DELETE FROM exam_roster').run()
  const people = [{ id: 'a', name: 'A', jobTitle: 'مهندس شبكات' }, { id: 'b', name: 'B', jobTitle: 'مبرمج' }]
  const service = createEvaluationService(f.db, { committees: f.committees, monitoring: f.monitoring, assertExamAccess: () => true,
    jobExams: { isJobBased: () => false }, listApplicants: () => people, insertExamRoster: (examId, rows) => rows.map((r) => {
      f.db.prepare("INSERT INTO exam_roster(id,exam_id,seq_number,name,username,password_hash,password_plain,qr_token,created_at,job_title) VALUES (?,?,1,?,?,'','',?,'now',?)").run(r.id, examId, r.name, r.id, r.id.padEnd(45, 'x'), r.jobTitle)
      return r
    }) })
  assert.equal(service.list(admin, 'exam').roster.length, 2)
  service.create(admin, 'exam', { name: 'A', mode: 'manual' })
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM exam_roster').get().n, 1)
  assert.equal(service.list(admin, 'exam').roster.length, 2)
})
