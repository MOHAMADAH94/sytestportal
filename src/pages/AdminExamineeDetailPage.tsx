import { ArrowRight, CheckCircle2, History, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  apiExamineeDetail,
  apiExamineeDecision,
  apiGetExamineeAuditHistory,
  type ExamineeAttemptDetail,
  type ExamineeDecision,
  type ResultAuditRecord,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { DecisionRecommendationCard } from '../components/DecisionRecommendationCard'
import { DecisionAdoptionPanel } from '../components/DecisionAdoptionPanel'
import { EditResultModal } from '../components/EditResultModal'
import { CATEGORY_META, EXAM_LEVELS, ORAL_ROLES } from '../data/types'

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

export function AdminExamineeDetailPage() {
  const { name } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState<Awaited<ReturnType<typeof apiExamineeDetail>> | null>(null)
  const [decision, setDecision] = useState<ExamineeDecision | null>(null)
  const [auditHistory, setAuditHistory] = useState<ResultAuditRecord[]>([])
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedAttempt, setSelectedAttempt] = useState<ExamineeAttemptDetail | null>(null)

  async function loadData() {
    if (!user?.token || !name) return
    try {
      const decoded = decodeURIComponent(name)
      const [resDetail, resHistory, resDecision] = await Promise.all([
        apiExamineeDetail(user.token, decoded),
        apiGetExamineeAuditHistory(user.token, decoded).catch(() => ({ history: [], total: 0 })),
        apiExamineeDecision(user.token, decoded).catch(() => null),
      ])
      setData(resDetail)
      setAuditHistory(resHistory.history || [])
      setDecision(resDecision)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل')
    }
  }

  useEffect(() => {
    void loadData()
  }, [user?.token, name])

  function handleModifySuccess() {
    setSuccessMsg('تم اعتماد تعديل النتيجة بنجاح وتوثيق سجل التدقيق الدائم.')
    void loadData()
    setTimeout(() => setSuccessMsg(''), 5000)
  }

  if (error) {
    return (
      <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-error">{error}</div>
    )
  }

  if (!data) return <p className="text-mute">جاري تحميل نتائج الممتحن...</p>

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <Link
          to="/admin/examinees"
          className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-gold"
        >
          <ArrowRight className="h-4 w-4" /> قائمة الممتحنين
        </Link>
        <h1 className="text-2xl font-extrabold text-light-gold">{data.examineeName}</h1>
        <p className="mt-1 text-sm text-mute">
          قدّم {data.examCount} اختباراً ضمن نطاق صلاحيتك.
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm font-bold text-ok">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* متوسط النسب */}
      <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5">
        <div className="text-sm font-bold text-mute">النتيجة النهائية (متوسط النسب)</div>
        <div className="mt-2 text-4xl font-extrabold text-light-gold">
          {data.finalPercent != null ? `${data.finalPercent}%` : '—'}
        </div>
        <p className="mt-2 text-xs text-mute">
          يُحسب المتوسط من نسب الاختبارات ذات التصحيح الآلي والمعتمدة رسمياً.
        </p>
      </div>

      {decision && <DecisionRecommendationCard decision={decision} />}
      {decision && (
        <DecisionAdoptionPanel
          decision={decision}
          onAdopted={() => {
            setSuccessMsg('تم ختم الاعتماد وتثبيت لقطة القرار.')
            void loadData()
            setTimeout(() => setSuccessMsg(''), 5000)
          }}
        />
      )}

      {/* جدول نتائج الاختبارات للممتحن */}
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-panel text-mute">
            <tr>
              <th className="px-4 py-3 text-right font-bold">الاختبار</th>
              <th className="px-4 py-3 text-right font-bold">النوع</th>
              <th className="px-4 py-3 text-right font-bold">الدرجة</th>
              <th className="px-4 py-3 text-right font-bold">النسبة</th>
              <th className="px-4 py-3 text-right font-bold">وقت التسليم</th>
              <th className="px-4 py-3 text-center font-bold">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {data.attempts.map((a) => (
              <tr key={a.attemptId} className="border-t border-line bg-card">
                <td className="px-4 py-3">
                  <div className="font-semibold text-text">{a.examTitle}</div>
                  <Link
                    to={`/admin/results/${a.examId}`}
                    className="text-xs font-bold text-gold hover:underline"
                  >
                    نتائج الاختبار
                  </Link>
                </td>
                <td className="px-4 py-3 text-mute">
                  {CATEGORY_META[a.category]?.label}
                  {a.oralRole
                    ? ` · ${ORAL_ROLES.find((r) => r.id === a.oralRole)?.label || a.oralRole}`
                    : ''}
                  <div className="text-[11px]">
                    {EXAM_LEVELS.find((l) => l.id === a.level)?.label}
                  </div>
                </td>
                <td className="px-4 py-3 text-ok">
                  {a.maxScore > 0 ? `${a.score} / ${a.maxScore}` : 'تقييم يدوي'}
                </td>
                <td className="px-4 py-3 font-bold text-light-gold">
                  {a.percent != null ? `${a.percent}%` : '—'}
                  {a.committeeNote && <div className="mt-1 text-[11px] font-normal text-mute">ملاحظة اللجنة: {a.committeeNote}</div>}
                  {a.estimatedSalary != null && <div className="text-[11px] font-normal text-text">الراتب المقدر: {a.estimatedSalary.toLocaleString('ar-SY')}</div>}
                </td>
                <td className="px-4 py-3 text-mute">
                  {formatDate(a.finishedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      id={`edit-result-${a.attemptId}`}
                      disabled={!!a.committeeResult && user?.role !== 'admin'}
                      onClick={() => setSelectedAttempt(a)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold transition hover:border-gold hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {a.committeeResult && user?.role !== 'admin' ? 'معتمد من اللجنة' : 'تعديل النتيجة'}
                    </button>
                    {(a.auditCount || 0) > 0 && (
                      <span
                        title={`تم تعديل هذه النتيجة ${a.auditCount} مرة`}
                        className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-bold text-warn"
                      >
                        <History className="h-3 w-3" />
                        معدّلة ({a.auditCount})
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* سجل التدقيق التاريخي الكامل للممتحن */}
      {auditHistory.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-gold" />
            <h2 className="text-lg font-extrabold text-light-gold">
              سجل التدقيق والتعديلات الرسمية ({auditHistory.length})
            </h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-panel text-mute">
                <tr>
                  <th className="px-4 py-2.5 text-right font-bold text-xs">التاريخ</th>
                  <th className="px-4 py-2.5 text-right font-bold text-xs">الاختبار</th>
                  <th className="px-4 py-2.5 text-right font-bold text-xs">النتيجة السابقة</th>
                  <th className="px-4 py-2.5 text-right font-bold text-xs">النتيجة الجديدة</th>
                  <th className="px-4 py-2.5 text-right font-bold text-xs">سبب التعديل</th>
                  <th className="px-4 py-2.5 text-right font-bold text-xs">قرار اللجنة / المرجع</th>
                  <th className="px-4 py-2.5 text-right font-bold text-xs">المعدِّل</th>
                </tr>
              </thead>
              <tbody>
                {auditHistory.map((h) => (
                  <tr key={h.id} className="border-t border-line text-xs">
                    <td className="px-4 py-2.5 text-mute">{formatDate(h.createdAt)}</td>
                    <td className="px-4 py-2.5 font-semibold text-text">{h.examTitle}</td>
                    <td className="px-4 py-2.5 text-mute font-mono">
                      {h.originalPercent != null ? `${h.originalPercent}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-light-gold font-mono">
                      {h.newPercent}%{' '}
                      {h.diffPercent != null && (
                        <span
                          className={`text-[11px] ${
                            h.diffPercent > 0
                              ? 'text-ok'
                              : h.diffPercent < 0
                                ? 'text-error'
                                : 'text-mute'
                          }`}
                        >
                          ({h.diffPercent > 0 ? `+${h.diffPercent}%` : `${h.diffPercent}%`})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-2 max-w-xs">{h.reason}</td>
                    <td className="px-4 py-2.5 text-mute">{h.committeeReference || '—'}</td>
                    <td className="px-4 py-2.5 text-mute font-medium">
                      {h.modifiedByName} ({h.modifiedByRole})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* تقارير الشخصية إن وُجدت */}
      {data.attempts.some((a) => a.personality) && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-light-gold">تقارير الشخصية</h2>
          {data.attempts
            .filter((a) => a.personality)
            .map((a) => (
              <div
                key={a.attemptId}
                className="rounded-xl border border-line bg-card p-4 text-sm"
              >
                <div className="mb-1 font-bold text-text">{a.examTitle}</div>
                {a.personality?.summary && (
                  <p className="mb-3 leading-relaxed text-text-2">{a.personality.summary}</p>
                )}
                {a.personality?.traits && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {a.personality.traits.map((t) => (
                      <div
                        key={t.name}
                        className="rounded-xl border border-line bg-panel px-3 py-2"
                      >
                        <div className="flex justify-between gap-2 font-semibold text-text">
                          <span>{t.name}</span>
                          <span className="text-light-gold">{t.percent}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink">
                          <div
                            className="h-full rounded-full bg-gold"
                            style={{ width: `${t.percent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* النافذة المنبثقة لتعديل النتيجة */}
      {selectedAttempt && (
        <EditResultModal
          isOpen={!!selectedAttempt}
          onClose={() => setSelectedAttempt(null)}
          onSuccess={handleModifySuccess}
          attemptId={selectedAttempt.attemptId}
          candidateName={data.examineeName}
          examTitle={selectedAttempt.examTitle}
          category={selectedAttempt.category}
          currentPercent={selectedAttempt.percent}
          currentScore={selectedAttempt.score}
          currentMaxScore={selectedAttempt.maxScore}
        />
      )}
    </div>
  )
}
