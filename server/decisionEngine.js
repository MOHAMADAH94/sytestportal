import { db } from './db.js'
import { evaluateDecision } from './decisionRules.js'
import { requiredExamCategories, tracksForApplicant } from '../shared/evaluationMatrix.js'
import { CATEGORY_LABELS_AR } from '../shared/decisionRules.js'

export {
  POLICY_VERSION,
  REQUIRED_CATEGORIES,
  WEIGHTS,
  THRESHOLDS,
  CATEGORY_LABELS_AR,
  STATUS_LABELS_AR,
  evaluateDecision,
} from './decisionRules.js'

/**
 * Collect latest percent per required category for an applicant id and/or examinee name.
 * Intentionally independent of finalResultForApplicant.
 */
export function collectCategoryPercents({ applicantId = null, examineeName = null, examIds = null } = {}) {
  const name = String(examineeName || '').trim()
  if (!applicantId && !name) {
    return { categoryPercents: {}, pendingCategories: [], categoryDetails: {} }
  }

  let sql = `
    SELECT e.category, a.score, a.max_score, a.finished_at, a.evaluation_status, a.id AS attempt_id
    FROM attempts a
    JOIN exams e ON e.id = a.exam_id
    WHERE ((? IS NOT NULL AND a.applicant_id = ?) OR (? != '' AND a.examinee_name = ?))
      AND e.category IN ('theory', 'oral', 'driving', 'personality')
  `
  const params = [applicantId, applicantId, name, name]
  if (Array.isArray(examIds) && examIds.length) {
    sql += ` AND a.exam_id IN (${examIds.map(() => '?').join(',')})`
    params.push(...examIds)
  }
  sql += ' ORDER BY a.finished_at DESC'

  const rows = db.prepare(sql).all(...params)
  const latest = new Map()
  const categoryPercents = {}
  const categoryDetails = {}
  const pendingCategories = []

  for (const row of rows) {
    if (latest.has(row.category)) continue
    const max = Number(row.max_score)
    const score = Number(row.score)
    const isPending = row.evaluation_status === 'pending'
    if (isPending) {
      pendingCategories.push(row.category)
      const percent = max > 0 && Number.isFinite(score) ? Math.round((score / max) * 100) : null
      latest.set(row.category, null)
      categoryDetails[row.category] = {
        percent,
        status: 'pending',
        attemptId: row.attempt_id,
      }
      continue
    }
    if (max > 0 && Number.isFinite(score)) {
      const percent = Math.round((score / max) * 100)
      latest.set(row.category, percent)
      categoryPercents[row.category] = percent
      categoryDetails[row.category] = {
        percent,
        status: 'completed',
        attemptId: row.attempt_id,
      }
    }
  }

  return { categoryPercents, pendingCategories, categoryDetails }
}

function decisionScopeForApplicant(applicant) {
  if (!applicant) {
    return { requiredCategories: [], weights: {}, categoryLabels: {} }
  }
  const tracks = tracksForApplicant(applicant).filter((track) => track.category !== 'security')
  const requiredCategories = requiredExamCategories(applicant)
  if (!requiredCategories.length) {
    return { requiredCategories: [], weights: {}, categoryLabels: {} }
  }
  const weights = {}
  const categoryLabels = {}
  for (const track of tracks) {
    if (!track?.category || track.weight == null) continue
    weights[track.category] = (weights[track.category] || 0) + Number(track.weight)
    if (!categoryLabels[track.category]) categoryLabels[track.category] = track.label
  }
  for (const category of requiredCategories) {
    if (!categoryLabels[category]) categoryLabels[category] = CATEGORY_LABELS_AR[category] || category
  }
  return { requiredCategories, weights, categoryLabels }
}

/**
 * @param {string|{id?: string, name?: string, jobTitle?: string, jobTitleCommittee?: string, jobTitleOrg?: string}} applicantOrName
 * @param {{ examIds?: string[] }} [options]
 */
export function decisionForApplicant(applicantOrName, options = {}) {
  let applicantId = null
  let examineeName = null
  let applicantRow = null

  if (typeof applicantOrName === 'string') {
    const identifier = applicantOrName.trim()
    const byId = db.prepare('SELECT * FROM applicants WHERE id=?').get(identifier)
    if (byId) {
      applicantId = byId.id
      examineeName = byId.name
      applicantRow = byId
    } else {
      examineeName = identifier
      const byName = db.prepare('SELECT * FROM applicants WHERE name=?').get(identifier)
      if (byName) {
        applicantId = byName.id
        applicantRow = byName
      }
    }
  } else if (applicantOrName && typeof applicantOrName === 'object') {
    applicantId = applicantOrName.id || null
    examineeName = applicantOrName.name || null
    if (applicantId) {
      applicantRow = db.prepare('SELECT * FROM applicants WHERE id=?').get(applicantId) || null
    } else if (examineeName) {
      applicantRow = db.prepare('SELECT * FROM applicants WHERE name=?').get(examineeName) || null
      if (applicantRow) applicantId = applicantRow.id
    }
  }

  const applicant = applicantRow
    ? {
        id: applicantRow.id,
        name: applicantRow.name,
        jobTitle: applicantRow.job_title_committee || applicantRow.job_title || applicantOrName?.jobTitle || '',
        jobTitleOrg: applicantRow.job_title_org || '',
        jobTitleCommittee: applicantRow.job_title_committee || '',
      }
    : applicantOrName && typeof applicantOrName === 'object'
      ? applicantOrName
      : null

  const collected = collectCategoryPercents({
    applicantId,
    examineeName,
    examIds: options.examIds || null,
  })
  const scope = decisionScopeForApplicant(applicant)
  const decision = evaluateDecision({
    categoryPercents: collected.categoryPercents,
    pendingCategories: collected.pendingCategories.filter((category) =>
      scope.requiredCategories.includes(category),
    ),
    requiredCategories: scope.requiredCategories,
    weights: scope.weights || undefined,
    categoryLabels: scope.categoryLabels || undefined,
  })

  return {
    ...decision,
    applicantId,
    examineeName,
    categoryDetails: collected.categoryDetails,
    advisoryOnly: true,
    disclaimerAr: 'تقدير استرشادي غير ملزم — لا يستبدل نتيجة الاختبار أو اعتماد اللجنة.',
  }
}
