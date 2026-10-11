import { useEffect, useState } from 'react'
import { apiCommittee } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { loadCustomQuestions } from '../data/banks'
import { CATEGORY_META, type Question } from '../data/types'
import { JOB_PROFILES, JOB_LEVELS, DIFFICULTIES, canUseProfile } from '../../shared/jobProfiles.js'

const field = 'w-full rounded-xl border border-line bg-panel px-3 py-2 text-text'
const btn = 'rounded-xl border border-line px-4 py-2 hover:border-gold disabled:opacity-40'
const types = [['mcq', 'اختيار متعدد'], ['true_false', 'صح / خطأ'], ['classic', 'مقالي تقليدي (يدوي)'], ['open', 'مقالي مفتوح'], ['oral', 'شفهي'], ['scale', 'مقياس']]
const empty = { category: 'theory', type: 'mcq', text: '', topic: '', skill: '', difficulty: 'medium', points: 1, isShared: false, jobTitles: [], jobLevels: ['intermediate'], choices: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: '' })), correctAnswer: 'a', answerKey: '', explanation: '', rubric: [], trait: '', reverse: false }
export function BanksPage() {
  const { user } = useAuth()
  const [questions, setQuestions] = useState<Question[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(user?.category || '')
  const [profile, setProfile] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [level, setLevel] = useState('')
  const [scope, setScope] = useState('')
  const [limit, setLimit] = useState(40)
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null)
  const editable = user?.role === 'admin' || user?.role === 'operator'
  async function load() {
    if (!user) return
    try { const data = await apiCommittee<{ questions: Question[] }>(user.token, '/admin/question-bank'); setQuestions(data.questions) } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل البنك') }
  }
  useEffect(() => { void load() }, [user?.token])
  useEffect(() => setLimit(40), [search, category, profile, difficulty, level, scope])
  function edit(q?: Question) { setDraft({ ...empty, category: user?.category || 'theory', ...q, skill: q?.skill || q?.topic || '', explanation: q?.explanation || '', isShared: q?.isShared === true, jobTitles: q?.jobTitles || [], jobLevels: q?.jobLevels || ['intermediate'], rubric: q?.rubric || [] }); setError(''); setNotice('') }
  function patch(value: any) { setDraft((d: any) => ({ ...d, ...value })) }
  async function save() {
    if (!user) return
    setBusy(true); setError('')
    try {
      const q = { ...draft }
      if (!['mcq', 'true_false'].includes(q.type)) { delete q.choices; delete q.correctAnswer }
      await apiCommittee(user.token, '/admin/question-bank', 'POST', q)
      setDraft(null); setNotice('حُفظ السؤال في البنك المشترك. نماذج الاختبارات السابقة تحتفظ بنسختها الأصلية.'); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'فشل الحفظ') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!user || !pendingDelete) return
    setBusy(true)
    try { await apiCommittee(user.token, '/admin/question-bank/' + pendingDelete.id, 'DELETE'); setPendingDelete(null); setNotice('عُطّل السؤال للاختبارات الجديدة، وبقي في النماذج السابقة.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر التعطيل') }
    finally { setBusy(false) }
  }
  const filtered = questions.filter((q) => (!category || q.category === category) && (!profile || q.jobTitles?.includes(profile)) && (!difficulty || q.difficulty === difficulty) && (!level || q.jobLevels?.includes(level)) && (!scope || (scope === 'shared' ? q.isShared : !q.isShared)) && (!search || [q.text, q.topic, q.skill, q.answerKey, q.explanation].some((s) => s?.includes(search))))
  const local = loadCustomQuestions().filter((q) => !questions.some((saved) => saved.id === q.id || saved.text === q.text) && (user?.role === 'admin' || q.category === user?.category))
  return <div className="mx-auto max-w-6xl space-y-5" dir="rtl">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold text-gold">بنك الأسئلة</h1><p className="mt-2 text-mute">{questions.length} سؤال متاح • ربط متعدد للمسميات • أربعة مستويات صعوبة</p></div>{editable && <button className={btn} onClick={() => edit()}>إضافة سؤال</button>}</div>
    {error && <p role="alert" className="rounded-xl border border-error/40 p-3 text-error">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-ok p-3 text-ok">{notice}</p>}
    {pendingDelete && <div role="alertdialog" className="space-y-3 rounded-xl border border-warn p-4"><p>تعطيل السؤال: {pendingDelete.text}</p><p>لن يُستخدم في اختبارات جديدة. تبقى نسخ الاختبارات المحفوظة.</p><button disabled={busy} className={btn} onClick={remove}>تعطيل السؤال</button> <button className={btn} onClick={() => setPendingDelete(null)}>إلغاء</button></div>}
    {draft && <section className="space-y-4 rounded-2xl border border-gold bg-card p-5">
      <h2 className="text-lg font-bold">{draft.id ? 'تعديل السؤال' : 'سؤال جديد'}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <label>نوع التقييم<select className={field} disabled={user?.role === 'operator'} value={draft.category} onChange={(e) => { const category = e.target.value; patch({ category, jobTitles: [], type: category === 'personality' ? 'scale' : draft.type === 'scale' ? 'mcq' : draft.type }) }}>{Object.entries(CATEGORY_META).filter(([id]) => id !== 'security').map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}</select></label>
        <label>نوع السؤال<select className={field} value={draft.type} onChange={(e) => patch({ type: e.target.value, ...(e.target.value === 'true_false' ? { choices: [{ id: 'true', text: 'صح' }, { id: 'false', text: 'خطأ' }], correctAnswer: 'true' } : e.target.value === 'mcq' ? { choices: empty.choices, correctAnswer: 'a' } : {}) })}>{types.filter(([id]) => draft.category === 'personality' ? ['scale', 'open'].includes(id) : id !== 'scale').map(([id, l]) => <option key={id} value={id}>{id === 'open' && draft.category === 'personality' ? 'معرفي مقالي' : l}</option>)}</select></label>
        <label>الصعوبة<select className={field} value={draft.difficulty} onChange={(e) => patch({ difficulty: e.target.value })}>{DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        <label>الموضوع<input className={field} value={draft.topic} onChange={(e) => patch({ topic: e.target.value })} /></label>
        <label>المهارة<input className={field} value={draft.skill} onChange={(e) => patch({ skill: e.target.value })} /></label>
        <label>درجة السؤال<input className={field} type="number" min={0.1} step="any" max={100} value={draft.points} onChange={(e) => patch({ points: Number(e.target.value) })} /></label>
      </div>
      <label className="flex gap-2"><input type="checkbox" disabled={user?.role !== 'admin'} checked={draft.isShared} onChange={(e) => patch({ isShared: e.target.checked })} />سؤال عام ومشترك لجميع المسميات</label>
      {!draft.isShared && <fieldset className="space-y-2"><legend>المسميات والاختصاصات المناسبة (يمكن اختيار أكثر من مسمى)</legend><div className="flex flex-wrap gap-4">{JOB_PROFILES.filter((p) => p.id !== 'unclassified' && canUseProfile(user, p, draft.category)).map((p) => <label key={p.id}><input type="checkbox" checked={draft.jobTitles.includes(p.id)} onChange={(e) => patch({ jobTitles: e.target.checked ? [...draft.jobTitles, p.id] : draft.jobTitles.filter((id: string) => id !== p.id) })} /> {p.label} — {p.specialtyLabel}</label>)}</div></fieldset>}
      <fieldset><legend>المستويات الوظيفية المناسبة</legend><div className="flex flex-wrap gap-4">{JOB_LEVELS.map((l) => <label key={l.id}><input type="checkbox" checked={draft.jobLevels.includes(l.id)} onChange={(e) => patch({ jobLevels: e.target.checked ? [...draft.jobLevels, l.id] : draft.jobLevels.filter((id: string) => id !== l.id) })} /> {l.label}</label>)}</div></fieldset>
      <label className="block">نص السؤال<textarea className={field} rows={3} value={draft.text} onChange={(e) => patch({ text: e.target.value })} /></label>
      {['mcq', 'true_false'].includes(draft.type) && <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-text">الخيارات — حدد الإجابة / الإجابات الصحيحة</p>
          {draft.type === 'mcq' && (
            <label className="flex items-center gap-2 text-xs text-mute">
              <input
                type="checkbox"
                checked={Array.isArray(draft.correctAnswer)}
                onChange={(e) => {
                  if (e.target.checked) {
                    patch({ correctAnswer: [draft.correctAnswer || 'a'] })
                  } else {
                    patch({ correctAnswer: Array.isArray(draft.correctAnswer) ? draft.correctAnswer[0] || 'a' : 'a' })
                  }
                }}
              />
              سؤال متعدد الإجابات الصحيحة
            </label>
          )}
        </div>
        {draft.choices?.map((c: any, i: number) => {
          const isMulti = Array.isArray(draft.correctAnswer)
          const isChecked = isMulti ? draft.correctAnswer.includes(c.id) : draft.correctAnswer === c.id
          return (
            <label key={c.id} className="flex items-center gap-3">
              <input
                type={isMulti ? 'checkbox' : 'radio'}
                name={isMulti ? `correct-${c.id}` : 'correct'}
                checked={isChecked}
                onChange={() => {
                  if (isMulti) {
                    const current = [...(draft.correctAnswer || [])]
                    patch({
                      correctAnswer: current.includes(c.id)
                        ? current.filter((x: string) => x !== c.id)
                        : [...current, c.id],
                    })
                  } else {
                    patch({ correctAnswer: c.id })
                  }
                }}
              />
              <input
                aria-label={'الخيار ' + (i + 1)}
                className={field}
                value={c.text}
                onChange={(e) => patch({ choices: draft.choices.map((v: any, n: number) => n === i ? { ...v, text: e.target.value } : v) })}
              />
            </label>
          )
        })}
      </div>}
      <label className="block">الإجابة النموذجية / إرشادات التصحيح<textarea className={field} rows={3} value={draft.answerKey || ''} onChange={(e) => patch({ answerKey: e.target.value })} /></label>
      <label className="block">الشرح والتوضيح العلمي (يظهر للممتحن عند مراجعة النتيجة)<textarea className={field} rows={2} placeholder="سبب صحة الإجابة أو المرجع النظري..." value={draft.explanation || ''} onChange={(e) => patch({ explanation: e.target.value })} /></label>
      {['classic', 'open', 'oral'].includes(draft.type) && <div className="space-y-2"><p>معايير التقييم (اختيارية، مجموعها يساوي درجة السؤال)</p>{draft.rubric.map((r: any, i: number) => <div key={i} className="flex gap-2"><input aria-label="معيار التقييم" className={field} value={r.criterion} onChange={(e) => patch({ rubric: draft.rubric.map((v: any, n: number) => n === i ? { ...v, criterion: e.target.value } : v) })} /><input aria-label="درجة المعيار" className="w-24 rounded-xl border border-line bg-panel p-2" type="number" step="any" value={r.maxPoints} onChange={(e) => patch({ rubric: draft.rubric.map((v: any, n: number) => n === i ? { ...v, maxPoints: Number(e.target.value) } : v) })} /><button className={btn} onClick={() => patch({ rubric: draft.rubric.filter((_: any, n: number) => n !== i) })}>حذف</button></div>)}<button className={btn} onClick={() => patch({ rubric: [...draft.rubric, { criterion: '', maxPoints: 1 }] })}>إضافة معيار</button></div>}
      {draft.type === 'scale' && <div className="space-y-2"><label>السمة<input className={field} value={draft.trait || ''} onChange={(e) => patch({ trait: e.target.value })} /></label><label><input type="checkbox" checked={draft.reverse} onChange={(e) => patch({ reverse: e.target.checked })} /> عبارة عكسية</label></div>}
      <div className="flex gap-3"><button className="rounded-xl bg-gold px-5 py-2 font-bold text-ink disabled:opacity-50" disabled={busy} onClick={save}>حفظ السؤال</button><button className={btn} onClick={() => setDraft(null)}>إلغاء</button></div>
    </section>}
    <div className="grid gap-3 rounded-2xl border border-line bg-card p-4 sm:grid-cols-3">
      <input aria-label="بحث الأسئلة" className={field} placeholder="بحث بالنص أو المهارة أو الموضوع" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select aria-label="تصفية نوع التقييم" className={field} value={category} onChange={(e) => setCategory(e.target.value as any)}><option value="">كل أنواع التقييم</option>{Object.entries(CATEGORY_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}</select>
      <select aria-label="تصفية المسمى" className={field} value={profile} onChange={(e) => setProfile(e.target.value)}><option value="">كل المسميات</option>{JOB_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.specialtyLabel}</option>)}</select>
      <select aria-label="تصفية الصعوبة" className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="">كل الصعوبات</option>{DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
      <select aria-label="تصفية المستوى" className={field} value={level} onChange={(e) => setLevel(e.target.value)}><option value="">كل المستويات</option>{JOB_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
      <select aria-label="نطاق الأسئلة" className={field} value={scope} onChange={(e) => setScope(e.target.value)}><option value="">مشتركة وتخصصية</option><option value="shared">مشتركة</option><option value="specific">تخصصية</option></select>
    </div>
    {editable && local.length > 0 && <details className="rounded-xl border border-warn p-4"><summary>أسئلة محلية قديمة غير منشورة ({local.length})</summary><p>حدد المسميات والمستويات ثم احفظ السؤال لنشره في البنك. تبقى النسخة المحلية محفوظة.</p>{local.map((q) => <div key={q.id} className="mt-3 flex justify-between gap-3"><span>{q.text}</span><button className={btn} onClick={() => edit(q)}>مراجعة ونشر</button></div>)}</details>}
    <p className="text-mute">نتائج التصفية: {filtered.length}</p>
    {filtered.slice(0, limit).map((q) => <article key={q.id} className="space-y-3 rounded-2xl border border-line bg-card p-5">
      <div className="text-xs text-gold">{CATEGORY_META[q.category].label} • {q.skill || q.topic} • {DIFFICULTIES.find((d) => d.id === q.difficulty)?.label} • {q.points} درجة</div>
      <p className="whitespace-pre-wrap font-semibold">{q.text}</p>
      <p className="text-sm text-mute">{q.isShared ? 'مشترك لجميع المسميات' : q.jobTitles?.map((id) => JOB_PROFILES.find((p) => p.id === id)?.label).join('، ') || 'غير مصنف — مستبعد من الإنشاء'} • {q.jobLevels?.map((id) => JOB_LEVELS.find((l) => l.id === id)?.label).join('، ')}</p>
      <details><summary className="cursor-pointer text-sm text-gold">الخيارات والإجابة ومعايير التقييم</summary>{q.choices?.map((c) => <p key={c.id} className={c.id === q.correctAnswer ? 'text-ok' : ''}>{c.text}{c.id === q.correctAnswer ? ' ✓' : ''}</p>)}<p className="mt-2 whitespace-pre-wrap">{q.answerKey || (q.type === 'scale' ? 'مقياس 1–5' : 'لا توجد إجابة نموذجية')}</p>{q.rubric?.map((r, i) => <p key={i}>{r.criterion} ({r.maxPoints})</p>)}</details>
      {editable && (user?.role === 'admin' || !q.isShared) && <div className="flex gap-3"><button className={btn} onClick={() => edit(q)}>تعديل</button><button className={btn} onClick={() => setPendingDelete(q)}>تعطيل</button></div>}
    </article>)}
    {filtered.length > limit && <button className={btn} onClick={() => setLimit(limit + 40)}>عرض المزيد</button>}
  </div>
}
