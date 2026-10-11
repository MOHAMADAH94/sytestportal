import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Plus, Save, Users } from 'lucide-react'
import { apiCommittee, apiListEvaluationCandidates, apiListExams, type AdminExam, type RosterAccount, type RosterCandidate } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { CATEGORY_META, type ExamCategory } from '../data/types'
import { oralRolesCompatible } from '../../shared/jobProfiles.js'
import { candidateVisibleToOperator } from '../../shared/evaluationMatrix.js'
import { COMMITTEE_LANES } from '../../shared/committeeCatalog.js'
import { ApplicantCombobox } from '../components/ApplicantCombobox'
import { RosterCards } from '../components/RosterCards'

type Member = { id?: string; name: string; username: string; role: string; active: boolean; weight: number; password?: string; externalOwner?: boolean }
type Assignment = {
  id: string
  examId: string
  title: string
  category: ExamCategory
  questionCount?: number
  active?: boolean
  emptySets?: number
  evaluationMode?: string | null
}
type CommitteeCandidate = {
  applicantId: string
  name: string
  displayId?: string | null
  jobTitle: string
  org?: string
  covered: boolean
  missing?: boolean
  assignedAt?: string
}
type Committee = {
  id: string
  name: string
  revision: number
  category?: ExamCategory | null
  oralRole?: string | null
  ownerUsername?: string | null
  members: Member[]
  assignments: Assignment[]
  candidates?: CommitteeCandidate[]
}
type CommitteeListItem = {
  id: string
  name: string
  category?: string | null
  oral_role?: string | null
  oralRole?: string | null
  owner_username?: string | null
  ownerUsername?: string | null
}
type Contribution = { accountId: string; name: string; username?: string; role: string; weight: number; score: number; contribution: number }
type Evaluations = {
  candidates: { name: string; displayId: string; scoreVersion: string }[]
  scores: { examineeName: string; accountId: string; percent: number }[]
  results: { examineeName: string; percent: number; publishedAt: string; snapshot: Contribution[]; note?: string | null; estimatedSalary?: number | null }[]
  objectiveExam?: boolean
  objectiveScores?: { examineeName: string; score: number; maxScore: number; percent: number }[]
}
type CreatedExamResult = {
  ok: boolean
  assignmentId: string
  evaluationMode: string
  questionCount?: number
  questionTypes?: string[]
  durationMinutes?: number | null
  publicAppUrl?: string
  showsBarcode?: boolean
  exam: { id: string; title: string; category: string; oralRole?: string | null; active: boolean; capacity: number; questionCount?: number; showsBarcode?: boolean }
  roster: { id: string; name: string; displayId?: string; jobTitle?: string; demandTitle?: string; tracks?: { id: string; label: string; done: boolean }[]; qrToken?: string | null }[]
  warnings?: string[]
  skippedCovered?: number
}

/** أنواع التقييم التي يختارها الأدمن فقط — طريقة التنفيذ تختارها اللجنة */
/** أنواع التقييم — من جدول اللجان، بلا حسابات متقاعدة */
const ADMIN_TRACKS = COMMITTEE_LANES.filter((lane) => lane.toCommittee).map((lane) => ({
  ...lane,
  category: lane.category as ExamCategory,
}))

type AdminTrackId = (typeof ADMIN_TRACKS)[number]['id']

const input = 'w-full rounded-xl border border-line bg-void px-3 py-2.5 text-sm text-text outline-none focus:border-gold disabled:opacity-50'
const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-40'
const secondary = 'rounded-xl border border-line px-4 py-2.5 text-sm text-text disabled:opacity-40'
const roleLabel = (role: string) => (role === 'committee_manager' ? 'مدير اللجنة' : 'عضو اللجنة')
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'تعذر الاتصال بالخادم')
const trackLabel = (committee: {
  category?: string | null
  oralRole?: string | null
  oral_role?: string | null
  owner_username?: string | null
  ownerUsername?: string | null
}) => {
  const owner = committee.ownerUsername || committee.owner_username
  if (owner) {
    const byOwner = ADMIN_TRACKS.find((t) => t.ownerUsername === owner)
    if (byOwner) return byOwner.label
  }
  const role = committee.oralRole || committee.oral_role || null
  const hit = ADMIN_TRACKS.find((t) => t.category === committee.category && (t.oralRole || null) === (role || null))
  return hit?.label || CATEGORY_META[(committee.category || 'oral') as ExamCategory]?.label || '—'
}

const QUESTION_FORMATS: Record<string, { id: string; label: string; types: string[] }[]> = {
  theory: [
    { id: 'mixed', label: 'مزيج من البنك', types: [] },
    { id: 'mcq', label: 'اختيار من متعدد', types: ['mcq', 'true_false'] },
    { id: 'written', label: 'أسئلة كتابية', types: ['open', 'classic'] },
  ],
  oral: [
    { id: 'oral', label: 'مقابلة شفهية', types: ['oral'] },
    { id: 'mcq', label: 'اختيار من متعدد', types: ['mcq', 'true_false'] },
    { id: 'written', label: 'أسئلة كتابية', types: ['open', 'classic'] },
    { id: 'mixed', label: 'مزيج من البنك', types: [] },
  ],
  driving: [
    { id: 'mcq', label: 'اختيار من متعدد', types: ['mcq', 'true_false'] },
    { id: 'written', label: 'أسئلة كتابية', types: ['open', 'classic'] },
    { id: 'mixed', label: 'مزيج من البنك', types: [] },
  ],
  personality: [
    { id: 'scale', label: 'مقياس السمات', types: ['scale'] },
    { id: 'written', label: 'أسئلة كتابية / معرفية', types: ['open', 'classic'] },
  ],
}

const DEFAULT_SECONDS: Record<string, number> = { oral: 300, driving: 300, personality: 90, theory: 60 }

function defaultDurationMinutes(category: string | null | undefined, questionCount: number) {
  const perQ = DEFAULT_SECONDS[category || ''] || 180
  return Math.max(1, Math.min(600, Math.round((perQ * Math.max(1, questionCount)) / 60)))
}

function defaultFormatId(category: string | null | undefined) {
  if (category === 'personality') return 'scale'
  if (category === 'oral') return 'oral'
  if (category === 'theory') return 'mixed'
  return 'mixed'
}

function suggestedWeights(members: Member[]): Member[] {
  const count = members.filter((member) => member.active).length
  const managerWeight = count === 1 ? 10000 : count === 2 ? 6000 : 4000
  const others = count - 1
  let remainder = others ? (10000 - managerWeight) % others : 0
  return members.map((member) => ({
    ...member,
    weight: !member.active
      ? 0
      : member.role === 'committee_manager'
        ? managerWeight / 100
        : (Math.floor((10000 - managerWeight) / others) + (remainder-- > 0 ? 1 : 0)) / 100,
  }))
}

export function CommitteesPage() {
  const { user } = useAuth()
  const [list, setList] = useState<CommitteeListItem[]>([])
  const [selected, setSelected] = useState('')
  const [committee, setCommittee] = useState<Committee | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createVisible, setCreateVisible] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    managerName: '',
    username: '',
    password: '',
    trackId: 'oral_tech' as AdminTrackId,
  })
  const token = user!.token
  const admin = user!.role === 'admin'
  const ownerOperator = user!.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user!.category || '')
  const manage = admin || ownerOperator || user!.role === 'committee_manager'
  const loadList = useCallback(async () => {
    const result = await apiCommittee<CommitteeListItem[]>(token, '/committees')
    setList(result)
    setSelected((value) => value || result[0]?.id || '')
  }, [token])
  useEffect(() => {
    let active = true
    apiCommittee<CommitteeListItem[]>(token, '/committees')
      .then((result) => {
        if (active) {
          setList(result)
          setSelected((value) => value || result[0]?.id || '')
        }
      })
      .catch((err) => {
        if (active) setError(errorText(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])
  const refresh = useCallback(async () => {
    if (selected) setCommittee(await apiCommittee<Committee>(token, `/committees/${selected}`))
  }, [token, selected])
  useEffect(() => {
    let active = true
    if (selected) {
      apiCommittee<Committee>(token, `/committees/${selected}`)
        .then((result) => {
          if (active) {
            setCommittee(result)
            setError('')
          }
        })
        .catch((err) => {
          if (active) setError(errorText(err))
        })
    }
    return () => {
      active = false
    }
  }, [token, selected])
  async function create(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const result = await apiCommittee<{ id: string }>(token, '/committees', 'POST', { name: draft.name })
      setDraft({ name: '', managerName: '', username: '', password: '', trackId: 'oral_tech' })
      setCreateVisible(false)
      await loadList()
      setSelected(result.id)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setCreating(false)
    }
  }
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-light-gold">
            <Users /> لجنة التقييم
          </h1>
          <p className="mt-2 text-sm text-mute">
            {admin
              ? 'اللجان هي حسابات الدخول الجاهزة. الفرز من صفحة «فرز» حسب المصفوفة، ثم تنشئ اللجنة الاختبار من بنك الأسئلة.'
              : 'حدد عدد الأسئلة ونوعها والمدة. تُسحب الأسئلة من البنك بعدد واحد لكل المتقدمين المسندين.'}
          </p>
        </div>
        {ownerOperator && !list.length && (
          <button className={button} onClick={() => setCreateVisible(!createVisible)}>
            <Plus size={18} /> تشكيل لجنتي
          </button>
        )}
        {admin && (
          <Link className={button} to="/admin/create">
            فرز المتقدمين للحسابات
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-4 text-error">
          {error}
        </p>
      )}
      {createVisible && ownerOperator && (
        <form onSubmit={create} className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-bold text-light-gold">تشكيل لجنتي</h2>
          <label className="block space-y-2 text-sm text-text">
            <span>اسم اللجنة</span>
            <input
              required
              maxLength={120}
              className={input}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <p className="text-sm text-mute">
            ستكون رئيس اللجنة تلقائيًا من حسابك الحالي، وتُخصص اللجنة لـ{CATEGORY_META[user!.category!].label}
            {user!.oralRole ? ' ولنطاقك الشفهي المحدد' : ''}.
          </p>
          <button className={button} disabled={creating}>
            {creating ? 'جاري الإنشاء…' : 'تشكيل اللجنة برئاستي'}
          </button>
        </form>
      )}
      {admin && !loading && (
        <p className="rounded-2xl border border-line bg-card p-4 text-sm text-mute">
          لا تُنشأ لجان بكلمات مرور جديدة. استخدم{' '}
          <Link className="text-gold underline" to="/admin/create">
            صفحة الفرز
          </Link>{' '}
          لتمرير المتقدمين إلى theory / office / oral_prog / oral_net / oral_tech ثم ادخل بذلك الحساب.
        </p>
      )}
      {loading ? (
        <p className="text-mute">جاري تحميل اللجان…</p>
      ) : !list.length ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-mute">
          {ownerOperator
            ? 'لم تُهيأ لجنة لحسابك بعد. أعد تشغيل الخادم أو شكّل اللجنة من الزر أعلاه.'
            : 'لم تُهيأ لجان الحسابات بعد. أعد تشغيل الخادم.'}
        </p>
      ) : (
        <>
          <label className="block max-w-md space-y-2 text-sm text-text">
            <span>{admin ? 'لجان الحسابات الجاهزة' : 'اللجنة'}</span>
            <select aria-label="اللجنة" className={input} value={selected} onChange={(event) => setSelected(event.target.value)}>
              {list.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.owner_username || item.ownerUsername
                    ? ` — ${item.owner_username || item.ownerUsername}`
                    : ` — ${trackLabel(item)}`}
                </option>
              ))}
            </select>
          </label>
          {committee?.id === selected && (
            <>
              <p className="text-sm text-mute">
                حساب اللجنة:{' '}
                <span className="font-mono font-bold text-gold">{committee.ownerUsername || '—'}</span>
              </p>
              <MembersEditor key={`${committee.id}-${committee.revision}`} committee={committee} token={token} manage={manage} refresh={refresh} />
              {admin && <AdminSortToCommitteePanel committee={committee} token={token} refresh={refresh} />}
              {!admin && (
                <CommitteeExamBuilder committee={committee} token={token} manage={manage} admin={admin} refresh={refresh} />
              )}
              <Assignments
                key={committee.id}
                committee={committee}
                token={token}
                admin={admin}
                canAssign={false}
                manage={manage}
                accountId={ownerOperator ? `operator:${user!.username}` : String(user!.id || '')}
                refresh={refresh}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

function MembersEditor({ committee, token, manage, refresh }: { committee: Committee; token: string; manage: boolean; refresh: () => Promise<void> }) {
  const [members, setMembers] = useState<Member[]>(committee.members)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = JSON.stringify(members.map(({ password: _p, ...rest }) => rest)) !== JSON.stringify(committee.members.map(({ password: _p, ...rest }) => rest))
  const total = Math.round(members.filter((m) => m.active).reduce((s, m) => s + m.weight, 0) * 100)
  const valid = total === 10000
  return (
    <form
      className="space-y-4 rounded-2xl border border-line bg-card p-5"
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        setError('')
        const missingPassword = members.some((member) => !member.id && !member.externalOwner && !String(member.password || '').trim())
        if (missingPassword) {
          setSaving(false)
          setError('أدخل كلمة مرور من 8 أحرف على الأقل لكل عضو جديد')
          return
        }
        try {
          await apiCommittee(token, `/committees/${committee.id}/members`, 'PUT', { revision: committee.revision, members })
          await refresh()
        } catch (err) {
          setError(errorText(err))
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-light-gold">أعضاء اللجنة والأوزان</h2>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} onClick={() => setMembers(suggestedWeights(members))}>
              توزيع مقترح
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() => setMembers(suggestedWeights([...members, { name: '', username: '', role: 'committee_member', active: true, weight: 0, password: '' }]))}
            >
              <Plus size={16} /> عضو
            </button>
            <button className={button} disabled={!dirty || !valid || saving}>
              <Save size={16} /> {saving ? 'جاري الحفظ…' : 'حفظ الأعضاء'}
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-right text-sm">
          <thead className="text-mute">
            <tr>
              {['الاسم', 'اسم المستخدم', 'الدور', 'نشط', 'الوزن %', 'كلمة مرور جديدة'].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member, index) => (
              <tr className="border-t border-line" key={member.id || index}>
                <td className="p-2">
                  <input
                    className={input}
                    disabled={!manage || !!member.externalOwner}
                    value={member.name}
                    onChange={(e) => setMembers(members.map((m, i) => (i === index ? { ...m, name: e.target.value } : m)))}
                  />
                </td>
                <td className="p-2">
                  <input
                    className={input}
                    disabled={!manage || !!member.externalOwner}
                    value={member.username}
                    onChange={(e) => setMembers(members.map((m, i) => (i === index ? { ...m, username: e.target.value } : m)))}
                  />
                </td>
                <td className="p-3 text-mute">{roleLabel(member.role)}</td>
                <td className="p-3">
                  <input
                    type="checkbox"
                    disabled={!manage || member.role === 'committee_manager'}
                    checked={member.active}
                    onChange={(e) =>
                      setMembers(members.map((m, i) => (i === index ? { ...m, active: e.target.checked, weight: e.target.checked ? m.weight : 0 } : m)))
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className={input}
                    disabled={!manage || !member.active}
                    value={member.weight}
                    onChange={(e) => setMembers(members.map((m, i) => (i === index ? { ...m, weight: Number(e.target.value) } : m)))}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="password"
                    className={input}
                    disabled={!manage || !!member.externalOwner}
                    placeholder={member.id ? 'اختياري' : 'مطلوبة'}
                    value={member.password || ''}
                    onChange={(e) => setMembers(members.map((m, i) => (i === index ? { ...m, password: e.target.value } : m)))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`text-sm ${valid ? 'text-ok' : 'text-warn'}`}>مجموع أوزان النشطين: {(total / 100).toFixed(2)}% {valid ? <CheckCircle2 className="inline" size={14} /> : '(يجب 100%)'}</p>
      {dirty && <p className="text-sm text-warn">تعديلات غير محفوظة. {valid ? 'جاهزة للحفظ.' : 'لن يُسمح بالحفظ قبل أن يكون المجموع 100%.'}</p>}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </form>
  )
}

function AdminSortToCommitteePanel({
  committee,
  token,
  refresh,
}: {
  committee: Committee
  token: string
  refresh: () => Promise<void>
}) {
  const owner = committee.ownerUsername || null
  const [pool, setPool] = useState<RosterCandidate[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const operatorView = useMemo(
    () => ({
      role: 'operator' as const,
      category: (committee.category || 'oral') as ExamCategory,
      oralRole: committee.oralRole || null,
      theoryTrack:
        (committee as Committee & { theory_track?: string | null }).theory_track
        || (committee.ownerUsername === 'office'
          ? 'office'
          : ['theory', 'theory2'].includes(committee.ownerUsername || '')
            ? 'general'
            : null),
    }),
    [committee],
  )

  useEffect(() => {
    let active = true
    apiListEvaluationCandidates(token)
      .then((rows) => {
        if (!active) return
        const assigned = new Set((committee.candidates || []).map((c) => c.applicantId))
        setPool(
          rows.filter((a) => {
            if (assigned.has(a.id)) return false
            if (!committee.category) return true
            return candidateVisibleToOperator(operatorView, a)
          }),
        )
      })
      .catch((err) => {
        if (active) setError(errorText(err))
      })
    return () => {
      active = false
    }
  }, [token, committee.id, committee.candidates, committee.category, operatorView])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return pool
    return pool.filter((a) =>
      [a.name, a.jobTitle, a.org, a.evaluationStreamLabel].filter(Boolean).some((s) => String(s).toLowerCase().includes(q)),
    )
  }, [pool, search])

  async function sortToCommittee() {
    if (!picked.length) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await apiCommittee<{ addedCount: number; skippedCount: number }>(
        token,
        `/committees/${committee.id}/candidates`,
        'POST',
        { applicantIds: picked },
      )
      setMessage(
        `فُرز ${result.addedCount} متقدم إلى «${committee.name}»` +
          (result.skippedCount ? ` (تُجُوهل ${result.skippedCount})` : '') +
          (owner ? ` — ادخل بحساب «${owner}» لإنشاء الاختبار.` : ''),
      )
      setPicked([])
      await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gold/40 bg-gold/5 p-5">
      <div>
        <h2 className="text-lg font-bold text-gold">فرز المتقدمين لهذه اللجنة فقط</h2>
        <p className="mt-1 text-sm text-mute">
          الأدمن يفرز ويُسند فقط — بدون إنشاء اختبار. {owner ? `بعد الفرز يدخل حساب «${owner}» ويختار الطريقة.` : ''}
        </p>
      </div>
      {(committee.candidates || []).length > 0 && (
        <p className="text-sm text-mute">مسندون حالياً: {(committee.candidates || []).length} متقدم</p>
      )}
      <input
        aria-label="بحث متقدمين للفرز"
        className={input}
        placeholder="بحث بالاسم أو المسمى"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => setPicked(visible.map((a) => a.id))}>
          تحديد الظاهر ({visible.length})
        </button>
        <button type="button" className={secondary} onClick={() => setPicked([])}>
          إلغاء التحديد
        </button>
      </div>
      <div className="max-h-56 overflow-auto rounded-xl border border-line bg-card">
        {!visible.length ? (
          <p className="p-4 text-mute">لا متقدمين جاهزين للفرز على هذا المسار (أو سبق إسنادهم).</p>
        ) : (
          <table className="w-full text-right text-sm">
            <tbody>
              {visible.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={picked.includes(a.id)}
                      onChange={(e) =>
                        setPicked((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))
                      }
                    />
                  </td>
                  <td className="p-2">{a.name}</td>
                  <td className="p-2 text-mute">{a.jobTitle || 'بلا مسمى'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button type="button" className={button} disabled={busy || !picked.length} onClick={() => void sortToCommittee()}>
        {busy ? 'جاري الفرز…' : `فرز ${picked.length} متقدم إلى اللجنة`}
      </button>
      {message && <p className="text-sm text-ok">{message}</p>}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      <p className="text-xs text-mute">
        أو استخدم{' '}
        <Link className="text-gold underline" to="/admin/create">
          صفحة الفرز حسب المسار
        </Link>
        .
      </p>
    </section>
  )
}

function CommitteeExamBuilder({
  committee,
  token,
  manage,
  admin,
  refresh,
}: {
  committee: Committee
  token: string
  manage: boolean
  admin: boolean
  refresh: () => Promise<void>
}) {
  const category = committee.category || 'oral'
  const formats = QUESTION_FORMATS[category] || QUESTION_FORMATS.oral
  const [title, setTitle] = useState(`${committee.name} — ${new Date().toLocaleDateString('ar-SA')}`)
  const [questionCount, setQuestionCount] = useState(20)
  const [formatId, setFormatId] = useState(defaultFormatId(category))
  const [durationMinutes, setDurationMinutes] = useState(() => defaultDurationMinutes(category, 20))
  const [durationTouched, setDurationTouched] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedExamResult | null>(null)
  const available = (committee.candidates || []).filter((c) => !c.covered && !c.missing)
  const canCreate = manage && !admin && !!committee.category
  const selectedFormat = formats.find((f) => f.id === formatId) || formats[0]
  useEffect(() => {
    setPicked(available.map((c) => c.applicantId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committee.id, committee.candidates?.length])
  useEffect(() => {
    setFormatId(defaultFormatId(category))
    setQuestionCount(20)
    setDurationMinutes(defaultDurationMinutes(category, 20))
    setDurationTouched(false)
  }, [category, committee.id])
  function onQuestionCountChange(value: number) {
    const next = Math.max(1, Math.min(100, value || 1))
    setQuestionCount(next)
    if (!durationTouched) setDurationMinutes(defaultDurationMinutes(category, next))
  }
  if (admin) {
    return (
      <section className="rounded-2xl border border-line bg-card p-5 text-sm text-mute">
        إنشاء الاختبار واختيار طريقة التنفيذ يتم من حساب مدير/رئيس اللجنة بعد توزيع المتقدمين.
      </section>
    )
  }
  if (!canCreate) return null
  async function createExam() {
    setBusy(true)
    setError('')
    try {
      const result = await apiCommittee<CreatedExamResult>(token, `/committees/${committee.id}/exams`, 'POST', {
        title,
        applicantIds: picked,
        questionCount,
        questionTypes: selectedFormat?.types ?? [],
        durationMinutes,
      })
      setCreated(result)
      await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="text-lg font-bold text-light-gold">إنشاء اختبار من قائمة اللجنة</h2>
      <p className="text-sm text-mute">
        تُسحب الأسئلة من بنك الأسئلة حسب المسمى، بعدد واحد لكل المتقدمين. حدد العدد والنوع والمدة ثم أنشئ الاختبار.
      </p>
      {!available.length ? (
        <div className="space-y-2 text-sm text-mute">
          <p>
            {(committee.candidates || []).some((c) => c.covered)
              ? 'المتقدمون المسندون لديهم اختبار على هذا المسار، لذلك لا يُنشأ لهم اختبار ثانٍ.'
              : 'لا متقدمين مسندين بعد. الفرز يتم من حساب المسؤول.'}
          </p>
          {!!committee.assignments?.length && (
            <p>الاختبار الحالي ظاهر في القسم أدناه. الاختبار الذي بلا أسئلة لا يمنع إنشاء اختبار جديد من البنك.</p>
          )}
        </div>
      ) : (
        <>
          <label className="block max-w-xl space-y-2 text-sm">
            <span>عنوان الاختبار</span>
            <input className={input} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="grid gap-4 md:grid-cols-3">
              <label className="block space-y-2 text-sm">
                <span>عدد الأسئلة</span>
                <input
                  className={input}
                  type="number"
                  min={1}
                  max={100}
                  value={questionCount}
                  onChange={(e) => onQuestionCountChange(Number(e.target.value))}
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span>المدة الإجمالية (دقيقة)</span>
                <input
                  className={input}
                  type="number"
                  min={1}
                  max={600}
                  value={durationMinutes}
                  onChange={(e) => {
                    setDurationTouched(true)
                    setDurationMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))
                  }}
                />
                <span className="text-xs text-mute">
                  ≈ {Math.max(30, Math.floor((durationMinutes * 60) / Math.max(1, questionCount)))} ثانية لكل سؤال
                </span>
              </label>
              <div className="block space-y-2 text-sm">
                <span className="block">نوع الأسئلة</span>
                <div className="flex flex-wrap gap-2">
                  {formats.map((f) => (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => setFormatId(f.id)}
                      className={`rounded-xl border px-3 py-2 text-sm transition ${formatId === f.id ? 'border-gold bg-gold/10 text-gold' : 'border-line text-text hover:border-gold'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          <div className="max-h-48 overflow-auto rounded-xl border border-line">
            <table className="w-full text-right text-sm">
              <tbody>
                {available.map((c) => (
                  <tr key={c.applicantId} className="border-t border-line">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={picked.includes(c.applicantId)}
                        onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, c.applicantId] : prev.filter((id) => id !== c.applicantId)))}
                      />
                    </td>
                    <td className="p-2">{c.name}</td>
                    <td className="p-2 text-mute">{c.jobTitle || 'بلا مسمى'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={button} disabled={busy || !picked.length || !title.trim()} onClick={() => void createExam()}>
            {busy ? 'جاري الإنشاء…' : `إنشاء من البنك (${questionCount} سؤال · ${durationMinutes} د) لـ ${picked.length} متقدم`}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {created && (
        <div className="space-y-3 rounded-2xl border border-ok/40 bg-ok/5 p-4">
          <p className="font-bold text-ok">
            أُنشئ «{created.exam.title}» من بنك الأسئلة
            {created.questionCount != null ? ` — ${created.questionCount} سؤال` : ''}
            {created.durationMinutes != null ? ` — ${created.durationMinutes} دقيقة` : ''}
            {created.showsBarcode === false
              ? ' — بلا باركود، لأن هذا المسار لا يحتاجه'
              : ` — ${created.roster.length} بطاقة باركود`}
          </p>
          {!!created.warnings?.length && <ul className="text-sm text-warn">{created.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          {created.showsBarcode !== false && (
          <RosterCards
            examTitle={created.exam.title}
            showBarcode
            publicAppUrl={created.publicAppUrl || window.location.origin}
            roster={created.roster
              .filter((r) => !!r.qrToken && r.qrToken.length >= 40)
              .map(
              (r): RosterAccount => ({
                id: r.id,
                name: r.name,
                displayId: r.displayId || '',
                seqNumber: 0,
                jobTitle: r.jobTitle || '',
                demandTitle: r.demandTitle || '',
                tracks: r.tracks || [],
                qrToken: r.qrToken || '',
                used: false,
                extra: null,
              }),
            )}
          />
          )}
          {created.showsBarcode !== false && !created.roster.some((r) => r.qrToken && r.qrToken.length >= 40) && (
            <p className="text-sm text-warn">تعذر تضمين رموز QR في الاستجابة. افتح قائمة الممتحنين لإعادة طباعة البطاقات.</p>
          )}
          <Link className="text-gold underline" to={`/admin/roster/${created.exam.id}`}>
            {created.showsBarcode === false ? 'فتح قائمة الممتحنين' : 'فتح قائمة الممتحنين والبطاقات'}
          </Link>
        </div>
      )}
    </section>
  )
}

function Assignments({
  committee,
  token,
  admin,
  canAssign,
  manage,
  accountId,
  refresh,
}: {
  committee: Committee
  token: string
  admin: boolean
  canAssign: boolean
  manage: boolean
  accountId: string
  refresh: () => Promise<void>
}) {
  const [exams, setExams] = useState<AdminExam[]>([])
  const [examId, setExamId] = useState('')
  const [assignmentId, setAssignmentId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (canAssign) apiListExams(token).then(setExams).catch((err) => setError(errorText(err)))
  }, [token, canAssign])
  async function assign() {
    setBusy(true)
    setError('')
    try {
      await apiCommittee(token, `/committees/${committee.id}/assignments`, 'POST', { examId })
      await refresh()
      setExamId('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  const selected = assignmentId || committee.assignments[0]?.id || ''
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-light-gold">اختبارات اللجنة ودرجات المتقدمين</h2>
      {canAssign && (
        <div className="space-y-3 rounded-2xl border border-line p-4">
          <p className="text-sm text-mute">ربط اختبار قديم (مسار تراثي). المسار المعتمد: توزيع المتقدمين ثم إنشاء الاختبار من اللجنة.</p>
          <div className="flex flex-wrap gap-3">
            <select aria-label="اختبار لربطه باللجنة" className={`${input} sm:max-w-md`} value={examId} onChange={(event) => setExamId(event.target.value)}>
              <option value="">اختر اختبارًا</option>
              {exams
                .filter(
                  (exam) =>
                    exam.active &&
                    exam.usedSeats === 0 &&
                    (!committee.category || exam.category === committee.category) &&
                    (!committee.oralRole || (exam.oralRole && oralRolesCompatible(committee.oralRole, exam.oralRole))) &&
                    !committee.assignments.some((item) => item.examId === exam.id),
                )
                .map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title} — {CATEGORY_META[exam.category].label}
                  </option>
                ))}
            </select>
            <button className={button} disabled={!examId || busy} onClick={() => void assign()}>
              ربط الاختبار باللجنة
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {!committee.assignments.length ? (
        <p className="text-mute">لا توجد اختبارات مرتبطة بعد. أنشئ اختباراً من قائمة اللجنة أعلاه.</p>
      ) : (
        <>
          <select aria-label="اختبار اللجنة" className={`${input} max-w-lg`} value={selected} onChange={(event) => setAssignmentId(event.target.value)}>
            {committee.assignments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} — {CATEGORY_META[item.category].label}
              </option>
            ))}
          </select>
          <EvaluationPanel key={`${selected}-${committee.revision}`} assignmentId={selected} committee={committee} token={token} manage={manage} accountId={accountId} admin={admin} />
        </>
      )}
    </section>
  )
}

function EvaluationPanel({
  assignmentId,
  committee,
  token,
  manage,
  accountId,
  admin,
}: {
  assignmentId: string
  committee: Committee
  token: string
  manage: boolean
  accountId: string
  admin: boolean
}) {
  const [data, setData] = useState<Evaluations | null>(null)
  const rememberKey = `committee-examinee:${assignmentId}`
  const [name, setName] = useState(() => sessionStorage.getItem(rememberKey) || '')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const result = await apiCommittee<Evaluations>(token, `/committee-assignments/${assignmentId}`)
    setData(result)
    return result
  }, [token, assignmentId])
  useEffect(() => {
    let active = true
    apiCommittee<Evaluations>(token, `/committee-assignments/${assignmentId}`)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((err) => {
        if (active) setError(errorText(err))
      })
    return () => {
      active = false
    }
  }, [token, assignmentId])
  const adoptedNames = useMemo(() => new Set((data?.results ?? []).map((result) => result.examineeName)), [data])
  const pending = useMemo(
    () => (data?.candidates ?? []).filter((candidate) => !adoptedNames.has(candidate.name)),
    [data, adoptedNames],
  )
  const selectedName = pending.some((candidate) => candidate.name === name) ? name : ''
  const applicantOptions = useMemo(
    () =>
      pending.map((candidate) => ({
        id: candidate.displayId || candidate.name,
        name: candidate.name,
        label: `${candidate.displayId} — ${candidate.name}`,
      })),
    [pending],
  )
  useEffect(() => {
    if (name) sessionStorage.setItem(rememberKey, name)
    else sessionStorage.removeItem(rememberKey)
  }, [name, rememberKey])
  useEffect(() => {
    if (!name || !adoptedNames.has(name)) return
    setNotice(`اعتُمدت علامة ${name} وأُزيل الاسم من القائمة.`)
    setName('')
  }, [adoptedNames, name])
  const assignment = committee.assignments.find((a) => a.id === assignmentId)
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-card p-5">
      {assignment && (assignment.emptySets || 0) > 0 && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          هذا الاختبار بلا أسئلة، لذلك لا يمنع إنشاء اختبار جديد من البنك أعلاه.
        </p>
      )}
      {notice && <p className="text-sm text-ok">{notice}</p>}
      {data?.objectiveExam && (
        <div className="space-y-2 rounded-xl border border-gold/40 bg-gold/5 p-4">
          <h3 className="font-bold text-gold">علامة الاختيار من متعدد</h3>
          <p className="text-sm text-mute">تُحسب آلياً وتظهر للمتقدم بعد التسليم وللجنة هنا.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-mute">
                <tr>
                  <th className="p-2">المتقدم</th>
                  <th className="p-2">العلامة</th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((candidate) => {
                  const auto = data.objectiveScores?.find((score) => score.examineeName === candidate.name)
                  return (
                    <tr key={candidate.name} className="border-t border-line">
                      <td className="p-2">{candidate.displayId} — {candidate.name}</td>
                      <td className="p-2 font-bold text-light-gold">
                        {auto ? `${auto.score} / ${auto.maxScore} (${auto.percent}%)` : 'لم يسلّم بعد'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!data ? null : pending.length === 0 && data.candidates.length > 0 ? (
        <p className="rounded-xl bg-ok/10 p-4 text-sm font-bold text-ok">اعتُمدت علامات جميع المتقدمين في هذا الاختبار.</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-mute">لا يوجد متقدمون في هذا الاختبار.</p>
      ) : (
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[16rem] flex-1 space-y-2 text-sm text-text">
          <span>المتقدم</span>
          <ApplicantCombobox
            className={input}
            options={applicantOptions}
            value={selectedName}
            onChange={setName}
          />
        </label>
        <button className={`${secondary} self-end`} onClick={() => void refresh().catch((err) => setError(errorText(err)))}>
          تحديث درجات الأعضاء
        </button>
      </div>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {selectedName && committee.assignments.find((a) => a.id === assignmentId)?.category !== 'theory' && (
        <Link className={button} to={'/evaluation/' + committee.assignments.find((a) => a.id === assignmentId)?.examId + '?name=' + encodeURIComponent(selectedName)}>
          أسئلة الاختبار
        </Link>
      )}
      {data && selectedName && (
        <CandidateEvaluation key={selectedName} {...{ assignmentId, committee, token, manage, accountId, admin, data, refresh }} name={selectedName} />
      )}
    </div>
  )
}

function CandidateEvaluation({
  assignmentId,
  committee,
  token,
  manage,
  accountId,
  admin,
  data,
  refresh,
  name,
}: {
  assignmentId: string
  committee: Committee
  token: string
  manage: boolean
  accountId: string
  admin: boolean
  data: Evaluations
  refresh: () => Promise<Evaluations>
  name: string
}) {
  const [questions, setQuestions] = useState<import('../data/types').Question[]>([])
  const [questionError, setQuestionError] = useState('')
  useEffect(() => {
    let current = true
    apiCommittee<{ questions: import('../data/types').Question[] }>(token, '/committee-assignments/' + assignmentId + '/questions?examineeName=' + encodeURIComponent(name))
      .then((res) => {
        if (current) setQuestions(res.questions)
      })
      .catch((e) => {
        if (current) setQuestionError(e.message)
      })
    return () => {
      current = false
    }
  }, [assignmentId, name, token])
  const mine = data.scores.find((score) => score.examineeName === name && score.accountId === accountId)
  const objectiveScore = data.objectiveScores?.find((score) => score.examineeName === name)
  const [value, setValue] = useState(mine?.percent.toString() ?? '')
  const [note, setNote] = useState('')
  const [salary, setSalary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const final = data.results.find((result) => result.examineeName === name)
  const rows = final
    ? final.snapshot
    : committee.members
        .filter((member) => member.active)
        .map((member) => {
          const score = data.scores.find((entry) => entry.examineeName === name && entry.accountId === member.id)?.percent
          return { name: member.name, username: member.username, role: member.role, weight: member.weight, score, contribution: score === undefined ? undefined : (score * member.weight) / 100 }
        })
  const allowSalary = committee.category === 'oral'
  const complete = rows.length > 0 && rows.every((row) => row.score !== undefined)
  const total = rows.reduce((sum, row) => sum + (row.contribution || 0), 0)
  async function saveScore() {
    await apiCommittee(token, `/committee-assignments/${assignmentId}/score`, 'PUT', {
      examineeName: name,
      percent: Number(value),
    })
  }
  async function act(publish = false) {
    setBusy(true)
    setError('')
    try {
      if (publish && manage) {
        if (!admin && value !== '') await saveScore()
        const latest = await refresh()
        await apiCommittee(token, `/committee-assignments/${assignmentId}/publish`, 'POST', {
          examineeName: name,
          revision: committee.revision,
          scoreVersion: latest.candidates.find((candidate) => candidate.name === name)?.scoreVersion,
          note: note.trim(),
          estimatedSalary: allowSalary && salary.trim() !== '' ? Number(salary) : null,
        })
        await refresh()
      } else {
        await saveScore()
        await refresh()
      }
    } catch (err) {
      setError(errorText(err))
      await refresh().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      {questionError && (
        <p role="alert" className="text-error">
          {questionError}
        </p>
      )}
      {objectiveScore && (
        <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 font-bold text-light-gold">
          علامة الاختيار من متعدد: {objectiveScore.score} / {objectiveScore.maxScore} ({objectiveScore.percent}%)
        </p>
      )}
      {questions.length > 0 && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-bold text-gold">أسئلة المتقدم ومعايير التقييم ({questions.length})</summary>
          {questions.map((q, i) => (
            <article key={q.id} className="mt-4 space-y-2 border-t border-line pt-3">
              <p className="font-bold">
                {i + 1}. {q.text} ({q.points} درجة)
              </p>
              {q.choices?.map((c) => (
                <p key={c.id}>
                  {c.text}
                  {c.id === q.correctAnswer ? ' ✓' : ''}
                </p>
              ))}
              <p className="whitespace-pre-wrap text-sm text-mute">{q.answerKey}</p>
              {q.rubric?.map((r, n) => (
                <p key={n} className="text-sm">
                  {r.criterion} — {r.maxPoints} درجة
                </p>
              ))}
            </article>
          ))}
        </details>
      )}
      {!admin && !final && !manage && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void act()
          }}
        >
          <label className="space-y-2 text-sm text-text">
            <span>درجتك للمتقدم من 100</span>
            <input
              aria-label="درجتك للمتقدم من 100"
              required
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={input}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button className={button} type="submit" disabled={busy || value === ''}>
            {busy ? 'جاري الحفظ…' : 'حفظ درجتي'}
          </button>
          {mine && <span className="text-sm text-ok">درجتك المحفوظة: {mine.percent}/100</span>}
        </form>
      )}
      {manage && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[450px] text-right text-sm">
            <thead className="text-mute">
              <tr>
                {['العضو', 'الوزن', 'الدرجة /100', 'المساهمة'].map((label) => (
                  <th className="p-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr className="border-t border-line text-text" key={index}>
                  <td className="p-3">
                    {row.name}
                    {row.username ? <span className="mr-2 font-mono text-xs text-gold">@{row.username}</span> : null}
                    <span className="mr-2 text-xs text-mute">{roleLabel(row.role)}</span>
                  </td>
                  <td className="p-3">{row.weight}%</td>
                  <td className="p-3">{row.score ?? 'بانتظار التقييم'}</td>
                  <td className="p-3">{row.contribution?.toFixed(2) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {final ? (
        <div className="space-y-2 rounded-xl bg-ok/10 p-4 text-ok">
          <p className="font-bold">النتيجة المعتمدة: {final.percent}/100 — {new Date(final.publishedAt).toLocaleString('ar-SA')}</p>
          {final.note && <p className="text-sm text-text">الملاحظة: {final.note}</p>}
          {allowSalary && final.estimatedSalary != null && <p className="text-sm text-text">الراتب المقدر: {final.estimatedSalary.toLocaleString('ar-SY')}</p>}
        </div>
      ) : (
        manage && (
          <form
            className="space-y-3 rounded-xl border border-line p-4"
            onSubmit={(event) => {
              event.preventDefault()
              void act(true)
            }}
          >
            <p className="font-bold text-light-gold">{complete ? `النتيجة الموزونة: ${total.toFixed(2)}/100` : 'النتيجة غير مكتملة — بانتظار درجات جميع الأعضاء النشطين'}</p>
            {!admin && (
              <label className="block max-w-xs space-y-2 text-sm text-text">
                <span>درجتك للمتقدم من 100</span>
                <input
                  aria-label="درجتك للمتقدم من 100"
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={input}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
            )}
            {mine && !admin && <p className="text-sm text-ok">درجتك المحفوظة: {mine.percent}/100</p>}
            <label className="block space-y-2 text-sm text-text">
              <span>ملاحظة اللجنة</span>
              <textarea className={input} rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="ملاحظة مع الدرجة، إن وجدت" />
            </label>
            {allowSalary && (
              <label className="block max-w-xs space-y-2 text-sm text-text">
                <span>الراتب المقدر</span>
                <input className={input} inputMode="numeric" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="اختياري" />
              </label>
            )}
            <button className={button} type="submit" disabled={busy || (admin ? !complete : value === '')}>
              {busy ? 'جاري الاعتماد…' : admin ? 'اعتماد النتيجة النهائية' : 'حفظ الدرجة واعتماد النتيجة'}
            </button>
          </form>
        )
      )}
      {manage && !final && <p className="text-xs text-mute">{allowSalary ? 'يُحفظ تقييمك وتُعتمد النتيجة معاً، مع الملاحظة والراتب المقدر، دون البحث عن المتقدم مرة أخرى.' : 'يُحفظ تقييمك وتُعتمد النتيجة معاً في هذه الخطوة، ويبقى اسم المتقدم محدداً إذا تعذّر الاعتماد.'}</p>}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </div>
  )
}
