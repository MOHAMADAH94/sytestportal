import { Download, FileDown, Plus, Trash2, Upload, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  apiBulkDeleteApplicants,
  apiCreateApplicant,
  apiCreateApplicantColumn,
  apiDeleteApplicant,
  apiEnrollApplicant,
  apiImportApplicants,
  apiListApplicants,
  apiListExams,
  apiUpdateApplicant,
  type AdminExam,
  type Applicant,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { type ExamCategory } from '../data/types'
import { effectiveJobTitle, hasJobTitle } from '../../shared/jobProfiles.js'
import { resolveEvaluationStream, tracksForApplicant } from '../../shared/evaluationMatrix.js'
import { composeTripleName, splitTripleName } from '../../shared/personName.js'
import {
  downloadRosterTemplate,
  EXTERNAL_INTERVIEW_HEADERS,
  exportApplicantsExcel,
  INTERNAL_INTERVIEW_HEADERS,
  parseRosterExcel,
} from '../utils/parseRosterExcel'

const REQUESTED_NEW_COLUMNS = [
  'المسمى الوارد من الجهة',
  'المسمى المقترح من اللجنة',
  'الراتب المقترح',
  'الرتبة المقترحة من اللجنة',
  'الراتب المقرر من مدير الإدارة',
  'التحصيل العلمي من اللجنة',
] as const

type ColumnField =
  | 'org'
  | 'jobTitle'
  | 'rank'
  | 'jobTitleOrg'
  | 'jobTitleCommittee'
  | 'proposedSalary'
  | 'rankCommittee'
  | 'approvedSalary'
  | 'educationCommittee'
  | 'finalResult'
  | 'extra'

function fieldForColumn(label: string): ColumnField {
  const key = label.replace(/_/g, ' ').trim()
  if (key === 'المسمى الوارد من الجهة' || key === 'مسمى العمل المقترح من الجهة' || key === 'مسمى العمل طلب الاحتياج' || key === 'مسمى المرفوع') return 'jobTitleOrg'
  if (key === 'المسمى المقترح من اللجنة' || (key.includes('مسمى عمل') && key.includes('اللجنة'))) return 'jobTitleCommittee'
  if (key === 'الراتب المقترح' || key === 'راتب مقترح من الجهة') return 'proposedSalary'
  if (key === 'الرتبة المقترحة من اللجنة') return 'rankCommittee'
  if (key === 'الراتب المقرر من مدير الإدارة') return 'approvedSalary'
  if (key === 'التحصيل العلمي من اللجنة' || key === 'التأهيل العلمي مع الاختصاص') return 'educationCommittee'
  if (key === 'النتيجة النهائية') return 'finalResult'
  if (key.includes('السوية') || key === 'الجهة') return 'org'
  if (key.includes('مسمى العمل') || key.includes('المسمى الوظيفي')) return 'jobTitle'
  if (key === 'الرتبة') return 'rank'
  return 'extra'
}

function cellValue(applicant: Applicant, column: string): string {
  const field = fieldForColumn(column)
  if (field === 'jobTitleOrg') return applicant.jobTitleOrg || applicant.extra?.[column] || ''
  if (field === 'jobTitleCommittee') return applicant.jobTitleCommittee || applicant.extra?.[column] || ''
  if (field === 'proposedSalary') return applicant.proposedSalary != null ? String(applicant.proposedSalary) : (applicant.extra?.[column] || '')
  if (field === 'rankCommittee') return applicant.rankCommittee || applicant.extra?.[column] || ''
  if (field === 'approvedSalary') return applicant.approvedSalary != null ? String(applicant.approvedSalary) : (applicant.extra?.[column] || '')
  if (field === 'educationCommittee') return applicant.educationCommittee || applicant.extra?.[column] || ''
  if (field === 'org') return applicant.org || ''
  if (field === 'jobTitle') return applicant.jobTitle || ''
  if (field === 'rank') return applicant.rank || ''
  if (field === 'finalResult') {
    if (applicant.finalResult != null) return `${applicant.finalResult}%`
    return `قيد الاستكمال (${applicant.completedCategories?.length || 0}/${applicant.requiredExamCount || 0})`
  }
  return applicant.extra?.[column] || ''
}

function interviewTypeOf(a: Applicant) {
  return a.extra?.['نوع المقابلة'] || ''
}

type CompletionFilter = 'all' | 'none' | 'partial' | 'complete'

function requiredTracksOf(a: Applicant) {
  return tracksForApplicant(a).filter((track) => track.category !== 'security')
}

function scoreLabel(a: Applicant, category: ExamCategory) {
  const pct = a.categoryResults?.[category]
  if (pct != null) return `${pct}%`
  if (a.pendingCategories?.includes(category)) return 'معلّق'
  return '—'
}

function hasAnyExam(a: Applicant) {
  return Object.keys(a.categoryResults || {}).length > 0 || (a.pendingCategories?.length || 0) > 0
}

function completionOf(a: Applicant): Exclude<CompletionFilter, 'all'> {
  if (!hasAnyExam(a)) return 'none'
  const required = a.requiredExamCount || 0
  const completed = a.completedCategories?.length || 0
  if (required > 0 && completed >= required && !(a.pendingCategories?.length)) return 'complete'
  return 'partial'
}

function securityLabel(a: Applicant) {
  if (!a.securityReview) return 'بانتظار الأمن'
  if (a.securityReview.decision === 'accepted') return 'مقبول أمنياً'
  if (a.securityReview.decision === 'rejected') return 'مرفوض أمنياً'
  return 'غير محدد'
}

function securityTone(a: Applicant) {
  if (!a.securityReview) return 'border-line text-mute'
  if (a.securityReview.decision === 'accepted') return 'border-ok/40 bg-ok/10 text-ok'
  if (a.securityReview.decision === 'rejected') return 'border-error/40 bg-error/10 text-error'
  return 'border-warn/40 bg-warn/10 text-warn'
}

export function AdminApplicantsPage() {
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [list, setList] = useState<Applicant[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [newFirst, setNewFirst] = useState('')
  const [newFather, setNewFather] = useState('')
  const [newFamily, setNewFamily] = useState('')
  const [newSeq, setNewSeq] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importType, setImportType] = useState<'داخلية' | 'خارجية'>('داخلية')
  const [activeExams, setActiveExams] = useState<AdminExam[]>([])
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([])
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [enrollExamIds, setEnrollExamIds] = useState<string[]>([])
  const [interviewFilter, setInterviewFilter] = useState<'all' | 'داخلية' | 'خارجية' | 'بلا مسمى'>('all')
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('all')
  const [editing, setEditing] = useState<Applicant | null>(null)
  const [editFirst, setEditFirst] = useState('')
  const [editFather, setEditFather] = useState('')
  const [editFamily, setEditFamily] = useState('')
  const [editSeq, setEditSeq] = useState('')
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const newName = composeTripleName(newFirst, newFather, newFamily)
  const editName = composeTripleName(editFirst, editFather, editFamily)

  async function load() {
    if (!user?.token) return
    setLoading(true)
    try {
      const result = await apiListApplicants(user.token)
      setList(result.applicants)
      setColumns(result.columns)
      const exams = await apiListExams(user.token)
      setActiveExams(exams.filter((exam) => exam.active !== false))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل سجل المتقدمين')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [user?.token])

  const detailColumns = useMemo(() => {
    const scoped =
      interviewFilter === 'داخلية' || interviewFilter === 'خارجية'
        ? list.filter((a) => interviewTypeOf(a) === interviewFilter)
        : interviewFilter === 'بلا مسمى'
          ? list.filter((a) => !hasJobTitle(a))
          : list
    const otherColumns = new Set<string>()

    if (interviewFilter === 'داخلية') INTERNAL_INTERVIEW_HEADERS.forEach((h) => otherColumns.add(h))
    if (interviewFilter === 'خارجية') EXTERNAL_INTERVIEW_HEADERS.forEach((h) => otherColumns.add(h))
    if (interviewFilter === 'all' || interviewFilter === 'بلا مسمى') {
      otherColumns.add('نوع المقابلة')
      columns.forEach((column) => otherColumns.add(column))
    }
    scoped.forEach((a) => Object.keys(a.extra || {}).forEach((key) => otherColumns.add(key)))
    if (scoped.some((a) => a.org) && ![...otherColumns].some((c) => fieldForColumn(c) === 'org')) {
      otherColumns.add('السوية التنظيمية الأولى')
    }
    if (scoped.some((a) => a.rank) && ![...otherColumns].some((c) => fieldForColumn(c) === 'rank')) {
      otherColumns.add('الرتبة')
    }

    REQUESTED_NEW_COLUMNS.forEach((col) => otherColumns.delete(col))
    otherColumns.delete('النتيجة النهائية')
    otherColumns.delete('مسمى العمل')
    otherColumns.delete('مسمى العمل المقترح من الجهة')
    otherColumns.delete('مسمى عمل  - اللجنة')
    otherColumns.delete('مسمى عمل - اللجنة')

    return [...REQUESTED_NEW_COLUMNS, ...otherColumns]
  }, [columns, list, interviewFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...list]
      .filter((a) => {
        const interviewType = interviewTypeOf(a)
        if (interviewFilter === 'بلا مسمى') {
          if (hasJobTitle(a)) return false
        } else if (interviewFilter !== 'all' && interviewType !== interviewFilter) {
          return false
        }
        if (completionFilter !== 'all' && completionOf(a) !== completionFilter) return false
        if (!q) return true
        const hay = [
          a.name,
          a.displayId,
          effectiveJobTitle(a),
          a.jobTitleOrg,
          a.jobTitleCommittee,
          resolveEvaluationStream(a).label,
          ...detailColumns.map((c) => cellValue(a, c)),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => a.seqNumber - b.seqNumber)
  }, [list, search, detailColumns, interviewFilter, completionFilter])

  const completionCounts = useMemo(() => ({
    none: list.filter((a) => completionOf(a) === 'none').length,
    partial: list.filter((a) => completionOf(a) === 'partial').length,
    complete: list.filter((a) => completionOf(a) === 'complete').length,
  }), [list])

  async function addApplicant() {
    if (!user?.token || !newName.trim()) return
    setSaving(true)
    try {
      const applicant = await apiCreateApplicant(user.token, {
        name: newName.trim(),
        seqNumber: Number(newSeq) || undefined,
        extra: { 'نوع المقابلة': importType },
      })
      const joined: string[] = []
      const failed: string[] = []
      for (const examId of selectedExamIds) {
        const exam = activeExams.find((item) => item.id === examId)
        try {
          await apiEnrollApplicant(user.token, examId, applicant.id)
          joined.push(exam?.title || examId)
        } catch (err) {
          failed.push(`${exam?.title || 'اختبار'}: ${err instanceof Error ? err.message : 'تعذر الإلحاق'}`)
        }
      }
      setList((prev) => [...prev, applicant])
      setNewFirst('')
      setNewFather('')
      setNewFamily('')
      setNewSeq('')
      setSelectedExamIds([])
      setMessage(
        `تمت إضافة «${applicant.name}»${joined.length ? ` وأُلحق بـ: ${joined.join('، ')}` : ''}${failed.length ? `. تعذر: ${failed.join(' — ')}` : ''}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت إضافة المتقدم')
    } finally {
      setSaving(false)
    }
  }

  async function enrollExisting() {
    if (!user?.token || !pickedIds.length || !enrollExamIds.length) return
    setSaving(true)
    setError('')
    setMessage('')
    const people = list.filter((applicant) => pickedIds.includes(applicant.id))
    const joined: string[] = []
    const already: string[] = []
    const failed: string[] = []
    for (const applicant of people) {
      for (const examId of enrollExamIds) {
        const exam = activeExams.find((item) => item.id === examId)
        const label = `${applicant.name} ← ${exam?.title || 'اختبار'}`
        try {
          await apiEnrollApplicant(user.token, examId, applicant.id)
          joined.push(label)
        } catch (err) {
          const text = err instanceof Error ? err.message : 'تعذر الإلحاق'
          if (text.includes('مسبقاً')) already.push(label)
          else failed.push(`${label}: ${text}`)
        }
      }
    }
    setMessage(
      [
        joined.length ? `أُلحق ${joined.length}: ${joined.join('، ')}` : '',
        already.length ? `مسجّل مسبقاً (${already.length}): ${already.join('، ')}` : '',
        failed.length ? `تعذر (${failed.length}): ${failed.join(' — ')}` : '',
      ].filter(Boolean).join('\n'),
    )
    setPickedIds([])
    setSaving(false)
  }

  function openEditor(applicant: Applicant) {
    setEditing(applicant)
    const parts = splitTripleName(applicant.name)
    setEditFirst(parts.first)
    setEditFather(parts.father)
    setEditFamily(parts.family)
    setEditSeq(String(applicant.seqNumber))
    setEditValues(
      Object.fromEntries([
        ...detailColumns.map((column) => [column, cellValue(applicant, column)]),
        ['المسمى الوارد من الجهة', applicant.jobTitleOrg || cellValue(applicant, 'المسمى الوارد من الجهة')],
        ['المسمى المقترح من اللجنة', applicant.jobTitleCommittee || cellValue(applicant, 'المسمى المقترح من اللجنة')],
      ]),
    )
  }

  async function saveDetails() {
    if (!user?.token || !editing || !editName.trim()) return
    setSaving(true)
    try {
      const extra: Record<string, string> = {}
      let org = ''
      let jobTitle = ''
      let rank = ''
      let jobTitleOrg = editValues['المسمى الوارد من الجهة'] || ''
      let jobTitleCommittee = editValues['المسمى المقترح من اللجنة'] || ''
      let proposedSalary: number | null = null
      let rankCommittee = ''
      let approvedSalary: number | null = null
      let educationCommittee = ''

      for (const column of detailColumns) {
        const value = editValues[column] || ''
        const field = fieldForColumn(column)
        if (field === 'org') org = value
        else if (field === 'jobTitle') jobTitle = value
        else if (field === 'rank') rank = value
        else if (field === 'jobTitleOrg') jobTitleOrg = value
        else if (field === 'jobTitleCommittee') jobTitleCommittee = value
        else if (field === 'proposedSalary') {
          const num = value.trim() === '' ? null : Number(value.replace(/,/g, '').trim())
          proposedSalary = Number.isFinite(num as number) ? (num as number) : null
        } else if (field === 'rankCommittee') rankCommittee = value
        else if (field === 'approvedSalary') {
          const num = value.trim() === '' ? null : Number(value.replace(/,/g, '').trim())
          approvedSalary = Number.isFinite(num as number) ? (num as number) : null
        } else if (field === 'educationCommittee') educationCommittee = value
        else if (field === 'finalResult') continue
        else extra[column] = value
      }

      const updated = await apiUpdateApplicant(user.token, editing.id, {
        name: editName.trim(),
        seqNumber: Number(editSeq) || editing.seqNumber,
        org,
        jobTitle,
        rank,
        jobTitleOrg,
        jobTitleCommittee,
        proposedSalary,
        rankCommittee,
        approvedSalary,
        educationCommittee,
        extra,
      })
      setList((prev) => prev.map((a) => (a.id === editing.id ? { ...a, ...updated } : a)))
      setEditing(null)
      setMessage(`تم حفظ بيانات «${updated.name}»`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ البيانات')
    } finally {
      setSaving(false)
    }
  }

  async function addColumn() {
    if (!user?.token) return
    const label = window.prompt('اسم العمود الجديد:')?.trim()
    if (!label) return
    try {
      const created = await apiCreateApplicantColumn(user.token, label)
      setColumns((prev) => (prev.includes(created.label) ? prev : [...prev, created.label]))
      setMessage(`تمت إضافة عمود «${created.label}»`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت إضافة العمود')
    }
  }

  async function removeApplicant(applicant: Applicant) {
    if (!user?.token || !window.confirm(`حذف المتقدم «${applicant.name}»؟`)) return
    try {
      await apiDeleteApplicant(user.token, applicant.id)
      setList((prev) => prev.filter((a) => a.id !== applicant.id))
      if (editing?.id === applicant.id) setEditing(null)
      setMessage(`تم حذف «${applicant.name}» من المتقدمين.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف المتقدم')
    }
  }

  async function removeFilteredApplicants() {
    if (!user?.token || !filtered.length) return
    const scope =
      interviewFilter === 'all'
        ? 'كل المتقدمين الظاهرين'
        : interviewFilter === 'بلا مسمى'
          ? 'المتقدمين بلا مسمى الظاهرين'
          : `متقدمي المقابلة ${interviewFilter} الظاهرين`
    const ok = window.confirm(
      `حذف ${filtered.length} متقدم (${scope}) نهائياً؟\nلا يمكن التراجع. قرارات الأمن المرتبطة بهم ستُحذف أيضاً.`,
    )
    if (!ok) return
    const confirmWord = window.prompt(`للتأكيد اكتب الرقم ${filtered.length} ثم موافق:`)
    if (String(confirmWord || '').trim() !== String(filtered.length)) {
      setMessage('تم إلغاء الحذف الجماعي.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await apiBulkDeleteApplicants(user.token, filtered.map((a) => a.id))
      setEditing(null)
      await load()
      setMessage(`تم حذف ${result.deleted} متقدم. المتبقي في السجل: ${result.total}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحذف الجماعي')
    } finally {
      setSaving(false)
    }
  }

  async function handleFile(file: File) {
    if (!user?.token) return
    setImporting(true)
    try {
      const rows = (await parseRosterExcel(file)).map((row) => ({
        ...row,
        extra: { ...row.extra, 'نوع المقابلة': importType },
      }))
      const result = await apiImportApplicants(user.token, { rows })
      setList(result.applicants)
      setSearch('')
      setInterviewFilter(importType)
      await load()
      setMessage(
        `تمت الإضافة التراكمية: ${result.created} جديد، ${result.updated} مدمج مع سجله الحالي، ${result.skipped} متجاهل.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل استيراد الملف')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleExportExcel() {
    if (!filtered.length) {
      setError('لا توجد بيانات مطابقة للفلاتر الحالية لتصديرها.')
      return
    }
    setError('')
    const exportCols = ['الاسم الثلاثي', ...detailColumns, 'النتيجة النهائية']
    const ok = await exportApplicantsExcel(filtered, exportCols)
    if (ok) setMessage(`تم تصدير ${filtered.length} متقدم إلى Excel.`)
  }

  const missingCount = list.filter((a) => !hasJobTitle(a)).length
  const internalCount = list.filter((a) => interviewTypeOf(a) === 'داخلية').length
  const externalCount = list.filter((a) => interviewTypeOf(a) === 'خارجية').length

  const titleFields = ['المسمى الوارد من الجهة', 'المسمى المقترح من اللجنة'] as const
  const otherEditColumns = detailColumns.filter((c) => !titleFields.includes(c as (typeof titleFields)[number]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-light-gold">سجل المتقدمين</h1>
          <p className="mt-1 text-sm text-mute">
            يبقى الاسم هنا حتى ينهي كل اختبارات صنفه، ثم ينتقل إلى الممتحنين. اضغط البطاقة للتعديل، أو احذف من لم يبدأ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void downloadRosterTemplate(importType)}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-bold text-gold"
          >
            <FileDown className="h-4 w-4 shrink-0" aria-hidden />
            <span>قالب {importType}</span>
          </button>
          <button
            type="button"
            onClick={() => void addColumn()}
            className="inline-flex items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 px-3 py-2 text-xs font-bold text-gold"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            <span>إضافة عمود</span>
          </button>
          <button
            type="button"
            disabled={!filtered.length || saving}
            onClick={() => void removeFilteredApplicants()}
            className="inline-flex items-center gap-2 rounded-xl border border-error/50 bg-error/10 px-3 py-2 text-xs font-bold text-error disabled:opacity-40"
            title={!filtered.length ? 'لا يوجد متقدمون ظاهرون للحذف' : `حذف ${filtered.length} متقدم ظاهر`}
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
            <span>حذف الظاهر ({filtered.length})</span>
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.value = ''
                fileRef.current.click()
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-xs font-bold text-ink disabled:opacity-40"
            title="استيراد ملف Excel"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            <span>{importing ? 'جاري الاستيراد...' : 'استيراد Excel'}</span>
          </button>
          <Link
            to="/admin/create"
            className="inline-flex items-center gap-2 rounded-xl border border-gold/60 bg-gold/15 px-3 py-2 text-xs font-bold text-gold"
            title="فرز المتقدمين إلى لجان الحسابات دون إنشاء اختبار"
          >
            <span>فرز للجان</span>
          </Link>
          <button
            type="button"
            disabled={!filtered.length}
            onClick={() => void handleExportExcel()}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-bold text-gold disabled:opacity-40"
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            <span>تصدير Excel{filtered.length > 0 ? ` (${filtered.length})` : ''}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-panel p-4">
        <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-bold text-mute">
          الاسم
          <input
            value={newFirst}
            onChange={(e) => setNewFirst(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addApplicant()
            }}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none"
            placeholder="الاسم"
          />
        </label>
        <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-bold text-mute">
          اسم الأب
          <input
            value={newFather}
            onChange={(e) => setNewFather(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addApplicant()
            }}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none"
            placeholder="اسم الأب"
          />
        </label>
        <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-bold text-mute">
          الكنية
          <input
            value={newFamily}
            onChange={(e) => setNewFamily(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addApplicant()
            }}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none"
            placeholder="الكنية"
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs font-bold text-mute">
          التسلسل
          <input
            value={newSeq}
            onChange={(e) => setNewSeq(e.target.value)}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none"
            inputMode="numeric"
            placeholder="تلقائي"
          />
        </label>
        <label className="flex w-44 flex-col gap-1 text-xs font-bold text-mute">
          نوع المتقدم
          <select
            value={importType}
            onChange={(e) => setImportType(e.target.value as 'داخلية' | 'خارجية')}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none"
          >
            <option value="داخلية">مقابلة داخلية</option>
            <option value="خارجية">مقابلة خارجية</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!newName.trim() || saving}
          onClick={() => void addApplicant()}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
          <span>إضافة شخص</span>
        </button>
        {activeExams.length > 0 && (
          <div className="flex w-full flex-col gap-2">
            <p className="text-xs font-bold text-mute">إلحاقه باختبار مفعّل الآن</p>
            <div className="flex flex-wrap gap-2">
              {activeExams.map((exam) => (
                <label key={exam.id} className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs font-bold text-text">
                  <input
                    type="checkbox"
                    checked={selectedExamIds.includes(exam.id)}
                    onChange={(e) => {
                      setSelectedExamIds((prev) => e.target.checked ? [...prev, exam.id] : prev.filter((id) => id !== exam.id))
                    }}
                  />
                  <span>{exam.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none"
          placeholder="بحث بالاسم أو المسمى أو أي حقل"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { id: 'داخلية' as const, title: 'مقابلات داخلية', count: internalCount },
            { id: 'خارجية' as const, title: 'مقابلات خارجية', count: externalCount },
            { id: 'بلا مسمى' as const, title: 'بلا مسمى — للجميع', count: missingCount },
            { id: 'all' as const, title: 'كل المتقدمين', count: list.length },
          ] as const
        ).map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setInterviewFilter(chip.id)}
            className={`rounded-2xl border p-4 text-right transition ${
              interviewFilter === chip.id ? 'border-gold bg-gold/15' : 'border-line bg-card hover:border-gold/50'
            }`}
          >
            <div className="font-extrabold text-light-gold">{chip.title}</div>
            <div className="mt-1 text-sm text-mute">{chip.count} متقدم</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { id: 'none' as const, title: 'لم يتقدم لأي اختبار', count: completionCounts.none },
            { id: 'partial' as const, title: 'تقدم لبعض الاختبارات', count: completionCounts.partial },
            { id: 'complete' as const, title: 'أكمل الاختبارات المطلوبة', count: completionCounts.complete },
            { id: 'all' as const, title: 'كل حالات الاستكمال', count: list.length },
          ] as const
        ).map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setCompletionFilter(chip.id)}
            className={`rounded-2xl border p-4 text-right transition ${
              completionFilter === chip.id ? 'border-gold bg-gold/15' : 'border-line bg-card hover:border-gold/50'
            }`}
          >
            <div className="font-extrabold text-light-gold">{chip.title}</div>
            <div className="mt-1 text-sm text-mute">{chip.count} متقدم</div>
          </button>
        ))}
      </div>

      {activeExams.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-light-gold">إلحاق متقدمين موجودين باختبار مفعّل</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const visible = filtered.map((applicant) => applicant.id)
                  const allVisible = visible.every((id) => pickedIds.includes(id))
                  setPickedIds(allVisible ? pickedIds.filter((id) => !visible.includes(id)) : [...new Set([...pickedIds, ...visible])])
                }}
                className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-text"
              >
                {filtered.length > 0 && filtered.every((applicant) => pickedIds.includes(applicant.id)) ? 'إلغاء تحديد الظاهر' : `تحديد الظاهر (${filtered.length})`}
              </button>
              {pickedIds.length > 0 && (
                <button type="button" onClick={() => setPickedIds([])} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-mute">
                  مسح التحديد ({pickedIds.length})
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeExams.map((exam) => (
              <label key={exam.id} className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs font-bold text-text">
                <input
                  type="checkbox"
                  checked={enrollExamIds.includes(exam.id)}
                  onChange={(e) => {
                    setEnrollExamIds((prev) => e.target.checked ? [...prev, exam.id] : prev.filter((id) => id !== exam.id))
                  }}
                />
                <span>{exam.title}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={saving || !pickedIds.length || !enrollExamIds.length}
            onClick={() => void enrollExisting()}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40"
          >
            إلحاق المحددين ({pickedIds.length})
          </button>
        </div>
      )}

      {error && <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
      {message && <div className="whitespace-pre-wrap rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{message}</div>}

      {loading ? (
        <p className="text-mute">جاري التحميل...</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((a) => {
              const title = effectiveJobTitle(a)
              const type = interviewTypeOf(a)
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEditor(a)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') openEditor(a)
                  }}
                  className="group rounded-2xl border border-line bg-card p-4 text-right transition hover:border-gold/60 hover:bg-panel"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-gold" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={pickedIds.includes(a.id)}
                          onChange={(event) => {
                            setPickedIds((prev) => event.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id))
                          }}
                        />
                        م {a.seqNumber}
                      </label>
                      <h2 className="mt-1 truncate text-lg font-extrabold text-light-gold group-hover:text-gold">{a.name}</h2>
                    </div>
                    <span className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-mute">
                      {type || 'غير محدد'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-mute">
                    {title || 'بلا مسمى — يظهر للجميع ويمكن تصنيفه'}
                  </p>
                  {a.jobTitleOrg && a.jobTitleCommittee && a.jobTitleOrg !== a.jobTitleCommittee && (
                    <p className="mt-1 text-xs text-mute">جهة: {a.jobTitleOrg}</p>
                  )}
                  <p className="mt-2 text-[11px] font-bold text-mute">
                    الفرز: {resolveEvaluationStream(a).label}
                    {requiredTracksOf(a).length === 1 ? ' — اختبار واحد + أمن' : ''}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {requiredTracksOf(a).map((track) => (
                      <div key={track.id} className="rounded-lg border border-line/80 bg-panel px-2 py-1.5">
                        <div className="text-[10px] text-mute">
                          {track.label}
                          {track.weight != null ? ` (${track.weight}%)` : ''}
                        </div>
                        <div className="text-xs font-bold text-text">{scoreLabel(a, track.category as ExamCategory)}</div>
                      </div>
                    ))}
                    {!requiredTracksOf(a).length && (
                      <div className="col-span-2 rounded-lg border border-line/80 bg-panel px-2 py-1.5 text-xs text-mute">
                        بلا مسار تقييم بعد — صحّح المسمى
                      </div>
                    )}
                    <div className={`col-span-2 rounded-lg border px-2 py-1.5 ${securityTone(a)}`}>
                      <div className="text-[10px] opacity-80">الأمن العسكري</div>
                      <div className="text-xs font-bold">{securityLabel(a)}</div>
                      {a.securityReview?.note ? (
                        <div className="mt-1 line-clamp-2 text-[10px] opacity-80">{a.securityReview.note}</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-bold text-gold">
                      {a.finalResult != null ? `النتيجة ${a.finalResult}%` : `استكمال ${a.completedCategories?.length || 0}/${a.requiredExamCount || 0}`}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void removeApplicant(a)
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-error/40 px-2 py-1 font-bold text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {!filtered.length && (
            <div className="rounded-2xl border border-line p-8 text-center text-mute">
              {list.length ? 'لا يوجد متقدمون مطابقون للفلاتر الحالية.' : 'لم تتم إضافة متقدمين بعد.'}
              {list.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setInterviewFilter('all')
                    setCompletionFilter('all')
                  }}
                  className="mx-3 text-gold underline"
                >
                  عرض الكل ({list.length})
                </button>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-light-gold">{editName || 'بيانات المتقدم'}</h2>
                <p className="text-xs text-mute">عدّل المسميات والبيانات ثم احفظ. تظهر هنا مسارات الفرز المطلوبة لهذا المسمى فقط.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg p-2 text-mute hover:bg-card">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-3 text-xs font-bold text-mute">
              الفرز: {resolveEvaluationStream(editing).label}
              {requiredTracksOf(editing).length === 1 ? ' — يخضع لاختبار عام فقط (وزن 100%) بالإضافة للأمن العسكري' : ''}
            </p>
            <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {requiredTracksOf(editing).map((track) => (
                <div key={track.id} className="rounded-xl border border-line bg-card px-3 py-2">
                  <div className="text-[11px] text-mute">
                    {track.label}
                    {track.weight != null ? ` — وزن ${track.weight}%` : ''}
                  </div>
                  <div className="text-sm font-bold text-gold">{scoreLabel(editing, track.category as ExamCategory)}</div>
                </div>
              ))}
              {!requiredTracksOf(editing).length && (
                <div className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-mute">بلا مسار تقييم بعد</div>
              )}
            </div>
            <div className={`mb-5 rounded-xl border px-3 py-3 ${securityTone(editing)}`}>
              <div className="text-xs font-bold">تقييم الأمن العسكري: {securityLabel(editing)}</div>
              {editing.securityReview ? (
                <p className="mt-1 text-xs opacity-90">
                  {editing.securityReview.reviewedByName} — {new Date(editing.securityReview.reviewedAt).toLocaleString('ar')}
                  {editing.securityReview.note ? ` — ${editing.securityReview.note}` : ''}
                </p>
              ) : (
                <p className="mt-1 text-xs opacity-80">لم يُسجَّل قرار أمني بعد. يُدخل من حساب الأمن العسكري.</p>
              )}
            </div>
            <div className="mb-5 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm">
              النتيجة النهائية:{' '}
              <strong className="text-gold">
                {editing.finalResult != null
                  ? `${editing.finalResult}%`
                  : `قيد الاستكمال (${editing.completedCategories?.length || 0}/${editing.requiredExamCount || 0})`}
              </strong>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-bold text-mute">
                التسلسل
                <input
                  value={editSeq}
                  onChange={(e) => setEditSeq(e.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-text outline-none"
                />
              </label>
              <label className="text-xs font-bold text-mute">
                الاسم
                <input
                  value={editFirst}
                  onChange={(e) => setEditFirst(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-text outline-none"
                  placeholder="الاسم"
                />
              </label>
              <label className="text-xs font-bold text-mute">
                اسم الأب
                <input
                  value={editFather}
                  onChange={(e) => setEditFather(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-text outline-none"
                  placeholder="اسم الأب"
                />
              </label>
              <label className="text-xs font-bold text-mute">
                الكنية
                <input
                  value={editFamily}
                  onChange={(e) => setEditFamily(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-text outline-none"
                  placeholder="الكنية"
                />
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-gold/40 bg-card p-4">
              <h3 className="mb-3 text-sm font-extrabold text-gold">المسميات والتصنيف</h3>
              <p className="mb-3 text-xs text-mute">
                المسمى المعتمد للتقييم: قرار اللجنة، وإلا الوارد من الجهة. من بلا مسمى يظهر للجميع حتى يُصنَّف هنا.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-mute">
                  المسمى الوارد من الجهة المرشحة
                  <input
                    value={editValues['المسمى الوارد من الجهة'] || ''}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, 'المسمى الوارد من الجهة': e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-text outline-none"
                    placeholder="مسمى الجهة"
                  />
                </label>
                <label className="text-xs font-bold text-mute">
                  المسمى الذي تقرره اللجنة
                  <input
                    value={editValues['المسمى المقترح من اللجنة'] || ''}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, 'المسمى المقترح من اللجنة': e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-text outline-none"
                    placeholder="تصنيف اللجنة / المسمى المعتمد"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-mute">
                المعتمد حالياً:{' '}
                <span className="font-bold text-light-gold">
                  {String(editValues['المسمى المقترح من اللجنة'] || editValues['المسمى الوارد من الجهة'] || 'بلا مسمى').trim() ||
                    'بلا مسمى'}
                </span>
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {otherEditColumns.map((column) => {
                const field = fieldForColumn(column)
                const readOnly = field === 'finalResult'
                return (
                  <label key={column} className="text-xs font-bold text-mute">
                    {column}
                    <input
                      value={editValues[column] || ''}
                      readOnly={readOnly}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, [column]: e.target.value }))}
                      className={`mt-1 w-full rounded-lg border border-line px-3 py-2 text-text outline-none ${
                        readOnly ? 'bg-panel/50 text-mute' : 'bg-card'
                      }`}
                    />
                  </label>
                )
              })}
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={() => void removeApplicant(editing)}
                className="inline-flex items-center gap-2 rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-sm font-bold text-error"
              >
                <Trash2 className="h-4 w-4" />
                حذف المتقدم
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-mute">
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={saving || !editName.trim()}
                  onClick={() => void saveDetails()}
                  className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
