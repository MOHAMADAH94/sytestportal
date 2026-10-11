import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiChangePassword } from '../api/client';
import { useAuth } from '../auth/AuthContext';
export function ChangePasswordPage() {
    const { user, setUser, logout } = useAuth();
    const navigate = useNavigate();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    if (!user)
        return _jsx(Navigate, { to: "/login", replace: true });
    if (user.role === 'examinee')
        return _jsx(Navigate, { to: "/", replace: true });
    if (user.role === 'admin' && user.username === 'admin')
        return _jsx(Navigate, { to: "/admin/passwords", replace: true });
    const currentUser = user;
    async function submit(event) {
        event.preventDefault();
        if (newPassword !== confirm)
            return setError('تأكيد كلمة المرور غير مطابق');
        setSaving(true);
        setError('');
        try {
            const result = await apiChangePassword(currentUser.token, currentPassword, newPassword);
            setUser({ ...currentUser, token: result.token, mustRotatePassword: false });
            navigate('/admin', { replace: true });
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'تعذر تغيير كلمة المرور');
        }
        finally {
            setSaving(false);
        }
    }
    return _jsx("main", { className: "mx-auto max-w-lg py-8", children: _jsxs("section", { className: "surface-card rounded-3xl p-6 sm:p-9", children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631" }), _jsx("p", { className: "mt-2 text-sm text-mute", children: "\u064A\u0645\u0643\u0646\u0643 \u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0633\u0627\u0628 \u0641\u064A \u0623\u064A \u0648\u0642\u062A. \u064A\u062C\u0628 \u0623\u0644\u0627 \u062A\u0642\u0644 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u0639\u0646 14 \u0645\u062D\u0631\u0641\u064B\u0627 \u0648\u062A\u062D\u062A\u0648\u064A \u062D\u0631\u0641\u064B\u0627 \u0648\u0631\u0642\u0645\u064B\u0627 \u0648\u0631\u0645\u0632\u064B\u0627." }), _jsxs("form", { onSubmit: submit, className: "mt-6 space-y-4", children: [_jsxs("label", { className: "block text-sm font-bold", children: ["\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629", _jsx("input", { type: "password", autoComplete: "current-password", required: true, value: currentPassword, onChange: (e) => setCurrentPassword(e.target.value), className: "mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text" })] }), _jsxs("label", { className: "block text-sm font-bold", children: ["\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629", _jsx("input", { type: "password", autoComplete: "new-password", minLength: 14, required: true, value: newPassword, onChange: (e) => setNewPassword(e.target.value), className: "mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text" })] }), _jsxs("label", { className: "block text-sm font-bold", children: ["\u062A\u0623\u0643\u064A\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", _jsx("input", { type: "password", autoComplete: "new-password", minLength: 14, required: true, value: confirm, onChange: (e) => setConfirm(e.target.value), className: "mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text" })] }), error && _jsx("p", { role: "alert", className: "rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error", children: error }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { disabled: saving, className: "rounded-xl bg-gold px-5 py-3 font-bold text-ink disabled:opacity-50", children: saving ? 'جارٍ الحفظ…' : 'حفظ' }), _jsx("button", { type: "button", onClick: () => navigate(-1), className: "rounded-xl border border-line px-5 py-3 text-mute", children: "\u0625\u0644\u063A\u0627\u0621" }), _jsx("button", { type: "button", onClick: () => { logout(); navigate('/login'); }, className: "rounded-xl border border-line px-5 py-3 text-mute", children: "\u062E\u0631\u0648\u062C" })] })] })] }) });
}
