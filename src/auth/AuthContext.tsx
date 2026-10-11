import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  AUTH_INVALID_EVENT,
  COOKIE_SESSION,
  apiValidateSession,
  apiLogout,
  clearSession,
  loadSession,
  saveSession,
  type SessionUser,
} from '../api/client'

interface AuthContextValue {
  user: SessionUser | null
  setUser: (user: SessionUser | null) => void
  logout: () => void
  ready: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(() => loadSession())
  const [ready, setReady] = useState(false)

  const setUser = useCallback((next: SessionUser | null) => {
    if (next) saveSession(next)
    else clearSession()
    setUserState(next ? { ...next, token: COOKIE_SESSION } : null)
  }, [])

  const logout = useCallback(() => {
    void apiLogout().catch(() => {})
    setUser(null)
  }, [setUser])

  useEffect(() => {
    const onInvalid = () => setUserState(null)
    window.addEventListener(AUTH_INVALID_EVENT, onInvalid)
    return () => window.removeEventListener(AUTH_INVALID_EVENT, onInvalid)
  }, [])

  useEffect(() => {
    if (!user) return
    let stopped = false
    const renew = async () => {
      const status = await apiValidateSession(COOKIE_SESSION)
      if (!stopped && status === 'invalid') setUser(null)
    }
    const timer = window.setInterval(() => void renew(), 10 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') void renew() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, setUser])

  useEffect(() => {
    let cancelled = false
    const session = loadSession()
    if (!session?.token) {
      setUserState(null)
      setReady(true)
      return
    }

    apiValidateSession(session.token)
      .then((status) => {
        if (cancelled) return
        if (status === 'invalid') {
          clearSession()
          setUserState(null)
        } else {
          // ok أو offline: أبقِ الجلسة المحلية
          setUserState(session)
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({ user, setUser, logout, ready }),
    [user, setUser, logout, ready],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
