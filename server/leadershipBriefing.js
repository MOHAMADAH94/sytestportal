import { readFileSync } from 'node:fs'
import { db } from './db.js'
import { evaluateDecision, POLICY_VERSION, STATUS_LABELS_AR, THRESHOLDS } from './decisionRules.js'
import { CATEGORY_LABELS_AR } from '../shared/decisionRules.js'
import { JOB_PROFILES } from '../shared/jobProfiles.js'
import { requiredExamCategories, tracksForApplicant } from '../shared/evaluationMatrix.js'
import { listCurrentAdoptions } from './decisionAdoptions.js'

export const BANK_SHORTAGE_THRESHOLD = 20
export const BANK_SHORTAGE_CATEGORIES = ['oral', 'driving', 'personality']
const TOP_GROUPS = 12
const UNLABELED = 'غير محدد'

const DISCLAIMER_AR =
  'تقرير استرشادي للقراءة فقط — لا يعتمد قراراً ولا يغيّر النتائج أو الأرشيف أو أوزان التقدير.'

let baseBankCache = null

export function canViewLeadershipBriefing(user) {
  return user?.role === 'admin' || user?.role === 'commander'
}

function unlabeled(value) {
  const text = String(value || '').trim()
  return text || UNLABELED
}

function loadBankQuestions() {
  if (!baseBankCache) {
    baseBankCache = JSON.parse(readFileSync(new URL('./question-bank.json', import.meta.url), 'utf8'))
  }
  const rows = new Map(baseBankCache.map((q) => [q.id, q]))
  try {
    for (const row of db.prepare('SELECT * FROM question_bank_overrides').all()) {
      if (row.active) rows.set(row.id, JSON.parse(row.question_json))
      else rows.delete(row.id)
    }
  } catch {
    /* overrides table may be absent in isolated tests */
  }
  return [...rows.values()]
}

function collectLatestByApplicant() {
  const rows = db.prepare(`
    SELECT a.applicant_id, a.examinee_name, e.category, a.score, a.max_score, a.finished_at, a.evaluation_status
    FROM attempts a
    JOIN exams e ON e.id = a.exam_id
    WHERE e.category IN ('theory', 'oral', 'driving', 'personality')
    ORDER BY a.finished_at DESC
  `).all()

  const byApplicantId = new Map()
  const byName = new Map()

  for (const row of rows) {
    const apply = (map, key) => {
      if (!key) return
      let rec = map.get(key)
      if (!rec) {
        rec = { latestFinishedAt: row.finished_at, categories: new Map() }
        map.set(key, rec)
      }
      if (row.finished_at > rec.latestFinishedAt) rec.latestFinishedAt = row.finished_at
      if (!rec.categories.has(row.category)) rec.categories.set(row.category, row)
    }
    if (row.applicant_id) apply(byApplicantId, row.applicant_id)
    else apply(byName, row.examinee_name)
  }

  return { byApplicantId, byName }
}

function percentsFromLatest(rec) {
  const categoryPercents = {}
  const pendingCategories = []
  if (!rec) return { categoryPercents, pendingCategories, latestFinishedAt: null, attemptCount: 0 }

  for (const [category, row] of rec.categories) {
    const max = Number(row.max_score)
    const score = Number(row.score)
    const isPending = row.evaluation_status === 'pending'
    if (isPending) {
      pendingCategories.push(category)
      continue
    }
    if (max > 0 && Number.isFinite(score)) {
      categoryPercents[category] = Math.round((score / max) * 100)
    }
  }

  return {
    categoryPercents,
    pendingCategories,
    latestFinishedAt: rec.latestFinishedAt || null,
    attemptCount: rec.categories.size,
  }
}

function bumpGroup(map, key, label, decision) {
  let group = map.get(key)
  if (!group) {
    group = {
      key,
      label,
      applicantCount: 0,
      completeCount: 0,
      compositeSum: 0,
      compositeN: 0,
    }
    map.set(key, group)
  }
  group.applicantCount += 1
  if (decision.status !== 'incomplete') group.completeCount += 1
  if (decision.compositePercent != null && Number.isFinite(decision.compositePercent)) {
    group.compositeSum += decision.compositePercent
    group.compositeN += 1
  }
}

function finalizeGroups(map) {
  return [...map.values()]
    .map((group) => ({
      key: group.key,
      label: group.label,
      applicantCount: group.applicantCount,
      completeCount: group.completeCount,
      completionRate:
        group.applicantCount > 0 ? Math.round((group.completeCount / group.applicantCount) * 100) : 0,
      averageComposite:
        group.compositeN > 0 ? Math.round((group.compositeSum / group.compositeN) * 10) / 10 : null,
    }))
    .sort((a, b) => b.applicantCount - a.applicantCount || a.label.localeCompare(b.label, 'ar'))
    .slice(0, TOP_GROUPS)
}

export function summarizeBankShortages(questions) {
  const shortages = []
  const profiles = JOB_PROFILES.filter((profile) => profile.id !== 'unclassified')
  for (const profile of profiles) {
    const counts = {}
    for (const category of BANK_SHORTAGE_CATEGORIES) {
      counts[category] = 0
    }
    for (const question of questions) {
      if (!BANK_SHORTAGE_CATEGORIES.includes(question.category)) continue
      if (!Array.isArray(question.jobTitles) || !question.jobTitles.includes(profile.id)) continue
      counts[question.category] += 1
    }
    const shortCategories = BANK_SHORTAGE_CATEGORIES.filter(
      (category) => counts[category] < BANK_SHORTAGE_THRESHOLD,
    )
    if (!shortCategories.length) continue
    shortages.push({
      profileId: profile.id,
      label: profile.label,
      counts,
      shortCategories,
    })
  }
  shortages.sort((a, b) => {
    const minA = Math.min(...BANK_SHORTAGE_CATEGORIES.map((c) => a.counts[c]))
    const minB = Math.min(...BANK_SHORTAGE_CATEGORIES.map((c) => b.counts[c]))
    return minA - minB || a.label.localeCompare(b.label, 'ar')
  })
  return shortages
}

/**
 * Read-only leadership briefing. Does not write attempts, archive, or decisions.
 * @param {{ period?: 'all'|'30d', bankQuestions?: object[] }} [options]
 */
export function buildLeadershipBriefing({ period = 'all', bankQuestions = null } = {}) {
  const periodKey = period === '30d' ? '30d' : 'all'
  const cutoff =
    periodKey === '30d'
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : null

  const applicants = db.prepare(`
    SELECT id, name, org, job_title, job_title_org, job_title_committee
    FROM applicants
    ORDER BY seq_number ASC
  `).all()

  const { byApplicantId, byName } = collectLatestByApplicant()
  const adoptions = listCurrentAdoptions(applicants.map((row) => row.id))

  const decisions = {
    qualified: 0,
    conditional: 0,
    not_qualified: 0,
    incomplete: 0,
  }
  let completeFour = 0
  let inProgress = 0
  let pendingManual = 0
  const byJob = new Map()
  const byOrg = new Map()
  const people = []

  for (const applicant of applicants) {
    const rec = byApplicantId.get(applicant.id) || byName.get(applicant.name)
    const collected = percentsFromLatest(rec)
    if (cutoff && (!collected.latestFinishedAt || collected.latestFinishedAt < cutoff)) continue

    const person = {
      id: applicant.id,
      name: applicant.name,
      jobTitle: applicant.job_title_committee || applicant.job_title || '',
      jobTitleOrg: applicant.job_title_org || '',
      jobTitleCommittee: applicant.job_title_committee || '',
    }
    const tracks = tracksForApplicant(person).filter((track) => track.category !== 'security')
    const requiredCategories = requiredExamCategories(person)
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

    const decision = evaluateDecision({
      categoryPercents: collected.categoryPercents,
      pendingCategories: collected.pendingCategories.filter((category) =>
        requiredCategories.includes(category),
      ),
      requiredCategories,
      weights: requiredCategories.length ? weights : undefined,
      categoryLabels: requiredCategories.length ? categoryLabels : undefined,
    })
    decisions[decision.status] += 1

    const completedCount = decision.completedCategories.length
    const requiredCount = Math.max(1, requiredCategories.length || 4)
    if (completedCount === requiredCount && decision.pendingCategories.length === 0) completeFour += 1
    if (collected.attemptCount > 0 && (completedCount < requiredCount || decision.pendingCategories.length > 0)) {
      inProgress += 1
    }
    if (decision.pendingCategories.length > 0) pendingManual += 1

    const jobTitle = unlabeled(
      applicant.job_title || applicant.job_title_committee || applicant.job_title_org,
    )
    const org = unlabeled(applicant.org)
    bumpGroup(byJob, jobTitle, jobTitle, decision)
    bumpGroup(byOrg, org, org, decision)

    people.push({
      id: applicant.id,
      name: applicant.name,
      status: decision.status,
      labelAr: decision.labelAr,
      compositePercent: decision.compositePercent,
      jobTitle,
      org,
      categoryPercents: collected.categoryPercents,
      pendingCategories: decision.pendingCategories,
      missingCategories: decision.missingCategories,
      adoption: adoptions.get(applicant.id) || null,
    })
  }

  const activeExams = db.prepare(`SELECT COUNT(*) AS c FROM exams WHERE active = 1`).get()?.c || 0
  const questions = Array.isArray(bankQuestions) ? bankQuestions : loadBankQuestions()

  return {
    period: periodKey,
    generatedAt: new Date().toISOString(),
    advisoryOnly: true,
    disclaimerAr: DISCLAIMER_AR,
    policyVersion: POLICY_VERSION,
    statusLabels: { ...STATUS_LABELS_AR },
    defaultThresholds: { ...THRESHOLDS },
    kpis: {
      applicantCount: people.length,
      completeFour,
      inProgress,
      pendingManual,
      activeExams,
    },
    decisions,
    byJob: finalizeGroups(byJob),
    byOrg: finalizeGroups(byOrg),
    bankThreshold: BANK_SHORTAGE_THRESHOLD,
    bankShortages: summarizeBankShortages(questions),
    people,
  }
}
