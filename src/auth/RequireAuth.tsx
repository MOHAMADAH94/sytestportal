import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireStaff() {
  const { user, ready } = useAuth()
  if (!ready) {
    return <p className="p-6 text-center text-sm text-mute">جاري التحقق من الجلسة...</p>
  }
  if (!user || (user.role !== 'admin' && user.role !== 'operator' && user.role !== 'commander')) {
    return <Navigate to={user?.role?.startsWith('committee_') ? '/committees' : '/login'} replace />
  }
  return <Outlet />
}

export function RequireCommittee() {
  const { user, ready } = useAuth()
  if (!ready) return <p>جاري التحقق من الجلسة...</p>
  const committeeOperator = user?.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user.category || '')
  if (!user || (!committeeOperator && !['admin', 'committee_manager', 'committee_member'].includes(user.role))) return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireExaminee() {
  const { user, ready } = useAuth()
  if (!ready) {
    return <p className="p-6 text-center text-sm text-mute">جاري التحقق من الجلسة...</p>
  }
  if (!user || user.role !== 'examinee') return <Navigate to="/login" replace />
  return <Outlet />
}

export function RequireEvaluator() {
  const { user, ready } = useAuth()
  if (!ready) return <p>جاري التحقق من الجلسة…</p>
  if (!user || !['admin', 'operator', 'commander', 'committee_manager', 'committee_member'].includes(user.role)) return <Navigate to="/login" replace />
  return <Outlet />
}
