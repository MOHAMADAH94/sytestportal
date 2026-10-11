import { CheckCircle2, HelpCircle, Search, ShieldAlert, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  apiListSecurityQueue,
  apiSaveSecurityReview,
  apiSaveSecurityReviewsBulk,
  type SecurityQueueItem,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'

type Decision = 'accepted' | 'rejected' | 'unspecified'
type QueueFilter = 'all' | 'pending' | 'accepted' | 'rejected' | 'unspecified' | 'applicants' | 'examinees' | 'no_exam'

const DECISION_LABEL: Record<Decision, string> = {
  accepted: 'قبول',
  rejected: 'رفض',
  unspecified: 'غير محدد',
}

export function AdminSecurityReviewPage() {
  const { user } = useAuth()
  const [list, setList] = useState<SecurityQueueItem[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<QueueFilter>('pending')
  const [selected, setSelected] = useState<SecurityQueueItem | null>(null)
  const [decision, setDecision] = useState<Decision>('accepted')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  async function load() {
    if (!user?.token) return
    setLoading(true)
    try {
      const rows = await apiListSecurityQueue(user.token)
      setList(rows)
      setError('')
      if (selected) {
        const fresh = rows.find((row) => row.id === selected.id) || null
        setSelected(fresh)
        if (fresh?.review) {
          setDecision(fresh.review.decision)
          setNote(fresh.review.note || '')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الأمن')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [user?.token])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((row) => {
      const status = row.review?.decision || 'pending'
      if (filter === 'applicants' && row.examProgress !== 'partial') return false
      if (filter === 'examinees' && row.examProgress !== 'complete') return false
      if (filter === 'no_exam' && row.examProgress !== 'none') return false
      if (['pending', 'accepted', 'rejected', 'unspecified'].includes(filter) && status !== filter) return false
      if (!q) return true
      return [row.name, row.jobTitle, row.org, row.interviewType, row.displayId, row.streamLabel, row.examProgressLabelAr]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [list, search, filter])

  const counts = useMemo(() => ({
    all: list.length,
    pending: list.filter((r) => !r.review).length,
    accepted: list.filter((r) => r.review?.decision === 'accepted').length,
    rejected: list.filter((r) => r.review?.decision === 'rejected').length,
    unspecified: list.filter((r) => r.review?.decision === 'unspecified').length,
    applicants: list.filter((r) => r.examProgress === 'partial').length,
    examinees: list.filter((r) => r.examProgress === 'complete').length,
    no_exam: list.filter((r) => r.examProgress === 'none').length,
  }), [list])

  function openReview(row: SecurityQueueItem) {
    setSelected(row)
    setDecision(row.review?.decision || (row.examProgress === 'none' ? 'unspecified' : 'accepted'))
    setNote(row.review?.note || '')
    setMessage('')
    setError('')
  }

  async function save() {
    if (!user?.token) return
    const ids = picked.length ? picked : selected ? [selected.id] : []
    if (!ids.length) {
      setError('حدد متقدماً واحداً على الأقل')
      return
    }
    if (decision === 'rejected' && !note.trim()) {
      setError('أضف ملاحظة عند الرفض')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (ids.length === 1 && !picked.length) {
        await apiSaveSecurityReview(user.token, ids[0], { decision, note })
      } else {
        await apiSaveSecurityReviewsBulk(user.token, { applicantIds: ids, decision, note })
      }
      setMessage(`تم تسجيل قرار «${DECISION_LABEL[decision]}» لـ ${ids.length} متقدم`)
      setPicked([])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ القرار الأمني')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-light-gold">مراجعة الأمن العسكري</h1>
        <p className="mt-1 text-sm text-mute">
          فرز المتقدمين والممتحنين حسب استكمال الاختبارات. خيار «غير محدد» لمن لم يتقدم لأي اختبار. القبول والرفض قرار أمني فقط بلا درجات.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          { id: 'applicants' as const, label: 'متقدمون (بعض الاختبارات)', count: counts.applicants },
          { id: 'examinees' as const, label: 'ممتحنون (أكملوا المطلوب)', count: counts.examinees },
          { id: 'no_exam' as const, label: 'غير محدد — بلا أي اختبار', count: counts.no_exam },
          { id: 'all' as const, label: 'الكل', count: counts.all },
        ]).map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={`rounded-2xl border p-4 text-right ${filter === chip.id ? 'border-gold bg-gold/15' : 'border-line bg-card'}`}
          >
            <div className="font-extrabold text-light-gold">{chip.label}</div>
            <div className="mt-1 text-sm text-mute">{chip.count}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          { id: 'pending' as const, label: 'بانتظار القرار', count: counts.pending },
          { id: 'accepted' as const, label: 'مقبول', count: counts.accepted },
          { id: 'rejected' as const, label: 'مرفوض', count: counts.rejected },
          { id: 'unspecified' as const, label: 'قرار غير محدد', count: counts.unspecified },
        ]).map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={`rounded-2xl border p-4 text-right ${filter === chip.id ? 'border-gold bg-gold/15' : 'border-line bg-card'}`}
          >
            <div className="font-extrabold text-light-gold">{chip.label}</div>
            <div className="mt-1 text-sm text-mute">{chip.count}</div>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-line bg-panel py-2 pr-10 pl-3 text-sm text-text outline-none"
          placeholder="بحث بالاسم أو المسمى أو الجهة أو الفرز"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => setPicked(filtered.map((row) => row.id))}>
          تحديد الظاهر ({filtered.length})
        </button>
        <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => setPicked([])}>
          إلغاء التحديد
        </button>
        <span className="self-center text-sm text-mute">المحدد: {picked.length}</span>
      </div>

      {error && <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
      {message && <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{message}</div>}

      {loading ? (
        <p className="text-mute">جاري التحميل...</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid max-h-[70vh] gap-2 overflow-auto">
            {filtered.map((row) => (
              <div
                key={row.id}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-right transition ${
                  selected?.id === row.id ? 'border-gold bg-gold/10' : 'border-line bg-card'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={picked.includes(row.id)}
                  aria-label={`تحديد ${row.name}`}
                  onChange={(event) => setPicked((prev) => event.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))}
                />
                <button
                  type="button"
                  onClick={() => openReview(row)}
                  className="min-w-0 flex-1 text-right"
                >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-gold">م {row.seqNumber}</div>
                    <div className="font-extrabold text-light-gold">{row.name}</div>
                    <div className="mt-1 text-xs text-mute">
                      {row.jobTitle || 'بلا مسمى'}
                      {row.org ? ` • ${row.org}` : ''}
                      {row.streamLabel ? ` • فرز ${row.streamLabel}` : ''}
                    </div>
                    <div className="mt-1 text-[11px] text-mute">
                      {row.examProgressLabelAr || '—'}
                      {row.requiredTracks?.length ? ` — ${row.requiredTracks.join('، ')}` : ''}
                    </div>
                  </div>
                  {!row.review ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-mute">
                      <ShieldAlert className="h-3.5 w-3.5" /> بانتظار
                    </span>
                  ) : row.review.decision === 'accepted' ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-ok/40 bg-ok/10 px-2 py-1 text-[11px] text-ok">
                      <CheckCircle2 className="h-3.5 w-3.5" /> مقبول
                    </span>
                  ) : row.review.decision === 'rejected' ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-error/40 bg-error/10 px-2 py-1 text-[11px] text-error">
                      <XCircle className="h-3.5 w-3.5" /> مرفوض
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn">
                      <HelpCircle className="h-3.5 w-3.5" /> غير محدد
                    </span>
                  )}
                </div>
                </button>
              </div>
            ))}
            {!filtered.length && <div className="rounded-2xl border border-line p-8 text-center text-mute">لا يوجد متقدمون في هذا العرض.</div>}
          </div>

          <div className="rounded-2xl border border-line bg-panel p-5">
            {!selected && !picked.length ? (
              <p className="text-sm text-mute">حدد متقدمين ثم سجّل قبولاً أو رفضاً أو غير محدد.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-extrabold text-light-gold">{picked.length > 1 ? `${picked.length} متقدمين محددين` : selected?.name || `${picked.length} متقدم`}</h2>
                  <p className="mt-1 text-sm text-mute">
                    {picked.length > 1 ? 'يُطبَّق القرار والملاحظة على كل المحدد.' : (selected?.jobTitle || 'بلا مسمى')}
                    {picked.length <= 1 && selected?.org ? ` • ${selected.org}` : ''}
                    {picked.length <= 1 && selected?.streamLabel ? ` • فرز ${selected.streamLabel}` : ''}
                    {picked.length <= 1 && selected?.examProgressLabelAr ? ` • ${selected.examProgressLabelAr}` : ''}
                  </p>
                </div>

                {selected?.review && picked.length <= 1 && (
                  <div className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-mute">
                    آخر قرار: {selected.review.decisionLabelAr} — {selected.review.reviewedByName} —{' '}
                    {new Date(selected.review.reviewedAt).toLocaleString('ar')}
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setDecision('accepted')}
                    className={`rounded-xl border px-4 py-3 font-bold ${decision === 'accepted' ? 'border-ok bg-ok/15 text-ok' : 'border-line bg-card text-mute'}`}
                  >
                    قبول
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('rejected')}
                    className={`rounded-xl border px-4 py-3 font-bold ${decision === 'rejected' ? 'border-error bg-error/15 text-error' : 'border-line bg-card text-mute'}`}
                  >
                    رفض
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('unspecified')}
                    className={`rounded-xl border px-4 py-3 font-bold ${decision === 'unspecified' ? 'border-warn bg-warn/15 text-warn' : 'border-line bg-card text-mute'}`}
                  >
                    غير محدد
                  </button>
                </div>

                <label className="block text-xs font-bold text-mute">
                  ملاحظة {decision === 'rejected' ? '(مطلوبة عند الرفض)' : '(اختياري)'}
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-text outline-none"
                    placeholder={
                      decision === 'rejected'
                        ? 'سبب الرفض الأمني...'
                        : decision === 'unspecified'
                          ? 'لم يتقدم لأي اختبار أو لم يُحسم قراره بعد...'
                          : 'ملاحظة أمنية إن وجدت...'
                    }
                  />
                </label>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="w-full rounded-xl bg-gold px-4 py-3 text-sm font-bold text-ink disabled:opacity-40"
                >
                  {saving ? 'جاري الحفظ...' : picked.length > 1 ? `تطبيق القرار على ${picked.length}` : 'حفظ قرار الأمن'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
