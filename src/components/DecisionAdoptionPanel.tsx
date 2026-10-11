import { useState } from 'react'
import {
  apiAdoptExamineeDecision,
  type DecisionStatus,
  type ExamineeDecision,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { STATUS_LABELS_AR } from '../../shared/decisionRules.js'

const STATUSES: DecisionStatus[] = ['qualified', 'conditional', 'not_qualified', 'incomplete']

type Props = {
  decision: ExamineeDecision
  onAdopted: () => void
}

export function DecisionAdoptionPanel({ decision, onAdopted }: Props) {
  const { user } = useAuth()
  const canAdopt = user?.role === 'admin' || user?.role === 'commander'
  const [adoptedStatus, setAdoptedStatus] = useState<DecisionStatus>(decision.status)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!canAdopt || !decision.applicantId) return null

  const disagree = adoptedStatus !== decision.status
  const adoption = decision.adoption

  async function submit() {
    if (!user?.token || !decision.applicantId) return
    setBusy(true)
    setError('')
    try {
      await apiAdoptExamineeDecision(user.token, decision.applicantId, {
        adoptedStatus,
        reason,
      })
      setReason('')
      onAdopted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد القرار')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-gold/35 bg-card p-5" dir="rtl">
      <div>
        <h2 className="text-lg font-extrabold text-gold">ختم الاعتماد الرسمي</h2>
        <p className="mt-1 text-xs text-mute">
          يثبّت لقطة التوصية الحالية. لا يغيّر درجات الاختبار. أي تعديل لاحق للنتيجة يظهر كاختلاف عن اللقطة.
        </p>
      </div>

      {adoption && (
        <div className="rounded-xl border border-line/70 bg-panel/60 px-4 py-3 text-sm">
          <p className="font-bold text-light-gold">
            معتمد: {adoption.adoptedLabelAr}
            {adoption.agreed ? ' — مطابق للتوصية' : ` — مخالف لتوصية ${adoption.recommendedLabelAr}`}
          </p>
          <p className="mt-1 text-xs text-mute">
            {adoption.adoptedByName} · {new Date(adoption.adoptedAt).toLocaleString('ar')}
            {adoption.compositePercent != null ? ` · لقطة المركّبة ${adoption.compositePercent}%` : ''}
          </p>
          {adoption.reason && <p className="mt-1 text-xs text-text">السبب: {adoption.reason}</p>}
          {decision.adoptionDrifted && (
            <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-bold text-warn">
              النسب الحالية اختلفت عن لقطة الاعتماد — راجع سجل تعديل النتائج.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-text">
          الحالة المعتمدة
          <select
            value={adoptedStatus}
            onChange={(e) => setAdoptedStatus(e.target.value as DecisionStatus)}
            className="mt-2 w-full rounded-xl border border-line bg-void px-3 py-2 text-sm font-normal text-text"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS_AR[status]}
                {status === decision.status ? ' (التوصية الحالية)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-text">
          السبب {disagree ? '(إلزامي عند المخالفة)' : '(اختياري)'}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-void px-3 py-2 text-sm font-normal text-text"
            placeholder={disagree ? 'سبب المخالفة' : 'ملاحظة اختيارية'}
          />
        </label>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-ink disabled:opacity-40"
      >
        {busy ? 'جارٍ الحفظ…' : adoption ? 'اعتماد جديد (ينسخ السابق)' : 'اعتماد التوصية'}
      </button>
    </section>
  )
}
