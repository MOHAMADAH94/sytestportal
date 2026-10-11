import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { JOB_PROFILES, JOB_LEVELS, DIFFICULTIES, groupApplicants, canUseProfile, canonicalOralRole, effectiveJobTitle, resolveJobProfile } from '../shared/jobProfiles.js'
import { applicantAllowsTrack, ORAL_BUCKET_META, resolveOralBucket } from '../shared/evaluationMatrix.js'
import { matchingPool, buildBlueprint, selectQuestions, selectQuestionSet, resolveBankPool, assertQuestionsMatchJob } from './questionSelection.js'
import { scoreAnswers } from './examLogic.js'

export function createJobExamService(db, { getApplicantsByIds, insertExamRoster, bank: initialBank } = {}) {
  const evaluationModes = ['suggested', 'qr', 'interview', 'manual']
  const baseBank = initialBank || JSON.parse(readFileSync(new URL('./question-bank.json', import.meta.url), 'utf8'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_bank_overrides (id TEXT PRIMARY KEY, question_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS job_exam_configs (exam_id TEXT PRIMARY KEY REFERENCES exams(id), settings_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exam_question_sets (
      roster_id TEXT PRIMARY KEY REFERENCES exam_roster(id), exam_id TEXT NOT NULL REFERENCES exams(id),
      applicant_id TEXT NOT NULL, job_title TEXT NOT NULL, profile_id TEXT NOT NULL,
      settings_json TEXT NOT NULL, questions_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_question_sets_exam ON exam_question_sets(exam_id);
    CREATE INDEX IF NOT EXISTS idx_question_sets_applicant ON exam_question_sets(applicant_id);
  `)
  db.exec(`
    UPDATE exam_roster SET applicant_id=(SELECT applicant_id FROM exam_question_sets WHERE roster_id=exam_roster.id)
      WHERE applicant_id IS NULL AND EXISTS (SELECT 1 FROM exam_question_sets WHERE roster_id=exam_roster.id);
    UPDATE exam_roster SET applicant_id=(SELECT id FROM applicants WHERE applicants.name=exam_roster.name LIMIT 1)
      WHERE applicant_id IS NULL AND (SELECT COUNT(*) FROM applicants WHERE applicants.name=exam_roster.name)=1;
    UPDATE attempts SET roster_id=(SELECT id FROM exam_roster WHERE exam_roster.exam_id=attempts.exam_id AND exam_roster.name=attempts.examinee_name LIMIT 1)
      WHERE roster_id IS NULL AND (SELECT COUNT(*) FROM exam_roster WHERE exam_roster.exam_id=attempts.exam_id AND exam_roster.name=attempts.examinee_name)=1;
    UPDATE attempts SET applicant_id=(SELECT applicant_id FROM exam_roster WHERE id=attempts.roster_id)
      WHERE applicant_id IS NULL AND roster_id IS NOT NULL;
  `)
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
  function bank() {
    const rows = new Map(baseBank.map((q) => [q.id, q]))
    for (const row of db.prepare('SELECT * FROM question_bank_overrides').all()) {
      if (row.active) rows.set(row.id, JSON.parse(row.question_json))
      else rows.delete(row.id)
    }
    return [...rows.values()]
  }
  function canViewQuestion(user, q) {
    if (['admin', 'commander'].includes(user?.role)) return true
    if (user?.role !== 'operator' || user.category !== q.category) return false
    return q.isShared === true || q.jobTitles?.some((id) => {
      const profile = JOB_PROFILES.find((p) => p.id === id)
      return profile && canUseProfile(user, profile, q.category)
    })
  }
  function listBank(user) {
    if (!['admin', 'operator'].includes(user?.role)) fail('إنشاء الاختبارات متاح للمسؤول العام وحساب الاختصاص فقط', 403)
    return { questions: bank().filter((q) => canViewQuestion(user, q)), profiles: JOB_PROFILES, jobLevels: JOB_LEVELS, difficulties: DIFFICULTIES }
  }
  function saveQuestion(user, raw) {
    if (!['admin', 'operator'].includes(user?.role)) fail('تعديل البنك متاح للمسؤول وحساب الاختصاص', 403)
    if (!raw || !['theory', 'oral', 'driving', 'personality'].includes(raw.category)) fail('نوع التقييم غير صالح')
    if (!['mcq', 'true_false', 'open', 'oral', 'scale', 'classic'].includes(raw.type)) fail('نوع السؤال غير صالح')
    if (raw.category === 'personality' && !['scale', 'open', 'classic'].includes(raw.type)) fail('اختبار الشخصية يدعم مقياس السمات أو الأسئلة المعرفية المقالية')
    if (!DIFFICULTIES.some((d) => d.id === raw.difficulty)) fail('درجة الصعوبة غير صالحة')
    if (typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > 5000) fail('أدخل نص السؤال بحد أقصى 5000 حرف')
    if (typeof raw.topic !== 'string' || !raw.topic.trim() || typeof raw.skill !== 'string' || !raw.skill.trim()) fail('الموضوع والمهارة مطلوبان')
    if (typeof raw.isShared !== 'boolean') fail('حدد هل السؤال مشترك أم تخصصي')
    if (!Array.isArray(raw.jobLevels) || !raw.jobLevels.length || raw.jobLevels.some((id) => !JOB_LEVELS.some((level) => level.id === id))) fail('حدد المستويات الوظيفية المناسبة')
    if (!Array.isArray(raw.jobTitles)) fail('المسميات الوظيفية يجب أن تكون قائمة')
    if (raw.rubric !== undefined && !Array.isArray(raw.rubric)) fail('معايير التقييم يجب أن تكون قائمة')
    const profiles = JOB_PROFILES.filter((profile) => profile.id !== 'unclassified' && raw.jobTitles.includes(profile.id))
    if (!raw.isShared && (!profiles.length || profiles.length !== new Set(raw.jobTitles).size)) fail('اربط السؤال بمسمى وظيفي مدعوم أو أكثر')
    if (user.role === 'operator' && (raw.isShared || !profiles.every((profile) => canUseProfile(user, profile, raw.category)))) fail('لا يمكنك إضافة سؤال خارج اختصاصك أو تعميمه على جميع المسميات', 403)
    const existing = raw.id ? bank().find((q) => q.id === raw.id) : null
    if (existing && (!canViewQuestion(user, existing) || (user.role === 'operator' && existing.isShared))) fail('لا صلاحية لتعديل هذا السؤال', 403)
    if (!Number.isFinite(raw.points) || raw.points <= 0 || raw.points > 100) fail('درجة السؤال يجب أن تكون أكبر من صفر وبحد أقصى 100')
    if (raw.type === 'mcq' || raw.type === 'true_false') {
      if (!Array.isArray(raw.choices) || raw.choices.length < 2 || raw.choices.length > 6 || raw.choices.some((c) => typeof c.id !== 'string' || !c.id || !c.text?.trim()) || new Set(raw.choices.map((c) => c.id)).size !== raw.choices.length) fail('الخيارات غير صالحة')
      const choiceIds = new Set(raw.choices.map((c) => c.id))
      if (Array.isArray(raw.correctAnswer)) {
        if (!raw.correctAnswer.length || !raw.correctAnswer.every((id) => choiceIds.has(id))) fail('حدد إجابة صحيحة واحدة على الأقل موجودة في الخيارات')
      } else if (!choiceIds.has(raw.correctAnswer)) {
        fail('حدد إجابة صحيحة موجودة في الخيارات')
      }
    }
    if (['open', 'oral', 'classic'].includes(raw.type) && !raw.answerKey?.trim()) fail('الإجابة النموذجية مطلوبة للسؤال المقالي أو الشفهي أو الكلاسيكي')
    if (raw.type === 'scale' && (!raw.trait?.trim() || raw.category !== 'personality')) fail('مقياس السمات مخصص للشخصية ويحتاج اسم السمة')
    const explanation = typeof raw.explanation === 'string' && raw.explanation.trim() ? raw.explanation.trim().slice(0, 2000) : undefined
    const q = { ...raw, id: existing?.id || `custom-${randomUUID()}`, text: raw.text.trim(),
      jobTitles: raw.isShared ? [] : profiles.map((p) => p.id), specialties: raw.isShared ? [] : [...new Set(profiles.map((p) => p.specialty))],
      level: raw.level || 'both', rubric: raw.rubric || [], reverse: !!raw.reverse, explanation }

    const roleSet = new Set(profiles.map((profile) => canonicalOralRole(profile.oralRole)))
    q.role = q.category === 'oral' && roleSet.size === 1 ? [...roleSet][0] : undefined
    if (q.rubric.some((item) => !item.criterion?.trim() || !Number.isFinite(item.maxPoints) || item.maxPoints <= 0)) fail('معايير التقييم غير صالحة')
    if (q.rubric.length && Math.abs(q.rubric.reduce((sum, item) => sum + item.maxPoints, 0) - q.points) > 0.001) fail('مجموع درجات المعايير يجب أن يساوي درجة السؤال')
    db.prepare('INSERT INTO question_bank_overrides VALUES (?, ?, 1) ON CONFLICT(id) DO UPDATE SET question_json=excluded.question_json, active=1').run(q.id, JSON.stringify(q))
    return q
  }
  function deleteQuestion(user, id) {
    const q = bank().find((item) => item.id === id)
    if (!q) fail('السؤال غير موجود', 404)
    if (user.role !== 'admin' && (user.role !== 'operator' || q.isShared || !canViewQuestion(user, q))) fail('لا صلاحية', 403)
    db.prepare('INSERT INTO question_bank_overrides VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET active=0').run(id, JSON.stringify(q))
    return { ok: true }
  }
  function isJobBased(examId) { return !!db.prepare('SELECT exam_id FROM job_exam_configs WHERE exam_id=?').get(examId) }
  function configOf(examId) {
    const row = db.prepare('SELECT settings_json FROM job_exam_configs WHERE exam_id=?').get(examId)
    if (!row) return null
    try {
      return JSON.parse(row.settings_json)
    } catch {
      return null
    }
  }
  function evaluationMode(examId) {
    const mode = configOf(examId)?.evaluationMode
    return evaluationModes.includes(mode) ? mode : null
  }
  function variants(examId) {
    return db.prepare(`SELECT r.id AS rosterId, r.name AS examineeName, s.job_title AS jobTitle, s.profile_id AS profileId, s.settings_json,
      json_array_length(s.questions_json) AS questionCount FROM exam_question_sets s JOIN exam_roster r ON r.id=s.roster_id WHERE s.exam_id=? ORDER BY r.seq_number`).all(examId)
      .map(({ settings_json, ...row }) => ({ ...row, settings: JSON.parse(settings_json) }))
  }
  function questionsFor(exam, examineeName, rosterId) {
    if (!isJobBased(exam.id)) return JSON.parse(exam.questions_json)
    const row = rosterId
      ? db.prepare('SELECT questions_json FROM exam_question_sets WHERE exam_id=? AND roster_id=?').get(exam.id, rosterId)
      : db.prepare('SELECT s.questions_json FROM exam_question_sets s JOIN exam_roster r ON r.id=s.roster_id WHERE s.exam_id=? AND r.name=?').get(exam.id, examineeName || '')
    if (!row) fail('اختر متقدمًا مسجلًا لعرض مجموعة أسئلته المحفوظة', 404)
    return JSON.parse(row.questions_json)
  }
  function history(applicant) {
    const seen = new Set()
    const rows = db.prepare('SELECT questions_json FROM exam_question_sets WHERE applicant_id=?').all(applicant.id)
    for (const row of rows) for (const q of JSON.parse(row.questions_json)) {
      seen.add(q.id)
      if (q.sourceId) seen.add(q.sourceId)
    }
    const attempts = db.prepare('SELECT a.answers_json, e.question_ids FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.examinee_name=? AND NOT EXISTS (SELECT 1 FROM job_exam_configs c WHERE c.exam_id=e.id)').all(applicant.name)
    for (const row of attempts) {
      const answers = JSON.parse(row.answers_json || '{}')
      Object.keys(answers).forEach((id) => seen.add(id))
      for (const q of answers.oralEvaluation || []) if (q.id) seen.add(q.id)
      for (const id of JSON.parse(row.question_ids || '[]')) seen.add(id)
    }
    return seen
  }
  function prepare(user, body) {
    if (!['admin', 'operator'].includes(user?.role)) fail('صلاحية غير كافية', 403)
    if (!['theory', 'oral', 'driving', 'personality'].includes(body.category)) fail('نوع تقييم غير صالح')
    if (body.category === 'theory' && body.evaluationMode != null) fail('أوضاع التنفيذ الأربعة مخصصة للشفهي والقيادة والشخصية')
    if (body.category !== 'theory' && !evaluationModes.includes(body.evaluationMode)) fail('اختر وضع تنفيذ صالحًا')
    if (user.role === 'operator' && body.category !== user.category) fail('النوع خارج اختصاص حسابك', 403)
    if (!Array.isArray(body.applicantIds) || !body.applicantIds.length || body.applicantIds.length > 500 || body.applicantIds.some((id) => typeof id !== 'string')) fail('اختر من 1 إلى 500 متقدم')
    const ids = [...new Set(body.applicantIds)]
    const applicants = getApplicantsByIds(ids)
    if (applicants.length !== ids.length) fail('تغير سجل المتقدمين؛ أعد اختيارهم')
    if (!Array.isArray(body.groups)) fail('إعدادات المسميات الوظيفية مطلوبة')
    const grouped = groupApplicants(applicants)
    if (body.groups.length !== grouped.length || new Set(body.groups.map((g) => g.key)).size !== grouped.length) fail('إعدادات المجموعة لا تطابق المسميات المحددة')
    const allQuestions = bank()
    return grouped.map((group) => {
      const effectiveTitle = group.jobTitle || 'مسمى غير مسجل'
      const config = body.groups.find((item) => item.key === group.key)
      if (!config) fail(`إعدادات المسمى ${effectiveTitle} مفقودة`)
      if (body.category === 'personality' && config.questionTypes?.includes('scale') && config.questionTypes.some((type) => type !== 'scale')) {
        fail('افصل مقياس السمات عن الأسئلة المعرفية في اختبارين مستقلين لضمان صحة النتيجة')
      }
      if (group.profileId && config.profileId !== group.profileId) fail(`تصنيف ${effectiveTitle} لا يطابق مسماه المسجل`)
      const profile = JOB_PROFILES.find((item) => item.id === config.profileId)
      if (!profile || !canUseProfile(user, profile, body.category)) fail(`المسمى ${effectiveTitle} غير مدعوم أو خارج صلاحية الحساب`, 403)
      let effectiveConfig = { ...config }
      let pool = matchingPool(allQuestions, body.category, effectiveConfig)
      // Behavioral categories may top up with shared; theory/oral stay specialty-only at create time.
      if (!pool.length && effectiveConfig.includeShared === false && profile.id !== 'unclassified' && ['driving', 'personality'].includes(body.category)) {
        effectiveConfig = { ...effectiveConfig, includeShared: true, includeSharedAuto: true }
        pool = matchingPool(allQuestions, body.category, effectiveConfig)
      }
      const candidates = applicants.filter((applicant) => group.applicantIds.includes(applicant.id)).map((applicant) => ({ applicant, seen: history(applicant) }))
      return { ...group, config: effectiveConfig, profile, pool, candidates }
    })
  }
  function preview(user, body) {
    const bankOptional = body.category !== 'theory' && ['interview', 'manual'].includes(body.evaluationMode)
    const groups = prepare(user, body).map((group) => {
      const enough = group.pool.length >= group.config.questionCount
      return { key: group.key, jobTitle: group.jobTitle, applicantCount: group.candidates.length, available: group.pool.length,
        requested: group.config.questionCount, enough, minFresh: Math.min(...group.candidates.map(({ seen }) => group.pool.filter((q) => !seen.has(q.id)).length)),
        actual: body.evaluationMode === 'manual' ? 0 : (group.pool.length ? group.config.questionCount : 0),
        pending: !bankOptional && group.pool.length === 0, bankRequired: !bankOptional,
        blueprint: body.evaluationMode === 'manual' || !group.pool.length ? [] : buildBlueprint(group.pool, Math.min(group.pool.length, group.config.questionCount)),
        error: enough ? null : bankOptional
          ? `بنك ${group.jobTitle} غير كافٍ، لكن يمكن للمقيم إدخال أسئلته أثناء المقابلة دون إيقاف الاختبار.`
          : group.pool.length ? `سيُنشأ اختبار ${group.jobTitle} بالعدد المطلوب (${group.config.questionCount}) مع إعادة استخدام الأسئلة عند الحاجة.` : `سيُحفظ ${group.jobTitle} دون أسئلة كمسودة، ويُستكمل قبل فتح الدخول.` }
    })
    return { groups, canCreate: true, draftRequired: groups.some((group) => group.pending),
      shortages: groups.filter((group) => !group.enough).map((group) => ({ jobTitle: group.jobTitle, available: group.available, requested: group.requested })),
      suggestedModes: body.category !== 'theory' && groups.some((group) => !group.enough) ? ['interview', 'manual'] : [],
      evaluationMode: body.category === 'theory' ? null : body.evaluationMode || 'suggested' }
  }
  const createOne = db.transaction((user, body) => {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) fail('عنوان الاختبار مطلوب بحد أقصى 200 حرف')
    const groups = prepare(user, body)
    if (body.requireBank) {
      const missing = [...new Set(groups.filter((group) => !group.pool.length).map((group) => group.jobTitle))]
      if (missing.length) fail(`لا توجد أسئلة مناسبة في البنك لـ: ${missing.join('، ')}`)
    }
    const bankOptional = !body.requireBank && body.category !== 'theory' && ['interview', 'manual'].includes(body.evaluationMode)
    const variantsToSave = [], usage = new Map(), warnings = []
    for (const group of groups) {
      const requestedCount = body.requireBank ? group.config.questionCount : (body.evaluationMode === 'manual' ? 0 : group.config.questionCount)
      const actualQuestionCount = group.pool.length ? requestedCount : 0
      if (body.evaluationMode === 'manual') warnings.push(`${group.jobTitle}: الوضع اليدوي لا يستخدم بنك الأسئلة؛ يُدخل المقيم أسئلته أثناء الجلسة.`)
      else if (!group.pool.length) warnings.push(`${group.jobTitle}: لا أسئلة في البنك — استكمل أسئلة هذه المجموعة لفتح الاختبار.${bankOptional ? ' يمكن للمقيم إضافة أسئلته أثناء المقابلة المباشرة.' : ''}`)
      else if (group.pool.length < requestedCount) warnings.push(`${group.jobTitle}: البنك فيه ${group.pool.length} سؤالاً والمطلوب ${requestedCount} — سيُعاد استخدام الأسئلة ليصل العدد المطلوب لكل متقدم.`)
      for (const { applicant, seen } of group.candidates) {
        const selection = selectQuestionSet(group.pool, actualQuestionCount, seen, usage)
        variantsToSave.push({ applicant, questions: selection.questions, settings: { ...group.config, blueprint: selection.questions.length ? buildBlueprint(group.pool, Math.min(group.pool.length, actualQuestionCount)) : [], actualQuestionCount: selection.questions.length, requiresQuestions: !bankOptional && actualQuestionCount === 0, reusedCount: selection.reusedCount, padded: !!selection.padded }, profile: group.profile })
        if (selection.reusedCount) warnings.push(`${applicant.name}: أُعيد استخدام ${selection.reusedCount} سؤال للحفاظ على العدد المطلوب.`)
        if (selection.padded) warnings.push(`${applicant.name}: أُكمل العدد بإعادة تدوير أسئلة البنك (${selection.questions.length}/${requestedCount}).`)
      }
    }
    const examId = `exam-${randomUUID()}`, now = new Date().toISOString()
    const ready = bankOptional || variantsToSave.every((variant) => variant.questions.length > 0)
    const level = groups.every((group) => group.profile.level === 'technician') ? 'technician' : 'engineer'
    const ids = [...new Set(variantsToSave.flatMap((variant) => variant.questions.map((q) => q.id)))]
    // شفهي: حدّد الدور من تصنيف المسمى الفعلي (فني/برمجة/شبكات) لا من ملف المجموعة فقط
    const applicantOralRoles = [...new Set(
      variantsToSave.map((variant) => {
        const bucket = resolveOralBucket(variant.applicant) || 'technician'
        return ORAL_BUCKET_META[bucket]?.oralRole || 'technician'
      }),
    )]
    const forcedOralRole = body.forcedOralRole
      || (body.category === 'oral' && !body.allowGeneralOral && applicantOralRoles.length === 1 ? applicantOralRoles[0] : null)
    if (body.category === 'oral' && !forcedOralRole && !body.allowGeneralOral) {
      fail('اختبار الشفهي يجب أن يكون لتخصص واحد: فني أو برمجة ونظم أو شبكات — أو شفهي عام من لجنة عامة')
    }
    if (body.category === 'oral' && forcedOralRole) {
      const mismatched = variantsToSave.filter((variant) => {
        const bucket = resolveOralBucket(variant.applicant) || 'technician'
        return (ORAL_BUCKET_META[bucket]?.oralRole || 'technician') !== forcedOralRole
      })
      if (mismatched.length) {
        const sample = mismatched.slice(0, 5).map((v) => effectiveJobTitle(v.applicant) || v.applicant.jobTitle || v.applicant.name).join('، ')
        fail(`لا يمكن خلط تخصصات الشفهي في اختبار واحد. أسماء خارج التخصص: ${sample}`)
      }
    }
    db.prepare(`INSERT INTO exams(id,title,category,level,oral_role,capacity,question_count,username,password_hash,password_plain,question_ids,questions_json,created_by,created_at,active)
      VALUES (?,?,?,?,?,?,?,?,'','',?,'[]',?,?,?)`).run(examId, body.title.trim(), body.category, level, body.category === 'oral' ? forcedOralRole : null,
      variantsToSave.length, Math.max(...variantsToSave.map((variant) => variant.questions.length)), `internal_${randomUUID()}`, JSON.stringify(ids), user.username, now, ready ? 1 : 0)
    db.prepare('INSERT INTO job_exam_configs VALUES (?, ?)').run(examId, JSON.stringify({
      version: 1, titleSource: 'jobTitle',
      evaluationMode: body.category === 'theory' ? null : body.evaluationMode || 'suggested',
      groups: groups.map((group) => group.config),
      oralBucket: body.oralBucket || null,
      durationMinutes: Number.isFinite(Number(body.durationMinutes)) && Number(body.durationMinutes) > 0
        ? Math.max(1, Math.min(600, Math.floor(Number(body.durationMinutes))))
        : null,
      secondsPerQuestion: Number.isFinite(Number(body.secondsPerQuestion)) && Number(body.secondsPerQuestion) > 0
        ? Math.max(30, Math.min(1800, Math.floor(Number(body.secondsPerQuestion))))
        : null,
    }))
    const roster = insertExamRoster(examId, variantsToSave.map(({ applicant }) => applicant))
    for (const variant of variantsToSave) {
      const byApplicant = roster.find((item) => item.applicantId === variant.applicant.id)
      const sameName = roster.filter((item) => item.name === variant.applicant.name)
      const row = byApplicant || (sameName.length === 1 ? sameName[0] : null)
      if (!row) fail('تعذر حفظ مجموعة المتقدم')
      db.prepare('INSERT INTO exam_question_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(row.id, examId, variant.applicant.id,
        effectiveJobTitle(variant.applicant) || variant.applicant.jobTitle || '', variant.profile.id, JSON.stringify(variant.settings), JSON.stringify(variant.questions), now)
    }
    return { exam: db.prepare('SELECT * FROM exams WHERE id=?').get(examId), roster, warnings }
  })

  function partitionOralBuckets(applicants, groups) {
    const buckets = new Map()
    for (const applicant of applicants) {
      const bucketKey = resolveOralBucket(applicant) || 'technician'
      const meta = ORAL_BUCKET_META[bucketKey] || ORAL_BUCKET_META.technician
      // اختصارات المصفوفة: لا تُدرج من صنفهم لا يسمح بمسار هذا الفرع (مثل الخدمية بلا شفهي تخصصي)
      if (meta.trackId && effectiveJobTitle(applicant) && !applicantAllowsTrack(applicant, meta.trackId)) continue
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, { key: bucketKey, applicants: [] })
      buckets.get(bucketKey).applicants.push(applicant)
    }
    return [...buckets.entries()].map(([bucketKey, bucket]) => {
      const grouped = groupApplicants(bucket.applicants)
      const rebuiltGroups = grouped.map((g) => {
        const fromBody = (groups || []).find((item) => item.key === g.key)
          || (groups || []).find((item) => item.profileId && item.profileId === g.profileId)
        const profile = JOB_PROFILES.find((p) => p.id === (g.profileId || fromBody?.profileId || 'unclassified'))
          || JOB_PROFILES.find((p) => p.id === 'unclassified')
        return {
          key: g.key,
          profileId: profile.id,
          specialty: fromBody?.specialty || profile.specialty,
          jobLevel: fromBody?.jobLevel || 'intermediate',
          difficulty: fromBody?.difficulty || 'mixed',
          questionCount: fromBody?.questionCount || 20,
          includeShared: fromBody?.includeShared || false,
          skills: fromBody?.skills || [],
          questionTypes: fromBody?.questionTypes || [],
        }
      })
      return {
        key: bucketKey,
        meta: ORAL_BUCKET_META[bucketKey] || ORAL_BUCKET_META.technician,
        applicantIds: bucket.applicants.map((a) => a.id),
        groups: rebuiltGroups,
      }
    }).filter((b) => b.applicantIds.length)
  }

  function filterApplicantsForTrack(applicants, trackId) {
    return applicants.filter((applicant) => applicantAllowsTrack(applicant, trackId))
  }

  function rebuildGroupsForApplicants(applicants, groups) {
    const grouped = groupApplicants(applicants)
    return grouped.map((g) => {
      const fromBody = (groups || []).find((item) => item.key === g.key)
        || (groups || []).find((item) => item.profileId && item.profileId === g.profileId)
        || (groups || [])[0]
      const profile = JOB_PROFILES.find((p) => p.id === (g.profileId || fromBody?.profileId || 'unclassified'))
        || JOB_PROFILES.find((p) => p.id === 'unclassified')
      return {
        key: g.key,
        profileId: profile.id,
        specialty: fromBody?.specialty || profile.specialty,
        jobLevel: fromBody?.jobLevel || 'intermediate',
        difficulty: fromBody?.difficulty || 'mixed',
        questionCount: fromBody?.questionCount || 20,
        includeShared: fromBody?.includeShared || false,
        skills: fromBody?.skills || [],
        questionTypes: fromBody?.questionTypes || [],
      }
    })
  }

  function create(user, body) {
    if (body.category !== 'oral' || body.skipOralSplit) {
      const result = createOne(user, body)
      return { ...result, exams: [result] }
    }
    const ids = [...new Set(body.applicantIds || [])]
    const applicants = getApplicantsByIds(ids)
    if (applicants.length !== ids.length) fail('تغير سجل المتقدمين؛ أعد اختيارهم')
    const buckets = partitionOralBuckets(applicants, body.groups)
    if (!buckets.length) fail('لا يوجد متقدمون صالحون لاختبار شفهي حسب التخصص')
    const exams = buckets.map((bucket) => {
      const titleBase = String(body.title || '').trim()
      const titled = buckets.length === 1
        ? titleBase
        : `${titleBase} — ${bucket.meta.label}`
      return {
        oralBucket: bucket.key,
        ...createOne(user, {
          ...body,
          title: titled,
          applicantIds: bucket.applicantIds,
          groups: bucket.groups,
          forcedOralRole: bucket.meta.oralRole,
          oralBucket: bucket.key,
          skipOralSplit: true,
        }),
      }
    })
    const warnings = exams.flatMap((item) => item.warnings || [])
    if (exams.length > 1) {
      warnings.unshift(`فُصل الشفهي إلى ${exams.length} اختبارات حسب التخصص (فني / برمجة ونظم / شبكات) ليرتبط كل اختبار بحسابه.`)
    }
    return { exam: exams[0].exam, roster: exams[0].roster, warnings, exams }
  }

  function previewOralSplit(user, body) {
    const ids = [...new Set(body.applicantIds || [])]
    const applicants = getApplicantsByIds(ids)
    if (applicants.length !== ids.length) fail('تغير سجل المتقدمين؛ أعد اختيارهم')
    const buckets = partitionOralBuckets(applicants, body.groups)
    const parts = buckets.map((bucket) => ({
      oralBucket: bucket.key,
      oralLabel: bucket.meta.label,
      accountHint: bucket.meta.accountHint,
      ...preview(user, {
        ...body,
        applicantIds: bucket.applicantIds,
        groups: bucket.groups,
      }),
    }))
    return {
      splitOral: true,
      parts,
      groups: parts.flatMap((p) => p.groups),
      canCreate: parts.every((p) => p.canCreate),
      draftRequired: parts.some((p) => p.draftRequired),
      shortages: parts.flatMap((p) => (p.shortages || []).map((row) => ({ ...row, oralBucket: p.oralBucket, oralLabel: p.oralLabel }))),
      suggestedModes: parts.find((p) => p.suggestedModes?.length)?.suggestedModes || [],
      evaluationMode: body.evaluationMode || 'suggested',
    }
  }

  const originalPreview = preview
  function previewWithOralSplit(user, body) {
    if (body.category === 'oral' && !body.skipOralSplit) return previewOralSplit(user, body)
    return originalPreview(user, body)
  }
  function validateAnswers(exam, questions, answers) {
    if (!isJobBased(exam.id)) return
    if (!questions.length) fail('الاختبار مسودة دون أسئلة؛ استكمل المحتوى قبل التقييم', 409)
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) fail('صيغة الإجابات غير صالحة')
    for (const [id, answer] of Object.entries(answers)) {
      const q = questions.find((item) => item.id === id)
      if (!q) fail('توجد إجابة لسؤال خارج مجموعة المتقدم')
      if (q.choices) {
        if (Array.isArray(answer)) {
          if (!answer.length || !answer.every((ans) => q.choices.some((choice) => choice.id === ans))) fail('إجابة غير صالحة لأحد الأسئلة')
        } else if (!q.choices.some((choice) => choice.id === answer)) {
          fail('إجابة غير صالحة لأحد الأسئلة')
        }
      }
      if (q.type === 'scale' && (!Number.isInteger(Number(answer)) || Number(answer) < 1 || Number(answer) > 5)) fail('إجابة المقياس يجب أن تكون من 1 إلى 5')
      if (['open', 'oral', 'classic'].includes(q.type) && (typeof answer !== 'string' || answer.length > 10000)) fail('الإجابة النصية غير صالحة')

    }
  }
  function scoreSubmission(exam, questions, answers) {
    const scored = scoreAnswers(questions, answers)
    // A partial objective score must not become a final applicant result before written answers are reviewed.
    return isJobBased(exam.id) && scored.needsManualReview ? { ...scored, score: 0, maxScore: 0 } : scored
  }
  function pendingGroups(examId) {
    if (['interview', 'manual'].includes(evaluationMode(examId))) return []
    const exam = db.prepare('SELECT category FROM exams WHERE id=?').get(examId)
    const allQuestions = bank()
    return db.prepare('SELECT settings_json,job_title,profile_id,questions_json FROM exam_question_sets WHERE exam_id=?').all(examId)
      .filter((row) => JSON.parse(row.questions_json).length === 0)
      .reduce((groups, row) => {
        const config = JSON.parse(row.settings_json)
        const group = groups.find((g) => g.key === config.key)
        if (group) group.applicantCount++
        else {
          let availableFromBank = 0
          try {
            availableFromBank = resolveBankPool(allQuestions, exam.category, config).pool.length
          } catch { availableFromBank = 0 }
          groups.push({
            key: config.key,
            jobTitle: row.job_title,
            profileId: row.profile_id,
            requested: config.questionCount,
            applicantCount: 1,
            availableFromBank,
          })
        }
        return groups
      }, [])
  }
  function assertReady(exam) {
    if (isJobBased(exam.id) && pendingGroups(exam.id).length) fail('استكمل أسئلة المجموعات الفارغة قبل تفعيل الاختبار أو اعتماد النتائج', 409)
  }
  function applyBankQuestions(user, exam, rows, config, pool, savedConfig) {
    const count = Math.max(1, Math.min(100, Number(savedConfig.questionCount || config.questionCount) || 20))
    const usage = new Map()
    const profile = JOB_PROFILES.find((p) => p.id === rows[0].profile_id)
    for (const row of rows) {
      const seen = history({ id: row.applicant_id, name: db.prepare('SELECT name FROM exam_roster WHERE id=?').get(row.roster_id).name })
      const selection = selectQuestionSet(pool, count, seen, usage)
      if (profile) {
        assertQuestionsMatchJob(selection.questions, profile.id, profile.specialty, {
          allowShared: savedConfig.includeShared === true || profile.id === 'unclassified',
        })
      }
      db.prepare('UPDATE exam_question_sets SET questions_json=?,settings_json=? WHERE roster_id=?').run(
        JSON.stringify(selection.questions),
        JSON.stringify({
          ...savedConfig,
          blueprint: pool.length ? buildBlueprint(pool, Math.min(pool.length, count)) : [],
          actualQuestionCount: selection.questions.length,
          requiresQuestions: false,
          completedBy: user.username,
          completedAt: new Date().toISOString(),
          completionSource: 'bank',
          padded: !!selection.padded,
        }),
        row.roster_id,
      )
    }
  }
  function refreshExamReadiness(examId) {
    const sets = db.prepare('SELECT questions_json FROM exam_question_sets WHERE exam_id=?').all(examId).map((r) => JSON.parse(r.questions_json))
    const mode = evaluationMode(examId)
    const bankOptional = ['interview', 'manual'].includes(mode)
    const ready = bankOptional || sets.every((qs) => qs.length > 0)
    const questionCount = sets.length ? Math.max(0, ...sets.map((qs) => qs.length)) : 0
    db.prepare('UPDATE exams SET question_count=?,question_ids=?,active=? WHERE id=?').run(
      questionCount,
      JSON.stringify([...new Set(sets.flatMap((qs) => qs.map((q) => q.id)))]),
      ready ? 1 : 0,
      examId,
    )
    return { ready, pendingGroups: pendingGroups(examId) }
  }
  function adoptBankQuestions(user, exam, body) {
    const sets = db.prepare('SELECT * FROM exam_question_sets WHERE exam_id=?').all(exam.id)
    const empty = sets.filter((row) => JSON.parse(row.questions_json).length === 0)
    if (!empty.length) fail('كل مجموعات هذا الاختبار فيها أسئلة بالفعل')
    const questionCount = Math.max(1, Math.min(100, Number(body?.questionCount) || 20))
    const allowedTypes = ['mcq', 'true_false', 'open', 'oral', 'scale', 'classic']
    const questionTypes = Array.isArray(body?.questionTypes)
      ? [...new Set(body.questionTypes.map(String).filter((t) => allowedTypes.includes(t)))]
      : null
    const durationRaw = Number(body?.durationMinutes)
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.max(1, Math.min(600, Math.floor(durationRaw)))
      : null
    const current = configOf(exam.id) || { version: 1, groups: [] }
    let nextMode = evaluationMode(exam.id)
    if (exam.category !== 'theory' && (!nextMode || nextMode === 'manual')) {
      const requested = body?.evaluationMode
      nextMode = ['suggested', 'qr', 'interview'].includes(requested) ? requested : 'suggested'
    }
    const nextConfig = {
      ...current,
      evaluationMode: exam.category === 'theory' ? null : nextMode,
      durationMinutes: durationMinutes || current.durationMinutes || null,
      groups: (current.groups || []).map((group) => ({
        ...group,
        questionCount,
        ...(questionTypes ? { questionTypes } : {}),
      })),
    }
    db.prepare('UPDATE job_exam_configs SET settings_json=? WHERE exam_id=?').run(JSON.stringify(nextConfig), exam.id)
    const byKey = new Map()
    for (const row of empty) {
      const saved = JSON.parse(row.settings_json)
      const nextSaved = {
        ...saved,
        questionCount,
        ...(questionTypes ? { questionTypes } : {}),
      }
      db.prepare('UPDATE exam_question_sets SET settings_json=? WHERE roster_id=?').run(JSON.stringify(nextSaved), row.roster_id)
      const key = saved.key
      if (!byKey.has(key)) byKey.set(key, { key, jobTitle: row.job_title, rows: [], saved: nextSaved })
      byKey.get(key).rows.push({ ...row, settings_json: JSON.stringify(nextSaved) })
    }
    let filled = 0
    const failures = []
    for (const group of byKey.values()) {
      const profile = JOB_PROFILES.find((p) => p.id === group.rows[0].profile_id)
      if (!profile || !canUseProfile(user, profile, exam.category)) {
        failures.push(`${group.jobTitle}: خارج صلاحية الحساب`)
        continue
      }
      const resolved = resolveBankPool(bank(), exam.category, group.saved)
      if (!resolved.pool.length) {
        failures.push(`${group.jobTitle}: لا توجد أسئلة مناسبة في البنك`)
        continue
      }
      applyBankQuestions(user, exam, group.rows, group.saved, resolved.pool, { ...resolved.config, questionCount })
      filled++
    }
    const status = refreshExamReadiness(exam.id)
    if (!filled && failures.length) fail(failures.join('؛ '))
    return { ok: true, filled, failures, evaluationMode: exam.category === 'theory' ? null : nextMode, questionCount, ...status }
  }
  const completeGroup = db.transaction((user, exam, body) => {
    if (!['admin','operator'].includes(user?.role) || (user.role === 'operator' && user.category !== exam.category)) fail('لا صلاحية لاستكمال الأسئلة', 403)
    if (exam.deleted_at) fail('الاختبار محذوف ومحفوظ للأرشيف فقط', 409)
    if (db.prepare('SELECT id FROM attempts WHERE exam_id=?').get(exam.id) || db.prepare('SELECT id FROM exam_roster WHERE exam_id=? AND used=1').get(exam.id)) fail('بدأ الاختبار؛ لا يمكن تغيير مجموعاته', 409)
    if (db.prepare("SELECT name FROM sqlite_master WHERE name='evaluation_sessions'").get() && db.prepare('SELECT id FROM evaluation_sessions WHERE exam_id=?').get(exam.id)) fail('بدأت جلسات التقييم؛ لا يمكن تغيير الأسئلة', 409)
    if (body.source === 'adopt-bank') return adoptBankQuestions(user, exam, body)
    if (body.all === true || body.source === 'bank-all') {
      const groups = pendingGroups(exam.id)
      if (!groups.length) return { ok: true, filled: 0, ...refreshExamReadiness(exam.id) }
      let filled = 0
      const failures = []
      for (const group of groups) {
        const rows = db.prepare('SELECT * FROM exam_question_sets WHERE exam_id=?').all(exam.id).filter((row) => JSON.parse(row.settings_json).key === group.key)
        if (!rows.length || rows.some((row) => JSON.parse(row.questions_json).length > 0)) continue
        const config = JSON.parse(rows[0].settings_json)
        const profile = JOB_PROFILES.find((p) => p.id === rows[0].profile_id)
        if (!profile || !canUseProfile(user, profile, exam.category)) {
          failures.push(`${group.jobTitle}: خارج صلاحية الحساب`)
          continue
        }
        const resolved = resolveBankPool(bank(), exam.category, config)
        if (!resolved.pool.length) {
          failures.push(`${group.jobTitle}: لا توجد أسئلة مناسبة في البنك`)
          continue
        }
        applyBankQuestions(user, exam, rows, config, resolved.pool, resolved.config)
        filled++
      }
      const status = refreshExamReadiness(exam.id)
      if (!filled && failures.length) fail(failures.join('؛ '))
      return { ok: true, filled, failures, ...status }
    }
    const rows = db.prepare('SELECT * FROM exam_question_sets WHERE exam_id=?').all(exam.id).filter((row) => JSON.parse(row.settings_json).key === body.key)
    if (!rows.length || rows.some((row) => JSON.parse(row.questions_json).length > 0)) fail('اختر مجموعة فارغة مسجلة في هذا الاختبار')
    const config = JSON.parse(rows[0].settings_json), profile = JOB_PROFILES.find((p) => p.id === rows[0].profile_id)
    if (!profile || !canUseProfile(user, profile, exam.category)) fail('المجموعة خارج اختصاص الحساب', 403)
    let pool
    let savedConfig = config
    if (body.source === 'bank') {
      if (body.strict === true) {
        pool = matchingPool(bank(), exam.category, config)
        savedConfig = config
      } else {
        const resolved = resolveBankPool(bank(), exam.category, config)
        pool = resolved.pool
        savedConfig = resolved.config
      }
    } else if (body.source === 'manual') {
      if (!Array.isArray(body.questions) || !body.questions.length || body.questions.length > 100) fail('أضف من 1 إلى 100 سؤال')
      pool = body.questions.map((raw) => {
        const text = typeof raw?.text === 'string' ? raw.text.trim() : '', answerKey = typeof raw?.answerKey === 'string' ? raw.answerKey.trim() : ''
        if (!text || text.length > 5000 || (exam.category !== 'personality' && (!answerKey || answerKey.length > 10000))) fail('اكتب السؤال والإجابة النموذجية قبل الحفظ')
        const points = exam.category === 'personality' ? 1 : Number(raw.points ?? 5)
        if (!Number.isFinite(points) || points <= 0 || points > 100) fail('درجة السؤال يجب أن تكون موجبة وحتى 100')
        return { id:'exam-manual-' + randomUUID(), source:'manual_exam', category:exam.category, type:exam.category === 'personality' ? 'scale' : exam.category === 'oral' ? 'oral' : 'open',
          text, answerKey, points, topic:'أسئلة يدوية للمسمى', skill:'تقييم مهام الوظيفة', isShared:false, jobTitles:[profile.id], specialties:[profile.specialty], jobTitleSnapshot:rows[0].job_title,
          difficulty:config.difficulty === 'mixed' ? 'medium' : config.difficulty, jobLevels:[config.jobLevel], level:profile.level,
          ...(exam.category === 'personality' ? { trait:String(raw.trait || 'سلوك العمل').slice(0,100),reverse:raw.reverse === true } : { rubric:[{ criterion:answerKey,maxPoints:points }] }) }
      })
      if (new Set(pool.map((q) => q.text.replace(/\s+/g,' '))).size !== pool.length) fail('لا تكرر السؤال داخل المجموعة')
    } else fail('حدد المصدر: يدوي أو بنك الأسئلة')
    if (!pool.length) fail('لم تتوفر أسئلة بهذه الإعدادات بعد؛ أضف أسئلة يدوية للمجموعة أو حدّث البنك')
    if (body.source === 'bank') applyBankQuestions(user, exam, rows, config, pool, savedConfig)
    else {
      const count = pool.length
      const blueprint = buildBlueprint(pool, count), usage = new Map()
      for (const row of rows) {
        const seen = history({ id:row.applicant_id, name:db.prepare('SELECT name FROM exam_roster WHERE id=?').get(row.roster_id).name })
        const selection = selectQuestions(pool,blueprint,seen,usage)
        db.prepare('UPDATE exam_question_sets SET questions_json=?,settings_json=? WHERE roster_id=?').run(JSON.stringify(selection.questions),JSON.stringify({ ...savedConfig, blueprint, actualQuestionCount:selection.questions.length, requiresQuestions:false, completedBy:user.username, completedAt:new Date().toISOString(), completionSource:body.source }),row.roster_id)
      }
    }
    return { ok: true, ...refreshExamReadiness(exam.id) }
  })
  const PACKAGE_CATEGORIES = [
    { id: 'oral', suffix: 'شفهي', trackId: null },
    { id: 'driving', suffix: 'أهلية قيادة', trackId: 'driving' },
    { id: 'personality', suffix: 'شخصية', trackId: 'personality' },
  ]
  function packageGroups(groups, category) {
    return (groups || []).map((group) => ({
      ...group,
      includeShared: category === 'driving' || category === 'personality',
    }))
  }
  function previewPackage(user, body) {
    if (user?.role !== 'admin') fail('حزمة التقييم (قيادة وشفهي وشخصية) متاحة للمسؤول العام فقط', 403)
    const evaluationModeValue = body.evaluationMode || 'qr'
    if (evaluationModeValue !== 'qr') fail('حزمة التقييم تُنشأ بوضع QR فقط')
    const ids = [...new Set(body.applicantIds || [])]
    const applicants = getApplicantsByIds(ids)
    if (applicants.length !== ids.length) fail('تغير سجل المتقدمين؛ أعد اختيارهم')
    const categories = []
    // شفهي: جزء لكل تخصص (فني / برمجة / شبكات)
    const oralPreview = previewWithOralSplit(user, {
      ...body,
      title: String(body.title || 'حزمة').trim() || 'حزمة',
      category: 'oral',
      evaluationMode: evaluationModeValue,
      groups: packageGroups(body.groups, 'oral'),
    })
    for (const part of oralPreview.parts || [oralPreview]) {
      categories.push({
        category: 'oral',
        suffix: part.oralLabel ? `شفهي — ${part.oralLabel}` : 'شفهي',
        oralBucket: part.oralBucket || null,
        accountHint: part.accountHint || null,
        ...part,
      })
    }
    for (const item of PACKAGE_CATEGORIES.filter((c) => c.id !== 'oral')) {
      const filtered = filterApplicantsForTrack(applicants, item.trackId)
      if (!filtered.length) {
        categories.push({
          category: item.id,
          suffix: item.suffix,
          groups: [],
          canCreate: true,
          draftRequired: false,
          shortages: [],
          skipped: true,
          skipReason: 'لا متقدمين ينطبق عليهم هذا المسار وفق آلية التقييم',
        })
        continue
      }
      categories.push({
        category: item.id,
        suffix: item.suffix,
        ...originalPreview(user, {
          ...body,
          title: String(body.title || 'حزمة').trim() || 'حزمة',
          category: item.id,
          evaluationMode: evaluationModeValue,
          applicantIds: filtered.map((a) => a.id),
          groups: packageGroups(rebuildGroupsForApplicants(filtered, body.groups), item.id),
        }),
      })
    }
    return {
      package: true,
      evaluationMode: evaluationModeValue,
      categories,
      canCreate: categories.filter((c) => !c.skipped).every((item) => item.canCreate),
      draftRequired: categories.some((item) => item.draftRequired),
      shortages: categories.flatMap((item) => (item.shortages || []).map((row) => ({ ...row, category: item.category }))),
    }
  }
  const createPackage = db.transaction((user, body) => {
    if (user?.role !== 'admin') fail('حزمة التقييم (قيادة وشفهي وشخصية) متاحة للمسؤول العام فقط', 403)
    const evaluationModeValue = body.evaluationMode || 'qr'
    if (evaluationModeValue !== 'qr') fail('حزمة التقييم تُنشأ بوضع QR فقط')
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160) fail('عنوان الحزمة مطلوب بحد أقصى 160 حرفًا')
    const ids = [...new Set(body.applicantIds || [])]
    const applicants = getApplicantsByIds(ids)
    if (applicants.length !== ids.length) fail('تغير سجل المتقدمين؛ أعد اختيارهم')
    const exams = []

    const oral = create(user, {
      title: `${body.title.trim()} — شفهي`,
      category: 'oral',
      evaluationMode: evaluationModeValue,
      applicantIds: body.applicantIds,
      groups: packageGroups(body.groups, 'oral'),
    })
    for (const item of oral.exams) {
      exams.push({
        category: 'oral',
        oralBucket: item.oralBucket || null,
        oralLabel: ORAL_BUCKET_META[item.oralBucket]?.label || null,
        exam: item.exam,
        roster: item.roster,
        warnings: item.warnings,
      })
    }

    for (const item of PACKAGE_CATEGORIES.filter((c) => c.id !== 'oral')) {
      const filtered = filterApplicantsForTrack(applicants, item.trackId)
      if (!filtered.length) continue
      const result = createOne(user, {
        title: `${body.title.trim()} — ${item.suffix}`,
        category: item.id,
        evaluationMode: evaluationModeValue,
        applicantIds: filtered.map((a) => a.id),
        groups: packageGroups(rebuildGroupsForApplicants(filtered, body.groups), item.id),
      })
      exams.push({ category: item.id, exam: result.exam, roster: result.roster, warnings: result.warnings })
    }
    if (!exams.length) fail('لا يمكن إنشاء حزمة: لا متقدمين ضمن مسارات التقييم')
    return { evaluationMode: evaluationModeValue, exams }
  })
  function enrollLate(user, examId, applicant) {
    if (user?.role !== 'admin') fail('صلاحية غير كافية', 403)
    if (!applicant?.id || !String(applicant.name || '').trim()) fail('المتقدم غير صالح')
    const run = db.transaction(() => {
      const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(examId)
      if (!exam) fail('الاختبار غير موجود', 404)
      if (exam.deleted_at) fail('الاختبار مؤرشف ولا يُضاف إليه')
      if (!exam.active) fail('الاختبار غير مفعّل')
      const existing = db.prepare('SELECT id FROM exam_roster WHERE exam_id=? AND (applicant_id=? OR name=?)').get(examId, applicant.id, applicant.name)
      if (existing) fail('المتقدم مسجّل في هذا الاختبار مسبقاً')
      let questions = []
      let settings = null
      let profileId = 'unclassified'
      if (isJobBased(examId)) {
        const sample = db.prepare('SELECT * FROM exam_question_sets WHERE exam_id=? LIMIT 1').get(examId)
        settings = sample ? JSON.parse(sample.settings_json) : { questionCount: exam.question_count || 0, key: 'late', profileId: 'unclassified' }
        profileId = settings.profileId || sample?.profile_id || resolveJobProfile(applicant)?.id || 'unclassified'
        const count = Math.max(0, Number(settings.questionCount || exam.question_count || 0))
        const pool = matchingPool(bank(), exam.category, settings)
        const selection = count && pool.length ? selectQuestionSet(pool, count, history(applicant), new Map()) : { questions: [] }
        questions = selection.questions || []
        if (count && !questions.length && sample) questions = JSON.parse(sample.questions_json || '[]')
        if (count && !questions.length) fail('لا توجد أسئلة في هذا الاختبار لإلحاق المتقدم')
        settings = { ...settings, actualQuestionCount: questions.length, lateEnrollment: true }
      }
      const seq = (db.prepare('SELECT COALESCE(MAX(seq_number), 0) AS n FROM exam_roster WHERE exam_id=?').get(examId).n || 0) + 1
      const roster = insertExamRoster(examId, [{ ...applicant, seqNumber: seq }])
      const row = roster[0]
      if (!row) fail('تعذر إضافة المتقدم إلى الاختبار')
      if (settings) {
        db.prepare('INSERT INTO exam_question_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          row.id, examId, applicant.id, effectiveJobTitle(applicant) || applicant.jobTitle || '', profileId,
          JSON.stringify(settings), JSON.stringify(questions), new Date().toISOString(),
        )
      }
      const seats = db.prepare('SELECT COUNT(*) AS n FROM exam_roster WHERE exam_id=?').get(examId).n
      db.prepare('UPDATE exams SET capacity=? WHERE id=?').run(seats, examId)
      return { rosterId: row.id, displayId: row.displayId || null, seqNumber: seq, examId, title: exam.title, questionCount: questions.length }
    })
    return run()
  }
  return {
    bank,
    listBank,
    saveQuestion,
    deleteQuestion,
    preview: previewWithOralSplit,
    create,
    previewPackage,
    createPackage,
    isJobBased,
    configOf,
    evaluationMode,
    questionsFor,
    variants,
    validateAnswers,
    scoreSubmission,
    pendingGroups,
    assertReady,
    completeGroup,
    enrollLate,
  }
}
