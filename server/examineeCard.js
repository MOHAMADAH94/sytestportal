import { tracksForApplicant } from '../shared/evaluationMatrix.js'
import { canonicalOralRole, oralRolesCompatible } from '../shared/jobProfiles.js'

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)
}

function applicantRecord(db, applicantId, name) {
  if (!tableExists(db, 'applicants')) return null
  const cols = new Set(db.prepare('PRAGMA table_info(applicants)').all().map((column) => column.name))
  const pick = (column) => (cols.has(column) ? column : "''")
  const sql = `SELECT id, ${pick('job_title')} AS job_title, ${pick('job_title_org')} AS job_title_org, ${pick('job_title_committee')} AS job_title_committee, ${cols.has('extra_json') ? 'extra_json' : 'NULL'} AS extra_json FROM applicants`
  if (applicantId) {
    const row = db.prepare(`${sql} WHERE id=?`).get(applicantId)
    if (row) return row
  }
  if (name) return db.prepare(`${sql} WHERE name=?`).get(name) || null
  return null
}

function demandTitleOf(applicant, extra) {
  const stored = applicant?.extra_json ? JSON.parse(applicant.extra_json) : {}
  return String(
    applicant?.job_title_org
    || stored['مسمى العمل طلب الاحتياج']
    || stored['المسمى الوارد من الجهة']
    || stored['مسمى العمل المقترح من الجهة']
    || stored['مسمى المرفوع']
    || extra?.['مسمى العمل طلب الاحتياج']
    || extra?.['المسمى الوارد من الجهة']
    || extra?.['مسمى العمل المقترح من الجهة']
    || extra?.['مسمى المرفوع']
    || '',
  ).trim()
}

function theoryTrackOf(exam) {
  if (exam.theoryTrack === 'office' || exam.theoryTrack === 'general') return exam.theoryTrack
  const owner = String(exam.ownerUsername || '').toLowerCase()
  if (owner === 'office') return 'office'
  // theory و theory2 وكل حساب عام آخر
  return 'general'
}

function examCoversTrack(exam, track) {
  if (track.category === 'driving' || track.category === 'personality') return exam.category === track.category
  if (track.category === 'theory') return exam.category === 'theory' && theoryTrackOf(exam) === track.theoryTrack
  if (track.category === 'oral') {
    if (exam.category !== 'oral') return false
    const role = canonicalOralRole(exam.oralRole) || exam.oralRole
    return (track.oralRoles || []).some((item) => item === role || oralRolesCompatible(item, exam.oralRole))
  }
  return false
}

function finishedExams(db, applicantId, name) {
  if (!applicantId && !name) return []
  if (!tableExists(db, 'exam_roster') || !tableExists(db, 'exams')) return []
  const examCols = new Set(db.prepare('PRAGMA table_info(exams)').all().map((column) => column.name))
  const deleted = examCols.has('deleted_at') ? 'AND e.deleted_at IS NULL' : ''
  const hasCommittees = tableExists(db, 'committees') && tableExists(db, 'committee_assignments')
  const hasResults = tableExists(db, 'committee_results')
  const hasAttempts = tableExists(db, 'attempts')
  const published = hasResults
    ? `EXISTS(SELECT 1 FROM committee_results cr JOIN committee_assignments ca ON ca.id=cr.assignment_id WHERE ca.exam_id=e.id AND cr.examinee_name=r.name)`
    : '0'
  const scored = hasAttempts
    ? `EXISTS(SELECT 1 FROM attempts a WHERE a.exam_id=e.id AND a.examinee_name=r.name AND COALESCE(a.max_score,0) > 0)`
    : '0'
  const theory = hasCommittees ? 'c.theory_track' : 'NULL'
  const owner = hasCommittees ? 'c.owner_username' : 'NULL'
  const join = hasCommittees
    ? 'LEFT JOIN committee_assignments asn ON asn.exam_id=e.id LEFT JOIN committees c ON c.id=asn.committee_id'
    : ''
  return db.prepare(
    `SELECT DISTINCT e.category AS category, e.oral_role AS oralRole, ${theory} AS theoryTrack, ${owner} AS ownerUsername,
            (${published} OR ${scored}) AS done
     FROM exam_roster r
     JOIN exams e ON e.id=r.exam_id
     ${join}
     WHERE (r.applicant_id=? OR r.name=?) ${deleted}`,
  ).all(applicantId || '', name || '')
}

function securityDone(db, applicantId, name) {
  if (!tableExists(db, 'security_reviews')) return false
  const cols = new Set(db.prepare('PRAGMA table_info(security_reviews)').all().map((column) => column.name))
  if (!cols.has('decision')) return false
  const current = cols.has('superseded_at') ? 'AND superseded_at IS NULL' : ''
  if (applicantId && cols.has('applicant_id')) {
    const row = db.prepare(`SELECT decision FROM security_reviews WHERE applicant_id=? ${current} LIMIT 1`).get(applicantId)
    if (row) return true
  }
  if (name && cols.has('examinee_name')) {
    return !!db.prepare(`SELECT decision FROM security_reviews WHERE examinee_name=? ${current} LIMIT 1`).get(name)
  }
  return false
}

/** ينتقل المتقدم إلى الممتحنين بعد إنهاء كل اختبارات صنفه، لا بعد أول نتيجة. */
export function hasFinishedAllRequiredExams(db, applicant) {
  const required = tracksForApplicant(applicant).filter((track) => track.category !== 'security')
  if (!required.length) return false
  const doneExams = finishedExams(db, applicant?.id, applicant?.name)
  return required.every((track) => doneExams.some((exam) => exam.done && examCoversTrack(exam, track)))
}

/** مسمى طلب الاحتياج ومسارات آلية التقييم الظاهرة على بطاقة الدخول. */
export function examineeCardInfo(db, { applicantId = null, name = '', jobTitle = '', extra = null } = {}) {
  const applicant = applicantRecord(db, applicantId, name)
  let storedExtra = {}
  try { storedExtra = applicant?.extra_json ? JSON.parse(applicant.extra_json) : {} } catch { storedExtra = {} }
  const person = {
    jobTitle: applicant?.job_title_committee || applicant?.job_title || jobTitle || '',
    jobTitleOrg: applicant?.job_title_org || '',
    jobTitleCommittee: applicant?.job_title_committee || '',
    extra: { ...(extra || {}), ...storedExtra },
  }
  const doneExams = finishedExams(db, applicant?.id || applicantId, name)
  const tracks = tracksForApplicant(person).map((track) => ({
    id: track.id,
    label: track.label,
    done: track.id === 'security'
      ? securityDone(db, applicant?.id || applicantId, name)
      : doneExams.some((exam) => exam.done && examCoversTrack(exam, track)),
  }))
  return { demandTitle: demandTitleOf(applicant, extra), tracks }
}

/** يربط كل اختبار بمسار آلية التقييم ووزنه، ويُبقي المسارات المطلوبة حتى بلا علامة. */
export function describeExamineeExams(applicant, exams) {
  const tracks = tracksForApplicant(applicant || {})
  const used = new Set()
  const results = []
  for (const exam of exams || []) {
    const track = tracks.find((item) => item.category !== 'security' && examCoversTrack(exam, item))
    if (track) used.add(track.id)
    results.push({
      examId: exam.examId || null,
      title: String(exam.title || track?.label || 'اختبار').trim() || 'اختبار',
      category: exam.category || track?.category || null,
      trackId: track?.id || null,
      trackLabel: track?.label || null,
      weight: track ? track.weight : null,
      score: exam.score == null || Number.isNaN(Number(exam.score)) ? null : Number(exam.score),
    })
  }
  for (const track of tracks) {
    if (track.category === 'security' || used.has(track.id)) continue
    results.push({
      examId: null,
      title: track.label,
      category: track.category,
      trackId: track.id,
      trackLabel: track.label,
      weight: track.weight,
      score: null,
    })
  }
  return results
}
