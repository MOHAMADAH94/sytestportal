import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { createJobExamService } from './jobExams.js'
import { matchingPool, buildBlueprint, selectQuestions } from './questionSelection.js'
import { JOB_PROFILES, groupApplicants, resolveJobProfile, inferJobLevel, canUseProfile, effectiveJobTitle } from '../shared/jobProfiles.js'
import { scoreAnswers } from './examLogic.js'

const bank = JSON.parse(readFileSync(new URL('./question-bank.json', import.meta.url)))
const schema = readFileSync(new URL('./db.js', import.meta.url), 'utf8').match(/db\.exec\(`([\s\S]*?)`\)/)[1]
const admin = { role: 'admin', username: 'test-admin' }
const people = [
  { id: 'a', name: 'مرشح شبكات أ', jobTitle: 'مهندس شبكات', jobTitleCommittee: 'مبرمج', seqNumber: 1 },
  { id: 'b', name: 'مرشح شبكات ب', jobTitle: 'مهندس شبكات', seqNumber: 2 },
  { id: 'c', name: 'مرشح برمجيات', jobTitle: 'مبرمج', jobTitleCommittee: 'مهندس شبكات', seqNumber: 3 },
  { id: 'd', name: 'مرشح تحليل', jobTitle: 'محلل نظم', seqNumber: 4 },
]
function config(profileId, patch = {}) {
  const profile = JOB_PROFILES.find((p) => p.id === profileId)
  return { profileId, specialty: profile.specialty, jobLevel: 'intermediate', difficulty: 'medium', questionCount: 6, includeShared: false, skills: [], ...patch }
}
function body(category = 'theory', patch = {}) {
  return { title: 'اختبار تجريبي معزول', category, ...(category === 'theory' ? {} : { evaluationMode: 'suggested' }), applicantIds: people.map((a) => a.id), groups: groupApplicants(people).map((g) => ({ key: g.key, ...config(g.profileId, patch) })) }
}
function fixture(t, failRoster = false, applicantsForTest = people, bankForTest = bank) {
  const db = new Database(':memory:')
  t.after(() => db.close()); db.exec(schema); db.pragma('foreign_keys=ON')
  const insertExamRoster = (examId, applicants) => {
    const rows = applicants.map((applicant) => {
      const id = randomUUID()
      db.prepare("INSERT INTO exam_roster (id,exam_id,seq_number,name,username,password_hash,password_plain,qr_token,created_at) VALUES (?,?,?,?,?,'','',?,'2026-09-13')").run(id, examId, applicant.seqNumber, applicant.name, id, id)
      return { ...applicant, id, applicantId: applicant.id }
    })
    if (failRoster) throw new Error('simulated roster failure')
    return rows
  }
  const service = createJobExamService(db, { bank: bankForTest, getApplicantsByIds: (ids) => applicantsForTest.filter((a) => ids.includes(a.id)), insertExamRoster })
  return { db, service }
}

test('bank content is valid, unique and covers every configured job and assessment type', () => {
  assert.equal(bank.length, 5054)
  assert.equal(new Set(bank.map((q) => q.id)).size, bank.length)
  const additions = bank.filter((q) => q.id.startsWith('job-'))
  assert.equal(additions.length, 2072)
  assert.equal(new Set(bank.map((q) => q.text.trim())).size, bank.length)
  assert.equal(new Set(additions.map((q) => q.text.trim())).size, additions.length)
  for (const profile of JOB_PROFILES.filter((p) => p.id !== 'unclassified')) for (const category of ['theory', 'oral', 'driving', 'personality']) {
    const list = bank.filter((q) => q.jobTitles.includes(profile.id) && q.category === category)
    assert.ok(list.length >= 8, profile.id + category)
    assert.ok(list.some((q) => q.difficulty === 'advanced'))
  }
  for (const q of bank) {
    assert.ok(q.text && q.skill && q.jobLevels.length && q.points > 0, q.id)
    if (q.choices) { assert.ok(q.choices.every((c) => typeof c.text === 'string')); assert.ok(q.choices.some((c) => c.id === q.correctAnswer)) }
    if (['oral', 'open'].includes(q.type)) assert.ok(q.answerKey, q.id)
    if (q.rubric?.length) assert.equal(q.rubric.reduce((n, r) => n + r.maxPoints, 0), q.points)
  }
})

const suppliedJobTitles = `
مدخل بيانات
أرشيف
سائق سيارة خفيفة
سائق باص 27 راكب + صهريج
سائق باص 40 راكب
سائق رافعة
سائق لودر
مساعد سائق لودر
عامل طهي
شيف
عامل
خازن مستودع
حرس
مستخدم
إداري /لوجستي
محاسب
مترجم
مصمم جرافيك
مبرمج
حلاق
خياط
مزارع
عمال ندوة
مدير مكتب
رئيس قسم
رئيس فرع
طيار اول ( كابتن مدرب )
طيار ثاني ( كابتن )
طيار مساعد
مهندس جوي ( مهندس خبرة )
مهندس جوي (2 )
فني ارضي ( صيانة )
فني جوي
ملاح جوي ( خبرة )
ملاح جوي ثاني
إشارة جوية
مصالح تشغيلية
سائق ومسثمر
مساعد سائق تحصين آلي
مهندس زراعي ( تمويه )
سائق تحصين آلي
سائق تحصين آلي متقدم
فني اول
فني
مساعد فني
مدرب
مساعد مدرب
لاعب كرة قدم
مساعدة مدرب
مدرب لياقة
إداري فرق
معالج
مدلّك
مسؤول تجهيزات
مدرب رئيسي
مدرب حراس
معلم
مساعد
متابع صيانة آليات
عامل مستودع
مهندس مركبات
سائق اقتحام آلي
سائق رافعة تلسكوبية
سائق آلية حمولة اكثر من 10 طن
سائق آلية حمولة اقل من 10 طن
سائق خفيف
مساعد ثقيل
أمين مستودع مركبات
رباط
رباط - عامل
خازن
مشاة
عامل فني
عامل فني + حداد +تسليح+ كهرباء
مساعد فني + حداد +تسليح+ كهرباء
فني + حداد +تسليح+ كهرباء
سائق كاسحة +جرافة
فني أول+ حداد +تسليح+ كهرباء
سائق تركس
مسؤول ارتباط و تنسيق
دراسات وتخطيط GIS
دراسات و تحليل بيانات
باحث و مدقق لغوي
باحث
موظف طباعة و نشر
مهندس GIS
امن السيبراني
مستشار قضائي
قانوني
تقني
مهني ثقيل ماهر
مهني ثقيل نصف ماهر
مهني ثقيل عادي
قائد مستودعات
معاون قائد مستودعات
مسؤول مستودع
مساعد قائد مستودع او خازن
عامل مستودعات وامداد
مدير نظام العمل ( مسودعات والامداد )
تدقيق وتفتيش ( مستودعات وامداد )
مدخل بيانات بالقسم
مدخل بيانات بالفرع او الإدارة
سائق متوسط + 5 طون
سائق ثقيل ماهر
سائق ثقيل نصف ماهر
سائق ثقيل عادي
عامل ورشة ماهر ( معلم )
عامل ورشة نص ماهر ( معلم )
عامل ورشة عادي
عامل ندوة
مهني انتاجي ماهر
مهني انتاجي نصف ماهر
مهني انتاجي عادي
مهني مكيفات معلم
مهندس
مساعد مهندس
قائد فريق + قطاع
رئيس قسم هندسي
معاون رئيس فرع هندسي + تصميم + مكتب فني + مهندس استشاري + دائرة
رئيس فرع  هندسي او مهندس استشاري
مدير معمل انتاجي
مصور
مصور احترافي
مخرج
مستشار(دكتور جامعة)
مترجم فوري
مخلص جمركي
علاقات عامة
حقوقي
فني عقود
قلم فرع
باحث مشرف
باحث أول
مخطط مشرف
مخطط أول
مساعد باحث
مخطط
مساعد مخطط
مصمم كتب مشرف
مصمم كتب أول
مسؤول تدريب
موجه
مدرس
منشد
حرس شرف
مدقق
طيار
ميكانيك طيار
قبطان
ميكانيك سفن
سائق زورق سريع
ميكانيك زورق صغير
مصمم هيكل
معلم موبيلي
معلم حدادة
مهندس كهرباء
مدرس رياضيات
مدرس عربي
مدرس كيمياروفيزياء
مدرسة لغة اجنبية
مدرس بناء سفن
مدرس رسم هيكل
مدرس كهرباء
مدرس ميكانيك
فني متدرب
فني خبير
تقني خبير
تقني استشاري
مهندس خبير
مهندس استشاري
مبرمج خبير
مبرمج استشاري
رئيس فرع فني
رئيس فرع إداري
مدير مكتب المدير
رئيس قسم فني
رئيس قسم إداري
رئيس مكتب فني
رئيس مكتب إداري
ضابط إعلام واتصال/فرقة
ضابط إعلام واتصال/إدارة
موشن غرافيك
مونتير احترافي
مونتير
سيناريست
كاتب محتوى
تخصصي إضاءة
مهندس تقني
مهندس ذكاء اصطناعي
مهندس شبكات
مهندس صوت
معلق صوتي
أمن رقمي
نشر وترويج
مصور وزير
باحث دراسات
محرر
مدقق لغوي
رصد معلومات
أرشيف إعلامي
مدير إنتاج
مدير منصات وحدة الدعم
أخصائي تنمية القدرات الإعلامية
أخصائي تقييم إعلامي
مذيع
مراسل
مقدم برامج
متخصص بث وتشغيل إذاعي
متخصص مكسر واستديو
معد خطط إعلامية
تخصصي إحصاء وتوثيق
مختص إدارة حملات تسويقية
مدير حزمة برامج
`.trim().split('\n').map((title) => title.trim())

test('every supplied Excel job title resolves and has at least 20 selectable questions in every assessment', () => {
  assert.ok(suppliedJobTitles.length >= 200)
  for (const title of suppliedJobTitles) {
    const profile = resolveJobProfile(title)
    assert.ok(profile, `unmapped title: ${title}`)
    for (const category of ['theory', 'oral', 'driving', 'personality']) {
      const pool = matchingPool(bank, category, {
        profileId: profile.id,
        specialty: profile.specialty,
        jobLevel: inferJobLevel(title),
        difficulty: 'mixed',
        questionCount: 20,
        includeShared: ['driving', 'personality'].includes(category),
        skills: [],
        questionTypes: [],
      })
      assert.ok(pool.length >= 20, `${title} / ${profile.id} / ${category}: ${pool.length}`)
    }
  }
})

test('Islamic knowledge questions are shared open personality questions with model answers', () => {
  const questions = bank.filter((q) => q.id.startsWith('pe-knowledge-'))
  assert.equal(questions.length, 20)
  assert.ok(questions.every((q) => q.category === 'personality' && q.type === 'open' && q.isShared && q.answerKey && q.rubric?.length))
  const profile = JOB_PROFILES.find((p) => p.id === 'security_guard')
  const configForKnowledge = { profileId: profile.id, specialty: profile.specialty, jobLevel: 'intermediate', difficulty: 'mixed', questionCount: 20, includeShared: true, skills: [], questionTypes: ['open'] }
  assert.equal(matchingPool(bank, 'personality', configForKnowledge).filter((q) => q.id.startsWith('pe-knowledge-')).length, 20)
  assert.ok(matchingPool(bank, 'personality', { ...configForKnowledge, questionTypes: [] }).every((q) => q.type === 'scale'))
  const scored = scoreAnswers(questions, Object.fromEntries(questions.map((q) => [q.id, 'إجابة نصية'])))
  assert.equal(scored.needsManualReview, true)
  assert.equal(scored.personality, null)
})

test('committee proposal wins over current job title when grouping applicants', () => {
  const grouped = groupApplicants(people)
  assert.deepEqual(grouped.map((g) => g.applicantIds), [['a'], ['b', 'c'], ['d']])
  assert.deepEqual(grouped.map((g) => g.jobTitle), ['مبرمج', 'مهندس شبكات', 'محلل نظم'])
  const q = matchingPool(bank, 'theory', config('network_engineer'))
  assert.ok(q.length >= 20)
  assert.ok(q.every((q) => q.jobTitles.includes('network_engineer') && q.difficulty === 'medium' && q.jobLevels.includes('intermediate')))
  const unrelated = { ...q[0], id: 'other', jobTitles: ['software_engineer'] }
  const unclassified = { ...q[0], id: 'old', isShared: undefined }
  assert.equal(matchingPool([unrelated, unclassified], 'theory', config('network_engineer')).length, 0)
  const shared = { ...q[0], id: 'shared', isShared: true, jobTitles: [], specialties: [] }
  assert.equal(matchingPool([shared], 'theory', config('network_engineer')).length, 0)
  assert.equal(matchingPool([shared], 'theory', config('network_engineer', { includeShared: true })).length, 1)
})

test('selected execution mode is validated and retained with non-theory exams', (t) => {
  const { service } = fixture(t)
  const input = body('oral')
  input.evaluationMode = 'qr'
  const preview = service.preview(admin, input)
  assert.equal(preview.evaluationMode, 'qr')
  const { exam } = service.create(admin, input)
  assert.equal(service.evaluationMode(exam.id), 'qr')
  assert.throws(() => service.preview(admin, { ...input, evaluationMode:'unknown' }), /وضع تنفيذ/)
  assert.throws(() => service.preview(admin, { ...body('theory'), evaluationMode:'qr' }), /مخصصة/)
  const missingMode = body('oral'); delete missingMode.evaluationMode
  assert.throws(() => service.preview(admin, missingMode), /اختر وضع تنفيذ/)
  assert.throws(() => service.preview({ role:'commander' }, body()), { status:403 })
})

function createdExams(result) {
  return result.exams?.length ? result.exams : [result]
}
function examForPerson(service, result, personName) {
  for (const item of createdExams(result)) {
    try {
      const qs = service.questionsFor(item.exam, personName)
      return { item, exam: item.exam, questions: qs }
    } catch {
      /* not on this specialty exam */
    }
  }
  throw new Error('المتقدم غير موجود في اختبارات الشفهي المفصولة: ' + personName)
}

test('interview and manual modes stay usable without bank questions and are recommended on shortage', (t) => {
  const { service } = fixture(t, false, people, [])
  for (const mode of ['interview', 'manual']) {
    const input = { ...body('oral'), evaluationMode:mode }
    const preview = service.preview(admin,input)
    assert.equal(preview.draftRequired,false)
    assert.equal(preview.shortages.length,preview.groups.length)
    assert.deepEqual(preview.suggestedModes,['interview','manual'])
    assert.ok(preview.groups.every((group) => group.bankRequired === false && group.pending === false && group.actual === 0))
    const created = service.create(admin,input)
    for (const item of createdExams(created)) {
      assert.equal(item.exam.active,1)
      assert.equal(service.pendingGroups(item.exam.id).length,0)
    }
    assert.ok(people.every((person) => examForPerson(service, created, person.name).questions.length === 0))
  }
  for (const mode of ['suggested','qr']) {
    const input = { ...body('oral'), evaluationMode:mode }
    assert.equal(service.preview(admin,input).draftRequired,true)
    const created = service.create(admin,input)
    assert.ok(createdExams(created).every((item) => item.exam.active === 0))
    assert.ok(createdExams(created).some((item) => service.pendingGroups(item.exam.id).length > 0))
  }
})

test('the responsible interview operator receives the shortage and no-bank mode suggestions', (t) => {
  const applicant = people[0]
  const profile = resolveJobProfile(effectiveJobTitle(applicant))
  const { service } = fixture(t,false,[applicant],[])
  const group = groupApplicants([applicant])[0]
  const input = { title:'مقابلة مسؤول الاختصاص',category:'oral',evaluationMode:'suggested',applicantIds:[applicant.id],groups:[{ key:group.key,...config(group.profileId) }] }
  const preview = service.preview({ role:'operator',username:'oral-owner',category:'oral',oralRole:profile.oralRole },input)
  assert.equal(preview.shortages[0].jobTitle,effectiveJobTitle(applicant))
  assert.deepEqual(preview.suggestedModes,['interview','manual'])
  assert.equal(preview.draftRequired,true)
})

test('an empty manual exam can adopt questions from the bank', (t) => {
  const applicants = [people[1]]
  const { service } = fixture(t, false, applicants)
  const groups = groupApplicants(applicants).map((group) => ({ key: group.key, ...config(group.profileId, { questionTypes: ['oral'] }) }))
  const { exam } = service.create(admin, {
    title: 'شفهي يدوي',
    category: 'oral',
    evaluationMode: 'manual',
    applicantIds: applicants.map((person) => person.id),
    groups,
    forcedOralRole: 'network_engineer',
    skipOralSplit: true,
  })
  assert.equal(service.questionsFor(exam, applicants[0].name).length, 0)
  const operator = { role: 'operator', category: 'oral', oralRole: 'network_engineer', username: 'oral_net' }
  const saved = service.completeGroup(operator, exam, {
    source: 'adopt-bank',
    questionCount: 8,
    questionTypes: ['oral'],
    durationMinutes: 40,
    evaluationMode: 'suggested',
  })
  assert.equal(saved.filled, 1)
  assert.equal(saved.ready, true)
  assert.equal(service.evaluationMode(exam.id), 'suggested')
  assert.equal(service.questionsFor(exam, applicants[0].name).length, 8)
  assert.equal(service.pendingGroups(exam.id).length, 0)
})

test('manual mode never imports bank questions', (t) => {
  const { service } = fixture(t)
  const { exam } = service.create(admin,{ ...body('personality'), evaluationMode:'manual' })
  assert.equal(exam.active,1)
  assert.equal(exam.question_count,0)
  assert.ok(people.every((person) => service.questionsFor(exam,person.name).length === 0))
})

test('question sets stay attached to applicant IDs when names are identical', (t) => {
  const applicants = [
    { id:'duplicate-a',name:'اسم متشابه',jobTitle:'مهندس شبكات',seqNumber:1 },
    { id:'duplicate-b',name:'اسم متشابه',jobTitle:'مبرمج',seqNumber:2 },
  ]
  const { db,service } = fixture(t,false,applicants)
  const groups = groupApplicants(applicants).map((group) => ({ key:group.key,...config(group.profileId) }))
  service.create(admin,{ title:'أسماء متشابهة',category:'theory',applicantIds:applicants.map((item) => item.id),groups })
  const saved = db.prepare('SELECT applicant_id,profile_id FROM exam_question_sets ORDER BY applicant_id').all()
  assert.deepEqual(saved,[
    { applicant_id:'duplicate-a',profile_id:'network_engineer' },
    { applicant_id:'duplicate-b',profile_id:'software_engineer' },
  ])
})

test('same coverage, unseen questions preferred, and duplicate content excluded', () => {
  const pool = Array.from({ length: 24 }, (_, i) => ({ id: 'q' + i, skill: 'skill' + i % 3, difficulty: 'medium', text: 'question' + i }))
  const blueprint = buildBlueprint(pool, 6)
  assert.deepEqual(blueprint.map((b) => b.count), [2, 2, 2])
  const first = selectQuestions(pool, blueprint, new Set(), new Map(), () => 0).questions
  const second = selectQuestions(pool, blueprint, new Set(first.map((q) => q.id)), new Map(), () => 0)
  assert.equal(second.reusedCount, 0)
  assert.equal(new Set(second.questions.map((q) => q.id)).size, 6)
  for (const b of blueprint) assert.equal(second.questions.filter((q) => q.skill === b.skill).length, b.count)
  const sample = matchingPool(bank, 'theory', config('network_engineer'))[0]
  assert.equal(matchingPool([sample, { ...sample, id: 'duplicate' }], 'theory', config('network_engineer')).length, 1)
})

for (const category of ['theory', 'oral', 'driving', 'personality']) test(category + ': persists separate exact candidate snapshots and rejects outsider answers', (t) => {
  const { service } = fixture(t)
  const input = body(category, { questionCount: category === 'driving' ? 3 : 6 })
  assert.equal(service.preview(admin, input).canCreate, true)
  const created = service.create(admin, input)
  const exams = createdExams(created)
  assert.equal(exams.reduce((n, item) => n + service.variants(item.exam.id).length, 0), 4)
  const sets = people.map((a) => examForPerson(service, created, a.name))
  sets.forEach((found, i) => {
    const profile = groupApplicants([people[i]])[0].profileId
    const questions = found.questions
    assert.ok(questions.every((q) => q.category === category && q.jobTitles.includes(profile)))
    const rosterRow = found.item.roster.find((r) => r.name === people[i].name)
    assert.deepEqual(questions, service.questionsFor(found.exam, 'ignored', rosterRow.id))
  })
  assert.throws(() => service.questionsFor(exams[0].exam, 'خارج القائمة'), /مسجل/)
  const outsider = sets.flatMap((s) => s.questions).find((q) => !sets[0].questions.some((own) => own.id === q.id))
  assert.ok(outsider)
  assert.throws(() => service.validateAnswers(exams[0].exam, sets[0].questions, { [outsider.id]: 'a' }), /خارج مجموعة/)
  const selected = sets[0].questions[0]
  if (selected.choices) {
    service.validateAnswers(sets[0].exam, sets[0].questions, { [selected.id]: selected.correctAnswer })
    assert.throws(() => service.validateAnswers(sets[0].exam, sets[0].questions, { [selected.id]: 'invalid-choice' }), /غير صالحة/)
    const objective = sets[0].questions.filter((q) => q.choices)
    const scored = scoreAnswers(objective, Object.fromEntries(objective.map((q) => [q.id, q.correctAnswer])))
    assert.equal(scored.score, scored.maxScore)
  }
})

test('shortage still creates the requested count by recycling bank questions', (t) => {
  const f = fixture(t)
  const input = body('theory', { questionCount: 100 })
  const preview = f.service.preview(admin, input)
  assert.equal(preview.canCreate, true)
  assert.ok(preview.groups.every((g) => !g.enough && g.actual === 100))
  const result = f.service.create(admin, input)
  assert.equal(result.exam.active, 1)
  for (const person of people) {
    const qs = f.service.questionsFor(result.exam, person.name)
    assert.equal(qs.length, 100)
    assert.ok(qs.every((q) => q.jobTitles.includes(groupApplicants([person])[0].profileId)))
  }
  const broken = fixture(t, true)
  assert.throws(() => broken.service.create(admin, body()), /simulated/)
  for (const table of ['exams', 'exam_roster', 'exam_question_sets', 'job_exam_configs']) assert.equal(broken.db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n, 0)
})

test('bank edits and disabling do not change saved exams; legacy exams still read original JSON', (t) => {
  const { service } = fixture(t)
  const { exam } = service.create(admin, body())
  const original = service.questionsFor(exam, people[0].name)
  service.saveQuestion(admin, { ...original[0], text: 'نص معدل للاختبارات الجديدة' })
  service.deleteQuestion(admin, original[1].id)
  assert.deepEqual(service.questionsFor(exam, people[0].name), original)
  assert.deepEqual(service.questionsFor({ id: 'old', questions_json: JSON.stringify(original) }), original)
  assert.equal(service.bank().find((q) => q.id === original[0].id).text, 'نص معدل للاختبارات الجديدة')
})

test('history follows applicant IDs even after a name change and only includes their assigned set', (t) => {
  const { db, service } = fixture(t)
  const input = body()
  const initial = service.preview(admin, input).groups[0].minFresh
  const { exam } = service.create(admin, input)
  const questions = service.questionsFor(exam, people[0].name)
  db.prepare("INSERT INTO attempts (id,exam_id,examinee_name,answers_json,score,max_score,started_at,finished_at,applicant_id) VALUES ('att',?,?, '{}',0,0,'now','now',?)").run(exam.id, people[0].name, people[0].id)
  assert.equal(service.preview(admin, input).groups[0].minFresh, initial - questions.length)
  const savedName = people[0].name
  try { people[0].name = 'اسم محدث'; assert.equal(service.preview(admin, input).groups[0].minFresh, initial - questions.length) }
  finally { people[0].name = savedName }
})

test('written questions keep the final result pending until manual review', (t) => {
  const { service } = fixture(t)
  const { exam } = service.create(admin, body('theory', { questionCount: 3, difficulty: 'hard', jobLevel: 'expert' }))
  const questions = service.questionsFor(exam, people[0].name)
  const scored = service.scoreSubmission(exam, questions, {})
  assert.equal(scored.needsManualReview, true)
  assert.equal(scored.maxScore, 0)
  const objective = bank.find((q) => q.category === 'theory' && q.type === 'mcq')
  const mixed = service.scoreSubmission(exam, [...questions, objective], { [objective.id]: objective.correctAnswer })
  assert.equal(mixed.maxScore, 0)
  assert.equal(mixed.score, 0)
})

test('server rejects unauthorized category, profile overrides, malformed configs and mismatched groups', (t) => {
  const { service } = fixture(t)
  const input = body()
  assert.throws(() => service.create({ role: 'committee_manager' }, input), { status: 403 })
  assert.throws(() => service.create({ role: 'operator', category: 'oral', oralRole: 'network_engineer' }, input), { status: 403 })
  const wrong = structuredClone(input); wrong.groups[0].profileId = 'technician'
  assert.throws(() => service.create(admin, wrong), /لا يطابق/)
  assert.throws(() => service.create(admin, { ...input, groups: [] }), /لا تطابق/)
  assert.throws(() => service.create(admin, body('theory', { questionCount: 1.5 })), /عدد الأسئلة/)
  assert.throws(() => service.create(admin, body('theory', { specialty: 'invalid' })), /الاختصاص/)
  assert.throws(() => service.saveQuestion({ role: 'commander' }, bank[0]), { status: 403 })
  assert.throws(() => service.saveQuestion({ role: 'operator', category: 'oral', oralRole: 'network_engineer' }, bank.find((q) => q.jobTitles.includes('software_engineer') && q.category === 'oral')), { status: 403 })
})

test('service and office aliases resolve precisely without changing the recorded current title', () => {
  for (const [title,id] of [['حرس','security_guard'],['مستخدم','service_attendant'],['متابع اليات','fleet_coordinator'],['عمال صيانة','maintenance_worker'],['لوجستي','logistics'],['ديوان','registry_clerk'],['مستثمر حاسوب','computer_operator'],['فني كهرباء','electrical_technician'],['مهندس مدني','civil_engineer']]) assert.equal(resolveJobProfile(title).id,id)
  const office = JOB_PROFILES.find((p) => p.id === 'registry_clerk')
  const programmer = JOB_PROFILES.find((p) => p.id === 'software_engineer')
  const guard = JOB_PROFILES.find((p) => p.id === 'security_guard')
  assert.equal(canUseProfile({ role:'operator',category:'theory',theoryTrack:'office' },office,'theory'),true)
  assert.equal(canUseProfile({ role:'operator',category:'theory',theoryTrack:'office' },programmer,'theory'),true)
  assert.equal(canUseProfile({ role:'operator',category:'theory',theoryTrack:'office' },guard,'theory'),false)
  assert.equal(canUseProfile({ role:'operator',category:'theory',theoryTrack:'general' },office,'theory'),false)
  assert.equal(canUseProfile({ role:'operator',category:'theory',theoryTrack:'general' },guard,'theory'),true)
  assert.equal(resolveJobProfile('مسمى مستحدث غير موجود'),null)
  assert.equal(inferJobLevel('تقني خبير'),'expert')
  assert.equal(inferJobLevel('فني مبتدئ'),'junior')
  assert.equal(inferJobLevel('مهندس رئيسي'),'senior')
  assert.equal(inferJobLevel('مبرمج'),'intermediate')
  assert.equal(canUseProfile({ role:'operator',category:'personality' },JOB_PROFILES.find((p) => p.id === 'unclassified'),'personality'),true)
  assert.equal(canUseProfile({ role:'operator',category:'oral',oralRole:'programmer' },JOB_PROFILES.find((p) => p.id === 'systems_engineer'),'oral'),true)
  assert.equal(canUseProfile({ role:'operator',category:'oral',oralRole:'systems_engineer' },JOB_PROFILES.find((p) => p.id === 'software_engineer'),'oral'),true)
  assert.equal(canUseProfile({ role:'operator',category:'oral',oralRole:'programmer' },JOB_PROFILES.find((p) => p.id === 'network_engineer'),'oral'),false)
})

for (const category of ['theory','oral','driving','personality']) test(category + ': no suitable questions still creates a draft that can be completed manually', (t) => {
  const { db, service } = fixture(t), input = body(category,{ skills:['مهارة جديدة لم تنشر في البنك'] })
  const preview = service.preview(admin,input)
  assert.equal(preview.canCreate,true); assert.equal(preview.draftRequired,true)
  assert.ok(preview.groups.every((g) => g.actual === 0))
  const created = service.create(admin,input)
  const exams = createdExams(created)
  assert.ok(exams.every((item) => item.exam.active === 0 && item.exam.question_count === 0))
  for (const item of exams) {
    assert.throws(() => service.assertReady(item.exam), /استكمل/)
    assert.throws(() => service.validateAnswers(item.exam,[],{}), /مسودة/)
    for (const group of service.pendingGroups(item.exam.id)) {
      const saved = service.completeGroup(admin,item.exam,{ key:group.key,source:'manual',questions:[{ text:'سؤال محدد للمسمى ' + group.jobTitle,answerKey:'معيار تحقق معتمد لهذا السؤال',points:5 }] })
      if (saved.pendingGroups.length) assert.equal(saved.ready,false)
    }
    assert.equal(service.pendingGroups(item.exam.id).length,0)
    service.assertReady(item.exam)
  }
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM exams WHERE active=1').get().n >= 1)
  for (const person of people) {
    const found = examForPerson(service, created, person.name)
    assert.equal(found.questions.length,1); assert.equal(found.questions[0].source,'manual_exam'); assert.equal(found.questions[0].jobTitleSnapshot,effectiveJobTitle(person) || person.jobTitle)
    assert.equal(found.questions[0].type,category === 'personality' ? 'scale' : category === 'oral' ? 'oral' : 'open')
  }
  assert.throws(() => service.completeGroup(admin,exams[0].exam,{ key:service.pendingGroups(exams[0].exam.id)[0]?.key || input.groups[0].key,source:'manual',questions:[] }), /فارغة|مجموعة/)
})

test('unforeseen titles remain independent and receive shared questions only after explicit opt-in', (t) => {
  const applicant = { id:'future',name:'مرشح المستقبل',jobTitle:'منسق استدامة',seqNumber:1 }
  const { service } = fixture(t,false,[applicant])
  const input = { title:'تخصص مستحدث',category:'theory',applicantIds:[applicant.id],groups:[{ key:groupApplicants([applicant])[0].key,...config('unclassified',{ questionCount:20 }) }] }
  const draft = service.create(admin,input)
  assert.equal(service.questionsFor(draft.exam,applicant.name).length,0)
  const optIn = structuredClone(input); optIn.groups[0].includeShared = true
  const live = service.create(admin,optIn), qs = service.questionsFor(live.exam,applicant.name)
  assert.equal(qs.length, 20); assert.ok(qs.every((q) => q.isShared))
  assert.throws(() => service.create({ role:'operator',category:'theory' },input), { status:403 })
})

test('draft completion enforces permissions, duplicate checks and all-or-nothing writes', (t) => {
  const { db,service } = fixture(t), input = body('oral',{ skills:['غير متاح'] }), created = service.create(admin,input)
  const exam = createdExams(created).find((item) => service.pendingGroups(item.exam.id).length > 1)?.exam
    || createdExams(created)[0].exam
  const group = service.pendingGroups(exam.id)[0]
  const request = { key:group.key,source:'manual',questions:[{ text:'سؤال',answerKey:'معيار',points:5 }] }
  assert.throws(() => service.completeGroup({ role:'commander' },exam,request), { status:403 })
  assert.throws(() => service.completeGroup(admin,exam,{ ...request,questions:[request.questions[0],request.questions[0]] }), /تكرر/)
  const second = db.prepare('SELECT roster_id FROM exam_question_sets WHERE exam_id=? ORDER BY roster_id LIMIT 1 OFFSET 1').get(exam.id)
  db.exec("CREATE TRIGGER fail_draft BEFORE UPDATE ON exam_question_sets BEGIN SELECT RAISE(ABORT,'completion failed'); END")
  assert.throws(() => service.completeGroup(admin,exam,request), /completion failed/)
  assert.equal(JSON.parse(db.prepare('SELECT questions_json FROM exam_question_sets WHERE roster_id=?').get(second.roster_id).questions_json).length,0)
  db.exec('DROP TRIGGER fail_draft')
  db.prepare('UPDATE exam_roster SET used=1 WHERE exam_id=?').run(exam.id)
  assert.throws(() => service.completeGroup(admin,exam,request), /بدأ الاختبار/)
})

test('a draft can use newly approved bank questions without loosening its saved filters', (t) => {
  const { service } = fixture(t), input = body('theory',{ skills:['اختبار مهارة إضافية'] }), { exam } = service.create(admin,input)
  const group = service.pendingGroups(exam.id)[0]
  assert.throws(() => service.completeGroup(admin,exam,{ key:group.key,source:'bank', strict:true }), /لم تتوفر/)
  const sample = matchingPool(bank,'theory',config(group.profileId))[0]
  service.saveQuestion(admin,{ ...sample,id:undefined,text:'سؤال جديد لتغطية مهارة إضافية',skill:'اختبار مهارة إضافية' })
  service.completeGroup(admin,exam,{ key:group.key,source:'bank', strict:true })
  assert.equal(service.questionsFor(exam,people[0].name).length,6)
  assert.equal(service.pendingGroups(exam.id).length,2)
})

test('bank fill can relax filters and complete every empty group in one step', (t) => {
  const { service } = fixture(t), input = body('theory',{ skills:['مهارة غير موجودة للتعبئة'] }), { exam } = service.create(admin,input)
  assert.ok(service.pendingGroups(exam.id).length > 0)
  const result = service.completeGroup(admin, exam, { source: 'bank-all' })
  assert.equal(result.ok, true)
  assert.ok(result.filled > 0)
  assert.equal(result.ready, true)
  assert.equal(service.pendingGroups(exam.id).length, 0)
  assert.ok(service.questionsFor(exam, people[0].name).length > 0)
})

test('exam creation can restrict bank questions to objective or written patterns', (t) => {
  const { service } = fixture(t)
  const objective = service.create(admin, {
    ...body('theory'),
    groups: groupApplicants(people).map((g) => ({ key: g.key, ...config(g.profileId, { questionTypes: ['mcq', 'true_false'], questionCount: 5, difficulty: 'mixed' }) })),
  })
  for (const person of people) {
    const qs = service.questionsFor(objective.exam, person.name)
    assert.ok(qs.length > 0)
    assert.ok(qs.every((q) => ['mcq', 'true_false'].includes(q.type)), person.jobTitle)
  }
  const written = service.create(admin, {
    ...body('theory'),
    title: 'اختبار كتابي',
    groups: groupApplicants(people).map((g) => ({ key: g.key, ...config(g.profileId, { questionTypes: ['open', 'classic'], questionCount: 5, difficulty: 'mixed' }) })),
  })
  for (const person of people) {
    const qs = service.questionsFor(written.exam, person.name)
    assert.ok(qs.length > 0)
    assert.ok(qs.every((q) => ['open', 'classic'].includes(q.type)), person.jobTitle)
  }
})

test('selected exam questions stay within the applicant job title or approved shared fillers', (t) => {
  const { service } = fixture(t)
  for (const category of ['theory', 'oral', 'driving', 'personality']) {
    const created = service.create(admin, category === 'theory' ? body('theory') : { ...body(category), evaluationMode: 'qr' })
    for (const person of people) {
      const profile = resolveJobProfile(effectiveJobTitle(person))
      const qs = examForPerson(service, created, person.name).questions
      assert.ok(qs.length > 0, `${category}/${effectiveJobTitle(person)}`)
      for (const q of qs) {
        if (q.isShared === true) {
          assert.ok(['driving', 'personality'].includes(category), `shared question leaked into ${category}`)
          continue
        }
        assert.ok(q.jobTitles.includes(profile.id), `${q.id} not for ${profile.id}`)
        assert.ok(q.specialties.includes(profile.specialty), `${q.id} wrong specialty`)
      }
    }
  }
})

test('programmer and systems oral operators share one track without mixing networks', (t) => {
  const software = [{ id: 'c', name: 'مرشح برمجيات', jobTitle: 'مبرمج', seqNumber: 3 }]
  const systems = [{ id: 'd', name: 'مرشح تحليل', jobTitle: 'محلل نظم', seqNumber: 4 }]
  const { service } = fixture(t, false, [...software, ...systems])
  const progOp = { role: 'operator', category: 'oral', oralRole: 'programmer', username: 'oral_prog' }
  const sysOp = { role: 'operator', category: 'oral', oralRole: 'systems_engineer', username: 'oral_prog' }
  const netOp = { role: 'operator', category: 'oral', oralRole: 'network_engineer', username: 'oral_net' }
  function oralBody(title, list) {
    return {
      title,
      category: 'oral',
      evaluationMode: 'qr',
      applicantIds: list.map((person) => person.id),
      groups: groupApplicants(list).map((group) => ({ key: group.key, ...config(group.profileId) })),
    }
  }
  assert.doesNotThrow(() => service.preview(progOp, oralBody('نظم عبر مبرمج', systems)))
  assert.doesNotThrow(() => service.preview(sysOp, oralBody('برمجيات عبر نظم', software)))
  assert.throws(() => service.preview(netOp, oralBody('برمجيات عبر شبكات', software)), { status: 403 })
  const { exam } = service.create(admin, oralBody('شفهي مبرمج ونظم', [...software, ...systems]))
  assert.equal(exam.oral_role, 'programmer')
})

test('admin QR package creates oral specialty exams plus driving and personality', (t) => {
  const { service } = fixture(t)
  const input = {
    title: 'دفعة تجريبية',
    evaluationMode: 'qr',
    applicantIds: people.map((person) => person.id),
    groups: groupApplicants(people).map((group) => ({ key: group.key, ...config(group.profileId) })),
  }
  const pack = service.createPackage(admin, input)
  assert.equal(pack.evaluationMode, 'qr')
  const oralExams = pack.exams.filter((item) => item.category === 'oral')
  const drivingExams = pack.exams.filter((item) => item.category === 'driving')
  const personalityExams = pack.exams.filter((item) => item.category === 'personality')
  assert.ok(oralExams.length >= 2, 'يُفصل الشفهي حسب التخصص')
  assert.equal(drivingExams.length, 1)
  assert.equal(personalityExams.length, 1)
  assert.ok(oralExams.every((item) => item.exam.oral_role), 'كل اختبار شفهي مربوط بتخصص')
  const roles = new Set(oralExams.map((item) => item.exam.oral_role))
  assert.ok(roles.has('programmer') || roles.has('network_engineer') || roles.has('technician'))
  assert.ok(oralExams.every((item) => item.roster.length > 0))
  assert.ok(drivingExams[0].roster.length === people.length)
  assert.match(oralExams[0].exam.title, /شفهي/)
  assert.match(drivingExams[0].exam.title, /قيادة/)
  assert.match(personalityExams[0].exam.title, /شخصية/)
  assert.throws(
    () => service.createPackage({ role: 'operator', category: 'oral', oralRole: 'programmer' }, input),
    (err) => /حزمة التقييم/.test(err.message) && err.status === 403,
  )
  assert.throws(() => service.createPackage(admin, { ...input, evaluationMode: 'interview' }), /QR/)
})

test('oral create splits mixed specialties into separate exams for each account', (t) => {
  const mixed = [
    { id: 't1', name: 'فني أ', jobTitle: 'فني حاسب آلي', seqNumber: 1 },
    { id: 'p1', name: 'مبرمج أ', jobTitle: 'مبرمج', seqNumber: 2 },
    { id: 'n1', name: 'شبكات أ', jobTitle: 'مهندس شبكات', seqNumber: 3 },
  ]
  const { service } = fixture(t, false, mixed)
  const input = {
    title: 'شفهي دفعة',
    category: 'oral',
    evaluationMode: 'qr',
    applicantIds: mixed.map((p) => p.id),
    groups: groupApplicants(mixed).map((group) => ({ key: group.key, ...config(group.profileId) })),
  }
  const created = service.create(admin, input)
  assert.equal(created.exams.length, 3)
  const byRole = Object.fromEntries(created.exams.map((item) => [item.exam.oral_role, item]))
  assert.equal(byRole.technician.roster.length, 1)
  assert.equal(byRole.programmer.roster.length, 1)
  assert.equal(byRole.network_engineer.roster.length, 1)
  assert.match(byRole.technician.exam.title, /فني/)
  assert.match(byRole.programmer.exam.title, /برمجة/)
  assert.match(byRole.network_engineer.exam.title, /شبكات/)
})

test('admin can add a late applicant to an active exam with the same question count', (t) => {
  const late = { id: 'late', name: 'مرشح لاحق', jobTitle: 'مهندس شبكات', seqNumber: 9 }
  const { db, service } = fixture(t, false, [...people, late])
  const created = service.create(admin, body('theory', { questionCount: 4 }))
  const enrolled = service.enrollLate(admin, created.exam.id, late)
  assert.equal(enrolled.questionCount, 4)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exam_roster WHERE exam_id=?').get(created.exam.id).n, people.length + 1)
  const set = db.prepare('SELECT questions_json FROM exam_question_sets WHERE roster_id=?').get(enrolled.rosterId)
  assert.equal(JSON.parse(set.questions_json).length, 4)
  assert.throws(() => service.enrollLate(admin, created.exam.id, late), /مسجّل/)
})
