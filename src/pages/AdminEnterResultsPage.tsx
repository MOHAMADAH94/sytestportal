import { ArrowRight, ClipboardPlus, Save, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  apiAdminExamQuestions,
  apiManualResult,
  type AdminExam,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { QuestionCard } from '../components/QuestionCard'
import type { Question } from '../data/types'
import { CATEGORY_META, EXAM_LEVELS } from '../data/types'

type TraitReport = {
  summary?: string
  traits?: { name: string; score: number; max: number; percent: number }[]
}

export function AdminEnterResultsPage() {
  const { examId } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [exam, setExam] = useState<AdminExam | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [variants, setVariants] = useState<{ examineeName: string; jobTitle: string }[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const selectedCandidate = searchParams.get('name') || ''
  const [examineeName, setExamineeName] = useState(() => selectedCandidate)
  const [answers, setAnswers] = useState<Record<string, string | number | string[]>>({})
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastReport, setLastReport] = useState<{
    name: string
    percent: number | null
    personality: TraitReport | null
  } | null>(null)

  async function load() {
    if (!user?.token || !examId) return
    setLoading(true)
    try {
      const res = await apiAdminExamQuestions(user.token, examId, selectedCandidate || undefined)
      setExam(res.exam)
      setVariants(res.variants || [])
      setQuestions(res.questions)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [user?.token, examId])

  useEffect(() => {
    if (selectedCandidate) setExamineeName(selectedCandidate)
  }, [selectedCandidate])

  useEffect(() => {
    if (!exam?.jobBased || !user || !examId) return
    let current = true
    setAnswers({}); setQuestions([])
    if (!examineeName) { setQuestionsLoading(false); return }
    setQuestionsLoading(true)
    apiAdminExamQuestions(user.token, examId, examineeName).then((res) => { if (current) { setQuestions(res.questions); setError('') } })
      .catch((e) => { if (current) setError(e.message) }).finally(() => { if (current) setQuestionsLoading(false) })
    return () => { current = false }
  }, [exam?.jobBased, examId, user?.token, examineeName])

  function resetForm() {
    setExamineeName('')
    setAnswers({})
    setOkMsg('')
  }

  async function save() {
    if (!user?.token || !examId) return
    const name = examineeName.trim()
    if (!name) {
      setError('أدخل اسم الممتحن')
      return
    }

    const unanswered = questions.filter((q) => {
      const v = answers[q.id]
      return v === undefined || v === ''
    })
    if (unanswered.length > 0) {
      setError(`أكمل جميع الأسئلة (متبقٍ ${unanswered.length})`)
      return
    }

    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const res = await apiManualResult(user.token, examId, {
        examineeName: name,
        answers,
      })
      setLastReport({
        name: res.attempt.examineeName,
        percent: res.attempt.percent,
        personality: (res.attempt.personality as TraitReport) || null,
      })
      setOkMsg(`تم حفظ نتيجة «${name}» بنجاح.`)
      setExamineeName('')
      setAnswers({})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-mute">جاري التحميل...</p>
  if (!exam) {
    return <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-error">{error || 'غير موجود'}</div>
  }

  const remaining = exam.capacity - exam.usedSeats
  const isPersonality = exam.category === 'personality'

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/admin/results/${exam.id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-gold">
          <ArrowRight className="h-4 w-4" /> العودة للنتائج
        </Link>
        <h1 className="text-2xl font-extrabold text-light-gold">إدخال نتائج: {exam.title}</h1>
        <p className="mt-1 text-sm text-mute">
          {CATEGORY_META[exam.category].label} · {EXAM_LEVELS.find((l) => l.id === exam.level)?.label} · المقاعد{' '}
          {exam.usedSeats}/{exam.capacity} (متبقٍ {remaining})
        </p>
        <p className="mt-2 text-sm text-text-2">
          {isPersonality
            ? 'أدخل اسم كل شخص ثم ضع درجاته على مقياس 1–5 لكل عبارة، واحفظ. يمكنك إضافة عدة أشخاص تباعاً.'
            : 'أدخل اسم الممتحن وأجوبته يدوياً ثم احفظ النتيجة في قاعدة البيانات.'}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}
      {okMsg && (
        <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{okMsg}</div>
      )}

      {lastReport && (
        <div className="rounded-2xl border border-gold/30 bg-panel p-4">
          <div className="mb-2 font-bold text-light-gold">آخر نتيجة محفوظة — {lastReport.name}</div>
          {lastReport.percent != null && (
            <p className="mb-2 text-sm text-text-2">النسبة الإجمالية: {lastReport.percent}%</p>
          )}
          {lastReport.personality?.summary && (
            <p className="mb-3 text-sm leading-relaxed text-text-2">{lastReport.personality.summary}</p>
          )}
          {lastReport.personality?.traits && lastReport.personality.traits.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {lastReport.personality.traits.map((t) => (
                <div key={t.name} className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2 font-semibold text-text">
                    <span>{t.name}</span>
                    <span className="text-light-gold">{t.percent}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${t.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {remaining <= 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute">
          اكتمل عدد الممتحنين. لا يمكن إضافة نتائج جديدة.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-line bg-card p-4">
            <label className="mb-2 block text-sm font-bold text-text">اسم الممتحن</label>
            <div className="flex flex-wrap gap-2">
              {exam.jobBased ? <select aria-label="اسم الممتحن" value={examineeName} onChange={(e) => setExamineeName(e.target.value)} className="min-w-[220px] flex-1 rounded-xl border border-line bg-panel px-4 py-2.5 text-text"><option value="">اختر المتقدم لعرض أسئلته</option>{variants.map((v) => <option key={v.examineeName} value={v.examineeName}>{v.examineeName} — {v.jobTitle}</option>)}</select> : <input
                type="text"
                value={examineeName}
                onChange={(e) => setExamineeName(e.target.value)}
                readOnly={!!selectedCandidate}
                placeholder="مثال: أحمد محمد"
                className="min-w-[220px] flex-1 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm text-text outline-none focus:border-gold"
              />}
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-xs font-bold text-text-2"
              >
                <UserPlus className="h-3.5 w-3.5" /> مسح النموذج
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                value={answers[q.id]}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
              />
            ))}
          </div>

          <div className="sticky bottom-4 z-10 flex justify-end">
            <button
              type="button"
              disabled={saving || questionsLoading || !questions.length || !examineeName}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink shadow-lg hover:bg-accent-gold disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'جاري الحفظ...' : 'حفظ نتيجة هذا الشخص'}
            </button>
          </div>
        </>
      )}

      <Link
        to={`/admin/results/${exam.id}`}
        className="inline-flex items-center gap-1 text-sm font-bold text-gold"
      >
        <ClipboardPlus className="h-4 w-4" /> عرض كل النتائج المحفوظة
      </Link>
    </div>
  )
}
