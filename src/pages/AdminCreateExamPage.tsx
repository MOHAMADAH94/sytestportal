import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiCommittee, apiListEvaluationCandidates, type RosterCandidate } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { CATEGORY_META, type ExamCategory, type QuestionType } from '../data/types'
import { JOB_PROFILES, effectiveJobTitle, groupApplicants, inferJobLevel, oralRolesCompatible, resolveJobProfile } from '../../shared/jobProfiles.js'
import {
  candidateVisibleToOperator,
  EVALUATION_TRACKS,
  summarizeTracksForApplicants,
} from '../../shared/evaluationMatrix.js'
import { CLASSIFICATION_RULES, COMMITTEE_LANES } from '../../shared/committeeCatalog.js'

const field = 'w-full rounded-xl border border-line bg-panel px-3 py-2 text-text'
const button = 'rounded-xl border border-line px-4 py-2 hover:border-gold disabled:opacity-40'
const primary = 'rounded-xl bg-gold px-6 py-3 font-bold text-black disabled:opacity-40'
const evaluationModes = [
  { id: 'suggested', title: 'أسئلة مقترحة من النظام', text: 'مراجعة أسئلة البنك وتعديلها واعتماد المناسب.' },
  { id: 'qr', title: 'اختبار عبر QR مع المراقبة', text: 'دخول المتقدم عبر QR ومتابعة الشاشة والتقدم والتنبيهات المتاحة.' },
  { id: 'interview', title: 'مقابلة مباشرة', text: 'استخدام المتاح من البنك أو إدخال أسئلة المقيم مباشرة، ثم تسجيل الإجابات والدرجات.' },
  { id: 'manual', title: 'مقابلة يدوية بالكامل', text: 'لا تحتاج بنك الأسئلة؛ يكتب المقيم الأسئلة والإجابات المتوقعة والأوزان.' },
] as const
const packageLabels: Record<string, string> = {
  oral: 'شفهي',
  driving: 'أهلية قيادة',
  personality: 'شخصية',
}

type QuestionFormat = 'mixed' | 'objective' | 'written'

const FORMAT_OPTIONS: { id: QuestionFormat; title: string; text: string }[] = [
  { id: 'mixed', title: 'جميع الأنماط المتاحة', text: 'مزيج من أنماط البنك المناسبة لنوع التقييم.' },
  { id: 'objective', title: 'اختيار من متعدد', text: 'أسئلة MCQ وصح/خطأ من البنك.' },
  { id: 'written', title: 'كتابي / مقالي', text: 'أسئلة كتابية تتطلب إجابة نصية وتقييمًا يدويًا.' },
]

/** مسارات الفرز — من جدول اللجان الواحد */
const SORT_LANES = COMMITTEE_LANES.map((lane) => ({
  ...lane,
  category: lane.category as ExamCategory,
}))

type SortLaneId = (typeof SORT_LANES)[number]['id']

type CommitteeListItem = {
  id: string
  name: string
  category?: string | null
  oral_role?: string | null
  oralRole?: string | null
  owner_username?: string | null
  ownerUsername?: string | null
}

function questionTypesFor(category: ExamCategory | '', format: QuestionFormat): QuestionType[] {
  if (category === 'oral') return ['oral']
  if (category === 'personality') {
    if (format === 'written') return ['open']
    if (format === 'objective') return ['scale']
    return []
  }
  if (format === 'objective') return ['mcq', 'true_false']
  if (format === 'written') return ['open', 'classic']
  return []
}

function laneOperatorView(lane: (typeof SORT_LANES)[number]) {
  return {
    role: 'operator' as const,
    category: lane.category,
    oralRole: lane.oralRole,
    theoryTrack: lane.theoryTrack,
  }
}

function applicantInLane(applicant: RosterCandidate, lane: (typeof SORT_LANES)[number]) {
  return candidateVisibleToOperator(laneOperatorView(lane), applicant)
}

/** لجنة الحساب الجاهز فقط — owner_username = oral_tech / driving / … */
function committeeForLane(committees: CommitteeListItem[], lane: (typeof SORT_LANES)[number]) {
  const owner = lane.username.toLowerCase()
  return (
    committees.find((c) => String(c.owner_username || c.ownerUsername || '').toLowerCase() === owner) || null
  )
}

/** واجهة الأدمن: فرز حسب oral_tech / theory / … ثم تمرير للجنة */
function AdminSortToCommittee({ token }: { token: string }) {
  const [laneId, setLaneId] = useState<SortLaneId>('oral_tech')
  const [candidates, setCandidates] = useState<RosterCandidate[]>([])
  const [committees, setCommittees] = useState<CommitteeListItem[]>([])
  const [committeeId, setCommitteeId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const lane = SORT_LANES.find((l) => l.id === laneId) || SORT_LANES[0]
  const targetCommittee = useMemo(() => committeeForLane(committees, lane), [committees, lane])

  useEffect(() => {
    apiListEvaluationCandidates(token)
      .then(setCandidates)
      .catch((e) => setError(e instanceof Error ? e.message : 'تعذر تحميل المتقدمين'))
    apiCommittee<CommitteeListItem[]>(token, '/committees')
      .then(setCommittees)
      .catch(() => setCommittees([]))
  }, [token])

  useEffect(() => {
    setCommitteeId(targetCommittee?.id || '')
    setSelected([])
    setMessage('')
  }, [laneId, targetCommittee])

  const pool = useMemo(() => {
    const q = search.trim().toLowerCase()
    return candidates.filter((a) => {
      if (!applicantInLane(a, lane)) return false
      if (!q) return true
      const title = effectiveJobTitle(a)
      return [a.name, title, a.jobTitle, a.org, a.evaluationStreamLabel]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    })
  }, [candidates, lane, search])

  const byJob = useMemo(() => {
    const groups = groupApplicants(pool)
    const byId = new Map(pool.map((a) => [a.id, a]))
    return groups
      .map((g) => ({
        ...g,
        applicants: g.applicantIds.map((id) => byId.get(id)).filter(Boolean) as RosterCandidate[],
      }))
      .sort((a, b) => {
        if (a.missingTitle !== b.missingTitle) return a.missingTitle ? 1 : -1
        return (a.jobTitle || '').localeCompare(b.jobTitle || '', 'ar')
      })
  }, [pool])

  const unresolved = useMemo(
    () => candidates.filter((a) => a.evaluationStream === 'unresolved' || !effectiveJobTitle(a)),
    [candidates],
  )

  async function forwardToCommittee() {
    if (!committeeId || !selected.length) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await apiCommittee<{ addedCount: number; skippedCount: number }>(
        token,
        `/committees/${committeeId}/candidates`,
        'POST',
        { applicantIds: selected },
      )
      setMessage(
        `فُرز ${result.addedCount} متقدم لحساب ${lane.username}` +
          (result.skippedCount ? ` (تُجُوهل ${result.skippedCount})` : '') +
          `. ادخل بحساب «${lane.username}» لإنشاء الاختبار.`,
      )
      setSelected([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التمرير للجنة')
    } finally {
      setBusy(false)
    }
  }

  async function sortAll() {
    setBusy(true)
    setError('')
    setMessage('')
    const lines: string[] = []
    try {
      for (const item of SORT_LANES) {
        if (!item.toCommittee) continue
        const committee = committeeForLane(committees, item)
        const ids = candidates.filter((a) => applicantInLane(a, item)).map((a) => a.id)
        if (!committee || !ids.length) continue
        const result = await apiCommittee<{ addedCount: number; skippedCount: number; skipped?: { reason?: string }[] }>(
          token,
          `/committees/${committee.id}/candidates`,
          'POST',
          { applicantIds: ids },
        )
        const reasons = [...new Set((result.skipped || []).map((row) => row.reason).filter(Boolean))]
        lines.push(
          `${item.label}: فُرز ${result.addedCount}` +
            (result.skippedCount ? `، تُجوهل ${result.skippedCount}${reasons.length ? ` (${reasons.join('، ')})` : ''}` : ''),
        )
      }
      if (unresolved.length) lines.push(`مسمى غير معروف ولم يُفرز: ${unresolved.length}`)
      setMessage(lines.length ? lines.join('\n') : 'لا متقدمين مطابقين للفرز.')
      setSelected([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الفرز')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gold">فرز المتقدمين حسب المصفوفة</h1>
        <p className="mt-2 text-mute">
          كل متقدم يذهب إلى اللجان التي تطابق مسماه. المسمى غير المعروف لا يُفرز. اللجنة بعدها تنشئ الاختبار من بنك الأسئلة.
        </p>
        <p className="mt-2 text-sm text-light-gold">
          الحسابات الجاهزة هي اللجان — لا تُنشأ كلمات مرور جديدة.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <h2 className="border-b border-line px-4 py-3 font-bold text-gold">الاختبارات حسب التصنيف</h2>
          <table className="w-full text-sm">
            <thead className="text-mute">
              <tr>
                <th className="px-4 py-2 text-right font-medium">التصنيف</th>
                <th className="px-4 py-2 text-right font-medium">الاختبارات</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(CLASSIFICATION_RULES).map((rule) => (
                <tr key={rule.id} className="border-t border-line">
                  <td className="px-4 py-2 font-bold">{rule.label}</td>
                  <td className="px-4 py-2">
                    {rule.examTrackIds.map((id) => EVALUATION_TRACKS[id]?.label || id).join('، ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <h2 className="border-b border-line px-4 py-3 font-bold text-gold">اللجان وما تختبره</h2>
          <table className="w-full text-sm">
            <thead className="text-mute">
              <tr>
                <th className="px-4 py-2 text-right font-medium">الحساب</th>
                <th className="px-4 py-2 text-right font-medium">الاختبار</th>
                <th className="px-4 py-2 text-right font-medium">التصنيفات</th>
              </tr>
            </thead>
            <tbody>
              {COMMITTEE_LANES.map((lane) => (
                <tr key={lane.username} className="border-t border-line">
                  <td className="px-4 py-2 font-mono text-xs">{lane.username}</td>
                  <td className="px-4 py-2">{lane.tests}</td>
                  <td className="px-4 py-2">{lane.classifications.join('، ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-error/40 p-4 text-error">
          {error}
        </div>
      )}
      {message && <p className="whitespace-pre-line rounded-xl border border-ok/40 bg-ok/10 p-3 text-ok">{message}</p>}

      {!!unresolved.length && (
        <section className="space-y-2 rounded-2xl border border-warn/40 bg-warn/10 p-5">
          <h2 className="font-bold text-warn">مسمى غير معروف — لا يُفرز ({unresolved.length})</h2>
          <p className="text-sm text-mute">صحّح المسمى في سجل المتقدمين حتى يُحسب مساره في المصفوفة.</p>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {unresolved.slice(0, 40).map((a) => (
              <li key={a.id}>{a.name} — {effectiveJobTitle(a) || 'بلا مسمى'}</li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className={primary} disabled={busy || !candidates.length} onClick={() => void sortAll()}>
        {busy ? 'جاري الفرز…' : 'فرز الجميع حسب المصفوفة'}
      </button>

      <section className="space-y-4 rounded-2xl border border-gold/40 bg-card p-5">
        <div>
          <span className="text-sm font-bold text-gold">الخطوة الأولى</span>
          <h2 className="mt-1 text-xl font-bold">اختر مسار الفرز</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SORT_LANES.map((l) => {
            const count = candidates.filter((a) => applicantInLane(a, l)).length
            const ready = l.toCommittee ? !!committeeForLane(committees, l) : true
            return (
              <button
                type="button"
                key={l.id}
                onClick={() => setLaneId(l.id)}
                className={`rounded-2xl border p-4 text-right transition ${laneId === l.id ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'}`}
              >
                <div className="font-mono text-xs text-mute">{l.username}</div>
                <div className="mt-1 font-bold text-gold">{l.label}</div>
                <div className="mt-1 text-xs text-mute">{l.description}</div>
                <div className="mt-2 text-xs text-mute">
                  {count} متقدم
                  {l.toCommittee ? (ready ? ' · حساب جاهز' : ' · بانتظار التهيئة') : ' · من حساب الأمن'}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
        <div>
          <span className="text-sm font-bold text-gold">الخطوة الثانية</span>
          <h2 className="mt-1 text-xl font-bold">
            المفروزون لمسار <span className="font-mono text-gold">{lane.username}</span>
          </h2>
          <p className="mt-1 text-sm text-mute">مجمّعون حسب مسمى العمل ({pool.length} متقدم · {byJob.length} مسمى)</p>
        </div>

        <input
          aria-label="بحث"
          className={field}
          placeholder="بحث بالاسم أو المسمى أو الجهة"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <button type="button" className={button} onClick={() => setSelected(pool.map((a) => a.id))}>
            تحديد الكل المفروز ({pool.length})
          </button>
          <button type="button" className={button} onClick={() => setSelected([])}>
            إلغاء التحديد
          </button>
        </div>

        <div className="max-h-96 space-y-3 overflow-auto">
          {byJob.map((g) => {
            const ids = g.applicants.map((a) => a.id)
            const allOn = ids.length > 0 && ids.every((id) => selected.includes(id))
            return (
              <div key={g.key} className="rounded-xl border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel/50 px-3 py-2">
                  <span className="font-bold text-gold">
                    {g.missingTitle || !g.jobTitle ? 'بلا مسمى' : g.jobTitle}
                    <span className="mr-2 text-xs font-normal text-mute">{g.applicants.length}</span>
                  </span>
                  <button
                    type="button"
                    className={button}
                    onClick={() =>
                      setSelected((prev) =>
                        allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
                      )
                    }
                  >
                    {allOn ? 'إلغاء المجموعة' : 'تحديد المجموعة'}
                  </button>
                </div>
                <div className="grid gap-1 p-2 md:grid-cols-2">
                  {g.applicants.map((a) => {
                    const tracks = (a.evaluationTracks || []).map((t) => t.label).join(' · ')
                    return (
                      <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent p-2 hover:border-line">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.includes(a.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                            )
                          }
                        />
                        <span>
                          {a.name}
                          <small className="block text-mute">
                            {a.org || '—'}
                            {a.evaluationStreamLabel ? ` · ${a.evaluationStreamLabel}` : ''}
                            {tracks ? ` — ${tracks}` : ''}
                          </small>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {!byJob.length && <p className="p-4 text-mute">لا متقدمين في هذا المسار وفق مصفوفة التقييم.</p>}
        </div>
      </section>

      {lane.toCommittee ? (
        <section className="space-y-4 rounded-2xl border border-gold/40 bg-gold/5 p-5">
          <h2 className="text-lg font-bold text-gold">
            تأكيد الفرز لحساب <span className="font-mono">{lane.username}</span>
          </h2>
          {!targetCommittee ? (
            <p className="text-sm text-warn">
              لجنة الحساب «{lane.username}» غير جاهزة بعد. حدّث الصفحة بعد تشغيل الخادم — تُنشأ اللجان تلقائياً عند فتح قائمة اللجان.
            </p>
          ) : (
            <>
              <p className="text-sm text-mute">
                الهدف: {targetCommittee.name} — الفرز فقط دون إنشاء اختبار. ادخل لاحقاً بحساب{' '}
                <span className="font-mono text-gold">{lane.username}</span> لإنشاء الاختبار.
              </p>
              <button
                type="button"
                className={primary}
                disabled={busy || !selected.length || !committeeId}
                onClick={() => void forwardToCommittee()}
              >
                {busy ? 'جاري الفرز…' : `تأكيد فرز ${selected.length} متقدم لحساب ${lane.username}`}
              </button>
            </>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-card p-5 text-sm text-mute">
          مسار الأمن العسكري يُدار من حسابه مباشرة وليس عبر لجنة فرز الاختبارات.
          <Link className="mr-2 text-gold underline" to="/admin/applicants">
            سجل المتقدمين
          </Link>
        </section>
      )}
    </div>
  )
}

export function AdminCreateExamPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [category, setCategory] = useState<ExamCategory | ''>(user?.role === 'operator' ? user.category || '' : '')
  const [packageMode, setPackageMode] = useState(false)
  const [evaluationMode, setEvaluationMode] = useState('')
  const [questionFormat, setQuestionFormat] = useState<QuestionFormat>('mixed')
  const [questionCount, setQuestionCount] = useState(20)
  const [title, setTitle] = useState('')
  const [candidates, setCandidates] = useState<RosterCandidate[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<any>(null)

  useEffect(() => {
    if (!user?.token || isAdmin) return
    apiListEvaluationCandidates(user.token)
      .then(setCandidates)
      .catch((e) => setError(e.message))
  }, [user?.token, isAdmin])

  const questionTypes = useMemo(() => questionTypesFor(category, questionFormat), [category, questionFormat])
  const showFormatPicker = !packageMode && !!category && category !== 'oral' && evaluationMode !== 'manual'
  const formatOptions = useMemo(() => {
    if (category === 'personality') {
      return [
        { id: 'mixed' as const, title: 'مقياس السمات (الافتراضي)', text: 'عبارات مقياس موافقة من 1 إلى 5.' },
        { id: 'objective' as const, title: 'مقياس السمات فقط', text: 'أسئلة scale من بنك الشخصية.' },
        { id: 'written' as const, title: 'كتابي معرفي', text: 'أسئلة مقالية معرفية من بنك الشخصية.' },
      ]
    }
    return FORMAT_OPTIONS
  }, [category])

  const groups = useMemo(() => groupApplicants(candidates.filter((a) => selected.includes(a.id))), [candidates, selected])
  const configs = groups.map((g) => {
    const profile = JOB_PROFILES.find((p) => p.id === (g.profileId || 'unclassified')) || JOB_PROFILES.find((p) => p.id === 'unclassified')!
    return {
      key: g.key,
      profileId: profile.id,
      specialty: profile.specialty,
      jobLevel: inferJobLevel(g.jobTitle),
      difficulty: 'mixed',
      questionCount: Math.max(1, Math.min(100, Number(questionCount) || 20)),
      includeShared: ['driving', 'personality'].includes(category as string),
      skills: [],
      questionTypes: packageMode ? [] : questionTypes,
    }
  })
  const payload = packageMode
    ? { title, evaluationMode: 'qr', applicantIds: selected, groups: configs }
    : { title, category, evaluationMode: category === 'theory' ? null : evaluationMode, applicantIds: selected, groups: configs }
  const fingerprint = JSON.stringify(payload)
  const currentPreview = preview?.fingerprint === fingerprint ? preview : null
  const trackIdForCategory = useMemo(() => {
    if (packageMode) return null
    if (category === 'personality') return 'personality'
    if (category === 'driving') return 'driving'
    if (category === 'security') return 'security'
    if (category === 'theory') return user?.theoryTrack === 'office' ? 'writing' : 'general'
    if (category === 'oral') {
      const role = user?.oralRole || ''
      if (['programmer', 'systems_engineer'].includes(role)) return 'programming'
      if (role === 'network_engineer') return 'networks'
      if (role === 'admin') return 'admin_oral'
      return 'maintenance'
    }
    return null
  }, [category, packageMode, user?.oralRole, user?.theoryTrack])

  const matrixSummary = useMemo(
    () => summarizeTracksForApplicants(candidates.filter((a) => selected.includes(a.id))),
    [candidates, selected],
  )

  const visible = candidates.filter((a) => {
    if (user?.role === 'operator' && category === 'oral' && user.oralRole) {
      const role = resolveJobProfile(effectiveJobTitle(a) || a.jobTitle || '')?.oralRole
      if (role && !oralRolesCompatible(user.oralRole, role)) return false
    }
    if (trackIdForCategory && Array.isArray(a.evaluationTracks) && a.evaluationTracks.length) {
      if (!a.evaluationTracks.some((t) => t.id === trackIdForCategory)) return false
    }
    const jobTitle = effectiveJobTitle(a)
    return !search || [a.name, jobTitle, a.jobTitle, a.jobTitleOrg, a.jobTitleCommittee, a.org, a.evaluationStreamLabel].some((s) => s?.includes(search))
  })

  async function submit(create: boolean) {
    if (!user) return
    setBusy(true)
    setError('')
    try {
      const path = packageMode
        ? create
          ? '/admin/exams/package'
          : '/admin/exams/package/preview'
        : create
          ? '/admin/exams'
          : '/admin/exams/preview'
      const data = await apiCommittee<any>(user.token, path, 'POST', payload)
      if (create) setCreated({ ...data, evaluationMode: payload.evaluationMode, package: packageMode || !!data.package, questionFormat, splitOral: !!data.splitOral })
      else setPreview({ ...data, fingerprint })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تنفيذ الطلب')
    } finally {
      setBusy(false)
    }
  }

  if (user?.role === 'commander') {
    return (
      <div className="rounded-xl border border-line p-6 text-center">
        <p className="text-mute">حساب القائد مخصص للعرض ولا يملك صلاحية إنشاء الاختبارات.</p>
        <Link className="mt-4 inline-block text-gold" to="/admin">
          العودة إلى لوحة الاختبارات
        </Link>
      </div>
    )
  }

  if (isAdmin && user?.token) {
    return <AdminSortToCommittee token={user.token} />
  }

  if (created?.package && created.exams) {
    return (
      <div className="mx-auto max-w-4xl space-y-5" dir="rtl">
        <h1 className="text-2xl font-bold text-gold">تم إنشاء حزمة التقييم عبر QR</h1>
        <p>تُفصل اختبارات الشفهي حسب التخصص ليرتبط كل اختبار بحسابه.</p>
        <div className="grid gap-3">
          {created.exams.map((exam: any) => (
            <article key={exam.id} className="rounded-2xl border border-line bg-card p-4">
              <h2 className="font-bold text-gold">{exam.title}</h2>
              <p className="text-sm text-mute">
                {packageLabels[exam.category] || exam.category}
                {exam.oralLabel ? ` — ${exam.oralLabel}` : ''} • {exam.rosterCount || exam.roster?.length || 0} متقدم
              </p>
              {exam.showsBarcode !== false && (
                <Link className={button + ' mt-3 inline-block'} to={'/admin/roster/' + exam.id}>
                  بطاقات QR
                </Link>
              )}
            </article>
          ))}
        </div>
        <button className={button} onClick={() => { setCreated(null); setPreview(null) }}>
          إنشاء اختبار آخر
        </button>
      </div>
    )
  }

  if (created?.splitOral && created.exams) {
    return (
      <div className="mx-auto max-w-4xl space-y-5" dir="rtl">
        <h1 className="text-2xl font-bold text-gold">تم فصل اختبارات الشفهي حسب التخصص</h1>
        <p>oral_tech · oral_prog · oral_net</p>
        <div className="grid gap-3">
          {created.exams.map((exam: any) => (
            <article key={exam.id} className="rounded-2xl border border-line bg-card p-4">
              <h2 className="font-bold text-gold">{exam.title}</h2>
              {exam.showsBarcode !== false && (
                <Link className={button + ' mt-3 inline-block'} to={'/admin/roster/' + exam.id}>
                  بطاقات الدخول
                </Link>
              )}
            </article>
          ))}
        </div>
        <button className={button} onClick={() => { setCreated(null); setPreview(null) }}>
          إنشاء اختبار آخر
        </button>
      </div>
    )
  }

  if (created) {
    return (
      <div className="mx-auto max-w-4xl space-y-5" dir="rtl">
        <h1 className="text-2xl font-bold text-gold">تم إنشاء {created.title}</h1>
        {created.evaluationMode && (
          <p className="rounded-xl border border-gold/40 p-3 text-light-gold">
            وضع التنفيذ: {evaluationModes.find((mode) => mode.id === created.evaluationMode)?.title}
          </p>
        )}
        {created.pendingQuestions ? (
          <Link className="inline-block rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink" to={'/admin/complete-questions/' + created.id}>
            استكمال أسئلة المسودة
          </Link>
        ) : created.showsBarcode === false ? (
          <p className="rounded-xl border border-line p-3 text-sm text-mute">هذا الاختبار لا يحتاج باركود دخول.</p>
        ) : (
          <Link className={button} to={'/admin/roster/' + created.id}>
            بطاقات الدخول
          </Link>
        )}
        <button className={button} onClick={() => { setCreated(null); setPreview(null) }}>
          إنشاء اختبار آخر
        </button>
      </div>
    )
  }

  const readyForCandidates = packageMode || (category && (category === 'theory' || evaluationMode))
  return (
    <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gold">إنشاء اختبار حسب المسمى الوظيفي</h1>
        <p className="mt-2 text-mute">اختبار واحد لمجموعات مختلفة وفق مصفوفة آلية التقييم. شفهي المبرمج ومهندس النظم مسار موحّد.</p>
      </div>
      {!(user?.role === 'operator' && user.category === 'theory') && (
        <section className="space-y-4 rounded-2xl border border-gold/50 bg-card p-5">
          <div>
            <span className="text-sm font-bold text-gold">الخطوة الأولى</span>
            <h2 className="mt-1 text-xl font-bold">اختر وضع التنفيذ والتقييم</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {evaluationModes.map((mode) => (
              <button
                type="button"
                key={mode.id}
                onClick={() => {
                  setEvaluationMode(mode.id)
                  if (mode.id !== 'qr') setPackageMode(false)
                  setPreview(null)
                }}
                className={`space-y-2 rounded-2xl border p-5 text-right transition ${evaluationMode === mode.id ? 'border-gold bg-gold/10' : 'border-line bg-panel hover:border-gold'}`}
              >
                <h3 className="font-bold text-gold">{mode.title}</h3>
                <p className="text-sm text-mute">{mode.text}</p>
              </button>
            ))}
          </div>
        </section>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-error/40 p-4 text-error">
          {error}
        </div>
      )}
      {evaluationMode && !packageMode && (
        <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <div>
            <span className="text-sm font-bold text-gold">الخطوة الثانية</span>
            <h2 className="mt-1 text-xl font-bold">اختر نوع التقييم</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(CATEGORY_META)
              .filter(([id]) => id !== 'theory' && id !== 'security')
              .map(([id, meta]) => {
                const disabled = user?.role === 'operator' && user.category !== id
                return (
                  <button
                    type="button"
                    disabled={disabled}
                    key={id}
                    onClick={() => {
                      setCategory(id as ExamCategory)
                      setQuestionFormat('mixed')
                      setPreview(null)
                    }}
                    className={`rounded-2xl border p-5 text-right transition disabled:opacity-30 ${category === id ? 'border-gold bg-gold/10 text-light-gold' : 'border-line bg-panel hover:border-gold'}`}
                  >
                    <span className="font-bold">{meta.label}</span>
                  </button>
                )
              })}
          </div>
        </section>
      )}
      {showFormatPicker && (
        <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-xl font-bold">اختر شكل الأسئلة</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {formatOptions.map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => {
                  setQuestionFormat(opt.id)
                  setPreview(null)
                }}
                className={`space-y-2 rounded-2xl border p-5 text-right transition ${questionFormat === opt.id ? 'border-gold bg-gold/10' : 'border-line bg-panel hover:border-gold'}`}
              >
                <h3 className="font-bold text-gold">{opt.title}</h3>
                <p className="text-sm text-mute">{opt.text}</p>
              </button>
            ))}
          </div>
        </section>
      )}
      {readyForCandidates && (
        <>
          <section className="grid gap-4 rounded-2xl border border-line bg-card p-5">
            <label>
              عنوان الاختبار
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تقييم المرشحين — الدفعة الأولى" />
            </label>
            {evaluationMode !== 'manual' && (
              <label>
                عدد الأسئلة لكل متقدم
                <input
                  className={field}
                  type="number"
                  min={1}
                  max={100}
                  value={questionCount}
                  onChange={(e) => {
                    setQuestionCount(Number(e.target.value) || 1)
                    setPreview(null)
                  }}
                />
              </label>
            )}
          </section>
          <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
            <div className="flex justify-between gap-3">
              <h2 className="text-lg font-bold">المتقدمون ({selected.length} محدد)</h2>
              <Link className="text-gold" to="/admin/applicants">
                سجل المتقدمين
              </Link>
            </div>
            <input aria-label="بحث المتقدمين" className={field} placeholder="بحث بالاسم أو مسمى العمل أو الجهة" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="flex gap-3">
              <button className={button} onClick={() => setSelected([...new Set([...selected, ...visible.map((a) => a.id)])])}>
                تحديد الظاهر ({visible.length})
              </button>
              <button className={button} onClick={() => setSelected([])}>
                إلغاء التحديد
              </button>
            </div>
            <div className="grid max-h-72 gap-2 overflow-auto md:grid-cols-2">
              {visible.map((a) => {
                const jobTitle = effectiveJobTitle(a)
                const missing = a.missingTitle || !jobTitle
                const tracks = (a.evaluationTracks || []).map((t) => t.label).join(' · ')
                return (
                  <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(a.id)}
                      onChange={(e) => setSelected(e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id))}
                    />
                    <span>
                      {a.name}
                      <small className="block text-mute">
                        {missing ? 'بلا مسمى' : jobTitle}
                        {a.org ? ` • ${a.org}` : ''}
                        {a.evaluationStreamLabel ? ` • ${a.evaluationStreamLabel}` : ''}
                        {tracks ? ` — ${tracks}` : ''}
                      </small>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
          {matrixSummary.length > 0 && (
            <section className="space-y-3 rounded-2xl border border-gold/40 bg-gold/5 p-5">
              <h2 className="text-lg font-bold text-gold">من يظهر هذا الاختبار حسب آلية التقييم</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {matrixSummary.map((row) => (
                  <article key={row.streamId} className="rounded-xl border border-line bg-card p-4">
                    <h3 className="font-bold">
                      {row.label} <span className="text-mute">({row.count})</span>
                    </h3>
                    <p className="mt-2 text-sm text-mute">{row.tracks.join(' · ') || '—'}</p>
                  </article>
                ))}
              </div>
              {trackIdForCategory && (
                <p className="text-sm text-light-gold">
                  المسار الحالي: {EVALUATION_TRACKS[trackIdForCategory as keyof typeof EVALUATION_TRACKS]?.label || trackIdForCategory}
                </p>
              )}
            </section>
          )}
          {groups.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold">ملخص حسب مسمى العمل ({groups.length})</h2>
              {groups.map((g, i) => {
                const c = configs[i]
                const profile = JOB_PROFILES.find((p) => p.id === c.profileId)
                const result = currentPreview?.groups?.find((r: any) => r.key === g.key)
                return (
                  <article key={g.key} className="space-y-3 rounded-2xl border border-line bg-card p-5">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-gold">{g.missingTitle || !g.jobTitle ? 'بلا مسمى' : g.jobTitle}</h3>
                        <p className="mt-1 text-sm text-mute">{g.profileId ? profile?.specialtyLabel : 'تخصص جديد'}</p>
                      </div>
                      <span>{g.applicantIds.length} متقدم</span>
                    </div>
                    {result && (
                      <div role="status" className={'rounded-xl border p-3 ' + (result.enough ? 'border-ok text-ok' : 'border-gold text-gold')}>
                        المتاح: {result.available} • المطلوب: {result.requested} • الفعلي: {result.actual}
                      </div>
                    )}
                  </article>
                )
              })}
            </section>
          )}
          <div className="flex flex-wrap items-center gap-3 pb-10">
            <button className={button} disabled={busy || !selected.length} onClick={() => void submit(false)}>
              {busy ? 'جارٍ التنفيذ…' : 'معاينة الأسئلة المتاحة'}
            </button>
            <button className={primary} disabled={busy || !title.trim() || selected.length === 0} onClick={() => void submit(true)}>
              إنشاء الاختبار بالأسئلة المتاحة
            </button>
            {selected.length === 0 && <span className="text-sm text-mute">يرجى تحديد متقدمين.</span>}
          </div>
        </>
      )}
    </div>
  )
}
