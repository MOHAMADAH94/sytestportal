import { safeRandomUUID } from '../utils/uuid'
import { CheckCircle2, Clock, Eye, MonitorUp, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGetExamQuestions, apiSubmitExam, apiCommittee, type AdminExam } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { QuestionCard } from '../components/QuestionCard'
import type { Question } from '../data/types'
import { CATEGORY_META, EXAM_LEVELS } from '../data/types'
import { useExamineeLiveStream } from '../hooks/useLiveMonitor'
import { useExamAntiCheat } from '../hooks/useExamAntiCheat'
import { examDurationSeconds, formatCountdown } from '../utils/examTimer'
import { isObjectiveExam } from '../../shared/examPresentation.js'

export function ExamineeExamPage() {
  const { user, logout } = useAuth()
  const [exam, setExam] = useState<AdminExam | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string | number | string[]>>({})
  const [index, setIndex] = useState(0)
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString())
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const runRevision = useRef(0)
  const pendingSync = useRef(false)
  const indexRef = useRef(0)
  const submissionKey = useRef(safeRandomUUID())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [doneMessage, setDoneMessage] = useState('')
  const [submissionStatus, setSubmissionStatus] = useState<'pending' | 'completed' | null>(null)
  const [revealedScore, setRevealedScore] = useState<{ score: number; maxScore: number; percent: number } | null>(null)
  const [sessionStopped, setSessionStopped] = useState(false)
  const [acceptedMonitor, setAcceptedMonitor] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [startingShare, setStartingShare] = useState(false)
  // متصفحات الجوال غالباً لا تدعم getDisplayMedia؛ لا نمنع جلسة QR بسبب ذلك.
  const screenShareRequired = window.isSecureContext && typeof navigator.mediaDevices?.getDisplayMedia === 'function'

  const answersRef = useRef(answers)
  const submittingRef = useRef(false)
  const finishedRef = useRef(false)
  const timeoutFiredRef = useRef(false)
  const outboxKey = user?.role === 'examinee' ? `exam-outbox:${user.examId}:${user.id || user.examineeName}` : ''

  useExamAntiCheat(acceptedMonitor && !doneMessage)

  const { screenSharing, monitoringStatus, connected, startCapture, stopCapture } = useExamineeLiveStream({
    token: user?.token,
    enabled: acceptedMonitor && !doneMessage && questions.length > 0,
    questionIndex: index,
    questionTotal: questions.length,
    secondsLeft,
    onError: (msg) => setError(msg),
    onSessionEnded: () => { if (!submittingRef.current) { setSessionStopped(true); setDoneMessage('انتهت جلسة المراقبة على هذا الجهاز. حُفظ ما وصل من إجابات؛ راجع المسؤول عند الحاجة.') } },
  })

  useEffect(() => {
    answersRef.current = answers
    indexRef.current = index
  }, [answers, index])

  useEffect(() => {
    if (!user?.token || user.role !== 'examinee') return
    apiGetExamQuestions(user.token)
      .then((res) => {
        setExam(res.exam)
        setQuestions(res.questions)
        setSecondsLeft(examDurationSeconds(res.questions.length, res.exam.secondsPerQuestion))
        if (res.run) {
          runRevision.current = res.run.revision || 0
          let recoveredAnswers = res.run.answers, recoveredIndex = res.run.questionIndex
          try {
            const pending = JSON.parse(sessionStorage.getItem(`exam-outbox:${user.examId}:${user.id || user.examineeName}`) || 'null')
            if (pending?.deadlineAt === res.run.deadlineAt && pending?.revision === res.run.revision) {
              recoveredAnswers = { ...res.run.answers, ...(pending.answers || {}) }
              recoveredIndex = Math.max(res.run.questionIndex, Number(pending.questionIndex) || 0)
              if (typeof pending.submissionKey === 'string') submissionKey.current = pending.submissionKey
            }
          } catch { /* تجاهل outbox تالف */ }
          setAnswers(recoveredAnswers); setIndex(recoveredIndex); setStartedAt(res.run.startedAt); setDeadlineAt(res.run.deadlineAt); setSecondsLeft(res.run.secondsLeft)
          if (res.run.status !== 'active') setDoneMessage('تم استلام إجاباتك سابقًا وهي قيد التقييم من المسؤول.')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل الاختبار'))
      .finally(() => setLoading(false))
  }, [user])

  useEffect(() => {
    if (!outboxKey || !deadlineAt || doneMessage) return
    sessionStorage.setItem(outboxKey, JSON.stringify({ answers, questionIndex:index, revision:runRevision.current, deadlineAt, submissionKey:submissionKey.current, savedAt:new Date().toISOString() }))
  }, [answers, index, deadlineAt, doneMessage, outboxKey])

  useEffect(() => {
    if (!user || exam?.executionMode !== 'qr' || !acceptedMonitor || doneMessage) return
    pendingSync.current = true
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => apiCommittee<{ revision?: number }>(user.token, '/exam/execution/progress', 'PUT', { answers:answersRef.current, questionIndex:indexRef.current, revision:runRevision.current }))
        .then((saved) => {
          if (typeof saved.revision === 'number') runRevision.current = saved.revision
          pendingSync.current = false
          if (outboxKey) sessionStorage.setItem(outboxKey, JSON.stringify({ answers:answersRef.current, questionIndex:indexRef.current, revision:runRevision.current, deadlineAt, submissionKey:submissionKey.current, savedAt:new Date().toISOString() }))
        })
        .catch(() => setError('لم يصل آخر تحديث للإجابات؛ احتفظ بالصفحة مفتوحة حتى عودة الاتصال.'))
    }, 500)
    return () => clearTimeout(timer)
  }, [answers, index, acceptedMonitor, doneMessage, exam?.executionMode, user?.token])

  useEffect(() => {
    if (!user || exam?.executionMode !== 'qr' || !acceptedMonitor || doneMessage) return
    const retry = () => {
      if (!pendingSync.current) return
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => apiCommittee<{ revision?: number }>(user.token, '/exam/execution/progress', 'PUT', { answers:answersRef.current, questionIndex:indexRef.current, revision:runRevision.current }))
        .then((saved) => {
          if (typeof saved.revision === 'number') runRevision.current = saved.revision
          pendingSync.current = false
          setError((current) => current.startsWith('لم يصل آخر تحديث') ? '' : current)
          if (outboxKey) sessionStorage.setItem(outboxKey, JSON.stringify({ answers:answersRef.current, questionIndex:indexRef.current, revision:runRevision.current, deadlineAt, submissionKey:submissionKey.current, savedAt:new Date().toISOString() }))
        }).catch(() => { pendingSync.current = true })
    }
    const timer = window.setInterval(retry, 5000)
    window.addEventListener('online', retry)
    return () => { window.clearInterval(timer); window.removeEventListener('online', retry) }
  }, [acceptedMonitor, doneMessage, exam?.executionMode, user?.token, outboxKey, deadlineAt])

  useEffect(() => {
    const blockBack = () => {
      window.history.pushState(null, '', window.location.href)
    }
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', blockBack)
    return () => window.removeEventListener('popstate', blockBack)
  }, [])

  async function finish(
    finalAnswers: Record<string, string | number | string[]>,
    reason: 'manual' | 'timeout' = 'manual',
  ) {
    if (!user?.token || finishedRef.current || submittingRef.current) return
    finishedRef.current = true
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    if (reason === 'timeout') { setTimedOut(true); stopCapture() }
    try {
      await saveQueue.current.catch(() => {})
      const res = await apiSubmitExam(user.token, finalAnswers, startedAt, submissionKey.current, runRevision.current)
      if (outboxKey) sessionStorage.removeItem(outboxKey)
      stopCapture()
      if (res.evaluationStatus) {
        setSubmissionStatus(res.evaluationStatus)
      }
      if (res.revealScore && res.percent != null && res.score != null && res.maxScore != null) {
        setRevealedScore({ score: res.score, maxScore: res.maxScore, percent: res.percent })
      }
      setDoneMessage(
        reason === 'timeout'
          ? `انتهى الوقت. تم تسليم ما أُجيب عنه تلقائياً. ${res.message}`
          : res.message,
      )
    } catch (err) {
      finishedRef.current = false
      setError(err instanceof Error ? err.message : 'فشل التسليم')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!acceptedMonitor || !questions.length || doneMessage) return
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => deadlineAt ? Math.max(0, Math.ceil((Date.parse(deadlineAt) - Date.now()) / 1000)) : (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [acceptedMonitor, questions.length, doneMessage, deadlineAt])

  useEffect(() => {
    if (!acceptedMonitor || doneMessage || !questions.length) return
    if (secondsLeft !== 0) return
    if (timeoutFiredRef.current) return
    timeoutFiredRef.current = true
    void finish(answersRef.current, 'timeout')
  }, [secondsLeft, acceptedMonitor, questions.length, doneMessage])

  useEffect(() => {
    if (!timedOut || doneMessage) return
    const retrySubmission = () => { if (!submittingRef.current) void finish(answersRef.current, 'timeout') }
    const timer = window.setInterval(retrySubmission, 5000)
    window.addEventListener('online', retrySubmission)
    return () => { window.clearInterval(timer); window.removeEventListener('online', retrySubmission) }
  }, [timedOut, doneMessage, user?.token])

  const current = questions[index]
  const answeredCount = Object.keys(answers).length
  const totalSeconds = examDurationSeconds(questions.length, exam?.secondsPerQuestion)
  const urgent = secondsLeft > 0 && secondsLeft <= 60

  function confirmCurrentAndNext() {
    if (!current || submitting) return
    const value = answers[current.id]
    if (value === undefined || value === '') {
      setError('يجب اختيار/كتابة إجابة قبل الانتقال للسؤال التالي')
      return
    }
    setError('')
    if (index >= questions.length - 1) {
      void finish(answers, 'manual')
      return
    }
    setIndex((i) => i + 1)
  }

  async function beginExam() {
    setStartingShare(true)
    setError('')
    await startCapture()
    try {
      if (exam?.executionMode === 'qr' && user) {
        const result = await apiCommittee<any>(user.token, '/exam/execution/start', 'POST')
        runRevision.current = result.run.revision || 0
        setDeadlineAt(result.run.deadlineAt); setStartedAt(result.run.startedAt); setSecondsLeft(result.run.secondsLeft)
        if (result.run.status !== 'active') { stopCapture(); setDoneMessage('سبق تسليم هذه الجلسة.'); return }
      }
      setAcceptedMonitor(true)
    } catch (e) { stopCapture(); setError(e instanceof Error ? e.message : 'تعذر بدء الجلسة') }
    finally { setStartingShare(false) }
  }

  if (doneMessage) {
    const isClassicPending = submissionStatus === 'pending' || doneMessage.includes('مقالية')
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-ok/30 bg-card p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-ok" />
        <h1 className="text-2xl font-extrabold text-light-gold">
          {sessionStopped ? 'انتهت الجلسة على هذا الجهاز' : timedOut ? 'انتهى الوقت — تم التسليم' : 'تم التسليم'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-2">{doneMessage}</p>
        {revealedScore ? (
          <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-4">
            <p className="text-sm text-mute">علامتك في الاختيار من متعدد</p>
            <p className="mt-1 text-3xl font-extrabold text-light-gold">{revealedScore.percent}%</p>
            <p className="mt-1 text-sm text-text">{revealedScore.score} / {revealedScore.maxScore}</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-mute">لن تظهر نتيجتك هنا — تُراجع من لوحة الإدارة فقط.</p>
        )}
        {isClassicPending && (
          <div className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm font-medium text-warn">
            تم تسليم إجاباتك بنجاح. يحتوي الاختبار على أسئلة مقالية تخضع للتقييم اليدوي، وستُحدّث نتيجتك فور اعتمادها من قبل المصحح المختص.
          </div>
        )}
        <Link
          to="/"
          onClick={() => logout()}
          className="mt-6 inline-flex rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink"
        >
          العودة لتسجيل الدخول
        </Link>
      </div>
    )
  }

  if (loading) return <p className="text-mute">جاري تحميل الاختبار...</p>

  if (error && !questions.length) {
    return (
      <div className="rounded-2xl border border-error/40 bg-error/10 p-6 text-center">
        <p className="text-error">{error}</p>
        <Link to="/" className="mt-4 inline-block font-bold text-gold">
          الصفحة الرئيسية
        </Link>
      </div>
    )
  }

  if (!acceptedMonitor) {
    const mins = Math.ceil(totalSeconds / 60)
    const objectiveExam = isObjectiveExam(questions.map((q) => q.type))
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="rounded-3xl border border-warn/50 bg-card p-8 text-center shadow-lg">
          <ShieldAlert className="mx-auto mb-4 h-14 w-14 text-warn" />
          <h1 className="text-2xl font-extrabold text-light-gold">تنبيه قبل البدء</h1>
          <div className="mt-4 space-y-3 text-right text-sm leading-7 text-text-2">
            <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-light-gold">
              <Clock className="mb-1 inline h-4 w-4" /> المدة:{' '}
              <strong>
                {questions.length} سؤال ≈ {mins} دقيقة
              </strong>
            </p>
            {screenShareRequired ? (
              <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-warn">
                <MonitorUp className="mb-1 inline h-4 w-4" /> سيطلب المتصفح موافقتك على مشاركة الشاشة أثناء الجلسة فقط.
                مشاركة نافذة أو تبويب تتيح مراقبة جزئية؛ تظهر للمسؤول طبيعة المشاركة الفعلية.
              </p>
            ) : (
              <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-light-gold">
                مشاركة الشاشة غير متاحة في هذا المتصفح أو الاتصال. سيظهر للمسؤول أن المراقبة جزئية وتقتصر على أحداث الصفحة والتقدم.
              </p>
            )}
            <ul className="list-disc pr-5 text-mute">
              <li>سؤال واحد في كل مرة ولا رجوع بعد التأكيد.</li>
              <li>{objectiveExam ? 'ستظهر علامتك فور التسليم، وتظهر للجنة كذلك.' : 'النتيجة لا تظهر لك وتُحفظ للإدارة.'}</li>
              {screenShareRequired && <li>إيقاف مشاركة الشاشة يظهر تنبيهاً في لوحة المراقبة.</li>}
              <li>تُسجّل مغادرة الصفحة وفقدان التركيز وانقطاع الاتصال كأحداث تحتاج مراجعة، وليست دليلًا قطعيًا على الغش.</li>
            </ul>
            {error && (
              <p className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-error">{error}</p>
            )}
          </div>
          <button
            type="button"
            disabled={startingShare}
            onClick={() => void beginExam()}
            className="mt-6 w-full rounded-xl bg-gold py-3.5 text-sm font-extrabold text-ink hover:bg-accent-gold disabled:opacity-60"
          >
            {screenShareRequired
              ? startingShare ? 'انتظر مشاركة الشاشة...' : 'مشاركة الشاشة وبدء الاختبار'
              : 'بدء الاختبار'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div
        className={`sticky top-[4.5rem] z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
          urgent ? 'border-error/50 bg-error/15 text-error' : 'border-warn/40 bg-warn/10 text-warn'
        }`}
      >
        <span className="inline-flex items-center gap-2 font-bold">
          <Clock className="h-4 w-4" />
          الوقت المتبقي: {formatCountdown(secondsLeft)}
        </span>
        {screenShareRequired ? (
          <span className={`inline-flex items-center gap-1 text-xs font-bold ${screenSharing ? 'text-ok' : 'text-error'}`}>
            <Eye className="h-3.5 w-3.5" />
            {screenSharing ? (monitoringStatus === 'screen' ? 'مشاركة شاشة كاملة' : 'مشاركة جزئية') : 'لا تُشارك الشاشة'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-gold">
            <Eye className="h-3.5 w-3.5" /> مراقبة جزئية — الشاشة غير متاحة
          </span>
        )}
      </div>
      <div className="flex justify-between gap-3 text-sm"><span className={connected ? 'text-ok' : 'text-warn'}>{connected ? 'متصل بالمراقبة' : 'المراقبة غير متصلة — جاري إعادة الاتصال'}</span>{document.fullscreenEnabled && <button className="text-gold underline" onClick={() => void document.documentElement.requestFullscreen().catch(() => setError('تعذر الدخول في وضع ملء الشاشة'))}>عرض بملء الشاشة</button>}</div>

      {screenShareRequired && !screenSharing && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          توقفت مشاركة الشاشة.{' '}
          <button type="button" className="font-bold underline" onClick={() => void startCapture()}>
            إعادة التفعيل
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold text-light-gold">{exam?.title}</h1>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-bold text-gold">
            سؤال {index + 1} من {questions.length}
          </span>
        </div>
        <p className="mt-1 text-sm text-mute">
          {user?.examineeName} · {exam && CATEGORY_META[exam.category].label} ·{' '}
          {exam && EXAM_LEVELS.find((l) => l.id === exam.level)?.label}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel">
          <div
            className="h-full rounded-full bg-gradient-to-l from-gold to-light-gold transition-all"
            style={{ width: `${Math.round((answeredCount / Math.max(questions.length, 1)) * 100)}%` }}
          />
        </div>
      </div>

      {current && (
        <QuestionCard
          key={current.id}
          question={current}
          index={index}
          value={answers[current.id]}
          onChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}
          hideMeta
        />
      )}

      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={submitting}
        onClick={confirmCurrentAndNext}
        className="sticky bottom-4 w-full rounded-2xl bg-gold py-4 text-base font-extrabold text-ink shadow-xl shadow-gold/20 hover:bg-accent-gold disabled:opacity-60"
      >
        {submitting
          ? 'جاري التسليم والتصحيح...'
          : index >= questions.length - 1
            ? 'تأكيد الإجابة وتسليم الاختبار'
            : 'تأكيد الإجابة والانتقال للتالي'}
      </button>
      <p className="text-center text-xs text-mute">بعد التأكيد لن تتمكن من العودة لهذا السؤال.</p>
    </div>
  )
}
