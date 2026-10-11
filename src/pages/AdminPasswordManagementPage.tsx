import { KeyRound, Plus, UserCheck, UserX, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  apiCommittee,
  apiCreateAdminAccount,
  apiGetAdminAccounts,
  apiToggleAccountStatus,
  type SystemAccount,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { ExamCategory, OralRole } from '../data/types'

type History = {
  id: string
  targetType: string
  targetUsername: string
  actorType: string
  actorUsername: string
  action: string
  reason?: string
  changedAt: string
}

const field = 'w-full rounded-xl border border-line bg-panel px-3 py-2 text-text text-sm focus:border-gold outline-none'
const button = 'rounded-xl border border-line px-4 py-2 text-sm font-bold hover:border-gold transition disabled:opacity-40'

export function AdminPasswordManagementPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'accounts' | 'passwords'>('accounts')
  const [accounts, setAccounts] = useState<SystemAccount[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all')

  // Password reset state
  const [selected, setSelected] = useState<SystemAccount | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('إعادة ضبط بسبب نسيان كلمة المرور')

  // New account creation state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newCategory, setNewCategory] = useState<ExamCategory>('theory')
  const [newTheoryTrack, setNewTheoryTrack] = useState<'general' | 'office'>('general')
  const [newOralRole, setNewOralRole] = useState<OralRole>('technician')
  const [newSpecialization, setNewSpecialization] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    if (!user) return
    try {
      const [accRes, histRes] = await Promise.all([
        apiGetAdminAccounts(user.token),
        apiCommittee<{ history: History[] }>(user.token, '/admin/password-history'),
      ])
      setAccounts(accRes.all || [])
      setHistory(histRes.history || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل الحسابات')
    }
  }

  useEffect(() => {
    void refresh()
  }, [user?.token])

  const filtered = useMemo(() => {
    return accounts.filter((acc) => {
      const matchQuery = `${acc.username} ${acc.label || ''} ${acc.specialization || ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? acc.active
            : !acc.active
      return matchQuery && matchStatus
    })
  }, [accounts, query, statusFilter])

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/admin" replace />

  async function handleToggleStatus(acc: SystemAccount) {
    if (!user) return
    const newStatus = !acc.active
    const confirmMsg = newStatus
      ? `هل أنت متأكد من إعادة تفعيل حساب «${acc.username}»؟`
      : `هل أنت متأكد من تعطيل حساب «${acc.username}»؟ لن يتمكن من تسجيل الدخول.`
    if (!window.confirm(confirmMsg)) return

    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiToggleAccountStatus(
        user.token,
        acc.accountType,
        acc.id,
        newStatus,
        newStatus ? 'تفعيل يدوي من قبل المسؤول' : 'تعطيل الحساب من لوحة الإدارة',
      )
      setNotice(`تم ${newStatus ? 'تفعيل' : 'تعطيل'} حساب «${acc.username}» بنجاح.`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تغيير حالة الحساب')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (newPassword.length < 14) {
      setError('كلمة المرور يجب أن لا تقل عن 14 محرفاً')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiCreateAdminAccount(user.token, {
        username: newUsername.trim(),
        password: newPassword,
        label: newLabel.trim() || undefined,
        category: newCategory,
        theoryTrack: newCategory === 'theory' ? newTheoryTrack : null,
        oralRole: newCategory === 'oral' ? newOralRole : null,
        specialization: newSpecialization.trim() || null,
        description: newDescription.trim() || undefined,
        active: true,
      })
      setNotice(`تم إنشاء حساب المشغل «${newUsername.trim()}» وتخصيصه بنجاح.`)
      setShowCreateModal(false)
      setNewUsername('')
      setNewPassword('')
      setNewLabel('')
      setNewSpecialization('')
      setNewDescription('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault()
    if (!selected) return
    if (password !== confirmation) return setError('تأكيد كلمة المرور غير مطابق')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiCommittee(
        user!.token,
        `/admin/password-accounts/${selected.accountType}/${encodeURIComponent(String(selected.id))}/reset`,
        'POST',
        { newPassword: password, reason },
      )
      setNotice(`تم تحديث كلمة مرور ${selected.username} وإلغاء جلساته السابقة بنجاح.`)
      setSelected(null)
      setPassword('')
      setConfirmation('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث كلمة المرور')
    } finally {
      setBusy(false)
    }
  }

  const typeLabel = (type: string) =>
    ({ staff: 'إدارة النظام', operator: 'مشغل / مسؤول اختصاص', committee: 'عضو لجنة' } as Record<string, string>)[type] || type
  const actionLabel = (action: string) =>
    ({ self_change: 'غيّرها صاحب الحساب', admin_reset: 'أعاد المسؤول ضبطها', developer_reset: 'غيّرها المطور محليًا' } as Record<string, string>)[action] || action

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-extrabold text-light-gold">إدارة الحسابات وكلمات المرور</h1>
        <p className="mt-2 text-sm text-mute leading-relaxed">
          إنشاء حسابات المشغلين والمتخصصين حسب المسار والتخصص، والتحكم في تفعيل أو تعطيل الحسابات، بالإضافة إلى إعادة ضبط كلمات المرور ومراجعة سجل التعديلات.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-line gap-2">
        <button
          type="button"
          onClick={() => { setActiveTab('accounts'); setError(''); setNotice('') }}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition ${
            activeTab === 'accounts'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-mute hover:text-text'
          }`}
        >
          <Users className="h-4 w-4" />
          حسابات المشغلين والتخصصات ({accounts.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('passwords'); setError(''); setNotice('') }}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition ${
            activeTab === 'passwords'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-mute hover:text-text'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          إعادة ضبط كلمات المرور والسجل
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-error/40 bg-error/10 p-3.5 text-sm text-error">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 p-3.5 text-sm text-ok">{notice}</p>}

      {activeTab === 'accounts' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <input
                className={`${field} max-w-sm`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث باسم الحساب، الصفة، أو التخصص..."
              />
              <select
                className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-text"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="all">كل الحسابات</option>
                <option value="active">الحسابات النشطة فقط</option>
                <option value="disabled">الحسابات المعطلة فقط</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink hover:bg-accent-gold transition"
            >
              <Plus className="h-4 w-4" /> إضافة مشغل / تخصص جديد
            </button>
          </div>

          {/* Accounts Grid */}
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((account) => (
              <article
                key={`${account.accountType}:${account.id}`}
                className={`rounded-2xl border p-4 transition ${
                  account.active
                    ? 'border-line bg-card'
                    : 'border-error/30 bg-error/5 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text">{account.label || account.username}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          account.active
                            ? 'bg-ok/20 text-ok border border-ok/30'
                            : 'bg-error/20 text-error border border-error/30'
                        }`}
                      >
                        {account.active ? 'نشط' : 'معطّل'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-gold">@{account.username}</p>
                    <p className="mt-1 text-xs text-mute">
                      {typeLabel(account.accountType)}
                      {account.category && ` • اختصاص: ${account.category}`}
                      {account.theoryTrack && ` (${account.theoryTrack === 'office' ? 'كتابي' : 'عام'})`}
                    </p>
                    {account.specialization && (
                      <div className="mt-2 inline-block rounded-lg bg-panel px-2.5 py-1 text-xs font-semibold text-light-gold border border-line">
                        التخصص: {account.specialization}
                      </div>
                    )}
                    {account.description && (
                      <p className="mt-2 text-xs text-text-2 line-clamp-2">{account.description}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
                  <button
                    type="button"
                    disabled={busy || account.role === 'admin'}
                    onClick={() => handleToggleStatus(account)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition border ${
                      account.active
                        ? 'border-error/40 text-error hover:bg-error/10'
                        : 'border-ok/40 text-ok hover:bg-ok/10'
                    }`}
                    title={account.role === 'admin' ? 'لا يمكن تعطيل حساب مسؤول النظام' : undefined}
                  >
                    {account.active ? (
                      <>
                        <UserX className="h-3.5 w-3.5" /> تعطيل الحساب
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-3.5 w-3.5" /> تفعيل الحساب
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-bold text-text-2 hover:border-gold hover:text-gold transition"
                    onClick={() => {
                      setSelected(account)
                      setActiveTab('passwords')
                      setError('')
                      setNotice('')
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> إعادة ضبط كلمة المرور
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* New Account Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="surface-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/40 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-light-gold">إضافة حساب مشغل / مسؤول اختصاص جديد</h2>
            <p className="mt-1 text-xs text-mute">
              أنشئ حساباً لمشرف قاعة أو متخصص يتولى تصحيح أو إدارة اختصاص ومسار معين.
            </p>

            <form onSubmit={handleCreateAccount} className="mt-5 space-y-4 text-right">
              <div>
                <label className="block text-xs font-bold text-text mb-1">اسم المستخدم (Username) *</label>
                <input
                  className={field}
                  required
                  dir="ltr"
                  pattern="[a-zA-Z0-9_\-\.]+"
                  placeholder="مثال: op_telecom_01"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text mb-1">كلمة المرور (14 محرفاً على الأقل) *</label>
                <input
                  className={field}
                  type="password"
                  required
                  minLength={14}
                  placeholder="كلمة مرور قوية ومعقدة"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text mb-1">الاسم أو الصفة الظاهرة</label>
                <input
                  className={field}
                  placeholder="مثال: م. أحمد - مشرف شبكات"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text mb-1">التصنيف الأساسي *</label>
                  <select
                    className={field}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ExamCategory)}
                  >
                    <option value="theory">اختبار عام</option>
                    <option value="oral">مقابلة شفهية</option>
                    <option value="driving">اختبار قيادة</option>
                    <option value="personality">تحليل شخصية</option>
                  </select>
                </div>

                {newCategory === 'theory' ? (
                  <div>
                    <label className="block text-xs font-bold text-text mb-1">مسار العام / الكتابي</label>
                    <select
                      className={field}
                      value={newTheoryTrack}
                      onChange={(e) => setNewTheoryTrack(e.target.value as any)}
                    >
                      <option value="general">مسار عام</option>
                      <option value="office">اختبار كتابي</option>
                    </select>
                  </div>
                ) : newCategory === 'oral' ? (
                  <div>
                    <label className="block text-xs font-bold text-text mb-1">دور المقابلة</label>
                    <select
                      className={field}
                      value={newOralRole}
                      onChange={(e) => setNewOralRole(e.target.value as any)}
                    >
                      <option value="programmer">مبرمج ونظم</option>
                      <option value="network_engineer">مهندس شبكات</option>
                      <option value="technician">فني تقني</option>
                      <option value="admin">إداري</option>
                    </select>
                  </div>
                ) : (
                  <div />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-text mb-1">التخصص الدقيق</label>
                <input
                  className={field}
                  placeholder="مثال: هندسة برمجيات، اتصالات، أمن سيبراني..."
                  value={newSpecialization}
                  onChange={(e) => setNewSpecialization(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text mb-1">وصف أو ملاحظات</label>
                <textarea
                  className={`${field} h-20 resize-none`}
                  placeholder="مهام الحساب، القاعات المشرف عليها، إلخ."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  className={button}
                  onClick={() => setShowCreateModal(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-gold px-5 py-2 text-sm font-bold text-ink hover:bg-accent-gold disabled:opacity-40"
                >
                  {busy ? 'جاري الإنشاء...' : 'إنشاء الحساب الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Tab */}
      {activeTab === 'passwords' && (
        <div className="space-y-6">
          <section className="surface-card space-y-4 rounded-2xl p-5">
            <h2 className="text-lg font-bold text-gold">اختيار حساب لإعادة ضبط كلمة المرور</h2>
            <input
              className={field}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="بحث باسم الحساب أو صاحبه..."
            />
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((account) => (
                <article
                  key={`${account.accountType}:${account.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line p-4"
                >
                  <div>
                    <p className="font-bold">{account.label || account.username}</p>
                    <p className="text-sm text-mute">
                      {account.username} • {typeLabel(account.accountType)}
                      {!account.active ? ' • معطل' : ''}
                    </p>
                  </div>
                  <button
                    className={button}
                    onClick={() => {
                      setSelected(account)
                      setError('')
                      setNotice('')
                    }}
                  >
                    إعادة ضبط
                  </button>
                </article>
              ))}
            </div>
          </section>

          {selected && (
            <form onSubmit={resetPassword} className="surface-card space-y-4 rounded-2xl p-5 border border-gold/40">
              <h2 className="text-lg font-bold text-gold">
                كلمة مرور جديدة للحساب: {selected.username} ({selected.label || typeLabel(selected.accountType)})
              </h2>
              <label className="block text-sm font-bold">
                كلمة المرور الجديدة (14 محرف على الأقل)
                <input
                  className={field}
                  type="password"
                  minLength={14}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="block text-sm font-bold">
                تأكيد كلمة المرور
                <input
                  className={field}
                  type="password"
                  minLength={14}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <label className="block text-sm font-bold">
                سبب التغيير (للتوثيق في سجل التدقيق)
                <input
                  className={field}
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="flex gap-3 pt-2">
                <button disabled={busy} className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-ink hover:bg-accent-gold disabled:opacity-40">
                  {busy ? 'جارٍ الحفظ…' : 'حفظ وإلغاء الجلسات القديمة'}
                </button>
                <button type="button" className={button} onClick={() => setSelected(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          )}

          <section className="surface-card rounded-2xl p-5">
            <h2 className="text-lg font-bold text-gold">سجل تغيير كلمات المرور (Audit Trail)</h2>
            <div className="mt-4 space-y-3">
              {history.length ? (
                history.map((entry) => (
                  <article key={entry.id} className="rounded-xl border border-line p-4 text-sm">
                    <p className="font-bold">
                      {entry.targetUsername} — {actionLabel(entry.action)}
                    </p>
                    <p className="mt-1 text-mute">
                      بواسطة: {entry.actorUsername} • {new Date(entry.changedAt).toLocaleString('ar-SA')}
                    </p>
                    {entry.reason && <p className="mt-1 text-xs text-text-2">السبب: {entry.reason}</p>}
                  </article>
                ))
              ) : (
                <p className="text-mute">لا توجد عمليات تغيير مسجلة حتى الآن.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
