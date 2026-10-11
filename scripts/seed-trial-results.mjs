/**
 * بيانات تجريبية: متقدمان لكل تصنيف، مع علامات مكتملة حتى يظهرا في الممتحنين.
 * التشغيل: node scripts/seed-trial-results.mjs
 */
import { randomUUID } from 'node:crypto'
import { db } from '../server/db.js'
import { createApplicant } from '../server/applicants.js'
import { hasFinishedAllRequiredExams } from '../server/examineeCard.js'
import { decisionForApplicant } from '../server/decisionEngine.js'

const ORG = 'تجريب النتائج'
const AUTHOR = 'trial-results'
const now = new Date().toISOString()

const PEOPLE = [
  { name: 'أحمد خالد الخدمي', jobTitle: 'حارس', scores: { general: 92 } },
  { name: 'سامي نبيل الخدمي', jobTitle: 'حارس', scores: { general: 54 } },
  { name: 'مازن عادل الإداري', jobTitle: 'إداري', scores: { writing: 90, driving: 88, personality: 84 } },
  { name: 'فادي وليد الإداري', jobTitle: 'إداري', scores: { writing: 58, driving: 72, personality: 70 } },
  { name: 'كريم سامي البرمجيات', jobTitle: 'مبرمج', scores: { writing: 80, personality: 78, driving: 82, programming: 90 } },
  { name: 'ياسر هاني البرمجيات', jobTitle: 'مبرمج', scores: { writing: 70, personality: 66, driving: 64, programming: 55 } },
  { name: 'لؤي باسل الشبكات', jobTitle: 'مهندس شبكات', scores: { writing: 85, personality: 80, driving: 88, networks: 92 } },
  { name: 'رامي جواد الشبكات', jobTitle: 'مهندس شبكات', scores: { writing: 74, personality: 71, driving: 69, networks: 68 } },
  { name: 'حسن عماد الفني', jobTitle: 'فني حاسب آلي', scores: { writing: 91, personality: 86, driving: 84, maintenance: 88 } },
  { name: 'طارق منير الفني', jobTitle: 'فني حاسب آلي', scores: { writing: 61, personality: 63, driving: 60, maintenance: 62 } },
]

const EXAMS = [
  { key: 'general', title: 'تجريب — عام', category: 'theory', oralRole: null, level: 'technician', owner: 'theory' },
  { key: 'writing', title: 'تجريب — كتابي', category: 'theory', oralRole: null, level: 'technician', owner: 'office' },
  { key: 'driving', title: 'تجريب — أهلية قيادة', category: 'driving', oralRole: null, level: 'technician', owner: 'driving' },
  { key: 'personality', title: 'تجريب — شخصية', category: 'personality', oralRole: null, level: 'technician', owner: 'personality' },
  { key: 'programming', title: 'تجريب — برمجة', category: 'oral', oralRole: 'programmer', level: 'engineer', owner: 'oral_prog' },
  { key: 'networks', title: 'تجريب — شبكات', category: 'oral', oralRole: 'network_engineer', level: 'engineer', owner: 'oral_net' },
  { key: 'maintenance', title: 'تجريب — فني', category: 'oral', oralRole: 'technician', level: 'technician', owner: 'oral_tech' },
]

function cleanup() {
  const people = db.prepare('SELECT id, name FROM applicants WHERE org=?').all(ORG)
  const exams = db.prepare('SELECT id FROM exams WHERE created_by=?').all(AUTHOR)
  const removeAttempts = db.prepare('DELETE FROM attempts WHERE applicant_id=? OR exam_id=?')
  const removeRoster = db.prepare('DELETE FROM exam_roster WHERE applicant_id=? OR exam_id=?')
  for (const person of people) {
    removeAttempts.run(person.id, '')
    removeRoster.run(person.id, '')
    db.prepare('DELETE FROM examinee_profiles WHERE name=?').run(person.name)
    db.prepare('DELETE FROM committee_candidates WHERE applicant_id=?').run(person.id)
    db.prepare('DELETE FROM applicants WHERE id=?').run(person.id)
  }
  for (const exam of exams) {
    db.prepare('DELETE FROM attempts WHERE exam_id=?').run(exam.id)
    db.prepare('DELETE FROM exam_roster WHERE exam_id=?').run(exam.id)
    db.prepare('DELETE FROM committee_assignments WHERE exam_id=?').run(exam.id)
    db.prepare('DELETE FROM exams WHERE id=?').run(exam.id)
  }
}

const run = db.transaction(() => {
  cleanup()
  const applicants = PEOPLE.map((person) => {
    const row = createApplicant({
      name: person.name,
      org: ORG,
      jobTitle: person.jobTitle,
      jobTitleOrg: person.jobTitle,
    })
    return { ...person, id: row.id, displayId: row.displayId }
  })

  const examIds = {}
  for (const spec of EXAMS) {
    const id = `trial-exam-${spec.key}`
    const committee = db.prepare('SELECT id FROM committees WHERE owner_username=? COLLATE NOCASE').get(spec.owner)
    if (!committee) throw new Error(`لا لجنة للحساب ${spec.owner}`)
    db.prepare(
      `INSERT INTO exams(id,title,category,level,oral_role,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_by,created_at,active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    ).run(
      id,
      spec.title,
      spec.category,
      spec.level,
      spec.oralRole,
      10,
      1,
      `trial_${spec.key}`,
      'x',
      '',
      '[]',
      '[]',
      AUTHOR,
      now,
    )
    db.prepare('INSERT INTO committee_assignments(id, committee_id, exam_id) VALUES (?,?,?)').run(randomUUID(), committee.id, id)
    examIds[spec.key] = id
  }

  let seq = 1
  for (const person of applicants) {
    for (const [track, percent] of Object.entries(person.scores)) {
      const examId = examIds[track]
      const rosterId = randomUUID()
      db.prepare(
        `INSERT INTO exam_roster(id,exam_id,seq_number,applicant_id,name,display_id,org,job_title,username,password_hash,password_plain,qr_token,used,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      ).run(
        rosterId,
        examId,
        seq,
        person.id,
        person.name,
        person.displayId,
        ORG,
        person.jobTitle,
        `trial_${track}_${seq}`,
        'x',
        '',
        randomUUID(),
        now,
      )
      db.prepare(
        `INSERT INTO attempts(id,exam_id,examinee_name,applicant_id,roster_id,answers_json,score,max_score,started_at,finished_at,evaluation_status)
         VALUES (?,?,?,?,?,'[]',?,100,?,?, 'completed')`,
      ).run(randomUUID(), examId, person.name, person.id, rosterId, percent, now, now)
      seq += 1
    }
  }
  return applicants
})

const applicants = run()
console.log('\n—— نتائج التجريب ——')
for (const person of applicants) {
  const record = {
    id: person.id,
    name: person.name,
    jobTitle: person.jobTitle,
    jobTitleOrg: person.jobTitle,
  }
  const ready = hasFinishedAllRequiredExams(db, record)
  const decision = decisionForApplicant(person.id)
  console.log(
    `${person.name} | ${person.jobTitle} | ممتحن=${ready ? 'نعم' : 'لا'} | ${decision.labelAr} ${decision.compositePercent ?? '—'}% | ${JSON.stringify(person.scores)}`,
  )
  if (!ready) process.exitCode = 1
}
