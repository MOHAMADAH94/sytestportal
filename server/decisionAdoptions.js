import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import { decisionForApplicant } from './decisionEngine.js'
import { CATEGORY_LABELS_AR, REQUIRED_CATEGORIES, STATUS_LABELS_AR } from './decisionRules.js'

const ADOPT_STATUSES = ['qualified', 'conditional', 'not_qualified', 'incomplete']

export function ensureDecisionAdoptionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decision_adoptions (
      id TEXT PRIMARY KEY,
      applicant_id TEXT NOT NULL,
      examinee_name TEXT,
      recommended_status TEXT NOT NULL,
      adopted_status TEXT NOT NULL,
      reason TEXT,
      policy_version TEXT NOT NULL,
      thresholds_json TEXT NOT NULL,
      weights_json TEXT NOT NULL,
      category_percents_json TEXT NOT NULL,
      composite_percent REAL,
      pending_json TEXT,
      missing_json TEXT,
      evaluators_json TEXT,
      adopted_by_id TEXT,
      adopted_by_name TEXT NOT NULL,
      adopted_by_role TEXT NOT NULL,
      adopted_at TEXT NOT NULL,
      superseded_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_decision_adoptions_applicant ON decision_adoptions(applicant_id, superseded_at, adopted_at);
  `)
}

ensureDecisionAdoptionsTable()

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status })
}

function parseJson(raw, fallback) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function mapAdoptionRow(row) {
  if (!row) return null
  const categoryPercents = parseJson(row.category_percents_json, {})
  const pendingCategories = parseJson(row.pending_json, [])
  const missingCategories = parseJson(row.missing_json, [])
  return {
    id: row.id,
    applicantId: row.applicant_id,
    examineeName: row.examinee_name,
    recommendedStatus: row.recommended_status,
    recommendedLabelAr: STATUS_LABELS_AR[row.recommended_status] || row.recommended_status,
    adoptedStatus: row.adopted_status,
    adoptedLabelAr: STATUS_LABELS_AR[row.adopted_status] || row.adopted_status,
    reason: row.reason || '',
    policyVersion: row.policy_version,
    thresholds: parseJson(row.thresholds_json, {}),
    weights: parseJson(row.weights_json, {}),
    categoryPercents,
    compositePercent: row.composite_percent == null ? null : Number(row.composite_percent),
    pendingCategories,
    missingCategories,
    evaluators: parseJson(row.evaluators_json, []),
    adoptedById: row.adopted_by_id,
    adoptedByName: row.adopted_by_name,
    adoptedByRole: row.adopted_by_role,
    adoptedAt: row.adopted_at,
    supersededAt: row.superseded_at || null,
    agreed: row.adopted_status === row.recommended_status,
  }
}

export function getCurrentAdoption(applicantId) {
  if (!applicantId) return null
  const row = db.prepare(
    `SELECT * FROM decision_adoptions WHERE applicant_id = ? AND superseded_at IS NULL ORDER BY adopted_at DESC LIMIT 1`,
  ).get(applicantId)
  return mapAdoptionRow(row)
}

export function listCurrentAdoptions(applicantIds) {
  const ids = [...new Set((applicantIds || []).filter(Boolean))]
  const byId = new Map()
  if (!ids.length) return byId
  const placeholders = ids.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT * FROM decision_adoptions WHERE superseded_at IS NULL AND applicant_id IN (${placeholders})`,
  ).all(...ids)
  for (const row of rows) {
    byId.set(row.applicant_id, mapAdoptionRow(row))
  }
  return byId
}

function collectEvaluators(applicantId, examineeName) {
  try {
    const rows = db.prepare(`
      SELECT category, evaluator, archived_at
      FROM assessment_archive
      WHERE (? IS NOT NULL AND applicant_id = ?) OR (? != '' AND examinee_name = ?)
      ORDER BY archived_at DESC
    `).all(applicantId, applicantId, examineeName || '', examineeName || '')
    const latest = new Map()
    for (const row of rows) {
      if (!row.category || latest.has(row.category)) continue
      const name = String(row.evaluator || '').trim()
      if (!name) continue
      latest.set(row.category, {
        category: row.category,
        labelAr: CATEGORY_LABELS_AR[row.category] || row.category,
        evaluator: name,
      })
    }
    return REQUIRED_CATEGORIES.map((category) => latest.get(category)).filter(Boolean)
  } catch {
    return []
  }
}

export function percentsDrifted(adoption, decision) {
  if (!adoption || !decision) return false
  if (adoption.compositePercent !== decision.compositePercent) return true
  if (adoption.recommendedStatus !== decision.status) return true
  const current = decision.categoryPercents || {}
  const snapshot = adoption.categoryPercents || {}
  for (const category of REQUIRED_CATEGORIES) {
    const a = snapshot[category] == null ? null : Number(snapshot[category])
    const b = current[category] == null ? null : Number(current[category])
    if (a !== b) return true
  }
  return false
}

export function adoptDecision(applicantOrName, { adoptedStatus, reason } = {}, user) {
  if (user?.role !== 'admin' && user?.role !== 'commander') {
    fail('اعتماد القرار متاح للمسؤول العام والقائد فقط', 403)
  }
  if (!ADOPT_STATUSES.includes(adoptedStatus)) {
    fail('حالة الاعتماد غير صالحة')
  }
  const decision = decisionForApplicant(applicantOrName)
  if (!decision.applicantId) {
    fail('لا يمكن اعتماد متقدم غير مسجّل في السجل', 404)
  }
  const disagree = adoptedStatus !== decision.status
  const trimmedReason = String(reason || '').trim()
  if (disagree && trimmedReason.length < 5) {
    fail('سبب المخالفة إلزامي ويجب ألا يقل عن 5 أحرف')
  }

  const percents = {}
  for (const category of REQUIRED_CATEGORIES) {
    const item = decision.categoryBreakdown?.[category]
    if (item?.percent != null) percents[category] = item.percent
  }

  const now = new Date().toISOString()
  const id = randomUUID()
  db.transaction(() => {
    db.prepare(
      `UPDATE decision_adoptions SET superseded_at = ? WHERE applicant_id = ? AND superseded_at IS NULL`,
    ).run(now, decision.applicantId)
    db.prepare(`
      INSERT INTO decision_adoptions (
        id, applicant_id, examinee_name, recommended_status, adopted_status, reason,
        policy_version, thresholds_json, weights_json, category_percents_json, composite_percent,
        pending_json, missing_json, evaluators_json,
        adopted_by_id, adopted_by_name, adopted_by_role, adopted_at, superseded_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
    `).run(
      id,
      decision.applicantId,
      decision.examineeName,
      decision.status,
      adoptedStatus,
      trimmedReason || null,
      decision.policyVersion,
      JSON.stringify(decision.thresholds || {}),
      JSON.stringify(decision.weights || {}),
      JSON.stringify(percents),
      decision.compositePercent,
      JSON.stringify(decision.pendingCategories || []),
      JSON.stringify(decision.missingCategories || []),
      JSON.stringify(collectEvaluators(decision.applicantId, decision.examineeName)),
      user?.id != null ? String(user.id) : null,
      String(user?.username || user?.label || 'unknown'),
      String(user?.role || 'unknown'),
      now,
    )
  })()

  return getCurrentAdoption(decision.applicantId)
}

export function attachAdoption(decision) {
  const adoption = getCurrentAdoption(decision?.applicantId)
  if (!adoption) return { ...decision, adoption: null, adoptionDrifted: false }
  const categoryPercents = {}
  for (const category of REQUIRED_CATEGORIES) {
    const item = decision.categoryBreakdown?.[category]
    if (item?.percent != null) categoryPercents[category] = item.percent
  }
  return {
    ...decision,
    adoption,
    adoptionDrifted: percentsDrifted(adoption, {
      status: decision.status,
      compositePercent: decision.compositePercent,
      categoryPercents,
    }),
  }
}
