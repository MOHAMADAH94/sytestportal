import { ArrowRight, ClipboardPen, Pencil, BookOpenCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiExamResults, apiAdminExamQuestions } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { EditResultModal } from '../components/EditResultModal'
import { ClassicEvaluationModal } from '../components/ClassicEvaluationModal'
import { CATEGORY_META, EXAM_LEVELS, type Question } from '../data/types'

type TraitReport = {
  summary?: string
  traits?: { name: string; score: number; max: number; percent: number }[]
}

type AttemptRow = Awaited<ReturnType<typeof apiExamResults>>['attempts'][number] & {
  evaluationStatus?: 'pending' | 'completed'
  evaluations?: any[]
  answers?: Record<string, any>
  clientIp?: string
}

export function AdminResultsPage() {
  const { examId } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState<Awaited<ReturnType<typeof apiExamResults>> | null>(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptRow | null>(null)
  const [evaluatingAttempt, setEvaluatingAttempt] = useState<AttemptRow | null>(null)
  const [examQuestions, setExamQuestions] = useState<Question[]>([])
  const [review, setReview] = useState<(Awaited<ReturnType<typeof apiAdminExamQuestions>> & { name: string }) | null>(null)

  async function openClassicEvaluation(a: AttemptRow) {
    if (!user || !examId) return
    try {
      const qData = await apiAdminExamQuestions(user.token, examId, a.examineeName)
      setExamQuestions(qData.questions)
      setEvaluatingAttempt(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل أسئلة الاختبار')
    }
  }

  async function reviewAnswers(name: string) {
    if (!user || !examId) return
    try { setReview({ ...await apiAdminExamQuestions(user.token, examId, name), name }) }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل الإجابات') }
  }

  async function load() {
    if (!user?.token || !examId) return
    const res = await apiExamResults(user.token, examId)
    setData(res)
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'فشل التحميل'))
  }, [user?.token, examId])

  if (error && !data) {
    return <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-error">{error}</div>
  }

  if (!data) return <p className="text-mute">جاري تحميل النتائج...</p>

  const { exam, attempts } = data
  const isPersonality = exam.category === 'personality'
  const isOral = exam.category === 'oral'

  if (isOral && !exam.committeeId) {
    return (
      <div className="space-y-5" dir="rtl">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm font-bold text-gold">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>
        <div className="rounded-2xl border border-gold/40 bg-gold/10 p-6">
          <h1 className="text-2xl font-extrabold text-light-gold">المقابلات الشفهية: {exam.title}</h1>
          <p className="mt-2 text-sm text-text-2">
            تُدار المقابلة من حساب الاختبار فقط؛ تظهر أسماء المتقدمين للمقابِل ولا يوجد دخول أو أسئلة للممتحَن.
          </p>
          <Link
            to={`/admin/oral/${exam.id}`}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink"
          >
            <ClipboardPen className="h-4 w-4" /> فتح قائمة التقييم
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/admin" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-gold">
            <ArrowRight className="h-4 w-4" /> رجوع
          </Link>
          <h1 className="text-2xl font-extrabold text-light-gold">نتائج: {exam.title}</h1>
          <p className="mt-1 text-sm text-mute">
            {CATEGORY_META[exam.category].label} · {EXAM_LEVELS.find((l) => l.id === exam.level)?.label} ·
            الممتحنون {exam.usedSeats}/{exam.capacity}
          </p>
          <p className="mt-2 text-xs text-mute">
            النتائج محفوظة في قاعدة البيانات ولا تظهر للممتحن.
            {exam.committeeId && <> تقييم موزون صادر عن لجنة التقييم.</>}
            {!exam.committeeId && !isOral && !isPersonality && (
              <> النسبة = الدرجات المستحقة ÷ مجموع درجات الأسئلة. الأسئلة المقالية تتطلب مراجعة يدوية قبل اعتماد النتيجة.</>
            )}
          </p>
        </div>
        {!isOral && !exam.committeeId && (
          <Link
            to={`/admin/enter/${exam.id}`}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink hover:bg-accent-gold"
          >
            <ClipboardPen className="h-4 w-4" />
            {isPersonality ? 'إدخال نتائج شخصية' : 'إدخال نتيجة يدوياً'}
          </Link>
        )}
      </div>

      {review && <section className="space-y-3 rounded-2xl border border-gold p-5"><div className="flex justify-between"><h2 className="font-bold text-gold">مراجعة إجابات {review.name}</h2><button onClick={() => setReview(null)}>إغلاق</button></div><p className="text-sm text-mute">راجع الإجابات والمعايير، ثم أدخل النسبة الكلية من زر تعديل النتيجة مع توثيق سبب الاعتماد.</p>{review.questions.map((q, i) => <article key={q.id} className="space-y-2 border-t border-line pt-3"><p className="font-bold">{i + 1}. {q.text} ({q.points} درجة)</p><p>إجابة المتقدم: {q.choices?.find((c) => c.id === String(review.answers?.[q.id]))?.text || String(review.answers?.[q.id] ?? 'لم تُسجّل إجابة')}</p><p className="whitespace-pre-wrap text-sm text-gold">الإجابة النموذجية: {q.answerKey || 'مقياس شخصية'}</p>{q.rubric?.map((r, n) => <p key={n} className="text-sm">{r.criterion} — {r.maxPoints} درجة</p>)}</article>)}</section>}
      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{okMsg}</div>
      )}

      {attempts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute">
          لا محاولات بعد لهذا الاختبار.
          <div className="mt-3" hidden={!!exam.committeeId}>
            <Link to={`/admin/enter/${exam.id}`} className="font-bold text-gold">
              ابدأ بإدخال الأسماء والنتائج
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-panel text-mute">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">الممتحن</th>
                  <th className="px-4 py-3 text-right font-bold">الإجابات الصحيحة</th>
                  <th className="px-4 py-3 text-right font-bold">مجموع الدرجات</th>
                  <th className="px-4 py-3 text-right font-bold">النسبة</th>
                  <th className="px-4 py-3 text-right font-bold">وقت التسليم</th>
                  <th className="px-4 py-3 text-center font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-t border-line bg-card">
                    <td className="px-4 py-3 font-semibold text-text">
                      <div>{a.examineeName}</div>
                      {a.clientIp && (
                        <div className="mt-0.5 font-mono text-[11px] text-mute" dir="ltr">
                          IP: {a.clientIp}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.evaluationStatus === 'pending' ? (
                        <span className="inline-flex items-center rounded-full border border-warn/30 bg-warn/20 px-2 py-0.5 text-xs font-semibold text-warn">
                          بانتظار تصحيح المقالي
                        </span>
                      ) : a.correctCount != null && a.objectiveCount != null ? (
                        <span className="text-ok">
                          {a.correctCount} / {a.objectiveCount} سؤال
                        </span>
                      ) : a.maxScore === 0 ? (
                        <span className="text-mute">تقييم يدوي</span>
                      ) : (
                        <span className="text-ok">
                          {a.score} / {a.maxScore}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-2">
                      {a.maxScore > 0 ? (
                        <>
                          {a.score} / {a.maxScore} درجة
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-light-gold">
                      {a.maxScore === 0 ? '—' : a.percent != null ? `${a.percent}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-mute">
                      {new Date(a.finishedAt).toLocaleString('ar-SA')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center">
                        {exam.jobBased && !exam.committeeId && (
                          <button className="text-xs text-gold underline hover:text-light-gold" onClick={() => reviewAnswers(a.examineeName)}>
                            مراجعة
                          </button>
                        )}
                        {!exam.committeeId && (
                          <button
                            type="button"
                            onClick={() => openClassicEvaluation(a)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-xs font-bold text-gold transition hover:border-gold hover:bg-gold hover:text-ink"
                            title="تصحيح وتقييم الأسئلة المقالية والإنشائية"
                          >
                            <BookOpenCheck className="h-3.5 w-3.5" />
                            تصحيح المقالي
                          </button>
                        )}
                        <button
                          disabled={user?.role !== 'admin' && !!exam.committeeId}
                          title={user?.role !== 'admin' && exam.committeeId ? 'نتيجة لجنة معتمدة؛ التصحيح من حساب الأدمن' : undefined}
                          type="button"
                          id={`results-edit-btn-${a.id}`}
                          onClick={() => setSelectedAttempt(a)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-bold text-text-2 transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {user?.role !== 'admin' && exam.committeeId ? 'معتمد من اللجنة' : 'تعديل النتيجة'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {attempts.some((a) => a.personality) && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-light-gold">تقارير الشخصية</h2>
          {attempts
            .filter((a) => a.personality)
            .map((a) => {
              const p = a.personality as TraitReport
              return (
                <div key={a.id} className="rounded-xl border border-line bg-card p-4 text-sm">
                  <div className="mb-2 font-bold text-text">{a.examineeName}</div>
                  {p?.summary && <p className="mb-3 leading-relaxed text-text-2">{p.summary}</p>}
                  {p?.traits && p.traits.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {p.traits.map((t) => (
                        <div key={t.name} className="rounded-xl border border-line bg-panel px-3 py-2">
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
                  ) : (
                    <pre className="whitespace-pre-wrap text-mute">{JSON.stringify(a.personality, null, 2)}</pre>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {/* نافذة تعديل النتيجة المنبثقة */}
      {selectedAttempt && (
        <EditResultModal
          isOpen={!!selectedAttempt}
          onClose={() => setSelectedAttempt(null)}
          onSuccess={() => {
            setOkMsg(`تم تعديل نتيجة «${selectedAttempt.examineeName}» وتوثيقها بنجاح في سجل التدقيق.`)
            void load()
          }}
          attemptId={selectedAttempt.id}
          candidateName={selectedAttempt.examineeName}
          examTitle={exam.title}
          category={exam.category}
          currentPercent={selectedAttempt.percent}
          currentScore={selectedAttempt.score}
          currentMaxScore={selectedAttempt.maxScore}
        />
      )}

      {/* نافذة تصحيح الأسئلة المقالية */}
      {evaluatingAttempt && examId && (
        <ClassicEvaluationModal
          isOpen={!!evaluatingAttempt}
          onClose={() => setEvaluatingAttempt(null)}
          onSuccess={() => {
            setOkMsg(`تم حفظ تقييم الأسئلة المقالية وتحديث نتيجة «${evaluatingAttempt.examineeName}» بنجاح.`)
            setEvaluatingAttempt(null)
            void load()
          }}
          examId={examId}
          attemptId={evaluatingAttempt.id}
          examineeName={evaluatingAttempt.examineeName}
          questions={examQuestions}
          evaluations={evaluatingAttempt.evaluations || []}
          answers={evaluatingAttempt.answers || {}}
        />
      )}
    </div>
  )
}
