import { Archive, BookOpen, ClipboardList, Home, KeyRound, Library, LogOut, MonitorPlay, Moon, Pencil, Shield, Sun, TrendingUp, UserPlus, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { CATEGORY_META, ORAL_ROLES } from '../data/types'
import { useTheme } from '../theme/ThemeContext'

export function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const isStaff = user?.role === 'admin' || user?.role === 'operator' || user?.role === 'commander'
  const isOperator = user?.role === 'operator'
  const isCommittee = !!user?.role?.startsWith('committee_')
  const isCommitteeOperator = isOperator && ['theory', 'oral', 'driving', 'personality'].includes(user?.category || '')
  const isSecurityOperator = isOperator && user?.category === 'security'

  const staffLinks = isSecurityOperator
    ? [
        { to: '/admin/security', label: 'مراجعة الأمن', icon: Shield, end: true },
      ]
    : isCommitteeOperator
    ? [
        { to: '/committees', label: 'لجنتي', icon: Users, end: true },
        { to: '/banks', label: 'بنك الأسئلة', icon: Library },
        { to: '/admin/oral-archive', label: 'أرشيف التقييمات', icon: Archive },
      ]
    : [
        ...(user?.role === 'admin' || user?.role === 'commander'
          ? [{ to: '/admin/briefing', label: 'تقرير القيادة', icon: TrendingUp }]
          : []),
        { to: '/admin', label: 'اختباراتي', icon: Shield, end: true },
        ...(user?.role === 'admin' ? [{ to: '/admin/security', label: 'الأمن العسكري', icon: Shield }] : []),
        { to: '/admin/live', label: 'المراقبة', icon: MonitorPlay },
        ...(user?.role === 'admin' ? [{ to: '/admin/applicants', label: 'المتقدمون', icon: UserPlus }] : []),
        ...(user?.role === 'admin' ? [{ to: '/admin/corrections', label: 'تصحيح', icon: Pencil }] : []),
        ...(user?.role === 'admin' ? [{ to: '/committees', label: 'اللجان', icon: Users }] : []),
        { to: '/admin/examinees', label: 'الممتحنون', icon: Users },
        ...(user?.role !== 'commander'
          ? [{
              to: user?.role === 'admin' ? '/admin/create' : '/committees',
              label: user?.role === 'admin' ? 'فرز' : 'إنشاء الاختبار',
              icon: ClipboardList,
            }]
          : []),
        { to: '/banks', label: 'بنك الأسئلة', icon: Library },
        { to: '/admin/oral-archive', label: 'أرشيف التقييمات', icon: Archive },
      ]


  const publicLinks = [
    { to: '/', label: 'الرئيسية', icon: Home, end: true },
    { to: '/login', label: 'تسجيل الدخول', icon: BookOpen },
  ]

  const links = isCommittee ? [{ to: '/committees', label: 'لجنة التقييم', icon: Users, end: true }] : isStaff ? staffLinks : user?.role === 'examinee' ? [] : publicLinks

  const operatorTitle =
    isOperator && user
      ? user.label ||
        (user.oralRole
          ? ORAL_ROLES.find((r) => r.id === user.oralRole)?.label
          : user.category
            ? CATEGORY_META[user.category].label
            : user.username)
      : null

  const operatorSub =
    isOperator && user?.category
      ? user.oralRole
        ? `اختبارات شفهية · ${ORAL_ROLES.find((r) => r.id === user.oralRole)?.label}`
        : CATEGORY_META[user.category].label
      : null

  const footerText = (() => {
    if (isOperator && operatorTitle) {
      return `${operatorTitle} — نتائج هذا الاختصاص فقط`
    }
    if (user?.role === 'admin') {
      return 'منصة الاختبارات — إدارة عامة لكل أنواع الاختبارات'
    }
    if (user?.role === 'commander') {
      return 'منصة الاختبارات — حساب القائد (عرض كامل + تعديل الرتب)'
    }
    if (user?.role === 'examinee') {
      return 'جلسة ممتحن — النتائج محفوظة للإدارة فقط'
    }
    return 'منصة الاختبارات — منظومة تقييم رسمية'
  })()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-40 border-b border-line/60 bg-panel/92 backdrop-blur-xl shadow-lg shadow-black/20">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 px-3 py-2 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <NavLink to={isCommittee ? '/committees' : user?.role === 'commander' ? '/admin/briefing' : isStaff ? '/admin' : '/'} className="group flex min-w-0 items-center gap-3 transition">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line/40 bg-void/60 p-1.5 shadow-[0_0_16px_rgba(193,165,118,0.18)] transition group-hover:scale-105 group-hover:border-gold/70 group-hover:shadow-[0_0_22px_rgba(193,165,118,0.35)]">
                <img
                  src="/logo.png"
                  alt="شعار المنصة"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                {isOperator ? (
                  <>
                    <div className="truncate text-base font-extrabold tracking-wide text-light-gold transition group-hover:text-accent-gold">
                      {operatorTitle}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-mute">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-ok"></span>
                      </span>
                      {operatorSub}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-base font-extrabold tracking-wide text-light-gold transition group-hover:text-accent-gold">
                      منصة الاختبارات
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-mute">
                      {user && (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75"></span>
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-ok"></span>
                        </span>
                      )}
                      {isCommittee ? `${user?.role === 'committee_manager' ? 'مدير اللجنة' : 'عضو اللجنة'}: ${user?.label}` : user?.role === 'admin'
                        ? `المسؤول العام: ${user.username}`
                        : user?.role === 'commander'
                          ? `القائد: ${user.username}`
                        : user?.role === 'examinee'
                          ? `الممتحن: ${user.examineeName}`
                          : 'منظومة التقييم والاختبارات الرسمية'}
                    </div>
                  </>
                )}
              </div>
            </NavLink>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={toggleTheme}
                title={theme === 'light' ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح'}
                aria-label={theme === 'light' ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح'}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line/60 bg-panel-2/60 px-3 py-2 text-xs font-bold text-mute transition hover:border-gold hover:text-light-gold"
              >
                {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                <span>{theme === 'light' ? 'داكن' : 'فاتح'}</span>
              </button>
              {user && user.role !== 'examinee' && (
                <button
                  type="button"
                  onClick={() => navigate(user.role === 'admin' ? '/admin/passwords' : '/change-password')}
                  title={user.role === 'admin' ? 'إدارة كلمات المرور' : 'تغيير كلمة المرور'}
                  aria-label={user.role === 'admin' ? 'إدارة كلمات المرور' : 'تغيير كلمة المرور'}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line/60 bg-panel-2/60 px-3 py-2 text-xs font-bold text-mute transition hover:border-gold hover:text-light-gold"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>{user.role === 'admin' ? 'كلمات المرور' : 'كلمة المرور'}</span>
                </button>
              )}
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                  title="تسجيل الخروج"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs font-bold text-error transition hover:border-error/70 hover:bg-error/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>خروج</span>
                </button>
              )}
            </div>
          </div>

          {links.length > 0 && (
            <nav className="flex flex-wrap items-center gap-1 pb-1">
              {links.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all sm:text-sm ${
                      isActive
                        ? 'bg-gradient-to-r from-gold via-accent-gold to-gold text-ink shadow-[0_0_14px_rgba(193,165,118,0.35)]'
                        : 'border border-transparent text-mute hover:border-line/40 hover:bg-card hover:text-light-gold'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="no-print border-t border-line bg-panel/80 py-4 text-center text-sm text-mute">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4">
          <img src="/logo.png" alt="" className="h-6 w-6 object-contain opacity-80" />
          {footerText}
        </div>
      </footer>
    </div>
  )
}
