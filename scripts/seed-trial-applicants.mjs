/**
 * يضيف متقدمين تجريبيين لكل مسمى معروف، دون حذف السجلات الحالية.
 * الاستخدام: node scripts/seed-trial-applicants.mjs
 */
import { db } from '../server/db.js'
import { createApplicant } from '../server/applicants.js'
import { JOB_PROFILES, resolveJobProfile } from '../shared/jobProfiles.js'
import { resolveEvaluationStream, tracksForApplicant } from '../shared/evaluationMatrix.js'

const PER_TITLE = 2
const ORG = 'تجربة الفرز'
const FIRST = ['أحمد', 'محمد', 'علي', 'خالد', 'سامي', 'ياسر', 'فادي', 'مازن', 'هاني', 'كريم', 'وليد', 'تامر', 'باسل', 'جواد', 'حسام', 'نضال', 'حسين', 'سليمان', 'عمر', 'يوسف', 'إبراهيم', 'مصطفى', 'طارق', 'زياد', 'فهد', 'بدر', 'رامي', 'لؤي', 'غسان', 'نزار', 'وسيم', 'أنس', 'بلال', 'جمال', 'حازم', 'راكان', 'سالم', 'شادي', 'ماهر', 'علاء']
const FATHER = ['عبدالله', 'حسن', 'إبراهيم', 'محمود', 'سعيد', 'فهد', 'خالد', 'أحمد', 'محمد', 'علي', 'يوسف', 'عمر', 'مصطفى', 'طارق', 'وليد', 'سامي', 'ياسر', 'مازن', 'هاني', 'كريم']
const FAMILY = ['الحموي', 'الحلبي', 'الدمشقي', 'الحمصي', 'اللاذقاني', 'الإدلبي', 'الدرعاوي', 'السويدي', 'القلموني', 'الزبداني', 'البكري', 'الرفاعي', 'الجندي', 'الخالدي', 'العمري', 'الخطيب', 'العظمة', 'السباعي', 'المصري', 'النعسان']

function titleFor(profile) {
  for (const alias of [profile.label, ...(profile.aliases || [])]) {
    if (resolveJobProfile(alias)?.id === profile.id) return alias
  }
  return null
}

function uniqueName(used, index) {
  for (let step = 0; step < FIRST.length * FATHER.length * FAMILY.length; step += 1) {
    const n = index + step
    const name = `${FIRST[n % FIRST.length]} ${FATHER[Math.floor(n / FIRST.length) % FATHER.length]} ${FAMILY[Math.floor(n / (FIRST.length * FATHER.length)) % FAMILY.length]}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  throw new Error('نفدت الأسماء التجريبية الفريدة')
}

const existingNames = new Set(db.prepare('SELECT name FROM applicants').all().map((row) => row.name))
const trialRows = db.prepare('SELECT job_title AS jobTitle, extra_json AS extraJson FROM applicants').all().filter((row) => {
  try {
    return JSON.parse(row.extraJson || '{}').تجريبي === 'نعم'
  } catch {
    return false
  }
})
const trialCountByTitle = new Map()
for (const row of trialRows) {
  trialCountByTitle.set(row.jobTitle, (trialCountByTitle.get(row.jobTitle) || 0) + 1)
}

const profiles = JOB_PROFILES.filter((profile) => profile.id !== 'unclassified')
const created = []
const skipped = []
let nameIndex = existingNames.size

const insert = db.transaction(() => {
  for (const profile of profiles) {
    const jobTitle = titleFor(profile)
    if (!jobTitle) {
      skipped.push(profile.label)
      continue
    }
    const have = trialCountByTitle.get(jobTitle) || 0
    for (let slot = have; slot < PER_TITLE; slot += 1) {
      const name = uniqueName(existingNames, nameIndex)
      nameIndex += 1
      const applicant = createApplicant({
        name,
        org: ORG,
        jobTitle,
        jobTitleCommittee: jobTitle,
        rank: 'مدني',
        extra: { 'نوع المقابلة': 'داخلية', تجريبي: 'نعم' },
      })
      created.push(applicant)
    }
  }
})
insert()

const byStream = new Map()
for (const applicant of created) {
  const stream = resolveEvaluationStream(applicant)
  const row = byStream.get(stream.id) || { label: stream.label, count: 0, tracks: tracksForApplicant(applicant).map((track) => track.label).join('، ') }
  row.count += 1
  byStream.set(stream.id, row)
}

console.log(`✓ أُضيف ${created.length} متقدماً تجريبياً (${PER_TITLE} لكل مسمى)`)
for (const row of byStream.values()) {
  console.log(`  • ${row.label}: ${row.count} — ${row.tracks}`)
}
if (skipped.length) console.log(`تخطي مسميات بلا مرادف مطابق: ${skipped.join('، ')}`)
const total = db.prepare('SELECT COUNT(*) AS c FROM applicants').get().c
console.log(`مجموع المتقدمين في السجل: ${total}`)
