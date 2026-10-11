import { tracksForApplicant } from './evaluationMatrix.js'
import { isSafePrefixNameMatch, normalizePersonName, splitTripleName } from './personName.js'

const PROFILE_BEFORE = [
  ['displayId', 'المعرّف'],
  ['examineeName', 'الاسم الثلاثي'],
]

const IDENTITY_COLUMNS = [
  ['father', 'اسم الأب'],
  ['mother', 'اسم الأم'],
  ['birth', 'التولد'],
]

const PROFILE_AFTER = [
  ['org', 'الجهة'],
  ['jobTitle', 'المسمى الوظيفي'],
  ['rank', 'الرتبة'],
]

const RETURNED_FIELDS = [
  ['jobTitleOrg', 'المسمى الوارد من الجهة'],
  ['jobTitleCommittee', 'المسمى المقترح من اللجنة'],
  ['proposedSalary', 'الراتب المقترح'],
  ['rankCommittee', 'الرتبة المقترحة من اللجنة'],
  ['approvedSalary', 'الراتب المقرر من مدير الإدارة'],
  ['educationCommittee', 'التحصيل العلمي من اللجنة'],
]

const EXTRA_ORDER = [
  'الرقم الوطني',
  'مكان السكن الحالي',
  'مكان السكن الأصلي',
  'الوضع العائلي',
  'نوع الشهادة',
  'الاختصاص',
  'السنة او التخرج',
  'السوية الثانية',
  'السوية الثالثة',
  'مسمى العمل',
  'فرز اللجان',
  'نوع المقابلة',
  'الشخص المرشح',
  'ملاحظات',
]

const FATHER_KEYS = ['اسم الاب', 'اسم الأب', 'اسم الوالد']
const MOTHER_KEYS = ['اسم الام', 'اسم الأم', 'اسم الوالدة']
const BIRTH_KEYS = ['التولد', 'تاريخ التولد', 'تاريخ الميلاد', 'تاريخ الولادة', 'الولادة']
const NATIONAL_ID_KEYS = ['الرقم الوطني', 'رقم وطني']

const TRACK_ORDER = ['general', 'writing', 'driving', 'personality', 'admin_oral', 'maintenance', 'programming', 'networks']

function normKey(value) {
  return normalizePersonName(String(value || '').replace(/[ـ_]+/g, ' '))
}

function cell(value) {
  if (value == null || value === '') return ''
  return value
}

function extraValue(extra, keys) {
  const map = new Map()
  for (const [key, value] of Object.entries(extra || {})) {
    if (!map.has(normKey(key))) map.set(normKey(key), value)
  }
  for (const key of keys) {
    const value = map.get(normKey(key))
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function identityFields(row) {
  const extra = row?.extra || {}
  const parts = splitTripleName(row?.examineeName)
  return {
    father: extraValue(extra, FATHER_KEYS) || parts.father || '',
    mother: extraValue(extra, MOTHER_KEYS),
    birth: extraValue(extra, BIRTH_KEYS),
  }
}

function identityKey(row) {
  const fields = identityFields(row)
  return {
    name: normalizePersonName(row?.examineeName),
    first: normalizePersonName(splitTripleName(row?.examineeName).first),
    father: normalizePersonName(fields.father),
    mother: normalizePersonName(fields.mother),
    birth: normKey(fields.birth).replace(/\s/g, ''),
    nid: extraValue(row?.extra, NATIONAL_ID_KEYS).replace(/\s/g, ''),
  }
}

function namesSimilar(left, right) {
  if (!left.name || !right.name) return false
  if (left.name === right.name) return true
  if (left.first && left.first === right.first && left.father && left.father === right.father) return true
  return isSafePrefixNameMatch(left.name, right.name)
}

/** نفس الشخص فقط إذا تطابق اسم الأب واسم الأم وتاريخ التولد مع تشابه الاسم. */
function samePerson(left, right) {
  if (left.nid && left.nid === right.nid) return true
  if (!left.father || !right.father || left.father !== right.father) return false
  if (!left.mother || !right.mother || left.mother !== right.mother) return false
  if (!left.birth || !right.birth || left.birth !== right.birth) return false
  return namesSimilar(left, right)
}

function fillBlank(current, incoming) {
  if (current != null && String(current).trim() !== '') return current
  return incoming == null || String(incoming).trim() === '' ? current : incoming
}

function mergeExtra(left, right) {
  const out = { ...(left || {}) }
  for (const [key, value] of Object.entries(right || {})) {
    if (out[key] == null || String(out[key]).trim() === '') out[key] = value
  }
  return out
}

function mergeExams(left, right) {
  const list = [...(left || [])]
  for (const exam of right || []) {
    const index = list.findIndex((item) =>
      (exam?.trackId && item?.trackId === exam.trackId) ||
      (!exam?.trackId && exam?.title && item?.title === exam.title),
    )
    if (index === -1) list.push(exam)
    else if (list[index]?.score == null && exam?.score != null) list[index] = { ...list[index], ...exam }
  }
  return list
}

function scoredCount(row) {
  return (row?.examResults || []).filter((exam) => exam?.score != null).length
}

function mergeRows(left, right) {
  const primary = scoredCount(left) >= scoredCount(right) ? left : right
  const secondary = primary === left ? right : left
  const name = String(primary.examineeName || '').trim().length >= String(secondary.examineeName || '').trim().length
    ? primary.examineeName
    : secondary.examineeName
  const merged = { ...secondary, ...primary, examineeName: name }
  for (const key of ['displayId', 'org', 'jobTitle', 'rank', 'jobTitleOrg', 'jobTitleCommittee', 'rankCommittee', 'educationCommittee', 'finalPercent']) {
    merged[key] = fillBlank(primary[key], secondary[key])
  }
  merged.proposedSalary = fillBlank(primary.proposedSalary, secondary.proposedSalary)
  merged.approvedSalary = fillBlank(primary.approvedSalary, secondary.approvedSalary)
  merged.extra = mergeExtra(primary.extra, secondary.extra)
  merged.examResults = mergeExams(primary.examResults, secondary.examResults)
  return merged
}

function mergeSimilarRows(rows) {
  const groups = []
  for (const row of rows) {
    const key = identityKey(row)
    const group = groups.find((item) => samePerson(item.key, key))
    if (!group) groups.push({ key, rows: [row] })
    else group.rows.push(row)
  }
  return groups.map((group) => group.rows.reduce(mergeRows))
}

function examTitle(exam) {
  return String(exam?.title || exam?.trackLabel || 'اختبار').trim() || 'اختبار'
}

function columnName(exam) {
  const title = examTitle(exam)
  const weight = exam?.weight
  return weight == null || weight === '' ? title : `${title} (${weight}%)`
}

function matrixTracks(row) {
  return tracksForApplicant({
    jobTitle: row?.jobTitleCommittee || row?.jobTitle || row?.jobTitleOrg || '',
    jobTitleOrg: row?.jobTitleOrg || '',
    jobTitleCommittee: row?.jobTitleCommittee || '',
    extra: row?.extra || {},
  }).filter((track) => track.category !== 'security')
}

/** يثبّت وزن المصفوفة الحالي حتى لو وصلت النتيجة بوزن قديم. */
function withMatrixWeight(row, exam) {
  const tracks = matrixTracks(row)
  if (!tracks.length || !exam) return exam
  const track = tracks.find((item) => item.id && item.id === exam.trackId)
    || tracks.find((item) => item.label && (item.label === exam.trackLabel || item.label === exam.title))
  if (!track) return exam
  return { ...exam, trackId: track.id, trackLabel: track.label, weight: track.weight }
}

function scoredExams(row) {
  return (row?.examResults || []).map((exam) => withMatrixWeight(row, exam)).filter((exam) => exam?.score != null)
}

/** العلامة من 100 مضروبة بوزن الاختبار: 75 في وزن 40 تُكتب 30. */
function weightedScore(exam) {
  const score = Number(exam?.score)
  if (!Number.isFinite(score)) return ''
  const weight = Number(exam?.weight)
  if (!Number.isFinite(weight)) return score
  return Math.round((score * weight) / 100 * 100) / 100
}

const CONSUMED_EXTRA = new Set([...FATHER_KEYS, ...MOTHER_KEYS, ...BIRTH_KEYS].map(normKey))

function extraColumns(rows) {
  const keys = new Set()
  for (const row of rows) {
    for (const [key, value] of Object.entries(row?.extra || {})) {
      if (value == null || String(value).trim() === '') continue
      if (CONSUMED_EXTRA.has(normKey(key))) continue
      keys.add(key)
    }
  }
  const ordered = []
  for (const label of EXTRA_ORDER) {
    const hit = [...keys].find((key) => normKey(key) === normKey(label))
    if (hit) {
      ordered.push(hit)
      keys.delete(hit)
    }
  }
  return [...ordered, ...[...keys].sort((a, b) => a.localeCompare(b, 'ar'))]
}

export function buildExamineeScoreSheet(rows) {
  const list = mergeSimilarRows(Array.isArray(rows) ? rows : [])
  const profileBefore = PROFILE_BEFORE
  const profileAfter = PROFILE_AFTER.filter(([key]) => key !== 'rank' || list.some((row) => row?.rank !== undefined))
  const returned = RETURNED_FIELDS.filter(([key]) => list.some((row) => row?.[key] != null && String(row[key]).trim() !== ''))
  const extras = extraColumns(list)
  const exams = []
  for (const row of list) {
    for (const exam of scoredExams(row)) {
      const header = columnName(exam)
      if (!exams.some((item) => item.header === header)) {
        exams.push({ header, trackId: exam.trackId || null, title: examTitle(exam) })
      }
    }
  }
  exams.sort((a, b) => {
    const ai = TRACK_ORDER.indexOf(a.trackId || '')
    const bi = TRACK_ORDER.indexOf(b.trackId || '')
    const ao = ai === -1 ? TRACK_ORDER.length : ai
    const bo = bi === -1 ? TRACK_ORDER.length : bi
    if (ao !== bo) return ao - bo
    return a.title.localeCompare(b.title, 'ar')
  })

  const header = [
    ...profileBefore.map(([, label]) => label),
    ...IDENTITY_COLUMNS.map(([, label]) => label),
    ...profileAfter.map(([, label]) => label),
    ...returned.map(([, label]) => label),
    ...extras,
    ...exams.map((exam) => exam.header),
    'العلامة النهائية',
  ]
  const data = list.map((row) => {
    const identity = identityFields(row)
    const byHeader = new Map()
    for (const exam of scoredExams(row)) {
      byHeader.set(columnName(exam), exam)
    }
    return [
      ...profileBefore.map(([key]) => cell(row?.[key])),
      ...IDENTITY_COLUMNS.map(([key]) => cell(identity[key])),
      ...profileAfter.map(([key]) => cell(row?.[key])),
      ...returned.map(([key]) => cell(row?.[key])),
      ...extras.map((key) => cell(row?.extra?.[key])),
      ...exams.map((exam) => cell(weightedScore(byHeader.get(exam.header)))),
      cell(row?.finalPercent),
    ]
  })
  return { header, data }
}
