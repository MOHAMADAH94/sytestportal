import ExcelJS from 'exceljs'
import { buildExamineeScoreSheet } from '../../shared/examineeScoreSheet.js'

export type RosterRow = {
  seqNumber: number
  name: string
  extra: Record<string, string>
}

/** أعمدة قالب إدخال الممتحنين (مطابقة للكشف المعتمد) */
export const ROSTER_TEMPLATE_HEADERS = [
  'م',
  'الاسم الثلاثي',
  'اسم الأم',
  'السوية_التنظيمية الأولى',
  'الرقم الوطني',
  'مسمى العمل',
  'نتيجة التقييم',
  'المبلغ المستحق',
  'بدء العقد',
  'انتهاء العقد',
] as const

/** حقول المقابلات الداخلية وفق ملف «اجمالي مقابلات داخلية». */
export const INTERNAL_INTERVIEW_HEADERS = [
  'رقم الاستمارة',
  'مسمى العمل طلب الاحتياج',
  'تعاقد  / تثبيت',
  'اسم الاب',
  'الكنية',
  'اسم الام',
  'الحالة الاجتماعية',
  'الرقم الوطني',
  'الوضع الصحي( سليم - مريض )',
  'البلد الأصلي ( محافظة ومدينة )',
  'السكن الحالي ( محافظة ومدينة )',
  'شعبة التجنيد ( التي يرغب بمراجعتها )',
  'المستوى العلمي',
  'سنة التخرج أو السنة للمتابع دراسة',
  'رقم التواصل',
  'متعاقد/ مدني',
  'رقم التعاقد',
  'الجهة المرشحة',
  'الشخص المرشح',
  'ملاحظات',
] as const

/** حقول المقابلات الخارجية وفق ملف «اجمالي مقابلات خارجية». */
export const EXTERNAL_INTERVIEW_HEADERS = [
  'اسم الأم',
  'السوية_التنظيمية الأولى',
  'الرقم الوطني',
  'مسمى المرفوع',
  'التأهيل العلمي مع الاختصاص',
  'راتب مقترح من الجهة',
  'بدء العقد',
  'انتهاء العقد',
] as const

const SEQ_EXACT = ['م', '#', 'no', 'seq', 'number']
const SEQ_INCLUDES = ['رقم', 'الرقم', 'تسلسل']

/** الأكثر تحديداً أولاً حتى لا يُلتقط «اسم الأم» بدل الاسم */
const NAME_KEYS = [
  'الاسم الثلاثي',
  'الاسم الثلاثى',
  'الاسم الكامل',
  'اسم الممتحن',
  'اسم ثلاثي',
  'full name',
  'fullname',
  'الاسم',
  'name',
]

function normKey(v: unknown) {
  return String(v ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/[ـ_]+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isMotherNameHeader(header: string) {
  const h = normKey(header)
  return (
    h.includes('mother') ||
    h.includes('اسم الام') ||
    (h.includes('اسم') && h.includes('الام'))
  )
}

function matchSeqHeader(header: string) {
  const h = normKey(header)
  if (!h) return false
  if (SEQ_EXACT.some((k) => h === normKey(k))) return true
  // لا نلتقط «الرقم الوطني» كعمود تسلسل
  if (h.includes('وطني') || h.includes('national')) return false
  return SEQ_INCLUDES.some((k) => h === normKey(k) || h.includes(normKey(k)))
}

function scoreNameHeader(header: string) {
  if (isMotherNameHeader(header)) return -1
  const h = normKey(header)
  if (!h) return -1
  for (let i = 0; i < NAME_KEYS.length; i++) {
    const nk = normKey(NAME_KEYS[i])
    if (h === nk) return 1000 - i
    if (h.includes(nk) || nk.includes(h)) return 500 - i
  }
  // عمود فيه كلمة «اسم» فقط وليس الأم
  if ((h === 'اسم' || h.startsWith('اسم ')) && !isMotherNameHeader(header)) return 50
  return -1
}

function findBestNameHeader(headers: string[]) {
  let best: string | undefined
  let bestScore = -1
  for (const h of headers) {
    const score = scoreNameHeader(h)
    if (score > bestScore) {
      bestScore = score
      best = h
    }
  }
  return bestScore >= 0 ? best : undefined
}

function cellStr(v: unknown) {
  if (v == null) return ''
  if (v instanceof Date) {
    return v.toLocaleDateString('ar-SY')
  }
  if (typeof v === 'object') {
    const value = v as { result?: unknown; text?: string; hyperlink?: string; richText?: { text: string }[] }
    if (value.result != null) return cellStr(value.result)
    if (value.text != null) return String(value.text).trim()
    if (value.richText) return value.richText.map((part) => part.text).join('').trim()
    if (value.hyperlink) return value.hyperlink.trim()
  }
  // Excel يخزن التاريخ كعدد أيام منذ 1899-12-30.
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
    return d.toLocaleDateString('ar-SY')
  }
  return String(v).trim()
}

/** يبحث عن صف العناوين حتى لو سبقه عنوان أو صفوف فارغة */
function extractTable(matrix: unknown[][]) {
  if (!matrix.length) throw new Error('لا توجد صفوف في ملف Excel')

  let headerRowIdx = -1
  let headers: string[] = []

  const scanLimit = Math.min(matrix.length, 30)
  for (let i = 0; i < scanLimit; i++) {
    const row = (matrix[i] || []).map((c) => cellStr(c))
    if (!row.some((c) => c)) continue
    const nameHit = findBestNameHeader(row)
    if (nameHit) {
      headerRowIdx = i
      // ثبّت أسماء الأعمدة؛ الأعمدة الفارغة تُسمّى حسب الفهرس
      headers = row.map((c, idx) => c || `__col_${idx}`)
      break
    }
  }

  if (headerRowIdx < 0) {
    const preview = (matrix[0] || [])
      .map((c) => cellStr(c))
      .filter(Boolean)
      .slice(0, 12)
    const hint = preview.length ? ` — الأعمدة المقروءة: ${preview.join(' | ')}` : ''
    throw new Error(`يجب أن يحتوي الملف على عمود «الاسم الثلاثي» أو «الاسم»${hint}`)
  }

  const rows: Record<string, unknown>[] = []
  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i] || []
    const obj: Record<string, unknown> = {}
    let any = false
    headers.forEach((h, idx) => {
      const val = raw[idx] ?? ''
      obj[h] = val
      if (cellStr(val)) any = true
    })
    if (any) rows.push(obj)
  }

  return { headers, rows }
}

function headerMatches(header: string, ...candidates: string[]) {
  const n = normKey(header)
  return candidates.some((candidate) => normKey(candidate) === n)
}

function findFatherHeader(headers: string[]) {
  return headers.find((h) => {
    const n = normKey(h)
    return headerMatches(h, 'اسم الاب', 'اسم الأب', 'اسم الوالد') || (n.includes('اسم') && n.includes('اب') && !n.includes('ام'))
  })
}

function findFamilyHeader(headers: string[]) {
  return headers.find((h) => headerMatches(h, 'الكنية', 'الكنيه', 'الشهرة', 'اسم العائلة', 'العائلة'))
}

function composeFullName(row: Record<string, unknown>, nameHeader: string, headers: string[]) {
  const first = cellStr(row[nameHeader])
  const fatherHeader = findFatherHeader(headers)
  const familyHeader = findFamilyHeader(headers)
  if (!fatherHeader && !familyHeader) return first.replace(/\s+/g, ' ').trim()
  // الاسم المعروض دائماً: الاسم + اسم الأب + الكنية من أعمدة الملف
  return [first, fatherHeader ? cellStr(row[fatherHeader]) : '', familyHeader ? cellStr(row[familyHeader]) : '']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function parseRosterExcel(file: File): Promise<RosterRow[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error('حجم ملف Excel يتجاوز الحد المسموح (20 MB)')
  if (!/\.xlsx$/i.test(file.name)) throw new Error('صيغة الملف غير مدعومة أمنيًا. احفظ الملف بصيغة XLSX ثم أعد رفعه.')
  const buf = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  if (!wb.worksheets.length) throw new Error('الملف فارغ أو لا يحتوي على أوراق')

  let lastError: Error | null = null
  for (const sheet of wb.worksheets) {
    try {
      // بعض ملفات Excel تُبلغ عن rowCount=1048576 رغم قلة الصفوف الفعلية.
      const usedRows = Math.max(sheet.actualRowCount || 0, sheet.dimensions?.bottom || 0, 0)
      if (usedRows > 100_000 || sheet.columnCount > 300) {
        throw new Error('يتجاوز الملف الحد الآمن لعدد الصفوف أو الأعمدة')
      }
      const matrix: unknown[][] = []
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 100_000) return
        while (matrix.length < rowNumber) matrix.push([])
        const values = row.values as unknown[]
        matrix[rowNumber - 1] = values.slice(1)
      })
      const { headers, rows } = extractTable(matrix)
      if (!rows.length) {
        lastError = new Error('لا توجد صفوف بيانات بعد صف العناوين')
        continue
      }

      const seqHeader = headers.find((h) => matchSeqHeader(h))
      const nameHeader = findBestNameHeader(headers)

      if (!nameHeader) {
        const preview = headers.filter((h) => !h.startsWith('__col_')).slice(0, 12)
        lastError = new Error(
          `يجب أن يحتوي الملف على عمود «الاسم الثلاثي» أو «الاسم» — الأعمدة المقروءة: ${preview.join(' | ')}`,
        )
        continue
      }

      const fatherHeader = findFatherHeader(headers)
      const familyHeader = findFamilyHeader(headers)
      const skipExtras = new Set(
        [seqHeader, nameHeader, fatherHeader, familyHeader, 'اسم الاب', 'اسم الأب', 'الكنية', 'الشهرة'].filter(Boolean) as string[],
      )
      const extraHeaders = headers.filter((h) => !skipExtras.has(h) && !h.startsWith('__col_'))

      const parsed: RosterRow[] = []
      rows.forEach((row, i) => {
        const name = composeFullName(row, nameHeader, headers)
        if (!name) return

        const seqRaw = seqHeader ? row[seqHeader] : i + 1
        const seqNumber = Number(seqRaw) > 0 ? Number(seqRaw) : parsed.length + 1

        const extra: Record<string, string> = {}
        for (const h of extraHeaders) {
          const val = cellStr(row[h])
          if (val) extra[h] = val
        }

        parsed.push({ seqNumber, name, extra })
      })

      if (!parsed.length) {
        lastError = new Error('لم يُعثر على أسماء ممتحنين في الملف')
        continue
      }

      return parsed
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError || new Error('يجب أن يحتوي الملف على عمود «الاسم الثلاثي» أو «الاسم»')
}

async function downloadWorkbook(rows: unknown[][], sheetName: string, fileName: string) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] })
  rows.forEach((row) => sheet.addRow(row))
  sheet.columns.forEach((column, index) => {
    const longest = rows.reduce((n, row) => Math.max(n, String(row[index] ?? '').length), 0)
    column.width = Math.min(55, Math.max(14, longest + 2))
  })
  const bytes = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadRosterTemplate(type: 'داخلية' | 'خارجية' = 'خارجية') {
  const isInternal = type === 'داخلية'
  const headers = isInternal
    ? ['التسلسل', 'الاسم', ...INTERNAL_INTERVIEW_HEADERS]
    : ['م', 'الاسم الثلاثي', ...EXTERNAL_INTERVIEW_HEADERS]
  const sample = [
    headers,
    isInternal
      ? [
          1, 'فراس', '', 'مهندس', 'تعاقد', 'خالد', 'محمد', 'محاسن', 'متزوج', '05130014465', 'سليم',
          'حماة', 'حماة', 'حماة', 'تاسع', '', '992671906', '', '', 'فرع الدعم و المراقبة', 'محمد نبيل', '',
        ]
      : [1, 'أحمد محمد علي', 'فاطمة', 'مستوى أ', '01020304050', 'فني شبكات', 'هندسة معلوماتية', '500', '', ''],
  ]
  await downloadWorkbook(sample, isInternal ? 'ورقة1' : 'تعاقد', isInternal ? 'قالب-مقابلات-داخلية.xlsx' : 'قالب-مقابلات-خارجية.xlsx')
}

export async function exportRosterExcel(
  title: string,
  roster: Array<{
    seqNumber: number
    displayId?: string
    name: string
    extra?: Record<string, string> | null
    enterUrl: string
  }>,
) {
  const preferredExtra = ROSTER_TEMPLATE_HEADERS.filter(
    (h) => h !== 'م' && h !== 'الاسم الثلاثي',
  ) as string[]
  const extraKeys = [
    ...preferredExtra.filter((k) => roster.some((r) => r.extra?.[k])),
    ...[...new Set(roster.flatMap((r) => Object.keys(r.extra || {})))].filter(
      (k) => !preferredExtra.includes(k),
    ),
  ]

  const header = ['المعرّف', 'الاسم الثلاثي', ...extraKeys, 'رابط QR للدخول']
  const data = roster.map((r) => [
    r.displayId || `EXM-${String(r.seqNumber).padStart(4, '0')}`,
    r.name,
    ...extraKeys.map((k) => r.extra?.[k] || ''),
    r.enterUrl,
  ])

  const safe = title.replace(/[^\w\u0600-\u06FF]+/g, '-').slice(0, 40)
  await downloadWorkbook([header, ...data], 'بطاقات QR', `بطاقات-QR-${safe || 'اختبار'}.xlsx`)
}

export const COMMITTEE_EVALUATION_COLUMNS = [
  'المسمى الوارد من الجهة',
  'المسمى المقترح من اللجنة',
  'الراتب المقترح',
  'الرتبة المقترحة من اللجنة',
  'الراتب المقرر من مدير الإدارة',
  'التحصيل العلمي من اللجنة',
] as const

export async function exportApplicantsExcel(applicants: Array<{
  seqNumber: number
  name: string
  extra?: Record<string, string>
  org?: string
  jobTitle?: string
  rank?: string
  jobTitleOrg?: string
  jobTitleCommittee?: string
  proposedSalary?: number | null
  rankCommittee?: string
  approvedSalary?: number | null
  educationCommittee?: string
  finalResult?: number | null
}>, columns?: string[]): Promise<boolean> {
  if (!applicants || applicants.length === 0) {
    return false
  }
  const dynamicColumns = columns?.length ? columns : [...ROSTER_TEMPLATE_HEADERS].slice(2)
  const value = (a: (typeof applicants)[number], column: string) => {
    const normalized = column.replace(/_/g, ' ').trim()
    if (normalized === 'المسمى الوارد من الجهة') return a.jobTitleOrg || a.extra?.[column] || ''
    if (normalized === 'المسمى المقترح من اللجنة') return a.jobTitleCommittee || a.extra?.[column] || ''
    if (normalized === 'الراتب المقترح') return a.proposedSalary != null ? a.proposedSalary : (a.extra?.[column] || '')
    if (normalized === 'الرتبة المقترحة من اللجنة') return a.rankCommittee || a.extra?.[column] || ''
    if (normalized === 'الراتب المقرر من مدير الإدارة') return a.approvedSalary != null ? a.approvedSalary : (a.extra?.[column] || '')
    if (normalized === 'التحصيل العلمي من اللجنة') return a.educationCommittee || a.extra?.[column] || ''
    if (normalized === 'النتيجة النهائية') return a.finalResult != null ? (typeof a.finalResult === 'number' ? `${a.finalResult}%` : a.finalResult) : ''
    if (normalized.includes('السوية') || normalized === 'الجهة') return a.org || ''
    if (normalized.includes('مسمى العمل') || normalized.includes('المسمى الوظيفي')) return a.jobTitle || ''
    if (normalized === 'الرتبة') return a.rank || ''
    return a.extra?.[column] || ''
  }
  const header = ['م', 'الاسم الثلاثي', ...dynamicColumns]
  const data = applicants.map((a) => [a.seqNumber, a.name, ...dynamicColumns.map((column) => value(a, column))])
  await downloadWorkbook([header, ...data], 'المتقدمون', 'المتقدمون.xlsx')
  return true
}

export async function exportExamineesScoresExcel(rows: Array<{
  examineeName: string
  examScores?: Record<string, number | null>
  examResults?: Array<{ title: string; weight: number | null; score: number | null; trackId?: string | null; trackLabel?: string | null }>
  seqNumber?: number | null
  displayId?: string
  org?: string
  jobTitle?: string
  rank?: string
  jobTitleOrg?: string
  jobTitleCommittee?: string
  proposedSalary?: number | null
  rankCommittee?: string
  approvedSalary?: number | null
  educationCommittee?: string
  extra?: Record<string, string>
}>): Promise<boolean> {
  if (!rows.length) return false
  const normalized = rows.map((row) => ({
    ...row,
    examResults: row.examResults?.length
      ? row.examResults
      : Object.entries(row.examScores || {}).map(([title, score]) => ({
          title,
          weight: null,
          score,
        })),
  }))
  const { header, data } = buildExamineeScoreSheet(normalized)
  await downloadWorkbook([header, ...data], 'الممتحنون', 'علامات-الممتحنين.xlsx')
  return true
}
