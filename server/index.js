import bcrypt from 'bcryptjs'
import cors from 'cors'
import crypto from 'crypto'
import express from 'express'
import http from 'http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBackupMirror } from './backupLocation.js'
import { installArchiveProtection, retainDeletedExam } from './archiveProtection.js'
import { createArchiveBackups } from './archiveBackups.js'
import { createAutoGenerateExamsService } from './autoGenerateExams.js'
import jwt from 'jsonwebtoken'
import { countAttempts, dataDir, db, listAccessAccountsPublic } from './db.js'
import { clearSessionCookie, loadJwtSecret, parseCookies, sessionCookie, SESSION_MAX_AGE_SECONDS } from './runtimeSecurity.js'
import { summarizeAttempt, applyManualEvaluation } from './examLogic.js'
import { createJobExamService } from './jobExams.js'
import { createEvaluationService } from './evaluationSessions.js'
import { createExamRunService } from './examRuns.js'
import { createMonitoringStore } from './monitoring.js'
import { resolveJobProfile, oralRolesCompatible, compatibleOralRoles, effectiveJobTitle } from '../shared/jobProfiles.js'
import { candidateVisibleToOperator, requiredExamCategories, resolveEvaluationStream, tracksForApplicant } from '../shared/evaluationMatrix.js'
import {
  isObjectiveExam,
  questionTypesFromConfig,
  questionTypesFromQuestions,
  resolveExamTheoryTrack,
  showsEntryBarcode,
} from '../shared/examPresentation.js'
import { attachLiveMonitor, getLiveSessionsForRest } from './liveMonitor.js'
import { createCommitteeService, attachCommitteeRoutes, attachCommitteeProtection } from './committees.js'
import { resolvePublicAppUrl, isAllowedOrigin } from './publicUrl.js'
import { resolveAutoNetwork, extractClientIp, detectPrimaryLanIp, getNetworkCandidates } from './networkIp.js'

import { effectiveSecondsPerQuestion } from './examDuration.js'
import {
  countRoster,
  claimRosterByQrToken,
  insertExamRoster,
  listRosterPublic,
} from './roster.js'
import {
  listOrgsAndJobs,
  setExamineeRank,
} from './rosterMeta.js'
import {
  createApplicant,
  createApplicantColumn,
  countApplicants,
  deleteApplicantColumn,
  deleteApplicant,
  deleteApplicantsBulk,
  deleteExaminee,
  getApplicantsByIds,
  importApplicants,
  isHiddenPerson,
  listApplicantFilters,
  listApplicantColumns,
  listApplicantsWithFinalResults,
  listPendingApplicants,
  finalResultForApplicant,
  listApplicants,
  updateApplicant,
} from './applicants.js'
import { decisionForApplicant } from './decisionEngine.js'
import { buildLeadershipBriefing, canViewLeadershipBriefing } from './leadershipBriefing.js'
import { adoptDecision, attachAdoption } from './decisionAdoptions.js'
import { describeExamineeExams, hasFinishedAllRequiredExams } from './examineeCard.js'
import {
  listSecurityQueue,
  saveSecurityReview,
  saveSecurityReviewsBulk,
  getCurrentSecurityReview,
  listCurrentSecurityReviews,
} from './securityReviews.js'

const { env: resolvedNetworkEnv, detected: autoDetectedNetwork } = resolveAutoNetwork(process.env)
process.env = resolvedNetworkEnv

if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'APP_ORIGIN', 'PUBLIC_APP_URL', 'ARCHIVE_BACKUP_MIRROR_DIR', 'ARCHIVE_BACKUP_ENCRYPTION_KEY']
  const missing = required.filter((name) => !String(process.env[name] || '').trim())
  if (missing.length) throw new Error('إعدادات الإنتاج المطلوبة غير موجودة: ' + missing.join(', '))
  if (!String(process.env.APP_ORIGIN).split(',').every((origin) => {
    const trimmed = origin.trim()
    return isAllowedOrigin(trimmed, { allowLanHttp: process.env.ALLOW_HTTP_LAN !== 'false' })
  })) throw new Error('APP_ORIGIN في الإنتاج يجب أن يستخدم HTTPS')

}

const app = express()
const jobExams = createJobExamService(db, { getApplicantsByIds, insertExamRoster })
const committees = createCommitteeService(db, { getApplicantsByIds, listApplicants, jobExams })
const autoGenerateExams = createAutoGenerateExamsService(db, jobExams, { listApplicants })
const monitoring = createMonitoringStore(db)
const evaluations = createEvaluationService(db, { jobExams, committees, assertExamAccess, monitoring, listApplicants, insertExamRoster })
const examRuns = createExamRunService(db, { jobExams })
installArchiveProtection(db)
const archiveBackups = createArchiveBackups(db, process.env.ARCHIVE_BACKUP_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backups/archive'), { mirrorDirectory: resolveBackupMirror() })
archiveBackups.start()
const PORT = Number(process.env.PORT || 3001)
const HOST = String(process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'))
const JWT_SECRET = loadJwtSecret(dataDir)
const JWT_OPTIONS = { algorithms: ['HS256'], issuer: 'exam-platform' }
const allowedOrigins = Array.from(new Set([
  ...(process.env.APP_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  // Always allow local Vite/dev UI unless production hardens origins via APP_ORIGIN alone.
  ...(process.env.NODE_ENV === 'production' ? [] : [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]),
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  `https://localhost:${PORT}`,
  `https://127.0.0.1:${PORT}`,
].filter(Boolean)))
const PUBLIC_APP_URL = resolvePublicAppUrl(process.env)
if (process.env.NODE_ENV === 'production' && !allowedOrigins.includes(PUBLIC_APP_URL)) throw new Error('PUBLIC_APP_URL يجب أن يكون ضمن APP_ORIGIN')

if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY)

app.disable('x-powered-by')
app.use((req, res, next) => {
  const started = Date.now()
  req.requestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 80)
  res.setHeader('X-Request-Id', req.requestId)
  res.on('finish', () => console.log(JSON.stringify({ level: res.statusCode >= 500 ? 'error' : 'info', event: 'http_request', requestId: req.requestId, method: req.method, path: req.route?.path || (req.path.startsWith('/api/') ? '/api/unmatched' : req.path), status: res.statusCode, durationMs: Date.now() - started })))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
  return callback(new Error('مصدر الطلب غير مسموح'))
}, credentials: true }))
app.use(express.json({ limit: '2mb' }))

function signToken(payload) {
  // لا نعيد تمرير مطالبات JWT القديمة عند تدوير الجلسة؛ المكتبة ترفض الجمع
  // بين exp الموروث و expiresIn كما أن الجلسة الجديدة يجب أن تبدأ بعمر جديد.
  const claims = { ...payload }
  for (const key of ['exp', 'iat', 'iss', 'nbf', 'aud']) delete claims[key]
  return jwt.sign(claims, JWT_SECRET, { expiresIn: SESSION_MAX_AGE_SECONDS, algorithm: 'HS256', issuer: 'exam-platform' })
}

function verifyToken(token) {
  const user = committees.resolve(jwt.verify(token, JWT_SECRET, JWT_OPTIONS))
  if (['admin', 'commander'].includes(user.role)) {
    const row = db.prepare('SELECT auth_version,must_rotate_password FROM admins WHERE id=? AND username=?').get(user.id, user.username)
    if (!row || Number(user.authVersion) !== Number(row.auth_version)) throw new Error('جلسة ملغاة')
    return { ...user, mustRotatePassword: !!row.must_rotate_password }
  }
  if (user.role === 'operator') {
    const row = db.prepare('SELECT auth_version,must_rotate_password FROM access_accounts WHERE id=? AND username=?').get(user.id, user.username)
    if (!row || Number(user.authVersion) !== Number(row.auth_version)) throw new Error('جلسة ملغاة')
    return { ...user, mustRotatePassword: !!row.must_rotate_password }
  }
  if (user.role === 'examinee') {
    const roster = db.prepare('SELECT qr_session_id FROM exam_roster WHERE id=? AND exam_id=?').get(user.rosterId, user.examId)
    if (!roster || !user.sessionId || roster.qr_session_id !== user.sessionId) throw new Error('جلسة ممتحن ملغاة')
  }
  return user
}

function requestToken(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7)
  return parseCookies(req.headers.cookie).exam_session || null
}

attachCommitteeRoutes(app, committees, verifyToken, PUBLIC_APP_URL)

attachCommitteeProtection(app, db, verifyToken, (user) => !!user.rosterId && evaluations.hasSessions(user.rosterId), true)

function loginRateLimit(req, res, next) {
  const identity = String(req.body?.username || req.body?.qrToken || req.body?.token || '').trim().toLowerCase().slice(0, 120)
  const key = crypto.createHash('sha256').update(`${req.ip}:${req.path}:${identity}`).digest('hex')
  const now = Date.now()
  const windowMs = 15 * 60 * 1000
  let entry = db.prepare('SELECT count,started_at AS startedAt FROM auth_rate_limits WHERE key=?').get(key)
  if (entry && now - entry.startedAt > windowMs) {
    db.prepare('DELETE FROM auth_rate_limits WHERE key=?').run(key)
    entry = null
  }
  if (entry?.count >= 10) {
    res.setHeader('Retry-After', String(Math.ceil((windowMs - (now - entry.startedAt)) / 1000)))
    return res.status(429).json({ error: 'محاولات دخول كثيرة. أعد المحاولة لاحقاً.' })
  }
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) db.prepare('DELETE FROM auth_rate_limits WHERE key=?').run(key)
    else if (res.statusCode === 401) db.prepare(`INSERT INTO auth_rate_limits(key,count,started_at,updated_at) VALUES(?,1,?,?)
      ON CONFLICT(key) DO UPDATE SET count=count+1,updated_at=excluded.updated_at`).run(key, now, Date.now())
  })
  next()
}

const loginCleanup = setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000
  db.prepare('DELETE FROM auth_rate_limits WHERE updated_at < ?').run(cutoff)
}, 15 * 60 * 1000)
loginCleanup.unref()

function isStaff(user) {
  return user?.role === 'admin' || user?.role === 'operator' || user?.role === 'commander'
}

function isCommander(user) {
  return user?.role === 'commander'
}

function seesAllExams(user) {
  return user?.role === 'admin' || user?.role === 'commander'
}

function authStaff() {
  return (req, res, next) => {
    const token = requestToken(req)
    if (!token) return res.status(401).json({ error: 'غير مصرح' })
    try {
      const data = verifyToken(token)
      if (!isStaff(data)) return res.status(403).json({ error: 'صلاحية غير كافية' })
      req.user = data
      next()
    } catch {
      return res.status(401).json({ error: 'جلسة غير صالحة' })
    }
  }
}

/** سجل المتقدمين الأساسي يُدار من المسؤول العام فقط. */
function authGeneralAdmin() {
  return (req, res, next) => {
    const token = requestToken(req)
    if (!token) return res.status(401).json({ error: 'غير مصرح' })
    try {
      const data = verifyToken(token)
      if (data.role !== 'admin') return res.status(403).json({ error: 'سجل المتقدمين متاح للمسؤول العام فقط' })
      req.user = data
      next()
    } catch {
      return res.status(401).json({ error: 'جلسة غير صالحة' })
    }
  }
}

function auth(requiredRole) {
  return (req, res, next) => {
    const token = requestToken(req)
    if (!token) return res.status(401).json({ error: 'غير مصرح' })
    try {
      const data = verifyToken(token)
      if (requiredRole && data.role !== requiredRole) {
        return res.status(403).json({ error: 'صلاحية غير كافية' })
      }
      req.user = data
      next()
    } catch {
      return res.status(401).json({ error: 'جلسة غير صالحة' })
    }
  }
}

/** التحقق من صلاحية الجلسة الحالية */
app.get('/api/auth/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  delete req.headers['if-none-match']
  delete req.headers['if-modified-since']
  const token = requestToken(req)
  if (!token) return res.status(401).json({ error: 'غير مصرح' })
  try {
    const data = verifyToken(token)
    // كل تحقق ناجح يمدد الجلسة؛ الاستعمال المستمر لا يؤدي إلى خروج مفاجئ أثناء المقابلة.
    res.setHeader('Set-Cookie', sessionCookie(signToken(data), SESSION_MAX_AGE_SECONDS, req))
    return res.json({
      role: data.role,
      username: data.username,
      label: data.label,
      category: data.category,
      oralRole: data.oralRole ?? null,
      theoryTrack: data.theoryTrack ?? null,
      examineeName: data.examineeName,
      examId: data.examId,
      mustRotatePassword: !!data.mustRotatePassword,
    })
  } catch {
    return res.status(401).json({ error: 'جلسة غير صالحة' })
  }
})

function assertExamAccess(user, exam) {
  if (seesAllExams(user)) return true
  if (user.role !== 'operator') return false
  if (exam.category !== user.category) return false
  if (user.oralRole && (!exam.oral_role || !oralRolesCompatible(user.oralRole, exam.oral_role))) return false
  return true
}

function filterExamsForUser(user, rows) {
  if (seesAllExams(user)) return rows
  return rows.filter((e) => {
    if (e.category !== user.category) return false
    // شفهي: الاختبار يجب أن يحمل oral_role مطابقاً (فني / برمجة / شبكات) — لا تُعرض الاختبارات المختلطة القديمة
    if (user.oralRole && (!e.oral_role || !oralRolesCompatible(user.oralRole, e.oral_role))) return false
    const roster = listRosterPublic(e.id)
    if (!roster.length) return true
    return roster.some((candidate) => oralCandidateMatches(user, candidate))
  })
}


/** يعتمد ظهور المتقدم للحساب على مصفوفة آلية التقييم + توافق مسمى الشفهي. */
function oralCandidateMatches(user, candidate) {
  return candidateVisibleToOperator(user, {
    ...candidate,
    jobTitle: candidate?.jobTitle || effectiveJobTitle(candidate),
  })
}


function attemptPercent(score, maxScore) {
  if (maxScore == null || Number(maxScore) <= 0) return null
  return Math.round((Number(score) / Number(maxScore)) * 100)
}

function averagePercents(percents) {
  const valid = percents.filter((p) => p != null && !Number.isNaN(p))
  if (!valid.length) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

function scopedExamIds(user) {
  const rows = db.prepare('SELECT * FROM exams').all()
  return filterExamsForUser(user, rows).map((e) => e.id)
}

/**
 * يُدرج سجلاً في الأرشيف الموحّد. INSERT OR IGNORE يمنع التكرار.
 * detail: بيانات خاصة بالنوع (أسئلة الشفهي، سمات الشخصية، إلخ)
 */
function insertArchiveRecord({ archiveId, category, examId, examTitle, oralRole,
  examineeName, displayId, org, jobTitle, rank,
  score, maxScore, detail, archivedAt, evaluator, applicantId, attemptId }) {
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : null
  const id = archiveId || crypto.randomUUID()
    db.prepare(`
      INSERT INTO assessment_archive
        (id, category, exam_id, exam_title, oral_role, examinee_name, display_id, org,
         job_title, rank, score, max_score, percent, detail_json, archived_at, evaluator, applicant_id, attempt_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, category, examId || null, String(examTitle || ''), oralRole || null,
      String(examineeName || ''), displayId || null, org || null,
      jobTitle || null, rank || null,
      Number(score) || 0, Number(maxScore) || 0, percent,
      JSON.stringify(detail || {}), archivedAt || new Date().toISOString(),
      evaluator || null,
      applicantId || null,
      attemptId || null,
    )
}

function auditMutation(req, action, resourceType, resourceId, before, after, reason = null) {
  const hash = (value) => value == null ? null : crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const clientIp = extractClientIp(req)
  db.prepare(`INSERT INTO audit_events
    (id,actor_id,actor_name,actor_role,request_id,ip_address,action,resource_type,resource_id,before_hash,after_hash,reason,occurred_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      crypto.randomUUID(), String(req?.user?.id || ''), String(req?.user?.username || req?.user?.label || 'unknown'),
      String(req?.user?.role || 'unknown'), req?.requestId || null, clientIp || null, action, resourceType, String(resourceId || ''),
      hash(before), hash(after), reason ? String(reason).slice(0, 500) : null, new Date().toISOString(),
    )
}

/** جلسة قيادة إدارية افتراضية كي يبدأ حساب القيادة من سجل المتقدمين الأساسي. */
function ensureDrivingEvaluationExam(user) {
  if (user?.role !== 'operator' || user.category !== 'driving') return
  const existing = db.prepare("SELECT id FROM exams WHERE category = 'driving' LIMIT 1").get()
  if (existing) return
  const id = `exam-driving-${Date.now()}`
  const username = `internal_${crypto.randomBytes(16).toString('hex')}`
  const capacity = Math.max(countApplicants(), 1)
  db.prepare(`INSERT INTO exams (
    id, title, category, level, oral_role, capacity, question_count, username,
    password_hash, password_plain, question_ids, questions_json, created_by, created_at, active
  ) VALUES (?, ?, 'driving', 'technician', NULL, ?, 0, ?, ?, ?, '[]', '[]', ?, ?, 1)`).run(
    id, 'أهلية قيادة الضابط', capacity, username, '', '',
    user.username, new Date().toISOString(),
  )
}

/** قائمة حسابات الوصول (للعرض في شاشة الدخول) */
app.get('/api/access-accounts', authGeneralAdmin(), (_req, res) => {
  res.json(listAccessAccountsPublic())
})

/** دخول المسؤول العام أو حساب وصول */
app.post('/api/auth/admin/login', loginRateLimit, async (req, res) => {
  const { username, password } = req.body || {}
  // يقبل النسخ من نصوص Markdown التي تكتب \@ بدلاً من @، دون تغيير كلمة المرور المخزنة.
  const loginPassword = String(password || '').replace(/\\@/g, '@')

  const commAccount = db.prepare('SELECT * FROM committee_accounts WHERE username=? COLLATE NOCASE').get(String(username || ''))
  if (commAccount && await bcrypt.compare(loginPassword, commAccount.password_hash)) {
    if (commAccount.active === 0) {
      return res.status(403).json({ error: 'الحساب معطل حالياً من قِبل الإدارة', code: 'ACCOUNT_DISABLED' })
    }
    const committeeUser = {
      id: commAccount.id,
      role: commAccount.role,
      username: commAccount.username,
      label: commAccount.name,
      committeeId: commAccount.committee_id,
      authVersion: commAccount.auth_version,
    }
    const token = signToken(committeeUser)
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_SECONDS, req))
    auditMutation(req, 'login', 'committee_account', commAccount.id, null, { username: commAccount.username, role: commAccount.role })
    return res.json({ ...committeeUser, token })
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username)
  if (admin && await bcrypt.compare(loginPassword, admin.password_hash)) {
    if (admin.active === 0) {
      return res.status(403).json({ error: 'الحساب معطل حالياً من قِبل الإدارة', code: 'ACCOUNT_DISABLED' })
    }
    const role = admin.username === 'commander' ? 'commander' : 'admin'
    const token = signToken({ role, username: admin.username, id: admin.id, authVersion: admin.auth_version })
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_SECONDS, req))
    auditMutation(req, 'login', 'admin_account', admin.id, null, { username: admin.username, role })
    return res.json({
      token,
      role,
      username: admin.username,
      label: role === 'commander' ? 'القائد' : 'المسؤول العام',
      mustRotatePassword: !!admin.must_rotate_password,
    })
  }

  const op = db.prepare('SELECT * FROM access_accounts WHERE username = ?').get(username)
  if (op && await bcrypt.compare(loginPassword, op.password_hash)) {
    if (op.active === 0) {
      return res.status(403).json({ error: 'الحساب معطل حالياً من قِبل الإدارة', code: 'ACCOUNT_DISABLED' })
    }
    const token = signToken({
      role: 'operator',
      username: op.username,
      id: op.id,
      category: op.category,
      oralRole: op.oral_role || null,
      theoryTrack: op.theory_track || null,
      specialization: op.specialization || null,
      label: op.label,
      authVersion: op.auth_version,
    })
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_SECONDS, req))
    auditMutation(req, 'login', 'operator_account', op.id, null, { username: op.username, category: op.category })
    return res.json({
      token,
      role: 'operator',
      username: op.username,
      category: op.category,
      oralRole: op.oral_role || null,
      theoryTrack: op.theory_track || null,
      specialization: op.specialization || null,
      label: op.label,
      description: op.description,
      mustRotatePassword: !!op.must_rotate_password,
    })
  }

  return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' })
})

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie(req))
  res.json({ ok: true })
})

function validateNewPassword(value) {
  const password = String(value || '')
  if (password.length < 14 || Buffer.byteLength(password) > 72 || !/[A-Z]/i.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw Object.assign(new Error('كلمة المرور الجديدة يجب أن تكون من 14 إلى 72 بايت وتحتوي حرفًا ورقمًا ورمزًا'), { status: 400 })
  }
  return password
}

function recordPasswordChange({ targetType, target, actor, action, reason, requestId, ipAddress = '' }) {
  db.prepare(`INSERT INTO password_change_log
    (id,target_type,target_id,target_username,actor_type,actor_id,actor_username,action,reason,request_id,ip_address,changed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      crypto.randomUUID(), targetType, String(target.id), target.username, actor.role || 'developer',
      actor.id == null ? null : String(actor.id), actor.username || 'developer', action,
      reason ? String(reason).slice(0, 500) : null, requestId || null, ipAddress || null, new Date().toISOString(),
    )
}

app.post('/api/auth/change-password', auth(), async (req, res) => {
  if (req.user.role === 'examinee') return res.status(403).json({ error: 'هذا المسار لحسابات الإدارة واللجان' })
  if (req.user.role === 'admin' && req.user.username === 'admin') {
    return res.status(403).json({ error: 'كلمة مرور admin محمية ولا يغيرها إلا المطور من الجهاز المضيف' })
  }
  const currentPassword = String(req.body?.currentPassword || '')
  let newPassword
  try { newPassword = validateNewPassword(req.body?.newPassword) }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }) }
  const committeeAccount = req.user.role.startsWith('committee_')
  const table = committeeAccount ? 'committee_accounts' : req.user.role === 'operator' ? 'access_accounts' : 'admins'
  const row = db.prepare('SELECT * FROM ' + table + ' WHERE id=?').get(req.user.id)
  if (!row || !await bcrypt.compare(currentPassword, row.password_hash)) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' })
  const passwordHash = await bcrypt.hash(newPassword, 12)
  const clientIp = extractClientIp(req)
  db.transaction(() => {
    db.prepare('UPDATE ' + table + ' SET password_hash=?,' + (committeeAccount ? '' : 'must_rotate_password=0,') + 'auth_version=auth_version+1 WHERE id=?').run(passwordHash, row.id)
    recordPasswordChange({ targetType: committeeAccount ? 'committee' : req.user.role === 'operator' ? 'operator' : 'staff', target: row, actor: req.user, action: 'self_change', reason: 'تغيير اختياري من صاحب الحساب', requestId: req.requestId, ipAddress: clientIp })
  })()
  const fresh = { ...req.user, authVersion: Number(row.auth_version) + 1, mustRotatePassword: false }
  const token = signToken(fresh)
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_SECONDS, req))
  res.json({ ok: true, token, mustRotatePassword: false })
})

app.get('/api/admin/password-accounts', authGeneralAdmin(), (_req, res) => {
  const staff = db.prepare("SELECT id,username,CASE WHEN username='admin' THEN 'المسؤول العام' ELSE 'القائد' END AS label,'staff' AS type,active FROM admins").all()
  const operators = db.prepare("SELECT id,username,label,'operator' AS type,active,category,oral_role,theory_track,specialization FROM access_accounts ORDER BY id").all()
  const committee = db.prepare("SELECT id,username,name AS label,'committee' AS type,active FROM committee_accounts ORDER BY rowid").all()
  res.json([...staff, ...operators, ...committee].map((account) => ({ ...account, active: !!account.active, canReset: !(account.type === 'staff' && account.username === 'admin') })))
})

app.get('/api/admin/password-history', authGeneralAdmin(), (req, res) => {
  const cursor = String(req.query.cursor || '').trim()
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const rows = db.prepare(`SELECT id,target_type AS targetType,target_id AS targetId,target_username AS targetUsername,
    actor_type AS actorType,actor_username AS actorUsername,action,reason,request_id AS requestId,ip_address AS ipAddress,changed_at AS changedAt
    FROM password_change_log WHERE (?='' OR changed_at<?) ORDER BY changed_at DESC LIMIT ?`).all(cursor, cursor, limit + 1)
  res.json({ history: rows.slice(0, limit), hasNext: rows.length > limit, nextCursor: rows.length > limit ? rows[limit - 1].changedAt : null })
})

app.post('/api/admin/password-accounts/:targetType/:targetId/reset', authGeneralAdmin(), async (req, res) => {
  const specs = {
    staff: { table: 'admins' },
    operator: { table: 'access_accounts' },
    committee: { table: 'committee_accounts' },
  }
  const spec = specs[req.params.targetType]
  if (!spec) return res.status(400).json({ error: 'نوع الحساب غير صالح' })
  const target = db.prepare(`SELECT * FROM ${spec.table} WHERE id=?`).get(req.params.targetId)
  if (!target) return res.status(404).json({ error: 'الحساب غير موجود' })
  if (req.params.targetType === 'staff' && target.username === 'admin') {
    return res.status(403).json({ error: 'كلمة مرور admin محمية ولا يغيرها إلا المطور من الجهاز المضيف' })
  }
  let newPassword
  try { newPassword = validateNewPassword(req.body?.newPassword) }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }) }
  const reason = String(req.body?.reason || 'إعادة ضبط بسبب نسيان كلمة المرور').trim().slice(0, 500)
  const passwordHash = await bcrypt.hash(newPassword, 12)
  const clientIp = extractClientIp(req)
  db.transaction(() => {
    db.prepare(`UPDATE ${spec.table} SET password_hash=?,auth_version=auth_version+1${req.params.targetType === 'committee' ? '' : ',must_rotate_password=0'} WHERE id=?`).run(passwordHash, target.id)
    recordPasswordChange({ targetType: req.params.targetType, target, actor: req.user, action: 'admin_reset', reason, requestId: req.requestId, ipAddress: clientIp })
  })()
  auditMutation(req, 'password_reset', req.params.targetType + '_account', target.id, { username: target.username }, { username: target.username, sessionsInvalidated: true }, reason)
  res.json({ ok: true, message: 'تم تحديث كلمة المرور وإلغاء جلسات الحساب السابقة' })
})

/** دخول الممتحن حصراً عبر QR فردي صالح للاستخدام مرة واحدة. */
app.post('/api/auth/exam/qr-login', loginRateLimit, (req, res) => {
  const qrToken = String(req.body?.token || '').trim()
  if (!qrToken || qrToken.length < 40) {
    return res.status(401).json({
      error: 'رمز الدخول ناقص أو غير مكتمل. امسح رمز QR من البطاقة المطبوعة (وليس رقم الممتحن)، أو أعد طباعة البطاقة من قائمة الممتحنين.',
      code: 'INVALID_TOKEN_FORMAT',
    })
  }
  const committeeExam = db.prepare('SELECT a.id FROM committee_assignments a JOIN exam_roster r ON r.exam_id=a.exam_id WHERE r.qr_token=?').get(qrToken)
  const candidate = db.prepare('SELECT id, exam_id FROM exam_roster WHERE qr_token=?').get(qrToken)
  const evaluationQr = candidate && evaluations.qrReady(candidate.id)
  const jobQuestionsReady = candidate
    ? !!db
        .prepare(
          `SELECT 1 AS ok FROM exam_question_sets
           WHERE roster_id=? AND json_array_length(questions_json) > 0`,
        )
        .get(candidate.id)
    : false
  // لجنة + وضع QR التقييمي يحتاج اعتماد الأعضاء؛ أما اختبار بأسئلة محفوظة مسبقاً فيُسمح بالدخول مباشرة.
  if (committeeExam && !evaluationQr && !jobQuestionsReady) {
    return res.status(409).json({
      error: 'يجب إعداد وضع QR واعتماد أسئلته من حساب عضو اللجنة أولًا.',
      code: 'COMMITTEE_QR_NOT_READY',
    })
  }

  const claimResult = claimRosterByQrToken(qrToken, req.body?.deviceId)
  if (!claimResult || !claimResult.ok) {
    const status = claimResult?.status || 401
    let message = claimResult?.error || 'رمز QR غير صالح أو منتهٍ'
    let code = claimResult?.code || 'INVALID_QR'
    if (code === 'EXAM_INACTIVE') {
      const rosterRow = db.prepare('SELECT exam_id FROM exam_roster WHERE qr_token=?').get(qrToken)
      if (rosterRow && jobExams.pendingGroups(rosterRow.exam_id).length > 0) {
        code = 'EXAM_DRAFT_PENDING_QUESTIONS'
        message = 'الاختبار ما زال مسودة بلا أسئلة مكتملة؛ يجب استكمال الأسئلة من لوحة الإدارة قبل مسح رمز الدخول'
      }
    }
    return res.status(status).json({ error: message, code })
  }
  return issueExamineeFromRoster(req, res, claimResult, true)
})

function issueExamineeFromRoster(req, res, roster, claimedByQr = false) {
  if (!roster.exam_active) {
    return res.status(403).json({ error: 'هذا الاختبار متوقف حالياً' })
  }
  if (roster.used && !claimedByQr) {
    return res.status(403).json({ error: 'تم استخدام هذا الحساب مسبقاً — لا يمكن الدخول مجدداً' })
  }

  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(roster.exam_id)
  const used = countAttempts(exam.id)

  const already = db
    .prepare('SELECT id FROM attempts WHERE exam_id = ? AND examinee_name = ?')
    .get(exam.id, roster.name)
  if (already) {
    return res.status(403).json({ error: 'تم تسليم هذا الاختبار مسبقاً' })
  }

  const token = signToken({
    role: 'examinee',
    examId: exam.id,
    examineeName: roster.name,
    rosterId: roster.id,
    sessionId: roster.qr_session_id,
  })

  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_SECONDS, req))
  res.json({
    token,
    role: 'examinee',
    examineeName: roster.name,
    exam: publicExam(exam, used),
  })
}

function examQuestionTypes(exam) {
  const fromConfig = questionTypesFromConfig(jobExams.configOf?.(exam.id))
  if (fromConfig.length) return fromConfig
  try {
    const parsed = JSON.parse(exam.questions_json || '[]')
    const fromExam = questionTypesFromQuestions(Array.isArray(parsed) ? parsed : [])
    if (fromExam.length) return fromExam
  } catch { /* ignore */ }
  try {
    const rows = db.prepare('SELECT questions_json FROM exam_question_sets WHERE exam_id=? LIMIT 8').all(exam.id)
    const questions = rows.flatMap((row) => {
      try { return JSON.parse(row.questions_json || '[]') } catch { return [] }
    })
    return questionTypesFromQuestions(questions)
  } catch {
    return []
  }
}

function linkedTheoryTrack(exam) {
  try {
    const link = db.prepare(`
      SELECT c.theory_track AS theoryTrack, c.owner_username AS ownerUsername
      FROM committee_assignments a
      JOIN committees c ON c.id = a.committee_id
      WHERE a.exam_id = ?
      LIMIT 1
    `).get(exam.id)
    return resolveExamTheoryTrack({
      category: exam.category,
      theoryTrack: link?.theoryTrack,
      ownerUsername: link?.ownerUsername || exam.created_by,
    })
  } catch {
    return resolveExamTheoryTrack({ category: exam.category, ownerUsername: exam.created_by })
  }
}

function publicExam(exam, used) {
  const rosterCount = countRoster(exam.id)
  const cfg = jobExams.configOf?.(exam.id)
  const qCount = exam.question_count
  const durationMinutes = Number.isFinite(Number(cfg?.durationMinutes)) && Number(cfg.durationMinutes) > 0
    ? Math.max(1, Math.min(600, Math.floor(Number(cfg.durationMinutes))))
    : null
  const questionTypes = examQuestionTypes(exam)
  const theoryTrack = linkedTheoryTrack(exam)
  const evaluationMode = jobExams.evaluationMode?.(exam.id) || null
  return {
    id: exam.id,
    title: exam.title,
    category: exam.category,
    level: exam.level,
    oralRole: exam.oral_role,
    capacity: exam.capacity,
    usedSeats: used,
    remainingSeats: exam.capacity - used,
    questionCount: qCount,
    secondsPerQuestion: effectiveSecondsPerQuestion(exam.category, qCount, cfg),
    durationMinutes,
    jobBased: jobExams.isJobBased(exam.id),
    pendingQuestions: jobExams.pendingGroups(exam.id).length > 0,
    createdAt: exam.created_at,
    createdBy: exam.created_by || null,
    hasRoster: rosterCount > 0,
    rosterCount,
    theoryTrack,
    questionTypes,
    evaluationMode,
    objectiveExam: isObjectiveExam(questionTypes),
    showsBarcode: showsEntryBarcode({ category: exam.category, theoryTrack, questionTypes, evaluationMode }),
    committeeId: db.prepare('SELECT committee_id FROM committee_assignments WHERE exam_id=?').get(exam.id)?.committee_id || null,
  }
}

function stripAnswers(questions) {
  return questions.map((q) => {
    return { id: q.id, category: q.category, type: q.type, topic: q.topic, text: q.text, choices: q.choices, difficulty: q.difficulty, points: q.points }
  })
}

app.get('/api/admin/exams', authStaff(), (req, res) => {
  ensureDrivingEvaluationExam(req.user)
  const rows = db.prepare('SELECT e.*,(SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id) AS attempt_count FROM exams e WHERE deleted_at IS NULL ORDER BY created_at DESC').all()
  const filtered = filterExamsForUser(req.user, rows)
  res.json(
    filtered.map((e) => ({
      ...publicExam(e, e.attempt_count),
      active: !!e.active,
    })),
  )
})

/** قائمة الممتحنين مع متوسط نتائجهم عبر الاختبارات */
app.get('/api/admin/examinees', authStaff(), (req, res) => {
  const examIds = scopedExamIds(req.user)
  if (!examIds.length) return res.json([])

  const placeholders = examIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `
      SELECT
        a.examinee_name AS examineeName,
        a.applicant_id AS applicantId,
        a.score,
        a.max_score AS maxScore,
        a.finished_at AS finishedAt,
        e.id AS examId,
        e.title AS examTitle,
        e.category AS category,
        e.oral_role AS oralRole,
        (SELECT c.theory_track FROM committee_assignments ca JOIN committees c ON c.id = ca.committee_id WHERE ca.exam_id = e.id LIMIT 1) AS theoryTrack,
        (SELECT c.owner_username FROM committee_assignments ca JOIN committees c ON c.id = ca.committee_id WHERE ca.exam_id = e.id LIMIT 1) AS ownerUsername
      FROM attempts a
      JOIN exams e ON e.id = a.exam_id
      WHERE a.exam_id IN (${placeholders})
      ORDER BY a.finished_at DESC
    `,
    )
    .all(...examIds)

  const map = new Map()
  for (const row of rows) {
    const key = row.applicantId ? 'id:' + row.applicantId : 'name:' + String(row.examineeName || '').trim()
    if (!key || key === 'name:') continue
    if (isHiddenPerson(row.applicantId, row.examineeName)) continue
    if (!map.has(key)) {
      map.set(key, {
        examineeName: key,
        applicantId: row.applicantId || null,
        displayName: String(row.examineeName || '').trim(),
        examCount: 0,
        latestByCategory: new Map(),
        examScores: {},
        exams: [],
        lastFinishedAt: row.finishedAt,
        categories: new Set(),
      })
    }
    const item = map.get(key)
    item.examCount += 1
    const examTitle = String(row.examTitle || '').trim() || row.category
    const percent = attemptPercent(row.score, row.maxScore)
    if (!(examTitle in item.examScores)) item.examScores[examTitle] = percent
    if (!item.exams.some((exam) => exam.examId === row.examId)) {
      item.exams.push({
        examId: row.examId,
        title: examTitle,
        category: row.category,
        oralRole: row.oralRole,
        theoryTrack: resolveExamTheoryTrack({
          category: row.category,
          theoryTrack: row.theoryTrack,
          ownerUsername: row.ownerUsername,
        }),
        ownerUsername: row.ownerUsername,
        score: percent,
      })
    }
    if (!item.latestByCategory.has(row.category)) item.latestByCategory.set(row.category, attemptPercent(row.score, row.maxScore))
    item.categories.add(row.category)
    if (row.finishedAt > item.lastFinishedAt) item.lastFinishedAt = row.finishedAt
  }

  const items = [...map.values()]
  const applicantIds = items.map((item) => item.applicantId).filter(Boolean)
  const applicantsById = new Map(applicantIds.length ? db.prepare(`SELECT * FROM applicants WHERE id IN (${applicantIds.map(() => '?').join(',')})`).all(...applicantIds).map((row) => [row.id, row]) : [])
  const legacyNames = items.filter((item) => !item.applicantId).map((item) => item.displayName)
  const profilesByName = new Map(legacyNames.length ? db.prepare(`SELECT * FROM examinee_profiles WHERE name IN (${legacyNames.map(() => '?').join(',')})`).all(...legacyNames).map((row) => [row.name, row]) : [])
  const displayIdsByKey = new Map()
  for (const row of db.prepare(`SELECT applicant_id,name,display_id FROM exam_roster WHERE exam_id IN (${placeholders}) AND display_id IS NOT NULL`).all(...examIds)) {
    const key = row.applicant_id ? 'id:' + row.applicant_id : 'name:' + row.name
    const values = displayIdsByKey.get(key) || []
    if (!values.includes(row.display_id)) values.push(row.display_id)
    displayIdsByKey.set(key, values)
  }
  const list = items
    .map((item) => {
      const applicant = item.applicantId ? applicantsById.get(item.applicantId) : null
      if (applicant && !hasFinishedAllRequiredExams(db, {
        id: applicant.id,
        name: applicant.name,
        jobTitle: applicant.job_title || '',
        jobTitleOrg: applicant.job_title_org || '',
        jobTitleCommittee: applicant.job_title_committee || '',
        extra: applicant.extra_json ? JSON.parse(applicant.extra_json) : {},
      })) return null
      const profile = applicant || profilesByName.get(item.displayName)
      let extra = {}
      try { extra = applicant?.extra_json ? JSON.parse(applicant.extra_json) : {} } catch { extra = {} }
      const person = {
        jobTitle: applicant?.job_title_committee || applicant?.job_title || profile?.job_title || '',
        jobTitleOrg: applicant?.job_title_org || '',
        jobTitleCommittee: applicant?.job_title_committee || '',
        extra,
      }
      const examResults = describeExamineeExams(person, item.exams)
      const examineeIds = displayIdsByKey.get(item.applicantId ? 'id:' + item.applicantId : 'name:' + item.displayName) || []
      const required = applicant
        ? requiredExamCategories({
          jobTitle: applicant.job_title || '',
          jobTitleOrg: applicant.job_title_org || '',
          jobTitleCommittee: applicant.job_title_committee || '',
          extra: applicant.extra_json ? JSON.parse(applicant.extra_json) : {},
        })
        : [...item.latestByCategory.keys()]
      const requiredCategories = required.length ? required : [...item.latestByCategory.keys()]
      const categoryPercents = requiredCategories.map((category) => item.latestByCategory.get(category)).filter((value) => value != null)
      const requiredComplete = requiredCategories.every((category) => item.latestByCategory.get(category) != null)
      return {
        applicantId: item.applicantId,
        seqNumber: applicant?.seq_number ?? null,
        displayId: applicant?.display_id || examineeIds[0] || '',
        examineeName: item.displayName,
        examineeIds,
        org: profile?.org || '',
        jobTitle: profile?.job_title || '',
        rank: isCommander(req.user) ? profile?.rank || '' : undefined,
        jobTitleOrg: applicant?.job_title_org || '',
        jobTitleCommittee: applicant?.job_title_committee || '',
        proposedSalary: applicant?.proposed_salary != null ? Number(applicant.proposed_salary) : null,
        rankCommittee: applicant?.rank_committee || '',
        approvedSalary: applicant?.approved_salary != null ? Number(applicant.approved_salary) : null,
        educationCommittee: applicant?.education_committee || '',
        extra,
        examCount: item.examCount,
        finalPercent: seesAllExams(req.user) ? (requiredComplete ? averagePercents(categoryPercents) : null) : averagePercents(categoryPercents),
        resultPolicyVersion: 'latest-per-category-v1',
        categoryResults: Object.fromEntries(item.latestByCategory),
        examScores: item.examScores,
        examResults,
        lastFinishedAt: item.lastFinishedAt,
        categories: [...item.categories],
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lastFinishedAt).localeCompare(String(a.lastFinishedAt)))

  res.json(list)
})

app.delete('/api/admin/examinees/:identifier', authGeneralAdmin(), (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.identifier || '')
    const result = deleteExaminee(identifier, req.user.username)
    auditMutation(req, 'delete', 'examinee', identifier, null, result, req.body?.reason)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message || 'فشل حذف الممتحن' })
  }
})

app.get('/api/admin/examinee-filters', authStaff(), (req, res) => {
  res.json(listOrgsAndJobs())
})

app.patch('/api/admin/examinees/:name/rank', authStaff(), (req, res) => {
  if (!isCommander(req.user)) {
    return res.status(403).json({ error: 'تعديل الرتبة متاح لحساب القائد فقط' })
  }
  const identifier = decodeURIComponent(req.params.name || '').trim()
  if (!identifier) return res.status(400).json({ error: 'معرّف الممتحن مطلوب' })
  const rank = String(req.body?.rank || '').trim()
  const applicant = db.prepare('SELECT * FROM applicants WHERE id=?').get(identifier)
  const name = applicant?.name || identifier
  if (applicant) updateApplicant(applicant.id, { rank })
  const profile = setExamineeRank(name, rank)
  res.json({
    ok: true,
    examineeName: name,
    rank: profile?.rank || '',
    org: profile?.org || '',
    jobTitle: profile?.job_title || '',
  })
})

/** نتائج ممتحن واحد عبر كل الاختبارات + المتوسط النهائي */
app.get('/api/admin/examinees/:name', authStaff(), (req, res) => {
  const identifier = decodeURIComponent(req.params.name || '').trim()
  if (!identifier) return res.status(400).json({ error: 'معرّف الممتحن مطلوب' })
  const applicant = db.prepare('SELECT * FROM applicants WHERE id=?').get(identifier)
  const name = applicant?.name || identifier

  const examIds = scopedExamIds(req.user)
  if (!examIds.length) {
    return res.status(404).json({ error: 'لا نتائج لهذا الممتحن' })
  }

  const placeholders = examIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `
      SELECT
        a.id AS attemptId,
        a.examinee_name AS examineeName,
        a.score,
        a.max_score AS maxScore,
        a.personality_json AS personalityJson,
        a.started_at AS startedAt,
        a.finished_at AS finishedAt,
        e.id AS examId,
        e.title AS examTitle,
        e.category AS category,
        e.level AS level,
        e.oral_role AS oralRole,
        (SELECT COUNT(*) FROM result_audit_log l WHERE l.attempt_id=a.id) AS auditCount,
        EXISTS(SELECT 1 FROM committee_results c WHERE c.attempt_id=a.id) AS committeeResult,
        (SELECT note FROM committee_results c WHERE c.attempt_id=a.id) AS committeeNote,
        (SELECT estimated_salary FROM committee_results c WHERE c.attempt_id=a.id) AS estimatedSalary
      FROM attempts a
      JOIN exams e ON e.id = a.exam_id
      WHERE a.exam_id IN (${placeholders}) AND (a.applicant_id = ? OR (a.applicant_id IS NULL AND a.examinee_name = ?))
      ORDER BY a.finished_at DESC
    `,
    )
    .all(...examIds, applicant?.id || '__none__', name)

  if (!rows.length) {
    return res.status(404).json({ error: 'لا نتائج لهذا الممتحن' })
  }

  const attempts = rows.map((row) => {
    const percent = attemptPercent(row.score, row.maxScore)
    return {
      attemptId: row.attemptId,
      committeeResult: !!row.committeeResult,
      committeeNote: row.committeeNote || null,
      estimatedSalary: row.estimatedSalary == null ? null : row.estimatedSalary,
      examId: row.examId,
      examTitle: row.examTitle,
      category: row.category,
      level: row.level,
      oralRole: row.oralRole,
      score: row.score,
      maxScore: row.maxScore,
      percent,
      auditCount: row.auditCount || 0,
      personality: row.personalityJson ? JSON.parse(row.personalityJson) : null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    }
  })

  const latest = new Map()
  for (const attempt of attempts) if (!latest.has(attempt.category) && attempt.percent != null) latest.set(attempt.category, attempt.percent)
  const person = applicant
    ? {
        id: applicant.id,
        name: applicant.name,
        jobTitle: applicant.job_title || '',
        jobTitleOrg: applicant.job_title_org || '',
        jobTitleCommittee: applicant.job_title_committee || '',
      }
    : { name }
  const required = requiredExamCategories(person)
  const requiredCategories = required.length ? required : [...latest.keys()]
  const requiredComplete = requiredCategories.every((category) => latest.has(category))
  const categoryPercents = requiredCategories.map((category) => latest.get(category)).filter((value) => value != null)
  const finalPercent = seesAllExams(req.user)
    ? (requiredComplete ? averagePercents(categoryPercents) : null)
    : averagePercents([...latest.values()])

  res.json({
    examineeName: name,
    applicantId: applicant?.id || null,
    examCount: attempts.length,
    finalPercent,
    resultPolicyVersion: 'latest-per-category-v1',
    categoryResults: Object.fromEntries(latest),
    attempts,
  })
})

app.get('/api/admin/leadership-briefing', authStaff(), (req, res) => {
  if (!canViewLeadershipBriefing(req.user)) {
    return res.status(403).json({ error: 'تقرير القيادة متاح للمسؤول العام والقائد فقط' })
  }
  try {
    const period = String(req.query.period || 'all') === '30d' ? '30d' : 'all'
    res.json(buildLeadershipBriefing({ period }))
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'تعذر تجهيز تقرير القيادة' })
  }
})

/** توصية قرار منفصلة — لا تغيّر المتوسط أو الأرشيف أو اعتماد اللجنة */
app.get('/api/admin/examinees/:name/decision', authStaff(), (req, res) => {
  const identifier = decodeURIComponent(req.params.name || '').trim()
  if (!identifier) return res.status(400).json({ error: 'معرّف الممتحن مطلوب' })
  const examIds = scopedExamIds(req.user)
  if (!examIds.length) return res.status(404).json({ error: 'لا نتائج لهذا الممتحن' })
  const decision = decisionForApplicant(identifier, { examIds: seesAllExams(req.user) ? null : examIds })
  if (!decision.examineeName && !decision.applicantId) {
    return res.status(404).json({ error: 'لا نتائج لهذا الممتحن' })
  }
  const hasAny =
    decision.completedCategories.length > 0 ||
    decision.pendingCategories.length > 0 ||
    Object.keys(decision.categoryDetails || {}).length > 0
  if (!hasAny) return res.status(404).json({ error: 'لا نتائج لهذا الممتحن' })
  res.json(attachAdoption(decision))
})

app.post('/api/admin/examinees/:name/decision-adoption', authStaff(), (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.name || '').trim()
    if (!identifier) return res.status(400).json({ error: 'معرّف الممتحن مطلوب' })
    const adoption = adoptDecision(identifier, {
      adoptedStatus: req.body?.adoptedStatus,
      reason: req.body?.reason,
    }, req.user)
    auditMutation(req, 'adopt_decision', 'decision_adoption', adoption.id, null, {
      applicantId: adoption.applicantId,
      adoptedStatus: adoption.adoptedStatus,
      recommendedStatus: adoption.recommendedStatus,
    }, adoption.reason)
    res.json(adoption)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'تعذر اعتماد القرار' })
  }
})

app.get('/api/admin/security-reviews', authStaff(), (req, res) => {
  try {
    if (req.user.role !== 'admin' && !(req.user.role === 'operator' && req.user.category === 'security')) {
      return res.status(403).json({ error: 'صلاحية الأمن العسكري مطلوبة' })
    }
    const queue = listSecurityQueue().filter((row) =>
      candidateVisibleToOperator(req.user, {
        ...row,
        extra: { 'نوع المقابلة': row.interviewType || '' },
      }),
    )
    res.json(queue)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'تعذر تحميل مراجعات الأمن' })
  }
})

app.post('/api/admin/security-reviews/bulk', authStaff(), (req, res) => {
  try {
    const result = saveSecurityReviewsBulk(req.body?.applicantIds, {
      decision: req.body?.decision,
      note: req.body?.note,
    }, req.user)
    auditMutation(req, 'security_review_bulk', 'security_review', 'bulk', null, {
      count: result.count,
      decision: req.body?.decision,
    }, req.body?.note)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'تعذر حفظ القرار الأمني الجماعي' })
  }
})

app.post('/api/admin/security-reviews/:applicantId', authStaff(), (req, res) => {
  try {
    const review = saveSecurityReview(req.params.applicantId, {
      decision: req.body?.decision,
      note: req.body?.note,
    }, req.user)
    auditMutation(req, 'security_review', 'security_review', review.id, null, {
      applicantId: review.applicantId,
      decision: review.decision,
    }, review.note)
    res.json(review)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'تعذر حفظ القرار الأمني' })
  }
})

app.get('/api/admin/question-bank', authStaff(), (req, res) => res.json(jobExams.listBank(req.user)))
app.get('/api/evaluation/exams/:id', auth(), (req, res) => res.json(evaluations.list(req.user, req.params.id)))
app.post('/api/evaluation/exams/:id/sessions', auth(), (req, res) => res.json({ ...evaluations.create(req.user, req.params.id, req.body || {}), publicAppUrl:PUBLIC_APP_URL }))
app.get('/api/evaluation/sessions/:id', auth(), (req, res) => res.json({ ...evaluations.view(req.user, req.params.id), publicAppUrl:PUBLIC_APP_URL }))
app.get('/api/evaluation/sessions/:id/history', auth(), (req, res) => res.json(evaluations.history(req.user, req.params.id)))
app.put('/api/evaluation/sessions/:id/checkpoint', auth(), (req, res) => res.json(evaluations.checkpoint(req.user, req.params.id, req.body || {})))
app.put('/api/evaluation/sessions/:id', auth(), (req, res) => res.json({ ...evaluations.save(req.user, req.params.id, req.body || {}), publicAppUrl:PUBLIC_APP_URL }))
app.put('/api/evaluation/sessions/:id/grades', auth(), (req, res) => res.json({ ...evaluations.grade(req.user, req.params.id, req.body || {}), publicAppUrl:PUBLIC_APP_URL }))
app.post('/api/evaluation/sessions/:id/publish', auth(), (req, res) => {
  const result = evaluations.publish(req.user, req.params.id, req.body || {})
  liveApi.endSessionByExaminee(result.exam_id, result.name)
  res.json(result)
})
app.post('/api/exam/execution/start', auth('examinee'), (req, res) => {
  const result = evaluations.hasSessions(req.user.rosterId)
    ? evaluations.startRun(req.user)
    : examRuns.start(req.user, req.body?.deviceId)
  res.json({ ...result, questions: stripAnswers(result.questions) })
})
app.put('/api/exam/execution/progress', auth('examinee'), (req, res) => {
  const result = evaluations.hasSessions(req.user.rosterId)
    ? evaluations.progress(req.user, req.body || {})
    : examRuns.progress(req.user, req.body || {})
  res.json({ ...result, revision: result.revision ?? result.run?.revision })
})
app.use('/api/admin/exams/:id', (req, res, next) => {
  if (req.method === 'GET') return next()
  if (req.method !== 'DELETE' && db.prepare('SELECT deleted_at FROM exams WHERE id=?').get(req.params.id)?.deleted_at) return res.status(409).json({ error: 'الاختبار محذوف من التشغيل، وسجله محفوظ للقراءة في الأرشيف.' })
  if (/^\/(manual-result|manual-score|oral-evaluations)/.test(req.path)) {
    const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(req.params.id)
    if (exam) jobExams.assertReady(exam)
  }
  if (/^\/(manual-result|manual-score|oral-evaluations)/.test(req.path) && db.prepare('SELECT s.id FROM evaluation_sessions s JOIN exam_roster r ON r.id=s.roster_id WHERE s.exam_id=? AND r.name=?').get(req.params.id, req.body?.examineeName || '')) return res.status(409).json({ error: 'استخدم جلسة التقييم لحفظ درجات الأسئلة واعتمادها.' })
  next()
})
app.get('/api/committee-assignments/:id/questions', auth(), (req, res) => {
  const assignment = committees.assignment(req.user, req.params.id)
  const name = String(req.query.examineeName || '')
  if (!db.prepare('SELECT id FROM exam_roster WHERE exam_id=? AND name=?').get(assignment.exam_id, name)) return res.status(404).json({ error: 'المتقدم غير مسجل في هذا الاختبار' })
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(assignment.exam_id)
  res.json({ questions: jobExams.questionsFor(exam, name) })
})
app.post('/api/admin/question-bank', authStaff(), (req, res) => {
  const before = req.body?.id ? jobExams.listBank(req.user).find((q) => q.id === req.body.id) : null
  const question = jobExams.saveQuestion(req.user, req.body)
  auditMutation(req, before ? 'update' : 'create', 'question', question.id, before, question, req.body?.reason)
  res.status(before ? 200 : 201).json({ question })
})
app.delete('/api/admin/question-bank/:id', authStaff(), (req, res) => {
  const before = jobExams.listBank(req.user).find((q) => q.id === req.params.id)
  const result = jobExams.deleteQuestion(req.user, req.params.id)
  auditMutation(req, 'disable', 'question', req.params.id, before, result, req.body?.reason)
  res.json(result)
})
app.post('/api/admin/exams/preview', authStaff(), (req, res) => res.json(jobExams.preview(req.user, req.body)))
app.post('/api/admin/exams/package/preview', authStaff(), (req, res) => res.json(jobExams.previewPackage(req.user, req.body)))
app.post('/api/admin/exams', authStaff(), (req, res) => {
  const created = jobExams.create(req.user, req.body)
  const examList = created.exams?.length ? created.exams : [created]
  for (const item of examList) {
    auditMutation(req, 'create', 'exam', item.exam.id, null, {
      id: item.exam.id,
      title: item.exam.title,
      category: item.exam.category,
      oralRole: item.exam.oral_role || null,
      oralBucket: item.oralBucket || null,
      rosterCount: item.roster.length,
    })
  }
  const mapItem = (item) => {
    const responseRoster = req.user.role === 'operator' ? item.roster.map(({ rank: _rank, ...rest }) => rest) : item.roster
    return {
      ...publicExam(item.exam, 0),
      roster: responseRoster,
      warnings: item.warnings,
      oralBucket: item.oralBucket || null,
      oralLabel: item.oralBucket ? (item.oralLabel || null) : null,
    }
  }
  if (examList.length > 1) {
    return res.status(201).json({
      splitOral: true,
      exams: examList.map(mapItem),
      warnings: created.warnings || [],
      title: req.body?.title,
      evaluationMode: req.body?.evaluationMode,
    })
  }
  const single = mapItem(examList[0])
  res.status(201).json({ ...single, warnings: created.warnings || single.warnings })
})
app.post('/api/admin/exams/package', authStaff(), (req, res) => {
  const pack = jobExams.createPackage(req.user, req.body)
  const exams = pack.exams.map((item) => {
    auditMutation(req, 'create', 'exam', item.exam.id, null, { id: item.exam.id, title: item.exam.title, category: item.exam.category, rosterCount: item.roster.length, package: true })
    const responseRoster = req.user.role === 'operator' ? item.roster.map(({ rank: _rank, ...rest }) => rest) : item.roster
    return { ...publicExam(item.exam, 0), roster: responseRoster, warnings: item.warnings, category: item.exam.category, oralBucket: item.oralBucket || null, oralLabel: item.oralLabel || null }
  })
  res.status(201).json({ evaluationMode: pack.evaluationMode, exams, warnings: exams.flatMap((item) => item.warnings || []) })
})

app.get('/api/admin/exams/:id/results', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) {
    return res.status(403).json({ error: 'لا صلاحية لعرض نتائج هذا الاختبار' })
  }

  const attempts = db
    .prepare('SELECT * FROM attempts WHERE exam_id = ? ORDER BY finished_at DESC')
    .all(exam.id)
  const mapped = attempts.map((a) => {
    const questions = jobExams.questionsFor(exam, a.examinee_name)
    const summary = summarizeAttempt(questions, a.answers_json, a.score, a.max_score)
    const detailedEvaluation = JSON.parse(a.answers_json || '{}').type === 'evaluation_session'
    const committeeResult = db.prepare('SELECT percent FROM committee_results WHERE attempt_id=?').get(a.id)
    return {
      id: a.id,
      examineeName: a.examinee_name,
      score: summary.score,
      maxScore: summary.maxScore,
      percent: committeeResult ? a.score / a.max_score * 100 : jobExams.isJobBased(exam.id) && a.max_score === 0 ? null : summary.percent,
      correctCount: committeeResult || detailedEvaluation ? null : summary.correctCount,
      objectiveCount: committeeResult || detailedEvaluation ? null : summary.objectiveCount,
      personality: committeeResult || detailedEvaluation ? null : a.personality_json ? JSON.parse(a.personality_json) : summary.personality,
      evaluationStatus: a.evaluation_status || 'completed',
      evaluations: a.question_evaluations_json ? JSON.parse(a.question_evaluations_json) : (summary.questionEvaluations || null),
      answers: a.answers_json ? JSON.parse(a.answers_json) : {},
      clientIp: a.client_ip || null,
      startedAt: a.started_at,
      finishedAt: a.finished_at,
    }
  })

  res.json({
    exam: {
      ...publicExam(exam, attempts.length),
    },
    attempts: mapped,
  })
})

/** أسئلة الاختبار للمسؤول (لإدخال النتائج يدوياً) */
app.get('/api/admin/exams/:id/questions', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) {
    return res.status(403).json({ error: 'لا صلاحية' })
  }
  const questions = jobExams.isJobBased(exam.id) && !req.query.examineeName ? [] : jobExams.questionsFor(exam, String(req.query.examineeName || ''))
  res.json({
    exam: publicExam(exam, countAttempts(exam.id)),
    questions,
    variants: jobExams.variants(exam.id),
    answers: req.query.examineeName ? JSON.parse(db.prepare('SELECT answers_json FROM attempts WHERE exam_id=? AND examinee_name=? ORDER BY finished_at DESC LIMIT 1').get(exam.id, String(req.query.examineeName))?.answers_json || '{}') : {},
  })
})

/** إدخال نتيجة يدوية باسم ممتحن (خصوصاً اختبارات الشخصية) */
app.post('/api/admin/exams/:id/manual-result', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) {
    return res.status(403).json({ error: 'لا صلاحية' })
  }

  const examineeName = String(req.body?.examineeName || '').trim()
  const answers = req.body?.answers || {}
  if (!examineeName) return res.status(400).json({ error: 'أدخل اسم الممتحن' })

  const used = countAttempts(exam.id)
  if (used >= exam.capacity) {
    return res.status(403).json({ error: 'اكتمل عدد الممتحنين لهذا الاختبار' })
  }

  const already = db
    .prepare('SELECT id FROM attempts WHERE exam_id = ? AND examinee_name = ?')
    .get(exam.id, examineeName)
  if (already) {
    return res.status(403).json({ error: 'هذا الاسم مسجّل مسبقاً لهذا الاختبار' })
  }

  const questions = jobExams.questionsFor(exam, examineeName)
  jobExams.validateAnswers(exam, questions, answers)
  const scored = jobExams.scoreSubmission(exam, questions, answers)
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()

  db.transaction(() => {
  db.prepare(`
    INSERT INTO attempts (
      id, exam_id, examinee_name, answers_json, score, max_score, personality_json, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    exam.id,
    examineeName,
    JSON.stringify(answers),
    scored.score,
    scored.maxScore,
    scored.personality ? JSON.stringify(scored.personality) : null,
    now,
    now,
  )


  // أرشفة النتيجة اليدوية المكتملة
  if (scored.maxScore > 0) {
    const rosterRow = db.prepare(
      'SELECT org, job_title, rank, display_id, applicant_id FROM exam_roster WHERE exam_id = ? AND name = ? LIMIT 1',
    ).get(exam.id, examineeName)
    if (rosterRow) db.prepare('UPDATE attempts SET roster_id=(SELECT id FROM exam_roster WHERE exam_id=? AND name=? LIMIT 1),applicant_id=? WHERE id=?').run(exam.id, examineeName, rosterRow.applicant_id || null, id)
    insertArchiveRecord({
      attemptId: id,
      applicantId: rosterRow?.applicant_id,
      category: exam.category,
      examId: exam.id,
      examTitle: exam.title,
      oralRole: exam.oral_role || null,
      examineeName,
      displayId: rosterRow?.display_id || null,
      org: rosterRow?.org || null,
      jobTitle: rosterRow?.job_title || null,
      rank: rosterRow?.rank || null,
      score: scored.score,
      maxScore: scored.maxScore,
      detail: scored.personality
        ? { type: 'personality', traits: scored.personality.traits, summary: scored.personality.summary }
        : { type: 'theory', questionCount: questions.length, correctCount: scored.correctCount, objectiveCount: scored.objectiveCount },
      archivedAt: now,
      evaluator: req.user.username,
    })
  }
  })()

  res.status(201).json({
    ok: true,
    attempt: {
      id,
      examineeName,
      score: scored.score,
      maxScore: scored.maxScore,
      percent: scored.maxScore ? Math.round((scored.score / scored.maxScore) * 100) : null,
      personality: scored.personality,
      finishedAt: now,
    },
  })

})

/**
 * معاملة ذرية لتعديل النتيجة مع توثيق سجل التدقيق الدائم وتحديث الأرشيف
 */
const modifyResultTransaction = db.transaction(({
  attemptId,
  newPercent,
  reason,
  committeeReference,
  user,
}) => {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId)
  if (!attempt) throw new Error('المحاولة غير موجودة')

  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(attempt.exam_id)
  if (!exam) throw new Error('الاختبار غير موجود')

  if (!assertExamAccess(user, exam)) {
    throw new Error('لا صلاحية لتعديل نتيجة هذا الاختبار')
  }

  // حساب النتيجة والنسبة الأصلية
  const originalScore = Number(attempt.score) || 0
  const originalMaxScore = Number(attempt.max_score) || 0
  const originalPercent = originalMaxScore > 0 ? Number(((originalScore / originalMaxScore) * 100).toFixed(2)) : 0

  if (originalMaxScore > 0 && Math.abs(newPercent - originalPercent) < 0.001) {
    throw new Error('النتيجة الجديدة مطابقة للنتيجة الأصلية الحالية — لم يطرأ أي تغيير')
  }

  const newMaxScore = originalMaxScore > 0 ? originalMaxScore : 100
  const newScore = Number(((newPercent / 100) * newMaxScore).toFixed(2))
  const diffPercent = Number((newPercent - originalPercent).toFixed(2))
  const now = new Date().toISOString()
  if (jobExams.isJobBased(exam.id) && originalMaxScore === 0 && !db.prepare('SELECT id FROM assessment_archive WHERE exam_id=? AND examinee_name=?').get(exam.id, attempt.examinee_name)) {
    const candidate = db.prepare('SELECT * FROM exam_roster WHERE exam_id=? AND name=?').get(exam.id, attempt.examinee_name)
    db.prepare(`INSERT INTO assessment_archive (id, category, exam_id, exam_title, oral_role, examinee_name, display_id, org, job_title, rank, score, max_score, percent, detail_json, archived_at, evaluator)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), exam.category, exam.id, exam.title, exam.oral_role,
      attempt.examinee_name, candidate?.display_id || null, candidate?.org || null, candidate?.job_title || null, candidate?.rank || null,
      newScore, newMaxScore, newPercent, JSON.stringify({ type: 'manual_review', questions: jobExams.questionsFor(exam, attempt.examinee_name), answers: JSON.parse(attempt.answers_json), reason }), now, user.username)
  }
  const auditId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // جلب رقم هوية المرشح إن وجد
  const rosterRow = db
    .prepare('SELECT display_id FROM exam_roster WHERE exam_id = ? AND name = ? LIMIT 1')
    .get(exam.id, attempt.examinee_name)

  // 1. تحديث النتيجة في جدول attempts
  db.prepare('UPDATE attempts SET score = ?, max_score = ? WHERE id = ?').run(
    newScore,
    newMaxScore,
    attempt.id,
  )

  // 2. إدراج سجل التدقيق في result_audit_log
  db.prepare(`
    INSERT INTO result_audit_log (
      id, attempt_id, exam_id, exam_title, category, examinee_name, display_id,
      original_score, original_max_score, original_percent,
      new_score, new_max_score, new_percent, diff_percent,
      reason, committee_reference,
      modified_by_id, modified_by_name, modified_by_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auditId,
    attempt.id,
    exam.id,
    exam.title,
    exam.category,
    attempt.examinee_name,
    rosterRow?.display_id || null,
    originalScore,
    originalMaxScore,
    originalPercent,
    newScore,
    newMaxScore,
    newPercent,
    diffPercent,
    reason,
    committeeReference || null,
    user.id ? String(user.id) : null,
    user.username,
    user.role,
    now,
  )

  // 3. مزامنة وتحديث الأرشيف الموحد assessment_archive إن وجد سجل مؤرشف لهذا الاختبار والممتحن
  db.prepare(`
    UPDATE assessment_archive
    SET score = ?, max_score = ?, percent = ?
    WHERE exam_id = ? AND examinee_name = ?
  `).run(
    newScore,
    newMaxScore,
    Math.round(newPercent),
    exam.id,
    attempt.examinee_name,
  )

  if (user.role === 'admin') {
    db.prepare('UPDATE committee_results SET percent = ? WHERE attempt_id = ?').run(newPercent, attempt.id)
  }

  return {
    auditId,
    attemptId: attempt.id,
    examineeName: attempt.examinee_name,
    originalPercent,
    newPercent,
    diffPercent,
    score: newScore,
    maxScore: newMaxScore,
    percent: Math.round(newPercent),
    modifiedAt: now,
    modifiedBy: user.username,
  }
})

/** اعتماد وتعديل النتيجة مع توثيق سجل التدقيق والتحقق الصارم */
app.post('/api/admin/attempts/:attemptId/modify-result', authStaff(), (req, res) => {
  try {
    const { newPercent, reason, committeeReference } = req.body || {}
    const parsedPercent = Number(newPercent)
    if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
      return res.status(400).json({ error: 'النتيجة الجديدة يجب أن تكون نسبة مئوية صحيحة بين 0 و 100' })
    }

    const trimmedReason = String(reason || '').trim()
    if (!trimmedReason || trimmedReason.length < 5) {
      return res.status(400).json({ error: 'سبب التعديل إلزامي ويجب ألا يقل عن 5 أحرف' })
    }

    const trimmedRef = String(committeeReference || '').trim()
    const committeeResult = db.prepare('SELECT attempt_id FROM committee_results WHERE attempt_id = ?').get(req.params.attemptId)
    if (committeeResult && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'تصحيح نتيجة اللجنة متاح لحساب الأدمن فقط' })
    }

    const result = modifyResultTransaction({
      attemptId: req.params.attemptId,
      newPercent: Number(parsedPercent.toFixed(2)),
      reason: trimmedReason,
      committeeReference: trimmedRef,
      user: req.user,
    })

    res.json({
      ok: true,
      message: 'تم اعتماد تعديل النتيجة وتوثيق سجل التدقيق بنجاح',
      result,
    })
  } catch (err) {
    console.error('[modify-result]', err)
    res.status(400).json({ error: err?.message || 'فشل تعديل النتيجة' })
  }
})

/** استرجاع سجل التدقيق التاريخي لمحاولة محددة */
app.get('/api/admin/attempts/:attemptId/audit-history', authStaff(), (req, res) => {
  try {
    const attempt = db.prepare('SELECT exam_id FROM attempts WHERE id = ?').get(req.params.attemptId)
    if (!attempt) return res.status(404).json({ error: 'المحاولة غير موجودة' })
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(attempt.exam_id)
    if (!exam || !assertExamAccess(req.user, exam)) {
      return res.status(403).json({ error: 'لا صلاحية' })
    }

    const rows = db.prepare(`
      SELECT id, attempt_id AS attemptId, exam_id AS examId, exam_title AS examTitle,
             category, examinee_name AS examineeName, display_id AS displayId,
             original_score AS originalScore, original_max_score AS originalMaxScore, original_percent AS originalPercent,
             new_score AS newScore, new_max_score AS newMaxScore, new_percent AS newPercent, diff_percent AS diffPercent,
             reason, committee_reference AS committeeReference,
             modified_by_id AS modifiedById, modified_by_name AS modifiedByName, modified_by_role AS modifiedByRole,
             created_at AS createdAt
      FROM result_audit_log
      WHERE attempt_id = ?
      ORDER BY created_at DESC
    `).all(req.params.attemptId)

    res.json({ history: rows, total: rows.length })
  } catch (err) {
    console.error('[attempt-audit-history]', err)
    res.status(500).json({ error: 'فشل استرجاع سجل التدقيق' })
  }
})

/** استرجاع سجل التدقيق التاريخي لممتحن معين عبر جميع اختباراته */
app.get('/api/admin/examinees/:name/audit-history', authStaff(), (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.name || '').trim()
    if (!identifier) return res.status(400).json({ error: 'معرّف الممتحن مطلوب' })
    const applicant = db.prepare('SELECT id,name FROM applicants WHERE id=?').get(identifier)
    const examIds = scopedExamIds(req.user)
    if (!examIds.length) return res.json({ history: [], total: 0 })
    const placeholders = examIds.map(() => '?').join(',')

    const rows = db.prepare(`
      SELECT l.id, l.attempt_id AS attemptId, l.exam_id AS examId, l.exam_title AS examTitle,
             l.category, l.examinee_name AS examineeName, l.display_id AS displayId,
             l.original_score AS originalScore, l.original_max_score AS originalMaxScore, l.original_percent AS originalPercent,
             l.new_score AS newScore, l.new_max_score AS newMaxScore, l.new_percent AS newPercent, l.diff_percent AS diffPercent,
             l.reason, l.committee_reference AS committeeReference,
             l.modified_by_id AS modifiedById, l.modified_by_name AS modifiedByName, l.modified_by_role AS modifiedByRole,
             l.created_at AS createdAt
      FROM result_audit_log l
      LEFT JOIN attempts a ON a.id=l.attempt_id
      WHERE l.exam_id IN (${placeholders})
        AND ${applicant ? "a.applicant_id=?" : "l.examinee_name=?"}
      ORDER BY l.created_at DESC
    `).all(...examIds, applicant?.id || identifier)

    res.json({ history: rows, total: rows.length })
  } catch (err) {
    console.error('[examinee-audit-history]', err)
    res.status(500).json({ error: 'فشل استرجاع سجل التدقيق' })
  }
})

/** تصحيح وتقييم الأسئلة المقالية (Classic) يدوياً مع حفظ التغذية الراجعة وتحديث النتيجة والأرشيف */
app.post('/api/admin/exams/:id/attempts/:attemptId/evaluate-classic', authStaff(), (req, res) => {
  try {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
    if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
    if (!assertExamAccess(req.user, exam)) {
      return res.status(403).json({ error: 'لا صلاحية لتقييم هذا الاختبار' })
    }

    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND exam_id = ?').get(req.params.attemptId, req.params.id)
    if (!attempt) return res.status(404).json({ error: 'المحاولة غير موجودة' })

    const questions = jobExams.questionsFor(exam, attempt.examinee_name)
    let existingEvaluations = null
    try {
      existingEvaluations = attempt.question_evaluations_json ? JSON.parse(attempt.question_evaluations_json) : null
    } catch {}

    const manualScores = req.body?.scores
    if (!manualScores || (!Array.isArray(manualScores) && typeof manualScores !== 'object')) {
      return res.status(400).json({ error: 'درجات الأسئلة المقالية مطلوبة' })
    }

    const updated = applyManualEvaluation(questions, existingEvaluations, manualScores)

    db.transaction(() => {
      db.prepare(`UPDATE attempts
        SET score = ?, max_score = ?, evaluation_status = ?, question_evaluations_json = ?
        WHERE id = ?`).run(
          updated.score,
          updated.maxScore,
          updated.evaluationStatus,
          JSON.stringify(updated.evaluations),
          attempt.id,
        )

      // مزامنة الأرشيف إن وجد
      const percent = updated.maxScore > 0 ? (updated.score / updated.maxScore) * 100 : 0
      db.prepare(`UPDATE assessment_archive
        SET score = ?, max_score = ?, percent = ?
        WHERE attempt_id = ? OR (exam_id = ? AND examinee_name = ?)`).run(
          updated.score,
          updated.maxScore,
          Math.round(percent),
          attempt.id,
          exam.id,
          attempt.examinee_name,
        )
    })()

    auditMutation(req, 'evaluate_classic', 'attempt', attempt.id, {
      score: attempt.score,
      maxScore: attempt.max_score,
      evaluationStatus: attempt.evaluation_status,
    }, {
      score: updated.score,
      maxScore: updated.maxScore,
      evaluationStatus: updated.evaluationStatus,
    }, req.body?.reason || 'تقييم يدوي للأسئلة المقالية')

    res.json({
      ok: true,
      attempt: {
        id: attempt.id,
        score: updated.score,
        maxScore: updated.maxScore,
        percent: updated.percent,
        evaluationStatus: updated.evaluationStatus,
        evaluations: updated.evaluations,
      },
      message: updated.evaluationStatus === 'completed'
        ? 'تم اعتماد تقييم الأسئلة المقالية وتحديث النتيجة النهائية بنجاح.'
        : 'تم حفظ الدرجات وما زالت هناك أسئلة مقالية بانتظار التقييم.',
    })
  } catch (err) {
    console.error('[evaluate-classic]', err)
    res.status(400).json({ error: err?.message || 'فشل تقييم الأسئلة المقالية' })
  }
})

/** تحديث درجة محاولة — موثق ومدقق مع سجل التدقيق */
app.patch('/api/admin/exams/:id/attempts/:attemptId/score', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) {
    return res.status(403).json({ error: 'لا صلاحية' })
  }

  const attempt = db
    .prepare('SELECT * FROM attempts WHERE id = ? AND exam_id = ?')
    .get(req.params.attemptId, exam.id)
  if (!attempt) return res.status(404).json({ error: 'المحاولة غير موجودة' })

  const score = Number(req.body?.score)
  const maxScore = Number(req.body?.maxScore ?? (attempt.max_score > 0 ? attempt.max_score : 100))
  if (!Number.isFinite(score) || score < 0) {
    return res.status(400).json({ error: 'أدخل درجة صحيحة' })
  }
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return res.status(400).json({ error: 'الدرجة العظمى غير صالحة' })
  }
  if (score > maxScore) {
    return res.status(400).json({ error: `الدرجة لا تتجاوز ${maxScore}` })
  }

  const newPercent = Number(((score / maxScore) * 100).toFixed(2))
  const reason = String(req.body?.reason || 'تعديل النتيجة يدوياً من لوحة التحكم').trim()
  const committeeReference = req.body?.committeeReference ? String(req.body.committeeReference).trim() : null

  try {
    const result = modifyResultTransaction({
      attemptId: attempt.id,
      newPercent,
      reason,
      committeeReference,
      user: req.user,
    })

    res.json({
      ok: true,
      attempt: {
        id: attempt.id,
        examineeName: attempt.examinee_name,
        score: result.score,
        maxScore: result.maxScore,
        percent: result.percent,
        finishedAt: attempt.finished_at,
      },
    })
  } catch (err) {
    res.status(400).json({ error: err?.message || 'فشل حفظ الدرجة' })
  }
})

/** إضافة اسم + درجة يدوياً (شفهي) دون إجابات تفصيلية */
app.post('/api/admin/exams/:id/manual-score', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) {
    return res.status(403).json({ error: 'لا صلاحية' })
  }

  const examineeName = String(req.body?.examineeName || '').trim()
  const score = Number(req.body?.score)
  const maxScore = Number(req.body?.maxScore ?? 100)

  if (!examineeName) return res.status(400).json({ error: 'أدخل اسم الممتحن' })
  if (jobExams.isJobBased(exam.id)) jobExams.questionsFor(exam, examineeName)
  if (!Number.isFinite(score) || score < 0) {
    return res.status(400).json({ error: 'أدخل درجة صحيحة' })
  }
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return res.status(400).json({ error: 'الدرجة العظمى غير صالحة' })
  }
  if (score > maxScore) {
    return res.status(400).json({ error: `الدرجة لا تتجاوز ${maxScore}` })
  }

  const used = countAttempts(exam.id)
  if (used >= exam.capacity) {
    return res.status(403).json({ error: 'اكتمل عدد الممتحنين لهذا الاختبار' })
  }

  const already = db
    .prepare('SELECT id FROM attempts WHERE exam_id = ? AND examinee_name = ?')
    .get(exam.id, examineeName)
  if (already) {
    return res.status(403).json({ error: 'هذا الاسم مسجّل مسبقاً — عدّل درجته من القائمة' })
  }

  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()

  db.transaction(() => {
  db.prepare(`
    INSERT INTO attempts (
      id, exam_id, examinee_name, answers_json, score, max_score, personality_json, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, exam.id, examineeName, JSON.stringify({}), score, maxScore, null, now, now)

  // أرشفة التقييم اليدوي للدرجات (مثل أهلية قيادة الضابط)
  if (maxScore > 0) {
    const rosterRow = db.prepare(
      'SELECT org, job_title, rank, display_id, applicant_id FROM exam_roster WHERE exam_id = ? AND name = ? LIMIT 1',
    ).get(exam.id, examineeName)
    if (rosterRow) db.prepare('UPDATE attempts SET roster_id=(SELECT id FROM exam_roster WHERE exam_id=? AND name=? LIMIT 1),applicant_id=? WHERE id=?').run(exam.id, examineeName, rosterRow.applicant_id || null, id)
    insertArchiveRecord({
      attemptId: id,
      applicantId: rosterRow?.applicant_id,
      category: exam.category,
      examId: exam.id,
      examTitle: exam.title,
      oralRole: exam.oral_role || null,
      examineeName,
      displayId: rosterRow?.display_id || null,
      org: rosterRow?.org || null,
      jobTitle: rosterRow?.job_title || null,
      rank: rosterRow?.rank || null,
      score,
      maxScore,
      detail: { type: exam.category },
      archivedAt: now,
      evaluator: req.user?.username || null,
    })
  }

  })()

  res.status(201).json({
    ok: true,
    attempt: {
      id,
      examineeName,
      score,
      maxScore,
      percent: Math.round((score / maxScore) * 100),
      finishedAt: now,
    },
  })

})

/** حفظ تقييم شفهي تفصيلي من المقابِل فقط — لا يشارك فيه الممتحَن. */
app.post('/api/admin/exams/:id/oral-evaluations', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) return res.status(403).json({ error: 'لا صلاحية' })
  if (exam.category !== 'oral') return res.status(400).json({ error: 'هذا المسار للمقابلات الشفهية فقط' })

  const examineeName = String(req.body?.examineeName || '').trim()
  let questions = Array.isArray(req.body?.questions) ? req.body.questions : []
  if (!examineeName) return res.status(400).json({ error: 'اختر المتقدم أولاً' })
  if (!questions.length) return res.status(400).json({ error: 'أضف سؤالاً واحداً على الأقل' })
  if (jobExams.isJobBased(exam.id)) {
    const assigned = jobExams.questionsFor(exam, examineeName)
    if (questions.length !== assigned.length || new Set(questions.map((q) => q.id)).size !== assigned.length ||
      questions.some((q) => !assigned.some((saved) => saved.id === q.id && saved.points === q.points))) {
      return res.status(400).json({ error: 'يجب تقييم مجموعة المتقدم المحفوظة كاملة وبدرجاتها الأصلية' })
    }
    questions = questions.map((q) => ({ ...q, text: assigned.find((saved) => saved.id === q.id).text }))
  }

  const roster = db.prepare('SELECT id, job_title, org, rank, display_id, extra_json FROM exam_roster WHERE exam_id = ? AND name = ?').get(exam.id, examineeName)
  if (!roster) return res.status(400).json({ error: 'المتقدم غير موجود ضمن قائمة هذا الاختبار' })
  let rosterExtra = {}
  try { rosterExtra = roster.extra_json ? JSON.parse(roster.extra_json) : {} } catch { rosterExtra = {} }
  if (!oralCandidateMatches(req.user, { jobTitle: roster.job_title, extra: rosterExtra })) {
    return res.status(403).json({ error: 'هذا المتقدم خارج اختصاص حسابك' })
  }
  const already = db.prepare('SELECT id FROM attempts WHERE exam_id = ? AND examinee_name = ?').get(exam.id, examineeName)
  if (already) return res.status(409).json({ error: 'تم تقييم هذا المتقدم مسبقاً' })

  let score = 0
  let maxScore = 0
  const details = []
  for (let i = 0; i < questions.length; i++) {
    const raw = questions[i] || {}
    const text = String(raw.text || '').trim()
    const answer = String(raw.answer || '').trim()
    const points = Number(raw.points)
    const awarded = Number(raw.awarded)
    if (!text) return res.status(400).json({ error: `نص السؤال ${i + 1} مطلوب` })
    if (!Number.isFinite(points) || points <= 0) return res.status(400).json({ error: `علامة السؤال ${i + 1} غير صالحة` })
    if (!Number.isFinite(awarded) || awarded < 0 || awarded > points) return res.status(400).json({ error: `درجة السؤال ${i + 1} غير صالحة` })
    score += awarded
    maxScore += points
    details.push({ id: String(raw.id || `oral-${i + 1}`), text, answer, points, awarded })
  }

  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()
  db.transaction(() => {
  db.prepare(`INSERT INTO attempts (
    id, exam_id, examinee_name, answers_json, score, max_score, personality_json, started_at, finished_at
  ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`).run(
    id, exam.id, examineeName, JSON.stringify({ oralEvaluation: details }), score, maxScore, now, now,
  )
  db.prepare('UPDATE attempts SET roster_id=?,applicant_id=? WHERE id=?').run(roster.id, roster.applicant_id || null, id)

  // أرشفة المقابلة تلقائياً في سجل دائم وغير قابل للتعديل
  const archiveId = crypto.randomUUID()
  db.prepare(`INSERT OR IGNORE INTO oral_archive
    (id, exam_id, exam_title, oral_role, examinee_name, job_title, score, max_score, percent, questions_json, archived_at, evaluator)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    archiveId,
    exam.id,
    exam.title,
    exam.oral_role || null,
    examineeName,
    roster.job_title || null,
    score,
    maxScore,
    maxScore ? Math.round((score / maxScore) * 100) : null,
    JSON.stringify(details),
    now,
    req.user?.username || null,
  )

  // أرشفة في الأرشيف الموحد assessment_archive
  insertArchiveRecord({
    attemptId: id,
    applicantId: roster?.applicant_id,
    archiveId,
    category: 'oral',
    examId: exam.id,
    examTitle: exam.title,
    oralRole: exam.oral_role || null,
    examineeName,
    displayId: roster?.display_id || null,
    org: roster?.org || null,
    jobTitle: roster?.job_title || null,
    rank: roster?.rank || null,
    score,
    maxScore,
    detail: { type: 'oral', questions: details },
    archivedAt: now,
    evaluator: req.user?.username || req.user?.oralRole || null,
  })

  })()

  res.status(201).json({ ok: true, attempt: { id, examineeName, score, maxScore, percent: Math.round((score / maxScore) * 100), finishedAt: now } })

})

app.patch('/api/admin/exams/:id/active', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) {
    return res.status(403).json({ error: 'لا صلاحية' })
  }
  const active = req.body?.active ? 1 : 0
  if (active) jobExams.assertReady(exam)
  db.prepare('UPDATE exams SET active = ? WHERE id = ?').run(active, req.params.id)
  auditMutation(req, 'set_active', 'exam', exam.id, { active: !!exam.active }, { active: !!active }, req.body?.reason)
  res.json({ ok: true, active: !!active })
})

app.get('/api/admin/exams/:id/pending-questions', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(req.params.id)
  if (!exam) return res.status(404).json({ error:'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) return res.status(403).json({ error:'لا صلاحية' })
  res.json({ exam:publicExam(exam,countAttempts(exam.id)), groups:jobExams.pendingGroups(exam.id) })
})
app.post('/api/admin/exams/:id/pending-questions', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(req.params.id)
  if (!exam) return res.status(404).json({ error:'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) return res.status(403).json({ error:'لا صلاحية' })
  res.json(jobExams.completeGroup(req.user,exam,req.body || {}))
})
app.delete('/api/admin/exams/:id', authStaff(), async (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) return res.status(403).json({ error: 'لا صلاحية لحذف هذا الاختبار' })
  try {
    await archiveBackups.backup('before-exam-delete')
    const result = retainDeletedExam(db, exam.id, req.user.role + ':' + req.user.username)
    auditMutation(req, 'retain_delete', 'exam', exam.id, exam, result, req.body?.reason)
    for (const person of db.prepare('SELECT name FROM exam_roster WHERE exam_id=?').all(exam.id)) liveApi.endSessionByExaminee(exam.id, person.name)
    res.json(result)
  } catch (err) {
    console.error('[retain-exam]', err)
    res.status(503).json({ error: 'تعذر تأمين نسخة احتياطية أو إتمام الحذف. بقيت السجلات محفوظة؛ أعد المحاولة بعد التحقق من مساحة القرص.' })
  }
})

app.get('/api/admin/archive-protection', authGeneralAdmin(), (req, res) => res.json(archiveBackups.status()))
app.get('/api/admin/assessment-archive/:id/versions', authStaff(), (req, res) => {
  const record = db.prepare('SELECT * FROM assessment_archive WHERE id=?').get(req.params.id)
  if (!record) return res.status(404).json({ error: 'السجل غير موجود' })
  if (req.user.role === 'operator' && (record.category !== req.user.category || (req.user.category === 'oral' && req.user.oralRole && record.oral_role && !oralRolesCompatible(req.user.oralRole, record.oral_role)))) return res.status(403).json({ error: 'لا صلاحية' })
  res.json(db.prepare('SELECT id,recorded_at AS recordedAt,operation,snapshot_json FROM archive_versions WHERE archive_id=? ORDER BY id').all(record.id).map(({ snapshot_json, ...version }) => {
    const snapshot = JSON.parse(snapshot_json)
    return { ...version, score: snapshot.score, maxScore: snapshot.max_score, percent: snapshot.percent }
  }))
})
app.post('/api/admin/archive-protection/backup', authGeneralAdmin(), async (req, res) => {
  try { await archiveBackups.backup('manual'); res.json(archiveBackups.status()) }
  catch { res.status(503).json({ error: 'فشل إنشاء نسخة سليمة. تحقق من مساحة القرص وصلاحيات مجلد النسخ الاحتياطية.' }) }
})

/** أرشيف المقابلات الشفهية — للقراءة فقط، مقيّد بالمسؤول العام والقائد */
app.get('/api/admin/oral-archive', authStaff(), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'commander') {
    return res.status(403).json({ error: 'لا صلاحية لعرض الأرشيف' })
  }

  try {
    const { examId, examineeName, examTitle } = req.query

    let sql = `
      SELECT id, exam_id, exam_title, oral_role, examinee_name, job_title,
             score, max_score, percent, questions_json, archived_at, evaluator
      FROM oral_archive
      WHERE 1=1
    `
    const params = []

    if (examId && String(examId).trim()) {
      sql += ' AND exam_id = ?'
      params.push(String(examId).trim())
    }
    if (examineeName && String(examineeName).trim()) {
      sql += ' AND examinee_name LIKE ?'
      params.push(`%${String(examineeName).trim()}%`)
    }
    if (examTitle && String(examTitle).trim()) {
      sql += ' AND exam_title LIKE ?'
      params.push(`%${String(examTitle).trim()}%`)
    }

    sql += ' ORDER BY archived_at DESC LIMIT 500'

    // better-sqlite3: تمرير المصفوفة مباشرة بدون spread
    const rows = db.prepare(sql).all(params)

    const archive = rows.map((r) => ({
      id: r.id,
      examId: r.exam_id,
      examTitle: r.exam_title,
      oralRole: r.oral_role || null,
      examineeName: r.examinee_name,
      jobTitle: r.job_title || null,
      score: r.score,
      maxScore: r.max_score,
      percent: r.percent,
      questions: (() => { try { return JSON.parse(r.questions_json) } catch { return [] } })(),
      archivedAt: r.archived_at,
      evaluator: r.evaluator || null,
    }))

    res.json({ archive, total: archive.length })
  } catch (err) {
    console.error('[oral-archive]', err)
    res.status(500).json({ error: 'فشل استرجاع الأرشيف' })
  }
})

/** أرشيف التقييمات الموحّد — للقراءة فقط، مقيّد بالموظفين (مع RBAC حسب الصلاحيات) */
app.get('/api/admin/assessment-archive', authStaff(), (req, res) => {
  try {
    const { category, examId, examineeName, examTitle, org } = req.query

    let sql = `
      SELECT id, category, exam_id, exam_title, oral_role, examinee_name, display_id, org, job_title,
             rank, score, max_score, percent, detail_json, archived_at, evaluator
      FROM assessment_archive
      WHERE 1=1
    `
    const params = []

    // RBAC: مشغلو الوصول يرون فئتهم فقط
    if (req.user.role === 'operator') {
      sql += ' AND category = ?'
      params.push(req.user.category)
      if (req.user.category === 'oral' && req.user.oralRole) {
        const roles = compatibleOralRoles(req.user.oralRole)
        sql += ` AND (oral_role IS NULL OR oral_role IN (${roles.map(() => '?').join(',')}))`
        params.push(...roles)
      }
    } else if (category && String(category).trim()) {
      sql += ' AND category = ?'
      params.push(String(category).trim())
    }

    if (examId && String(examId).trim()) {
      sql += ' AND exam_id = ?'
      params.push(String(examId).trim())
    }
    if (examineeName && String(examineeName).trim()) {
      sql += ' AND examinee_name LIKE ?'
      params.push(`%${String(examineeName).trim()}%`)
    }
    if (examTitle && String(examTitle).trim()) {
      sql += ' AND exam_title LIKE ?'
      params.push(`%${String(examTitle).trim()}%`)
    }
    if (org && String(org).trim()) {
      sql += ' AND org LIKE ?'
      params.push(`%${String(org).trim()}%`)
    }

    const total = db.prepare(`SELECT COUNT(*) AS n FROM (${sql})`).get(...params).n
    const cursor = String(req.query.cursor || '').trim()
    if (cursor) { sql += ' AND archived_at < ?'; params.push(cursor) }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100))
    sql += ' ORDER BY archived_at DESC LIMIT ?'
    params.push(limit + 1)

    const rows = db.prepare(sql).all(...params)

    const isOperator = req.user.role === 'operator'
    const archive = rows.slice(0, limit).map((r) => ({
      id: r.id,
      category: r.category,
      examId: r.exam_id,
      examTitle: r.exam_title,
      oralRole: r.oral_role || null,
      examineeName: r.examinee_name,
      displayId: r.display_id || null,
      org: r.org || null,
      jobTitle: r.job_title || null,
      rank: isOperator ? null : (r.rank || null), // إخفاء الرتبة عن المشغلين
      score: r.score,
      maxScore: r.max_score,
      percent: r.percent,
      detail: (() => {
        try {
          return JSON.parse(r.detail_json)
        } catch {
          return {}
        }
      })(),
      archivedAt: r.archived_at,
      evaluator: r.evaluator || null,
    }))

    res.json({ archive, total, hasNext: rows.length > limit, nextCursor: rows.length > limit ? rows[limit - 1].archived_at : null })
  } catch (err) {
    console.error('[assessment-archive]', err)
    res.status(500).json({ error: 'فشل استرجاع الأرشيف' })
  }
})

app.get('/api/exam/questions', auth('examinee'), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND active = 1').get(req.user.examId)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير متاح' })
  if (req.user.rosterId && evaluations.hasSessions(req.user.rosterId)) {
    const result = evaluations.runView(req.user)
    return res.json({ exam: { ...publicExam(exam, countAttempts(exam.id)), questionCount: result.questions.length, executionMode: 'qr' }, examineeName: req.user.examineeName, questions: stripAnswers(result.questions), run: result.run })
  }
  const standard = examRuns.view(req.user)
  const used = countAttempts(exam.id)
  if (used >= exam.capacity) {
    return res.status(403).json({ error: 'اكتمل عدد الممتحنين' })
  }

  const questions = standard.questions
  res.json({
    exam: { ...publicExam(exam, used), questionCount: questions.length, executionMode: 'qr' },
    examineeName: req.user.examineeName,
    questions: stripAnswers(questions),
    run: standard.run,
  })
})

app.post('/api/exam/submit', auth('examinee'), (req, res) => {
  const clientIp = extractClientIp(req)
  if (req.user.rosterId && evaluations.hasSessions(req.user.rosterId)) {
    const result = evaluations.progress(req.user, req.body || {}, true)
    liveApi.endSessionByExaminee(req.user.examId, req.user.examineeName)
    return res.json(result)
  }
  const result = examRuns.submit(req.user, req.body || {}, false, clientIp)
  liveApi.endSessionByExaminee(req.user.examId, req.user.examineeName)
  return res.json(result)
})

/** استعلام الممتحن عن نتيجته وتفصيل درجاته وحالة التقييم المقالي ومعدله التراكمي */
app.get('/api/exam/my-results', auth('examinee'), (req, res) => {
  const attempt = db.prepare('SELECT * FROM attempts WHERE roster_id = ? OR (exam_id = ? AND examinee_name = ?) ORDER BY finished_at DESC LIMIT 1')
    .get(req.user.rosterId, req.user.examId, req.user.examineeName)
  if (!attempt) return res.status(404).json({ error: 'لم يتم العثور على نتيجة لهذا الاختبار' })

  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.user.examId)
  let evaluations = null
  try {
    evaluations = attempt.question_evaluations_json ? JSON.parse(attempt.question_evaluations_json) : null
  } catch {}

  let finalBreakdown = null
  if (attempt.applicant_id) {
    const applicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(attempt.applicant_id)
    if (applicant) {
      finalBreakdown = finalResultForApplicant(applicant)
    }
  } else {
    finalBreakdown = finalResultForApplicant(attempt.examinee_name)
  }

  res.json({
    ok: true,
    exam: {
      id: exam?.id,
      title: exam?.title,
      category: exam?.category,
    },
    attempt: {
      id: attempt.id,
      examineeName: attempt.examinee_name,
      score: attempt.score,
      maxScore: attempt.max_score,
      percent: attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0,
      evaluationStatus: attempt.evaluation_status || 'completed',
      evaluations,
      finishedAt: attempt.finished_at,
    },
    finalBreakdown,
  })
})


app.get('/api/admin/exams/:id/roster', authStaff(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id)
  if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' })
  if (!assertExamAccess(req.user, exam)) {
    return res.status(403).json({ error: 'لا صلاحية لعرض قائمة الممتحنين' })
  }
  const roster = listRosterPublic(exam.id)
    .filter((candidate) => oralCandidateMatches(req.user, candidate))
    .map((candidate) => {
      // كلمات المرور/اسم المستخدم سرّية؛ رمز QR لازم لطباعة بطاقة الدخول.
      if (req.user.role === 'admin') return candidate
      const { username: _username, passwordPlain: _passwordPlain, ...safeCandidate } = candidate
      if (req.user.role === 'operator') {
        const { rank: _rank, ...withoutRank } = safeCandidate
        return withoutRank
      }
      return safeCandidate
    })
  res.json({
    exam: publicExam(exam, countAttempts(exam.id)),
    roster,
    publicAppUrl: PUBLIC_APP_URL,
  })
})

app.post('/api/admin/exams/:id/roster/:rosterId/qr', authGeneralAdmin(), (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(req.params.id)
  const roster = db.prepare('SELECT * FROM exam_roster WHERE id=? AND exam_id=?').get(req.params.rosterId, req.params.id)
  if (!exam || !roster) return res.status(404).json({ error: 'المتقدم أو الاختبار غير موجود' })
  const action = req.body?.action === 'revoke' ? 'revoke' : 'rotate'
  const token = action === 'rotate' ? crypto.randomBytes(32).toString('base64url') : roster.qr_token
  const expiresAt = action === 'rotate' ? new Date(Date.now() + 90 * 86400000).toISOString() : new Date(0).toISOString()
  db.prepare(`UPDATE exam_roster SET qr_token=?,used=0,qr_claimed_at=NULL,qr_expires_at=?,qr_session_id=NULL,qr_device_id=NULL WHERE id=?`)
    .run(token, expiresAt, roster.id)
  auditMutation(req, action, 'roster_qr', roster.id, { claimed: !!roster.qr_claimed_at, expiresAt: roster.qr_expires_at }, { expiresAt }, req.body?.reason)
  res.json({ ok: true, action, qrToken: action === 'rotate' ? token : null, expiresAt })
})

app.get('/api/admin/applicants', authGeneralAdmin(), (_req, res) => {
  const pending = new Set(listPendingApplicants().map((applicant) => applicant.id))
  const applicants = listApplicantsWithFinalResults().filter((applicant) => pending.has(applicant.id))
  const reviews = listCurrentSecurityReviews(applicants.map((a) => a.id))
  res.json({
    applicants: applicants.map((applicant) => ({
      ...applicant,
      securityReview: reviews.get(applicant.id) || null,
    })),
    columns: listApplicantColumns(),
  })
})

/**
 * سجل المتقدمين المركزي — يُستخدم لاختيار من يقيَّم (قيادة/شخصية) ومن يُضاف
 * لقائمة ممتحني اختبار جديد (عام/شفهي)، بدل رفع Excel منفصل في كل مرة.
 */
app.get('/api/admin/evaluation-candidates', authStaff(), (req, res) => {
  // الرتبة والرواتب معلومات حساسة تُعرض للمسؤول العام والقائد فقط — لا لحسابات الوصول.
  const showSensitive = req.user.role !== 'operator'
  res.json(
    listPendingApplicants().filter((applicant) => oralCandidateMatches(req.user, applicant)).map((applicant) => {
      const jobTitle = effectiveJobTitle(applicant)
      const stream = resolveEvaluationStream({ ...applicant, jobTitle })
      return {
        id: applicant.id,
        displayId: applicant.displayId,
        seqNumber: applicant.seqNumber,
        name: applicant.name,
        org: applicant.org,
        jobTitle,
        rank: showSensitive ? applicant.rank : undefined,
        jobTitleOrg: applicant.jobTitleOrg,
        jobTitleCommittee: applicant.jobTitleCommittee,
        proposedSalary: showSensitive ? applicant.proposedSalary : undefined,
        rankCommittee: showSensitive ? applicant.rankCommittee : undefined,
        approvedSalary: showSensitive ? applicant.approvedSalary : undefined,
        educationCommittee: applicant.educationCommittee,
        missingTitle: !jobTitle,
        evaluationStream: stream.id,
        evaluationStreamLabel: stream.label,
        evaluationTracks: tracksForApplicant({ ...applicant, jobTitle }).map((t) => ({
          id: t.id,
          label: t.label,
          weight: t.weight,
          category: t.category,
        })),
      }
    }),
  )
})

app.post('/api/admin/applicant-columns', authGeneralAdmin(), (req, res) => {
  try {
    res.status(201).json(createApplicantColumn(req.body?.label))
  } catch (err) {
    res.status(400).json({ error: err.message || 'فشل إضافة العمود' })
  }
})

app.delete('/api/admin/applicant-columns/:label', authGeneralAdmin(), (req, res) => {
  try {
    res.json(deleteApplicantColumn(decodeURIComponent(req.params.label || '')))
  } catch (err) {
    res.status(400).json({ error: err.message || 'فشل حذف العمود' })
  }
})

app.get('/api/admin/applicant-filters', authGeneralAdmin(), (_req, res) => {
  res.json(listApplicantFilters())
})

app.post('/api/admin/applicants', authGeneralAdmin(), (req, res) => {
  try {
    const applicant = createApplicant(req.body || {})
    auditMutation(req, 'create', 'applicant', applicant.id, null, applicant)
    res.status(201).json(applicant)
  } catch (err) {
    res.status(400).json({ error: err.message || 'فشل إضافة المتقدم' })
  }
})

app.get('/api/admin/corrections', authGeneralAdmin(), (req, res) => {
  const q = String(req.query.q || '').trim().replace(/[%_]/g, '')
  if (q.length < 2) return res.json({ people: [] })
  const like = `%${q}%`
  const rows = db.prepare(`
    SELECT id, name, display_id, org, job_title, job_title_org, job_title_committee, rank,
           proposed_salary, approved_salary, rank_committee, education_committee
    FROM applicants
    WHERE name LIKE ? OR display_id LIKE ? OR org LIKE ? OR job_title LIKE ?
       OR job_title_org LIKE ? OR job_title_committee LIKE ?
    ORDER BY name LIMIT 25
  `).all(like, like, like, like, like, like)
  const people = rows.map((a) => {
    const attempts = db.prepare(`
      SELECT a.id, a.exam_id, a.score, a.max_score, e.title, e.category,
             EXISTS(SELECT 1 FROM committee_results c WHERE c.attempt_id=a.id) AS committee_result
      FROM attempts a JOIN exams e ON e.id=a.exam_id
      WHERE a.applicant_id=? OR (COALESCE(a.applicant_id, '')='' AND a.examinee_name=?)
      ORDER BY a.finished_at DESC
    `).all(a.id, a.name)
    const enrolledExamIds = db.prepare(`
      SELECT DISTINCT exam_id FROM exam_roster WHERE applicant_id=? OR name=?
    `).all(a.id, a.name).map((r) => r.exam_id)
    return {
      id: a.id,
      name: a.name,
      displayId: a.display_id || '',
      org: a.org || '',
      jobTitle: a.job_title || '',
      jobTitleOrg: a.job_title_org || '',
      jobTitleCommittee: a.job_title_committee || '',
      rank: a.rank || '',
      rankCommittee: a.rank_committee || '',
      educationCommittee: a.education_committee || '',
      proposedSalary: a.proposed_salary,
      approvedSalary: a.approved_salary,
      enrolledExamIds,
      attempts: attempts.map((row) => ({
        id: row.id,
        examId: row.exam_id,
        examTitle: row.title,
        category: row.category,
        percent: row.max_score > 0 ? Math.round((row.score / row.max_score) * 100) : null,
        committeeResult: !!row.committee_result,
      })),
    }
  })
  res.json({ people })
})

app.post('/api/admin/exams/:id/enroll', authGeneralAdmin(), (req, res) => {
  try {
    const applicant = getApplicantsByIds([String(req.body?.applicantId || '')])[0]
    if (!applicant) return res.status(404).json({ error: 'المتقدم غير موجود' })
    const result = jobExams.enrollLate(req.user, req.params.id, applicant)
    const assignment = db.prepare('SELECT committee_id FROM committee_assignments WHERE exam_id=?').get(req.params.id)
    if (assignment) {
      db.prepare(`
        INSERT INTO committee_candidates (committee_id, applicant_id, assigned_at, assigned_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(committee_id, applicant_id) DO NOTHING
      `).run(assignment.committee_id, applicant.id, new Date().toISOString(), req.user.username)
    }
    auditMutation(req, 'enroll', 'exam', req.params.id, null, { applicantId: applicant.id, name: applicant.name, ...result })
    res.status(201).json({ ok: true, name: applicant.name, ...result })
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'تعذر إلحاق المتقدم بالاختبار' })
  }
})

app.post('/api/admin/applicants/import', authGeneralAdmin(), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  try {
    const result = importApplicants(rows)
    auditMutation(req, 'import', 'applicants', 'excel', { rowCount: rows.length }, result, req.body?.reason)
    res.json({ ok: true, ...result, applicants: listApplicants() })
  } catch (err) {
    res.status(400).json({ error: err.message || 'فشل استيراد الملف' })
  }
})

app.post('/api/admin/applicants/repair-oral-exams', authGeneralAdmin(), (req, res) => {
  try {
    const result = autoGenerateExams.repairOralSpecialtyAssignments(req.user)
    auditMutation(req, 'repair_oral', 'exams', 'batch', null, {
      moved: result.moved,
      created: result.created,
    })
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'تعذر إعادة فرز الشفهي' })
  }
})

app.post('/api/admin/applicants/auto-generate-exams', authGeneralAdmin(), (_req, res) => {
  res.status(403).json({ error: 'الأدمن يفرز المتقدمين للجان فقط. إنشاء الاختبار يتم من حساب اللجنة (theory / oral_tech / …) بعد الفرز.' })
})

app.patch('/api/admin/applicants/:id', authGeneralAdmin(), (req, res) => {
  try {
    const before = db.prepare('SELECT * FROM applicants WHERE id=?').get(req.params.id)
    const applicant = updateApplicant(req.params.id, req.body || {})
    if (before && applicant.name && before.name !== applicant.name) {
      db.prepare('UPDATE exam_roster SET name=? WHERE applicant_id=?').run(applicant.name, applicant.id)
      db.prepare('UPDATE attempts SET examinee_name=? WHERE applicant_id=?').run(applicant.name, applicant.id)
    }
    auditMutation(req, 'update', 'applicant', applicant.id, before, applicant, req.body?.reason)
    res.json(applicant)
  } catch (err) {
    res.status(400).json({ error: err.message || 'فشل تحديث المتقدم' })
  }
})

app.delete('/api/admin/applicants/:id', authGeneralAdmin(), (req, res) => {
  try {
    const before = db.prepare('SELECT * FROM applicants WHERE id=?').get(req.params.id)
    const result = deleteApplicant(req.params.id, req.user.username)
    auditMutation(req, 'delete', 'applicant', req.params.id, before, result, req.body?.reason)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message || 'فشل حذف المتقدم' })
  }
})

app.post('/api/admin/applicants/bulk-delete', authGeneralAdmin(), (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    const result = deleteApplicantsBulk(ids)
    auditMutation(req, 'bulk_delete', 'applicant', null, { count: ids.length }, result, req.body?.reason)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message || 'فشل الحذف الجماعي' })
  }
})

app.get('/api/admin/audit-events', authGeneralAdmin(), (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const cursor = String(req.query.cursor || '')
  const rows = db.prepare(`SELECT id,actor_id AS actorId,actor_name AS actorName,actor_role AS actorRole,
    request_id AS requestId,action,resource_type AS resourceType,resource_id AS resourceId,
    before_hash AS beforeHash,after_hash AS afterHash,reason,occurred_at AS occurredAt
    FROM audit_events WHERE (?='' OR occurred_at < ?) ORDER BY occurred_at DESC LIMIT ?`).all(cursor, cursor, limit + 1)
  res.json({ events: rows.slice(0, limit), hasNext: rows.length > limit, nextCursor: rows.length > limit ? rows[limit - 1].occurredAt : null })
})

/** فحص وحالة الشبكة وعناوين IP للمخدم والعميل */
app.get('/api/admin/network-status', authStaff(), (req, res) => {
  const primary = detectPrimaryLanIp()
  const candidates = getNetworkCandidates()
  const clientIp = extractClientIp(req)
  const port = process.env.PORT || 3001
  res.json({
    ok: true,
    primary,
    candidates,
    clientIp,
    port,
    publicAppUrl: process.env.PUBLIC_APP_URL || `http://${primary.ip}:${port}`,
  })
})

/** استعراض الحسابات التفصيلية للمسؤول العام (مشغلين، لجان، مسؤولين) مع الفئة والمسار والتخصص وحالة النشاط */
app.get('/api/admin/accounts', authGeneralAdmin(), (_req, res) => {
  const admins = db.prepare('SELECT id, username, active, auth_version AS authVersion, must_rotate_password AS mustRotatePassword, created_at AS createdAt FROM admins').all()
    .map((a) => ({ ...a, role: a.username === 'commander' ? 'commander' : 'admin', accountType: 'staff', active: !!a.active }))

  const operators = db.prepare('SELECT id, username, role, category, oral_role AS oralRole, theory_track AS theoryTrack, specialization, label, description, active, auth_version AS authVersion, must_rotate_password AS mustRotatePassword, created_at AS createdAt FROM access_accounts ORDER BY id').all()
    .map((o) => ({ ...o, accountType: 'operator', active: !!o.active }))

  const committeesList = db.prepare('SELECT a.id, a.username, a.name AS label, a.role, a.committee_id AS committeeId, a.active, a.weight_bp AS weightBp, a.auth_version AS authVersion, c.name AS committeeName FROM committee_accounts a JOIN committees c ON c.id=a.committee_id ORDER BY a.rowid').all()
    .map((c) => ({ ...c, accountType: 'committee', active: !!c.active }))

  res.json({
    admins,
    operators,
    committees: committeesList,
    all: [...admins, ...operators, ...committeesList],
  })
})

/** إنشاء حساب مشغل / متخصص جديد حسب الفئة والمسار والتخصص */
app.post('/api/admin/accounts', authGeneralAdmin(), async (req, res) => {
  try {
    const { username, password, label, category, oralRole, theoryTrack, specialization, description } = req.body || {}
    const cleanUsername = String(username || '').trim()
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون بين 3 و40 حرفاً إنجليزياً أو أرقام أو _ أو -' })
    }

    const existing = db.prepare('SELECT username FROM admins WHERE username = ? COLLATE NOCASE').get(cleanUsername)
      || db.prepare('SELECT username FROM access_accounts WHERE username = ? COLLATE NOCASE').get(cleanUsername)
      || db.prepare('SELECT username FROM committee_accounts WHERE username = ? COLLATE NOCASE').get(cleanUsername)

    if (existing) {
      return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل في النظام' })
    }

    const cleanPassword = String(password || '').trim()
    if (cleanPassword.length < 8) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 10)
    const id = `op-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const now = new Date().toISOString()
    const active = req.body?.active === false ? 0 : 1

    db.prepare(`INSERT INTO access_accounts
      (id, username, password_hash, password_plain, role, category, oral_role, theory_track, specialization, label, description, active, auth_version, created_at)
      VALUES (?, ?, ?, ?, 'operator', ?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(
        id,
        cleanUsername,
        passwordHash,
        cleanPassword,
        category || 'theory',
        oralRole || null,
        theoryTrack || null,
        specialization || null,
        label ? String(label).trim() : cleanUsername,
        description ? String(description).trim() : '',
        active,
        now,
      )

    auditMutation(req, 'create_account', 'access_account', id, null, {
      username: cleanUsername,
      category,
      specialization,
      active,
    })

    res.status(201).json({
      ok: true,
      account: {
        id,
        username: cleanUsername,
        role: 'operator',
        category: category || 'theory',
        oralRole: oralRole || null,
        theoryTrack: theoryTrack || null,
        specialization: specialization || null,
        label: label ? String(label).trim() : cleanUsername,
        description: description || '',
        active: !!active,
        createdAt: now,
      },
      message: 'تم إنشاء الحساب بنجاح',
    })
  } catch (err) {
    console.error('[create-account]', err)
    res.status(400).json({ error: err?.message || 'فشل إنشاء الحساب' })
  }
})

/** تفعيل أو تعطيل حساب في النظام فورياً */
app.patch('/api/admin/accounts/:type/:id/status', authGeneralAdmin(), (req, res) => {
  try {
    const { type, id } = req.params
    const active = req.body?.active ? 1 : 0

    let table = ''
    if (type === 'operator') table = 'access_accounts'
    else if (type === 'committee') table = 'committee_accounts'
    else if (type === 'staff') table = 'admins'
    else return res.status(400).json({ error: 'نوع الحساب غير صالح' })

    const target = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
    if (!target) return res.status(404).json({ error: 'الحساب غير موجود' })

    if (target.username === 'admin' && active === 0) {
      return res.status(403).json({ error: 'لا يمكن تعطيل حساب المسؤول العام الرئيسي (admin)' })
    }
    if (req.user.id === target.id && active === 0) {
      return res.status(403).json({ error: 'لا يمكن للمستخدم تعطيل حسابه الحالي' })
    }

    db.prepare(`UPDATE ${table} SET active = ?, auth_version = auth_version + 1 WHERE id = ?`).run(active, id)

    auditMutation(req, 'toggle_account_status', `${type}_account`, id, { active: target.active }, { active }, req.body?.reason || (active ? 'تفعيل الحساب' : 'تعطيل الحساب'))

    res.json({
      ok: true,
      id,
      active: !!active,
      message: active ? 'تم تفعيل الحساب بنجاح' : 'تم تعطيل الحساب بنجاح وإلغاء جلساته الحالية',
    })
  } catch (err) {
    console.error('[toggle-account-status]', err)
    res.status(400).json({ error: err?.message || 'فشل تعديل حالة الحساب' })
  }
})

app.get('/api/health/live', (_req, res) => res.json({ ok: true }))
app.get(['/api/health', '/api/health/ready'], (_req, res) => {
  try {
    db.prepare('SELECT 1 AS ok').get()
    const foreignKeys = Number(db.pragma('foreign_keys', { simple: true })) === 1
    const schemaVersion = Number(db.prepare('SELECT COALESCE(MAX(version),0) AS n FROM schema_migrations').get().n)
    const disk = fs.statfsSync(dataDir)
    const freeBytes = Number(disk.bavail) * Number(disk.bsize)
    const backup = archiveBackups.status()
    const backupFresh = !!backup.lastSuccess && Date.now() - Date.parse(backup.lastSuccess.createdAt) < 2 * 60 * 60 * 1000
    const backupSecure = process.env.NODE_ENV !== 'production' || (backup.externalCopyConfigured && backup.encryptedExternalCopy)
    const ready = foreignKeys && schemaVersion >= 6 && freeBytes > 256 * 1024 * 1024 && !backup.lastError && backupSecure && (backupFresh || backup.busy)
    res.status(ready ? 200 : 503).json({ ok: ready, database: true, foreignKeys, schemaVersion, diskSpace: freeBytes > 256 * 1024 * 1024, backup: backup.busy ? 'running' : backupFresh ? 'fresh' : 'stale', backupSecure })
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'readiness_failed', message: error?.message }))
    res.status(503).json({ ok: false, database: false })
  }
})

/** قائمة الجلسات الحية (احتياطي دون إطارات) */
app.get('/api/admin/live-sessions', authStaff(), (req, res) => {
  res.json(getLiveSessionsForRest(req.user))
})

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const serveFrontend = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(distDir, 'index.html'))
if (serveFrontend) {
  app.use(express.static(distDir, { index: false, maxAge: '1d', immutable: false }))
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    return res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((err, req, res, _next) => {
  if (res.headersSent) return _next(err)
  const status = Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 500
  console.error(JSON.stringify({ level: 'error', event: 'request_failed', requestId: req.requestId, status, message: err?.message, stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack }))
  const message = status < 500 ? (err.message || 'تعذر تنفيذ الطلب') : 'تعذر تنفيذ الطلب بسبب خطأ داخلي'
  res.status(status).json({ code: status < 500 ? 'REQUEST_REJECTED' : 'INTERNAL_ERROR', error: message, requestId: req.requestId })
})
const server = http.createServer(app)
const liveApi = attachLiveMonitor(server, JWT_SECRET, { db, verifyToken, monitoring, evaluation: {
  hasSessions(rosterId) { return typeof evaluations?.hasSessions === 'function' ? evaluations.hasSessions(rosterId) : false },
  expireRuns() { evaluations.expireRuns(); examRuns.expireRuns() },
  progress(user, body, submit) { return evaluations.hasSessions(user.rosterId) ? evaluations.progress(user, body, submit) : examRuns.submit(user, body, true) },
}, allowedOrigins, canWatch(user, exam) {
  if (!exam) return false
  if (user.role?.startsWith('committee_')) {
    const assignment = db.prepare('SELECT id FROM committee_assignments WHERE exam_id=?').get(exam.id)
    if (!assignment) return false
    committees.assignment(user, assignment.id)
    return true
  }
  return isStaff(user) && assertExamAccess(user, exam)
} })

server.listen(PORT, HOST, () => {
  const displayHost = ['0.0.0.0','127.0.0.1','::'].includes(HOST) ? 'localhost' : HOST
  console.log(`✓ خادم منصة الاختبارات على http://${displayHost}:${server.address().port}`)
  if (autoDetectedNetwork) {
    if (autoDetectedNetwork.mode === 'offline') {
      console.log('ℹ لا توجد شبكة محلية متصلة؛ تم ضبط الرابط على الوضع المحلي: ' + PUBLIC_APP_URL)
    } else {
      console.log(`✓ تم اكتشاف الشبكة الحالية تلقائياً: [${autoDetectedNetwork.ip}] عبر كرت (${autoDetectedNetwork.interfaceName})`)
    }
  }
  console.log(`✓ رابط المنصة المعتمد لبطاقات QR: ${PUBLIC_APP_URL}`)
  console.log(`✓ مراقبة مباشرة عبر WebSocket: ws://${HOST}:${server.address().port}/ws`)
})
server.requestTimeout = 30_000
server.headersTimeout = 15_000
server.keepAliveTimeout = 5_000
server.on('error', (error) => {
  console.error(JSON.stringify({ level: 'error', event: 'server_error', message: error.message }))
  process.exitCode = 1
})
server.on('close', () => archiveBackups.stop())
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(JSON.stringify({ level: 'info', event: 'shutdown_started', signal }))
  archiveBackups.stop()
  clearInterval(loginCleanup)
  const force = setTimeout(() => process.exit(1), 15_000); force.unref()
  server.close(() => {
    try { db.pragma('wal_checkpoint(TRUNCATE)') } catch { /* أفضل محاولة أثناء الإغلاق */ }
    try { db.close() } catch { /* مغلقة بالفعل */ }
    clearTimeout(force)
    process.exit(0)
  })
}
process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))


