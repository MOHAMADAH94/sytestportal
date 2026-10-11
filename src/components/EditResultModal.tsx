import { AlertTriangle, CheckCircle2, History, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  apiGetAttemptAuditHistory,
  apiModifyAttemptResult,
  type ResultAuditRecord,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'

interface EditResultModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (result: { newPercent: number }) => void
  attemptId: string
  candidateName: string
  examTitle: string
  category?: string
  currentPercent: number | null
  currentScore?: number
  currentMaxScore?: number
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function EditResultModal({
  isOpen,
  onClose,
  onSuccess,
  attemptId,
  candidateName,
  examTitle,
  currentPercent,
}: EditResultModalProps) {
  const { user } = useAuth()
  const originalPctValue = currentPercent != null ? currentPercent : 0
  const originalPctFormatted = `${originalPctValue.toFixed(2)}%`

  const [newPercent, setNewPercent] = useState<string>('')
  const [reason, setReason] = useState('')
  const [committeeReference, setCommitteeReference] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ResultAuditRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setNewPercent('')
      setReason('')
      setCommitteeReference('')
      setError('')
      setLoading(false)

      // تحميل سجل التعديلات السابقة إن وُجد
      if (user?.token && attemptId) {
        setLoadingHistory(true)
        apiGetAttemptAuditHistory(user.token, attemptId)
          .then((res) => {
            setHistory(res.history || [])
            if (res.history?.length > 0) {
              setShowHistory(true)
            }
          })
          .catch(() => setHistory([]))
          .finally(() => setLoadingHistory(false))
      }
    }
  }, [isOpen, attemptId, user?.token])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user?.token || !attemptId) return

    const parsed = Number(newPercent)
    if (newPercent.trim() === '' || !Number.isFinite(parsed)) {
      setError('الرجاء إدخال النتيجة الجديدة كقيمة رقمية صحيحة')
      return
    }

    if (parsed < 0 || parsed > 100) {
      setError('النتيجة الجديدة يجب أن تكون بين 0 و 100%')
      return
    }

    if (currentPercent != null && Math.abs(parsed - originalPctValue) < 0.001) {
      setError('النتيجة الجديدة مطابقة للنتيجة الأصلية الحالية — لم يطرأ أي تغيير')
      return
    }

    const trimmedReason = reason.trim()
    if (!trimmedReason || trimmedReason.length < 5) {
      setError('سبب التعديل إلزامي ويجب ألا يقل عن 5 أحرف (مثال: بناءً على قرار اللجنة...)')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await apiModifyAttemptResult(user.token, attemptId, {
        newPercent: Number(parsed.toFixed(2)),
        reason: trimmedReason,
        committeeReference: committeeReference.trim() || undefined,
      })

      onSuccess({ newPercent: res.result.newPercent })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل اعتماد التعديل')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      dir="rtl"
    >
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        {/* رأس النافذة */}
        <div className="mb-4 flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-light-gold">تعديل النتيجة النهائية</h2>
            <p className="mt-0.5 text-xs text-mute">{examTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-mute transition hover:bg-card hover:text-text"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* المرشح */}
        <div className="mb-5 rounded-xl border border-line bg-card px-4 py-3">
          <span className="text-xs font-bold text-mute">المرشح:</span>
          <div className="text-base font-extrabold text-text mt-0.5">{candidateName}</div>
        </div>

        {/* نموذج التعديل */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* النتيجة الأصلية */}
          <div>
            <label className="block text-xs font-bold text-mute mb-1">النتيجة الأصلية</label>
            <div className="flex items-center justify-center rounded-xl border border-line bg-panel py-3 text-center">
              <span className="text-2xl font-black tracking-wider text-text">
                {originalPctFormatted}
              </span>
            </div>
          </div>

          {/* النتيجة الجديدة */}
          <div>
            <label className="block text-xs font-bold text-light-gold mb-1">
              النتيجة الجديدة *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={newPercent}
                onChange={(e) => setNewPercent(e.target.value)}
                placeholder="مثال: 90.00"
                className="w-full rounded-xl border border-gold/50 bg-card py-2.5 pe-10 ps-4 text-center text-xl font-black text-text outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              />
              <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-sm font-bold text-light-gold">
                %
              </span>
            </div>
          </div>

          {/* سبب التعديل */}
          <div>
            <label className="block text-xs font-bold text-light-gold mb-1">
              سبب التعديل *
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="بناءً على قرار اللجنة..."
              className="w-full rounded-xl border border-line bg-card p-3 text-sm text-text outline-none transition focus:border-gold/60 focus:bg-panel"
            />
          </div>

          {/* قرار اللجنة / المرجع */}
          <div>
            <label className="block text-xs font-bold text-mute mb-1">
              قرار اللجنة / المرجع
            </label>
            <input
              type="text"
              value={committeeReference}
              onChange={(e) => setCommitteeReference(e.target.value)}
              placeholder="محضر رقم ............"
              className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-text outline-none transition focus:border-gold/60 focus:bg-panel"
            />
          </div>

          {/* التنبيه الأمني للتدقيق */}
          <div className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3.5 text-xs leading-relaxed text-warn">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warn mt-0.5" />
            <div>
              <span className="font-bold">تنبيه نظامي: </span>
              سيتم الاحتفاظ بالنتيجة الأصلية وسجل عملية التعديل وهوية المعتمد للمراجعة والتدقيق الدائم.
            </div>
          </div>

          {/* رسالة الخطأ إن وُجدت */}
          {error && (
            <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-2.5 text-xs font-bold text-error">
              {error}
            </div>
          )}

          {/* أزرار الإجراء */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-bold text-mute transition hover:bg-panel hover:text-text disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-2.5 text-sm font-extrabold text-ink shadow-lg shadow-gold/20 transition hover:bg-accent-gold disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الاعتماد...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  اعتماد التعديل
                </>
              )}
            </button>
          </div>
        </form>

        {/* قسم سجل التدقيق التاريخي السابق للمحاولة إن وُجد */}
        {loadingHistory && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-mute">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
            جاري استرجاع سجل التدقيق...
          </div>
        )}
        {history.length > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-bold text-mute hover:text-light-gold"
            >
              <span className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-gold" />
                سجل التعديلات السابقة لهذه النتيجة ({history.length})
              </span>
              <span>{showHistory ? 'إخفاء' : 'عرض'}</span>
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2.5">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-xl border border-line bg-card p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-line/50 pb-1.5 mb-1.5 font-bold">
                      <span className="text-light-gold">
                        {h.originalPercent != null ? `${h.originalPercent}%` : '—'} ←{' '}
                        {h.newPercent}%
                      </span>
                      <span className="text-mute">{formatDate(h.createdAt)}</span>
                    </div>
                    <div className="text-text-2">
                      <span className="font-bold text-mute">السبب: </span>
                      {h.reason}
                    </div>
                    {h.committeeReference && (
                      <div className="mt-0.5 text-text-2">
                        <span className="font-bold text-mute">المرجع: </span>
                        {h.committeeReference}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-mute">
                      المعدِّل: {h.modifiedByName} ({h.modifiedByRole})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
