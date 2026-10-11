import bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'node:crypto'
import { parseCookies } from './runtimeSecurity.js'
import { oralRolesCompatible, canonicalOralRole, effectiveJobTitle, groupApplicants, resolveJobProfile } from '../shared/jobProfiles.js'
import { ORAL_BUCKET_META, candidateVisibleToOperator, assignmentSkipReason } from '../shared/evaluationMatrix.js'
import {
  isObjectiveExam,
  questionTypesFromConfig,
  questionTypesFromQuestions,
  resolveExamTheoryTrack,
  showsEntryBarcode,
} from '../shared/examPresentation.js'
import { scoreAnswers } from './examLogic.js'
import { ACCESS_ACCOUNTS } from './accessAccounts.js'
import { examineeCardInfo } from './examineeCard.js'

const OPERATOR_COMMITTEE_CATEGORIES = new Set(['theory', 'oral', 'driving', 'personality'])

/** يضمن لجنة واحدة لكل حساب مشغّل عام/كتابي/شفهي/قيادة/شخصية (owner_username = اسم الحساب) */
export function ensureOperatorCommittees(db) {
  const committeeColumns = new Set(db.prepare('PRAGMA table_info(committees)').all().map((c) => c.name))
  if (!committeeColumns.has('theory_track')) {
    db.exec('ALTER TABLE committees ADD COLUMN theory_track TEXT')
  }
  const insert = db.prepare(
    `INSERT INTO committees(id,name,category,oral_role,theory_track,owner_username,owner_name,owner_weight_bp)
     VALUES (?,?,?,?,?,?,?,10000)`,
  )
  const find = db.prepare('SELECT id, name, owner_name, theory_track FROM committees WHERE owner_username=? COLLATE NOCASE')
  const patchTrack = db.prepare('UPDATE committees SET theory_track=? WHERE id=? AND (theory_track IS NULL OR theory_track=?)')
  const patchName = db.prepare('UPDATE committees SET name=?, owner_name=? WHERE id=?')
  const created = []
  for (const acc of ACCESS_ACCOUNTS) {
    if (!OPERATOR_COMMITTEE_CATEGORIES.has(acc.category)) continue
    const existing = find.get(acc.username)
    if (existing) {
      if (acc.category === 'theory' && acc.theoryTrack && existing.theory_track !== acc.theoryTrack) {
        patchTrack.run(acc.theoryTrack, existing.id, existing.theory_track)
      }
      const desiredName = acc.label || acc.username
      if (
        existing.name !== desiredName ||
        existing.owner_name !== desiredName ||
        existing.name === 'إداري الفرع' ||
        existing.owner_name === 'إداري الفرع' ||
        existing.name === 'حساب النظري'
      ) {
        patchName.run(desiredName, desiredName, existing.id)
      }
      continue
    }
    const oralRole =
      acc.category === 'oral' ? (canonicalOralRole(acc.oralRole) || acc.oralRole || null) : null
    const theoryTrack = acc.category === 'theory' ? (acc.theoryTrack || null) : null
    const id = randomUUID()
    insert.run(id, acc.label || acc.username, acc.category, oralRole, theoryTrack, acc.username, acc.label || acc.username)
    created.push({ id, username: acc.username, category: acc.category, oralRole, theoryTrack })
  }
  return created
}

/** يزرع لجنة بحساب مدير مستقل — للاختبارات الداخلية فقط (مسار الأدمن أُلغي لصالح حسابات الوصول) */
export function seedManagedCommittee(db, { name, managerName, username, password, category, oralRole = null }) {
  const id = randomUUID()
  const hash = bcrypt.hashSync(password, 10)
  db.prepare('INSERT INTO committees(id, name, category, oral_role) VALUES (?, ?, ?, ?)').run(id, name, category, oralRole)
  db.prepare(
    'INSERT INTO committee_accounts(id, committee_id, name, username, password_hash, role, weight_bp) VALUES (?, ?, ?, ?, ?, ?, 10000)',
  ).run(randomUUID(), id, managerName, username, hash, 'committee_manager')
  return { id, name, category, oralRole }
}

export function createCommitteeService(db, { getApplicantsByIds, jobExams, listApplicants } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS committees (id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS committee_accounts (
      id TEXT PRIMARY KEY, committee_id TEXT NOT NULL REFERENCES committees(id),
      name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, weight_bp INTEGER NOT NULL,
      auth_version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS committee_assignments (
      id TEXT PRIMARY KEY, committee_id TEXT NOT NULL REFERENCES committees(id), exam_id TEXT NOT NULL UNIQUE REFERENCES exams(id)
    );
    CREATE TABLE IF NOT EXISTS committee_scores (
      assignment_id TEXT NOT NULL, examinee_name TEXT NOT NULL, account_id TEXT NOT NULL,
      percent REAL NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (assignment_id, examinee_name, account_id)
    );
    CREATE TABLE IF NOT EXISTS committee_results (
      assignment_id TEXT NOT NULL, examinee_name TEXT NOT NULL, attempt_id TEXT NOT NULL UNIQUE,
      percent REAL NOT NULL, snapshot_json TEXT NOT NULL, published_at TEXT NOT NULL,
      PRIMARY KEY (assignment_id, examinee_name)
    );
    CREATE TABLE IF NOT EXISTS committee_candidates (
      committee_id TEXT NOT NULL REFERENCES committees(id),
      applicant_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      assigned_by TEXT,
      PRIMARY KEY (committee_id, applicant_id)
    );
  `)
  const committeeColumns = new Set(db.prepare('PRAGMA table_info(committees)').all().map((column) => column.name))
  for (const [name, definition] of [
    ['category', 'TEXT'],
    ['oral_role', 'TEXT'],
    ['owner_username', 'TEXT COLLATE NOCASE'],
    ['owner_name', 'TEXT'],
    ['owner_weight_bp', 'INTEGER NOT NULL DEFAULT 10000'],
  ]) {
    if (!committeeColumns.has(name)) db.exec(`ALTER TABLE committees ADD COLUMN ${name} ${definition}`)
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_committees_owner ON committees(owner_username) WHERE owner_username IS NOT NULL')
  for (const [table, column, definition] of [
    ['committee_results', 'note', 'TEXT'],
    ['committee_results', 'estimated_salary', 'REAL'],
  ]) {
    const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name))
    if (!columns.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
  ensureOperatorCommittees(db)
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
  const required = (value, label) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) fail(`${label} مطلوب وبحد أقصى 120 حرفًا`)
    return value.trim()
  }
  function passwordHash(value) {
    if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) fail('كلمة المرور مطلوبة: 8 أحرف على الأقل وبحد أقصى 72 بايت')
    return bcrypt.hashSync(value, 10)
  }
  function numeric(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) fail(`${label} يجب أن تكون بين 0 و100 بمنزلتين عشريتين كحد أقصى`)
    return Math.round(value * 100)
  }
  function optionalNote(value) {
    if (value == null || value === '') return null
    if (typeof value !== 'string') fail('الملاحظة يجب أن تكون نصاً')
    const text = value.trim()
    if (text.length > 1000) fail('الملاحظة بحد أقصى 1000 حرف')
    return text || null
  }
  function optionalSalary(value) {
    if (value == null || value === '') return null
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000) fail('الراتب المقدر يجب أن يكون رقماً بين 0 و 100000000')
    return Math.round(value)
  }
  function resolve(user) {
    if (!['committee_manager', 'committee_member'].includes(user?.role)) return user
    const account = db.prepare('SELECT * FROM committee_accounts WHERE id = ?').get(user.id)
    if (!account?.active || account.auth_version !== user.authVersion || account.role !== user.role) fail('جلسة غير صالحة', 401)
    return { ...user, committeeId: account.committee_id, label: account.name, username: account.username }
  }
  const eligibleOwner = (user) => user?.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user.category)
  function ownedCommittee(user, id) {
    if (!eligibleOwner(user)) return null
    return id
      ? db.prepare('SELECT * FROM committees WHERE id=? AND owner_username=? COLLATE NOCASE').get(id, user.username)
      : db.prepare('SELECT * FROM committees WHERE owner_username=? COLLATE NOCASE').get(user.username)
  }
  const ownerAccountId = (committee) => committee?.owner_username ? `operator:${committee.owner_username}` : null
  function isOwner(user, id) { return !!id && !!ownedCommittee(resolve(user), id) }
  function authorize(user, id, manage = false) {
    user = resolve(user)
    if (user?.role === 'admin') return user
    if (ownedCommittee(user, id)) return user
    if (!['committee_manager', 'committee_member'].includes(user?.role) || user.committeeId !== id || (manage && user.role !== 'committee_manager')) fail('صلاحية غير كافية لهذه اللجنة', 403)
    return user
  }
  function availableUsername(username, exceptId) {
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) fail('اسم المستخدم: 3 إلى 40 حرفًا إنجليزيًا أو رقمًا أو _ أو . أو -')
    if (db.prepare('SELECT id FROM admins WHERE lower(username) = lower(?)').get(username) || db.prepare('SELECT id FROM access_accounts WHERE lower(username) = lower(?)').get(username)) fail('اسم المستخدم مستخدم بالفعل')
    const other = db.prepare('SELECT id FROM committee_accounts WHERE username = ? COLLATE NOCASE').get(username)
    if (other && other.id !== exceptId) fail('اسم المستخدم مستخدم بالفعل')
  }
  function accounts(id) {
    const committee = db.prepare('SELECT * FROM committees WHERE id=?').get(id)
    const rows = db.prepare('SELECT id, name, username, role, active, weight_bp FROM committee_accounts WHERE committee_id = ? ORDER BY role ASC, rowid').all(id)
      .map(({ weight_bp, active, ...row }) => ({ ...row, active: !!active, weight: weight_bp / 100 }))
    if (committee?.owner_username) rows.unshift({
      id: ownerAccountId(committee), name: committee.owner_name || committee.owner_username,
      username: committee.owner_username, role: 'committee_manager', active: true,
      weight: committee.owner_weight_bp / 100, externalOwner: true,
    })
    return rows
  }
  const create = db.transaction((user, body) => {
    user = resolve(user)
    if (eligibleOwner(user)) {
      if (ownedCommittee(user)) fail('أنشأت لجنة لهذا الحساب بالفعل؛ يمكنك إدارتها وربط اختبارات نطاقك بها', 409)
      const name = required(body.name, 'اسم اللجنة')
      const id = randomUUID()
      const oralRole = user.category === 'oral' ? canonicalOralRole(user.oralRole) || null : null
      const theoryTrack = user.category === 'theory' ? (user.theoryTrack || null) : null
      db.prepare('INSERT INTO committees(id,name,category,oral_role,theory_track,owner_username,owner_name,owner_weight_bp) VALUES (?,?,?,?,?,?,?,10000)')
        .run(id, name, user.category, oralRole, theoryTrack, user.username, user.label || user.username)
      return { id, name, category: user.category, oralRole, theoryTrack }
    }
    if (user?.role !== 'admin') fail('إنشاء اللجان متاح للمسؤول العام وحسابات الاختصاص', 403)
    fail(
      'اللجان مرتبطة بحسابات الوصول الجاهزة (theory / office / oral_tech / …). أسند المتقدمين من صفحة الفرز وادخل بالحساب المناسب.',
      403,
    )
  })
  const saveMembers = db.transaction((user, id, body) => {
    user = authorize(user, id, true)
    const committee = db.prepare('SELECT * FROM committees WHERE id = ?').get(id)
    if (!committee) fail('اللجنة غير موجودة', 404)
    if (body.revision !== committee.revision) fail('تغيرت اللجنة في جلسة أخرى. حدّث الصفحة قبل الحفظ.', 409)
    if (!Array.isArray(body.members) || body.members.length < 1 || body.members.length > 100) fail('يجب أن تضم اللجنة من 1 إلى 100 عضو')
    const existing = db.prepare('SELECT * FROM committee_accounts WHERE committee_id = ?').all(id)
    const externalOwnerId = ownerAccountId(committee)
    const seen = new Set()
    const usernames = new Set()
    const rows = body.members.map((member) => {
      if (externalOwnerId && member.id === externalOwnerId) {
        if (seen.has(externalOwnerId)) fail('عضو مكرر')
        seen.add(externalOwnerId)
        if (member.active !== true) fail('لا يمكن تعطيل مدير اللجنة')
        if (member.username !== committee.owner_username) fail('اسم حساب رئيس اللجنة مرتبط بحساب الاختصاص ولا يمكن تغييره')
        return { externalOwner: true, id: externalOwnerId, name: required(member.name, 'اسم العضو'),
          username: committee.owner_username, role: 'committee_manager', active: 1,
          weight: numeric(member.weight, 'نسبة التقييم') }
      }
      const old = member.id ? existing.find((row) => row.id === member.id) : null
      if (member.id && !old) fail('عضو غير تابع لهذه اللجنة', 403)
      if (old && seen.has(old.id)) fail('عضو مكرر')
      if (old) seen.add(old.id)
      if (typeof member.active !== 'boolean') fail('حالة العضو غير صالحة')
      if (old?.role === 'committee_manager' && !member.active) fail('لا يمكن تعطيل مدير اللجنة')
      const username = required(member.username, 'اسم المستخدم')
      availableUsername(username, old?.id)
      if (usernames.has(username.toLowerCase())) fail('اسم مستخدم مكرر')
      usernames.add(username.toLowerCase())
      const weight = numeric(member.weight, 'نسبة التقييم')
      if (!member.active && weight !== 0) fail('نسبة العضو المعطل يجب أن تكون صفرًا')
      return { id: old?.id || randomUUID(), name: required(member.name, 'اسم العضو'), username,
        hash: member.password ? passwordHash(member.password) : old?.password_hash || passwordHash(member.password),
        role: old?.role || 'committee_member', active: member.active ? 1 : 0, weight,
        version: (old?.auth_version || 1) + (old && (member.password || !!old.active !== member.active || old.username !== username) ? 1 : 0) }
    })
    if (externalOwnerId && !seen.has(externalOwnerId)) fail('يجب إبقاء رئيس اللجنة في قائمة الأعضاء')
    if (existing.some((row) => !seen.has(row.id))) fail('لتعطيل عضو، أبقه في القائمة واجعل نسبته صفرًا')
    if (rows.reduce((sum, row) => sum + row.weight, 0) !== 10000) fail('مجموع نسب الأعضاء النشطين يجب أن يساوي 100%')
    const upsert = db.prepare(`INSERT INTO committee_accounts(id, committee_id, name, username, password_hash, role, active, weight_bp, auth_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, username=excluded.username,
      password_hash=excluded.password_hash, active=excluded.active, weight_bp=excluded.weight_bp, auth_version=excluded.auth_version`)
    for (const row of rows.filter((item) => !item.externalOwner)) upsert.run(row.id, id, row.name, row.username, row.hash, row.role, row.active, row.weight, row.version)
    const externalOwner = rows.find((item) => item.externalOwner)
    if (externalOwner) db.prepare('UPDATE committees SET owner_name=?,owner_weight_bp=? WHERE id=?').run(externalOwner.name, externalOwner.weight, id)
    db.prepare('UPDATE committees SET revision = revision + 1 WHERE id = ?').run(id)
    return { ok: true }
  })
  function list(user) {
    ensureOperatorCommittees(db)
    user = resolve(user)
    if (user?.role === 'admin') {
      // لجان الحسابات الجاهزة أولاً؛ اللجان اليدوية القديمة تظهر في الذيل إن وُجدت
      return db
        .prepare(
          `SELECT * FROM committees
           ORDER BY CASE WHEN owner_username IS NOT NULL THEN 0 ELSE 1 END, owner_username COLLATE NOCASE, rowid`,
        )
        .all()
    }
    if (eligibleOwner(user)) return db.prepare('SELECT * FROM committees WHERE owner_username=? COLLATE NOCASE ORDER BY rowid').all(user.username)
    if (!['committee_manager', 'committee_member'].includes(user?.role)) fail('صلاحية غير كافية', 403)
    return db.prepare('SELECT * FROM committees WHERE id = ?').all(user.committeeId)
  }
  const assign = db.transaction((user, id, examId) => {
    user = resolve(user)
    const committee = db.prepare('SELECT * FROM committees WHERE id=?').get(id)
    if (!committee) fail('اللجنة غير موجودة', 404)
    if (user?.role !== 'admin' && !ownedCommittee(user, id)) fail('ربط الاختبارات متاح للمسؤول العام أو رئيس لجنة الاختصاص', 403)
    const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(examId)
    if (!exam?.active) fail('اختر اختبارًا نشطًا')
    if (committee.category && exam.category !== committee.category) fail('نوع الاختبار لا يطابق اختصاص اللجنة')
    if (committee.oral_role && exam.oral_role && !oralRolesCompatible(committee.oral_role, exam.oral_role)) fail('تخصص المقابلة الشفهية لا يطابق اختصاص رئيس اللجنة')
    if (committee.oral_role && !exam.oral_role) fail('تخصص المقابلة الشفهية لا يطابق اختصاص رئيس اللجنة')
    if (db.prepare("SELECT name FROM sqlite_master WHERE name='evaluation_sessions'").get() && db.prepare('SELECT id FROM evaluation_sessions WHERE exam_id=?').get(examId)) fail('بدأت جلسات تقييم لهذا الاختبار؛ اربط اللجنة قبل بدء التقييم')
    if (db.prepare('SELECT id FROM committee_assignments WHERE exam_id=?').get(examId)) fail('الاختبار مرتبط بلجنة بالفعل')
    if (db.prepare('SELECT id FROM attempts WHERE exam_id=? LIMIT 1').get(examId) || db.prepare('SELECT id FROM exam_roster WHERE exam_id=? AND used=1 LIMIT 1').get(examId)) fail('اختر اختبارًا لم يبدأ ولم تسجل له نتائج بعد')
    if (!db.prepare('SELECT id FROM exam_roster WHERE exam_id=? LIMIT 1').get(examId)) fail('الاختبار لا يحتوي على متقدمين')
    db.prepare('INSERT INTO committee_assignments VALUES (?, ?, ?)').run(randomUUID(), id, examId)
    return { ok: true }
  })
  function assignment(user, id) {
    const row = db.prepare('SELECT * FROM committee_assignments WHERE id=?').get(id)
    if (!row) fail('اختبار اللجنة غير موجود', 404)
    authorize(user, row.committee_id)
    return row
  }
  function savedQuestionTypes(examId) {
    const types = questionTypesFromConfig(jobExams?.configOf?.(examId))
    if (types.length) return types
    const blobs = []
    try {
      blobs.push(...db.prepare('SELECT questions_json FROM exam_question_sets WHERE exam_id=?').all(examId).map((item) => item.questions_json))
    } catch { /* الاختبارات القديمة قد لا تحوي مجموعات محفوظة */ }
    try {
      const exam = db.prepare('SELECT questions_json FROM exams WHERE id=?').get(examId)
      if (exam?.questions_json) blobs.push(exam.questions_json)
    } catch { /* ignore */ }
    const questions = []
    for (const blob of blobs) {
      try { questions.push(...JSON.parse(blob || '[]')) } catch { /* ignore */ }
    }
    return questionTypesFromQuestions(questions)
  }
  function objectiveSnapshot(examId) {
    if (!isObjectiveExam(savedQuestionTypes(examId))) return { objectiveExam: false, objectiveScores: [] }
    const byName = new Map()
    const add = (name, score, maxScore) => {
      const examineeName = String(name || '').trim()
      const max = Number(maxScore)
      const value = Number(score)
      if (!examineeName || !(max > 0) || !Number.isFinite(value) || byName.has(examineeName)) return
      byName.set(examineeName, {
        examineeName,
        score: value,
        maxScore: max,
        percent: Math.round((value / max) * 100),
      })
    }
    for (const row of db.prepare('SELECT examinee_name AS examineeName, score, max_score AS maxScore FROM attempts WHERE exam_id=? ORDER BY finished_at DESC').all(examId)) {
      add(row.examineeName, row.score, row.maxScore)
    }
    try {
      for (const run of db.prepare("SELECT examinee_name AS examineeName, questions_json AS questionsJson, answers_json AS answersJson FROM evaluation_runs WHERE exam_id=? AND status='submitted'").all(examId)) {
        if (byName.has(run.examineeName)) continue
        const questions = JSON.parse(run.questionsJson || '[]')
        const scored = scoreAnswers(questions, JSON.parse(run.answersJson || '{}'))
        add(run.examineeName, scored.score, scored.maxScore)
      }
    } catch { /* جلسة QR غير موجودة لهذا الاختبار */ }
    return { objectiveExam: true, objectiveScores: [...byName.values()] }
  }
  function evaluations(user, id) {
    const row = assignment(user, id)
    const manager = user.role === 'admin' || user.role === 'committee_manager' || isOwner(user, row.committee_id)
    const scores = db.prepare('SELECT examinee_name AS examineeName, account_id AS accountId, percent FROM committee_scores WHERE assignment_id=?').all(id)
    const results = db.prepare('SELECT examinee_name AS examineeName, percent, snapshot_json, published_at AS publishedAt, note, estimated_salary AS estimatedSalary FROM committee_results WHERE assignment_id=?').all(id)
      .map(({ snapshot_json, ...result }) => ({ ...result, snapshot: JSON.parse(snapshot_json) }))
    const objective = objectiveSnapshot(row.exam_id)
    return { candidates: db.prepare('SELECT name, display_id AS displayId FROM exam_roster WHERE exam_id=? ORDER BY seq_number').all(row.exam_id)
      .map((candidate) => ({ ...candidate, scoreVersion: scoreVersion(id, candidate.name) })),
      scores: manager ? scores : scores.filter((score) => score.accountId === user.id), results: manager ? results : results.map((result) => ({ ...result, snapshot: [] })),
      objectiveExam: objective.objectiveExam,
      objectiveScores: objective.objectiveScores,
    }
  }
  function scoreVersion(id, name) {
    const rows = db.prepare('SELECT account_id, percent, updated_at FROM committee_scores WHERE assignment_id=? AND examinee_name=? ORDER BY account_id').all(id, name)
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  function validateCandidate(row, name) {
    if (!db.prepare('SELECT id FROM exams WHERE id=? AND active=1').get(row.exam_id)) fail('الاختبار متوقف')
    if (!db.prepare('SELECT id FROM exam_roster WHERE exam_id=? AND name=?').get(row.exam_id, name)) fail('المتقدم غير مسجل في هذا الاختبار', 404)
    if (db.prepare('SELECT attempt_id FROM committee_results WHERE assignment_id=? AND examinee_name=?').get(row.id, name)) fail('اعتمدت النتيجة بالفعل ولا يمكن تغيير تقييماتها', 409)
  }
  const score = db.transaction((user, id, body) => {
    const row = assignment(user, id)
    const accountId = isOwner(user, row.committee_id) ? ownerAccountId(db.prepare('SELECT * FROM committees WHERE id=?').get(row.committee_id)) : user.id
    if (!['committee_manager', 'committee_member'].includes(user.role) && !isOwner(user, row.committee_id)) fail('يجب تسجيل الدخول بحساب عضو اللجنة لإدخال درجته', 403)
    validateCandidate(row, body.examineeName)
    const hasDetails = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evaluation_sessions'").get()
    const details = hasDetails && db.prepare('SELECT status,percent FROM evaluation_sessions WHERE assignment_id=? AND evaluator_key=? AND roster_id=(SELECT id FROM exam_roster WHERE exam_id=? AND name=?)').get(id, user.id, row.exam_id, body.examineeName)
    if (details && details.status !== 'scored') fail('احفظ درجات الأسئلة في جلسة تقييمك أولًا', 409)
    const percent = numeric(details ? details.percent : body.percent, 'الدرجة') / 100
    db.prepare(`INSERT INTO committee_scores VALUES (?, ?, ?, ?, ?) ON CONFLICT(assignment_id, examinee_name, account_id)
      DO UPDATE SET percent=excluded.percent, updated_at=excluded.updated_at`).run(id, body.examineeName, accountId, percent, new Date().toISOString())
    return { ok: true }
  })
  const publish = db.transaction((user, id, body) => {
    const row = assignment(user, id)
    authorize(user, row.committee_id, true)
    validateCandidate(row, body.examineeName)
    const note = optionalNote(body.note)
    const committee = db.prepare('SELECT * FROM committees WHERE id=?').get(row.committee_id)
    const estimatedSalary = committee.category === 'oral' ? optionalSalary(body.estimatedSalary) : null
    if (body.revision !== committee.revision) fail('تغير توزيع الأوزان. حدّث الصفحة قبل الاعتماد.', 409)
    if (body.scoreVersion !== scoreVersion(id, body.examineeName)) fail('تغيرت درجات الأعضاء. حدّث الدرجات وراجع النتيجة قبل الاعتماد.', 409)
    const members = accounts(row.committee_id).filter((member) => member.active)
    if (Math.round(members.reduce((sum, member) => sum + member.weight, 0) * 100) !== 10000) fail('مجموع النسب يجب أن يساوي 100%')
    const scores = db.prepare('SELECT * FROM committee_scores WHERE assignment_id=? AND examinee_name=?').all(id, body.examineeName)
    const snapshot = members.map((member) => {
      if (db.prepare("SELECT name FROM sqlite_master WHERE name='evaluation_sessions'").get()) {
        const session = db.prepare('SELECT status FROM evaluation_sessions WHERE assignment_id=? AND evaluator_key=? AND roster_id=(SELECT id FROM exam_roster WHERE exam_id=? AND name=?)').get(id, member.id, row.exam_id, body.examineeName)
        if (session && session.status !== 'scored') fail('لم تكتمل درجات أسئلة ' + member.name)
      }
      const entry = scores.find((item) => item.account_id === member.id)
      if (!entry) fail(`لم يسجل ${member.name} درجته بعد`)
      return { accountId: member.id, name: member.name, username: member.username, role: member.role, weight: member.weight, score: entry.percent, contribution: entry.percent * member.weight / 100 }
    })
    const percent = Math.round(snapshot.reduce((sum, item) => sum + item.contribution, 0) * 100) / 100
    const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(row.exam_id)
    const candidate = db.prepare('SELECT * FROM exam_roster WHERE exam_id=? AND name=?').get(row.exam_id, body.examineeName)
    const detailedSessions = db.prepare("SELECT name FROM sqlite_master WHERE name='evaluation_sessions'").get()
      ? db.prepare('SELECT id,mode,evaluator_key,questions_json,percent FROM evaluation_sessions WHERE roster_id=?').all(candidate.id)
        .filter((session) => members.some((member) => member.id === session.evaluator_key))
        .map(({ questions_json, ...session }) => ({ ...session, questions: JSON.parse(questions_json) })) : []
    const existingAttempt = db.prepare('SELECT * FROM attempts WHERE exam_id=? AND examinee_name=?').get(row.exam_id, body.examineeName)
    const now = new Date().toISOString()
    let attemptId
    if (existingAttempt) {
      if (db.prepare('SELECT attempt_id FROM committee_results WHERE attempt_id=?').get(existingAttempt.id)) fail('توجد نتيجة لهذا المتقدم بالفعل', 409)
      attemptId = existingAttempt.id
      db.prepare('UPDATE attempts SET score=?, max_score=100, applicant_id=COALESCE(applicant_id, ?), roster_id=COALESCE(roster_id, ?) WHERE id=?')
        .run(percent, candidate.applicant_id || null, candidate.id, attemptId)
    } else {
      attemptId = randomUUID()
      db.prepare(`INSERT INTO attempts(id,exam_id,examinee_name,applicant_id,roster_id,answers_json,score,max_score,started_at,finished_at) VALUES (?,?,?,?,?,'{}',?,100,?,?)`)
        .run(attemptId, row.exam_id, body.examineeName, candidate.applicant_id || null, candidate.id, percent, now, now)
    }
    db.prepare(`INSERT INTO committee_results(assignment_id, examinee_name, attempt_id, percent, snapshot_json, published_at, note, estimated_salary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, body.examineeName, attemptId, percent, JSON.stringify(snapshot), now, note, estimatedSalary)
    const archiveDetail = JSON.stringify({ type: 'committee', committeeId: committee.id, committeeName: committee.name, revision: committee.revision, note, estimatedSalary, members: snapshot, evaluationSessions: detailedSessions })
    const archived = db.prepare('SELECT id FROM assessment_archive WHERE attempt_id=?').get(attemptId)
    if (archived) {
      db.prepare('UPDATE assessment_archive SET score=?, max_score=100, percent=? WHERE id=?').run(percent, percent, archived.id)
    } else {
      db.prepare(`INSERT INTO assessment_archive(id,category,exam_id,exam_title,oral_role,examinee_name,display_id,org,job_title,rank,score,max_score,percent,detail_json,archived_at,evaluator,applicant_id,attempt_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,100,?,?,?,?,?,?)`).run(randomUUID(), exam.category, exam.id, exam.title, exam.oral_role, candidate.name, candidate.display_id, candidate.org, candidate.job_title, candidate.rank, percent, percent,
        archiveDetail, now, user.username, candidate.applicant_id || null, attemptId)
    }
    db.prepare('UPDATE exam_roster SET used=1 WHERE id=?').run(candidate.id)
    return { ok: true, percent }
  })
  function login(username, password) {
    const account = db.prepare('SELECT * FROM committee_accounts WHERE username=? COLLATE NOCASE').get(username)
    if (!account?.active || !bcrypt.compareSync(password, account.password_hash)) return null
    return { id: account.id, role: account.role, username: account.username, label: account.name, committeeId: account.committee_id, authVersion: account.auth_version }
  }
  async function loginAsync(username, password) {
    const account = db.prepare('SELECT * FROM committee_accounts WHERE username=? COLLATE NOCASE').get(username)
    if (!account?.active || !await bcrypt.compare(password, account.password_hash)) return null
    return { id: account.id, role: account.role, username: account.username, label: account.name, committeeId: account.committee_id, authVersion: account.auth_version }
  }
  function activeEvaluator(id, accountId) {
    const committee = db.prepare('SELECT * FROM committees WHERE id=?').get(id)
    if (!committee) return false
    if (ownerAccountId(committee) === accountId) return true
    return !!db.prepare('SELECT id FROM committee_accounts WHERE committee_id=? AND id=? AND active=1').get(id, accountId)
  }

  function coverKeyForCommittee(committee) {
    if (committee.category === 'oral') return `oral:${committee.oral_role || 'any'}`
    if (committee.category === 'theory') {
      const track = committee.theory_track
        || ACCESS_ACCOUNTS.find((a) => a.username.toLowerCase() === String(committee.owner_username || '').toLowerCase())?.theoryTrack
        || 'any'
      return `theory:${track}`
    }
    return `${committee.category}:any`
  }

  function applicantCoveredOnTrack(applicantId, coverKey) {
    if (!applicantId || !coverKey) return false
    const examCols = new Set(db.prepare('PRAGMA table_info(exams)').all().map((c) => c.name))
    const deletedClause = examCols.has('deleted_at') ? 'AND e.deleted_at IS NULL' : ''
    const rows = db.prepare(
      `SELECT e.id AS examId, e.category, e.oral_role AS oralRole,
              c.theory_track AS theoryTrack, c.owner_username AS ownerUsername
       FROM exam_roster r
       JOIN exams e ON e.id=r.exam_id
       LEFT JOIN committee_assignments a ON a.exam_id=e.id
       LEFT JOIN committees c ON c.id=a.committee_id
       WHERE r.applicant_id=? ${deletedClause} AND COALESCE(e.active,1) IN (0,1) AND COALESCE(e.question_count,0) > 0`,
    ).all(applicantId)
    for (const row of rows) {
      if (row.category === 'oral') {
        const key = `oral:${row.oralRole || 'any'}`
        if (key === coverKey) return true
        if (coverKey.startsWith('oral:') && oralRolesCompatible(coverKey.slice(5), row.oralRole)) return true
        continue
      }
      if (row.category === 'theory') {
        const track = row.theoryTrack
          || ACCESS_ACCOUNTS.find((a) => a.username.toLowerCase() === String(row.ownerUsername || '').toLowerCase())?.theoryTrack
          || 'any'
        if (`theory:${track}` === coverKey || (coverKey === 'theory:any')) return true
        continue
      }
      if (`${row.category}:any` === coverKey) return true
    }
    return false
  }

  function listCandidates(user, id) {
    authorize(user, id)
    const committee = db.prepare('SELECT * FROM committees WHERE id=?').get(id)
    if (!committee) fail('اللجنة غير موجودة', 404)
    const rows = db.prepare(
      `SELECT applicant_id AS applicantId, assigned_at AS assignedAt, assigned_by AS assignedBy
       FROM committee_candidates WHERE committee_id=? ORDER BY assigned_at DESC`,
    ).all(id)
    if (!rows.length) return { candidates: [], coverKey: coverKeyForCommittee(committee) }
    const ids = rows.map((r) => r.applicantId)
    const applicants = typeof getApplicantsByIds === 'function' ? getApplicantsByIds(ids) : []
    const byId = new Map(applicants.map((a) => [a.id, a]))
    const coverKey = coverKeyForCommittee(committee)
    return {
      coverKey,
      candidates: rows.map((row) => {
        const a = byId.get(row.applicantId)
        const covered = applicantCoveredOnTrack(row.applicantId, coverKey)
        return {
          applicantId: row.applicantId,
          assignedAt: row.assignedAt,
          assignedBy: row.assignedBy,
          name: a?.name || '(محذوف)',
          displayId: a?.displayId || null,
          jobTitle: a ? effectiveJobTitle(a) : '',
          org: a?.org || '',
          interviewType: a?.extra?.['نوع المقابلة'] || '',
          covered,
          missing: !a,
        }
      }),
    }
  }

  const assignCandidates = db.transaction((user, id, body) => {
    user = resolve(user)
    if (user?.role !== 'admin') fail('توزيع المتقدمين على اللجان متاح للمسؤول العام فقط', 403)
    const committee = db.prepare('SELECT * FROM committees WHERE id=?').get(id)
    if (!committee) fail('اللجنة غير موجودة', 404)
    if (!Array.isArray(body?.applicantIds) || !body.applicantIds.length) fail('اختر متقدماً واحداً على الأقل')
    if (body.applicantIds.length > 500) fail('حد التوزيع 500 متقدم في الدفعة')
    if (!['theory', 'oral', 'driving', 'personality'].includes(committee.category || '')) {
      fail('حدّد اختصاص اللجنة قبل توزيع المتقدمين — شكّل اللجنة من حساب الاختصاص أو حدّث تصنيفها')
    }
    const ids = [...new Set(body.applicantIds.map(String))]
    const applicants = typeof getApplicantsByIds === 'function' ? getApplicantsByIds(ids) : []
    if (!applicants.length) fail('لم يُعثر على المتقدمين المحددين')
    const byId = new Map(applicants.map((a) => [a.id, a]))
    const insert = db.prepare(
      `INSERT OR IGNORE INTO committee_candidates(committee_id, applicant_id, assigned_at, assigned_by) VALUES (?,?,?,?)`,
    )
    const now = new Date().toISOString()
    const added = []
    const skipped = []
    for (const applicantId of ids) {
      const applicant = byId.get(applicantId)
      if (!applicant) {
        skipped.push({ id: applicantId, reason: 'المتقدم غير موجود' })
        continue
      }
      const officeOnly = committee.category === 'theory' && (
        committee.theory_track === 'office' ||
        String(committee.owner_username || '').toLowerCase() === 'office'
      )
      const owner = String(committee.owner_username || '').toLowerCase()
      const account = ACCESS_ACCOUNTS.find((item) => item.username.toLowerCase() === owner)
      const laneView = {
        role: 'operator',
        category: committee.category || account?.category,
        oralRole: committee.oral_role || account?.oralRole || null,
        theoryTrack: committee.theory_track || account?.theoryTrack || null,
      }
      if (!candidateVisibleToOperator(laneView, applicant)) {
        skipped.push({
          id: applicantId,
          name: applicant.name,
          reason: assignmentSkipReason(laneView, applicant) || (officeOnly ? 'المسمى لا يخضع للاختبار الكتابي' : 'المسمى خارج مسار هذه اللجنة'),
        })
        continue
      }
      const exists = db.prepare('SELECT 1 AS n FROM committee_candidates WHERE committee_id=? AND applicant_id=?').get(id, applicantId)
      if (exists) {
        skipped.push({ id: applicantId, name: applicant.name, reason: 'مسند مسبقاً لهذه اللجنة' })
        continue
      }
      insert.run(id, applicantId, now, user.username || 'admin')
      added.push({ id: applicantId, name: applicant.name })
    }
    return { ok: true, added, skipped, addedCount: added.length, skippedCount: skipped.length }
  })

  function removeCandidate(user, id, applicantId) {
    user = resolve(user)
    if (user?.role !== 'admin') fail('إزالة المتقدم من قائمة اللجنة متاحة للمسؤول العام فقط', 403)
    const committee = db.prepare('SELECT * FROM committees WHERE id=?').get(id)
    if (!committee) fail('اللجنة غير موجودة', 404)
    const result = db.prepare('DELETE FROM committee_candidates WHERE committee_id=? AND applicant_id=?').run(id, String(applicantId || ''))
    if (!result.changes) fail('المتقدم غير مسند لهذه اللجنة', 404)
    return { ok: true }
  }

  function createExam(user, id, body) {
    user = authorize(user, id, true)
    if (user?.role === 'admin') fail('إنشاء الاختبار من قائمة اللجنة متاح لمدير أو رئيس اللجنة فقط — الأدمن يوزّع المتقدمين فقط', 403)
    if (!jobExams?.create) fail('إنشاء الاختبارات غير متاح', 500)
    if (!getApplicantsByIds) fail('سجل المتقدمين غير متاح', 500)
    const committee = db.prepare('SELECT * FROM committees WHERE id=?').get(id)
    if (!committee) fail('اللجنة غير موجودة', 404)
    if (!['theory', 'oral', 'driving', 'personality'].includes(committee.category || '')) {
      fail('اللجنة بلا اختصاص تقييم؛ لا يمكن إنشاء اختبار منها', 409)
    }
    const isTheory = committee.category === 'theory'
    const evaluationMode = isTheory ? null : committee.category === 'oral' ? 'suggested' : 'qr'
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    if (!title || title.length > 200) fail('عنوان الاختبار مطلوب بحد أقصى 200 حرف')
    const questionCount = Math.max(1, Math.min(100, Number(body?.questionCount) || 20))
    const allowedTypes = ['mcq', 'true_false', 'open', 'oral', 'scale', 'classic']
    let questionTypes = Array.isArray(body?.questionTypes)
      ? [...new Set(body.questionTypes.map(String).filter((t) => allowedTypes.includes(t)))]
      : null
    if (questionTypes === null) {
      if (committee.category === 'oral') questionTypes = ['oral']
      else if (committee.category === 'personality') questionTypes = ['scale']
      else questionTypes = []
    }
    if (committee.category === 'personality' && questionTypes.includes('scale') && questionTypes.some((t) => t !== 'scale')) {
      fail('افصل مقياس السمات عن الأسئلة المعرفية في اختبارين مستقلين')
    }
    const durationRaw = Number(body?.durationMinutes)
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.max(1, Math.min(600, Math.floor(durationRaw)))
      : null

    const poolRows = db.prepare('SELECT applicant_id FROM committee_candidates WHERE committee_id=?').all(id)
    if (!poolRows.length) fail('لا متقدمين مسندين لهذه اللجنة؛ اطلب من المسؤول توزيعهم أولاً')
    const requested = Array.isArray(body?.applicantIds) && body.applicantIds.length
      ? [...new Set(body.applicantIds.map(String))]
      : poolRows.map((r) => r.applicant_id)
    const allowed = new Set(poolRows.map((r) => r.applicant_id))
    const outsider = requested.filter((aid) => !allowed.has(aid))
    if (outsider.length) fail('لا يمكن إدراج متقدمين خارج قائمة اللجنة المسندة')

    const coverKey = coverKeyForCommittee(committee)
    const freshIds = requested.filter((aid) => !applicantCoveredOnTrack(aid, coverKey))
    if (!freshIds.length) fail('كل المتقدمين المحددين لديهم اختبار نشط لنفس المسار بالفعل')

    const applicants = getApplicantsByIds(freshIds)
    if (applicants.length !== freshIds.length) fail('تغير سجل المتقدمين؛ حدّث القائمة')

    const ownerAccount = ACCESS_ACCOUNTS.find((item) => item.username.toLowerCase() === String(committee.owner_username || '').toLowerCase())
    const actingUser = {
      role: 'operator',
      username: user.username || ownerAccount?.username || 'committee',
      label: user.label || user.username,
      category: committee.category,
      oralRole: committee.oral_role || ownerAccount?.oralRole || null,
      theoryTrack: committee.theory_track || ownerAccount?.theoryTrack || null,
    }
    const eligible = applicants.filter((applicant) => candidateVisibleToOperator(actingUser, applicant))
    if (!eligible.length) {
      fail('لا يمكن إنشاء الاختبار: فرز اللجنة لهؤلاء المتقدمين خارج اختصاص هذا الحساب، أو ما زالوا بلا مسمى فرز')
    }

    const includeShared = committee.category === 'driving' || committee.category === 'personality'
    const groups = groupApplicants(eligible).map((g) => {
      const profile = resolveJobProfile(g.jobTitle) || { id: g.profileId || 'unclassified', specialty: 'unclassified' }
      return {
        key: g.key,
        profileId: profile.id || 'unclassified',
        specialty: profile.specialty || 'unclassified',
        jobLevel: 'intermediate',
        difficulty: 'mixed',
        questionCount,
        includeShared,
        skills: [],
        questionTypes,
      }
    })

    const oralRole = committee.category === 'oral'
      ? (canonicalOralRole(committee.oral_role) || committee.oral_role || null)
      : null
    const oralGeneral = committee.category === 'oral' && !oralRole
    const oralBucket = oralRole
      ? (Object.keys(ORAL_BUCKET_META).find((k) => ORAL_BUCKET_META[k].oralRole === oralRole) || null)
      : null

    const created = jobExams.create(actingUser, {
      title,
      category: committee.category,
      evaluationMode: isTheory ? null : evaluationMode,
      applicantIds: eligible.map((applicant) => applicant.id),
      groups,
      skipOralSplit: true,
      forcedOralRole: oralRole,
      allowGeneralOral: oralGeneral,
      oralBucket,
      durationMinutes,
      requireBank: true,
    })
    const item = created.exams?.[0] || created
    const exam = item.exam
    if (!exam?.id) fail('تعذر إنشاء الاختبار')

    if (db.prepare('SELECT id FROM committee_assignments WHERE exam_id=?').get(exam.id)) {
      fail('الاختبار مرتبط بلجنة بالفعل', 409)
    }
    const assignmentId = randomUUID()
    db.prepare('INSERT INTO committee_assignments VALUES (?, ?, ?)').run(assignmentId, id, exam.id)

    const roster = item.roster || []
    const showsBarcode = showsEntryBarcode({
      category: committee.category,
      theoryTrack: resolveExamTheoryTrack({
        category: committee.category,
        theoryTrack: committee.theory_track,
        ownerUsername: committee.owner_username,
      }),
      questionTypes,
      evaluationMode: isTheory ? null : evaluationMode,
    })
    return {
      ok: true,
      assignmentId,
      showsBarcode,
      evaluationMode: isTheory ? null : evaluationMode,
      questionCount,
      questionTypes,
      durationMinutes,
      exam: {
        id: exam.id,
        title: exam.title,
        category: exam.category,
        oralRole: exam.oral_role || null,
        active: !!exam.active,
        capacity: exam.capacity,
        questionCount: exam.question_count,
        showsBarcode,
      },
      roster: roster.map((r) => ({
        id: r.id,
        name: r.name,
        displayId: r.displayId || r.display_id,
        jobTitle: r.jobTitle || r.job_title,
        ...examineeCardInfo(db, {
          applicantId: r.applicantId || r.applicant_id || null,
          name: r.name,
          jobTitle: r.jobTitle || r.job_title || '',
          extra: r.extra || null,
        }),
        qrToken: r.qrToken || r.qr_token || null,
        applicantId: r.applicantId || r.applicant_id || null,
      })),
      warnings: [...new Set([...(created.warnings || []), ...(item.warnings || [])].filter((w) => typeof w === 'string'))],
      skippedCovered: requested.length - freshIds.length,
    }
  }

  function detail(user, id) {
    authorize(user, id)
    const committee = db.prepare('SELECT * FROM committees WHERE id = ?').get(id)
    if (!committee) fail('اللجنة غير موجودة', 404)
    const examCols = new Set(db.prepare('PRAGMA table_info(exams)').all().map((c) => c.name))
    const hasSets = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='exam_question_sets'").get()
    const questionCountSql = examCols.has('question_count') ? 'e.question_count' : '0'
    const emptySql = hasSets
      ? `(SELECT COUNT(*) FROM exam_question_sets s WHERE s.exam_id=e.id AND json_array_length(s.questions_json)=0)`
      : '0'
    const assignments = db.prepare(
      `SELECT a.id, a.exam_id AS examId, e.title, e.category, ${questionCountSql} AS questionCount, e.active,
              ${emptySql} AS emptySets
       FROM committee_assignments a JOIN exams e ON e.id=a.exam_id WHERE a.committee_id=?`,
    ).all(id).map((row) => ({
      ...row,
      active: !!row.active,
      emptySets: Number(row.emptySets) || 0,
      evaluationMode: jobExams?.evaluationMode?.(row.examId) || null,
    }))
    const candidates = listCandidates(user, id)
    return {
      ...committee,
      oralRole: committee.oral_role || null,
      ownerUsername: committee.owner_username || null,
      members: accounts(id),
      assignments,
      candidates: candidates.candidates,
      candidateCoverKey: candidates.coverKey,
    }
  }

  return {
    create, saveMembers, list, detail, assign, assignment, evaluations, score, publish,
    login, loginAsync, resolve, isOwner, activeEvaluator,
    listCandidates, assignCandidates, removeCandidate, createExam,
    ensureOperatorCommittees: () => ensureOperatorCommittees(db),
  }
}

export function attachCommitteeRoutes(app, service, verifyToken, publicAppUrl = '') {
  const requestToken = (req) => (req.headers.authorization || '').replace(/^Bearer /, '') || parseCookies(req.headers.cookie).exam_session || ''
  const endpoint = (fn) => (req, res) => {
    try {
      let user
      try { user = verifyToken(requestToken(req)) }
      catch { return res.status(401).json({ error: 'جلسة غير صالحة' }) }
      user = service.resolve(user)
      res.json(fn(user, req))
    } catch (error) { res.status(error.status || 400).json({ error: error.status ? error.message : 'تعذر حفظ البيانات؛ تحقق من عدم تكرار اسم المستخدم' }) }
  }
  app.get('/api/committees', endpoint((user) => service.list(user)))
  app.post('/api/committees', endpoint((user, req) => service.create(user, req.body || {})))
  app.get('/api/committees/:id', endpoint((user, req) => service.detail(user, req.params.id)))
  app.put('/api/committees/:id/members', endpoint((user, req) => service.saveMembers(user, req.params.id, req.body || {})))
  app.get('/api/committees/:id/candidates', endpoint((user, req) => service.listCandidates(user, req.params.id)))
  app.post('/api/committees/:id/candidates', endpoint((user, req) => service.assignCandidates(user, req.params.id, req.body || {})))
  app.delete('/api/committees/:id/candidates/:applicantId', endpoint((user, req) => service.removeCandidate(user, req.params.id, req.params.applicantId)))
  app.post('/api/committees/:id/exams', endpoint((user, req) => {
    const result = service.createExam(user, req.params.id, req.body || {})
    return { ...result, publicAppUrl: publicAppUrl || process.env.PUBLIC_APP_URL || undefined }
  }))
  app.post('/api/committees/:id/assignments', endpoint((user, req) => service.assign(user, req.params.id, req.body?.examId)))
  app.get('/api/committee-assignments/:id', endpoint((user, req) => service.evaluations(user, req.params.id)))
  app.put('/api/committee-assignments/:id/score', endpoint((user, req) => service.score(user, req.params.id, req.body || {})))
  app.post('/api/committee-assignments/:id/publish', endpoint((user, req) => service.publish(user, req.params.id, req.body || {})))
}

// Express decodes route parameters here, including percent-encoded exam/attempt IDs.
export function attachCommitteeProtection(app, db, verifyToken, allowQr = () => false, allowRetainedDelete = false) {
  function protect(examId, res, next) {
    if (examId && db.prepare('SELECT id FROM committee_assignments WHERE exam_id=?').get(examId)) {
      return res.status(409).json({ error: 'هذا الاختبار مرتبط بلجنة تقييم؛ استخدم صفحة اللجنة لإدخال الدرجات واعتمادها.' })
    }
    next()
  }
  app.use('/api/admin/exams/:id', (req, res, next) => {
    const write = req.method !== 'GET' && (/^\/(manual-result|manual-score|oral-evaluations|attempts)(\/|$)/i.test(req.path) || (!allowRetainedDelete && req.method === 'DELETE' && req.path === '/'))
    if (!write) return next()
    protect(req.params.id, res, next)
  })
  app.use('/api/admin/attempts/:attemptId/modify-result', (req, res, next) => {
    if (req.method !== 'POST') return next()
    let user
    try { user = verifyToken((req.headers.authorization || '').replace(/^Bearer /, '') || parseCookies(req.headers.cookie).exam_session || '') } catch { user = null }
    if (user?.role === 'admin') return next()
    protect(db.prepare('SELECT exam_id FROM attempts WHERE id=?').get(req.params.attemptId)?.exam_id, res, next)
  })
  app.use('/api/exam/submit', (req, res, next) => {
    let user
    try { user = verifyToken((req.headers.authorization || '').replace(/^Bearer /, '') || parseCookies(req.headers.cookie).exam_session || '') } catch { return next() }
    if (allowQr(user)) return next()
    const category = user?.examId ? db.prepare('SELECT category FROM exams WHERE id=?').get(user.examId)?.category : ''
    if (category === 'theory') return next()
    protect(user.examId, res, next)
  })
}
