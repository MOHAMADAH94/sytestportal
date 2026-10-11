import type { ExamineeDecision, DecisionStatus } from '../api/client'

const STATUS_STYLES: Record<
  DecisionStatus,
  { border: string; bg: string; text: string }
> = {
  qualified: {
    border: 'border-ok/40',
    bg: 'bg-ok/10',
    text: 'text-ok',
  },
  conditional: {
    border: 'border-warn/40',
    bg: 'bg-warn/10',
    text: 'text-warn',
  },
  not_qualified: {
    border: 'border-error/40',
    bg: 'bg-error/10',
    text: 'text-error',
  },
  incomplete: {
    border: 'border-line',
    bg: 'bg-panel/60',
    text: 'text-mute',
  },
}

type Props = {
  decision: ExamineeDecision
}

export function DecisionRecommendationCard({ decision }: Props) {
  const style = STATUS_STYLES[decision.status] || STATUS_STYLES.incomplete
  const categories = Object.values(decision.categoryBreakdown || {})

  return (
    <section
      className={`space-y-4 rounded-2xl border ${style.border} ${style.bg} p-5 shadow-[0_0_24px_rgba(193,165,118,0.12)]`}
      dir="rtl"
      aria-label="تقدير الجدارة — توصية أهلية المرشح"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-[11px] font-extrabold tracking-wide text-light-gold">
            تقدير الجدارة المؤسسي للمرشح :
          </div>
          <p className="text-sm font-bold text-gold">تقدير الجدارة المؤسسي</p>
          <p className={`mt-1 text-3xl font-extrabold ${style.text}`}>{decision.labelAr}</p>
          <p className="mt-1 text-xs text-mute">تحليل مركّب لمسارات التقييم المطلوبة حسب صنف الفرز</p>
          <p className="mt-2 text-xs text-mute">{decision.disclaimerAr}</p>
        </div>
        <div className="text-left">
          <p className="text-xs font-bold text-mute">الدرجة المركّبة</p>
          <p className="text-2xl font-extrabold text-light-gold">
            {decision.compositePercent != null ? `${decision.compositePercent}%` : '—'}
          </p>
          <p className="mt-1 text-[11px] text-mute">{decision.policyVersion}</p>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((item) => (
            <div
              key={item.category}
              className="rounded-xl border border-line/60 bg-card/50 px-3 py-2 text-sm"
            >
              <div className="font-bold text-text">{item.labelAr}</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className={item.belowFloor ? 'font-bold text-warn' : 'font-bold text-light-gold'}>
                  {item.percent != null ? `${item.percent}%` : '—'}
                </span>
                <span className="text-[11px] text-mute">
                  {item.status === 'pending'
                    ? 'معلّق'
                    : item.status === 'missing'
                      ? 'ناقص'
                      : `وزن ${Math.round(item.weight * 100)}%`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {decision.reasons?.length > 0 && (
        <ul className="list-disc space-y-1 pr-5 text-sm text-text">
          {decision.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
