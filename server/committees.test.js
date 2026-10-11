import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import express from 'express'
import { createCommitteeService, attachCommitteeRoutes, attachCommitteeProtection, seedManagedCommittee, ensureOperatorCommittees } from './committees.js'
import { createJobExamService } from './jobExams.js'

// Fixtures use a fresh in-memory database; the application's real database is never opened.
const schema = readFileSync(new URL('./db.js', import.meta.url), 'utf8').match(/db\.exec\(`([\s\S]*?)`\)/)[1]
const password = 'Committee-test-123'
function fixture(t) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.exec(schema)
  for (const name of ['display_id', 'org', 'job_title', 'rank']) db.exec(`ALTER TABLE exam_roster ADD COLUMN ${name} TEXT`)
  const service = createCommitteeService(db)
  const admin = { role: 'admin', username: 'admin' }
  const committee = seedManagedCommittee(db, {
    name: 'لجنة الاختبار',
    managerName: 'أحمد',
    username: 'manager',
    password,
    category: 'oral',
    oralRole: 'technician',
  })
  let manager = service.login('manager', password)
  const initial = service.detail(manager, committee.id)
  service.saveMembers(manager, committee.id, { revision: initial.revision, members: [
    { ...initial.members[0], weight: 40 },
    { name: 'محمد', username: 'member_one', password, active: true, weight: 30 },
    { name: 'خالد', username: 'member_two', password, active: true, weight: 30 },
  ] })
  manager = service.login('manager', password)
  const member1 = service.login('member_one', password), member2 = service.login('member_two', password)
  db.prepare(`INSERT INTO exams(id,title,category,level,oral_role,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at,active)
    VALUES ('exam','اختبار اللجنة','oral','engineer','technician',2,1,'exam_user','','','[]','[]','2026-09-13',1)`).run()
  for (const [id, name] of [['candidate1', 'المتقدم الأول'], ['candidate2', 'المتقدم الثاني']]) db.prepare(`INSERT INTO exam_roster(id,exam_id,seq_number,name,username,password_hash,password_plain,qr_token,created_at)
    VALUES (?,'exam',1,?,?,'','',?,'2026-09-13')`).run(id, name, id, `qr-${id}`)
  service.assign(admin, committee.id, 'exam')
  const assignmentId = service.detail(manager, committee.id).assignments[0].id
  const name = 'المتقدم الأول'
  const publishBody = () => ({ examineeName: name, revision: service.detail(manager, committee.id).revision,
    scoreVersion: service.evaluations(manager, assignmentId).candidates.find((row) => row.name === name).scoreVersion })
  const fillScores = () => { for (const [user, percent] of [[manager, 90], [member1, 80], [member2, 70]]) service.score(user, assignmentId, { examineeName: name, percent }) }
  return { db, service, admin, committee, manager, member1, member2, assignmentId, name, publishBody, fillScores }
}

test('adopting a grade replaces a pending QR submission instead of blocking on it', (t) => {
  const f = fixture(t)
  f.db.prepare(`INSERT INTO attempts(id,exam_id,examinee_name,answers_json,score,max_score,started_at,finished_at)
    VALUES ('prior','exam',?,'{"q":"answer"}',0,0,'2026-09-13','2026-09-13')`).run(f.name)
  f.fillScores()
  assert.equal(f.service.publish(f.manager, f.assignmentId, f.publishBody()).percent, 81)
  const attempt = f.db.prepare('SELECT id, score, max_score, answers_json FROM attempts').get()
  assert.equal(attempt.id, 'prior')
  assert.equal(attempt.score, 81)
  assert.equal(attempt.max_score, 100)
  assert.match(attempt.answers_json, /answer/)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 1)
  assert.equal(f.db.prepare('SELECT percent FROM committee_results').get().percent, 81)
  assert.equal(f.db.prepare('SELECT percent FROM assessment_archive').get().percent, 81)
})

test('weighted 40/30/30 example produces 81 and atomically writes attempt, archive and snapshot', (t) => {
  const f = fixture(t); f.fillScores()
  assert.equal(f.service.publish(f.manager, f.assignmentId, f.publishBody()).percent, 81)
  assert.equal(f.db.prepare('SELECT score FROM attempts').get().score, 81)
  const archive = f.db.prepare('SELECT * FROM assessment_archive').get()
  assert.equal(archive.percent, 81)
  assert.deepEqual(JSON.parse(archive.detail_json).members.map((member) => member.contribution), [36, 24, 21])
  assert.equal(f.db.prepare("SELECT used FROM exam_roster WHERE id='candidate1'").get().used, 1)
  assert.throws(() => f.service.publish(f.manager, f.assignmentId, f.publishBody()), /اعتمدت/)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 1)
})

test('invalid weights, missing members and stale versions cannot partially save', (t) => {
  const f = fixture(t), initial = f.service.detail(f.manager, f.committee.id)
  for (const weight of [39, 41, -1, 100.001, NaN, null, '40']) {
    const members = initial.members.map((member, index) => index ? member : { ...member, name: 'لا تحفظ', weight })
    assert.throws(() => f.service.saveMembers(f.manager, f.committee.id, { revision: initial.revision, members }))
  }
  assert.throws(() => f.service.saveMembers(f.manager, f.committee.id, { revision: initial.revision, members: [initial.members[0]] }))
  assert.throws(() => f.service.saveMembers(f.manager, f.committee.id, { revision: 0, members: initial.members }), /تغيرت/)
  assert.deepEqual(f.service.detail(f.manager, f.committee.id).members, initial.members)
  assert.equal(f.service.detail(f.manager, f.committee.id).revision, initial.revision)
})

test('manager/member permissions and ownership are enforced on the server', (t) => {
  const f = fixture(t)
  const other = seedManagedCommittee(f.db, {
    name: 'لجنة أخرى',
    managerName: 'مدير آخر',
    username: 'other_manager',
    password,
    category: 'driving',
  })
  assert.throws(() => f.service.detail(f.manager, other.id), /صلاحية/)
  assert.throws(() => f.service.saveMembers(f.member1, f.committee.id, {}), /صلاحية/)
  assert.throws(() => f.service.assign(f.manager, f.committee.id, 'exam'), { status: 403 })
  assert.throws(() => f.service.publish(f.member1, f.assignmentId, {}), /صلاحية/)
  assert.throws(() => f.service.score(f.admin, f.assignmentId, {}), /حساب عضو/)
  assert.throws(() => f.service.list({ role: 'operator' }), /صلاحية/)
  const initial = f.service.detail(f.manager, f.committee.id)
  const foreign = f.service.detail(f.admin, other.id).members[0]
  assert.throws(() => f.service.saveMembers(f.manager, f.committee.id, { revision: initial.revision, members: [...initial.members, { ...foreign, weight: 0 }] }), /غير تابع/)
})

test('oral, driving and personality operators can form and lead one committee limited to their assessment scope', (t) => {
  const f = fixture(t)
  const oralOwner = { role:'operator', id:30, username:'oral_net', label:'مسؤول شفهي الشبكات', category:'oral', oralRole:'network_engineer' }
  const owned = f.service.list(oralOwner)
  assert.equal(owned.length, 1)
  assert.equal(owned[0].owner_username, 'oral_net')
  const committee = { id: owned[0].id }
  assert.throws(() => f.service.create(oralOwner, { name:'لجنة ثانية' }), /بالفعل/)
  const initial = f.service.detail(oralOwner, committee.id)
  assert.ok(initial.members.some((m) => m.username === 'oral_net' && m.externalOwner))
  const ownerMember = initial.members.find((m) => m.externalOwner)
  f.service.saveMembers(oralOwner, committee.id, { revision:initial.revision, members:[
    { ...ownerMember, weight:60 },
    { name:'عضو الشبكات', username:'network_member', password, active:true, weight:40 },
  ] })
  const member = f.service.login('network_member', password)
  f.db.prepare(`INSERT INTO exams(id,title,category,level,oral_role,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at)
    VALUES ('owner-exam','مقابلة شبكات','oral','engineer','network_engineer',1,1,'owner_exam','','','[]','[]','2026-09-13')`).run()
  f.db.prepare(`INSERT INTO exam_roster(id,exam_id,seq_number,name,username,password_hash,password_plain,qr_token,created_at)
    VALUES ('owner-candidate','owner-exam',1,'مرشح اللجنة','owner_candidate','','','owner_qr','2026-09-13')`).run()
  f.service.assign(oralOwner, committee.id, 'owner-exam')
  const assignment = f.service.detail(oralOwner, committee.id).assignments[0]
  f.service.score(oralOwner, assignment.id, { examineeName:'مرشح اللجنة', percent:90 })
  f.service.score(member, assignment.id, { examineeName:'مرشح اللجنة', percent:80 })
  const state = f.service.evaluations(oralOwner, assignment.id)
  assert.equal(state.scores.find((score) => score.accountId === 'operator:oral_net').percent, 90)
  const revision = f.service.detail(oralOwner, committee.id).revision
  const scoreVersion = state.candidates[0].scoreVersion
  assert.equal(f.service.publish(oralOwner, assignment.id, { examineeName:'مرشح اللجنة', revision, scoreVersion }).percent, 86)

  f.db.prepare(`INSERT INTO exams(id,title,category,level,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at)
    VALUES ('wrong-category','قيادة','driving','engineer',1,1,'wrong_category','','','[]','[]','2026-09-13')`).run()
  assert.throws(() => f.service.assign(oralOwner, committee.id, 'wrong-category'), /لا يطابق/)
  assert.throws(() => f.service.detail({ ...oralOwner, username:'oral_prog', oralRole:'programmer' }, committee.id), /صلاحية/)
  assert.throws(() => f.service.create({ role:'operator',username:'theory',category:'theory' }, { name:'لجنة نظري' }), /أنشأت لجنة|بالفعل/)
  assert.ok(f.service.list({ role:'operator',username:'theory',category:'theory' }).some((c) => c.owner_username === 'theory'))

  for (const category of ['driving','personality']) {
    const owner = { role:'operator',id:category,username:'owner_' + category,label:'مسؤول ' + category,category,oralRole:null }
    const created = f.service.create(owner,{ name:'لجنة ' + category })
    assert.equal(f.service.detail(owner,created.id).category,category)
  }
})

test('all active members must grade; 0 is a real score and blanks/invalid scores are rejected', (t) => {
  const f = fixture(t)
  f.service.score(f.manager, f.assignmentId, { examineeName: f.name, percent: 90 })
  assert.throws(() => f.service.publish(f.manager, f.assignmentId, f.publishBody()), /لم يسجل/)
  for (const percent of ['', null, undefined, '50', -1, 101, NaN, 1.001]) assert.throws(() => f.service.score(f.member1, f.assignmentId, { examineeName: f.name, percent }))
  for (const member of [f.member1, f.member2]) f.service.score(member, f.assignmentId, { examineeName: f.name, percent: 0 })
  assert.equal(f.service.publish(f.manager, f.assignmentId, f.publishBody()).percent, 36)
})

test('member scores cannot impersonate another member, reveal peer scores or grade outsiders', (t) => {
  const f = fixture(t); f.fillScores()
  f.service.score(f.member1, f.assignmentId, { examineeName: f.name, percent: 95, accountId: f.manager.id })
  const visible = f.service.evaluations(f.member1, f.assignmentId).scores
  assert.equal(visible.length, 1); assert.equal(visible[0].percent, 95)
  assert.equal(f.service.evaluations(f.manager, f.assignmentId).scores.find((row) => row.accountId === f.manager.id).percent, 90)
  assert.throws(() => f.service.score(f.member1, f.assignmentId, { examineeName: 'خارج القائمة', percent: 90 }), /غير مسجل/)
})

test('disabled accounts and password changes invalidate existing tokens', (t) => {
  const f = fixture(t), initial = f.service.detail(f.manager, f.committee.id)
  const members = initial.members.map((member) => member.id === f.member2.id ? { ...member, active: false, weight: 0 } : { ...member, weight: member.id === f.manager.id ? 60 : 40 })
  f.service.saveMembers(f.manager, f.committee.id, { revision: initial.revision, members })
  assert.equal(f.service.login('member_two', password), null)
  assert.throws(() => f.service.evaluations(f.member2, f.assignmentId), /جلسة/)
  f.service.score(f.manager, f.assignmentId, { examineeName: f.name, percent: 90 })
  f.service.score(f.member1, f.assignmentId, { examineeName: f.name, percent: 80 })
  assert.equal(f.service.publish(f.manager, f.assignmentId, f.publishBody()).percent, 86)
  const next = f.service.detail(f.manager, f.committee.id)
  f.service.saveMembers(f.manager, f.committee.id, { revision: next.revision, members: next.members.map((member) => member.id === f.member1.id ? { ...member, password: 'Changed-pass-123' } : member) })
  assert.throws(() => f.service.resolve(f.member1), /جلسة/)
  assert.ok(f.service.login('member_one', 'Changed-pass-123'))
})

test('published snapshots remain unchanged when member weights change', (t) => {
  const f = fixture(t); f.fillScores(); f.service.publish(f.manager, f.assignmentId, f.publishBody())
  const initial = f.service.detail(f.manager, f.committee.id)
  f.service.saveMembers(f.manager, f.committee.id, { revision: initial.revision, members: initial.members.map((member) => ({ ...member, weight: member.id === f.manager.id ? 60 : 20 })) })
  const final = f.service.evaluations(f.manager, f.assignmentId).results[0]
  assert.equal(final.percent, 81); assert.deepEqual(final.snapshot.map((row) => row.weight), [40, 30, 30])
  assert.throws(() => f.service.score(f.member1, f.assignmentId, { examineeName: f.name, percent: 100 }), /اعتمدت/)
})

test('publication rejects stale grades and stale membership versions', (t) => {
  const f = fixture(t); f.fillScores(); const body = f.publishBody()
  f.service.score(f.member1, f.assignmentId, { examineeName: f.name, percent: 81 })
  assert.throws(() => f.service.publish(f.manager, f.assignmentId, body), /تغيرت درجات/)
  assert.throws(() => f.service.publish(f.manager, f.assignmentId, { ...f.publishBody(), revision: 0 }), /توزيع الأوزان/)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 0)
})

test('decimal weights are exact and invalid new users roll back the entire save', (t) => {
  const f = fixture(t), initial = f.service.detail(f.manager, f.committee.id)
  f.service.saveMembers(f.manager, f.committee.id, { revision: initial.revision, members: initial.members.map((member) => ({ ...member, weight: member.id === f.manager.id ? 33.34 : 33.33 })) })
  assert.equal(f.db.prepare('SELECT SUM(weight_bp) AS total FROM committee_accounts').get().total, 10000)
  const next = f.service.detail(f.manager, f.committee.id)
  assert.throws(() => f.service.saveMembers(f.manager, f.committee.id, { revision: next.revision, members: [...next.members, { name: 'جديد', username: 'new_user', password, active: true, weight: 1 }] }), /100%/)
  assert.equal(f.service.login('new_user', password), null)
  assert.equal(f.service.detail(f.manager, f.committee.id).revision, next.revision)
})

test('username collisions, weak passwords and disabling the manager are rejected', (t) => {
  const f = fixture(t)
  assert.throws(() => f.service.create(f.admin, { name: 'ثانية', managerName: 'مدير', username: 'MANAGER', password, category: 'personality' }), /مرتبطة بحسابات|صلاحية/)
  assert.throws(() => seedManagedCommittee(f.db, { name: 'تكرار', managerName: 'م', username: 'manager', password, category: 'personality' }), /UNIQUE|constraint|SQLITE/i)
  const initial = f.service.detail(f.manager, f.committee.id)
  assert.throws(() => f.service.saveMembers(f.manager, f.committee.id, { revision: initial.revision, members: initial.members.map((member) => member.id === f.manager.id ? { ...member, active: false, weight: 0 } : member) }), /مدير اللجنة/)
})

test('duplicate assignments, stopped exams and already-started exams are rejected', (t) => {
  const f = fixture(t)
  assert.throws(() => f.service.assign(f.admin, f.committee.id, 'exam'), /مرتبط/)
  f.db.prepare('DELETE FROM committee_assignments').run()
  f.db.prepare("UPDATE exam_roster SET used=1 WHERE id='candidate1'").run()
  assert.throws(() => f.service.assign(f.admin, f.committee.id, 'exam'), /لم يبدأ/)
  f.db.prepare("UPDATE exams SET active=0 WHERE id='exam'").run()
  assert.throws(() => f.service.score(f.member1, f.assignmentId, { examineeName: f.name, percent: 80 }))
  assert.throws(() => f.service.assign(f.admin, f.committee.id, 'exam'), /نشط/)
})

test('archive write failures roll back publication instead of leaving a partial result', (t) => {
  const f = fixture(t); f.fillScores()
  f.db.exec("CREATE TRIGGER reject_archive BEFORE INSERT ON assessment_archive BEGIN SELECT RAISE(ABORT, 'test failure'); END")
  assert.throws(() => f.service.publish(f.manager, f.assignmentId, f.publishBody()), /test failure/)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM committee_results').get().n, 0)
  assert.equal(f.db.prepare("SELECT used FROM exam_roster WHERE id='candidate1'").get().used, 0)
})

test('HTTP endpoints reject unauthenticated requests and member administration', async (t) => {
  const f = fixture(t), app = express(); app.use(express.json())
  attachCommitteeRoutes(app, f.service, (token) => { if (token !== 'member') throw new Error('invalid'); return f.member1 })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(`${url}/api/committees`)).status, 401)
  assert.equal((await fetch(`${url}/api/committees/${f.committee.id}/members`, { method: 'PUT', headers: { Authorization: 'Bearer member', 'Content-Type': 'application/json' }, body: '{}' })).status, 403)
  const response = await fetch(`${url}/api/committees/${f.committee.id}`, { headers: { Authorization: 'Bearer member' } })
  assert.equal(response.status, 200)
  assert.ok(!(await response.text()).includes('password_hash'))
})

test('all four evaluation categories publish their weighted results to the matching archive category', (t) => {
  for (const category of ['theory', 'oral', 'driving', 'personality']) {
    const f = fixture(t)
    f.db.prepare('UPDATE exams SET category=?').run(category)
    f.fillScores()
    assert.equal(f.service.publish(f.manager, f.assignmentId, f.publishBody()).percent, 81)
    assert.equal(f.db.prepare('SELECT category FROM assessment_archive').get().category, category)
  }
})

test('legacy result mutations and encoded URLs cannot bypass committee approval', async (t) => {
  const f = fixture(t); f.fillScores(); f.service.publish(f.manager, f.assignmentId, f.publishBody())
  const attemptId = f.db.prepare('SELECT id FROM attempts').get().id
  const app = express()
  attachCommitteeProtection(app, f.db, (token) => token === 'admin' ? { role: 'admin', examId: 'exam' } : { examId: 'exam' })
  app.use((_req, res) => res.json({ ok: true }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  for (const [method, path] of [
    ['POST', '/admin/exams/exam/manual-score'], ['POST', '/admin/exams/%65xam/manual-score'],
    ['POST', '/ADMIN/exams/exam/MANUAL-RESULT'], ['POST', '/admin/exams/exam/oral-evaluations'],
    ['PATCH', `/admin/exams/exam/attempts/${attemptId}/score`],
    ['POST', `/admin/attempts/${attemptId}/modify-result`], ['POST', '/exam/submit'], ['DELETE', '/admin/exams/exam'],
  ]) assert.equal((await fetch(`${url}/api${path}`, { method })).status, 409, path)
  assert.equal((await fetch(`${url}/api/admin/attempts/${attemptId}/modify-result`, { method: 'POST', headers: { Authorization: 'Bearer admin' } })).status, 200)
  for (const [method, path] of [['GET', '/admin/exams/exam/results'], ['PATCH', '/admin/exams/exam/active'], ['POST', '/admin/exams/unassigned/manual-score']]) {
    assert.equal((await fetch(`${url}/api${path}`, { method })).status, 200, path)
  }
})

test('admin assigns any applicants to committee; committee creates exam with QR', (t) => {
  const bank = JSON.parse(readFileSync(new URL('./question-bank.json', import.meta.url)))
  const applicants = [
    { id: 'tech1', name: 'تقني واحد', jobTitle: 'تقني', seqNumber: 1, org: 'أ', extra: { 'نوع المقابلة': 'داخلية' } },
    { id: 'tech2', name: 'فني اثنان', jobTitle: 'فني', seqNumber: 2, org: 'أ', extra: { 'نوع المقابلة': 'داخلية' } },
    { id: 'tech3', name: 'فني ثلاثة', jobTitle: 'تقني', seqNumber: 3, org: 'أ', extra: { 'نوع المقابلة': 'داخلية' } },
  ]
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.exec(schema)
  for (const name of ['display_id', 'org', 'job_title', 'rank', 'applicant_id', 'extra_json', 'qr_expires_at']) {
    try { db.exec(`ALTER TABLE exam_roster ADD COLUMN ${name} TEXT`) } catch { /* exists */ }
  }
  const now = '2026-09-13'
  for (const a of applicants) {
    db.prepare(
      `INSERT INTO applicants(id,seq_number,display_id,name,org,job_title,extra_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(a.id, a.seqNumber, `D${a.seqNumber}`, a.name, a.org, a.jobTitle, JSON.stringify(a.extra), now, now)
  }
  const insertExamRoster = (examId, rows) => rows.map((applicant, i) => {
    const id = `r-${applicant.id}`
    const token = `qr-${applicant.id}`
    db.prepare(
      `INSERT INTO exam_roster(id,exam_id,seq_number,applicant_id,name,username,password_hash,password_plain,qr_token,created_at,job_title)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, examId, applicant.seqNumber || i + 1, applicant.id, applicant.name, `u_${id}`, '', '', token, now, applicant.jobTitle || '')
    return { id, applicantId: applicant.id, name: applicant.name, jobTitle: applicant.jobTitle, qrToken: token, displayId: `D${i + 1}` }
  })
  const jobExams = createJobExamService(db, {
    bank,
    getApplicantsByIds: (ids) => applicants.filter((a) => ids.includes(a.id)),
    insertExamRoster,
  })
  const service = createCommitteeService(db, {
    getApplicantsByIds: (ids) => applicants.filter((a) => ids.includes(a.id)),
    jobExams,
  })
  const admin = { role: 'admin', username: 'admin' }
  const techCommittee = service.list(admin).find((c) => c.owner_username === 'oral_tech')
  assert.ok(techCommittee, 'ensureOperatorCommittees يجب أن يزرع لجنة oral_tech')
  const assigned = service.assignCandidates(admin, techCommittee.id, {
    applicantIds: applicants.map((a) => a.id),
  })
  assert.equal(assigned.addedCount, 3)
  assert.equal(assigned.skippedCount, 0)
  assert.throws(() => service.assignCandidates({ role: 'committee_manager', id: 'x', authVersion: 1 }, techCommittee.id, { applicantIds: ['tech1'] }), /المسؤول|جلسة|صلاحية/)
  assert.throws(
    () => service.createExam(admin, techCommittee.id, { title: 'x', evaluationMode: 'qr', applicantIds: ['tech1'] }),
    /يوزّع المتقدمين|مدير أو رئيس|صلاحية/,
  )

  const operator = { role: 'operator', id: 1, username: 'oral_tech', label: 'شفهي — فني', category: 'oral', oralRole: 'technician' }
  assert.throws(
    () => service.createExam(operator, techCommittee.id, { title: 'اختبار', evaluationMode: 'qr', applicantIds: ['outsider'] }),
    /خارج قائمة/,
  )
  const created = service.createExam(operator, techCommittee.id, {
    title: 'اختبار فني من اللجنة',
    evaluationMode: 'manual',
    applicantIds: ['tech1', 'tech2'],
  })
  assert.equal(created.exam.category, 'oral')
  assert.equal(created.exam.oralRole, 'technician')
  assert.equal(created.roster.length, 2)
  assert.ok(created.roster.every((r) => r.qrToken))
  assert.ok(db.prepare('SELECT id FROM committee_assignments WHERE exam_id=?').get(created.exam.id))
  assert.throws(
    () => service.createExam(operator, techCommittee.id, { title: 'تكرار', evaluationMode: 'qr', applicantIds: ['tech1'] }),
    /نفس المسار|نشط/,
  )

  const createdQr = service.createExam(operator, techCommittee.id, {
    title: 'اختبار بعدد مخصص',
    evaluationMode: 'qr',
    applicantIds: ['tech3'],
    questionCount: 8,
    questionTypes: ['oral'],
    durationMinutes: 40,
  })
  assert.equal(createdQr.questionCount, 8)
  assert.deepEqual(createdQr.questionTypes, ['oral'])
  assert.equal(createdQr.durationMinutes, 40)
  const cfgRow = db.prepare('SELECT settings_json FROM job_exam_configs WHERE exam_id=?').get(createdQr.exam.id)
  assert.ok(cfgRow)
  const settings = JSON.parse(cfgRow.settings_json)
  assert.equal(settings.durationMinutes, 40)
  assert.equal(settings.groups[0].questionCount, 8)
  assert.deepEqual(settings.groups[0].questionTypes, ['oral'])
})

test('admin cannot create managed committees; ensureOperatorCommittees seeds access accounts', (t) => {
  const f = fixture(t)
  assert.throws(
    () => f.service.create(f.admin, { name: 'بلا', managerName: 'م', username: 'no_cat_mgr', password, category: 'oral', oralRole: 'technician' }),
    /مرتبطة بحسابات|صلاحية/,
  )
  const seeded = f.service.ensureOperatorCommittees()
  assert.equal(seeded.length, 0, 'الإقلاع الأول زرع اللجان مسبقاً')
  const listed = f.service.list(f.admin)
  assert.ok(listed.some((c) => c.owner_username === 'oral_tech'))
  assert.ok(listed.some((c) => c.owner_username === 'theory'))
  assert.ok(listed.some((c) => c.owner_username === 'office'))
  assert.ok(listed.some((c) => c.owner_username === 'driving'))
  assert.ok(listed.some((c) => c.owner_username === 'personality'))
})

test('driving and personality committees keep the note and drop the estimated salary', (t) => {
  for (const category of ['driving', 'personality', 'theory']) {
    const f = fixture(t)
    f.fillScores()
    f.db.prepare('UPDATE committees SET category=? WHERE id=?').run(category, f.committee.id)
    f.service.publish(f.manager, f.assignmentId, { ...f.publishBody(), note: 'ملاحظة بلا راتب', estimatedSalary: 250000 })
    const saved = f.service.evaluations(f.manager, f.assignmentId).results[0]
    assert.equal(saved.note, 'ملاحظة بلا راتب')
    assert.equal(saved.estimatedSalary, null)
    assert.equal(JSON.parse(f.db.prepare('SELECT detail_json FROM assessment_archive').get().detail_json).estimatedSalary, null)
  }
})

test('each committee can store a note and estimated salary with the adopted grade', (t) => {
  const f = fixture(t)
  f.fillScores()
  assert.throws(() => f.service.publish(f.manager, f.assignmentId, { ...f.publishBody(), note: 'x'.repeat(1001) }), /الملاحظة/)
  assert.throws(() => f.service.publish(f.manager, f.assignmentId, { ...f.publishBody(), estimatedSalary: -5 }), /الراتب/)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM committee_results').get().n, 0)
  f.service.publish(f.manager, f.assignmentId, { ...f.publishBody(), note: '  ملتزم وواضح  ', estimatedSalary: 250000 })
  const saved = f.service.evaluations(f.manager, f.assignmentId).results[0]
  assert.equal(saved.note, 'ملتزم وواضح')
  assert.equal(saved.estimatedSalary, 250000)
  const detail = JSON.parse(f.db.prepare('SELECT detail_json FROM assessment_archive').get().detail_json)
  assert.equal(detail.note, 'ملتزم وواضح')
  assert.equal(detail.estimatedSalary, 250000)
})
