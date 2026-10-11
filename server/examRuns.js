import { randomUUID } from 'node:crypto'
import { objectiveScoreReveal } from '../shared/examPresentation.js'
import { examDurationMs } from './examDuration.js'

export function createExamRunService(db, { jobExams, now = () => Date.now() }) {
  db.exec(`CREATE TABLE IF NOT EXISTS evaluation_runs (
    roster_id TEXT PRIMARY KEY REFERENCES exam_roster(id), exam_id TEXT NOT NULL REFERENCES exams(id),
    examinee_name TEXT NOT NULL, status TEXT NOT NULL, questions_json TEXT NOT NULL, answers_json TEXT NOT NULL,
    question_index INTEGER NOT NULL, started_at TEXT NOT NULL, deadline_at TEXT NOT NULL, submitted_at TEXT,
    run_kind TEXT NOT NULL DEFAULT 'standard', revision INTEGER NOT NULL DEFAULT 0, device_id TEXT, submission_key TEXT
  )`)
  const columns = new Set(db.prepare('PRAGMA table_info(evaluation_runs)').all().map((column) => column.name))
  for (const [name, definition] of [
    ['run_kind', "TEXT NOT NULL DEFAULT 'evaluation'"],
    ['revision', 'INTEGER NOT NULL DEFAULT 0'],
    ['device_id', 'TEXT'],
    ['submission_key', 'TEXT'],
  ]) if (!columns.has(name)) db.exec('ALTER TABLE evaluation_runs ADD COLUMN ' + name + ' ' + definition)
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_evaluation_runs_submission ON evaluation_runs(submission_key) WHERE submission_key IS NOT NULL;" +
    "CREATE INDEX IF NOT EXISTS idx_evaluation_runs_exam_status ON evaluation_runs(exam_id,status,deadline_at);")

  const stamp = () => new Date(now()).toISOString()
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
  function context(user) {
    if (user?.role !== 'examinee' || !user.rosterId) fail('جلسة المتقدم غير صالحة', 403)
    const roster = db.prepare('SELECT * FROM exam_roster WHERE id=? AND exam_id=?').get(user.rosterId, user.examId)
    const exam = db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(user.examId)
    if (!roster || !exam || roster.qr_session_id !== user.sessionId) fail('جلسة المتقدم غير صالحة أو الاختبار متوقف', 403)
    return { roster, exam }
  }
  function rowFor(user) { return db.prepare("SELECT * FROM evaluation_runs WHERE roster_id=? AND run_kind='standard'").get(user.rosterId) }
  function publicRun(row) {
    return row ? { id: row.roster_id, status: row.status, answers: JSON.parse(row.answers_json), questionIndex: row.question_index, startedAt: row.started_at, deadlineAt: row.deadline_at, secondsLeft: Math.max(0, Math.ceil((Date.parse(row.deadline_at) - now()) / 1000)), revision: row.revision } : null
  }
  function view(user) {
    const { roster, exam } = context(user)
    const existingAttempt = db.prepare('SELECT id FROM attempts WHERE roster_id=? OR (exam_id=? AND examinee_name=?) ORDER BY finished_at DESC LIMIT 1').get(roster.id, exam.id, roster.name)
    const run = rowFor(user)
    return { questions: run ? JSON.parse(run.questions_json) : jobExams.questionsFor(exam, roster.name, roster.id), run: publicRun(run), completed: !!existingAttempt }
  }
  const start = db.transaction((user, deviceId) => {
    const { roster, exam } = context(user)
    const completed = db.prepare('SELECT id FROM attempts WHERE roster_id=? OR (exam_id=? AND examinee_name=?) LIMIT 1').get(roster.id, exam.id, roster.name)
    if (completed) fail('سبق تسليم هذا الاختبار', 409)
    let run = rowFor(user)
    if (!run) {
      const questions = jobExams.questionsFor(exam, roster.name, roster.id)
      if (!questions.length) fail('الاختبار لا يحتوي أسئلة جاهزة', 409)
      const cfg = jobExams.configOf?.(exam.id)
      const started = stamp(), deadline = new Date(now() + examDurationMs(exam.category, questions.length, process.env, {
        durationMinutes: cfg?.durationMinutes,
        secondsPerQuestion: cfg?.secondsPerQuestion,
      })).toISOString()
      db.prepare("INSERT INTO evaluation_runs(roster_id,exam_id,examinee_name,status,questions_json,answers_json,question_index,started_at,deadline_at,submitted_at,run_kind,revision,device_id) VALUES (?,?,?,'active',?,'{}',0,?,?,NULL,'standard',0,?)")
        .run(roster.id, exam.id, roster.name, JSON.stringify(questions), started, deadline, String(deviceId || roster.qr_device_id || '').slice(0, 120) || null)
      run = rowFor(user)
    }
    return { questions: JSON.parse(run.questions_json), run: publicRun(run) }
  })
  const progress = db.transaction((user, body = {}) => {
    context(user)
    const row = rowFor(user)
    if (!row) fail('ابدأ الاختبار أولًا', 409)
    if (row.status !== 'active') return { ok: true, finished: true, run: publicRun(row), message: 'سبق استلام الإجابات.' }
    const expected = Number(body.revision)
    if (Number.isInteger(expected) && expected !== row.revision) fail('وصل تحديث أقدم من الحالة المحفوظة؛ أعد تحميل الجلسة', 409)
    const questions = JSON.parse(row.questions_json)
    const incoming = body.answers
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) fail('صيغة الإجابات غير صالحة')
    const merged = { ...JSON.parse(row.answers_json), ...incoming }
    jobExams.validateAnswers(db.prepare('SELECT * FROM exams WHERE id=?').get(row.exam_id), questions, merged)
    const expired = now() >= Date.parse(row.deadline_at)
    const index = Math.max(0, Math.min(Math.max(questions.length - 1, 0), Number.isInteger(body.questionIndex) ? body.questionIndex : row.question_index))
    const changed = db.prepare("UPDATE evaluation_runs SET answers_json=?,question_index=?,revision=revision+1 WHERE roster_id=? AND run_kind='standard' AND status='active' AND revision=?")
      .run(JSON.stringify(expired ? JSON.parse(row.answers_json) : merged), index, user.rosterId, row.revision)
    if (changed.changes !== 1) fail('تغيرت الجلسة بالتزامن؛ أعد تحميلها', 409)
    const current = rowFor(user)
    return { ok: true, expired, run: publicRun(current), message: expired ? 'انتهى الوقت؛ لم تُقبل إجابات متأخرة.' : 'حُفظت الإجابات.' }
  })
  const submit = db.transaction((user, body = {}, forced = false, clientIp = null) => {
    const { roster, exam } = context(user)
    const prior = db.prepare('SELECT * FROM attempts WHERE roster_id=? OR (exam_id=? AND examinee_name=?) ORDER BY finished_at DESC LIMIT 1').get(roster.id, exam.id, roster.name)
    if (prior) {
      const savedRun = rowFor(user)
      const savedQuestions = savedRun ? JSON.parse(savedRun.questions_json) : []
      const reveal = objectiveScoreReveal(savedQuestions, { score: prior.score, maxScore: prior.max_score, needsManualReview: prior.evaluation_status === 'pending' })
      return { ok: true, alreadySubmitted: true, attemptId: prior.id, message: reveal ? `سبق استلام إجاباتك. علامتك ${reveal.percent}%.` : 'سبق استلام إجاباتك بنجاح.', ...(reveal || {}) }
    }
    let run = rowFor(user)
    if (!run) { start(user, roster.qr_device_id); run = rowFor(user) }
    const expired = forced || now() >= Date.parse(run.deadline_at)
    const incoming = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {}
    const answers = expired ? JSON.parse(run.answers_json) : { ...JSON.parse(run.answers_json), ...incoming }
    const questions = JSON.parse(run.questions_json)
    jobExams.validateAnswers(exam, questions, answers)
    const scored = jobExams.scoreSubmission(exam, questions, answers)
    const submissionKey = String(body.submissionKey || run.submission_key || randomUUID()).slice(0, 120)
    const id = randomUUID(), finished = stamp()
    const evaluationStatus = scored.evaluationStatus || 'completed'
    const evaluationsJson = scored.evaluations ? JSON.stringify(scored.evaluations) : null
    try {
      db.prepare('INSERT INTO attempts(id,exam_id,examinee_name,applicant_id,roster_id,run_id,submission_key,answers_json,score,max_score,personality_json,started_at,finished_at,evaluation_status,question_evaluations_json,client_ip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, exam.id, roster.name, roster.applicant_id || null, roster.id, roster.id, submissionKey, JSON.stringify(answers), scored.score, scored.maxScore, scored.personality ? JSON.stringify(scored.personality) : null, run.started_at, finished, evaluationStatus, evaluationsJson, clientIp || null)
      if (!scored.needsManualReview || scored.maxScore > 0) {
        const detail = scored.personality ? { type: 'personality', traits: scored.personality.traits, summary: scored.personality.summary } : { type: 'theory', questionCount: questions.length, correctCount: scored.correctCount, objectiveCount: scored.objectiveCount }
        db.prepare('INSERT INTO assessment_archive(id,category,exam_id,exam_title,oral_role,examinee_name,display_id,org,job_title,rank,score,max_score,percent,detail_json,archived_at,evaluator,applicant_id,attempt_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(), exam.category, exam.id, exam.title, exam.oral_role || null, roster.name, roster.display_id || null, roster.org || null, roster.job_title || null, roster.rank || null, scored.score, scored.maxScore, scored.maxScore > 0 ? scored.score / scored.maxScore * 100 : null, JSON.stringify(detail), finished, null, roster.applicant_id || null, id)
      }
      db.prepare("UPDATE evaluation_runs SET answers_json=?,status='submitted',submitted_at=?,submission_key=?,revision=revision+1 WHERE roster_id=? AND run_kind='standard'")
        .run(JSON.stringify(answers), finished, submissionKey, roster.id)
    } catch (error) {
      if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
        const existing = db.prepare('SELECT id FROM attempts WHERE run_id=? OR submission_key=?').get(roster.id, submissionKey)
        if (existing) return { ok: true, alreadySubmitted: true, attemptId: existing.id, message: 'سبق استلام إجاباتك بنجاح.' }
      }
      throw error
    }
    const reveal = objectiveScoreReveal(questions, scored)
    const message = reveal
      ? `تم استلام إجاباتك. علامتك ${reveal.percent}%.`
      : (scored.needsManualReview && scored.maxScore === 0
          ? 'تم استلام إجاباتك للتقييم اليدوي.'
          : (evaluationStatus === 'pending'
              ? 'تم استلام إجاباتك بنجاح، وستُراجع الأسئلة المقالية وتُحدّث نتيجتك النهائية فور تصحيحها.'
              : 'تم استلام إجاباتك بنجاح.'))
    return { ok: true, attemptId: id, evaluationStatus, message, ...(reveal || {}) }
  })
  function expireRuns() {
    const rows = db.prepare("SELECT r.*,x.qr_session_id FROM evaluation_runs r JOIN exam_roster x ON x.id=r.roster_id WHERE r.run_kind='standard' AND r.status='active' AND r.deadline_at<=?").all(stamp())
    for (const row of rows) {
      try { submit({ role: 'examinee', examId: row.exam_id, rosterId: row.roster_id, examineeName: row.examinee_name, sessionId: row.qr_session_id }, {}, true) } catch { /* readiness and logs report failures */ }
    }
  }
  return { view, start, progress, submit, expireRuns }
}
