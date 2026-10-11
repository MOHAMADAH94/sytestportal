import { randomUUID } from 'node:crypto'
import { isObjectiveExam, objectiveScoreReveal, questionTypesFromQuestions } from '../shared/examPresentation.js'
import { scoreAnswers } from './examLogic.js'
import { examDurationMs } from './examDuration.js'
import { resolveJobProfile, JOB_PROFILES } from '../shared/jobProfiles.js'
import { selectQuestionSet, resolveBankPool } from './questionSelection.js'

export const EVALUATION_MODES = ['suggested', 'qr', 'interview', 'manual']
export function weightedQuestionPercent(questions) {
  const approved = questions.filter((q) => q.status === 'approved')
  if (!approved.length) throw new Error('اعتمد سؤالًا واحدًا على الأقل')
  let sum = 0, weights = 0
  for (const q of approved) {
    if (typeof q.grade !== 'number' || !Number.isFinite(q.grade) || q.grade < 0 || q.grade > 10) throw new Error('درجة كل سؤال يجب أن تكون من 0 إلى 10')
    if (typeof q.weight !== 'number' || !Number.isFinite(q.weight) || q.weight <= 0 || q.weight > 1000) throw new Error('وزن السؤال يجب أن يكون موجبًا وبحد أقصى 1000')
    sum += q.grade * q.weight; weights += q.weight
  }
  return Math.round(sum / weights * 1000) / 100
}
export function createEvaluationService(db, { jobExams, committees, assertExamAccess, monitoring, listApplicants = () => [], insertExamRoster, now = () => Date.now() }) {
  db.exec(`CREATE TABLE IF NOT EXISTS evaluation_open_rosters (exam_id TEXT PRIMARY KEY REFERENCES exams(id));
  CREATE TABLE IF NOT EXISTS evaluation_sessions (
    id TEXT PRIMARY KEY, exam_id TEXT NOT NULL REFERENCES exams(id), roster_id TEXT NOT NULL REFERENCES exam_roster(id),
    evaluator_key TEXT NOT NULL, evaluator_label TEXT NOT NULL, evaluator_role TEXT NOT NULL, assignment_id TEXT,
    mode TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, questions_json TEXT NOT NULL,
    percent REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(roster_id,evaluator_key)
  );
  CREATE TABLE IF NOT EXISTS evaluation_session_audit (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES evaluation_sessions(id), actor TEXT NOT NULL,
    action TEXT NOT NULL, occurred_at TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS evaluation_session_checkpoints (
    session_id TEXT PRIMARY KEY REFERENCES evaluation_sessions(id), evaluator_key TEXT NOT NULL,
    base_version INTEGER NOT NULL, questions_json TEXT NOT NULL, editing INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS evaluation_runs (
    roster_id TEXT PRIMARY KEY REFERENCES exam_roster(id), exam_id TEXT NOT NULL REFERENCES exams(id),
    examinee_name TEXT NOT NULL, status TEXT NOT NULL, questions_json TEXT NOT NULL, answers_json TEXT NOT NULL,
    question_index INTEGER NOT NULL, started_at TEXT NOT NULL, deadline_at TEXT NOT NULL, submitted_at TEXT,
    run_kind TEXT NOT NULL DEFAULT 'evaluation', revision INTEGER NOT NULL DEFAULT 0,
    device_id TEXT, submission_key TEXT
  );`)
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
  const key = (user) => user.role.startsWith('committee_') ? String(user.id) : user.role + ':' + user.username
  const stamp = () => new Date(now()).toISOString()
  const assignmentFor = (examId) => db.prepare('SELECT * FROM committee_assignments WHERE exam_id=?').get(examId)
  function openRoster(exam) {
    return ['driving', 'personality'].includes(exam.category) && !jobExams.isJobBased(exam.id) && !assignmentFor(exam.id) &&
      (!db.prepare('SELECT id FROM exam_roster WHERE exam_id=?').get(exam.id) || !!db.prepare('SELECT exam_id FROM evaluation_open_rosters WHERE exam_id=?').get(exam.id))
  }
  function access(user, examId) {
    const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(examId)
    if (!exam) fail('الاختبار غير موجود', 404)
    const assignment = assignmentFor(examId)
    if (assignment) {
      if (user.role?.startsWith('committee_') || user.role === 'operator') committees.assignment(user, assignment.id)
      else if (!['admin', 'commander'].includes(user.role)) fail('الاختبار غير مرتبط بلجنتك', 403)
    } else if (user.role?.startsWith('committee_') || !assertExamAccess(user, exam)) fail('لا صلاحية لهذا الاختبار', 403)
    return { exam, assignment }
  }
  function candidate(user, examId, name) {
    const context = access(user, examId)
    let roster = db.prepare('SELECT * FROM exam_roster WHERE exam_id=? AND name=?').get(examId, name)
    if (!roster && openRoster(context.exam) && insertExamRoster && ['admin', 'operator'].includes(user.role)) {
      const applicant = listApplicants().find((a) => a.name === name)
      if (applicant) {
        db.prepare('INSERT OR IGNORE INTO evaluation_open_rosters VALUES (?)').run(examId)
        insertExamRoster(examId, [applicant])
        db.prepare('UPDATE exams SET capacity=MAX(capacity, (SELECT COUNT(*) FROM exam_roster WHERE exam_id=?)) WHERE id=?').run(examId, examId)
        roster = db.prepare('SELECT * FROM exam_roster WHERE exam_id=? AND name=?').get(examId, name)
      }
    }
    if (!roster) fail('المتقدم غير مسجل في الاختبار', 404)
    return { ...context, roster }
  }
  function raw(id) { const row = db.prepare('SELECT * FROM evaluation_sessions WHERE id=?').get(id); if (!row) fail('جلسة التقييم غير موجودة', 404); return row }
  function finalized(row) {
    return !!db.prepare('SELECT a.id FROM attempts a JOIN exam_roster r ON r.exam_id=a.exam_id AND r.name=a.examinee_name WHERE r.id=?').get(row.roster_id)
  }
  function editable(user, row, version) {
    const { exam } = access(user, row.exam_id)
    if (!exam.active || finalized(row)) fail('التقييم معتمد أو الاختبار متوقف', 409)
    if (row.evaluator_key !== key(user) || user.role === 'commander') fail('يمكنك تعديل تقييمك الشخصي فقط', 403)
    if (row.version !== version) fail('تغير التقييم؛ حدّث الصفحة قبل الحفظ', 409)
  }
  function audit(user, before, after, action) {
    db.prepare('INSERT INTO evaluation_session_audit VALUES (?,?,?,?,?,?,?)').run(randomUUID(), after.id, key(user), action, stamp(), before ? JSON.stringify(before) : null, JSON.stringify(after))
  }
  function view(user, id) {
    const row = raw(id), { assignment } = access(user, row.exam_id)
    if (row.evaluator_key !== key(user) && !['admin', 'commander', 'committee_manager'].includes(user.role) && !committees.isOwner(user, assignment?.committee_id)) fail('تقييم العضو مستقل ولا يظهر لغير المخولين', 403)
    const roster = db.prepare('SELECT * FROM exam_roster WHERE id=?').get(row.roster_id)
    const run = db.prepare('SELECT * FROM evaluation_runs WHERE roster_id=?').get(row.roster_id)
    const currentResult = db.prepare('SELECT score,max_score FROM attempts WHERE exam_id=? AND examinee_name=? ORDER BY finished_at DESC LIMIT 1').get(row.exam_id, roster.name)
    let questions = JSON.parse(row.questions_json)
    if (row.mode === 'qr' && run) {
      const answers = JSON.parse(run.answers_json)
      questions = questions.map((q) => {
        const answer = answers[q.id]
        const autoGrade = q.type === 'scale' && answer !== undefined ? (q.reverse ? 6 - Number(answer) : Number(answer)) * 2 : q.choices && answer !== undefined ? (q.correctAnswer === answer ? 10 : 0) : null
        return { ...q, answer: answer ?? '', autoGrade }
      })
    }
    const checkpoint = row.evaluator_key === key(user)
      ? db.prepare('SELECT * FROM evaluation_session_checkpoints WHERE session_id=? AND evaluator_key=? AND base_version=?').get(id, key(user), row.version)
      : null
    if (checkpoint && !(row.mode === 'qr' && run?.status === 'active')) {
      try { questions = JSON.parse(checkpoint.questions_json) } catch { /* checkpoint invalidated below */ }
    }
    return { ...row, questions, name: roster.name, jobTitle: roster.job_title, finalized: finalized(row),
      currentFinalPercent: currentResult?.max_score > 0 ? currentResult.score / currentResult.max_score * 100 : null,
      isOwner: row.evaluator_key === key(user), committeeId: assignment?.committee_id || null,
      qrToken: row.mode === 'qr' && ['ready', 'scored'].includes(row.status) && !roster.used ? roster.qr_token : null,
      run: run ? { status: run.status, startedAt: run.started_at, deadlineAt: run.deadline_at, questionIndex: run.question_index } : null,
      events: monitoring.list(row.exam_id, roster.name),
      hasCheckpoint: !!checkpoint, checkpointAt: checkpoint?.updated_at || null, checkpointEditing: checkpoint ? !!checkpoint.editing : null,
      history: db.prepare('SELECT actor, action, occurred_at AS occurredAt FROM evaluation_session_audit WHERE session_id=? ORDER BY occurred_at,rowid').all(id),
      questions_json: undefined }
  }
  const checkpoint = db.transaction((user, id, body) => {
    const row = raw(id); editable(user, row, body.version)
    if (!Array.isArray(body.questions) || body.questions.length > 200) fail('صيغة الحفظ التلقائي غير صالحة')
    const run = db.prepare('SELECT status FROM evaluation_runs WHERE roster_id=?').get(row.roster_id)
    if (row.mode === 'qr' && run?.status === 'active') fail('بدأت جلسة QR؛ لا يمكن تعديل الأسئلة أثناء التنفيذ', 409)
    const payload = JSON.stringify(body.questions)
    if (Buffer.byteLength(payload) > 1024 * 1024) fail('حجم مسودة المقابلة يتجاوز الحد المسموح')
    if (body.questions.some((question) => !question || typeof question.id !== 'string' || question.id.length > 200 || typeof question.text !== 'string' || question.text.length > 10000)) fail('تحتوي المسودة على سؤال غير صالح')
    const updatedAt = stamp()
    db.prepare(`INSERT INTO evaluation_session_checkpoints(session_id,evaluator_key,base_version,questions_json,editing,updated_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET evaluator_key=excluded.evaluator_key,
      base_version=excluded.base_version,questions_json=excluded.questions_json,editing=excluded.editing,updated_at=excluded.updated_at`)
      .run(id, key(user), row.version, payload, body.editing ? 1 : 0, updatedAt)
    return { ok: true, checkpointAt: updatedAt }
  })
  function list(user, examId) {
    const { exam, assignment } = access(user, examId)
    const roster = db.prepare('SELECT id,name,job_title AS jobTitle FROM exam_roster WHERE exam_id=? ORDER BY seq_number').all(examId)
    if (openRoster(exam)) for (const applicant of listApplicants()) if (!roster.some((r) => r.name === applicant.name)) roster.push({ id: 'applicant:' + applicant.id, name: applicant.name, jobTitle: applicant.jobTitle })
    const completed = new Set(db.prepare('SELECT examinee_name FROM attempts WHERE exam_id=?').all(examId).map((row) => row.examinee_name))
    for (const person of roster) person.completed = completed.has(person.name)
    const sessions = db.prepare('SELECT id,roster_id,evaluator_key,evaluator_label,mode,status,percent FROM evaluation_sessions WHERE exam_id=?').all(examId)
      .filter((row) => row.evaluator_key === key(user) || ['admin', 'commander', 'committee_manager'].includes(user.role) || committees.isOwner(user, assignment?.committee_id))
    return { exam: { id: exam.id, title: exam.title, category: exam.category, active: !!exam.active, pendingQuestions: !!(jobExams.pendingGroups?.(examId)?.length) },
      assignmentId: assignment?.id, isCommitteeOwner: committees.isOwner(user, assignment?.committee_id),
      defaultMode: jobExams.evaluationMode?.(exam.id) || null, roster, sessions }
  }
  function history(user, id) {
    view(user, id)
    return db.prepare('SELECT actor,action,occurred_at AS occurredAt,before_json,after_json FROM evaluation_session_audit WHERE session_id=? ORDER BY occurred_at,rowid').all(id).map((entry) => {
      const before = entry.before_json ? JSON.parse(entry.before_json) : null, after = JSON.parse(entry.after_json)
      const oldQuestions = before ? JSON.parse(before.questions_json) : [], nextQuestions = JSON.parse(after.questions_json)
      return { actor: entry.actor, action: entry.action, occurredAt: entry.occurredAt, beforeMode: before?.mode, afterMode: after.mode,
        changes: nextQuestions.filter((q) => JSON.stringify(q) !== JSON.stringify(oldQuestions.find((old) => old.id === q.id))).map((q) => ({ before: oldQuestions.find((old) => old.id === q.id) || null, after: q })) }
    })
  }
  const create = db.transaction((user, examId, body) => {
    const { exam, roster, assignment } = candidate(user, examId, body.name)
    if (!['oral', 'driving', 'personality'].includes(exam.category)) fail('الأوضاع الجديدة للشفهي والقيادة والشخصية')
    if (user.role === 'commander' || (assignment && !user.role.startsWith('committee_') && !committees.isOwner(user, assignment.committee_id))) fail('استخدم حساب عضو اللجنة لإجراء تقييم مستقل', 403)
    const configuredMode = jobExams.evaluationMode?.(exam.id) || null
    if (configuredMode && body.mode !== configuredMode) fail('استخدم وضع التنفيذ المحدد عند إنشاء الاختبار')
    const previous = db.prepare('SELECT * FROM evaluation_sessions WHERE roster_id=? AND evaluator_key=?').get(roster.id, key(user))
    if (previous) {
      if (body.mode !== previous.mode) {
        editable(user, previous, previous.version)
        if (!EVALUATION_MODES.includes(body.mode) || previous.status !== 'draft' || roster.used) fail('يمكن تغيير الوضع في المسودة فقط وقبل دخول المتقدم', 409)
        const questions = JSON.parse(previous.questions_json).map((q) => body.mode === 'manual' ? { ...q, status: 'excluded' } : q)
        db.prepare('UPDATE evaluation_sessions SET mode=?,questions_json=?,version=version+1,updated_at=? WHERE id=?').run(body.mode, JSON.stringify(questions), stamp(), previous.id)
        audit(user, previous, raw(previous.id), 'change_mode')
      }
      return view(user, previous.id)
    }
    if (!exam.active || db.prepare('SELECT id FROM attempts WHERE exam_id=? AND examinee_name=?').get(examId, roster.name)) {
      if (!exam.active && jobExams.pendingGroups?.(examId)?.length) {
        fail('الاختبار مسودة بلا أسئلة مكتملة؛ افتح صفحة استكمال الأسئلة وأضف أسئلة لكل مجموعة قبل بدء الجلسة', 409)
      }
      fail('التقييم مكتمل أو الاختبار متوقف', 409)
    }
    if (!assignment && db.prepare('SELECT id FROM evaluation_sessions WHERE roster_id=?').get(roster.id)) fail('بدأ مسؤول آخر تقييم هذا المتقدم', 409)
    if (!EVALUATION_MODES.includes(body.mode)) fail('اختر أحد أوضاع التقييم الأربعة')
    if (roster.used && (!hasSessions(roster.id) || body.mode === 'qr')) fail('دخل المتقدم الاختبار بالفعل؛ لا يمكن إعداد أسئلة QR جديدة', 409)
    if (body.mode === 'qr' && db.prepare('SELECT roster_id FROM evaluation_runs WHERE roster_id=?').get(roster.id)) fail('بدأت جلسة QR؛ لا يمكن إضافة أسئلة أو عضو جديد لهذا الوضع', 409)
    let proposed = []
    if (body.mode !== 'manual') {
      if (jobExams.isJobBased(exam.id)) proposed = jobExams.questionsFor(exam, roster.name)
      if (!proposed.length) {
        const profile = resolveJobProfile(roster.job_title) || JOB_PROFILES.find((p) => p.id === 'unclassified')
        if (profile) {
          const resolved = resolveBankPool(jobExams.bank(), exam.category, {
            profileId: profile.id,
            specialty: profile.specialty,
            jobLevel: 'intermediate',
            difficulty: 'mixed',
            questionCount: 10,
            includeShared: ['driving', 'personality'].includes(exam.category) || profile.id === 'unclassified',
            skills: [],
          })
          if (resolved.pool.length) {
            const requested = Math.max(1, Math.min(100, Number(jobExams.configOf?.(exam.id)?.groups?.[0]?.questionCount) || Number(exam.question_count) || 10))
            proposed = selectQuestionSet(resolved.pool, requested).questions
          }
        }
      }
    }
    const questions = proposed.map((q) => ({ ...q, sourceId: q.id, id: randomUUID(), source: q.source === 'manual_exam' ? 'manual' : 'bank', status: 'proposed', expectedPoints: q.rubric?.map((r) => r.criterion).join('\n') || q.answerKey || '', weight: q.points || 1, grade: null, answer: '' }))
    const id = randomUUID()
    db.prepare("INSERT INTO evaluation_sessions VALUES (?,?,?,?,?,?,?,?, 'draft',1,?,NULL,?,?)").run(id, examId, roster.id, key(user), user.label || user.username, user.role, assignment?.id || null, body.mode, JSON.stringify(questions), stamp(), stamp())
    if (assignment) db.prepare('DELETE FROM committee_scores WHERE assignment_id=? AND examinee_name=? AND account_id=?').run(assignment.id, roster.name, key(user))
    audit(user, null, raw(id), 'create')
    return view(user, id)
  })
  const save = db.transaction((user, id, body) => {
    const row = raw(id); editable(user, row, body.version)
    if (!Array.isArray(body.questions)) fail('صيغة الأسئلة غير صالحة')
    const run = db.prepare('SELECT roster_id FROM evaluation_runs WHERE roster_id=?').get(row.roster_id)
    if (row.mode === 'qr' && (run || db.prepare('SELECT used FROM exam_roster WHERE id=?').get(row.roster_id).used)) fail('بدأ QR؛ أصبحت نسخ الأسئلة ثابتة', 409)
    const previous = JSON.parse(row.questions_json), used = new Set()
    const incoming = body.questions.filter((input) => !(input?.status === 'excluded' && !(typeof input.text === 'string' && input.text.trim())))
    const questions = incoming.map((input) => {
      if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 10000) fail('نص السؤال مطلوب (حتى 10000 حرف)')
      if (!['proposed', 'approved', 'excluded'].includes(input.status)) fail('حالة السؤال غير صالحة')
      if (!Number.isFinite(input.weight) || input.weight <= 0 || input.weight > 1000) fail('وزن السؤال يجب أن يكون موجبًا وبحد أقصى 1000')
      const old = previous.find((q) => q.id === input.id)
      const qid = old?.id || randomUUID()
      if (used.has(qid)) fail('السؤال مكرر'); used.add(qid)
      const text = (value) => typeof value === 'string' ? value.slice(0, 10000) : ''
      return { ...(old || { type: 'open', category: db.prepare('SELECT category FROM exams WHERE id=?').get(row.exam_id).category, source: 'manual' }),
        id: qid, text: input.text.trim(), answerKey: text(input.answerKey), expectedPoints: text(input.expectedPoints),
        rubric: [{ criterion: text(input.criterion || input.rubric?.[0]?.criterion || input.answerKey), maxPoints: 10 }],
        weight: input.weight, points: 10, status: input.status, answer: text(input.answer), grade: null }
    })
    // Deleted proposals and approved questions remain as excluded snapshots in the record.
    for (const old of previous) if (!used.has(old.id)) questions.push({ ...old, status: 'excluded', grade: null })
    const status = body.ready ? 'ready' : 'draft'
    if (body.ready && !questions.some((q) => q.status === 'approved')) fail('اعتمد سؤالًا واحدًا على الأقل')
    db.prepare('UPDATE evaluation_sessions SET questions_json=?, status=?, version=version+1, percent=NULL, updated_at=? WHERE id=?').run(JSON.stringify(questions), status, stamp(), id)
    db.prepare('DELETE FROM evaluation_session_checkpoints WHERE session_id=?').run(id)
    if (row.assignment_id) db.prepare('DELETE FROM committee_scores WHERE assignment_id=? AND examinee_name=(SELECT name FROM exam_roster WHERE id=?) AND account_id=?').run(row.assignment_id, row.roster_id, row.evaluator_key)
    audit(user, row, raw(id), body.ready ? 'approve_questions' : 'edit_draft')
    return view(user, id)
  })
  const grade = db.transaction((user, id, body) => {
    const row = raw(id); editable(user, row, body.version)
    if (!['ready', 'scored'].includes(row.status)) fail('اعتمد الأسئلة قبل التقييم')
    const run = db.prepare('SELECT * FROM evaluation_runs WHERE roster_id=?').get(row.roster_id)
    if (row.mode === 'qr' && (!run || run.status === 'active')) fail('انتظر تسليم المتقدم أو انتهاء جلسة QR')
    if (!Array.isArray(body.grades)) fail('درجات الأسئلة مطلوبة')
    const answers = run ? JSON.parse(run.answers_json) : {}
    const questions = JSON.parse(row.questions_json).map((q) => {
      if (q.status !== 'approved') return q
      const input = body.grades.find((g) => g.id === q.id)
      const answer = row.mode === 'qr' ? answers[q.id] ?? '' : typeof input?.answer === 'string' ? input.answer.slice(0, 10000) : ''
      if (['interview', 'manual'].includes(row.mode) && !String(answer).trim()) fail('دوّن إجابة المتقدم لكل سؤال')
      return { ...q, answer, grade: input?.grade, evaluatedBy: key(user), evaluatedAt: stamp() }
    })
    const percent = weightedQuestionPercent(questions)
    db.prepare("UPDATE evaluation_sessions SET questions_json=?,percent=?,status='scored',version=version+1,updated_at=? WHERE id=?").run(JSON.stringify(questions), percent, stamp(), id)
    db.prepare('DELETE FROM evaluation_session_checkpoints WHERE session_id=?').run(id)
    if (row.assignment_id) {
      const name = db.prepare('SELECT name FROM exam_roster WHERE id=?').get(row.roster_id).name
      committees.score(user, row.assignment_id, { examineeName: name, percent })
    }
    audit(user, row, raw(id), 'grade')
    return view(user, id)
  })
  const publish = db.transaction((user, id, body) => {
    const row = raw(id); editable(user, row, body.version)
    if (row.assignment_id) fail('اعتماد نتيجة اللجنة يتم بعد اكتمال تقييمات أعضائها من صفحة اللجنة')
    if (row.status !== 'scored') fail('احفظ درجات جميع الأسئلة أولًا')
    const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(row.exam_id), roster = db.prepare('SELECT * FROM exam_roster WHERE id=?').get(row.roster_id)
    const percent = weightedQuestionPercent(JSON.parse(row.questions_json)), attemptId = randomUUID()
    const detail = { type: 'evaluation_session', sessionId: id, mode: row.mode, questions: JSON.parse(row.questions_json), evaluator: row.evaluator_label }
    db.prepare('INSERT INTO attempts(id,exam_id,examinee_name,applicant_id,roster_id,answers_json,score,max_score,started_at,finished_at) VALUES (?,?,?,?,?,?,?,100,?,?)').run(attemptId, row.exam_id, roster.name, roster.applicant_id || null, roster.id, JSON.stringify(detail), percent, row.created_at, stamp())
    db.prepare('INSERT INTO assessment_archive(id,category,exam_id,exam_title,oral_role,examinee_name,display_id,org,job_title,rank,score,max_score,percent,detail_json,archived_at,evaluator,applicant_id,attempt_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,100,?,?,?,?,?,?)').run(randomUUID(), exam.category, exam.id, exam.title, exam.oral_role, roster.name, roster.display_id, roster.org, roster.job_title, roster.rank, percent, percent, JSON.stringify(detail), stamp(), user.username, roster.applicant_id || null, attemptId)
    db.prepare("UPDATE evaluation_sessions SET status='published',version=version+1,updated_at=? WHERE id=?").run(stamp(), id)
    db.prepare('DELETE FROM evaluation_session_checkpoints WHERE session_id=?').run(id)
    db.prepare('UPDATE exam_roster SET used=1 WHERE id=?').run(roster.id)
    audit(user, row, raw(id), 'publish')
    return view(user, id)
  })
  const hasSessions = (rosterId) => !!db.prepare('SELECT id FROM evaluation_sessions WHERE roster_id=?').get(rosterId)
  function qrQuestions(rosterId) {
    const sessions = db.prepare("SELECT * FROM evaluation_sessions WHERE roster_id=? AND mode='qr'").all(rosterId)
      .filter((s) => !s.assignment_id || committees.activeEvaluator(db.prepare('SELECT committee_id FROM committee_assignments WHERE id=?').get(s.assignment_id)?.committee_id, s.evaluator_key))
    if (!sessions.length || sessions.some((s) => s.status !== 'ready')) fail('يجب أن يعتمد المشاركون في وضع QR أسئلتهم قبل بدء المتقدم', 409)
    return sessions.flatMap((s) => JSON.parse(s.questions_json).filter((q) => q.status === 'approved').map((q) => ({ ...q, evaluationSessionId: s.id })))
  }
  function qrReady(rosterId) { if (!hasSessions(rosterId)) return false; qrQuestions(rosterId); return true }
  function expireRuns() {
    db.prepare("UPDATE evaluation_runs SET status='submitted',submitted_at=? WHERE status='active' AND run_kind='evaluation' AND deadline_at<=?").run(stamp(), stamp())
  }
  function examinee(user) {
    if (user.role !== 'examinee') fail('صلاحية غير كافية', 403)
    const roster = db.prepare('SELECT * FROM exam_roster WHERE id=? AND exam_id=? AND name=?').get(user.rosterId, user.examId, user.examineeName)
    if (!roster) fail('جلسة المتقدم غير صالحة', 403)
    const exam = db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(user.examId)
    if (!exam) fail('الاختبار متوقف', 409)
    if (db.prepare('SELECT id FROM attempts WHERE exam_id=? AND examinee_name=?').get(exam.id, roster.name)) fail('الاختبار مكتمل', 409)
    return { roster, exam }
  }
  function runView(user) {
    examinee(user)
    expireRuns()
    const run = db.prepare('SELECT * FROM evaluation_runs WHERE roster_id=?').get(user.rosterId)
    if (!run) return { questions: qrQuestions(user.rosterId), run: null }
    return { questions: JSON.parse(run.questions_json), run: { status: run.status, answers: JSON.parse(run.answers_json), questionIndex: run.question_index, startedAt: run.started_at, deadlineAt: run.deadline_at, secondsLeft: Math.max(0, Math.ceil((Date.parse(run.deadline_at) - now()) / 1000)), revision: run.revision || 0 } }
  }
  const startRun = db.transaction((user) => {
    examinee(user)
    const old = db.prepare('SELECT * FROM evaluation_runs WHERE roster_id=?').get(user.rosterId)
    if (!old) {
      const questions = qrQuestions(user.rosterId)
      const exam = db.prepare('SELECT category FROM exams WHERE id=?').get(user.examId)
      const cfg = jobExams.configOf?.(user.examId)
      db.prepare("INSERT INTO evaluation_runs(roster_id,exam_id,examinee_name,status,questions_json,answers_json,question_index,started_at,deadline_at,submitted_at,run_kind,revision) VALUES (?,?,?,'active',?,'{}',0,?,?,NULL,'evaluation',0)").run(user.rosterId, user.examId, user.examineeName, JSON.stringify(questions), stamp(), new Date(now() + examDurationMs(exam.category, questions.length, process.env, {
        durationMinutes: cfg?.durationMinutes,
        secondsPerQuestion: cfg?.secondsPerQuestion,
      })).toISOString())
    }
    return runView(user)
  })
  const progress = db.transaction((user, body, submit = false) => {
    examinee(user)
    const row = db.prepare('SELECT * FROM evaluation_runs WHERE roster_id=?').get(user.rosterId)
    if (!row) fail('ابدأ الاختبار أولًا')
    if (row.status !== 'active') return { ok: true, message: 'سبق استلام إجاباتك، وهي قيد التقييم.' }
    const expired = now() > Date.parse(row.deadline_at)
    const questions = JSON.parse(row.questions_json), answers = body.answers
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) fail('صيغة الإجابات غير صالحة')
    for (const [id, answer] of Object.entries(answers)) {
      const q = questions.find((q) => q.id === id)
      if (!q || (q.choices && !q.choices.some((c) => c.id === answer)) || (q.type === 'scale' && (!Number.isInteger(Number(answer)) || Number(answer) < 1 || Number(answer) > 5)) || (!q.choices && q.type !== 'scale' && (typeof answer !== 'string' || answer.length > 10000))) fail('إجابة خارج الأسئلة المعتمدة أو غير صالحة')
    }
    const expected = Number(body.revision)
    if (Number.isInteger(expected) && expected !== (row.revision || 0)) fail('وصل تحديث أقدم من الحالة المحفوظة؛ أعد تحميل الجلسة', 409)
    const saved = expired ? JSON.parse(row.answers_json) : { ...JSON.parse(row.answers_json), ...answers }
    const index = Math.max(0, Math.min(questions.length - 1, Number.isInteger(body.questionIndex) ? body.questionIndex : row.question_index))
    const finished = submit || expired
    const changed = db.prepare('UPDATE evaluation_runs SET answers_json=?,question_index=?,status=?,submitted_at=?,revision=revision+1 WHERE roster_id=? AND revision=?').run(JSON.stringify(saved), index, finished ? 'submitted' : 'active', finished ? stamp() : null, user.rosterId, row.revision || 0)
    if (changed.changes !== 1) fail('تغيرت الجلسة بالتزامن؛ أعد تحميلها', 409)
    const reveal = finished && isObjectiveExam(questionTypesFromQuestions(questions))
      ? objectiveScoreReveal(questions, scoreAnswers(questions, saved))
      : null
    const message = reveal
      ? `تم استلام إجاباتك. علامتك ${reveal.percent}%.`
      : (expired ? 'انتهى الوقت؛ حُفظت الإجابات التي وصلت ضمن مدة الاختبار للتقييم.' : 'تم استلام إجاباتك للتقييم من المسؤول، ولن تظهر الدرجة للمتقدم.')
    return { ok: true, finished, revision: (row.revision || 0) + 1, message, ...(reveal || {}) }
  })
  return { access, list, view, history, create, checkpoint, save, grade, publish, hasSessions, qrReady, runView, startRun, progress, expireRuns }
}
