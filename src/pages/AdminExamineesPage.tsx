import { ArrowLeft, Check, Download, Pencil, Trash2, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  apiDeleteExaminee,
  apiExamineeFilters,
  apiListExaminees,
  apiUpdateExamineeRank,
  type ExamineeSummary,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AdminListToolbar } from '../components/AdminListToolbar'
import { CATEGORY_META, type ExamCategory } from '../data/types'
import { exportExamineesScoresExcel } from '../utils/parseRosterExcel'

const CATEGORY_FILTERS: { id: 'all' | ExamCategory; label: string }[] = [
  { id: 'all', label: 'كل الأنواع' },
  { id: 'theory', label: CATEGORY_META.theory.label },
  { id: 'oral', label: CATEGORY_META.oral.label },
  { id: 'driving', label: CATEGORY_META.driving.label },
  { id: 'personality', label: CATEGORY_META.personality.label },
]

export function AdminExamineesPage() {
  const { user } = useAuth()
  const isCommander = user?.role === 'commander'
  const isAdmin = user?.role === 'admin'
  const [list, setList] = useState<ExamineeSummary[]>([])
  const [orgs, setOrgs] = useState<string[]>([])
  const [jobs, setJobs] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExamCategory>('all')
  const [orgFilter, setOrgFilter] = useState('all')
  const [jobFilter, setJobFilter] = useState('all')
  const [sort, setSort] = useState('date_desc')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [draftRank, setDraftRank] = useState('')
  const [savingRank, setSavingRank] = useState(false)

  async function load() {
    if (!user?.token) return
    setLoading(true)
    try {
      const [examinees, filters] = await Promise.all([
        apiListExaminees(user.token),
        apiExamineeFilters(user.token),
      ])
      setList(examinees)
      setOrgs(filters.orgs)
      setJobs(filters.jobs)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [user?.token])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = list.filter((e) => {
      if (categoryFilter !== 'all' && !e.categories.includes(categoryFilter)) return false
      if (orgFilter !== 'all' && (e.org || '') !== orgFilter) return false
      if (jobFilter !== 'all' && (e.jobTitle || '') !== jobFilter) return false
      if (!q) return true
      const hay = [
        e.examineeName,
        ...(e.examineeIds || []),
        e.org,
        e.jobTitle,
        e.rank,
        ...e.categories.map((c) => CATEGORY_META[c]?.label || c),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'name_asc':
          return a.examineeName.localeCompare(b.examineeName, 'ar')
        case 'name_desc':
          return b.examineeName.localeCompare(a.examineeName, 'ar')
        case 'org_asc':
          return (a.org || '').localeCompare(b.org || '', 'ar')
        case 'job_asc':
          return (a.jobTitle || '').localeCompare(b.jobTitle || '', 'ar')
        case 'exams_desc':
          return b.examCount - a.examCount
        case 'exams_asc':
          return a.examCount - b.examCount
        case 'percent_desc':
          return (b.finalPercent ?? -1) - (a.finalPercent ?? -1)
        case 'percent_asc':
          return (a.finalPercent ?? 999) - (b.finalPercent ?? 999)
        case 'date_asc':
          return String(a.lastFinishedAt).localeCompare(String(b.lastFinishedAt))
        case 'date_desc':
        default:
          return String(b.lastFinishedAt).localeCompare(String(a.lastFinishedAt))
      }
    })

    return rows
  }, [list, search, categoryFilter, orgFilter, jobFilter, sort])

  async function removeExaminee(item: ExamineeSummary) {
    if (!user?.token) return
    const ok = window.confirm(`حذف «${item.examineeName}» من الممتحنين؟\nيختفي من القوائم، وتبقى نتيجته في الأرشيف.`)
    if (!ok) return
    try {
      await apiDeleteExaminee(user.token, item.applicantId || item.examineeName)
      setList((prev) => prev.filter((row) => (row.applicantId || row.examineeName) !== (item.applicantId || item.examineeName)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف الممتحن')
    }
  }

  async function saveRank(item: ExamineeSummary) {
    if (!user?.token) return
    setSavingRank(true)
    try {
      const identifier = item.applicantId || item.examineeName
      const res = await apiUpdateExamineeRank(user.token, identifier, draftRank)
      setList((prev) =>
        prev.map((e) => ((e.applicantId || e.examineeName) === identifier ? { ...e, rank: res.rank } : e)),
      )
      setEditingName(null)
      setDraftRank('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حفظ الرتبة')
    } finally {
      setSavingRank(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-light-gold">الممتحنون</h1>
        <p className="mt-1 text-sm text-mute">
          يظهر هنا من سُجّلت له نتيجة امتحان. البحث والتصفية حسب الجهة والمسمى
          {isCommander ? ' — يمكنك تعديل الرتب من عمود القائد.' : '.'}
        </p>
        {!loading && filtered.length > 0 && (
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-bold text-light-gold"
            onClick={() => {
              void exportExamineesScoresExcel(filtered).catch(() => setError('تعذر تصدير ملف العلامات'))
            }}
          >
            <Download className="h-4 w-4" />
            تصدير العلامات إلى إكسل
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      {!loading && list.length > 0 && (
        <AdminListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="ابحث بالاسم أو المعرّف أو الجهة أو المسمى..."
          filters={[
            {
              id: 'category',
              label: 'نوع الاختبار',
              value: categoryFilter,
              options: CATEGORY_FILTERS,
              onChange: (v) => setCategoryFilter(v as 'all' | ExamCategory),
            },
            {
              id: 'org',
              label: 'الجهة',
              value: orgFilter,
              options: [
                { id: 'all', label: 'كل الجهات' },
                ...orgs.map((o) => ({ id: o, label: o })),
              ],
              onChange: setOrgFilter,
            },
            {
              id: 'job',
              label: 'المسمى الوظيفي',
              value: jobFilter,
              options: [
                { id: 'all', label: 'كل المسميات' },
                ...jobs.map((j) => ({ id: j, label: j })),
              ],
              onChange: setJobFilter,
            },
          ]}
          sortValue={sort}
          sortOptions={[
            { id: 'date_desc', label: 'الأحدث تسليماً' },
            { id: 'date_asc', label: 'الأقدم تسليماً' },
            { id: 'name_asc', label: 'الاسم أ–ي' },
            { id: 'name_desc', label: 'الاسم ي–أ' },
            { id: 'org_asc', label: 'الجهة' },
            { id: 'job_asc', label: 'المسمى الوظيفي' },
            { id: 'percent_desc', label: 'أعلى متوسط' },
            { id: 'percent_asc', label: 'أقل متوسط' },
            { id: 'exams_desc', label: 'أكثر اختبارات' },
            { id: 'exams_asc', label: 'أقل اختبارات' },
          ]}
          onSortChange={setSort}
          shown={filtered.length}
          total={list.length}
          onReset={() => {
            setSearch('')
            setCategoryFilter('all')
            setOrgFilter('all')
            setJobFilter('all')
            setSort('date_desc')
          }}
        />
      )}

      {loading ? (
        <p className="text-mute">جاري التحميل...</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute">
          <Users className="mx-auto mb-3 h-10 w-10 opacity-50" />
          لا يوجد ممتحنون بعد.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute">
          لا توجد نتائج مطابقة للبحث أو التصفية.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-panel text-mute">
              <tr>
                <th className="px-4 py-3 text-right font-bold">المعرّف</th>
                <th className="px-4 py-3 text-right font-bold">الممتحن</th>
                <th className="px-4 py-3 text-right font-bold">الجهة</th>
                <th className="px-4 py-3 text-right font-bold">المسمى الوظيفي</th>
                {isCommander && (
                  <th className="px-4 py-3 text-right font-bold text-gold">الرتبة (القائد)</th>
                )}
                <th className="px-4 py-3 text-right font-bold">عدد الاختبارات</th>
                <th className="px-4 py-3 text-right font-bold">المتوسط النهائي</th>
                <th className="px-4 py-3 text-right font-bold">آخر تسليم</th>
                <th className="px-4 py-3 text-right font-bold">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.applicantId || e.examineeName} className="border-t border-line bg-card">
                  <td className="px-4 py-3 font-mono text-xs text-gold" dir="ltr">
                    {e.examineeIds?.length ? e.examineeIds.join(' · ') : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-text">{e.examineeName}</td>
                  <td className="px-4 py-3 text-text-2">{e.org || '—'}</td>
                  <td className="px-4 py-3 text-text-2">{e.jobTitle || '—'}</td>
                  {isCommander && (
                    <td className="px-4 py-3">
                      {editingName === (e.applicantId || e.examineeName) ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={draftRank}
                            onChange={(ev) => setDraftRank(ev.target.value)}
                            className="w-28 rounded-lg border border-gold/50 bg-panel px-2 py-1 text-xs text-text outline-none"
                            placeholder="الرتبة"
                            autoFocus
                          />
                          <button
                            type="button"
                            disabled={savingRank}
                            onClick={() => void saveRank(e)}
                            className="rounded-lg bg-ok/20 p-1.5 text-ok"
                            title="حفظ"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingName(null)
                              setDraftRank('')
                            }}
                            className="rounded-lg bg-error/10 p-1.5 text-error"
                            title="إلغاء"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingName(e.applicantId || e.examineeName)
                            setDraftRank(e.rank || '')
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-bold text-gold"
                        >
                          <Pencil className="h-3 w-3" />
                          {e.rank || 'تعيين رتبة'}
                        </button>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-text-2">{e.examCount}</td>
                  <td className="px-4 py-3 font-bold text-light-gold">
                    {e.finalPercent != null ? `${e.finalPercent}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-mute">
                    {new Date(e.lastFinishedAt).toLocaleString('ar-SA')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/admin/examinees/${encodeURIComponent(e.applicantId || e.examineeName)}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink"
                      >
                        النتائج <ArrowLeft className="h-3.5 w-3.5" />
                      </Link>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => void removeExaminee(e)}
                          className="inline-flex items-center gap-1 rounded-lg border border-error/40 px-2.5 py-1.5 text-xs font-bold text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> حذف
                        </button>
                      )}
                    </div>
                    {e.categories?.length > 0 && (
                      <div className="mt-1 text-[11px] text-mute">
                        {e.categories.map((c) => CATEGORY_META[c]?.label || c).join(' · ')}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
