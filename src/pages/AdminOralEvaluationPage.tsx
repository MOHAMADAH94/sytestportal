import { ArrowRight, CheckCircle2, ClipboardList, PenLine, Play, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { apiExamResults, apiExamRoster, apiSaveOralEvaluation, type AdminExam } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { getBank } from '../data/banks'
import type { Question } from '../data/types'

type Mode = 'choose' | 'generated' | 'manual' | 'evaluate'
type EvaluationQuestion = { id: string; text: string; points: number; answer: string; awarded: string; answerKey?: string }

function shuffled<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

export function AdminOralEvaluationPage() {
  const navigate = useNavigate()
  const { examId } = useParams()
  const { user } = useAuth()
  const [exam, setExam] = useState<AdminExam | null>(null)
  const [candidates, setCandidates] = useState<{ name: string; jobTitle: string }[]>([])
  const [completed, setCompleted] = useState<Record<string, { score: number; maxScore: number; percent: number | null }>>({})
  const [selectedName, setSelectedName] = useState('')
  const [mode, setMode] = useState<Mode>('choose')
  const [count, setCount] = useState(5)
  const [topic, setTopic] = useState('all')
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const bank = useMemo(() => exam ? getBank('oral', exam.oralRole || undefined, exam.level) : [], [exam])
  const topics = useMemo(() => [...new Set(bank.map((q) => q.topic))].sort((a, b) => a.localeCompare(b, 'ar')), [bank])

  /** تجميع المتقدمين حسب مسمى العمل لتسهيل تتبع المقابل لفئته. */
  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, { name: string; jobTitle: string }[]>()
    for (const candidate of candidates) {
      if (!groups.has(candidate.jobTitle)) groups.set(candidate.jobTitle, [])
      groups.get(candidate.jobTitle)!.push(candidate)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))
  }, [candidates])

  async function load() {
    if (!user?.token || !examId) return
    setLoading(true)
    try {
      const [rosterData, resultsData] = await Promise.all([apiExamRoster(user.token, examId), apiExamResults(user.token, examId)])
      if (rosterData.exam.category !== 'oral') throw new Error('هذه الصفحة مخصصة للمقابلات الشفهية')
      setExam(rosterData.exam)
      setCandidates(rosterData.roster.map((row) => ({ name: row.name, jobTitle: row.jobTitle?.trim() || 'غير محدد' })))
      setCompleted(Object.fromEntries(resultsData.attempts.map((a) => [a.examineeName, { score: a.score, maxScore: a.maxScore, percent: a.percent }])))
      setError('')
    } catch (err) { setError(err instanceof Error ? err.message : 'فشل تحميل قائمة المقابلة') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [user?.token, examId])

  function openCandidate(name: string) {
    if (!completed[name]) navigate('/evaluation/' + examId + '?name=' + encodeURIComponent(name))
  }

  function createGeneratedQuestions() {
    const pool = topic === 'all' ? bank : bank.filter((q) => q.topic === topic)
    if (!pool.length) { setError('لا توجد أسئلة مطابقة لهذا النوع'); return }
    const list = shuffled(pool).slice(0, Math.min(count, pool.length)).map((q: Question, index) => ({
      id: `${q.id}-${Date.now()}-${index}`, text: q.text, points: 10, answer: '', awarded: '',
    }))
    setQuestions(list); setMode('evaluate'); setError('')
  }

  function createManualQuestions() {
    const safeCount = Math.max(1, Math.min(30, count || 1))
    setQuestions(Array.from({ length: safeCount }, (_, index) => ({ id: `manual-${Date.now()}-${index}`, text: '', points: 10, answer: '', awarded: '' })))
    setMode('evaluate'); setError('')
  }

  function updateQuestion(index: number, patch: Partial<EvaluationQuestion>) {
    setQuestions((prev) => prev.map((q, i) => i === index ? { ...q, ...patch } : q))
  }

  async function saveEvaluation() {
    if (!user?.token || !examId || !selectedName) return
    if (!questions.length || questions.some((q) => q.awarded.trim() === '')) { setError('أدخل درجة لكل سؤال، ويمكن إدخال صفر.'); return }
    const payload = questions.map((q) => ({ ...q, points: Number(q.points), awarded: Number(q.awarded) }))
    if (payload.some((q) => !q.text.trim() || !q.answer.trim() || !Number.isFinite(q.points) || q.points <= 0 || !Number.isFinite(q.awarded) || q.awarded < 0 || q.awarded > q.points)) {
      setError('أكمل نص السؤال وإجابة المتقدم وعلامة صحيحة لكل سؤال.')
      return
    }
    setSaving(true); setError('')
    try {
      const result = await apiSaveOralEvaluation(user.token, examId, { examineeName: selectedName, questions: payload })
      setCompleted((prev) => ({ ...prev, [selectedName]: { score: result.attempt.score, maxScore: result.attempt.maxScore, percent: result.attempt.percent } }))
      setMessage(`تم حفظ تقييم ${selectedName}: ${result.attempt.score}/${result.attempt.maxScore} (${result.attempt.percent}%)`)
      setSelectedName(''); setQuestions([]); setMode('choose')
    } catch (err) { setError(err instanceof Error ? err.message : 'فشل حفظ التقييم') }
    finally { setSaving(false) }
  }

  if (loading) return <p className="text-mute">جاري تحميل المقابلة...</p>
  if (!exam) return <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-error">{error || 'الاختبار غير موجود'}</div>

  if (!selectedName) return <div className="space-y-5">
    <Link to={`/admin/results/${exam.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-gold"><ArrowRight className="h-4 w-4" /> رجوع للنتائج</Link>
    <div><h1 className="text-2xl font-extrabold text-light-gold">قائمة المقابلات الشفهية</h1><p className="mt-1 text-sm text-mute">اختر متقدماً لبدء تقييمه. لا يوجد أي إجراء مطلوب من الممتحَن.</p></div>
    {message && <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{message}</div>}
    {error && <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
    {!candidates.length ? <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute">لا توجد قائمة متقدمين لهذا الاختبار. أنشئ الاختبار مع قائمة الأسماء.</div> : <div className="space-y-6">{groupedCandidates.map(([jobTitle, list]) => (
      <div key={jobTitle}>
        <h2 className="mb-3 text-sm font-extrabold text-gold">{jobTitle} <span className="font-normal text-mute">({list.length})</span></h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map(({ name }, index) => {
          const done = completed[name]
          return <div key={`${name}-${index}`} className="rounded-2xl border border-line bg-card p-4"><div className="mb-3 font-bold text-text">{name}</div>{done ? <div className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="h-4 w-4" /> تم التقييم: {done.score}/{done.maxScore} ({done.percent ?? 0}%)</div> : <button type="button" onClick={() => openCandidate(name)} className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-sm font-bold text-ink"><Play className="h-4 w-4" /> بدء التقييم</button>}</div>
        })}</div>
      </div>
    ))}</div>}
  </div>

  return <div className="space-y-5">
    <button type="button" onClick={() => { setSelectedName(''); setMode('choose'); setQuestions([]); setError('') }} className="inline-flex items-center gap-1 text-sm font-bold text-gold"><ArrowRight className="h-4 w-4" /> قائمة المتقدمين</button>
    <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5"><p className="text-xs font-bold text-mute">تقييم شفهي</p><h1 className="mt-1 text-2xl font-extrabold text-light-gold">{selectedName}</h1><p className="mt-1 text-sm text-text-2">المقابِل يدوّن الإجابة ويمنح علامة كل سؤال؛ لا تظهر هذه الصفحة للمتقدم.</p></div>
    {error && <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
    {mode === 'choose' && <div className="grid gap-4 sm:grid-cols-2"><button type="button" onClick={() => setMode('generated')} className="rounded-2xl border border-gold/40 bg-panel p-6 text-right hover:bg-gold/10"><ClipboardList className="mb-3 h-7 w-7 text-gold" /><h2 className="font-extrabold text-light-gold">إنشاء أسئلة من البنك</h2><p className="mt-1 text-sm text-mute">حدد العدد ونوع/محور الأسئلة، ثم قيّم إجابة المتقدم يدوياً.</p></button><button type="button" onClick={() => setMode('manual')} className="rounded-2xl border border-line bg-panel p-6 text-right hover:border-gold/50"><PenLine className="mb-3 h-7 w-7 text-gold" /><h2 className="font-extrabold text-light-gold">أسئلة يدوية</h2><p className="mt-1 text-sm text-mute">اكتب أسئلة المقابلة بنفسك، وحدد علامة كل سؤال وإجابة المتقدم.</p></button></div>}
    {(mode === 'generated' || mode === 'manual') && <div className="space-y-4 rounded-2xl border border-line bg-card p-5"><h2 className="font-extrabold text-light-gold">{mode === 'generated' ? 'إعداد أسئلة من البنك' : 'إعداد أسئلة يدوية'}</h2><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-text-2">عدد الأسئلة<input type="number" min={1} max={mode === 'generated' ? Math.max(1, bank.length) : 30} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text outline-none" /></label>{mode === 'generated' && <label className="text-sm font-bold text-text-2">نوع / محور الأسئلة<select value={topic} onChange={(e) => setTopic(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text outline-none"><option value="all">كل المحاور</option>{topics.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}</div><button type="button" onClick={mode === 'generated' ? createGeneratedQuestions : createManualQuestions} className="rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink">متابعة إلى التقييم</button></div>}
    {mode === 'evaluate' && <><div className="space-y-4">{questions.map((q, index) => <div key={q.id} className="rounded-2xl border border-line bg-card p-4"><div className="mb-3 font-bold text-light-gold">السؤال {index + 1}</div>{q.answerKey && <details className="mb-3 text-sm text-gold"><summary>الإجابة النموذجية ومعيار التقييم</summary><p className="mt-2 whitespace-pre-wrap">{q.answerKey}</p></details>}<label className="block text-xs font-bold text-mute">نص السؤال<textarea value={q.text} readOnly={!q.id.startsWith('manual-')} onChange={(e) => updateQuestion(index, { text: e.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-text outline-none disabled:opacity-70" /></label><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_130px_130px]"><label className="text-xs font-bold text-mute">إجابة المتقدم<textarea value={q.answer} onChange={(e) => updateQuestion(index, { answer: e.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-text outline-none" /></label><label className="text-xs font-bold text-mute">علامة السؤال<input type="number" readOnly={!!exam.jobBased} min={1} value={q.points} onChange={(e) => updateQuestion(index, { points: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text outline-none" /></label><label className="text-xs font-bold text-mute">الدرجة الممنوحة<input type="number" min={0} max={q.points} value={q.awarded} onChange={(e) => updateQuestion(index, { awarded: e.target.value })} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text outline-none" /></label></div></div>)}</div><div className="sticky bottom-4 flex justify-end"><button type="button" disabled={saving} onClick={() => void saveEvaluation()} className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink shadow-lg disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'جاري الحفظ...' : 'حفظ النتيجة النهائية'}</button></div></>}
  </div>
}
