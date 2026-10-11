import { safeRandomUUID } from '../utils/uuid'
import type { ExamCategory, ExamConfig, OralRole, Question } from '../data/types'

export type ExamLevel = 'technician' | 'engineer'

export const LEVEL_META: Record<ExamLevel, { label: string; description: string }> = {
  technician: {
    label: 'مستوى فني',
    description: 'أسئلة مناسبة للمستوى الفني',
  },
  engineer: {
    label: 'مستوى مهندس',
    description: 'أسئلة مناسبة للمستوى الهندسي',
  },
}

export interface SessionUser {
  token: string
  role: 'admin' | 'operator' | 'commander' | 'examinee' | 'committee_manager' | 'committee_member'
  id?: string | number
  committeeId?: string
  username?: string
  label?: string
  category?: ExamCategory
  oralRole?: OralRole | null
  theoryTrack?: 'general' | 'office' | null
  examineeName?: string
  examId?: string
  mustRotatePassword?: boolean
}

export interface AccessAccountInfo {
  username: string
  label: string
  category: ExamCategory
  oralRole: OralRole | null
  theoryTrack?: 'general' | 'office' | null
  description: string
}

const TOKEN_KEY = 'exam-platform-auth'
export const COOKIE_SESSION = 'http-only-cookie'
export const AUTH_INVALID_EVENT = 'exam-platform-auth-invalid'

export function saveSession(user: SessionUser) {
  // نخزن بيانات العرض فقط؛ JWT يبقى في cookie لا تستطيع JavaScript قراءتها.
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ ...user, token: COOKIE_SESSION }))
  localStorage.removeItem(TOKEN_KEY)
}

export function loadSession(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionUser
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.token !== 'string' || !parsed.token.trim()) {
      clearSession()
      return null
    }
    if (
      parsed.role !== 'admin' &&
      parsed.role !== 'operator' &&
      parsed.role !== 'commander' &&
      parsed.role !== 'committee_manager' &&
      parsed.role !== 'committee_member' &&
      parsed.role !== 'examinee'
    ) {
      clearSession()
      return null
    }
    return { ...parsed, token: parsed.token.trim() }
  } catch {
    clearSession()
    return null
  }
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
}

function notifyInvalidSession() {
  clearSession()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_INVALID_EVENT))
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  const cleanToken = token?.trim()
  if (cleanToken && cleanToken !== COOKIE_SESSION) headers.Authorization = `Bearer ${cleanToken}`

  const res = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' })
  const data = await res.json().catch(() => ({} as { error?: string; code?: string }))
  if (!res.ok) {
    const msg = data.error || 'حدث خطأ في الاتصال بالخادم'
    if (res.status === 401 && (msg.includes('جلسة') || msg.includes('غير مصرح'))) {
      notifyInvalidSession()
      throw new Error('انتهت الجلسة أو أصبحت غير صالحة — سجّل الدخول من جديد')
    }
    throw Object.assign(new Error(msg), {
      code: typeof data.code === 'string' ? data.code : undefined,
      status: res.status,
    })
  }
  return data as T
}

export function apiAuthMe(token: string) {
  return request<{
    role: SessionUser['role']
    username?: string
    label?: string
    category?: ExamCategory
    oralRole?: OralRole | null
    examineeName?: string
    examId?: string
    mustRotatePassword?: boolean
  }>('/auth/me', {}, token)
}

/** تحقق من الجلسة دون مسحها عند أخطاء الشبكة */
export async function apiValidateSession(token: string): Promise<'ok' | 'invalid' | 'offline'> {
  try {
    const cleanToken = token.trim()
    const res = await fetch('/api/auth/me', {
      headers: cleanToken && cleanToken !== COOKIE_SESSION ? { Authorization: `Bearer ${cleanToken}` } : {},
      credentials: 'same-origin',
    })
    if (res.status === 401 || res.status === 403) return 'invalid'
    if (!res.ok) return 'offline'
    return 'ok'
  } catch {
    return 'offline'
  }
}

export function apiAccessAccounts() {
  return request<AccessAccountInfo[]>('/access-accounts')
}

export function apiLoginAdmin(username: string, password: string) {
  return request<{
    token: string
    role: 'admin' | 'operator' | 'commander' | 'committee_manager' | 'committee_member'
    id?: string | number
    committeeId?: string
    username: string
    label?: string
    category?: ExamCategory
    oralRole?: OralRole | null
    theoryTrack?: 'general' | 'office' | null
    description?: string
    mustRotatePassword?: boolean
  }>('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function apiQrLoginExam(token: string) {
  let deviceId = localStorage.getItem('exam-platform-device-id')
  if (!deviceId) {
    deviceId = safeRandomUUID()
    localStorage.setItem('exam-platform-device-id', deviceId)
  }
  return request<{
    token: string
    role: 'examinee'
    examineeName: string
    exam: AdminExam
  }>('/auth/exam/qr-login', {
    method: 'POST',
    body: JSON.stringify({ token, deviceId }),
  })
}

export interface RosterAccount {
  id: string
  displayId: string
  seqNumber: number
  name: string
  org?: string
  jobTitle?: string
  demandTitle?: string
  tracks?: { id: string; label: string; done: boolean }[]
  rank?: string
  extra: Record<string, string> | null
  qrToken: string
  used: boolean
  qrStatus?: 'issued' | 'claimed' | 'started' | 'submitted'
  qrExpiresAt?: string | null
}

export interface AdminExam {
  executionMode?: 'qr'
  jobBased?: boolean
  pendingQuestions?: boolean
  committeeId?: string | null
  id: string
  title: string
  category: ExamCategory
  level: ExamLevel
  oralRole?: OralRole | null
  capacity: number
  usedSeats: number
  remainingSeats: number
  questionCount: number
  secondsPerQuestion?: number
  createdAt: string
  createdBy?: string | null
  active?: boolean
  hasRoster?: boolean
  rosterCount?: number
  theoryTrack?: 'general' | 'office' | null
  questionTypes?: string[]
  evaluationMode?: string | null
  objectiveExam?: boolean
  showsBarcode?: boolean
}

export interface CreateExamResult extends AdminExam {
  roster?: RosterAccount[]
}

export function apiListExams(token: string) {
  return request<AdminExam[]>('/admin/exams', {}, token)
}

export interface ExamineeExamResult {
  examId?: string | null
  title: string
  category?: string | null
  trackId?: string | null
  trackLabel?: string | null
  weight: number | null
  score: number | null
}

export interface ExamineeSummary {
  applicantId?: string | null
  seqNumber?: number | null
  displayId?: string
  examineeName: string
  examineeIds?: string[]
  org?: string
  jobTitle?: string
  rank?: string
  jobTitleOrg?: string
  jobTitleCommittee?: string
  proposedSalary?: number | null
  rankCommittee?: string
  approvedSalary?: number | null
  educationCommittee?: string
  extra?: Record<string, string>
  examCount: number
  finalPercent: number | null
  resultPolicyVersion?: string
  categoryResults?: Partial<Record<ExamCategory, number>>
  examScores?: Record<string, number | null>
  examResults?: ExamineeExamResult[]
  lastFinishedAt: string
  categories: ExamCategory[]
}

export function apiExamineeFilters(token: string) {
  return request<{ orgs: string[]; jobs: string[] }>('/admin/examinee-filters', {}, token)
}

export function apiUpdateExamineeRank(token: string, identifier: string, rank: string) {
  return request<{
    ok: boolean
    examineeName: string
    rank: string
    org: string
    jobTitle: string
  }>(
    `/admin/examinees/${encodeURIComponent(identifier)}/rank`,
    { method: 'PATCH', body: JSON.stringify({ rank }) },
    token,
  )
}

export interface ExamineeAttemptDetail {
  committeeResult?: boolean
  committeeNote?: string | null
  estimatedSalary?: number | null
  attemptId: string
  examId: string
  examTitle: string
  category: ExamCategory
  level: ExamLevel
  oralRole?: OralRole | null
  score: number
  maxScore: number
  percent: number | null
  auditCount?: number
  personality: {
    summary?: string
    traits?: { name: string; score: number; max: number; percent: number }[]
  } | null
  startedAt: string
  finishedAt: string
}

export function apiListExaminees(token: string) {
  return request<ExamineeSummary[]>('/admin/examinees', {}, token)
}

export interface Applicant {
  id: string
  displayId: string
  seqNumber: number
  name: string
  org: string
  jobTitle: string
  rank: string
  jobTitleOrg?: string
  jobTitleCommittee?: string
  proposedSalary?: number | null
  rankCommittee?: string
  approvedSalary?: number | null
  educationCommittee?: string
  extra: Record<string, string>
  createdAt: string
  updatedAt: string
  finalResult?: number | null
  completedCategories?: ExamCategory[]
  pendingCategories?: ExamCategory[]
  requiredExamCount?: number
  categoryResults?: Partial<Record<ExamCategory, number>>
  resultStatus?: 'pending' | 'completed' | 'in_progress'
  securityReview?: SecurityReview | null
}

export function apiListApplicants(token: string) {
  return request<{ applicants: Applicant[]; columns: string[] }>('/admin/applicants', {}, token)
}

export interface RosterCandidate {
  id: string
  displayId: string
  seqNumber: number
  name: string
  org?: string
  jobTitle?: string
  rank?: string
  jobTitleOrg?: string
  jobTitleCommittee?: string
  proposedSalary?: number | null
  rankCommittee?: string
  approvedSalary?: number | null
  educationCommittee?: string
  missingTitle?: boolean
  evaluationStream?: string
  evaluationStreamLabel?: string
  evaluationTracks?: Array<{ id: string; label: string; weight: number | null; category: string }>
}

export function apiListEvaluationCandidates(token: string) {
  return request<RosterCandidate[]>('/admin/evaluation-candidates', {}, token)
}

export function apiCreateApplicantColumn(token: string, label: string) {
  return request<{ label: string }>('/admin/applicant-columns', { method: 'POST', body: JSON.stringify({ label }) }, token)
}

export function apiDeleteApplicantColumn(token: string, label: string) {
  return request<{ ok: boolean; label: string }>(`/admin/applicant-columns/${encodeURIComponent(label)}`, { method: 'DELETE' }, token)
}

export function apiApplicantFilters(token: string) {
  return request<{ orgs: string[]; jobs: string[] }>('/admin/applicant-filters', {}, token)
}

export interface CorrectionAttempt {
  id: string
  examId: string
  examTitle: string
  category: string
  percent: number | null
  committeeResult: boolean
}

export interface CorrectionPerson {
  id: string
  name: string
  displayId?: string
  org: string
  jobTitle: string
  jobTitleOrg: string
  jobTitleCommittee: string
  rank: string
  rankCommittee?: string
  educationCommittee?: string
  proposedSalary: number | null
  approvedSalary: number | null
  enrolledExamIds: string[]
  attempts: CorrectionAttempt[]
}

export function apiSearchCorrections(token: string, q: string) {
  return request<{ people: CorrectionPerson[] }>(`/admin/corrections?q=${encodeURIComponent(q)}`, {}, token)
}

export function apiEnrollApplicant(token: string, examId: string, applicantId: string) {
  return request<{ ok: boolean; name: string; examId: string; title: string; questionCount: number }>(
    `/admin/exams/${encodeURIComponent(examId)}/enroll`,
    { method: 'POST', body: JSON.stringify({ applicantId }) },
    token,
  )
}

export function apiCreateApplicant(
  token: string,
  body: {
    name: string
    seqNumber?: number
    org?: string
    jobTitle?: string
    rank?: string
    jobTitleOrg?: string
    jobTitleCommittee?: string
    proposedSalary?: number | string | null
    rankCommittee?: string
    approvedSalary?: number | string | null
    educationCommittee?: string
    extra?: Record<string, string>
  },
) {
  return request<Applicant>('/admin/applicants', { method: 'POST', body: JSON.stringify(body) }, token)
}

export function apiImportApplicants(
  token: string,
  body: { rows: Array<{ seqNumber: number; name: string; extra?: Record<string, string> }> },
) {
  return request<{
    ok: boolean
    created: number
    updated: number
    skipped: number
    total: number
    applicants: Applicant[]
  }>('/admin/applicants/import', { method: 'POST', body: JSON.stringify(body) }, token)
}

export function apiUpdateApplicant(
  token: string,
  id: string,
  body: {
    name?: string
    seqNumber?: number
    org?: string
    jobTitle?: string
    rank?: string
    jobTitleOrg?: string
    jobTitleCommittee?: string
    proposedSalary?: number | string | null
    rankCommittee?: string
    approvedSalary?: number | string | null
    educationCommittee?: string
    extra?: Record<string, string>
  },
) {
  return request<Applicant>(`/admin/applicants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token)
}

export function apiDeleteApplicant(token: string, id: string) {
  return request<{ ok: boolean; name: string; mode?: 'deleted' | 'hidden' }>(`/admin/applicants/${id}`, { method: 'DELETE' }, token)
}

export function apiDeleteExaminee(token: string, identifier: string) {
  return request<{ ok: boolean; name: string; mode: 'hidden' }>(
    `/admin/examinees/${encodeURIComponent(identifier)}`,
    { method: 'DELETE' },
    token,
  )
}

export function apiBulkDeleteApplicants(token: string, ids: string[]) {
  return request<{ ok: boolean; deleted: number; names: string[]; total: number }>(
    '/admin/applicants/bulk-delete',
    { method: 'POST', body: JSON.stringify({ ids }) },
    token,
  )
}

export function apiAutoGenerateExams(
  token: string,
  body: {
    applicantIds?: string[]
    interviewType?: string
    questionCount?: number
    titlePrefix?: string
  } = {},
) {
  return request<{
    ok: boolean
    createdCount: number
    skippedCount: number
    considered: number
    missingTitleCount: number
    exams: Array<{
      id: string
      title: string
      category: string
      oralRole?: string | null
      track: string
      rosterCount: number
      pendingQuestions?: boolean
      warnings?: string[]
    }>
    skipped: Array<{ id: string; name: string; reason: string; track?: string }>
    warnings: string[]
    sortSummary: Array<{ jobTitle: string; count: number; tracks: string[] }>
  }>('/admin/applicants/auto-generate-exams', { method: 'POST', body: JSON.stringify(body) }, token)
}

export function apiExamineeDetail(token: string, name: string) {
  return request<{
    examineeName: string
    applicantId?: string | null
    examCount: number
    finalPercent: number | null
    resultPolicyVersion?: string
    categoryResults?: Partial<Record<ExamCategory, number>>
    attempts: ExamineeAttemptDetail[]
  }>(`/admin/examinees/${encodeURIComponent(name)}`, {}, token)
}

export type DecisionStatus = 'incomplete' | 'qualified' | 'conditional' | 'not_qualified'

export interface DecisionAdoption {
  id: string
  applicantId: string
  examineeName?: string | null
  recommendedStatus: DecisionStatus
  recommendedLabelAr: string
  adoptedStatus: DecisionStatus
  adoptedLabelAr: string
  reason: string
  policyVersion: string
  thresholds: { qualifiedComposite: number; conditionalComposite: number; minPerCategory: number }
  weights: Record<string, number>
  categoryPercents: Record<string, number>
  compositePercent: number | null
  pendingCategories: string[]
  missingCategories: string[]
  evaluators: Array<{ category: string; labelAr: string; evaluator: string }>
  adoptedById?: string | null
  adoptedByName: string
  adoptedByRole: string
  adoptedAt: string
  supersededAt?: string | null
  agreed: boolean
}

export interface ExamineeDecision {
  status: DecisionStatus
  labelAr: string
  compositePercent: number | null
  weights: Record<string, number>
  thresholds: {
    qualifiedComposite: number
    conditionalComposite: number
    minPerCategory: number
  }
  categoryBreakdown: Record<
    string,
    {
      category: string
      labelAr: string
      percent: number | null
      weight: number
      status: 'completed' | 'missing' | 'pending'
      belowFloor: boolean
    }
  >
  reasons: string[]
  policyVersion: string
  completedCategories: string[]
  pendingCategories: string[]
  missingCategories: string[]
  applicantId?: string | null
  examineeName?: string | null
  advisoryOnly: boolean
  disclaimerAr: string
  adoption?: DecisionAdoption | null
  adoptionDrifted?: boolean
}

export function apiExamineeDecision(token: string, name: string) {
  return request<ExamineeDecision>(`/admin/examinees/${encodeURIComponent(name)}/decision`, {}, token)
}

export function apiAdoptExamineeDecision(
  token: string,
  name: string,
  body: { adoptedStatus: DecisionStatus; reason?: string },
) {
  return request<DecisionAdoption>(
    `/admin/examinees/${encodeURIComponent(name)}/decision-adoption`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  )
}

export interface SecurityReview {
  id: string
  applicantId: string
  examineeName: string
  decision: 'accepted' | 'rejected' | 'unspecified'
  decisionLabelAr: string
  note: string
  reviewedById?: string | null
  reviewedByName: string
  reviewedAt: string
}

export interface SecurityQueueItem {
  id: string
  seqNumber: number
  displayId: string
  name: string
  org: string
  jobTitle: string
  interviewType: string
  streamId?: string
  streamLabel?: string
  examProgress?: 'none' | 'partial' | 'complete'
  examProgressLabelAr?: string
  requiredTracks?: string[]
  review: SecurityReview | null
}

export function apiListSecurityQueue(token: string) {
  return request<SecurityQueueItem[]>('/admin/security-reviews', {}, token)
}

export function apiSaveSecurityReviewsBulk(
  token: string,
  body: { applicantIds: string[]; decision: 'accepted' | 'rejected' | 'unspecified'; note?: string },
) {
  return request<{ ok: boolean; count: number; reviews: SecurityReview[] }>(
    '/admin/security-reviews/bulk',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  )
}

export function apiSaveSecurityReview(
  token: string,
  applicantId: string,
  body: { decision: 'accepted' | 'rejected' | 'unspecified'; note?: string },
) {
  return request<SecurityReview>(
    `/admin/security-reviews/${encodeURIComponent(applicantId)}`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  )
}

export type LeadershipPeriod = 'all' | '30d'

export interface LeadershipGroupRow {
  key: string
  label: string
  applicantCount: number
  completeCount: number
  completionRate: number
  averageComposite: number | null
}

export interface LeadershipBankShortage {
  profileId: string
  label: string
  counts: Record<string, number>
  shortCategories: string[]
}

export interface LeadershipPersonRow {
  id: string
  name: string
  status: DecisionStatus
  labelAr: string
  compositePercent: number | null
  jobTitle: string
  org: string
  categoryPercents: Record<string, number>
  pendingCategories: string[]
  missingCategories: string[]
  adoption?: DecisionAdoption | null
}

export interface LeadershipBriefing {
  period: LeadershipPeriod
  generatedAt: string
  advisoryOnly: boolean
  disclaimerAr: string
  policyVersion: string
  statusLabels: Record<DecisionStatus, string>
  kpis: {
    applicantCount: number
    completeFour: number
    inProgress: number
    pendingManual: number
    activeExams: number
  }
  decisions: Record<DecisionStatus, number>
  byJob: LeadershipGroupRow[]
  byOrg: LeadershipGroupRow[]
  bankThreshold: number
  bankShortages: LeadershipBankShortage[]
  people: LeadershipPersonRow[]
  defaultThresholds: {
    qualifiedComposite: number
    conditionalComposite: number
    minPerCategory: number
  }
}

export function apiLeadershipBriefing(token: string, period: LeadershipPeriod = 'all') {
  const query = period === '30d' ? '?period=30d' : '?period=all'
  return request<LeadershipBriefing>(`/admin/leadership-briefing${query}`, {}, token)
}

export function apiCreateExam(
  token: string,
  body: {
    title: string
    category: ExamCategory
    level: ExamLevel
    oralRole?: OralRole
    questions: Question[]
    applicantIds: string[]
  },
) {
  return request<CreateExamResult>('/admin/exams', { method: 'POST', body: JSON.stringify(body) }, token)
}

export function apiExamRoster(token: string, examId: string) {
  return request<{ exam: AdminExam; roster: RosterAccount[]; publicAppUrl: string }>(
    `/admin/exams/${examId}/roster`,
    {},
    token,
  )
}

export function apiExamResults(token: string, examId: string) {
  return request<{
    exam: AdminExam
    attempts: {
      id: string
      examineeName: string
      score: number
      maxScore: number
      percent: number | null
      correctCount: number | null
      objectiveCount: number | null
      personality: {
        summary?: string
        traits?: { name: string; score: number; max: number; percent: number }[]
      } | null
      startedAt: string
      finishedAt: string
      evaluationStatus?: 'pending' | 'completed'
      evaluations?: any[]
      answers?: Record<string, string | number | string[]>
      clientIp?: string
    }[]
  }>(`/admin/exams/${examId}/results`, {}, token)
}

export function apiAdminExamQuestions(token: string, examId: string, examineeName?: string) {
  return request<{
    exam: AdminExam
    questions: Question[]
    variants?: { examineeName: string; jobTitle: string; questionCount: number }[]
    answers?: Record<string, string | number | string[]>
  }>(`/admin/exams/${examId}/questions${examineeName ? '?examineeName=' + encodeURIComponent(examineeName) : ''}`, {}, token)
}

export function apiManualResult(
  token: string,
  examId: string,
  body: { examineeName: string; answers: Record<string, string | number | string[]> },
) {
  return request<{
    ok: boolean
    attempt: {
      id: string
      examineeName: string
      score: number
      maxScore: number
      percent: number | null
      personality: unknown
      finishedAt: string
    }
  }>(`/admin/exams/${examId}/manual-result`, { method: 'POST', body: JSON.stringify(body) }, token)
}

export function apiUpdateAttemptScore(
  token: string,
  examId: string,
  attemptId: string,
  body: { score: number; maxScore?: number },
) {
  return request<{
    ok: boolean
    attempt: {
      id: string
      examineeName: string
      score: number
      maxScore: number
      percent: number | null
      finishedAt: string
    }
  }>(
    `/admin/exams/${examId}/attempts/${attemptId}/score`,
    { method: 'PATCH', body: JSON.stringify(body) },
    token,
  )
}

export function apiManualScore(
  token: string,
  examId: string,
  body: { examineeName: string; score: number; maxScore?: number },
) {
  return request<{
    ok: boolean
    attempt: {
      id: string
      examineeName: string
      score: number
      maxScore: number
      percent: number | null
      finishedAt: string
    }
  }>(`/admin/exams/${examId}/manual-score`, { method: 'POST', body: JSON.stringify(body) }, token)
}

export function apiSaveOralEvaluation(
  token: string,
  examId: string,
  body: { examineeName: string; questions: Array<{ id: string; text: string; answer: string; points: number; awarded: number }> },
) {
  return request<{ ok: boolean; attempt: { id: string; examineeName: string; score: number; maxScore: number; percent: number; finishedAt: string } }>(
    `/admin/exams/${examId}/oral-evaluations`, { method: 'POST', body: JSON.stringify(body) }, token,
  )
}

export interface OralArchiveRecord {
  id: string
  examId: string
  examTitle: string
  oralRole: string | null
  examineeName: string
  jobTitle: string | null
  score: number
  maxScore: number
  percent: number | null
  questions: Array<{ id: string; text: string; answer: string; points: number; awarded: number }>
  archivedAt: string
  evaluator: string | null
}

export function apiListOralArchive(
  token: string,
  filters?: { examId?: string; examineeName?: string; examTitle?: string },
) {
  const params = new URLSearchParams()
  if (filters?.examId) params.set('examId', filters.examId)
  if (filters?.examineeName) params.set('examineeName', filters.examineeName)
  if (filters?.examTitle) params.set('examTitle', filters.examTitle)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request<{ archive: OralArchiveRecord[]; total: number }>(`/admin/oral-archive${qs}`, {}, token)
}

export interface AssessmentArchiveRecord {
  id: string
  category: 'theory' | 'oral' | 'driving' | 'personality'
  examId: string | null
  examTitle: string
  oralRole: string | null
  examineeName: string
  displayId: string | null
  org: string | null
  jobTitle: string | null
  rank: string | null
  score: number
  maxScore: number
  percent: number | null
  detail: Record<string, any>
  archivedAt: string
  evaluator: string | null
}

export function apiListAssessmentArchive(
  token: string,
  filters?: { category?: string; examId?: string; examineeName?: string; examTitle?: string; org?: string; cursor?: string; limit?: number },
) {
  const params = new URLSearchParams()
  if (filters?.category) params.set('category', filters.category)
  if (filters?.examId) params.set('examId', filters.examId)
  if (filters?.examineeName) params.set('examineeName', filters.examineeName)
  if (filters?.examTitle) params.set('examTitle', filters.examTitle)
  if (filters?.org) params.set('org', filters.org)
  if (filters?.cursor) params.set('cursor', filters.cursor)
  if (filters?.limit) params.set('limit', String(filters.limit))
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request<{ archive: AssessmentArchiveRecord[]; total: number; hasNext?: boolean; nextCursor?: string | null }>(`/admin/assessment-archive${qs}`, {}, token)
}

export interface ResultAuditRecord {
  id: string
  attemptId: string
  examId: string
  examTitle: string
  category: string
  examineeName: string
  displayId: string | null
  originalScore: number
  originalMaxScore: number
  originalPercent: number | null
  newScore: number
  newMaxScore: number
  newPercent: number
  diffPercent: number | null
  reason: string
  committeeReference: string | null
  modifiedById: string | null
  modifiedByName: string
  modifiedByRole: string
  createdAt: string
}

export function apiModifyAttemptResult(
  token: string,
  attemptId: string,
  body: { newPercent: number; reason: string; committeeReference?: string },
) {
  return request<{
    ok: boolean
    message: string
    result: {
      auditId: string
      attemptId: string
      examineeName: string
      originalPercent: number
      newPercent: number
      diffPercent: number
      score: number
      maxScore: number
      percent: number
      modifiedAt: string
      modifiedBy: string
    }
  }>(`/admin/attempts/${attemptId}/modify-result`, { method: 'POST', body: JSON.stringify(body) }, token)
}

export function apiGetAttemptAuditHistory(token: string, attemptId: string) {
  return request<{ history: ResultAuditRecord[]; total: number }>(
    `/admin/attempts/${attemptId}/audit-history`,
    {},
    token,
  )
}

export function apiGetExamineeAuditHistory(token: string, examineeName: string) {
  return request<{ history: ResultAuditRecord[]; total: number }>(
    `/admin/examinees/${encodeURIComponent(examineeName)}/audit-history`,
    {},
    token,
  )
}


export function apiToggleExam(token: string, examId: string, active: boolean) {
  return request<{ ok: boolean }>(
    `/admin/exams/${examId}/active`,
    { method: 'PATCH', body: JSON.stringify({ active }) },
    token,
  )
}

export function apiDeleteExam(token: string, examId: string) {
  return request<{ ok: boolean; deletedAttempts: number }>(
    `/admin/exams/${examId}`,
    { method: 'DELETE' },
    token,
  )
}

export function apiGetExamQuestions(token: string) {
  return request<{
    exam: AdminExam
    examineeName: string
    questions: Question[]
    run?: { status: string; answers: Record<string, string | number | string[]>; questionIndex: number; startedAt: string; deadlineAt: string; secondsLeft: number; revision: number } | null
  }>('/exam/questions', {}, token)
}

export function apiSubmitExam(
  token: string,
  answers: Record<string, string | number | string[]>,
  startedAt: string,
  submissionKey?: string,
  revision?: number,
) {
  return request<{
    ok: boolean
    message: string
    evaluationStatus?: 'pending' | 'completed'
    revealScore?: boolean
    score?: number
    maxScore?: number
    percent?: number
  }>(
    '/exam/submit',
    { method: 'POST', body: JSON.stringify({ answers, startedAt, submissionKey, revision }) },
    token,
  )
}

export function apiCommittee<T>(token: string, path: string, method = 'GET', body?: unknown) {
  return request<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, token)
}

export function apiLogout() {
  return request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
}

export function apiChangePassword(token: string, currentPassword: string, newPassword: string) {
  return request<{ ok: boolean; token: string; mustRotatePassword: false }>(
    '/auth/change-password',
    { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) },
    token,
  )
}

export function apiEvaluateClassicQuestions(
  token: string,
  examId: string,
  attemptId: string,
  scores: { questionId: string; score: number; feedback?: string }[],
  reason?: string,
) {
  return request<{
    ok: boolean
    attempt: {
      id: string
      score: number
      maxScore: number
      percent: number
      evaluationStatus: 'pending' | 'completed'
      evaluations: any[]
    }
    message: string
  }>(
    `/admin/exams/${examId}/attempts/${attemptId}/evaluate-classic`,
    { method: 'POST', body: JSON.stringify({ scores, reason }) },
    token,
  )
}

export function apiGetMyExamResults(token: string) {
  return request<{
    ok: boolean
    exam: { id: string; title: string; category: string }
    attempt: {
      id: string
      examineeName: string
      score: number
      maxScore: number
      percent: number
      evaluationStatus: 'pending' | 'completed'
      evaluations: any[]
      finishedAt: string
    }
    finalBreakdown: any
  }>('/exam/my-results', {}, token)
}

export function apiGetNetworkStatus(token: string) {
  return request<{
    ok: boolean
    primary: { ip: string; interfaceName: string; mode: string }
    candidates: { name: string; address: string; isExcluded: boolean; isWifi: boolean; isEthernet: boolean }[]
    clientIp: string
    port: number | string
    publicAppUrl: string
  }>('/admin/network-status', {}, token)
}

export interface SystemAccount {
  id: string | number
  username: string
  role: string
  accountType: 'staff' | 'operator' | 'committee'
  active: boolean
  label?: string
  category?: ExamCategory
  oralRole?: OralRole | null
  theoryTrack?: 'general' | 'office' | null
  specialization?: string | null
  description?: string
  committeeName?: string
  createdAt?: string
}

export function apiGetAdminAccounts(token: string) {
  return request<{
    admins: SystemAccount[]
    operators: SystemAccount[]
    committees: SystemAccount[]
    all: SystemAccount[]
  }>('/admin/accounts', {}, token)
}

export function apiCreateAdminAccount(
  token: string,
  accountData: {
    username: string
    password: string
    label?: string
    category?: ExamCategory
    oralRole?: OralRole | null
    theoryTrack?: 'general' | 'office' | null
    specialization?: string | null
    description?: string
    active?: boolean
  },
) {
  return request<{
    ok: boolean
    account: SystemAccount
    message: string
  }>('/admin/accounts', { method: 'POST', body: JSON.stringify(accountData) }, token)
}

export function apiToggleAccountStatus(
  token: string,
  type: 'operator' | 'committee' | 'staff',
  id: string | number,
  active: boolean,
  reason?: string,
) {
  return request<{
    ok: boolean
    id: string | number
    active: boolean
    message: string
  }>(`/admin/accounts/${type}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active, reason }) }, token)
}

export type { ExamConfig }
