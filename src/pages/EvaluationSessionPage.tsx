import { safeRandomUUID } from '../utils/uuid'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiCommittee } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ApplicantCombobox } from '../components/ApplicantCombobox'
import { BrandedQrCode } from '../components/BrandedQrCode'
import { enterUrl } from '../components/RosterCards'
import { MONITOR_LABELS } from '../hooks/useLiveMonitor'

const field = 'w-full rounded-xl border border-line bg-panel px-3 py-2 text-text'
const btn = 'rounded-xl border border-line px-4 py-2 text-sm hover:border-gold disabled:opacity-40'
const modes = [
  { id: 'suggested', title: 'أسئلة مقترحة من النظام', text: 'راجع المقترحات، عدّلها واعتمد المناسب، ثم امنح درجات من 10.' },
  { id: 'qr', title: 'اختبار عبر QR مع المراقبة', text: 'اعتمد الأسئلة ثم استخدم بطاقة المتقدم الحالية، وتابع الشاشة والأحداث المتاحة.' },
  { id: 'interview', title: 'مقابلة مباشرة', text: 'أسئلة مناسبة مع توثيق إجابة المتقدم ودرجة كل سؤال.' },
  { id: 'manual', title: 'مقابلة يدوية بالكامل', text: 'اكتب أسئلتك وعناصر الإجابة والأوزان، ثم سجّل الإجابات والدرجات.' },
]
export function EvaluationSessionPage() {
  const { examId } = useParams()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const [data, setData] = useState<any>(null)
  const [name, setName] = useState(params.get('name') || '')
  const [session, setSession] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [audit, setAudit] = useState<any[] | null>(null)
  function accept(s: any) { setSession((old: any) => ({ ...s, publicAppUrl:s.publicAppUrl || old?.publicAppUrl || window.location.origin })); setQuestions(s.questions); setEditing(s.checkpointEditing ?? s.status === 'draft'); setAudit(null) }
  async function load() {
    if (!user || !examId) return
    const res = await apiCommittee<any>(user.token, '/evaluation/exams/' + examId)
    setData(res)
    if (params.get('session')) accept(await apiCommittee<any>(user.token, '/evaluation/sessions/' + params.get('session')))
  }
  useEffect(() => { void load().catch((e) => setError(e.message)) }, [user?.token, examId, params.get('session')])
  useEffect(() => {
    if (!data?.roster || !name) return
    const person = data.roster.find((row: { name: string; completed?: boolean }) => row.name === name)
    if (person?.completed) setName('')
  }, [data, name])
  async function act(path: string, method: string, body?: any) {
    if (!user) return
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = body?.questions ? { ...body, questions: body.questions.filter((q: { status?: string; text?: string }) => !(q?.status === 'excluded' && !String(q.text || '').trim())) } : body
      const s = await apiCommittee<any>(user.token, path, method, payload); accept(s); setParams({ session: s.id, name: s.name }); setNotice('حُفظ التقييم وسُجّل التغيير.');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تنفيذ الطلب') }
    finally { setBusy(false) }
  }
  function update(id: string, patch: any) { setQuestions((old) => old.map((q) => q.id === id ? { ...q, ...patch } : q)) }
  const approved = questions.filter((q) => q.status === 'approved')
  const totalWeight = approved.reduce((n, q) => n + Number(q.weight || 0), 0)
  const complete = approved.length > 0 && approved.every((q) => typeof q.grade === 'number' && q.grade >= 0 && q.grade <= 10)
  const result = complete && totalWeight ? approved.reduce((n, q) => n + q.grade * q.weight, 0) / totalWeight * 10 : null
  const writable = session?.isOwner && !session.finalized && user?.role !== 'commander'
  const isCommitteeUser = !!user?.role?.startsWith('committee_')
  const qrStarted = session?.mode === 'qr' && !!session.run
  const gradeAllowed = writable && !editing && (session?.mode !== 'qr' || (session.run && session.run.status !== 'active'))
  const unsavedGrades = session && (session.hasCheckpoint || JSON.stringify(approved.map((q) => [q.id, q.grade, q.answer])) !== JSON.stringify(session.questions.filter((q: any) => q.status === 'approved').map((q: any) => [q.id, q.grade, q.answer])))
  useEffect(() => {
    if (!user || !session?.id || !writable || busy || JSON.stringify(questions) === JSON.stringify(session.questions)) return
    const timer = window.setTimeout(() => {
      void apiCommittee<{ ok: boolean; checkpointAt: string }>(user.token, '/evaluation/sessions/' + session.id + '/checkpoint', 'PUT', {
        version: session.version,
        questions,
        editing,
      }).then((result) => {
        setSession((current: any) => current?.id === session.id ? { ...current, hasCheckpoint: true, checkpointAt: result.checkpointAt } : current)
        setNotice('حُفظت التغييرات تلقائيًا، ويمكن استعادتها بعد تحديث الصفحة.')
      }).catch((cause) => setError(cause instanceof Error ? cause.message : 'تعذر الحفظ التلقائي'))
    }, 800)
    return () => window.clearTimeout(timer)
  }, [questions, editing, session?.id, session?.version, user?.token, writable, busy])
  return <div className="mx-auto max-w-5xl space-y-5" dir="rtl">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold text-gold">{data?.defaultMode ? 'أسئلة الاختبار من البنك' : 'أوضاع التنفيذ والتقييم'}</h1><p className="mt-2 text-mute">{data?.exam.title}</p></div><div className="flex gap-3"><Link className={btn} to="/evaluation/live">المراقبة المباشرة</Link><Link className={btn} to={isCommitteeUser ? '/committees' : '/admin'}>رجوع</Link></div></div>
    {error && <p role="alert" className="rounded-xl border border-error p-3 text-error">{error}</p>}
    {notice && <p role="status" className="text-ok">{notice}</p>}
    {data?.exam?.pendingQuestions && (
      <div className="space-y-2 rounded-xl border border-error/40 bg-error/10 p-4 text-error">
        <p className="font-bold">هذا الاختبار مسودة بلا أسئلة مكتملة. لا يمكن بدء جلسة تقييم أو استخدام QR قبل استكمال الأسئلة.</p>
        <Link className="inline-flex rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink" to={'/admin/complete-questions/' + examId}>الانتقال إلى استكمال الأسئلة</Link>
      </div>
    )}
    {!data?.exam?.active && !data?.exam?.pendingQuestions && data?.exam && (
      <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-warn">الاختبار متوقف حالياً. فعّله من قائمة الاختبارات قبل بدء الجلسات.</p>
    )}
    {!session ? <>
      {(() => {
        const pending = (data?.roster || []).filter((r: any) => !r.completed)
        if (data?.roster?.length && !pending.length) return <p className="rounded-xl bg-ok/10 p-4 text-sm font-bold text-ok">اعتُمدت علامات جميع المتقدمين في هذا الاختبار.</p>
        const picked = pending.some((r: any) => r.name === name) ? name : ''
        return <label className="block text-sm">المتقدم
          <ApplicantCombobox className={field + ' mt-1'} value={picked} onChange={setName} options={pending.map((r: any) => ({ id: r.id, name: r.name, label: `${r.name} — ${r.jobTitle || ''}` }))} />
        </label>
      })()}
      <p className="text-mute">لكل مقيّم أسئلته ودرجاته المستقلة. المقترحات لا تدخل الحساب قبل اعتمادها.</p>
      {data?.defaultMode && <p className="rounded-xl border border-gold/40 p-3 text-light-gold">وضع التنفيذ المحدد عند إنشاء الاختبار: {modes.find((mode) => mode.id === data.defaultMode)?.title}</p>}
      <div className="grid gap-4 md:grid-cols-2">{modes.filter((m) => !data?.defaultMode || m.id === data.defaultMode).map((m) => <button disabled={!name || busy || user?.role === 'commander' || (data?.assignmentId && !isCommitteeUser && !data?.isCommitteeOwner) || !!data?.exam?.pendingQuestions || data?.exam?.active === false} className={`space-y-3 rounded-2xl border bg-card p-6 text-right hover:border-gold disabled:opacity-40 ${data?.defaultMode === m.id ? 'border-gold bg-gold/10' : 'border-line'}`} key={m.id} onClick={() => act('/evaluation/exams/' + examId + '/sessions', 'POST', { name, mode: m.id })}><h2 className="text-lg font-bold text-gold">{data?.defaultMode ? 'بدء الجلسة بأسئلة البنك' : m.title}</h2><p className="text-sm text-mute">{m.text}</p></button>)}</div>
      {data?.assignmentId && !isCommitteeUser && !data?.isCommitteeOwner && <p className="text-mute">ينشئ كل عضو جلسة تقييمه من حسابه المستقل؛ يتاح للمسؤول الاطلاع على السجلات.</p>}
      {data?.sessions.length > 0 && <section className="space-y-3 rounded-xl border border-line p-4"><h2 className="font-bold">الجلسات المحفوظة</h2>{data.sessions.map((s: any) => <button key={s.id} className="block text-gold" onClick={() => setParams({ session: s.id })}>{data.roster.find((r: any) => r.id === s.roster_id)?.name} — {s.evaluator_label} — {modes.find((m) => m.id === s.mode)?.title} {s.percent != null ? '(' + s.percent + '/100)' : ''}</button>)}</section>}
    </> : <>
      <div className="rounded-2xl border border-gold bg-card p-5">{session.currentFinalPercent != null && <p className="mb-2 font-bold text-ok">النتيجة الحالية المعتمدة: {session.currentFinalPercent.toFixed(2)}/100</p>}<h2 className="text-xl font-bold">{session.name}</h2><p className="text-mute">{session.jobTitle} • {session.evaluator_label} • {modes.find((m) => m.id === session.mode)?.title}</p><p className="mt-2 text-sm">{session.finalized ? 'نتيجة معتمدة — سجل محفوظ للقراءة' : editing ? 'مسودة أسئلة — اعتمد المناسب قبل التقييم' : 'الأسئلة معتمدة ومحفوظة'}</p>{session.hasCheckpoint && <p className="mt-2 text-sm text-ok">تم استرجاع آخر حفظ تلقائي{session.checkpointAt ? ` — ${new Date(session.checkpointAt).toLocaleTimeString('ar-SA')}` : ''}</p>}</div>
      <div className="flex flex-wrap gap-3"><button className={btn} onClick={() => { setSession(null); setParams({}) }}>قائمة المتقدمين والأوضاع</button><button className={btn} disabled={busy} onClick={() => act('/evaluation/sessions/' + session.id, 'GET')}>تحديث الجلسة</button>{writable && !qrStarted && !editing && <button className={btn} onClick={() => setEditing(true)}>تعديل الأسئلة قبل اعتماد النتيجة</button>}</div>
      {session.mode === 'qr' && !editing && <section className="space-y-3 rounded-xl border border-line p-4"><h3 className="font-bold text-gold">بطاقة QR الحالية</h3>{session.qrToken ? <BrandedQrCode value={enterUrl(session.qrToken, session.publicAppUrl)} /> : <p>{session.run ? 'بدأ المتقدم الجلسة. حدّث الصفحة بعد التسليم لإظهار الإجابات.' : 'استُخدمت البطاقة أو لم تصبح الأسئلة جاهزة بعد.'}</p>}<p className="text-sm text-mute">يجب تجهيز أسئلة جميع الأعضاء المشاركين في QR قبل مسح البطاقة. بعد البدء تُقفل هذه الأسئلة، ولا يمكن إضافة عضو لهذا الوضع. يقيّم كل عضو أسئلته فقط بعد التسليم.</p><p className="text-sm text-warn">قد تكون مشاركة الشاشة غير متاحة على الهاتف. تظهر الحالة الفعلية في المراقبة، ولا تعني أحداث النزاهة إثبات غش.</p></section>}
      {editing && writable && <button className={btn} onClick={() => setQuestions([...questions, { id: safeRandomUUID(), source: 'manual', status: 'proposed', text: '', answerKey: '', expectedPoints: '', weight: 1, grade: null, answer: '' }])}>إضافة سؤال خاص بي</button>}
      {!questions.length && <p className="rounded-xl border border-dashed border-line p-6 text-mute">لا توجد أسئلة مقترحة مناسبة. أضف أسئلتك الخاصة واعتمدها.</p>}
      {questions.map((q, i) => <article key={q.id} className={'space-y-3 rounded-2xl border p-5 ' + (q.status === 'excluded' ? 'border-line opacity-60' : q.status === 'approved' ? 'border-gold bg-card' : 'border-line bg-panel')}>
        <div className="flex justify-between"><h3 className="font-bold">السؤال {i + 1} • {q.source === 'manual' ? 'مضاف يدويًا' : 'من البنك'}</h3><span className="text-sm text-gold">{q.status === 'approved' ? 'معتمد' : q.status === 'excluded' ? 'مستبعد' : 'مقترح'}</span></div>
        {editing && writable ? <>
          <label className="block">السؤال<textarea className={field} rows={2} value={q.text} onChange={(e) => update(q.id, { text: e.target.value })} /></label>
          <label className="block">الإجابة النموذجية<textarea className={field} rows={2} value={q.answerKey || ''} onChange={(e) => update(q.id, { answerKey: e.target.value })} /></label>
          <label className="block">نقاط الإجابة المتوقعة<textarea className={field} rows={2} value={q.expectedPoints || ''} onChange={(e) => update(q.id, { expectedPoints: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-[1fr_130px]"><label>معيار التقييم<input className={field} value={q.criterion ?? q.rubric?.[0]?.criterion ?? ''} onChange={(e) => update(q.id, { criterion: e.target.value })} /></label><label>وزن السؤال<input className={field} type="number" min="0.01" max="1000" step="any" value={q.weight} onChange={(e) => update(q.id, { weight: Number(e.target.value) })} /></label></div>
          <div className="flex gap-3"><button className={btn} onClick={() => update(q.id, { status: 'approved' })}>اعتماد السؤال</button><button className={btn} onClick={() => session.questions.some((saved: any) => saved.id === q.id) ? update(q.id, { status: 'excluded' }) : setQuestions((old) => old.filter((item) => item.id !== q.id))}>استبعاد / حذف</button><button className={btn} onClick={() => update(q.id, { status: 'proposed' })}>إعادته للمقترحات</button></div>
        </> : <><p className="whitespace-pre-wrap font-semibold">{q.text}</p>{q.choices?.map((c: any) => <p key={c.id} className={c.id === q.correctAnswer ? 'text-ok' : 'text-mute'}>{c.text}{c.id === q.correctAnswer ? ' ✓' : ''}</p>)}<details><summary className="cursor-pointer text-gold">الإجابة النموذجية ونقاطها ومعيار التقييم</summary><p className="whitespace-pre-wrap">الإجابة النموذجية: {q.answerKey || 'غير محددة'}</p><p className="whitespace-pre-wrap">العناصر المتوقعة: {q.expectedPoints || 'غير محددة'}</p>{q.rubric?.map((r: any, n: number) => <p key={n}>المعيار: {r.criterion}</p>)}</details><p className="text-sm">وزن السؤال: {q.weight}</p>
          {q.status === 'approved' && (
            <div className="space-y-3 pt-2">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <label className="block text-xs font-semibold text-mute">
                  إجابة المتقدم
                  <textarea
                    className={field + ' mt-1'}
                    rows={2}
                    value={q.choices?.find((c: any) => c.id === q.answer)?.text || q.answer || ''}
                    readOnly={!gradeAllowed || session.mode === 'qr'}
                    onChange={(e) => update(q.id, { answer: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-semibold text-mute">
                  الدرجة من 10
                  <input
                    className={field + ' mt-1 font-bold text-light-gold'}
                    type="number"
                    min={0}
                    max={10}
                    step="0.01"
                    value={q.grade ?? ''}
                    disabled={!gradeAllowed}
                    onChange={(e) => update(q.id, { grade: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                  {q.autoGrade != null && gradeAllowed && (
                    <button
                      type="button"
                      className="mt-2 block text-xs text-gold hover:underline"
                      onClick={() => update(q.id, { grade: q.autoGrade })}
                    >
                      استخدام المحسوبة: {q.autoGrade}/10
                    </button>
                  )}
                </label>
              </div>

              {gradeAllowed && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/50 bg-panel/50 p-2">
                  <span className="ml-2 text-xs text-mute">رصد سريع:</span>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                    <button
                      key={val}
                      type="button"
                      disabled={!gradeAllowed}
                      onClick={() => update(q.id, { grade: val })}
                      className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${
                        q.grade === val
                          ? 'bg-gold text-ink shadow-[0_0_8px_rgba(193,165,118,0.4)] scale-105'
                          : 'border border-line/60 bg-panel text-mute hover:border-gold/50 hover:text-text'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>}
      </article>)}
      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold bg-panel p-4 shadow-lg">
        <p>المعتمد: {approved.length} • مجموع الأوزان: {totalWeight} • النتيجة: {result == null ? 'درجات غير مكتملة' : result.toFixed(2) + '/100'}</p>
        <div className="flex flex-wrap items-center gap-2">{error && <p role="alert" className="text-sm text-error">{error}</p>}{editing && writable ? <><button disabled={busy} className={btn} onClick={() => act('/evaluation/sessions/' + session.id, 'PUT', { version: session.version, questions })}>حفظ المسودة</button><button disabled={busy || !approved.length} className={btn} onClick={() => act('/evaluation/sessions/' + session.id, 'PUT', { version: session.version, questions, ready: true })}>حفظ واعتماد الأسئلة</button>{!approved.length && <span className="text-sm text-warn">اضغط «اعتماد السؤال» على سؤال واحد على الأقل</span>}</> : <>{gradeAllowed && <button className={btn} disabled={busy || !complete} onClick={() => act('/evaluation/sessions/' + session.id + '/grades', 'PUT', { version: session.version, grades: approved.map((q) => ({ id: q.id, grade: q.grade, answer: String(q.answer ?? '') })) })}>حفظ درجاتي</button>}{writable && session.status === 'scored' && !session.committeeId && <button className={btn} disabled={busy || unsavedGrades} onClick={() => act('/evaluation/sessions/' + session.id + '/publish', 'POST', { version: session.version })}>اعتماد النتيجة النهائية المحفوظة</button>}{session.committeeId && <Link className={btn} to="/committees">متابعة نتيجة اللجنة</Link>}</>}</div>
      </div>
      <p className="text-xs text-mute">النتيجة = مجموع (الدرجة من 10 × وزن السؤال) ÷ مجموع الأوزان × 10. يُطبّق وزن عضو اللجنة على نتيجة تقييمه بعد ذلك.</p>
      <details className="rounded-xl border border-line p-4"><summary>سجل التعديلات ({session.history.length})</summary>{session.history.map((h: any, i: number) => <p key={i} className="mt-2 text-sm">{new Date(h.occurredAt).toLocaleString('ar-SA')} — {h.actor} — {({ create: 'إنشاء الجلسة', change_mode: 'تغيير الوضع', edit_draft: 'تعديل المسودة', approve_questions: 'اعتماد الأسئلة', grade: 'حفظ الدرجات', publish: 'اعتماد النتيجة' } as any)[h.action] || h.action}</p>)}<button className={btn + ' mt-3'} onClick={() => user && apiCommittee<any[]>(user.token, '/evaluation/sessions/' + session.id + '/history').then(setAudit).catch((e) => setError(e.message))}>عرض القيم قبل التعديل وبعده</button>{audit?.map((h, i) => <details key={i} className="mt-3 border-t border-line pt-3"><summary>{new Date(h.occurredAt).toLocaleString('ar-SA')} — {h.actor}</summary>{h.changes.map((change: any) => <div key={change.after.id} className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{[['قبل', change.before], ['بعد', change.after]].map(([label, q]: any) => <div key={label} className="rounded-xl bg-card p-3"><p className="font-bold text-gold">{label}</p>{q ? <><p>{q.text}</p><p>الوزن: {q.weight} • الدرجة: {q.grade ?? 'لم تُسجّل'}</p><p>الإجابة: {String(q.answer ?? '')}</p><p>الحالة: {q.status === 'approved' ? 'معتمد' : q.status === 'excluded' ? 'مستبعد' : 'مقترح'}</p><p>الإجابة النموذجية: {q.answerKey}</p><p>العناصر المتوقعة: {q.expectedPoints}</p></> : <p>لم يكن السؤال موجودًا</p>}</div>)}</div>)}</details>)}</details>
      <details className="rounded-xl border border-line p-4"><summary>أحداث المراقبة ({session.events.length}) — تحتاج مراجعة</summary>{session.events.map((e: any) => <p key={e.id} className="mt-2 text-sm">{new Date(e.occurredAt).toLocaleString('ar-SA')} — {MONITOR_LABELS[e.kind] || e.kind} {e.durationMs != null ? '(' + Math.round(e.durationMs / 1000) + ' ث)' : ''}</p>)}</details>
    </>}
  </div>
}
