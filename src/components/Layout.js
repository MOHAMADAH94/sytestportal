import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Archive, BookOpen, ClipboardList, Home, KeyRound, Library, LogOut, MonitorPlay, Moon, Pencil, Shield, Sun, TrendingUp, UserPlus, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CATEGORY_META, ORAL_ROLES } from '../data/types';
import { useTheme } from '../theme/ThemeContext';
export function Layout() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const isStaff = user?.role === 'admin' || user?.role === 'operator' || user?.role === 'commander';
    const isOperator = user?.role === 'operator';
    const isCommittee = !!user?.role?.startsWith('committee_');
    const isCommitteeOperator = isOperator && ['theory', 'oral', 'driving', 'personality'].includes(user?.category || '');
    const isSecurityOperator = isOperator && user?.category === 'security';
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
            ];
    const publicLinks = [
        { to: '/', label: 'الرئيسية', icon: Home, end: true },
        { to: '/login', label: 'تسجيل الدخول', icon: BookOpen },
    ];
    const links = isCommittee ? [{ to: '/committees', label: 'لجنة التقييم', icon: Users, end: true }] : isStaff ? staffLinks : user?.role === 'examinee' ? [] : publicLinks;
    const operatorTitle = isOperator && user
        ? user.label ||
            (user.oralRole
                ? ORAL_ROLES.find((r) => r.id === user.oralRole)?.label
                : user.category
                    ? CATEGORY_META[user.category].label
                    : user.username)
        : null;
    const operatorSub = isOperator && user?.category
        ? user.oralRole
            ? `اختبارات شفهية · ${ORAL_ROLES.find((r) => r.id === user.oralRole)?.label}`
            : CATEGORY_META[user.category].label
        : null;
    const footerText = (() => {
        if (isOperator && operatorTitle) {
            return `${operatorTitle} — نتائج هذا الاختصاص فقط`;
        }
        if (user?.role === 'admin') {
            return 'منصة الاختبارات — إدارة عامة لكل أنواع الاختبارات';
        }
        if (user?.role === 'commander') {
            return 'منصة الاختبارات — حساب القائد (عرض كامل + تعديل الرتب)';
        }
        if (user?.role === 'examinee') {
            return 'جلسة ممتحن — النتائج محفوظة للإدارة فقط';
        }
        return 'منصة الاختبارات — منظومة تقييم رسمية';
    })();
    return (_jsxs("div", { className: "flex min-h-screen flex-col", children: [_jsx("header", { className: "no-print sticky top-0 z-40 border-b border-line/60 bg-panel/92 backdrop-blur-xl shadow-lg shadow-black/20", children: _jsxs("div", { className: "mx-auto flex w-full max-w-[1600px] flex-col gap-2 px-3 py-2 sm:px-5", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs(NavLink, { to: isCommittee ? '/committees' : user?.role === 'commander' ? '/admin/briefing' : isStaff ? '/admin' : '/', className: "group flex min-w-0 items-center gap-3 transition", children: [_jsx("div", { className: "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line/40 bg-void/60 p-1.5 shadow-[0_0_16px_rgba(193,165,118,0.18)] transition group-hover:scale-105 group-hover:border-gold/70 group-hover:shadow-[0_0_22px_rgba(193,165,118,0.35)]", children: _jsx("img", { src: "/logo.png", alt: "\u0634\u0639\u0627\u0631 \u0627\u0644\u0645\u0646\u0635\u0629", className: "h-full w-full object-contain" }) }), _jsx("div", { className: "min-w-0", children: isOperator ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "truncate text-base font-extrabold tracking-wide text-light-gold transition group-hover:text-accent-gold", children: operatorTitle }), _jsxs("div", { className: "flex items-center gap-1.5 text-xs text-mute", children: [_jsxs("span", { className: "relative flex h-2 w-2", children: [_jsx("span", { className: "absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75" }), _jsx("span", { className: "relative inline-flex h-2 w-2 rounded-full bg-ok" })] }), operatorSub] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-base font-extrabold tracking-wide text-light-gold transition group-hover:text-accent-gold", children: "\u0645\u0646\u0635\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A" }), _jsxs("div", { className: "flex items-center gap-1.5 text-xs text-mute", children: [user && (_jsxs("span", { className: "relative flex h-2 w-2", children: [_jsx("span", { className: "absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75" }), _jsx("span", { className: "relative inline-flex h-2 w-2 rounded-full bg-ok" })] })), isCommittee ? `${user?.role === 'committee_manager' ? 'مدير اللجنة' : 'عضو اللجنة'}: ${user?.label}` : user?.role === 'admin'
                                                                ? `المسؤول العام: ${user.username}`
                                                                : user?.role === 'commander'
                                                                    ? `القائد: ${user.username}`
                                                                    : user?.role === 'examinee'
                                                                        ? `الممتحن: ${user.examineeName}`
                                                                        : 'منظومة التقييم والاختبارات الرسمية'] })] })) })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-1.5", children: [_jsxs("button", { type: "button", onClick: toggleTheme, title: theme === 'light' ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح', "aria-label": theme === 'light' ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح', className: "inline-flex items-center gap-1.5 rounded-xl border border-line/60 bg-panel-2/60 px-3 py-2 text-xs font-bold text-mute transition hover:border-gold hover:text-light-gold", children: [theme === 'light' ? _jsx(Moon, { className: "h-3.5 w-3.5" }) : _jsx(Sun, { className: "h-3.5 w-3.5" }), _jsx("span", { children: theme === 'light' ? 'داكن' : 'فاتح' })] }), user && user.role !== 'examinee' && (_jsxs("button", { type: "button", onClick: () => navigate(user.role === 'admin' ? '/admin/passwords' : '/change-password'), title: user.role === 'admin' ? 'إدارة كلمات المرور' : 'تغيير كلمة المرور', "aria-label": user.role === 'admin' ? 'إدارة كلمات المرور' : 'تغيير كلمة المرور', className: "inline-flex items-center gap-1.5 rounded-xl border border-line/60 bg-panel-2/60 px-3 py-2 text-xs font-bold text-mute transition hover:border-gold hover:text-light-gold", children: [_jsx(KeyRound, { className: "h-3.5 w-3.5" }), _jsx("span", { children: user.role === 'admin' ? 'كلمات المرور' : 'كلمة المرور' })] })), user && (_jsxs("button", { type: "button", onClick: () => {
                                                logout();
                                                navigate('/login');
                                            }, title: "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C", className: "inline-flex items-center gap-1.5 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs font-bold text-error transition hover:border-error/70 hover:bg-error/20", children: [_jsx(LogOut, { className: "h-3.5 w-3.5" }), _jsx("span", { children: "\u062E\u0631\u0648\u062C" })] }))] })] }), links.length > 0 && (_jsx("nav", { className: "flex flex-wrap items-center gap-1 pb-1", children: links.map(({ to, label, icon: Icon, end }) => (_jsxs(NavLink, { to: to, end: end, className: ({ isActive }) => `inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all sm:text-sm ${isActive
                                    ? 'bg-gradient-to-r from-gold via-accent-gold to-gold text-ink shadow-[0_0_14px_rgba(193,165,118,0.35)]'
                                    : 'border border-transparent text-mute hover:border-line/40 hover:bg-card hover:text-light-gold'}`, children: [_jsx(Icon, { className: "h-4 w-4 shrink-0" }), _jsx("span", { children: label })] }, to))) }))] }) }), _jsx("main", { className: "mx-auto w-full max-w-6xl flex-1 px-4 py-6", children: _jsx(Outlet, {}) }), _jsx("footer", { className: "no-print border-t border-line bg-panel/80 py-4 text-center text-sm text-mute", children: _jsxs("div", { className: "mx-auto flex max-w-6xl items-center justify-center gap-3 px-4", children: [_jsx("img", { src: "/logo.png", alt: "", className: "h-6 w-6 object-contain opacity-80" }), footerText] }) })] }));
}
