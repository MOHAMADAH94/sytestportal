import { db } from './db.js'
import { hasFinishedAllRequiredExams } from './examineeCard.js'
import { requiredExamCategories } from '../shared/evaluationMatrix.js'
import { normalizeTitle } from '../shared/jobProfiles.js'
import { assertTripleName, isSafePrefixNameMatch, normalizePersonName } from '../shared/personName.js'
import { pickRosterMeta, upsertExamineeProfile } from './rosterMeta.js'

function nowIso() {
  return new Date().toISOString()
}

function makeDisplayId(seq) {
  return `APP-${String(seq).padStart(4, '0')}`
}

function mapApplicantRow(r) {
  return {
    id: r.id,
    displayId: r.display_id || makeDisplayId(r.seq_number),
    seqNumber: r.seq_number,
    name: r.name,
    org: r.org || '',
    jobTitle: r.job_title || '',
    rank: r.rank || '',
    jobTitleOrg: r.job_title_org || '',
    jobTitleCommittee: r.job_title_committee || '',
    proposedSalary: r.proposed_salary != null ? Number(r.proposed_salary) : null,
    rankCommittee: r.rank_committee || '',
    approvedSalary: r.approved_salary != null ? Number(r.approved_salary) : null,
    educationCommittee: r.education_committee || '',
    extra: r.extra_json ? JSON.parse(r.extra_json) : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

db.exec(`CREATE TABLE IF NOT EXISTS hidden_people (
  person_key TEXT PRIMARY KEY,
  applicant_id TEXT,
  name TEXT,
  hidden_at TEXT NOT NULL,
  hidden_by TEXT
)`)

function hiddenKeySet() {
  return new Set(db.prepare('SELECT person_key FROM hidden_people').all().map((row) => row.person_key))
}

export function isHiddenPerson(applicantId, name) {
  const hidden = hiddenKeySet()
  return (applicantId && hidden.has(`id:${applicantId}`)) || (name && hidden.has(`name:${name}`))
}

/** يبقى المتقدم في السجل حتى ينهي كل اختبارات صنفه، ثم ينتقل إلى الممتحنين. */
export function listPendingApplicants() {
  const hidden = hiddenKeySet()
  return listApplicants().filter((applicant) =>
    !hidden.has(`id:${applicant.id}`)
    && !hidden.has(`name:${applicant.name}`)
    && !hasFinishedAllRequiredExams(db, applicant),
  )
}

function hidePerson({ applicantId, name, actor }) {
  const now = nowIso()
  const insert = db.prepare(`INSERT INTO hidden_people(person_key, applicant_id, name, hidden_at, hidden_by)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(person_key) DO NOTHING`)
  if (applicantId) insert.run(`id:${applicantId}`, applicantId, name || null, now, actor || null)
  if (name) insert.run(`name:${name}`, applicantId || null, name, now, actor || null)
  if (applicantId && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='committee_candidates'").get()) {
    db.prepare('DELETE FROM committee_candidates WHERE applicant_id = ?').run(applicantId)
  }
}

function parseSalary(val) {
  if (val == null || val === '') return null
  const num = Number(String(val).replace(/,/g, '').trim())
  return Number.isFinite(num) ? num : null
}

function extraByLoose(extra, test) {
  for (const [key, value] of Object.entries(extra || {})) {
    const compact = String(key).replace(/\s+/g, '')
    if (!test(compact)) continue
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

/** عمود «فرز اللجان» هو أساس التصنيف، ويُختزل إلى المسميات الخمسة. */
function canonicalCommitteeSort(extra) {
  const raw = extraByLoose(extra, (compact) => compact.includes('فرز') && compact.includes('لجان'))
  if (!raw) return ''
  const n = normalizeTitle(raw).replace(/ة/g, 'ه')
  if (n.includes('خدم')) return 'خدمي'
  if (n.includes('شبك')) return 'شبكات'
  if (n.includes('برمج')) return 'برمجة'
  if (n.includes('صيان')) return 'صيانة'
  if (n.includes('دار')) return 'اداري'
  return ''
}

function extractCommitteeFields(source = {}, extra = {}) {
  const jobTitleOrg =
    source.jobTitleOrg ??
    extra['المسمى الوارد من الجهة'] ??
    extra['مسمى العمل المقترح من الجهة'] ??
    extra['مسمى العمل طلب الاحتياج'] ??
    extra['مسمى المرفوع'] ??
    ''
  const sortLabel = canonicalCommitteeSort(extra)
  const jobTitleCommittee =
    (source.jobTitleCommittee != null && String(source.jobTitleCommittee).trim())
      ? String(source.jobTitleCommittee).trim()
      : (sortLabel ||
        extra['المسمى المقترح من اللجنة'] ||
        extra['مسمى عمل  - اللجنة'] ||
        extra['مسمى عمل - اللجنة'] ||
        '')
  const proposedSalary = parseSalary(
    source.proposedSalary ??
    extra['الراتب المقترح'] ??
    extra['راتب مقترح من الجهة']
  )
  const rankCommittee =
    source.rankCommittee ??
    extra['الرتبة المقترحة من اللجنة'] ??
    ''
  const approvedSalary = parseSalary(
    source.approvedSalary ??
    extra['الراتب المقرر من مدير الإدارة']
  )
  const educationCommittee =
    source.educationCommittee ??
    extra['التحصيل العلمي من اللجنة'] ??
    extra['التأهيل العلمي مع الاختصاص'] ??
    extra['المستوى العلمي'] ??
    ''

  return {
    jobTitleOrg: String(jobTitleOrg || '').trim(),
    jobTitleCommittee: String(jobTitleCommittee || '').trim(),
    proposedSalary,
    rankCommittee: String(rankCommittee || '').trim(),
    approvedSalary,
    educationCommittee: String(educationCommittee || '').trim(),
  }
}

function nextSeqNumber() {
  const row = db.prepare('SELECT COALESCE(MAX(seq_number), 0) AS m FROM applicants').get()
  return (row?.m || 0) + 1
}

export function countApplicants() {
  return db.prepare('SELECT COUNT(*) AS c FROM applicants').get().c
}

function findByName(name) {
  return db.prepare('SELECT * FROM applicants WHERE name = ?').get(String(name || '').trim())
}

function findById(id) {
  return db.prepare('SELECT * FROM applicants WHERE id = ?').get(id)
}

function nationalIdFrom(extra = {}) {
  for (const [key, value] of Object.entries(extra || {})) {
    const label = String(key)
    if (/رقم\s*وطني|الرقم الوطني|national/i.test(label)) {
      const id = String(value || '').trim()
      if (id) return id
    }
  }
  return ''
}

function parseExtraJson(raw) {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** مطابقة الاستيراد: رقم وطني، ثم اسم+تسلسل، ثم الاسم وحده، ثم اسم مُطبَّع. */
function findImportHit(parsed) {
  const allRows = db.prepare('SELECT * FROM applicants').all()
  const nid = nationalIdFrom(parsed.extra)
  if (nid) {
    const byNid = allRows.filter((row) => nationalIdFrom(parseExtraJson(row.extra_json)) === nid)
    if (byNid.length === 1) return byNid[0]
    if (byNid.length > 1) {
      return byNid.find((row) => Number(row.seq_number) === Number(parsed.seqNumber)) || byNid[0]
    }
  }

  const exact = allRows.filter(
    (row) => row.name === parsed.name && Number(row.seq_number) === Number(parsed.seqNumber),
  )
  if (exact.length === 1) return exact[0]

  const byExactName = allRows.filter((row) => row.name === parsed.name)
  if (byExactName.length === 1) return byExactName[0]
  if (byExactName.length > 1) {
    return (
      byExactName.find((row) => Number(row.seq_number) === Number(parsed.seqNumber)) ||
      byExactName.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
    )
  }

  const target = normalizePersonName(parsed.name)
  if (!target) return null
  const byNorm = allRows.filter((row) => normalizePersonName(row.name) === target)
  if (byNorm.length === 1) return byNorm[0]
  if (byNorm.length > 1) {
    return (
      byNorm.find((row) => Number(row.seq_number) === Number(parsed.seqNumber)) ||
      byNorm.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
    )
  }

  // اسم أقصر/أطول لنفس الشخص (استيراد قديم بدون الكنية) — بمطابقة بادئة آمنة فقط.
  const byPrefix = allRows.filter((row) => isSafePrefixNameMatch(row.name, parsed.name))
  if (byPrefix.length === 1) return byPrefix[0]
  return null
}

function remapApplicantReferences(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return
  try {
    db.prepare('UPDATE exam_roster SET applicant_id = ? WHERE applicant_id = ?').run(toId, fromId)
  } catch { /* العمود قد لا يوجد في بيئات الاختبار القديمة */ }
  try {
    db.prepare('UPDATE attempts SET applicant_id = ? WHERE applicant_id = ?').run(toId, fromId)
  } catch { /* اختياري */ }
}

/** دمج المكررات الحالية الناتجة عن استيراد متكرر. */
export function dedupeApplicants() {
  function groupKey(row) {
    const nid = nationalIdFrom(parseExtraJson(row.extra_json))
    if (nid) return `nid:${nid}`
    const name = normalizePersonName(row.name)
    return name ? `name:${name}` : ''
  }

  function mergeGroup(group) {
    if (group.length < 2) return 0
    const keep = group[0]
    let keepExtra = parseExtraJson(keep.extra_json)
    let keepName = keep.name
    let org = keep.org || ''
    let jobTitle = keep.job_title || ''
    let rank = keep.rank || ''
    let jobTitleOrg = keep.job_title_org || ''
    let jobTitleCommittee = keep.job_title_committee || ''
    let proposedSalary = keep.proposed_salary
    let rankCommittee = keep.rank_committee || ''
    let approvedSalary = keep.approved_salary
    let educationCommittee = keep.education_committee || ''
    let removed = 0

    for (const dup of group.slice(1)) {
      const extra = parseExtraJson(dup.extra_json)
      keepExtra = { ...keepExtra, ...extra }
      if (String(dup.name || '').trim().length > String(keepName || '').trim().length) keepName = dup.name
      org = org || dup.org || ''
      jobTitle = jobTitle || dup.job_title || ''
      rank = rank || dup.rank || ''
      jobTitleOrg = jobTitleOrg || dup.job_title_org || ''
      jobTitleCommittee = jobTitleCommittee || dup.job_title_committee || ''
      if (proposedSalary == null) proposedSalary = dup.proposed_salary
      rankCommittee = rankCommittee || dup.rank_committee || ''
      if (approvedSalary == null) approvedSalary = dup.approved_salary
      educationCommittee = educationCommittee || dup.education_committee || ''
      remapApplicantReferences(dup.id, keep.id)
      db.prepare('DELETE FROM applicants WHERE id = ?').run(dup.id)
      removed++
    }

    const working = workingJobTitle({ jobTitle, jobTitleCommittee, jobTitleOrg })
    db.prepare(
      `UPDATE applicants
       SET name = ?, org = ?, job_title = ?, rank = ?,
           job_title_org = ?, job_title_committee = ?, proposed_salary = ?,
           rank_committee = ?, approved_salary = ?, education_committee = ?,
           extra_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      keepName,
      org || null,
      working || null,
      rank || null,
      jobTitleOrg || null,
      jobTitleCommittee || null,
      proposedSalary != null ? proposedSalary : null,
      rankCommittee || null,
      approvedSalary != null ? approvedSalary : null,
      educationCommittee || null,
      Object.keys(keepExtra).length ? JSON.stringify(keepExtra) : null,
      nowIso(),
      keep.id,
    )
    return removed
  }

  let removed = 0
  let merged = 0
  const tx = db.transaction(() => {
    // المرور 1: رقم وطني أو اسم مطابق تماماً بعد التطبيع.
    const rows = db.prepare('SELECT * FROM applicants ORDER BY created_at ASC, seq_number ASC').all()
    const groups = new Map()
    for (const row of rows) {
      const key = groupKey(row)
      if (!key) continue
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      removed += mergeGroup(group)
      merged++
    }

    // المرور 2: اسم قصير مقابل اسم أطول يبدأ به (استيراد قديم بدون الكنية).
    let changed = true
    while (changed) {
      changed = false
      const current = db.prepare('SELECT * FROM applicants ORDER BY created_at ASC, seq_number ASC').all()
      outer: for (let i = 0; i < current.length; i++) {
        const left = normalizePersonName(current[i].name)
        if (!left) continue
        for (let j = i + 1; j < current.length; j++) {
          const right = normalizePersonName(current[j].name)
          if (!right) continue
          if (isSafePrefixNameMatch(current[i].name, current[j].name)) {
            const pair = [current[i], current[j]].sort((a, b) =>
              String(a.created_at).localeCompare(String(b.created_at)),
            )
            removed += mergeGroup(pair)
            merged++
            changed = true
            break outer
          }
        }
      }
    }
  })
  tx()
  return { merged, removed, total: countApplicants() }
}

/** يُستخدم عند بناء قائمة ممتحني اختبار من السجل المركزي مباشرة. */
export function getApplicantsByIds(ids) {
  backfillApplicantCommitteeFields()
  const clean = [...new Set((ids || []).map(String).filter(Boolean))]
  if (!clean.length) return []
  const placeholders = clean.map(() => '?').join(',')
  const rows = db.prepare(`SELECT * FROM applicants WHERE id IN (${placeholders})`).all(...clean)
  const byId = new Map(rows.map((r) => [r.id, mapApplicantRow(r)]))
  return clean.map((id) => byId.get(id)).filter(Boolean)
}

/** تصنيف السجلات التي استوردت قبل إضافة نوع المقابلة. */
function inferInterviewType(extra) {
  if (extra?.['نوع المقابلة']) return extra['نوع المقابلة']
  const keys = Object.keys(extra || {}).join(' ')
  if (keys.includes('رقم الاستمارة') || keys.includes('مكان السكن') || keys.includes('الوضع العائلي')) return 'داخلية'
  return 'خارجية'
}

function backfillApplicantInterviewTypes() {
  const rows = db.prepare('SELECT id, extra_json FROM applicants').all()
  const update = db.prepare('UPDATE applicants SET extra_json = ?, updated_at = ? WHERE id = ?')
  for (const row of rows) {
    let extra = {}
    try { extra = row.extra_json ? JSON.parse(row.extra_json) : {} } catch { extra = {} }
    if (extra['نوع المقابلة']) continue
    extra['نوع المقابلة'] = inferInterviewType(extra)
    update.run(JSON.stringify(extra), nowIso(), row.id)
  }
}

function backfillApplicantCommitteeFields() {
  const rows = db.prepare(`
    SELECT id, job_title, job_title_org, job_title_committee, proposed_salary,
           rank_committee, approved_salary, education_committee, extra_json
    FROM applicants
  `).all()
  const update = db.prepare(`
    UPDATE applicants
    SET job_title = ?,
        job_title_org = ?,
        job_title_committee = ?,
        proposed_salary = ?,
        rank_committee = ?,
        approved_salary = ?,
        education_committee = ?,
        extra_json = ?,
        updated_at = ?
    WHERE id = ?
  `)
  for (const row of rows) {
    let extra = {}
    try { extra = row.extra_json ? JSON.parse(row.extra_json) : {} } catch { extra = {} }
    let changed = false
    let extraChanged = false
    let jobTitle = row.job_title
    let jobTitleOrg = row.job_title_org
    let jobTitleCommittee = row.job_title_committee
    let proposedSalary = row.proposed_salary != null ? Number(row.proposed_salary) : null
    let rankCommittee = row.rank_committee
    let approvedSalary = row.approved_salary != null ? Number(row.approved_salary) : null
    let educationCommittee = row.education_committee

    if (!jobTitleOrg && (extra['المسمى الوارد من الجهة'] || extra['مسمى العمل المقترح من الجهة'] || extra['مسمى العمل طلب الاحتياج'] || extra['مسمى المرفوع'])) {
      jobTitleOrg = String(extra['المسمى الوارد من الجهة'] || extra['مسمى العمل المقترح من الجهة'] || extra['مسمى العمل طلب الاحتياج'] || extra['مسمى المرفوع']).trim()
      changed = true
    }
    const sortLabel = canonicalCommitteeSort(extra)
    if (sortLabel) {
      if (jobTitle && jobTitle !== sortLabel && !extra['مسمى العمل']) {
        extra['مسمى العمل'] = jobTitle
        extraChanged = true
      }
      if (jobTitleCommittee !== sortLabel) {
        jobTitleCommittee = sortLabel
        changed = true
      }
      if (jobTitle !== sortLabel) {
        jobTitle = sortLabel
        changed = true
      }
    } else if (!jobTitleCommittee && (extra['المسمى المقترح من اللجنة'] || extra['مسمى عمل  - اللجنة'] || extra['مسمى عمل - اللجنة'])) {
      jobTitleCommittee = String(extra['المسمى المقترح من اللجنة'] || extra['مسمى عمل  - اللجنة'] || extra['مسمى عمل - اللجنة']).trim()
      changed = true
    }
    if (proposedSalary == null && (extra['الراتب المقترح'] || extra['راتب مقترح من الجهة'])) {
      const s = parseSalary(extra['الراتب المقترح'] || extra['راتب مقترح من الجهة'])
      if (s != null) { proposedSalary = s; changed = true }
    }
    if (!rankCommittee && extra['الرتبة المقترحة من اللجنة']) {
      rankCommittee = String(extra['الرتبة المقترحة من اللجنة']).trim()
      changed = true
    }
    if (approvedSalary == null && extra['الراتب المقرر من مدير الإدارة']) {
      const s = parseSalary(extra['الراتب المقرر من مدير الإدارة'])
      if (s != null) { approvedSalary = s; changed = true }
    }
    if (!educationCommittee && (extra['التحصيل العلمي من اللجنة'] || extra['التأهيل العلمي مع الاختصاص'] || extra['المستوى العلمي'])) {
      educationCommittee = String(extra['التحصيل العلمي من اللجنة'] || extra['التأهيل العلمي مع الاختصاص'] || extra['المستوى العلمي']).trim()
      changed = true
    }

    if (changed || extraChanged) {
      update.run(
        jobTitle || null,
        jobTitleOrg || null,
        jobTitleCommittee || null,
        proposedSalary != null ? proposedSalary : null,
        rankCommittee || null,
        approvedSalary != null ? approvedSalary : null,
        educationCommittee || null,
        Object.keys(extra).length ? JSON.stringify(extra) : null,
        nowIso(),
        row.id,
      )
    }
  }
}

function cleanColumnLabel(label) {
  return String(label || '').trim().replace(/\s+/g, ' ')
}

function ensureColumn(label) {
  const clean = cleanColumnLabel(label)
  if (!clean) return
  db.prepare('INSERT OR IGNORE INTO applicant_columns (label, created_at) VALUES (?, ?)').run(
    clean,
    nowIso(),
  )
}

function columnKind(label) {
  const clean = cleanColumnLabel(label)
  const normalized = clean.replace(/_/g, ' ')
  if (normalized === 'المسمى الوارد من الجهة') return 'jobTitleOrg'
  if (normalized === 'المسمى المقترح من اللجنة') return 'jobTitleCommittee'
  if (normalized === 'الراتب المقترح') return 'proposedSalary'
  if (normalized === 'الرتبة المقترحة من اللجنة') return 'rankCommittee'
  if (normalized === 'الراتب المقرر من مدير الإدارة') return 'approvedSalary'
  if (normalized === 'التحصيل العلمي من اللجنة') return 'educationCommittee'
  if (normalized.includes('السوية') || normalized === 'الجهة') return 'org'
  if (normalized.includes('مسمى العمل') || normalized.includes('المسمى الوظيفي')) return 'jobTitle'
  if (normalized === 'الرتبة') return 'rank'
  return 'extra'
}

/** تحديث الاسم في كل الجداول المرتبطة */
export function renameApplicantEverywhere(oldName, newName) {
  const oldClean = String(oldName || '').trim()
  const newClean = String(newName || '').trim()
  if (!oldClean || !newClean) throw new Error('الاسم مطلوب')
  if (oldClean === newClean) return

  const dup = findByName(newClean)
  if (dup && dup.name !== oldClean) {
    throw new Error('يوجد متقدم آخر بنفس الاسم')
  }

  const profile = db.prepare('SELECT * FROM examinee_profiles WHERE name = ?').get(oldClean)
  const now = nowIso()

  const tx = db.transaction(() => {
    db.prepare('UPDATE applicants SET name = ?, updated_at = ? WHERE name = ?').run(
      newClean,
      now,
      oldClean,
    )
    db.prepare('UPDATE exam_roster SET name = ? WHERE name = ?').run(newClean, oldClean)
    for (const table of ['committee_scores', 'committee_results']) {
      if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
        db.prepare(`UPDATE ${table} SET examinee_name = ? WHERE examinee_name = ?`).run(newClean, oldClean)
      }
    }
    db.prepare('UPDATE attempts SET examinee_name = ? WHERE examinee_name = ?').run(
      newClean,
      oldClean,
    )

    if (profile) {
      db.prepare('DELETE FROM examinee_profiles WHERE name = ?').run(oldClean)
      db.prepare(
        `INSERT INTO examinee_profiles (name, org, job_title, rank, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           org = COALESCE(excluded.org, examinee_profiles.org),
           job_title = COALESCE(excluded.job_title, examinee_profiles.job_title),
           rank = COALESCE(excluded.rank, examinee_profiles.rank),
           updated_at = excluded.updated_at`,
      ).run(newClean, profile.org, profile.job_title, profile.rank, now)
    }
  })

  tx()
}

/** المسمى المعتمد للاختبارات والتصنيف: اللجنة ثم المسمى ثم الجهة. */
function workingJobTitle({ jobTitle, jobTitleCommittee, jobTitleOrg }) {
  return String(jobTitleCommittee || jobTitle || jobTitleOrg || '').trim()
}

function rowFromInput(row, seqFallback) {
  const name = String(row?.name || '').trim()
  if (!name) return null

  const extra = { ...(row?.extra || {}) }
  const meta = pickRosterMeta(extra)
  const committee = extractCommitteeFields(row, extra)
  const seqNumber = Number(row?.seqNumber) > 0 ? Number(row.seqNumber) : seqFallback
  const rawJobTitle = row.jobTitle != null ? String(row.jobTitle).trim() : (meta.jobTitle || '')

  return {
    name,
    seqNumber,
    org: row.org != null ? String(row.org).trim() : (meta.org || ''),
    jobTitle: workingJobTitle({
      jobTitle: rawJobTitle,
      jobTitleCommittee: committee.jobTitleCommittee,
      jobTitleOrg: committee.jobTitleOrg,
    }),
    rank: row.rank != null ? String(row.rank).trim() : (meta.rank || ''),
    jobTitleOrg: committee.jobTitleOrg,
    jobTitleCommittee: committee.jobTitleCommittee,
    proposedSalary: committee.proposedSalary,
    rankCommittee: committee.rankCommittee,
    approvedSalary: committee.approvedSalary,
    educationCommittee: committee.educationCommittee,
    extra: meta.jobTitle ? { ...meta.extra, 'مسمى العمل': meta.extra['مسمى العمل'] || meta.jobTitle } : meta.extra,
  }
}

export function listApplicants() {
  backfillApplicantInterviewTypes()
  backfillApplicantCommitteeFields()
  return db
    .prepare('SELECT * FROM applicants ORDER BY seq_number ASC, name ASC')
    .all()
    .map(mapApplicantRow)
}

/** آخر نتيجة من كل اختبار مطلوب، ثم المتوسط الحسابي للاختبارات الأربعة مع دعم حالة التقييم المعلق. */
export function finalResultForApplicant(applicant) {
  const applicantId = typeof applicant === 'string' ? null : applicant.id
  const name = typeof applicant === 'string' ? applicant : applicant.name
  const rows = db.prepare(`
    SELECT e.category, a.score, a.max_score, a.finished_at, a.evaluation_status, a.id AS attempt_id
    FROM attempts a
    JOIN exams e ON e.id = a.exam_id
    WHERE ((? IS NOT NULL AND a.applicant_id = ?) OR a.examinee_name = ?)
      AND e.category IN ('theory', 'oral', 'driving', 'personality')
    ORDER BY a.finished_at DESC
  `).all(applicantId, applicantId, name)
  const latest = new Map()
  const categoryDetails = {}
  const pendingCategories = []
  for (const row of rows) {
    if (latest.has(row.category)) continue
    const max = Number(row.max_score)
    const score = Number(row.score)
    const isPending = row.evaluation_status === 'pending'
    if (isPending) {
      pendingCategories.push(row.category)
      categoryDetails[row.category] = {
        score,
        maxScore: max,
        percent: max > 0 ? Math.round((score / max) * 100) : null,
        status: 'pending',
        attemptId: row.attempt_id,
      }
      latest.set(row.category, null)
      continue
    }
    if (max > 0 && Number.isFinite(score)) {
      const pct = Math.round((score / max) * 100)
      latest.set(row.category, pct)
      categoryDetails[row.category] = {
        score,
        maxScore: max,
        percent: pct,
        status: 'completed',
        attemptId: row.attempt_id,
      }
    }
  }
  const requiredCategories = requiredExamCategories(typeof applicant === 'string' ? { name: applicant } : applicant)
  const completedCategories = requiredCategories.filter((category) => latest.has(category) && latest.get(category) !== null)
  const isPendingOverall = pendingCategories.length > 0
  const finalResult = (!isPendingOverall && completedCategories.length === requiredCategories.length)
    ? Math.round((requiredCategories.reduce((sum, category) => sum + latest.get(category), 0) / requiredCategories.length) * 10) / 10
    : null
  return {
    finalResult,
    finalPercent: finalResult,
    hasPendingEvaluations: isPendingOverall,
    completedCategories,
    pendingCategories,
    categoryResults: Object.fromEntries([...latest.entries()].filter(([_, v]) => v !== null)),
    categoryDetails,
    status: isPendingOverall ? 'pending' : (completedCategories.length === requiredCategories.length ? 'completed' : 'in_progress'),
    requiredExamCount: requiredCategories.length,
  }
}

export function listApplicantsWithFinalResults() {
  const applicants = listApplicants()
  const uniqueNameId = new Map()
  for (const applicant of applicants) {
    if (uniqueNameId.has(applicant.name)) uniqueNameId.set(applicant.name, null)
    else uniqueNameId.set(applicant.name, applicant.id)
  }
  const latestByApplicant = new Map()
  const pendingByApplicant = new Map()
  const rows = db.prepare(`SELECT a.applicant_id AS applicantId,a.examinee_name AS name,e.category,a.score,a.max_score AS maxScore,a.finished_at,a.evaluation_status AS evaluationStatus
    FROM attempts a JOIN exams e ON e.id=a.exam_id
    WHERE e.category IN ('theory','oral','driving','personality')
    ORDER BY a.finished_at DESC`).all()
  for (const row of rows) {
    const applicantId = row.applicantId || uniqueNameId.get(row.name)
    if (!applicantId) continue
    const latest = latestByApplicant.get(applicantId) || new Map()
    const pending = pendingByApplicant.get(applicantId) || new Set()
    if (!latest.has(row.category)) {
      if (row.evaluationStatus === 'pending') {
        pending.add(row.category)
        latest.set(row.category, null)
      } else if (Number(row.maxScore) > 0) {
        latest.set(row.category, Math.round(Number(row.score) / Number(row.maxScore) * 100))
      }
    }
    latestByApplicant.set(applicantId, latest)
    pendingByApplicant.set(applicantId, pending)
  }
  return applicants.map((applicant) => {
    const latest = latestByApplicant.get(applicant.id) || new Map()
    const pending = pendingByApplicant.get(applicant.id) || new Set()
    const requiredCategories = requiredExamCategories(applicant)
    const completedCategories = requiredCategories.filter((category) => latest.has(category) && latest.get(category) !== null)
    const isPending = pending.size > 0
    const finalResult = (!isPending && completedCategories.length === requiredCategories.length)
      ? Math.round((requiredCategories.reduce((sum, category) => sum + latest.get(category), 0) / requiredCategories.length) * 10) / 10
      : null
    return {
      ...applicant,
      finalResult,
      completedCategories,
      pendingCategories: Array.from(pending),
      requiredExamCount: requiredCategories.length,
      categoryResults: Object.fromEntries([...latest.entries()].filter(([_, v]) => v !== null)),
      resultStatus: isPending ? 'pending' : (completedCategories.length === requiredCategories.length ? 'completed' : 'in_progress'),
      resultPolicyVersion: 'latest-per-category-v1',
    }
  })
}

/** الأعمدة المخصصة محفوظة، وتُستكمل بالأعمدة الموجودة في البيانات القديمة. */
export function listApplicantColumns() {
  const labels = new Set(
    db.prepare('SELECT label FROM applicant_columns ORDER BY created_at ASC, label ASC').all().map((r) => r.label),
  )
  for (const row of db.prepare('SELECT extra_json FROM applicants WHERE extra_json IS NOT NULL').all()) {
    try {
      Object.keys(JSON.parse(row.extra_json) || {}).forEach((key) => labels.add(key))
    } catch {
      /* بيانات قديمة غير قابلة للقراءة */
    }
  }
  return [...labels]
}

export function createApplicantColumn(label) {
  const clean = cleanColumnLabel(label)
  if (!clean) throw new Error('اسم العمود مطلوب')
  if (clean === 'الاسم الثلاثي' || clean === 'الاسم') throw new Error('عمود الاسم ثابت ولا يمكن إضافته مرة أخرى')
  ensureColumn(clean)
  return { label: clean }
}

/** يحذف العمود وقيمه من جميع المتقدمين. */
export function deleteApplicantColumn(label) {
  const clean = cleanColumnLabel(label)
  if (!clean) throw new Error('اسم العمود مطلوب')
  const kind = columnKind(clean)
  const now = nowIso()
  const tx = db.transaction(() => {
    if (kind === 'org') {
      db.prepare('UPDATE applicants SET org = NULL, updated_at = ?').run(now)
    } else if (kind === 'jobTitle') {
      db.prepare('UPDATE applicants SET job_title = NULL, updated_at = ?').run(now)
    } else if (kind === 'rank') {
      db.prepare('UPDATE applicants SET rank = NULL, updated_at = ?').run(now)
    } else if (kind === 'jobTitleOrg') {
      db.prepare('UPDATE applicants SET job_title_org = NULL, updated_at = ?').run(now)
    } else if (kind === 'jobTitleCommittee') {
      db.prepare('UPDATE applicants SET job_title_committee = NULL, updated_at = ?').run(now)
    } else if (kind === 'proposedSalary') {
      db.prepare('UPDATE applicants SET proposed_salary = NULL, updated_at = ?').run(now)
    } else if (kind === 'rankCommittee') {
      db.prepare('UPDATE applicants SET rank_committee = NULL, updated_at = ?').run(now)
    } else if (kind === 'approvedSalary') {
      db.prepare('UPDATE applicants SET approved_salary = NULL, updated_at = ?').run(now)
    } else if (kind === 'educationCommittee') {
      db.prepare('UPDATE applicants SET education_committee = NULL, updated_at = ?').run(now)
    }

    const rows = db.prepare('SELECT id, extra_json FROM applicants WHERE extra_json IS NOT NULL').all()
    const update = db.prepare('UPDATE applicants SET extra_json = ?, updated_at = ? WHERE id = ?')
    for (const row of rows) {
      let extra = {}
      try { extra = JSON.parse(row.extra_json) || {} } catch { continue }
      if (Object.prototype.hasOwnProperty.call(extra, clean)) {
        delete extra[clean]
        update.run(Object.keys(extra).length ? JSON.stringify(extra) : null, now, row.id)
      }
    }

    db.prepare('DELETE FROM applicant_columns WHERE label = ?').run(clean)
  })
  tx()
  return { ok: true, label: clean }
}

export function listApplicantFilters() {
  const orgs = db
    .prepare(
      `SELECT DISTINCT org FROM applicants WHERE org IS NOT NULL AND org != '' ORDER BY org`,
    )
    .all()
    .map((r) => r.org)
  const jobs = db
    .prepare(
      `SELECT DISTINCT job_title FROM applicants WHERE job_title IS NOT NULL AND job_title != '' ORDER BY job_title`,
    )
    .all()
    .map((r) => r.job_title)
  return { orgs, jobs }
}

export function createApplicant(input) {
  const parsed = rowFromInput(input, nextSeqNumber())
  if (!parsed) throw new Error('الاسم مطلوب')
  parsed.name = assertTripleName(parsed.name)

  const id = `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = nowIso()
  const displayId = makeDisplayId(parsed.seqNumber)
  const extraJson = Object.keys(parsed.extra).length ? JSON.stringify(parsed.extra) : null
  Object.keys(parsed.extra).forEach(ensureColumn)

  db.prepare(
    `INSERT INTO applicants (
      id, seq_number, display_id, name, org, job_title, rank,
      job_title_org, job_title_committee, proposed_salary,
      rank_committee, approved_salary, education_committee,
      extra_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    parsed.seqNumber,
    displayId,
    parsed.name,
    parsed.org || null,
    parsed.jobTitle || null,
    parsed.rank || null,
    parsed.jobTitleOrg || null,
    parsed.jobTitleCommittee || null,
    parsed.proposedSalary != null ? parsed.proposedSalary : null,
    parsed.rankCommittee || null,
    parsed.approvedSalary != null ? parsed.approvedSalary : null,
    parsed.educationCommittee || null,
    extraJson,
    now,
    now,
  )

  upsertExamineeProfile(parsed.name, {
    org: parsed.org,
    jobTitle: parsed.jobTitle,
    rank: parsed.rank,
  })

  return mapApplicantRow(findById(id))
}

export function updateApplicant(id, patch = {}) {
  const existing = findById(id)
  if (!existing) throw new Error('المتقدم غير موجود')

  const newName = patch.name != null ? assertTripleName(patch.name) : existing.name
  if (!newName) throw new Error('الاسم مطلوب')

  const org = patch.org != null ? String(patch.org).trim() : (existing.org || '')
  const rawJobTitle =
    patch.jobTitle != null ? String(patch.jobTitle).trim() : (existing.job_title || '')
  const rank = patch.rank != null ? String(patch.rank).trim() : (existing.rank || '')
  const seqNumber =
    patch.seqNumber != null && Number(patch.seqNumber) > 0
      ? Number(patch.seqNumber)
      : existing.seq_number

  let extra = existing.extra_json ? JSON.parse(existing.extra_json) : {}
  if (patch.extra && typeof patch.extra === 'object') {
    for (const [key, value] of Object.entries(patch.extra)) {
      if (value == null || value === '') delete extra[key]
      else extra[key] = String(value).trim()
      ensureColumn(key)
    }
  }

  // Support direct field patch or fallback to extra if specified
  let jobTitleOrg = existing.job_title_org || ''
  if (patch.jobTitleOrg !== undefined) {
    jobTitleOrg = String(patch.jobTitleOrg || '').trim()
  } else if (patch.extra && patch.extra['المسمى الوارد من الجهة'] !== undefined) {
    jobTitleOrg = String(patch.extra['المسمى الوارد من الجهة'] || '').trim()
  }

  let jobTitleCommittee = existing.job_title_committee || ''
  if (patch.jobTitleCommittee !== undefined) {
    jobTitleCommittee = String(patch.jobTitleCommittee || '').trim()
  } else if (patch.extra && patch.extra['المسمى المقترح من اللجنة'] !== undefined) {
    jobTitleCommittee = String(patch.extra['المسمى المقترح من اللجنة'] || '').trim()
  }

  let proposedSalary = existing.proposed_salary != null ? Number(existing.proposed_salary) : null
  if (patch.proposedSalary !== undefined) {
    proposedSalary = parseSalary(patch.proposedSalary)
  } else if (patch.extra && patch.extra['الراتب المقترح'] !== undefined) {
    proposedSalary = parseSalary(patch.extra['الراتب المقترح'])
  }

  let rankCommittee = existing.rank_committee || ''
  if (patch.rankCommittee !== undefined) {
    rankCommittee = String(patch.rankCommittee || '').trim()
  } else if (patch.extra && patch.extra['الرتبة المقترحة من اللجنة'] !== undefined) {
    rankCommittee = String(patch.extra['الرتبة المقترحة من اللجنة'] || '').trim()
  }

  let approvedSalary = existing.approved_salary != null ? Number(existing.approved_salary) : null
  if (patch.approvedSalary !== undefined) {
    approvedSalary = parseSalary(patch.approvedSalary)
  } else if (patch.extra && patch.extra['الراتب المقرر من مدير الإدارة'] !== undefined) {
    approvedSalary = parseSalary(patch.extra['الراتب المقرر من مدير الإدارة'])
  }

  let educationCommittee = existing.education_committee || ''
  if (patch.educationCommittee !== undefined) {
    educationCommittee = String(patch.educationCommittee || '').trim()
  } else if (patch.extra && patch.extra['التحصيل العلمي من اللجنة'] !== undefined) {
    educationCommittee = String(patch.extra['التحصيل العلمي من اللجنة'] || '').trim()
  }

  // Also sync extra with the 6 fields if updated
  if (patch.jobTitleOrg !== undefined) {
    if (jobTitleOrg) extra['المسمى الوارد من الجهة'] = jobTitleOrg
    else delete extra['المسمى الوارد من الجهة']
  }
  if (patch.jobTitleCommittee !== undefined) {
    if (jobTitleCommittee) extra['المسمى المقترح من اللجنة'] = jobTitleCommittee
    else delete extra['المسمى المقترح من اللجنة']
  }
  if (patch.proposedSalary !== undefined) {
    if (proposedSalary != null) extra['الراتب المقترح'] = String(proposedSalary)
    else delete extra['الراتب المقترح']
  }
  if (patch.rankCommittee !== undefined) {
    if (rankCommittee) extra['الرتبة المقترحة من اللجنة'] = rankCommittee
    else delete extra['الرتبة المقترحة من اللجنة']
  }
  if (patch.approvedSalary !== undefined) {
    if (approvedSalary != null) extra['الراتب المقرر من مدير الإدارة'] = String(approvedSalary)
    else delete extra['الراتب المقرر من مدير الإدارة']
  }
  if (patch.educationCommittee !== undefined) {
    if (educationCommittee) extra['التحصيل العلمي من اللجنة'] = educationCommittee
    else delete extra['التحصيل العلمي من اللجنة']
  }

  const jobTitle = workingJobTitle({
    jobTitle: rawJobTitle,
    jobTitleCommittee,
    jobTitleOrg,
  })

  const now = nowIso()
  const displayId = makeDisplayId(seqNumber)
  const extraJson = Object.keys(extra).length ? JSON.stringify(extra) : null

  db.prepare(
    `UPDATE applicants
     SET seq_number = ?, display_id = ?, name = ?, org = ?, job_title = ?, rank = ?,
         job_title_org = ?, job_title_committee = ?, proposed_salary = ?,
         rank_committee = ?, approved_salary = ?, education_committee = ?,
         extra_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    seqNumber,
    displayId,
    newName,
    org || null,
    jobTitle || null,
    rank || null,
    jobTitleOrg || null,
    jobTitleCommittee || null,
    proposedSalary != null ? proposedSalary : null,
    rankCommittee || null,
    approvedSalary != null ? approvedSalary : null,
    educationCommittee || null,
    extraJson,
    now,
    id,
  )

  upsertExamineeProfile(newName, { org, jobTitle, rank })

  return mapApplicantRow(findById(id))
}

export function deleteApplicant(id, actor) {
  const existing = findById(id)
  if (!existing) throw new Error('المتقدم غير موجود')
  const examined = db.prepare('SELECT id FROM attempts WHERE applicant_id = ? OR examinee_name = ? LIMIT 1').get(id, existing.name)
  if (examined) {
    hidePerson({ applicantId: id, name: existing.name, actor })
    return { ok: true, name: existing.name, mode: 'hidden' }
  }
  const tx = db.transaction(() => {
    try {
      db.prepare('DELETE FROM security_reviews WHERE applicant_id = ?').run(id)
    } catch { /* الجدول قد لا يوجد في بيئات قديمة */ }
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='committee_candidates'").get()) {
      db.prepare('DELETE FROM committee_candidates WHERE applicant_id = ?').run(id)
    }
    db.prepare('DELETE FROM applicants WHERE id = ?').run(id)
  })
  tx()
  return { ok: true, name: existing.name, mode: 'deleted' }
}

/** إخفاء ممتحن من القوائم. سجل النتيجة والأرشيف يبقى. */
export function deleteExaminee(identifier, actor) {
  const clean = String(identifier || '').trim()
  if (!clean) throw new Error('معرّف الممتحن مطلوب')
  const applicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(clean)
  const name = applicant?.name || clean
  const attempt = db.prepare('SELECT applicant_id FROM attempts WHERE applicant_id = ? OR examinee_name = ? LIMIT 1').get(applicant?.id || '', name)
  if (!attempt && !applicant) throw new Error('الممتحن غير موجود')
  hidePerson({ applicantId: applicant?.id || attempt?.applicant_id || null, name, actor })
  return { ok: true, name, mode: 'hidden' }
}

/** حذف جماعي حسب قائمة المعرّفات. */
export function deleteApplicantsBulk(ids) {
  const clean = [...new Set((ids || []).map(String).filter(Boolean))]
  if (!clean.length) throw new Error('لا يوجد متقدمون محددون للحذف')

  let deleted = 0
  const names = []
  const tx = db.transaction(() => {
    const find = db.prepare('SELECT id, name FROM applicants WHERE id = ?')
    const delReviews = db.prepare('DELETE FROM security_reviews WHERE applicant_id = ?')
    const del = db.prepare('DELETE FROM applicants WHERE id = ?')
    for (const id of clean) {
      const row = find.get(id)
      if (!row) continue
      try { delReviews.run(id) } catch { /* اختياري */ }
      del.run(id)
      deleted++
      names.push(row.name)
    }
  })
  tx()
  return { ok: true, deleted, names, total: countApplicants() }
}

/** استيراد تراكمي دائم: يضيف الجديد ويدمج المطابق حسب الاسم دون حذف البيانات السابقة. */
export function importApplicants(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('لا توجد صفوف للاستيراد')
  }

  const tx = db.transaction(() => {
    let created = 0
    let updated = 0
    let skipped = 0
    let seq = nextSeqNumber()
    const occupiedSequences = new Set(
      db.prepare('SELECT seq_number FROM applicants').all().map((row) => Number(row.seq_number)),
    )

    for (const raw of rows) {
      Object.keys(raw?.extra || {}).forEach(ensureColumn)
      const parsed = rowFromInput(raw, seq)
      if (!parsed) {
        skipped++
        continue
      }

      // المطابقة التراكمية: رقم وطني أو الاسم (مع التسلسل كمرجح)، لا الاسم+التسلسل فقط
      // حتى لا تُنشأ نسخ مكررة عند إعادة تعيين رقم التسلسل بسبب التعارض.
      const hit = findImportHit(parsed)
      const now = nowIso()

      if (hit) {
        let currentExtra = {}
        try { currentExtra = hit.extra_json ? JSON.parse(hit.extra_json) : {} } catch { currentExtra = {} }
        const mergedExtra = { ...currentExtra, ...parsed.extra }
        const extraJson = Object.keys(mergedExtra).length ? JSON.stringify(mergedExtra) : null
        const org = parsed.org || hit.org || ''
        const jobTitle = workingJobTitle({
          jobTitle: parsed.jobTitle || hit.job_title || '',
          jobTitleCommittee: parsed.jobTitleCommittee || hit.job_title_committee || '',
          jobTitleOrg: parsed.jobTitleOrg || hit.job_title_org || '',
        })
        const rank = parsed.rank || hit.rank || ''
        const jobTitleOrg = parsed.jobTitleOrg || hit.job_title_org || ''
        const jobTitleCommittee = parsed.jobTitleCommittee || hit.job_title_committee || ''
        const proposedSalary = parsed.proposedSalary != null ? parsed.proposedSalary : hit.proposed_salary
        const rankCommittee = parsed.rankCommittee || hit.rank_committee || ''
        const approvedSalary = parsed.approvedSalary != null ? parsed.approvedSalary : hit.approved_salary
        const educationCommittee = parsed.educationCommittee || hit.education_committee || ''
        const incomingName = String(parsed.name || '').trim()
        const currentName = String(hit.name || '').trim()
        const incomingParts = incomingName.split(/\s+/).filter(Boolean).length
        const keepName = incomingParts >= 3
          ? incomingName
          : (incomingName.length > currentName.length ? incomingName : currentName)
        db.prepare(
          `UPDATE applicants
           SET name = ?, org = ?, job_title = ?, rank = ?,
               job_title_org = ?, job_title_committee = ?, proposed_salary = ?,
               rank_committee = ?, approved_salary = ?, education_committee = ?,
               extra_json = ?, updated_at = ?
           WHERE id = ?`,
        ).run(
          keepName,
          org || null,
          jobTitle || null,
          rank || null,
          jobTitleOrg || null,
          jobTitleCommittee || null,
          proposedSalary != null ? proposedSalary : null,
          rankCommittee || null,
          approvedSalary != null ? approvedSalary : null,
          educationCommittee || null,
          extraJson,
          now,
          hit.id,
        )
        upsertExamineeProfile(keepName, { org, jobTitle, rank })
        updated++
      } else {
        let assignedSequence = parsed.seqNumber
        if (occupiedSequences.has(assignedSequence)) {
          while (occupiedSequences.has(seq)) seq++
          assignedSequence = seq
        }
        occupiedSequences.add(assignedSequence)
        seq = Math.max(seq, assignedSequence + 1)
        const extraJson = Object.keys(parsed.extra).length ? JSON.stringify(parsed.extra) : null
        const id = `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        db.prepare(
          `INSERT INTO applicants (
            id, seq_number, display_id, name, org, job_title, rank,
            job_title_org, job_title_committee, proposed_salary,
            rank_committee, approved_salary, education_committee,
            extra_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          assignedSequence,
          makeDisplayId(assignedSequence),
          parsed.name,
          parsed.org || null,
          parsed.jobTitle || null,
          parsed.rank || null,
          parsed.jobTitleOrg || null,
          parsed.jobTitleCommittee || null,
          parsed.proposedSalary != null ? parsed.proposedSalary : null,
          parsed.rankCommittee || null,
          parsed.approvedSalary != null ? parsed.approvedSalary : null,
          parsed.educationCommittee || null,
          extraJson,
          now,
          now,
        )
        upsertExamineeProfile(parsed.name, {
          org: parsed.org,
          jobTitle: parsed.jobTitle,
          rank: parsed.rank,
        })
        created++
      }
    }

    return { created, updated, skipped, total: listApplicants().length }
  })

  return tx()
}
