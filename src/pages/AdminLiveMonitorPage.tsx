import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { CATEGORY_META } from '../data/types'
import { useAdminLiveMonitor, MONITOR_LABELS, MONITOR_STATUS } from '../hooks/useLiveMonitor'
import { formatCountdown } from '../utils/examTimer'

export function AdminLiveMonitorPage() {
  const { user } = useAuth()
  const [selectedId, setSelectedId] = useState('')
  const { sessions, connected } = useAdminLiveMonitor(user?.token, selectedId)
  const [filter, setFilter] = useState('')
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!selectedId && sessions[0]) setSelectedId(sessions[0].sessionId)
    else if (selectedId && !sessions.some((s) => s.sessionId === selectedId)) setSelectedId(sessions[0]?.sessionId || '')
  }, [sessions, selectedId])
  const visible = sessions.filter((s) => !filter || s.category === filter)
  const selected = visible.find((s) => s.sessionId === selectedId) || visible[0]
  const recent = visible.flatMap((s) => s.events.filter((e) => now - Date.parse(e.occurredAt) < 10000 && !['connected', 'screen_started'].includes(e.kind)).map((e) => ({ ...e, name: s.examineeName })))
  return <div className="space-y-5" dir="rtl">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold text-gold">المراقبة المباشرة</h1><p className="mt-2 text-sm text-mute">مشاركة الشاشة أثناء الجلسة فقط، مع متابعة التقدم وأحداث النزاهة.</p></div><p className={connected ? 'text-ok' : 'text-error'}>{connected ? 'متصل بالمراقبة' : 'اتصال المسؤول منقطع — الصورة غير مباشرة الآن'}</p></div>
    <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">الأحداث أدناه تنبيهات للمراجعة وليست دليلًا قطعيًا على الغش. مشاركة نافذة أو تبويب لا تتيح رؤية شاشة الجهاز كاملة، والأجهزة غير الداعمة تظهر بمراقبة جزئية.</p>
    <div aria-live="polite" className="space-y-2">{recent.map((e) => <p key={e.id} className="rounded-xl border border-error/50 p-3 text-error">{e.name}: {MONITOR_LABELS[e.kind] || e.kind}</p>)}</div>
    <select aria-label="نوع الاختبار في المراقبة" className="rounded-xl border border-line bg-panel p-3 text-text" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">كل الأنواع المتاحة لحسابي</option>{Object.entries(CATEGORY_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}</select>
    {!visible.length ? <p className="rounded-2xl border border-dashed border-line p-10 text-center text-mute">لا توجد جلسات جارية متاحة لحسابك. تبقى الأحداث محفوظة داخل سجل التقييم بعد انتهاء الجلسة.</p> : <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      {selected && <section className="space-y-4 rounded-2xl border border-line bg-card p-4">
        <div className="flex justify-between"><h2 className="font-bold text-gold">{selected.examineeName}</h2><span className="text-sm text-mute">{selected.examTitle}</span></div>
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-ink">{selected.frame && connected && now - (selected.frameAt || 0) < 6000 ? <img src={selected.frame} className="h-full w-full object-contain" alt={'مشاركة الشاشة المباشرة — ' + selected.examineeName} /> : <p className="p-6 text-center text-mute">{!connected || !selected.connected ? 'الاتصال منقطع — لا توجد صورة مباشرة' : MONITOR_STATUS[selected.monitoringStatus] || 'لا توجد مشاركة شاشة متاحة'}</p>}</div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p>المراقبة: {MONITOR_STATUS[selected.monitoringStatus] || 'غير متاحة'}</p><p>الاتصال: {selected.connected && connected ? 'متصل' : 'منقطع'}</p>
          <p>السؤال الحالي: {selected.questionIndex + 1} / {selected.questionTotal || '—'}</p><p>الوقت المتبقي: {selected.secondsLeft == null ? '—' : formatCountdown(selected.secondsLeft)}</p>
          <p>التقدم: {selected.progress || 0}%</p><p>نطاق المشاركة: {({ monitor: 'الشاشة', window: 'نافذة فقط', browser: 'تبويب فقط', unknown: 'غير محدد' } as any)[selected.captureSurface || 'unknown']}</p>
        </div>
        <Link className="inline-block text-sm text-gold underline" to={'/evaluation/' + selected.examId + '?name=' + encodeURIComponent(selected.examineeName)}>سجل التقييم والأحداث المحفوظة</Link>
        <h3 className="font-bold">أحدث الأحداث</h3><div className="max-h-80 space-y-2 overflow-auto">{[...selected.events].reverse().map((e) => <div key={e.id} className="rounded-xl border border-line p-3 text-sm"><p>{MONITOR_LABELS[e.kind] || e.kind}</p><p className="text-xs text-mute">{new Date(e.occurredAt).toLocaleString('ar-SA')}{e.durationMs != null ? ' • المدة المبلّغ عنها: ' + Math.round(e.durationMs / 1000) + ' ث' : ''} • {e.state.connected ? 'متصل' : 'منقطع'} • {MONITOR_STATUS[e.state.monitoringStatus]}</p></div>)}</div>
      </section>}
      <aside className="space-y-3">{visible.map((s) => <button className={'block w-full space-y-2 rounded-xl border bg-card p-4 text-right ' + (s.sessionId === selected?.sessionId ? 'border-gold' : 'border-line')} key={s.sessionId} onClick={() => setSelectedId(s.sessionId)}><p className="font-bold">{s.examineeName}</p><p className="text-xs text-mute">{s.examTitle}</p><p className="text-sm">{MONITOR_STATUS[s.monitoringStatus]}</p><p className="text-xs text-mute">سؤال {s.questionIndex + 1}/{s.questionTotal} • {s.events.length} حدث حديث • {s.connected ? 'متصل' : 'منقطع'}</p></button>)}</aside>
    </div>}
  </div>
}
