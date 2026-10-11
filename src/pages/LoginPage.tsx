import { KeyRound, LogIn, QrCode } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiLoginAdmin } from '../api/client'
import { useAuth } from '../auth/AuthContext'

/** هذه البوابة لحسابات الوصول، وتتيح أيضاً للممتحنين إدخال رمز البطاقة أو الرابط يدوياً. */
export function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [examineeInput, setExamineeInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await apiLoginAdmin(username, password)
      setUser(result)
      navigate(
        result.role?.startsWith('committee_')
          ? '/committees'
          : result.role === 'commander'
            ? '/admin/briefing'
            : '/admin',
        { replace: true },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  function handleExamineeTokenSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = examineeInput.trim()
    if (!trimmed) return
    let token = trimmed
    const enterMatch = trimmed.match(/\/enter\/([a-zA-Z0-9_-]+)/)
    if (enterMatch) {
      token = enterMatch[1]
    }
    navigate(`/enter/${encodeURIComponent(token)}`)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center py-8">
      <section className="surface-card w-full rounded-3xl p-6 sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-light-gold">بوابة تسجيل الدخول</h1>
            <p className="mt-1 text-sm text-mute">لحسابات الإدارة واللجان، مع إمكانية دخول الممتحن عبر رمز البطاقة أو الرابط.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-bold text-text">
            اسم المستخدم
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required className="mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text outline-none focus:border-gold" />
          </label>
          <label className="block text-sm font-bold text-text">
            كلمة المرور
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text outline-none focus:border-gold" />
          </label>
          {error && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error">{error}</p>}
          <button disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3.5 font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-60">
            <LogIn className="h-4 w-4" />
            {loading ? 'جارٍ التحقق…' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="mt-8 border-t border-line/60 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-light-gold">دخول الممتحن (برمز البطاقة أو الرابط)</h2>
              <p className="text-xs text-mute">إذا كنت تستخدم جهاز كمبيوتر أو قارئ باركود، ألصق الرابط أو رمز الدخول هنا.</p>
            </div>
          </div>

          <form onSubmit={handleExamineeTokenSubmit} className="mt-4 flex gap-2">
            <input
              type="text"
              placeholder="ألصق رابط البطاقة أو الرمز (enter/token...)"
              value={examineeInput}
              onChange={(e) => setExamineeInput(e.target.value)}
              className="flex-1 rounded-xl border border-line bg-void px-4 py-2.5 text-xs text-text outline-none focus:border-gold"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={!examineeInput.trim()}
              className="rounded-xl bg-gold px-4 py-2.5 text-xs font-bold text-ink hover:bg-light-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              دخول الاختبار
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

