import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiCommittee } from '../api/client'

const field = 'mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text'
const button = 'rounded-xl border border-line px-4 py-2 text-sm text-gold disabled:opacity-40'
export function CompleteExamQuestionsPage() {
  const { examId } = useParams(), { user } = useAuth()
  const [data, setData] = useState<any>(null), [forms, setForms] = useState<Record<string, any[]>>({})
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const url = '/admin/exams/' + examId + '/pending-questions'
  const load = () => user && apiCommittee(user.token, url).then(setData).catch((e) => setError(e.message))
  useEffect(() => { void load() }, [examId, user?.token])
  function patch(key: string, index: number, value: any) {
    setForms((old) => ({ ...old, [key]: (old[key] || []).map((q, i) => i === index ? { ...q, ...value } : q) }))
  }
  async function save(key: string, source: string) {
    if (!user) return
    if (source === 'manual' && !(forms[key]?.length)) {
      setError('أضف سؤالاً يدوياً واحداً على الأقل قبل الاعتماد')
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await apiCommittee<any>(user.token, url, 'POST', { key, source, questions: forms[key] || [] })
      setForms((old) => ({ ...old, [key]: [] }))
      setNotice(result.ready ? 'اكتملت جميع المجموعات وفُتح الاختبار.' : 'حُفظت أسئلة المجموعة من البنك؛ استكمل المجموعات المتبقية.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الحفظ') }
    finally { setBusy(false) }
  }
  async function fillAllFromBank() {
    if (!user) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await apiCommittee<any>(user.token, url, 'POST', { source: 'bank-all', all: true })
      const failText = result.failures?.length ? ` بعض المجموعات لم تُملأ: ${result.failures.join('؛ ')}` : ''
      setNotice(result.ready
        ? `تم سحب الأسئلة من البنك لكل المجموعات (${result.filled}) وفُتح الاختبار.`
        : `تم تعبئة ${result.filled || 0} مجموعة من البنك.${failText}`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر التعبئة من البنك') }
    finally { setBusy(false) }
  }
  const pending = data?.groups?.length || 0
  const bankReady = (data?.groups || []).filter((g: any) => (g.availableFromBank || 0) > 0).length
  return <div className="mx-auto max-w-4xl space-y-5" dir="rtl">
    <h1 className="text-2xl font-bold text-gold">استكمال أسئلة الاختبار من البنك</h1>
    <p>{data?.exam?.title}</p>
    <p className="text-mute">أسئلة الاختبار تُسحب من بنك الأسئلة حسب المسمى الوظيفي لكل متقدم. أسئلة التخصص أولاً، والمشتركة احتياط لأنواع القيادة والشخصية فقط. الإدخال اليدوي عند غياب أسئلة مناسبة للمسمى.</p>
    {pending > 0 && (
      <div className="space-y-3 rounded-xl border border-gold/40 bg-gold/10 p-4">
        <p className="text-light-gold">متبقٍ {pending} مجموعة بلا أسئلة. متاح من البنك لـ {bankReady} مجموعة.</p>
        {user?.role !== 'commander' && (
          <button disabled={busy || bankReady === 0} className="rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink disabled:opacity-40" onClick={() => void fillAllFromBank()}>
            تعبئة كل المجموعات الفارغة من بنك الأسئلة
          </button>
        )}
      </div>
    )}
    <div className="flex flex-wrap gap-3">
      <Link className={button} to="/admin">قائمة الاختبارات</Link>
      <Link className={button} to="/banks">إدارة بنك الأسئلة</Link>
      {data?.exam && !data.exam.pendingQuestions && data.exam.showsBarcode !== false && <Link className={button} to={'/admin/roster/' + examId}>بطاقات QR جاهزة</Link>}
    </div>
    {error && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-3 text-error">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-ok">{notice}</p>}
    {data?.groups.length === 0 && <p className="rounded-xl border border-ok p-4 text-ok">لا توجد مجموعات خالية. الاختبار مُعبَّأ من البنك.</p>}
    {data?.groups.map((group: any) => <section className="space-y-4 rounded-2xl border border-line bg-card p-5" key={group.key}>
      <h2 className="text-lg font-bold text-gold">{group.jobTitle} — {group.applicantCount} متقدم</h2>
      <p>المطلوب: {group.requested} سؤال · المتاح في البنك: {group.availableFromBank ?? '—'}</p>
      {user?.role !== 'commander' && <div className="flex flex-wrap gap-3">
        <button disabled={busy || !(group.availableFromBank > 0)} className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40" onClick={() => void save(group.key, 'bank')}>
          سحب أسئلة هذه المجموعة من البنك
        </button>
        <button disabled={busy} className={button} onClick={() => setForms((old) => ({ ...old, [group.key]: [...(old[group.key] || []), { text: '', answerKey: '', points: 5, trait: 'سلوك العمل', reverse: false }] }))}>إضافة سؤال يدوي (احتياطي)</button>
      </div>}
      {(forms[group.key] || []).map((q, i) => <article className="space-y-3 rounded-xl border border-line p-4" key={i}>
        <label className="block">{data.exam.category === 'personality' ? 'عبارة يجيب عنها المتقدم بمقياس موافقة من 1 إلى 5' : 'السؤال'}<textarea className={field} value={q.text} onChange={(e) => patch(group.key, i, { text: e.target.value })} /></label>
        {data.exam.category === 'personality' ? <><label className="block">السمة<input className={field} value={q.trait} onChange={(e) => patch(group.key, i, { trait: e.target.value })} /></label><label><input type="checkbox" checked={q.reverse} onChange={(e) => patch(group.key, i, { reverse: e.target.checked })} /> عبارة ذات اتجاه معكوس</label></> : <><label className="block">الإجابة النموذجية ومعيار التصحيح<textarea className={field} value={q.answerKey} onChange={(e) => patch(group.key, i, { answerKey: e.target.value })} /></label><label className="block">الدرجة العظمى<input className={field} type="number" min="1" max="100" value={q.points} onChange={(e) => patch(group.key, i, { points: Number(e.target.value) })} /></label></>}
        <button className={button} onClick={() => setForms((old) => ({ ...old, [group.key]: old[group.key].filter((_, n) => n !== i) }))}>حذف السؤال غير المحفوظ</button>
      </article>)}
      {(forms[group.key]?.length || 0) > 0 && <button disabled={busy} className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40" onClick={() => void save(group.key, 'manual')}>اعتماد الأسئلة اليدوية للمجموعة ({forms[group.key].length})</button>}
    </section>)}
  </div>
}
