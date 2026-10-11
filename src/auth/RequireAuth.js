import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
export function RequireStaff() {
    const { user, ready } = useAuth();
    if (!ready) {
        return _jsx("p", { className: "p-6 text-center text-sm text-mute", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062C\u0644\u0633\u0629..." });
    }
    if (!user || (user.role !== 'admin' && user.role !== 'operator' && user.role !== 'commander')) {
        return _jsx(Navigate, { to: user?.role?.startsWith('committee_') ? '/committees' : '/login', replace: true });
    }
    return _jsx(Outlet, {});
}
export function RequireCommittee() {
    const { user, ready } = useAuth();
    if (!ready)
        return _jsx("p", { children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062C\u0644\u0633\u0629..." });
    const committeeOperator = user?.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user.category || '');
    if (!user || (!committeeOperator && !['admin', 'committee_manager', 'committee_member'].includes(user.role)))
        return _jsx(Navigate, { to: "/", replace: true });
    return _jsx(Outlet, {});
}
export function RequireExaminee() {
    const { user, ready } = useAuth();
    if (!ready) {
        return _jsx("p", { className: "p-6 text-center text-sm text-mute", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062C\u0644\u0633\u0629..." });
    }
    if (!user || user.role !== 'examinee')
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(Outlet, {});
}
export function RequireEvaluator() {
    const { user, ready } = useAuth();
    if (!ready)
        return _jsx("p", { children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062C\u0644\u0633\u0629\u2026" });
    if (!user || !['admin', 'operator', 'commander', 'committee_manager', 'committee_member'].includes(user.role))
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(Outlet, {});
}
