import { FileSpreadsheet, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  apiLeadershipBriefing,
  type DecisionStatus,
  type LeadershipBriefing,
  type LeadershipGroupRow,
  type LeadershipPeriod,
  type LeadershipPersonRow,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { exportLeadershipBriefingExcel } from '../utils/exportLeadershipBriefing'
import {
  CATEGORY_LABELS_AR,
  THRESHOLDS,
  evaluateDecision,
  normalizeThresholds,
} from '../../shared/decisionRules.js'

const STATUS_ORDER: DecisionStatus[] = ['qualified', 'conditional', 'not_qualified', 'incomplete']
const STATUS_RANK: Record<DecisionStatus, number> = {
  qualified: 0,
  conditional: 1,
  not_qualified: 2,
  incomplete: 3,
}

const STATUS_STYLES: Record<DecisionStatus, { border: string; bg: string; text: string }> = {
  qualified: { border: 'border-ok/40', bg: 'bg-ok/10', text: 'text-ok' },
  conditional: { border: 'border-warn/40', bg: 'bg-warn/10', text: 'text-warn' },
  not_qualified: { border: 'border-error/40', bg: 'bg-error/10', text: 'text-error' },
  incomplete: { border: 'border-line', bg: 'bg-panel/60', text: 'text-mute' },
}

const BANK_LABELS: Record<string, string> = {
  theory: 'عام',
  oral: 'الشفهي',
  driving: 'أهلية القيادة',
  personality: 'تقييم الشخصية',
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('ar')
  } catch {
    return iso
  }
}

function gapLabel(person: LeadershipPersonRow) {
  const pending = (person.pendingCategories || []).map((c) => CATEGORY_LABELS_AR[c] || c)
  const missing = (person.missingCategories || []).map((c) => CATEGORY_LABELS_AR[c] || c)
  const parts = [
    pending.length ? `معلّق: ${pending.join('، ')}` : '',
    missing.length ? `ناقص: ${missing.join('، ')}` : '',
  ].filter(Boolean)
  return parts.join(' · ') || '—'
}

function sortSlate(people: LeadershipPersonRow[]) {
  return [...people].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (rank !== 0) return rank
    const ca = a.compositePercent == null ? -1 : a.compositePercent
    const cb = b.compositePercent == null ? -1 : b.compositePercent
    if (cb !== ca) return cb - ca
    return a.name.localeCompare(b.name, 'ar')
  })
}

function GroupTable({
  title,
  rows,
  empty,
  onSelectLabel,
}: {
  title: string
  rows: LeadershipGroupRow[]
  empty: string
  onSelectLabel?: (label: string) => void
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gold/30 bg-card">
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
        <h3 className="text-sm font-extrabold text-gold">{title}</h3>
        <Link to="/admin/examinees" className="text-xs font-bold text-light-gold hover:underline">
          الممتحنون
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-mute">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-panel/80 text-xs text-mute">
              <tr>
                <th className="px-3 py-2 font-bold">{title === 'حسب الجهة' ? 'الجهة' : 'المسمى'}</th>
                <th className="px-3 py-2 font-bold">العدد</th>
                <th className="px-3 py-2 font-bold">اكتمال</th>
                <th className="px-3 py-2 font-bold">متوسط المركّبة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-line/50">
                  <td className="px-3 py-2 font-bold text-text">
                    {onSelectLabel ? (
                      <button
                        type="button"
                        className="text-gold hover:underline"
                        onClick={() => onSelectLabel(row.label)}
                      >
                        {row.label}
                      </button>
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className="px-3 py-2 text-light-gold">{row.applicantCount}</td>
                  <td className="px-3 py-2">
                    {row.completeCount}/{row.applicantCount}
                    <span className="mr-2 text-xs text-mute">{row.completionRate}%</span>
                  </td>
                  <td className="px-3 py-2 font-bold text-gold">
                    {row.averageComposite != null ? `${row.averageComposite}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function LeadershipBriefingPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<LeadershipPeriod>('all')
  const [data, setData] = useState<LeadershipBriefing | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [sim, setSim] = useState(THRESHOLDS)
  const [jobFilter, setJobFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | DecisionStatus>('all')
  const [slateSearch, setSlateSearch] = useState('')

  const allowed = user?.role === 'admin' || user?.role === 'commander'
  const applicantsHref = user?.role === 'admin' ? '/admin/applicants' : '/admin/examinees'

  async function load(nextPeriod: LeadershipPeriod) {
    if (!user?.token) return
    setLoading(true)
    try {
      const briefing = await apiLeadershipBriefing(user.token, nextPeriod)
      setData(briefing)
      setSim(briefing.defaultThresholds || THRESHOLDS)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل تقرير القيادة')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!allowed) return
    void load(period)
  }, [user?.token, period, allowed])

  const thresholds = useMemo(() => normalizeThresholds(sim), [sim])
  const defaults = data?.defaultThresholds || THRESHOLDS
  const simulating =
    thresholds.qualifiedComposite !== defaults.qualifiedComposite ||
    thresholds.conditionalComposite !== defaults.conditionalComposite ||
    thresholds.minPerCategory !== defaults.minPerCategory

  const simulatedPeople = useMemo(() => {
    if (!data) return []
    return data.people.map((person) => {
      const decision = evaluateDecision({
        categoryPercents: person.categoryPercents,
        pendingCategories: person.pendingCategories,
        thresholds,
      })
      return {
        ...person,
        status: decision.status as DecisionStatus,
        labelAr: decision.labelAr,
        compositePercent: decision.compositePercent,
        pendingCategories: decision.pendingCategories,
        missingCategories: decision.missingCategories,
      }
    })
  }, [data, thresholds])

  const simulatedCounts = useMemo(() => {
    const counts: Record<DecisionStatus, number> = {
      qualified: 0,
      conditional: 0,
      not_qualified: 0,
      incomplete: 0,
    }
    for (const person of simulatedPeople) counts[person.status] += 1
    return counts
  }, [simulatedPeople])

  const jobOptions = useMemo(() => {
    return [...new Set((data?.people || []).map((row) => row.jobTitle))].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [data])

  const slate = useMemo(() => {
    const q = slateSearch.trim().toLowerCase()
    return sortSlate(
      simulatedPeople.filter((person) => {
        if (jobFilter !== 'all' && person.jobTitle !== jobFilter) return false
        if (statusFilter !== 'all' && person.status !== statusFilter) return false
        if (q && !person.name.toLowerCase().includes(q) && !person.org.toLowerCase().includes(q)) return false
        return true
      }),
    )
  }, [simulatedPeople, jobFilter, statusFilter, slateSearch])

  if (!allowed) return <Navigate to="/admin" replace />

  async function exportExcel() {
    if (!data) return
    setExporting(true)
    try {
      await exportLeadershipBriefingExcel(data, { slate, simulatedCounts, simulating, thresholds })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تصدير Excel')
    } finally {
      setExporting(false)
    }
  }

  function patchSim(partial: Partial<typeof THRESHOLDS>) {
    setSim((prev) => normalizeThresholds({ ...prev, ...partial }))
  }

  return (
    <div className="print-area space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-light-gold">تقرير القيادة</h1>
          <p className="mt-1 text-sm text-mute">
            ملخص جلسة للقراءة فقط — دون تعديل التصحيح أو الأرشيف أو اعتماد اللجنة.
          </p>
          {data && (
            <p className="mt-1 text-xs text-mute">
              {data.policyVersion} · {formatWhen(data.generatedAt)}
            </p>
          )}
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-panel p-1">
            {([
              { id: 'all' as const, label: 'كل الفترات' },
              { id: '30d' as const, label: 'آخر 30 يوماً' },
            ]).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPeriod(option.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  period === option.id
                    ? 'bg-gold text-ink'
                    : 'text-mute hover:text-light-gold'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!data || exporting}
            onClick={() => void exportExcel()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gold/50 bg-gold/15 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/25 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-mute hover:border-gold hover:text-gold"
          >
            <Printer className="h-4 w-4" />
            طباعة
          </button>
        </div>
      </div>

      {data && <p className="text-xs text-mute">{data.disclaimerAr}</p>}

      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      {loading && !data ? (
        <p className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-mute">جارٍ تجهيز التقرير…</p>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'المتقدمون', value: data.kpis.applicantCount, to: applicantsHref },
              { label: 'مكتمل 4/4', value: data.kpis.completeFour, to: '/admin/examinees' },
              { label: 'قيد الاستكمال', value: data.kpis.inProgress, to: '/admin/examinees' },
              { label: 'معلّق تقييم يدوي', value: data.kpis.pendingManual, to: '/admin/examinees' },
              { label: 'اختبارات نشطة', value: data.kpis.activeExams, to: '/admin' },
            ].map((card) => (
              <Link
                key={card.label}
                to={card.to}
                className="rounded-2xl border border-gold/35 bg-card p-4 transition hover:border-gold"
              >
                <div className="text-xs font-bold text-mute">{card.label}</div>
                <div className="mt-2 text-3xl font-extrabold text-light-gold">{card.value}</div>
              </Link>
            ))}
          </section>

          <section className="no-print space-y-3 rounded-2xl border border-gold/30 bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold text-gold">محاكاة العتبات</h2>
                <p className="text-xs text-mute">
                  تجربة عرض فقط — لا تُحفظ ولا تدخل ختم الاعتماد. غير المكتمل يبقى غير مكتمل.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-mute hover:border-gold hover:text-gold"
                onClick={() => setSim(defaults)}
              >
                إعادة ضبط السياسة
              </button>
            </div>
            {simulating && (
              <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-bold text-warn">
                عرض تجريبي بالعتبات الحالية — أعداد الجدارة واللائحة تتغير، والمؤشرات الأصلية أعلاه ثابتة.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { key: 'qualifiedComposite' as const, label: 'عتبة التأهل' },
                { key: 'conditionalComposite' as const, label: 'عتبة المشروط' },
                { key: 'minPerCategory' as const, label: 'الحد الأدنى للمسار' },
              ].map((item) => (
                <label key={item.key} className="block text-sm font-bold text-text">
                  {item.label}: {thresholds[item.key]}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={thresholds[item.key]}
                    onChange={(e) => patchSim({ [item.key]: Number(e.target.value) })}
                    className="mt-2 w-full accent-gold"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-gold/30 bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-gold">تقدير الجدارة (تجميعي)</h2>
              <Link to={applicantsHref} className="text-xs font-bold text-light-gold hover:underline">
                {user?.role === 'admin' ? 'سجل المتقدمين' : 'الممتحنون'}
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STATUS_ORDER.map((status) => {
                const style = STATUS_STYLES[status]
                return (
                  <div key={status} className={`rounded-xl border ${style.border} ${style.bg} px-4 py-3`}>
                    <div className="text-xs font-bold text-mute">{data.statusLabels[status]}</div>
                    <div className={`mt-1 text-3xl font-extrabold ${style.text}`}>{simulatedCounts[status]}</div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gold/30 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-3">
              <div>
                <h2 className="text-lg font-extrabold text-gold">لائحة مفاضلة الشاغر</h2>
                <p className="text-xs text-mute">ترتيب حسب التقدير ثم المركّبة — للجلسة لا للتصحيح.</p>
              </div>
              <Link to="/admin/examinees" className="text-xs font-bold text-light-gold hover:underline">
                الممتحنون
              </Link>
            </div>
            <div className="no-print flex flex-wrap gap-2 px-4 py-3">
              <input
                value={slateSearch}
                onChange={(e) => setSlateSearch(e.target.value)}
                placeholder="بحث بالاسم أو الجهة"
                className="min-w-[180px] flex-1 rounded-xl border border-line bg-void px-3 py-2 text-sm text-text"
              />
              <select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                className="rounded-xl border border-line bg-void px-3 py-2 text-sm text-text"
              >
                <option value="all">كل المسميات</option>
                {jobOptions.map((job) => (
                  <option key={job} value={job}>{job}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | DecisionStatus)}
                className="rounded-xl border border-line bg-void px-3 py-2 text-sm text-text"
              >
                <option value="all">كل الحالات</option>
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>{data.statusLabels[status]}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-panel/80 text-xs text-mute">
                  <tr>
                    <th className="px-3 py-2 font-bold">م</th>
                    <th className="px-3 py-2 font-bold">الاسم</th>
                    <th className="px-3 py-2 font-bold">المركّبة</th>
                    <th className="px-3 py-2 font-bold">التقدير</th>
                    <th className="px-3 py-2 font-bold">النواقص</th>
                    <th className="px-3 py-2 font-bold">الجهة</th>
                    <th className="px-3 py-2 font-bold">الاعتماد</th>
                  </tr>
                </thead>
                <tbody>
                  {slate.map((person, index) => {
                    const style = STATUS_STYLES[person.status]
                    return (
                      <tr key={person.id} className="border-t border-line/50">
                        <td className="px-3 py-2 text-mute">{index + 1}</td>
                        <td className="px-3 py-2">
                          <Link
                            to={`/admin/examinees/${encodeURIComponent(person.id)}`}
                            className="font-bold text-gold hover:underline"
                          >
                            {person.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-light-gold">
                          {person.compositePercent != null ? `${person.compositePercent}%` : '—'}
                        </td>
                        <td className={`px-3 py-2 font-bold ${style.text}`}>{person.labelAr}</td>
                        <td className="px-3 py-2 text-xs text-mute">{gapLabel(person)}</td>
                        <td className="px-3 py-2">{person.org}</td>
                        <td className="px-3 py-2 text-xs">
                          {person.adoption ? (
                            <span className="font-bold text-gold">{person.adoption.adoptedLabelAr}</span>
                          ) : (
                            <span className="text-mute">بدون ختم</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {slate.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-mute">
                        لا صفوف في هذا الفلتر.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <GroupTable
              title="حسب المسمى"
              rows={data.byJob}
              empty="لا تجميع حسب المسمى بعد."
              onSelectLabel={(label) => setJobFilter(label)}
            />
            <GroupTable title="حسب الجهة" rows={data.byOrg} empty="لا تجميع حسب الجهة بعد." />
          </div>

          <section className="overflow-hidden rounded-2xl border border-gold/30 bg-card">
            <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
              <div>
                <h2 className="text-lg font-extrabold text-gold">جاهزية البنك</h2>
                <p className="text-xs text-mute">
                  مسميات يقل مخزونها عن {data.bankThreshold} سؤالاً في الشفهي أو أهلية القيادة أو تقييم الشخصية.
                </p>
              </div>
              <Link to="/banks" className="text-xs font-bold text-light-gold hover:underline">
                بنك الأسئلة
              </Link>
            </div>
            {data.bankShortages.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ok">لا نواقص دون عتبة المخزون في المسارات الثلاثة.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-panel/80 text-xs text-mute">
                    <tr>
                      <th className="px-3 py-2 font-bold">المسمى</th>
                      <th className="px-3 py-2 font-bold">الشفهي</th>
                      <th className="px-3 py-2 font-bold">أهلية القيادة</th>
                      <th className="px-3 py-2 font-bold">الشخصية</th>
                      <th className="px-3 py-2 font-bold">النواقص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bankShortages.map((row) => (
                      <tr key={row.profileId} className="border-t border-line/50">
                        <td className="px-3 py-2 font-bold text-text">{row.label}</td>
                        {(['oral', 'driving', 'personality'] as const).map((category) => (
                          <td
                            key={category}
                            className={`px-3 py-2 ${
                              (row.counts[category] || 0) < data.bankThreshold
                                ? 'font-bold text-warn'
                                : 'text-light-gold'
                            }`}
                          >
                            {row.counts[category] || 0}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-xs text-mute">
                          {row.shortCategories.map((category) => BANK_LABELS[category] || category).join('، ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
