import { ArrowRight, CheckCircle2, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiExamResults, apiListEvaluationCandidates, apiExamRoster, type AdminExam } from '../api/client'
import { useAuth } from '../auth/AuthContext'

/** اختيار متقدم لتقييم القيادة أو الشخصية؛ كل القائمة متاحة للحساب المختص. */
export function AdminCandidatePickerPage() {
  const { examId } = useParams()
  const { user } = useAuth()
  const [exam, setExam] = useState<AdminExam | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.token || !examId) return
    Promise.all([apiListEvaluationCandidates(user.token), apiExamResults(user.token, examId)])
      .then(async ([candidates, results]) => {
        const applicable = results.exam.jobBased ? (await apiExamRoster(user.token, examId)).roster : candidates
        setExam(results.exam)
        setNames(applicable.sort((a, b) => a.seqNumber - b.seqNumber).map((item) => item.name))
        setDone(new Set(results.attempts.map((item) => item.examineeName)))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'فشل تحميل المتقدمين'))
  }, [user?.token, examId])

  if (error) return <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-error">{error}</div>
  if (!exam) return <p className="text-mute">جاري تحميل المتقدمين...</p>

  const title = exam.category === 'driving' ? 'أهلية قيادة الضابط' : 'تقييم الشخصية'
  return <div className="space-y-5">
    <Link to="/admin" className="inline-flex items-center gap-1 text-sm font-bold text-gold"><ArrowRight className="h-4 w-4" /> رجوع</Link>
    <div><h1 className="text-2xl font-extrabold text-light-gold">متقدمو {title}</h1><p className="mt-1 text-sm text-mute">كل المتقدمين في قائمة الاختبار متاحون للتقييم.</p></div>
    {!names.length ? <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute">لا توجد قائمة متقدمين لهذا الاختبار.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{names.map((name, index) => <div key={`${name}-${index}`} className="rounded-2xl border border-line bg-card p-4"><div className="mb-3 font-bold text-text">{name}</div>{done.has(name) ? <div className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="h-4 w-4" /> تم التقييم</div> : <Link to={`/evaluation/${exam.id}?name=${encodeURIComponent(name)}`} className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-sm font-bold text-ink"><Play className="h-4 w-4" /> بدء التقييم</Link>}</div>)}</div>}
  </div>
}
