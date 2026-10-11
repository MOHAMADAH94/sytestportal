import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import { hasFinishedAllRequiredExams } from './examineeCard.js'
import { resolveEvaluationStream, tracksForApplicant } from '../shared/evaluationMatrix.js'

const DECISIONS = Object.freeze({
  accepted: 'مقبول',
  rejected: 'مرفوض',
  unspecified: 'غير محدد',
})

export function ensureSecurityReviewsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_reviews (
      id TEXT PRIMARY KEY,
      applicant_id TEXT NOT NULL,
      examinee_name TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('accepted', 'rejected', 'unspecified')),
      note TEXT,
      reviewed_by_id TEXT,
      reviewed_by_name TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      superseded_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_security_reviews_applicant
      ON security_reviews(applicant_id, superseded_at, reviewed_at);
  `)
  migrateSecurityDecisionConstraint()
}

function migrateSecurityDecisionConstraint() {
  try {
    db.prepare(`
      INSERT INTO security_reviews (
        id, applicant_id, examinee_name, decision, note,
        reviewed_by_id, reviewed_by_name, reviewed_at, superseded_at
      ) VALUES ('__constraint_probe__', '__x__', '__x__', 'unspecified', NULL, NULL, 'probe', '1970-01-01', '1970-01-01')
    `).run()
    db.prepare(`DELETE FROM security_reviews WHERE id = '__constraint_probe__'`).run()
    return
  } catch {
    /* الجدول القديم لا يقبل غير محدد — أعد بناءه */
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS security_reviews_v2 (
      id TEXT PRIMARY KEY,
      applicant_id TEXT NOT NULL,
      examinee_name TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('accepted', 'rejected', 'unspecified')),
      note TEXT,
      reviewed_by_id TEXT,
      reviewed_by_name TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      superseded_at TEXT
    );
    INSERT INTO security_reviews_v2
      (id, applicant_id, examinee_name, decision, note, reviewed_by_id, reviewed_by_name, reviewed_at, superseded_at)
    SELECT id, applicant_id, examinee_name, decision, note, reviewed_by_id, reviewed_by_name, reviewed_at, superseded_at
    FROM security_reviews;
    DROP TABLE security_reviews;
    ALTER TABLE security_reviews_v2 RENAME TO security_reviews;
    CREATE INDEX IF NOT EXISTS idx_security_reviews_applicant
      ON security_reviews(applicant_id, superseded_at, reviewed_at);
  `)
}

ensureSecurityReviewsTable()

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status })
}

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    applicantId: row.applicant_id,
    examineeName: row.examinee_name,
    decision: row.decision,
    decisionLabelAr: DECISIONS[row.decision] || row.decision,
    note: row.note || '',
    reviewedById: row.reviewed_by_id || null,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
    supersededAt: row.superseded_at || null,
  }
}

function hasAnyExamAttempt(applicantId, name) {
  const row = db.prepare(`
    SELECT 1 AS ok
    FROM attempts a
    JOIN exams e ON e.id = a.exam_id
    WHERE ((? IS NOT NULL AND a.applicant_id = ?) OR a.examinee_name = ?)
      AND e.category IN ('theory', 'oral', 'driving', 'personality')
    LIMIT 1
  `).get(applicantId || null, applicantId || null, name || '')
  return !!row
}

function examProgressOf(applicant) {
  if (hasFinishedAllRequiredExams(db, applicant)) return 'complete'
  if (hasAnyExamAttempt(applicant.id, applicant.name)) return 'partial'
  return 'none'
}

export function getCurrentSecurityReview(applicantId) {
  if (!applicantId) return null
  const row = db.prepare(`
    SELECT * FROM security_reviews
    WHERE applicant_id = ? AND superseded_at IS NULL
    ORDER BY reviewed_at DESC LIMIT 1
  `).get(applicantId)
  return mapRow(row)
}

export function listCurrentSecurityReviews(applicantIds) {
  const ids = [...new Set((applicantIds || []).filter(Boolean))]
  const byId = new Map()
  if (!ids.length) return byId
  const placeholders = ids.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT * FROM security_reviews
    WHERE superseded_at IS NULL AND applicant_id IN (${placeholders})
  `).all(...ids)
  for (const row of rows) byId.set(row.applicant_id, mapRow(row))
  return byId
}

export function listSecurityQueue() {
  const applicants = db.prepare(`
    SELECT id, seq_number AS seqNumber, display_id AS displayId, name,
           org, job_title AS jobTitle, job_title_org AS jobTitleOrg,
           job_title_committee AS jobTitleCommittee, extra_json
    FROM applicants
    ORDER BY seq_number ASC, name ASC
  `).all()
  const reviews = listCurrentSecurityReviews(applicants.map((a) => a.id))
  return applicants.map((row) => {
    let extra = {}
    try { extra = row.extra_json ? JSON.parse(row.extra_json) : {} } catch { extra = {} }
    const title = String(row.jobTitleCommittee || row.jobTitle || row.jobTitleOrg || '').trim()
    const person = {
      id: row.id,
      name: row.name,
      jobTitle: title,
      jobTitleOrg: row.jobTitleOrg || '',
      jobTitleCommittee: row.jobTitleCommittee || '',
      extra,
    }
    const stream = resolveEvaluationStream(person)
    const examProgress = examProgressOf(person)
    return {
      id: row.id,
      seqNumber: row.seqNumber,
      displayId: row.displayId,
      name: row.name,
      org: row.org || '',
      jobTitle: title,
      interviewType: extra['نوع المقابلة'] || '',
      streamId: stream.id,
      streamLabel: stream.label,
      examProgress,
      examProgressLabelAr:
        examProgress === 'complete' ? 'ممتحن' : examProgress === 'partial' ? 'متقدم' : 'غير محدد',
      requiredTracks: tracksForApplicant(person)
        .filter((track) => track.category !== 'security')
        .map((track) => track.label),
      review: reviews.get(row.id) || null,
    }
  }).sort((a, b) => {
    const streamRank = (id) =>
      ({ services: 1, administrative: 2, networks: 3, programming: 4, maintenance: 5, unresolved: 9 }[id] || 8)
    const progressRank = (p) => ({ none: 0, partial: 1, complete: 2 }[p] || 0)
    const byStream = streamRank(a.streamId) - streamRank(b.streamId)
    if (byStream) return byStream
    const byProgress = progressRank(a.examProgress) - progressRank(b.examProgress)
    if (byProgress) return byProgress
    return a.seqNumber - b.seqNumber || a.name.localeCompare(b.name, 'ar')
  })
}

export function saveSecurityReview(applicantId, { decision, note } = {}, user) {
  if (!applicantId) fail('معرّف المتقدم مطلوب')
  if (!Object.keys(DECISIONS).includes(decision)) fail('القرار يجب أن يكون قبولاً أو رفضاً أو غير محدد')
  if (user?.role !== 'admin' && !(user?.role === 'operator' && user?.category === 'security')) {
    fail('صلاحية الأمن العسكري مطلوبة', 403)
  }

  const applicant = db.prepare('SELECT id, name FROM applicants WHERE id = ?').get(applicantId)
  if (!applicant) fail('المتقدم غير موجود', 404)

  const cleanNote = String(note || '').trim()
  if (decision === 'rejected' && !cleanNote) fail('ملاحظة الرفض مطلوبة')

  const now = new Date().toISOString()
  const reviewedByName = user.label || user.username || 'الأمن العسكري'

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE security_reviews SET superseded_at = ?
      WHERE applicant_id = ? AND superseded_at IS NULL
    `).run(now, applicantId)

    const id = randomUUID()
    db.prepare(`
      INSERT INTO security_reviews (
        id, applicant_id, examinee_name, decision, note,
        reviewed_by_id, reviewed_by_name, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      applicantId,
      applicant.name,
      decision,
      cleanNote || null,
      user.id != null ? String(user.id) : null,
      reviewedByName,
      now,
    )
    return getCurrentSecurityReview(applicantId)
  })

  return tx()
}

export function saveSecurityReviewsBulk(applicantIds, { decision, note } = {}, user) {
  const ids = [...new Set((applicantIds || []).map(String).filter(Boolean))]
  if (!ids.length) fail('اختر متقدماً واحداً على الأقل')
  if (ids.length > 500) fail('حد القرار الجماعي 500 متقدم')
  const saveMany = db.transaction((selected) => selected.map((applicantId) => saveSecurityReview(applicantId, { decision, note }, user)))
  const reviews = saveMany(ids)
  return { ok: true, count: reviews.length, reviews }
}
