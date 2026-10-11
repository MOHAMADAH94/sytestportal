import type { RosterAccount } from '../api/client'
import { BrandedQrCode } from './BrandedQrCode'

type Props = {
  examTitle: string
  roster: RosterAccount[]
  publicAppUrl: string
  compact?: boolean
  showBarcode?: boolean
}

export function enterUrl(token: string, publicAppUrl = window.location.origin) {
  const clean = String(token || '').trim()
  if (!clean) throw new Error('رمز QR غير متوفر للبطاقة')
  return new URL(`/enter/${encodeURIComponent(clean)}`, publicAppUrl).toString()
}

export function RosterCards({ examTitle, roster, publicAppUrl, compact = false, showBarcode = true }: Props) {
  const printable = showBarcode
    ? roster.filter((r) => String(r.qrToken || '').trim().length >= 40)
    : roster
  if (!printable.length) {
    return (
      <p className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
        لا تتوفر رموز QR صالحة للطباعة. حدّث الصفحة أو أعد تدوير الرمز من قائمة الممتحنين بحساب المسؤول.
      </p>
    )
  }

  const qrSize = compact ? 112 : 148

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold text-light-gold">
          {compact ? 'بطاقات الممتحنين' : `بطاقات الممتحنين — ${examTitle}`}
        </h3>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print rounded-xl border border-line bg-panel px-3 py-2 text-xs font-bold text-gold"
        >
          طباعة البطاقات
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
        {printable.map((r) => (
          <div
            key={r.id}
            className="roster-print-card break-inside-avoid overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-card to-panel text-right shadow-lg print:border-2 print:shadow-none"
          >
            <div className="border-b border-gold/20 bg-gold/10 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <img
                    src="/logo.png"
                    alt=""
                    width={32}
                    height={32}
                    className="roster-logo h-8 w-8 object-contain"
                  />
                  <div>
                    <div className="text-[10px] font-bold text-mute">منصة الاختبارات</div>
                    <div className="text-xs font-bold text-light-gold">بطاقة دخول الممتحن</div>
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-[10px] text-mute">معرّف الممتحن</div>
                  <div className="font-mono text-sm font-extrabold leading-tight text-gold" dir="ltr">
                    {r.displayId}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div>
                <div className="text-lg font-extrabold text-text">{r.name}</div>
                {r.demandTitle && (
                  <p className="mt-1 text-sm font-bold text-text">
                    <span className="font-normal text-mute">مسمى طلب الاحتياج: </span>
                    {r.demandTitle}
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-bold text-text">
                <input type="checkbox" className="exam-ticket-check h-4 w-4 shrink-0" aria-label={examTitle} />
                <span>{examTitle}</span>
              </label>

              {(r.tracks?.length || 0) > 1 && (
                <div className="space-y-1 rounded-xl border border-line px-3 py-2">
                  <p className="text-[11px] font-bold text-mute">مسارات التقييم المطلوبة لهذا المسمى</p>
                  {r.tracks?.map((track) => (
                    <label key={track.id} className="flex items-center gap-2 text-sm text-text">
                      <input type="checkbox" className="exam-ticket-check h-4 w-4 shrink-0" defaultChecked={track.done} aria-label={track.label} />
                      <span>{track.label}{track.done ? ' — تم' : ''}</span>
                    </label>
                  ))}
                </div>
              )}

              {showBarcode ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-line/80 bg-panel/50 py-4">
                  <BrandedQrCode value={enterUrl(r.qrToken, publicAppUrl)} size={qrSize} />
                  <p className="text-center text-[11px] font-bold text-light-gold">امسح للدخول المباشر</p>
                </div>
              ) : (
                <p className="rounded-xl border border-line px-3 py-2 text-center text-xs text-mute">
                  لا يُطبع باركود لهذا الاختبار. التقييم يتم من اللجنة.
                </p>
              )}

              {r.used && (
                <span className="inline-flex rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[10px] font-bold text-warn">
                  تم استخدام الحساب
                </span>
              )}

              <p className="text-center text-[10px] leading-5 text-mute">
                {showBarcode ? 'هذه البطاقة هي وسيلة الدخول الوحيدة للاختبار.' : 'هذه البطاقة للتعريف فقط، بلا باركود دخول.'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function rosterEnterUrls(roster: RosterAccount[], publicAppUrl: string) {
  return roster
    .filter((r) => String(r.qrToken || '').trim().length >= 40)
    .map((r) => ({
      ...r,
      enterUrl: enterUrl(r.qrToken, publicAppUrl),
    }))
}
