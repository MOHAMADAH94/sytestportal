import { Archive, BookOpen, Brain, Car, CheckCircle2, ChevronDown, ChevronUp, FileText, MessageSquare, Search, Shield, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { apiListAssessmentArchive, type AssessmentArchiveRecord } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ORAL_ROLES } from '../data/types'
import { ArchiveProtectionStatus, ArchiveVersions } from '../components/ArchiveProtectionStatus'

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function getOralRoleLabel(id: string | null) {
  if (!id) return null
  return ORAL_ROLES.find((r) => r.id === id)?.label ?? id
}

const CATEGORY_MAP: Record<string, { label: string; icon: typeof FileText; badgeClass: string }> = {
  theory: {
    label: 'عام',
    icon: BookOpen,
    badgeClass: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  },
  oral: {
    label: 'شفهي',
    icon: MessageSquare,
    badgeClass: 'text-warn border-warn/30 bg-warn/10',
  },
  driving: {
    label: 'أهلية قيادة الضابط',
    icon: Car,
    badgeClass: 'text-ok border-ok/30 bg-ok/10',
  },
  personality: {
    label: 'تقييم الشخصية',
    icon: Brain,
    badgeClass: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  },
}

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_MAP[category] || {
    label: category,
    icon: FileText,
    badgeClass: 'text-mute border-line bg-card',
  }
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  )
}

function ScoreBadge({ score, maxScore, percent }: { score: number; maxScore: number; percent: number | null }) {
  const pct = percent ?? (maxScore ? Math.round((score / maxScore) * 100) : 0)
  const color =
    pct >= 80
      ? 'text-ok border-ok/40 bg-ok/10'
      : pct >= 60
        ? 'text-gold border-gold/40 bg-gold/10'
        : 'text-error border-error/40 bg-error/10'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}>
      {score}/{maxScore} ({pct}%)
    </span>
  )
}

function RecordRow({ record, canSeeRank }: { record: AssessmentArchiveRecord; canSeeRank: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const roleLabel = getOralRoleLabel(record.oralRole)
  const detail = record.detail || {}

  // استخراج تفاصيل الشفهي (سواء بالشكل الجديد أو القديم)
  const oralQuestions = Array.isArray(detail.questions)
    ? (detail.questions as Array<{ id?: string; text?: string; answer?: string; points?: number; awarded?: number }>)
    : []

  // استخراج سمات الشخصية
  const personalityTraits = Array.isArray(detail.traits)
    ? (detail.traits as Array<{ trait?: string; name?: string; score?: number; label?: string }>)
    : []

  return (
    <>
      <tr className="border-b border-line transition-colors hover:bg-card/60">
        <td className="px-4 py-3">
          <div className="text-sm font-bold text-text">{record.examineeName}</div>
          {record.displayId && <div className="text-xs text-mute">رقم: {record.displayId}</div>}
        </td>
        <td className="px-4 py-3 text-sm text-text-2">{record.org || '—'}</td>
        <td className="px-4 py-3">
          <CategoryBadge category={record.category} />
        </td>
        <td className="px-4 py-3 text-sm text-text-2">
          <div>{record.jobTitle || '—'}</div>
          {roleLabel && <div className="mt-0.5 text-xs text-mute">{roleLabel}</div>}
        </td>
        <td className="px-4 py-3 text-sm text-text-2">
          <div className="max-w-[200px] truncate" title={record.examTitle}>{record.examTitle}</div>
        </td>
        <td className="px-4 py-3">
          <ScoreBadge score={record.score} maxScore={record.maxScore} percent={record.percent} />
        </td>
        {canSeeRank && (
          <td className="px-4 py-3 text-sm text-text-2 font-medium">
            {record.rank ? (
              <span className="inline-flex items-center gap-1 rounded bg-panel px-2 py-0.5 text-xs text-light-gold">
                <Shield className="h-3 w-3" />
                {record.rank}
              </span>
            ) : (
              '—'
            )}
          </td>
        )}
        <td className="px-4 py-3 text-xs text-mute">{formatDate(record.archivedAt)}</td>
        <td className="px-4 py-3 text-xs text-mute">{record.evaluator || '—'}</td>
        <td className="px-4 py-3 text-left">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-bold text-mute transition hover:border-gold/50 hover:text-gold"
            aria-label={expanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'إخفاء' : 'تفاصيل'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-panel/50">
          <td colSpan={canSeeRank ? 10 : 9} className="px-6 py-4">
            {/* تفاصيل حسب نوع التقييم */}
            <ArchiveVersions id={record.id} />
            {(detail.type === 'evaluation_session' || Array.isArray(detail.evaluationSessions)) && <div className="mb-5 space-y-3 rounded-xl border border-gold/40 p-4"><h3 className="font-bold text-gold">جلسات الأسئلة والتقييم التفصيلي</h3>{(detail.type === 'evaluation_session' ? [{ id: detail.sessionId, mode: detail.mode, questions: detail.questions, evaluator_label: detail.evaluator }] : detail.evaluationSessions as any[]).map((session: any) => <details key={session.id} className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-gold">{session.evaluator_label || session.evaluator_key || record.evaluator} — {({ suggested: 'أسئلة مقترحة', qr: 'QR مع المراقبة', interview: 'مقابلة مباشرة', manual: 'مقابلة يدوية' } as any)[session.mode]}</summary>{session.questions?.map((q: any) => <div key={q.id} className="mt-3 space-y-1 border-t border-line pt-3 text-sm"><p className="font-bold">{q.text}</p><p>الحالة: {q.status === 'approved' ? 'معتمد' : q.status === 'excluded' ? 'مستبعد' : 'مقترح'} • المصدر: {q.source === 'manual' ? 'يدوي' : 'البنك'}</p><p>الإجابة: {q.choices?.find((c: any) => c.id === q.answer)?.text || q.answer || '—'}</p><p>الدرجة: {q.grade ?? '—'}/10 • الوزن: {q.weight}</p><p className="whitespace-pre-wrap text-mute">الإجابة النموذجية: {q.answerKey || '—'}</p></div>)}<a className="mt-3 inline-block text-gold underline" href={'/evaluation/' + record.examId + '?session=' + session.id}>فتح سجل التعديلات وأحداث المراقبة</a></details>)}</div>}
            {detail.type === 'committee' && Array.isArray(detail.members) && (
              <div className="space-y-3">
                <h3 className="font-bold text-gold">تقييم لجنة: {String(detail.committeeName || '')}</h3>
                <p className="text-xs text-mute">الأوزان والدرجات المستخدمة وقت اعتماد النتيجة.</p>
                <table className="w-full text-right text-sm"><thead className="text-mute"><tr><th className="p-2">العضو</th><th className="p-2">الوزن</th><th className="p-2">الدرجة</th><th className="p-2">المساهمة</th></tr></thead><tbody>
                  {(detail.members as Array<{ accountId: string; name: string; role: string; weight: number; score: number; contribution: number }>).map((member) => <tr key={member.accountId} className="border-t border-line"><td className="p-2">{member.name} — {member.role === 'committee_manager' ? 'مدير اللجنة' : 'عضو اللجنة'}</td><td className="p-2">{member.weight}%</td><td className="p-2">{member.score}/100</td><td className="p-2">{member.contribution.toFixed(2)}</td></tr>)}
                </tbody></table>
              </div>
            )}
            {detail.type !== 'committee' && detail.type !== 'evaluation_session' && record.category === 'oral' && (
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gold flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  أسئلة وإجابات المقابلة الشفهية ({oralQuestions.length} سؤال)
                </h3>
                {oralQuestions.length === 0 ? (
                  <p className="text-xs text-mute">لا توجد تفاصيل أسئلة مسجلة لهذه المقابلة.</p>
                ) : (
                  <div className="space-y-2.5">
                    {oralQuestions.map((q, i) => (
                      <div key={q.id || i} className="rounded-xl border border-line bg-card p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <span className="text-xs font-bold text-mute">السؤال {i + 1}</span>
                            <p className="mt-1 text-sm font-semibold text-text">{q.text || '—'}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="text-xs text-mute">الدرجة</span>
                            <div className="text-sm font-bold text-light-gold">
                              {q.awarded ?? 0} / {q.points ?? 0}
                            </div>
                          </div>
                        </div>
                        {q.answer && (
                          <div className="rounded-lg bg-panel px-3 py-2">
                            <span className="text-xs text-mute">إجابة المتقدم:</span>
                            <p className="mt-0.5 text-sm text-text-2">{q.answer}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {detail.type !== 'committee' && detail.type !== 'evaluation_session' && record.category === 'personality' && (
              <div className="space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5" />
                  تحليل سمات الشخصية
                </h3>
                {personalityTraits.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {personalityTraits.map((t, idx) => (
                      <div key={idx} className="rounded-xl border border-line bg-card p-3">
                        <div className="flex justify-between text-xs font-semibold text-text mb-1">
                          <span>{t.name || t.trait || t.label || `سمة ${idx + 1}`}</span>
                          <span className="text-purple-300">{t.score != null ? `${t.score}%` : '—'}</span>
                        </div>
                        {t.score != null && (
                          <div className="h-2 w-full overflow-hidden rounded-full bg-panel">
                            <div
                              className="h-full bg-purple-500 transition-all"
                              style={{ width: `${Math.min(Math.max(t.score, 0), 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-mute">لا توجد سمات تفصيلية مسجلة.</p>
                )}
                {typeof detail.summary === 'string' && detail.summary && (
                  <div className="rounded-xl border border-line bg-card p-4">
                    <span className="text-xs font-bold text-mute">الملخص التقييمي:</span>
                    <p className="mt-1 text-sm text-text-2 whitespace-pre-wrap">{detail.summary}</p>
                  </div>
                )}
              </div>
            )}

            {detail.type !== 'committee' && detail.type !== 'evaluation_session' && record.category === 'theory' && (
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  تفاصيل اختبار العام
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-line bg-card p-3 text-center">
                    <div className="text-xs text-mute">عدد الأسئلة</div>
                    <div className="mt-1 text-lg font-bold text-text">
                      {(detail.questionCount as number) ?? '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-line bg-card p-3 text-center">
                    <div className="text-xs text-mute">الإجابات الصحيحة</div>
                    <div className="mt-1 text-lg font-bold text-ok">
                      {(detail.correctCount as number) ?? '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-line bg-card p-3 text-center">
                    <div className="text-xs text-mute">الأسئلة الموضوعية</div>
                    <div className="mt-1 text-lg font-bold text-light-gold">
                      {(detail.objectiveCount as number) ?? '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {detail.type !== 'committee' && detail.type !== 'evaluation_session' && record.category === 'driving' && (
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-ok flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5" />
                  تقييم أهلية قيادة الضابط
                </h3>
                <div className="rounded-xl border border-line bg-card p-4">
                  <div className="flex items-center gap-2 text-sm text-text">
                    <CheckCircle2 className="h-4 w-4 text-ok" />
                    <span>تم رصد النتيجة واعتمادها رسمياً في منظومة تقييم القيادة.</span>
                  </div>
                  <div className="mt-2 text-xs text-mute">
                    النتيجة المسجلة: {record.score} من أصل {record.maxScore} ({record.percent ?? 0}%)
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function AdminOralArchivePage() {
  const { user } = useAuth()
  const [records, setRecords] = useState<AssessmentArchiveRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState('')

  // فلاتر البحث
  const [categoryFilter, setCategoryFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [titleFilter, setTitleFilter] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canSeeRank = user?.role === 'admin' || user?.role === 'commander'
  const isOperator = user?.role === 'operator'

  async function load(filters?: {
    category?: string
    examineeName?: string
    examTitle?: string
    org?: string
  }) {
    if (!user?.token) return
    setLoading(true)
    setError('')
    try {
      const data = await apiListAssessmentArchive(user.token, {
        category: filters?.category !== undefined ? filters.category : categoryFilter || undefined,
        examineeName: filters?.examineeName !== undefined ? filters.examineeName : nameFilter.trim() || undefined,
        examTitle: filters?.examTitle !== undefined ? filters.examTitle : titleFilter.trim() || undefined,
        org: filters?.org !== undefined ? filters.org : orgFilter.trim() || undefined,
      })
      setRecords(data.archive)
      setTotal(data.total)
      setNextCursor(data.hasNext ? data.nextCursor || null : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل الأرشيف')
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!user?.token || !nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await apiListAssessmentArchive(user.token, {
        category: categoryFilter || undefined, examineeName:nameFilter.trim() || undefined,
        examTitle:titleFilter.trim() || undefined, org:orgFilter.trim() || undefined,
        cursor:nextCursor, limit:100,
      })
      setRecords((current) => [...current, ...data.archive])
      setNextCursor(data.hasNext ? data.nextCursor || null : null)
    } catch (err) { setError(err instanceof Error ? err.message : 'فشل تحميل بقية الأرشيف') }
    finally { setLoadingMore(false) }
  }

  useEffect(() => {
    void load()
  }, [user?.token])

  function handleFilterChange(fields: {
    category?: string
    examineeName?: string
    examTitle?: string
    org?: string
  }) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void load(fields)
    }, 350)
  }

  function handleCategorySelect(cat: string) {
    setCategoryFilter(cat)
    void load({
      category: cat || undefined,
      examineeName: nameFilter.trim() || undefined,
      examTitle: titleFilter.trim() || undefined,
      org: orgFilter.trim() || undefined,
    })
  }

  function clearFilters() {
    setCategoryFilter('')
    setNameFilter('')
    setTitleFilter('')
    setOrgFilter('')
    void load({ category: undefined, examineeName: undefined, examTitle: undefined, org: undefined })
  }

  const hasFilters = !!categoryFilter || !!nameFilter.trim() || !!titleFilter.trim() || !!orgFilter.trim()

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="h-6 w-6 text-gold" />
            <h1 className="text-2xl font-extrabold text-light-gold">أرشيف التقييمات</h1>
          </div>
          <p className="mt-1 text-sm text-mute">
            سجل محفوظ لجميع التقييمات المكتملة، يحتفظ بنسخ النتائج عند تصحيحها (عام · شفهي · قيادة · شخصية)
          </p>
        </div>
        {!loading && (
          <div className="rounded-xl border border-line bg-card px-4 py-2 text-center">
            <div className="text-2xl font-extrabold text-light-gold">{total}</div>
            <div className="text-xs text-mute">تقييم مؤرشف</div>
          </div>
        )}
      </div>

      {/* تصنيفات سريعة (Tabs) إذا لم يكن مشغلاً مقيداً بفئة واحدة */}
      <ArchiveProtectionStatus />
      {!isOperator && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleCategorySelect('')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              categoryFilter === ''
                ? 'bg-gold text-ink shadow-md shadow-gold/20'
                : 'border border-line bg-card text-mute hover:border-gold/40 hover:text-text'
            }`}
          >
            الكل ({total})
          </button>
          {Object.entries(CATEGORY_MAP).map(([key, meta]) => {
            const Icon = meta.icon
            const isSelected = categoryFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCategorySelect(key)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  isSelected
                    ? 'bg-gold text-ink shadow-md shadow-gold/20'
                    : 'border border-line bg-card text-mute hover:border-gold/40 hover:text-text'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </button>
            )
          })}
        </div>
      )}

      {/* شريط الفلترة */}
      <div className="rounded-2xl border border-line bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-mute">
            البحث باسم المتقدم
            <div className="relative mt-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
              <input
                id="archive-filter-name"
                type="text"
                value={nameFilter}
                placeholder="اكتب اسم المتقدم..."
                onChange={(e) => {
                  setNameFilter(e.target.value)
                  handleFilterChange({ examineeName: e.target.value.trim() || undefined })
                }}
                className="w-full rounded-xl border border-line bg-panel py-2 pe-3 ps-9 text-sm text-text outline-none focus:border-gold/60"
              />
            </div>
          </label>
          <label className="text-xs font-bold text-mute">
            البحث بالجهة
            <div className="relative mt-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
              <input
                id="archive-filter-org"
                type="text"
                value={orgFilter}
                placeholder="اسم الجهة أو الوحدة..."
                onChange={(e) => {
                  setOrgFilter(e.target.value)
                  handleFilterChange({ org: e.target.value.trim() || undefined })
                }}
                className="w-full rounded-xl border border-line bg-panel py-2 pe-3 ps-9 text-sm text-text outline-none focus:border-gold/60"
              />
            </div>
          </label>
          <label className="text-xs font-bold text-mute">
            البحث باسم الاختبار
            <div className="relative mt-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
              <input
                id="archive-filter-title"
                type="text"
                value={titleFilter}
                placeholder="اكتب عنوان الاختبار..."
                onChange={(e) => {
                  setTitleFilter(e.target.value)
                  handleFilterChange({ examTitle: e.target.value.trim() || undefined })
                }}
                className="w-full rounded-xl border border-line bg-panel py-2 pe-3 ps-9 text-sm text-text outline-none focus:border-gold/60"
              />
            </div>
          </label>
        </div>
        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              id="archive-clear-filters"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-mute hover:border-error/50 hover:text-error"
            >
              <X className="h-3.5 w-3.5" />
              مسح الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* رسالة الخطأ */}
      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* حالة التحميل */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          <span className="ms-3 text-sm text-mute">جاري تحميل الأرشيف...</span>
        </div>
      )}

      {/* حالة فارغة */}
      {!loading && !error && records.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-12 text-center">
          <Archive className="mx-auto mb-3 h-12 w-12 text-mute/40" />
          <p className="font-bold text-mute">
            {hasFilters ? 'لا توجد نتائج تطابق معايير البحث' : 'لا توجد تقييمات مؤرشفة حتى الآن'}
          </p>
          <p className="mt-1 text-sm text-mute/70">
            {hasFilters
              ? 'جرّب تعديل الفلاتر أو مسحها لعرض جميع السجلات'
              : 'تؤرشف التقييمات تلقائياً بمجرد إتمام الاختبار واعتماد نتيجته'}
          </p>
        </div>
      )}

      {/* الجدول */}
      {!loading && records.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-line bg-panel/80">
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">المتقدم</th>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">الجهة</th>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">نوع التقييم</th>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">المسمى / الدور</th>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">الاختبار</th>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">النتيجة</th>
                  {canSeeRank && (
                    <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">الرتبة</th>
                  )}
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">تاريخ التقييم</th>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute">المقيِّم</th>
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <RecordRow key={r.id} record={r} canSeeRank={canSeeRank} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line bg-panel/60 px-4 py-2 text-xs text-mute">
            <span>يُعرض {records.length} من أصل {total} سجل — مرتبة من الأحدث إلى الأقدم</span>
            {nextCursor && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="rounded-lg border border-gold/40 px-3 py-1.5 font-bold text-gold disabled:opacity-50">{loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'}</button>}
          </div>
        </div>
      )}
    </div>
  )
}
