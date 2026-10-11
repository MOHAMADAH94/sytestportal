import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  apiEnrollApplicant,
  apiListExams,
  apiSearchCorrections,
  apiUpdateApplicant,
  type AdminExam,
  type CorrectionPerson,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { EditResultModal } from '../components/EditResultModal'
import { CATEGORY_META, type ExamCategory } from '../data/types'

const emptyForm = {
  name: '',
  org: '',
  jobTitle: '',
  jobTitleOrg: '',
  jobTitleCommittee: '',
  rank: '',
  proposedSalary: '',
  approvedSalary: '',
}

export function AdminCorrectionsPage() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<CorrectionPerson[]>([])
  const [selected, setSelected] = useState<CorrectionPerson | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [exams, setExams] = useState<AdminExam[]>([])
  const [pickedExams, setPickedExams] = useState<string[]>([])
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user?.token) return
    void apiListExams(user.token)
      .then((rows) => setExams(rows.filter((exam) => exam.active !== false)))
      .catch(() => setExams([]))
  }, [user?.token])

  useEffect(() => {
    if (!selected) return
    setForm({
      name: selected.name,
      org: selected.org,
      jobTitle: selected.jobTitle,
      jobTitleOrg: selected.jobTitleOrg,
      jobTitleCommittee: selected.jobTitleCommittee,
      rank: selected.rank,
      proposedSalary: selected.proposedSalary == null ? '' : String(selected.proposedSalary),
      approvedSalary: selected.approvedSalary == null ? '' : String(selected.approvedSalary),
    })
    setPickedExams([])
  }, [selected])

  async function search() {
    if (!user?.token || query.trim().length < 2) return
    setBusy(true)
    setError('')
    try {
      const result = await apiSearchCorrections(user.token, query.trim())
      setPeople(result.people)
      setSelected(result.people[0] || null)
      if (!result.people.length) setMessage('لا يوجد تطابق.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل البحث')
    } finally {
      setBusy(false)
    }
  }

  async function saveData() {
    if (!user?.token || !selected || !form.name.trim()) return
    setBusy(true)
    setError('')
    try {
      await apiUpdateApplicant(user.token, selected.id, {
        name: form.name.trim(),
        org: form.org,
        jobTitle: form.jobTitle,
        jobTitleOrg: form.jobTitleOrg,
        jobTitleCommittee: form.jobTitleCommittee,
        rank: form.rank,
        proposedSalary: form.proposedSalary.trim() === '' ? null : Number(form.proposedSalary),
        approvedSalary: form.approvedSalary.trim() === '' ? null : Number(form.approvedSalary),
      })
      setMessage(`حُفظت بيانات «${form.name.trim()}».`)
      const result = await apiSearchCorrections(user.token, form.name.trim())
      setPeople(result.people)
      setSelected(result.people.find((person) => person.id === selected.id) || result.people[0] || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ البيانات')
    } finally {
      setBusy(false)
    }
  }

  async function enroll() {
    if (!user?.token || !selected || !pickedExams.length) return
    setBusy(true)
    setError('')
    const joined: string[] = []
    const failed: string[] = []
    for (const examId of pickedExams) {
      const exam = exams.find((item) => item.id === examId)
      try {
        await apiEnrollApplicant(user.token, examId, selected.id)
        joined.push(exam?.title || examId)
      } catch (err) {
        failed.push(`${exam?.title || 'اختبار'}: ${err instanceof Error ? err.message : 'تعذر الإلحاق'}`)
      }
    }
    setMessage(
      `${joined.length ? `أُلحق بـ: ${joined.join('، ')}` : ''}${failed.length ? `${joined.length ? '. ' : ''}تعذر: ${failed.join(' — ')}` : ''}`,
    )
    try {
      const result = await apiSearchCorrections(user.token, selected.name)
      setPeople(result.people)
      setSelected(result.people.find((person) => person.id === selected.id) || null)
    } catch {
      /* البحث التالي يعيد الحالة */
    }
    setBusy(false)
  }

  const editing = selected?.attempts.find((attempt) => attempt.id === attemptId) || null
  const openExams = exams.filter((exam) => selected && !selected.enrolledExamIds.includes(exam.id))

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-gold">تصحيح البيانات والنتائج</h1>
        <p className="mt-1 text-sm text-mute">
          ابحث عن المتقدم، عدّل بياناته، أو ألحقه باختبار مفعّل. تعديل العلامة يمر بسجل السبب نفسه.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm text-text outline-none"
          placeholder="اسم أو مسمى أو جهة"
        />
        <button type="submit" disabled={busy || query.trim().length < 2} className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40">
          <Search className="h-4 w-4" aria-hidden />
          بحث
        </button>
      </form>

      {error && <p className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}
      {message && <p className="rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">{message}</p>}

      {people.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => setSelected(person)}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${selected?.id === person.id ? 'border-gold text-gold' : 'border-line text-text'}`}
            >
              {person.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
            <h2 className="font-bold text-gold">البيانات</h2>
            {(
              [
                ['name', 'الاسم'],
                ['org', 'الجهة'],
                ['jobTitle', 'المسمى'],
                ['jobTitleOrg', 'المسمى الوارد من الجهة'],
                ['jobTitleCommittee', 'المسمى المقترح من اللجنة'],
                ['rank', 'الرتبة'],
                ['proposedSalary', 'الراتب المقترح'],
                ['approvedSalary', 'الراتب المقرر'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-bold text-mute">
                {label}
                <input
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none"
                />
              </label>
            ))}
            <button type="button" disabled={busy || !form.name.trim()} onClick={() => void saveData()} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40">
              حفظ البيانات
            </button>
          </section>

          <div className="space-y-4">
            <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
              <h2 className="font-bold text-gold">النتائج</h2>
              {selected.attempts.length === 0 && <p className="text-sm text-mute">لا نتيجة مسجّلة بعد.</p>}
              {selected.attempts.map((attempt) => (
                <div key={attempt.id} className="flex items-center justify-between gap-2 border-t border-line pt-2">
                  <div>
                    <p className="text-sm font-bold">{attempt.examTitle}</p>
                    <p className="text-xs text-mute">
                      {CATEGORY_META[attempt.category as ExamCategory]?.label || attempt.category}
                      {attempt.percent == null ? '' : ` · ${attempt.percent}%`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setAttemptId(attempt.id)} className="rounded-lg border border-gold px-3 py-1.5 text-xs font-bold text-gold">
                    تعديل العلامة
                  </button>
                </div>
              ))}
            </section>

            <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
              <h2 className="font-bold text-gold">إلحاق باختبار مفعّل</h2>
              {openExams.length === 0 && <p className="text-sm text-mute">لا يوجد اختبار مفعّل خارج تسجيله الحالي.</p>}
              {openExams.map((exam) => (
                <label key={exam.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={pickedExams.includes(exam.id)}
                    onChange={(e) => setPickedExams((prev) => e.target.checked ? [...prev, exam.id] : prev.filter((id) => id !== exam.id))}
                  />
                  <span>{exam.title}</span>
                </label>
              ))}
              {openExams.length > 0 && (
                <button type="button" disabled={busy || !pickedExams.length} onClick={() => void enroll()} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40">
                  إلحاق
                </button>
              )}
            </section>
          </div>
        </div>
      )}

      {editing && selected && (
        <EditResultModal
          isOpen
          onClose={() => setAttemptId(null)}
          onSuccess={() => {
            setAttemptId(null)
            setMessage('اعتُمدت العلامة الجديدة وسُجّل السبب.')
            void search()
          }}
          attemptId={editing.id}
          candidateName={selected.name}
          examTitle={editing.examTitle}
          category={editing.category}
          currentPercent={editing.percent}
        />
      )}
    </div>
  )
}
