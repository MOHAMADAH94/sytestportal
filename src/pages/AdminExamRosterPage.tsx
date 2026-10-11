import { FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiExamRoster, apiAdminExamQuestions, type RosterAccount } from '../api/client'
import { openPrintWindow } from '../utils/printPdf'
import { useAuth } from '../auth/AuthContext'
import { RosterCards, rosterEnterUrls } from '../components/RosterCards'
import { exportRosterExcel } from '../utils/parseRosterExcel'

export function AdminExamRosterPage() {
  const { examId } = useParams<{ examId: string }>()
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [roster, setRoster] = useState<RosterAccount[]>([])
  const [publicAppUrl, setPublicAppUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [jobBased, setJobBased] = useState(false)
  const [pendingQuestions, setPendingQuestions] = useState(false)
  const [showBarcode, setShowBarcode] = useState(true)
  const [printing, setPrinting] = useState('')
  async function print(name: string, mode: 'exam' | 'answer_key') {
    if (!user || !examId) return
    setPrinting(name)
    try {
      const { exam, questions } = await apiAdminExamQuestions(user.token, examId, name)
      openPrintWindow({ id: exam.id, title: exam.title + ' — ' + name, category: exam.category, level: exam.level, role: exam.oralRole || undefined, questionCount: questions.length, questionIds: questions.map((q) => q.id), createdAt: exam.createdAt }, questions, mode)
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الطباعة') }
    finally { setPrinting('') }
  }

  useEffect(() => {
    if (!user?.token || !examId) return
    apiExamRoster(user.token, examId)
      .then((res) => {
        setTitle(res.exam.title)
        setJobBased(!!res.exam.jobBased)
        setPendingQuestions(!!res.exam.pendingQuestions)
        setShowBarcode(res.exam.showsBarcode !== false)
        setRoster(res.roster)
        setPublicAppUrl(res.publicAppUrl)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'فشل التحميل'))
      .finally(() => setLoading(false))
  }, [user?.token, examId])

  if (loading) return <p className="text-mute">جاري تحميل قائمة الممتحنين...</p>
  if (error) {
    return (
      <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-error">
        {error}
        <Link to="/admin" className="mt-3 block font-bold text-gold">
          رجوع
        </Link>
      </div>
    )
  }

  if (!roster.length) {
    return (
      <div className="rounded-xl border border-line bg-card p-6 text-center text-mute">
        لا توجد قائمة ممتحنين مرفوعة لهذا الاختبار.
        <Link to="/admin" className="mt-3 block font-bold text-gold">
          رجوع
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {pendingQuestions && (
        <div className="space-y-3 rounded-xl border border-error/40 bg-error/10 p-4 text-error">
          <p className="font-bold">
            {showBarcode
              ? 'الاختبار مسودة ولم تُستكمل أسئلته — بطاقات QR غير صالحة للمسح حتى اكتمال الأسئلة وتفعيل الاختبار.'
              : 'الاختبار مسودة ولم تُستكمل أسئلته. هذا المسار لا يطبع باركود دخول.'}
          </p>
          <Link className="inline-flex rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink" to={'/admin/complete-questions/' + examId}>
            استكمال الأسئلة الآن
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-light-gold">{showBarcode ? 'بطاقات الممتحنين' : 'قائمة الممتحنين'}</h1>
          <p className="mt-1 text-sm text-mute">{title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!pendingQuestions && showBarcode && (
            <button
              type="button"
              onClick={() => exportRosterExcel(title, rosterEnterUrls(roster, publicAppUrl))}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-text"
            >
              <FileDown className="h-4 w-4" /> تصدير Excel
            </button>
          )}
          <Link to="/admin" className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-text">
            قائمة الاختبارات
          </Link>
        </div>
      </div>

      {jobBased && !pendingQuestions && (
        <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-bold text-gold">نماذج الأسئلة المحفوظة لكل متقدم</h2>
          <p className="text-sm text-mute">كل نموذج يطابق الأسئلة المخصصة لصاحب البطاقة، بما فيها ترتيب الأسئلة والخيارات.</p>
          {roster.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
              <span>{row.name} — {row.jobTitle}</span>
              <div className="flex gap-3">
                <button disabled={!!printing} onClick={() => print(row.name, 'exam')} className="rounded-xl border border-line px-3 py-2 text-sm">نموذج الأسئلة</button>
                <button disabled={!!printing} onClick={() => print(row.name, 'answer_key')} className="rounded-xl border border-line px-3 py-2 text-sm">مفتاح الإجابة</button>
              </div>
            </div>
          ))}
        </section>
      )}
      {pendingQuestions ? (
        <p className="rounded-xl border border-line p-4 text-mute">
          {showBarcode
            ? 'ستظهر بطاقات QR هنا تلقائياً بعد استكمال أسئلة جميع المجموعات وتفعيل الاختبار.'
            : 'ستظهر أسماء الممتحنين هنا بعد استكمال الأسئلة، دون باركود.'}
        </p>
      ) : (
        <RosterCards examTitle={title} roster={roster} publicAppUrl={publicAppUrl} showBarcode={showBarcode} />
      )}
    </div>
  )
}
