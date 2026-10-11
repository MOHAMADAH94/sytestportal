import fs from 'fs'

const p = 'server/committees.test.js'
let s = fs.readFileSync(p, 'utf8')

function replaceBetween(src, startNeedle, endNeedle, replacement) {
  const start = src.indexOf(startNeedle)
  if (start < 0) throw new Error('start missing: ' + startNeedle.slice(0, 60))
  const end = src.indexOf(endNeedle, start)
  if (end < 0) throw new Error('end missing: ' + endNeedle.slice(0, 60))
  return src.slice(0, start) + replacement + src.slice(end)
}

s = replaceBetween(
  s,
  "test('oral, driving",
  "test('all active members",
  `test('oral, driving and personality operators can form and lead one committee limited to their assessment scope', (t) => {
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
  f.db.prepare(\`INSERT INTO exams(id,title,category,level,oral_role,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at)
    VALUES ('owner-exam','مقابلة شبكات','oral','engineer','network_engineer',1,1,'owner_exam','','','[]','[]','2026-09-13')\`).run()
  f.db.prepare(\`INSERT INTO exam_roster(id,exam_id,seq_number,name,username,password_hash,password_plain,qr_token,created_at)
    VALUES ('owner-candidate','owner-exam',1,'مرشح اللجنة','owner_candidate','','','owner_qr','2026-09-13')\`).run()
  f.service.assign(oralOwner, committee.id, 'owner-exam')
  const assignment = f.service.detail(oralOwner, committee.id).assignments[0]
  f.service.score(oralOwner, assignment.id, { examineeName:'مرشح اللجنة', percent:90 })
  f.service.score(member, assignment.id, { examineeName:'مرشح اللجنة', percent:80 })
  const state = f.service.evaluations(oralOwner, assignment.id)
  assert.equal(state.scores.find((score) => score.accountId === 'operator:oral_net').percent, 90)
  const revision = f.service.detail(oralOwner, committee.id).revision
  const scoreVersion = state.candidates[0].scoreVersion
  assert.equal(f.service.publish(oralOwner, assignment.id, { examineeName:'مرشح اللجنة', revision, scoreVersion }).percent, 86)

  f.db.prepare(\`INSERT INTO exams(id,title,category,level,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_at)
    VALUES ('wrong-category','قيادة','driving','engineer',1,1,'wrong_category','','','[]','[]','2026-09-13')\`).run()
  assert.throws(() => f.service.assign(oralOwner, committee.id, 'wrong-category'), /لا يطابق/)
  assert.throws(() => f.service.detail({ ...oralOwner, username:'oral_prog', oralRole:'programmer' }, committee.id), /صلاحية/)
  assert.throws(() => f.service.create({ role:'operator',username:'theory',category:'theory' }, { name:'لجنة نظري' }), /الشفهي والقيادة والشخصية/)

  for (const category of ['driving','personality']) {
    const owner = { role:'operator',id:category,username:'owner_' + category,label:'مسؤول ' + category,category,oralRole:null }
    const created = f.service.create(owner,{ name:'لجنة ' + category })
    assert.equal(f.service.detail(owner,created.id).category,category)
  }
})

`,
)

s = replaceBetween(
  s,
  "assert.throws(() => f.service.create(f.admin, { name: 'ثانية', managerName: 'مدير', username: 'MANAGER'",
  "  const initial = f.service.detail(f.manager, f.committee.id)",
  `assert.throws(() => f.service.create(f.admin, { name: 'ثانية', managerName: 'مدير', username: 'MANAGER', password, category: 'personality' }), /مرتبطة بحسابات|صلاحية/)
  assert.throws(() => seedManagedCommittee(f.db, { name: 'تكرار', managerName: 'م', username: 'manager', password, category: 'personality' }), /UNIQUE|constraint|SQLITE/i)
`,
)

s = replaceBetween(
  s,
  "  const admin = { role: 'admin', username: 'admin' }\r\n  const committee = service.create(admin, {\r\n    name: 'لجنة فني',",
  "  assert.equal(created.exam.category, 'oral')",
  `  const admin = { role: 'admin', username: 'admin' }
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
`,
)

// fallback if LF only
if (s.includes("name: 'لجنة فني'")) {
  s = replaceBetween(
    s,
    "  const admin = { role: 'admin', username: 'admin' }\n  const committee = service.create(admin, {\n    name: 'لجنة فني',",
    "  assert.equal(created.exam.category, 'oral')",
    `  const admin = { role: 'admin', username: 'admin' }
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
`,
  )
}

const createStart = s.indexOf("test('admin create committee accepts")
if (createStart >= 0) {
  s = s.slice(0, createStart) + `test('admin cannot create managed committees; ensureOperatorCommittees seeds access accounts', (t) => {
  const f = fixture(t)
  assert.throws(
    () => f.service.create(f.admin, { name: 'بلا', managerName: 'م', username: 'no_cat_mgr', password, category: 'oral', oralRole: 'technician' }),
    /مرتبطة بحسابات|صلاحية/,
  )
  const seeded = f.service.ensureOperatorCommittees()
  assert.equal(seeded.length, 0, 'الإقلاع الأول زرع اللجان مسبقاً')
  const listed = f.service.list(f.admin)
  assert.ok(listed.some((c) => c.owner_username === 'oral_tech'))
  assert.ok(listed.some((c) => c.owner_username === 'driving'))
  assert.ok(listed.some((c) => c.owner_username === 'personality'))
})
`
}

fs.writeFileSync(p, s)
console.log('patched')
