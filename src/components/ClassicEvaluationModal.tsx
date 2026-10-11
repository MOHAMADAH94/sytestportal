import { useState, useEffect } from 'react'
import { X, CheckCircle, AlertCircle, BookOpen } from 'lucide-react'
import { apiEvaluateClassicQuestions } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { Question } from '../data/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  examId: string
  attemptId: string
  examineeName: string
  questions: Question[]
  evaluations?: any[]
  answers?: Record<string, any>
}

export function ClassicEvaluationModal({
  isOpen,
  onClose,
  onSuccess,
  examId,
  attemptId,
  examineeName,
  questions,
  evaluations,
  answers,
}: Props) {
  const { user } = useAuth()
  const [scores, setScores] = useState<Record<string, number>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const classicQuestions = questions.filter(
    (q) => q.type === 'classic' || q.type === 'open',
  )

  useEffect(() => {
    if (!isOpen) return
    const initialScores: Record<string, number> = {}
    const initialFeedbacks: Record<string, string> = {}
    classicQuestions.forEach((q) => {
      const ev = evaluations?.find((e) => e.questionId === q.id)
      initialScores[q.id] = ev ? Number(ev.awardedScore) : 0
      initialFeedbacks[q.id] = ev?.feedback || ''
    })
    setScores(initialScores)
    setFeedbacks(initialFeedbacks)
    setReason('')
    setError('')
  }, [isOpen, attemptId])

  if (!isOpen) return null

  async function handleSave() {
    if (!user) return
    setBusy(true)
    setError('')

    for (const q of classicQuestions) {
      const score = Number(scores[q.id])
      if (isNaN(score) || score < 0 || score > q.points) {
        setError(`الدرجة الممنوحة للسؤال «${q.text.slice(0, 30)}...» يجب أن تكون بين 0 و ${q.points}`)
        setBusy(false)
        return
      }
    }

    try {
      const payload = classicQuestions.map((q) => ({
        questionId: q.id,
        score: Number(scores[q.id] || 0),
        feedback: feedbacks[q.id] || '',
      }))

      await apiEvaluateClassicQuestions(user.token, examId, attemptId, payload, reason)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ وتحديث تقييم الأسئلة')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" dir="rtl">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-gold/40 bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-gold" />
            <h2 className="text-lg font-bold text-text">
              تصحيح وتقييم الأسئلة المقالية للممتحن: <span className="text-light-gold">{examineeName}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-mute transition hover:bg-panel hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {classicQuestions.length === 0 ? (
            <p className="text-center text-mute">لا توجد أسئلة مقالية في هذا الاختبار.</p>
          ) : (
            classicQuestions.map((q, idx) => {
              const candAnswer =
                evaluations?.find((e) => e.questionId === q.id)?.candidateAnswer ||
                answers?.[q.id] ||
                ''

              return (
                <div key={q.id} className="space-y-3 rounded-xl border border-line bg-panel/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-text">
                      <span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-gold/20 text-xs text-light-gold">
                        {idx + 1}
                      </span>
                      {q.text}
                    </h3>
                    <span className="rounded-full border border-line bg-ink px-2.5 py-0.5 text-xs font-semibold text-warn">
                      الدرجة العظمى: {q.points}
                    </span>
                  </div>

                  {q.rubric && q.rubric.length > 0 && (
                    <div className="rounded-lg border border-line/60 bg-panel px-3 py-2 text-xs">
                      <div className="mb-1 font-semibold text-text-2">معايير التصحيح (Rubric):</div>
                      <ul className="space-y-1 text-mute">
                        {q.rubric.map((r, i) => (
                          <li key={i} className="flex justify-between">
                            <span>• {r.criterion}</span>
                            <span className="text-warn">{r.maxPoints} درجة</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {q.answerKey && (
                    <div className="rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-xs text-text-2">
                      <strong className="text-ok">نموذج الإجابة / سلم الحل: </strong>
                      {q.answerKey}
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-mute">إجابة الممتحن المسجلة:</div>
                    <div className="whitespace-pre-wrap rounded-lg border border-line bg-card p-3 text-sm text-text">
                      {candAnswer ? String(candAnswer) : <span className="text-mute italic">لم يتم تقديم إجابة</span>}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-mute">الدرجة الممنوحة (من {q.points}):</label>
                      <input
                        type="number"
                        min={0}
                        max={q.points}
                        step="any"
                        value={scores[q.id] ?? 0}
                        onChange={(e) => setScores({ ...scores, [q.id]: Number(e.target.value) })}
                        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-bold text-gold outline-none focus:border-gold"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-mute">ملاحظات وتغذية راجعة للممتحن (اختياري):</label>
                      <input
                        type="text"
                        placeholder="سبب منح الدرجة أو نقاط القوة/الضعف..."
                        value={feedbacks[q.id] || ''}
                        onChange={(e) => setFeedbacks({ ...feedbacks, [q.id]: e.target.value })}
                        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none focus:border-gold"
                      />
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {classicQuestions.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-mute">سبب التعديل / مرجع التدقيق (اختياري):</label>
              <input
                type="text"
                placeholder="مثال: تصحيح يدوي للأسئلة المقالية حسب سلم التصحيح المعتمد"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-text outline-none focus:border-gold"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-line p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-mute hover:border-gold/60 hover:text-text"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={busy || classicQuestions.length === 0}
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2 text-sm font-bold text-ink transition hover:bg-accent-gold disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            {busy ? 'جاري الاعتماد...' : 'اعتماد وحفظ الدرجات'}
          </button>
        </div>
      </div>
    </div>
  )
}
