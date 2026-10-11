import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { apiChangePassword } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'examinee') return <Navigate to="/" replace />
  if (user.role === 'admin' && user.username === 'admin') return <Navigate to="/admin/passwords" replace />
  const currentUser = user

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (newPassword !== confirm) return setError('تأكيد كلمة المرور غير مطابق')
    setSaving(true); setError('')
    try {
      const result = await apiChangePassword(currentUser.token, currentPassword, newPassword)
      setUser({ ...currentUser, token: result.token, mustRotatePassword: false })
      navigate('/admin', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تغيير كلمة المرور')
    } finally { setSaving(false) }
  }

  return <main className="mx-auto max-w-lg py-8">
    <section className="surface-card rounded-3xl p-6 sm:p-9">
      <h1 className="text-2xl font-extrabold text-light-gold">تغيير كلمة المرور</h1>
      <p className="mt-2 text-sm text-mute">يمكنك تغيير كلمة مرور الحساب في أي وقت. يجب ألا تقل الجديدة عن 14 محرفًا وتحتوي حرفًا ورقمًا ورمزًا.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-bold">كلمة المرور الحالية<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text" /></label>
        <label className="block text-sm font-bold">كلمة المرور الجديدة<input type="password" autoComplete="new-password" minLength={14} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text" /></label>
        <label className="block text-sm font-bold">تأكيد كلمة المرور<input type="password" autoComplete="new-password" minLength={14} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text" /></label>
        {error && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error">{error}</p>}
        <div className="flex gap-3"><button disabled={saving} className="rounded-xl bg-gold px-5 py-3 font-bold text-ink disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ'}</button><button type="button" onClick={() => navigate(-1)} className="rounded-xl border border-line px-5 py-3 text-mute">إلغاء</button><button type="button" onClick={() => { logout(); navigate('/login') }} className="rounded-xl border border-line px-5 py-3 text-mute">خروج</button></div>
      </form>
    </section>
  </main>
}
