import { AlertTriangle, CheckCircle2, ClipboardPen, Eye, FileDown, Layers, Loader2, Plus, Power, QrCode, Trash2, TrendingUp, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  apiAdminExamQuestions,
  apiDeleteExam,
  apiListEvaluationCandidates,
  apiListExams,
  apiToggleExam,
  type AdminExam,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AdminListToolbar } from '../components/AdminListToolbar'
import { CATEGORY_META, EXAM_LEVELS, type ExamCategory, type ExamConfig, type ExamLevel } from '../data/types'
import { openPrintWindow } from '../utils/printPdf'

const CATEGORY_FILTERS: { id: 'all' | ExamCategory; label: string }[] = [
  { id: 'all', label: 'كل الأنواع' },
  { id: 'theory', label: CATEGORY_META.theory.label },
  { id: 'oral', label: CATEGORY_META.oral.label },
  { id: 'driving', label: CATEGORY_META.driving.label },
  { id: 'personality', label: CATEGORY_META.personality.label },
]

export function AdminExamsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [exams, setExams] = useState<AdminExam[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [examToDelete, setExamToDelete] = useState<AdminExam | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExamCategory>('all')
  const [levelFilter, setLevelFilter] = useState<'all' | ExamLevel>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'roster'>('all')
  const [sort, setSort] = useState('date_desc')
  const [baseCandidatesCount, setBaseCandidatesCount] = useState<number | null>(null)

  async function load() {
    if (!user?.token) return
    setLoading(true)
    try {
      const list = await apiListExams(user.token)
      setExams(list)
      if (user.role === 'operator' && ['driving', 'personality'].includes(user.category || '')) {
        const candidates = await apiListEvaluationCandidates(user.token)
        setBaseCandidatesCount(candidates.length)
      } else {
        setBaseCandidatesCount(null)
      }
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

  // الأمن العسكري: صفحة القبول/الرفض فقط — لا قائمة اختبارات.
  useEffect(() => {
    if (user?.role === 'operator' && user.category === 'security') {
      navigate('/admin/security', { replace: true })
    }
  }, [user, navigate])

  // شفهي: يُفتح مباشرةً على قائمة المتقدمين عند وجود اختبار واحد جاهز — لا داعٍ لاختياره يدوياً.
  useEffect(() => {
    if (loading || user?.role !== 'operator' || user.category !== 'oral') return
    const ready = exams.filter((e) => e.hasRoster && !e.committeeId)
    if (ready.length === 1) navigate(`/admin/oral/${ready[0].id}`, { replace: true })
  }, [loading, user, exams, navigate])

  async function toggle(exam: AdminExam) {
    if (!user?.token) return
    if (!exam.active && exam.pendingQuestions) {
      setError('استكمل أسئلة المسودة قبل تفعيل الاختبار')
      navigate('/admin/complete-questions/' + exam.id)
      return
    }
    setError('')
    try {
      await apiToggleExam(user.token, exam.id, !exam.active)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير حالة الاختبار')
    }
  }

  async function confirmDelete() {
    if (!user?.token || !examToDelete) return
    setDeletingId(examToDelete.id)
    try {
      await apiDeleteExam(user.token, examToDelete.id)
      setExamToDelete(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحذف')
    } finally {
      setDeletingId(null)
    }
  }

  async function exportPdf(exam: AdminExam, mode: 'exam' | 'answer_key') {
    if (!user?.token) return
    if (exam.jobBased) { navigate('/admin/roster/' + exam.id); return }
    setExportingId(exam.id)
    setError('')
    try {
      const res = await apiAdminExamQuestions(user.token, exam.id)
      const config: ExamConfig = {
        id: exam.id,
        title: exam.title,
        category: exam.category,
        role: exam.oralRole || undefined,
        level: exam.level,
        capacity: exam.capacity,
        questionCount: res.questions.length,
        createdAt: exam.createdAt,
        questionIds: res.questions.map((q) => q.id),
      }
      openPrintWindow(config, res.questions, mode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التصدير')
    } finally {
      setExportingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = exams.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
      if (levelFilter !== 'all' && e.level !== levelFilter) return false
      if (statusFilter === 'active' && !e.active) return false
      if (statusFilter === 'inactive' && e.active) return false
      if (statusFilter === 'roster' && !e.hasRoster) return false
      if (!q) return true
      const hay = [
        e.title,
        e.id,
        CATEGORY_META[e.category]?.label,
        EXAM_LEVELS.find((l) => l.id === e.level)?.label,
        e.createdBy,
      ]
      return hay.some((h) => h?.toLowerCase().includes(q))
    })

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'title_asc':
          return a.title.localeCompare(b.title, 'ar')
        case 'title_desc':
          return b.title.localeCompare(a.title, 'ar')
        case 'seats_desc':
          return b.usedSeats - a.usedSeats
        case 'questions_desc':
          return b.questionCount - a.questionCount
        case 'date_asc':
          return String(a.createdAt).localeCompare(String(b.createdAt))
        case 'date_desc':
        default:
          return String(b.createdAt).localeCompare(String(a.createdAt))
      }
    })
    return rows
  }, [exams, search, categoryFilter, levelFilter, statusFilter, sort])

  const stats = useMemo(() => {
    const totalExams = exams.length
    const activeExams = exams.filter((e) => e.active).length
    const totalSeats = exams.reduce((acc, e) => acc + (e.rosterCount || e.capacity || 0), 0)
    const evaluatedSeats = exams.reduce((acc, e) => acc + (e.usedSeats || 0), 0)
    const percentDone = totalSeats > 0 ? Math.round((evaluatedSeats / totalSeats) * 100) : 0
    return { totalExams, activeExams, totalSeats, evaluatedSeats, percentDone }
  }, [exams])

  const isCandidateEvaluationOperator =
    user?.role === 'operator' && ['oral', 'driving', 'personality'].includes(user.category || '')

  if (isCandidateEvaluationOperator) {
    const isOral = user?.category === 'oral'
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-light-gold">تقييم المتقدمين — {user?.label}</h1>
          <p className="mt-1 text-sm text-mute">
            {isOral
              ? 'اختر الاختبار لعرض المتقدمين وبدء جلسة التقييم الشفهي ورصد الدرجات.'
              : 'اختر الاختبار أو افتح قائمة المتقدمين لرصد نتائج الفحص مباشرة.'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
        ) : exams.length === 0 ? (
          <div className="rounded-2xl border border-line bg-card p-12 text-center text-mute">لا توجد اختبارات مخصصة لك حالياً.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {exams.map((exam) => (
              <div key={exam.id} className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-extrabold text-light-gold">{exam.title}</h2>
                <p className="mt-2 text-sm text-mute">
                  {isOral ? 'قائمة المتقدمين' : 'المتقدمون الأساسيون'}: {isOral ? (exam.rosterCount || 0) : (baseCandidatesCount ?? exam.capacity)} · تم تقييم {exam.usedSeats}
                </p>
                {exam.hasRoster || !isOral ? (
                  <Link to={exam.committeeId ? `/admin/results/${exam.id}` : isOral ? `/admin/oral/${exam.id}` : `/admin/candidates/${exam.id}`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink">
                    <ClipboardPen className="h-4 w-4" /> عرض الأسماء وبدء التقييم
                  </Link>
                ) : (
                  <p className="mt-5 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-mute">يتطلب التقييم الشفهي رفع قائمة المتقدمين عند إنشاء الاختبار.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-light-gold">
            {user?.role === 'operator' ? `اختبارات — ${user.label}` : 'لوحة الاختبارات'}
          </h1>
          <p className="mt-1 text-sm text-mute">
            {user?.role === 'operator'
              ? 'تعرض اختبارات اختصاصك فقط'
              : 'إدارة جميع الاختبارات والحسابات والنتائج'}
          </p>
        </div>
        {user?.role !== 'commander' && (
          <Link
            to={user?.role === 'admin' ? '/admin/create' : '/committees'}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink hover:bg-accent-gold"
          >
            <Plus className="h-4 w-4" />
            {user?.role === 'admin' ? 'فرز المتقدمين' : 'إنشاء الاختبار'}
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      {!loading && exams.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-mute">
              <Layers className="h-4 w-4 text-gold" />
              <span>إجمالي الاختبارات</span>
            </div>
            <div className="mt-2 text-2xl font-black text-light-gold">
              {stats.totalExams} <span className="text-xs font-normal text-mute">اختبار</span>
            </div>
            <div className="mt-1 text-xs text-mute">
              {stats.activeExams} فعّال حالياً
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-mute">
              <Users className="h-4 w-4 text-accent-gold" />
              <span>طاقة المقاعد الكلية</span>
            </div>
            <div className="mt-2 text-2xl font-black text-light-gold">
              {stats.totalSeats} <span className="text-xs font-normal text-mute">متقدم</span>
            </div>
            <div className="mt-1 text-xs text-mute">
              عبر كافة اللجان
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-mute">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>المتقدمون المقيمون</span>
            </div>
            <div className="mt-2 text-2xl font-black text-light-gold">
              {stats.evaluatedSeats} <span className="text-xs font-normal text-mute">تم إنهاؤهم</span>
            </div>
            <div className="mt-1 text-xs text-mute">
              نسبة الإنجاز {stats.percentDone}%
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-mute">
              <TrendingUp className="h-4 w-4 text-gold" />
              <span>معدل التقدم العام</span>
            </div>
            <div className="mt-2 text-2xl font-black text-light-gold">
              {stats.percentDone}%
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold to-accent-gold transition-all duration-500"
                style={{ width: `${Math.min(stats.percentDone, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {!loading && exams.length > 0 && (
        <AdminListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="ابحث بالعنوان، الحساب، أو المعرف..."
          filters={[
            {
              id: 'category',
              label: 'نوع الاختبار',
              value: categoryFilter,
              options: CATEGORY_FILTERS,
              onChange: (v) => setCategoryFilter(v as 'all' | ExamCategory),
            },
            {
              id: 'level',
              label: 'المستوى',
              value: levelFilter,
              options: [
                { id: 'all', label: 'كل المستويات' },
                ...EXAM_LEVELS.map((l) => ({ id: l.id, label: l.label })),
              ],
              onChange: (v) => setLevelFilter(v as 'all' | ExamLevel),
            },
            {
              id: 'status',
              label: 'الحالة',
              value: statusFilter,
              options: [
                { id: 'all', label: 'الكل' },
                { id: 'active', label: 'فعّال' },
                { id: 'inactive', label: 'متوقف' },
                { id: 'roster', label: 'قائمة Excel / QR' },
              ],
              onChange: (v) => setStatusFilter(v as typeof statusFilter),
            },
          ]}
          sortValue={sort}
          sortOptions={[
            { id: 'date_desc', label: 'الأحدث إنشاءً' },
            { id: 'date_asc', label: 'الأقدم إنشاءً' },
            { id: 'title_asc', label: 'العنوان أ–ي' },
            { id: 'title_desc', label: 'العنوان ي–أ' },
            { id: 'seats_desc', label: 'الأكثر إشغالاً' },
            { id: 'questions_desc', label: 'الأكثر أسئلة' },
          ]}
          onSortChange={setSort}
          shown={filtered.length}
          total={exams.length}
          onReset={() => {
            setSearch('')
            setCategoryFilter('all')
            setLevelFilter('all')
            setStatusFilter('all')
            setSort('date_desc')
          }}
        />
      )}

      {loading ? (
        <p className="text-mute">جاري التحميل...</p>
      ) : exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute">
          لا توجد اختبارات بعد.
          {user?.role !== 'commander' && <div className="mt-3">
            <Link to={user?.role === 'admin' ? '/admin/create' : '/committees'} className="font-bold text-gold">
              {user?.role === 'admin' ? 'فرز المتقدمين' : 'إنشاء الاختبار من قائمة اللجنة'}
            </Link>
          </div>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute">
          لا توجد اختبارات مطابقة للبحث أو التصفية.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-text">{e.title}</div>
                  {e.pendingQuestions && <Link className="mt-2 block text-sm font-bold text-gold underline" to={'/admin/complete-questions/' + e.id}>مسودة تحتاج أسئلة — استكمال الاختبار</Link>}
                  <div className="mt-1 text-xs text-mute">
                    {CATEGORY_META[e.category].label} ·{' '}
                    {EXAM_LEVELS.find((l) => l.id === e.level)?.label} ·{' '}
                    {e.questionCount} سؤال · المقاعد {e.usedSeats}/{e.capacity}
                    {!e.active && <span className="mr-2 text-error"> · متوقف</span>}
                  </div>
                  {e.hasRoster ? (
                    <div className="mt-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-light-gold">
                      قائمة ممتحنين مرفوعة ({e.rosterCount}) —{' '}
                      {e.pendingQuestions ? (
                        <Link to={`/admin/complete-questions/${e.id}`} className="font-bold underline">
                          استكمال الأسئلة{e.showsBarcode === false ? '' : ' قبل تفعيل QR'}
                        </Link>
                      ) : e.showsBarcode === false ? (
                        <Link to={`/admin/roster/${e.id}`} className="font-bold underline">
                          قائمة الممتحنين بلا باركود
                        </Link>
                      ) : (
                        <Link to={`/admin/roster/${e.id}`} className="font-bold underline">
                          عرض البطاقات و QR
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                      هذا الاختبار قديم بلا بطاقات QR، ولن يسمح النظام بدخول ممتحنين إليه.
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={exportingId === e.id}
                    onClick={() => void exportPdf(e, 'exam')}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-text-2 disabled:opacity-50"
                  >
                    <FileDown className="h-3.5 w-3.5" /> نموذج PDF
                  </button>
                  {e.category !== 'personality' && (
                    <button
                      type="button"
                      disabled={exportingId === e.id}
                      onClick={() => void exportPdf(e, 'answer_key')}
                      className="inline-flex items-center gap-1 rounded-lg border border-ok/40 bg-ok/10 px-3 py-1.5 text-xs font-bold text-ok disabled:opacity-50"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      {e.category === 'oral' ? 'سلم التقييم' : 'سلم الحل'}
                    </button>
                  )}
                    {e.hasRoster && !e.committeeId && (
                      <Link
                        to={e.pendingQuestions ? `/admin/complete-questions/${e.id}` : `/admin/roster/${e.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold"
                      >
                        <QrCode className="h-3.5 w-3.5" /> {e.pendingQuestions ? 'استكمال الأسئلة' : e.showsBarcode === false ? 'قائمة الممتحنين' : 'بطاقات QR'}
                      </Link>
                    )}
                  <Link
                    to={e.committeeId ? (user?.role === 'admin' ? '/committees' : `/admin/results/${e.id}`) : e.category !== 'theory' ? `/evaluation/${e.id}` : `/admin/enter/${e.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-xs font-bold text-light-gold"
                  >
                    <ClipboardPen className="h-3.5 w-3.5" />{' '}
                    {e.committeeId ? 'تقييم اللجنة' : e.category === 'oral' ? 'رصد الدرجات' : 'إدخال نتائج'}
                  </Link>
                  <Link
                    to={`/admin/results/${e.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink"
                  >
                    <Eye className="h-3.5 w-3.5" /> النتائج
                  </Link>
                  <button
                    type="button"
                    onClick={() => void toggle(e)}
                    disabled={!e.active && !!e.pendingQuestions}
                    title={!e.active && e.pendingQuestions ? 'استكمل الأسئلة أولاً' : undefined}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-text-2 disabled:opacity-40"
                  >
                    <Power className="h-3.5 w-3.5" />
                    {e.active ? 'إيقاف' : e.pendingQuestions ? 'مسودة' : 'تفعيل'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === e.id || !!e.committeeId}
                    title={e.committeeId ? 'مرتبط بلجنة تقييم؛ يمكن إيقاف الاختبار' : undefined}
                    onClick={() => setExamToDelete(e)}
                    className="inline-flex items-center gap-1 rounded-lg border border-error/40 bg-error/10 px-3 py-1.5 text-xs font-bold text-error hover:bg-error/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {examToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="w-full max-w-md rounded-2xl border border-error/30 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2 text-error font-bold">
                <AlertTriangle className="h-5 w-5" />
                <span>تأكيد حذف الاختبار</span>
              </div>
              <button
                type="button"
                onClick={() => setExamToDelete(null)}
                className="text-mute hover:text-text p-1 rounded-lg hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-text leading-relaxed">
              هل تريد حذف الاختبار من قائمة التشغيل؟
              <br />
              <strong className="text-light-gold text-base block mt-2">«{examToDelete.title}»</strong>
            </p>

            <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error leading-relaxed">
              سيتوقف الاختبار وتتعطل بطاقات الدخول إليه. تبقى النتائج والأسئلة وأحداث المراقبة وسجلات التعديلات محفوظة، ويمكن الرجوع إليها من الأرشيف. تُنشأ نسخة احتياطية سليمة قبل تنفيذ الحذف.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deletingId === examToDelete.id}
                onClick={() => setExamToDelete(null)}
                className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-text-2 hover:bg-white/5 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={deletingId === examToDelete.id}
                onClick={() => void confirmDelete()}
                className="inline-flex items-center gap-2 rounded-xl bg-error px-4 py-2 text-sm font-bold text-white hover:bg-error/90 disabled:opacity-50"
              >
                {deletingId === examToDelete.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري الحذف...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    حذف مع حفظ السجلات
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
