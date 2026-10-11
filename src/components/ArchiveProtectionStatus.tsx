import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiCommittee } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function ArchiveProtectionStatus() {
  const { user } = useAuth()
  const [status, setStatus] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') return
    const refresh = () =>
      apiCommittee(user.token, '/admin/archive-protection')
        .then(setStatus)
        .catch((e) => setError(e.message))
    void refresh()
    const timer = setInterval(refresh, 60000)
    return () => clearInterval(timer)
  }, [user?.token])

  async function backup() {
    if (!user) return
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      const res = await apiCommittee(user.token, '/admin/archive-protection/backup', 'POST')
      setStatus(res)
      setOkMsg('تم إنشاء نسخة احتياطية حقيقية بنجاح والتحقق من سلامة فحص SQLite (PRAGMA integrity_check) وتطابق بصمة SHA-256.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء النسخة')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gold/40 bg-card p-5 text-sm" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-gold" />
          <h2 className="text-base font-bold text-light-gold">حماية وأمان سجل الامتحانات والنسخ الاحتياطي</h2>
        </div>
        {status?.lastSuccess && (
          <span className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/15 px-2.5 py-0.5 text-xs font-bold text-ok">
            <CheckCircle2 className="h-3.5 w-3.5" /> فحص السلامة سليم
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-text-2">
        قاعدة البيانات محمية بقيود SQL ومُشغلات أمان تمنع حذف السجلات التاريخية أو التعديل على محفوظات التدقيق.
        حذف الاختبار يحجب ظهوره ويوقفه مع بقاء الأسئلة والنتائج وسجلات التدقيق محفوظة ومؤرشفة بالكامل.
      </p>

      {user?.role === 'admin' && (
        <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-mute">حالة النسخ الاحتياطي التلقائي:</p>
              <p className={`font-semibold ${status?.lastSuccess ? 'text-ok' : 'text-warn'}`}>
                {status?.lastSuccess
                  ? `آخر نسخة سليمة: ${new Date(status.lastSuccess.createdAt).toLocaleString('ar-SA')}`
                  : 'جارٍ التحقق من حالة النسخ الاحتياطية…'}
              </p>
            </div>
            {status?.lastSuccess?.sha256 && (
              <div className="font-mono text-[11px] text-mute" dir="ltr">
                SHA-256: {status.lastSuccess.sha256.slice(0, 16)}...
              </div>
            )}
          </div>

          {status?.lastSuccess?.archiveCount != null && (
            <p className="text-xs text-text-2">
              عدد السجلات المؤرشفة في النسخة الأخيرة: <strong>{status.lastSuccess.archiveCount}</strong> سجل.
            </p>
          )}

          <div className="border-t border-line/60 pt-2 text-xs text-mute space-y-1">
            <p>• نسخ تلقائية عند تغير البيانات خلال دقيقة، ونسخة إجبارية قبل أي عملية حذف.</p>
            {status?.mirrorDirectory ? (
              <p className="text-ok">
                ✓ نسخة إضافية متزامنة في: <span className="break-all font-mono" dir="ltr">{status.mirrorDirectory}</span>
                {status.encryptedExternalCopy && ' (مشفرة بـ AES-256-GCM)'}
              </p>
            ) : (
              <p className="text-warn">! لم تُضبط وجهة خارجية إضافية عبر متغير ARCHIVE_BACKUP_MIRROR_DIR.</p>
            )}
            {status?.directory && (
              <p>
                مجلد النسخ الأساسي: <span className="break-all font-mono text-[11px]" dir="ltr">{status.directory}</span>
              </p>
            )}
          </div>

          {error && <p role="alert" className="rounded-lg bg-error/10 p-2.5 text-xs text-error">{error}</p>}
          {okMsg && <p role="status" className="rounded-lg bg-ok/10 p-2.5 text-xs text-ok">{okMsg}</p>}

          <div className="pt-2">
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-gold/15 border border-gold/40 px-4 py-2 text-xs font-bold text-gold hover:bg-gold hover:text-ink transition disabled:opacity-50"
              disabled={busy || status?.busy}
              onClick={() => void backup()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy || status?.busy ? 'animate-spin' : ''}`} />
              {busy || status?.busy ? 'جارٍ إنشاء النسخة والتحقق من سلامتها…' : 'إنشاء نسخة احتياطية حقيقية وفحصها الآن'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export function ArchiveVersions({ id }: { id: string }) {
  const { user } = useAuth()
  const [versions, setVersions] = useState<any[] | null>(null)
  const [error, setError] = useState('')
  return (
    <div className="mb-4 rounded-xl border border-line p-3" dir="rtl">
      <button
        className="text-xs font-bold text-gold underline hover:text-light-gold"
        onClick={() =>
          user &&
          apiCommittee<any[]>(user.token, '/admin/assessment-archive/' + encodeURIComponent(id) + '/versions')
            .then(setVersions)
            .catch((e) => setError(e.message))
        }
      >
        عرض تاريخ التعديلات والنسخ المحفوظة للنتيجة
      </button>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
      {versions?.map((v, i) => (
        <p className="mt-2 text-xs text-text-2" key={v.id}>
          {i === 0 ? 'النسخة الأصلية عند الإدخال' : 'تعديل موثق في الأرشيف'} — الدرجة: {v.score}/{v.maxScore} (
          {v.percent != null ? `${v.percent}%` : '—'}) — التاريخ: {new Date(v.recordedAt).toLocaleString('ar-SA')}
        </p>
      ))}
    </div>
  )
}
