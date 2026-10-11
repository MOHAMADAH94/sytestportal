import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { KeyRound, Plus, UserCheck, UserX, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiCommittee, apiCreateAdminAccount, apiGetAdminAccounts, apiToggleAccountStatus, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
const field = 'w-full rounded-xl border border-line bg-panel px-3 py-2 text-text text-sm focus:border-gold outline-none';
const button = 'rounded-xl border border-line px-4 py-2 text-sm font-bold hover:border-gold transition disabled:opacity-40';
export function AdminPasswordManagementPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('accounts');
    const [accounts, setAccounts] = useState([]);
    const [history, setHistory] = useState([]);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    // Password reset state
    const [selected, setSelected] = useState(null);
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [reason, setReason] = useState('إعادة ضبط بسبب نسيان كلمة المرور');
    // New account creation state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newCategory, setNewCategory] = useState('theory');
    const [newTheoryTrack, setNewTheoryTrack] = useState('general');
    const [newOralRole, setNewOralRole] = useState('technician');
    const [newSpecialization, setNewSpecialization] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    async function refresh() {
        if (!user)
            return;
        try {
            const [accRes, histRes] = await Promise.all([
                apiGetAdminAccounts(user.token),
                apiCommittee(user.token, '/admin/password-history'),
            ]);
            setAccounts(accRes.all || []);
            setHistory(histRes.history || []);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'تعذر تحميل الحسابات');
        }
    }
    useEffect(() => {
        void refresh();
    }, [user?.token]);
    const filtered = useMemo(() => {
        return accounts.filter((acc) => {
            const matchQuery = `${acc.username} ${acc.label || ''} ${acc.specialization || ''}`
                .toLowerCase()
                .includes(query.trim().toLowerCase());
            const matchStatus = statusFilter === 'all'
                ? true
                : statusFilter === 'active'
                    ? acc.active
                    : !acc.active;
            return matchQuery && matchStatus;
        });
    }, [accounts, query, statusFilter]);
    if (!user)
        return _jsx(Navigate, { to: "/login", replace: true });
    if (user.role !== 'admin')
        return _jsx(Navigate, { to: "/admin", replace: true });
    async function handleToggleStatus(acc) {
        if (!user)
            return;
        const newStatus = !acc.active;
        const confirmMsg = newStatus
            ? `هل أنت متأكد من إعادة تفعيل حساب «${acc.username}»؟`
            : `هل أنت متأكد من تعطيل حساب «${acc.username}»؟ لن يتمكن من تسجيل الدخول.`;
        if (!window.confirm(confirmMsg))
            return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await apiToggleAccountStatus(user.token, acc.accountType, acc.id, newStatus, newStatus ? 'تفعيل يدوي من قبل المسؤول' : 'تعطيل الحساب من لوحة الإدارة');
            setNotice(`تم ${newStatus ? 'تفعيل' : 'تعطيل'} حساب «${acc.username}» بنجاح.`);
            await refresh();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل تغيير حالة الحساب');
        }
        finally {
            setBusy(false);
        }
    }
    async function handleCreateAccount(e) {
        e.preventDefault();
        if (!user)
            return;
        if (newPassword.length < 14) {
            setError('كلمة المرور يجب أن لا تقل عن 14 محرفاً');
            return;
        }
        setBusy(true);
        setError('');
        setNotice('');
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
            });
            setNotice(`تم إنشاء حساب المشغل «${newUsername.trim()}» وتخصيصه بنجاح.`);
            setShowCreateModal(false);
            setNewUsername('');
            setNewPassword('');
            setNewLabel('');
            setNewSpecialization('');
            setNewDescription('');
            await refresh();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب');
        }
        finally {
            setBusy(false);
        }
    }
    async function resetPassword(event) {
        event.preventDefault();
        if (!selected)
            return;
        if (password !== confirmation)
            return setError('تأكيد كلمة المرور غير مطابق');
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await apiCommittee(user.token, `/admin/password-accounts/${selected.accountType}/${encodeURIComponent(String(selected.id))}/reset`, 'POST', { newPassword: password, reason });
            setNotice(`تم تحديث كلمة مرور ${selected.username} وإلغاء جلساته السابقة بنجاح.`);
            setSelected(null);
            setPassword('');
            setConfirmation('');
            await refresh();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'تعذر تحديث كلمة المرور');
        }
        finally {
            setBusy(false);
        }
    }
    const typeLabel = (type) => ({ staff: 'إدارة النظام', operator: 'مشغل / مسؤول اختصاص', committee: 'عضو لجنة' }[type] || type);
    const actionLabel = (action) => ({ self_change: 'غيّرها صاحب الحساب', admin_reset: 'أعاد المسؤول ضبطها', developer_reset: 'غيّرها المطور محليًا' }[action] || action);
    return (_jsxs("div", { className: "space-y-6", dir: "rtl", children: [_jsxs("header", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0648\u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0631\u0648\u0631" }), _jsx("p", { className: "mt-2 text-sm text-mute leading-relaxed", children: "\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0634\u063A\u0644\u064A\u0646 \u0648\u0627\u0644\u0645\u062A\u062E\u0635\u0635\u064A\u0646 \u062D\u0633\u0628 \u0627\u0644\u0645\u0633\u0627\u0631 \u0648\u0627\u0644\u062A\u062E\u0635\u0635\u060C \u0648\u0627\u0644\u062A\u062D\u0643\u0645 \u0641\u064A \u062A\u0641\u0639\u064A\u0644 \u0623\u0648 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A\u060C \u0628\u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637 \u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0631\u0648\u0631 \u0648\u0645\u0631\u0627\u062C\u0639\u0629 \u0633\u062C\u0644 \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A." })] }), _jsxs("div", { className: "flex border-b border-line gap-2", children: [_jsxs("button", { type: "button", onClick: () => { setActiveTab('accounts'); setError(''); setNotice(''); }, className: `flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'accounts'
                            ? 'border-gold text-gold bg-gold/5'
                            : 'border-transparent text-mute hover:text-text'}`, children: [_jsx(Users, { className: "h-4 w-4" }), "\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0634\u063A\u0644\u064A\u0646 \u0648\u0627\u0644\u062A\u062E\u0635\u0635\u0627\u062A (", accounts.length, ")"] }), _jsxs("button", { type: "button", onClick: () => { setActiveTab('passwords'); setError(''); setNotice(''); }, className: `flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'passwords'
                            ? 'border-gold text-gold bg-gold/5'
                            : 'border-transparent text-mute hover:text-text'}`, children: [_jsx(KeyRound, { className: "h-4 w-4" }), "\u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637 \u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0631\u0648\u0631 \u0648\u0627\u0644\u0633\u062C\u0644"] })] }), error && _jsx("p", { role: "alert", className: "rounded-xl border border-error/40 bg-error/10 p-3.5 text-sm text-error", children: error }), notice && _jsx("p", { role: "status", className: "rounded-xl border border-ok/40 bg-ok/10 p-3.5 text-sm text-ok", children: notice }), activeTab === 'accounts' && (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex flex-1 flex-wrap items-center gap-3", children: [_jsx("input", { className: `${field} max-w-sm`, value: query, onChange: (event) => setQuery(event.target.value), placeholder: "\u0628\u062D\u062B \u0628\u0627\u0633\u0645 \u0627\u0644\u062D\u0633\u0627\u0628\u060C \u0627\u0644\u0635\u0641\u0629\u060C \u0623\u0648 \u0627\u0644\u062A\u062E\u0635\u0635..." }), _jsxs("select", { className: "rounded-xl border border-line bg-panel px-3 py-2 text-sm text-text", value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), children: [_jsx("option", { value: "all", children: "\u0643\u0644 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A" }), _jsx("option", { value: "active", children: "\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0646\u0634\u0637\u0629 \u0641\u0642\u0637" }), _jsx("option", { value: "disabled", children: "\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0639\u0637\u0644\u0629 \u0641\u0642\u0637" })] })] }), _jsxs("button", { type: "button", onClick: () => setShowCreateModal(true), className: "inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink hover:bg-accent-gold transition", children: [_jsx(Plus, { className: "h-4 w-4" }), " \u0625\u0636\u0627\u0641\u0629 \u0645\u0634\u063A\u0644 / \u062A\u062E\u0635\u0635 \u062C\u062F\u064A\u062F"] })] }), _jsx("div", { className: "grid gap-3 md:grid-cols-2", children: filtered.map((account) => (_jsxs("article", { className: `rounded-2xl border p-4 transition ${account.active
                                ? 'border-line bg-card'
                                : 'border-error/30 bg-error/5 opacity-80'}`, children: [_jsx("div", { className: "flex items-start justify-between gap-2", children: _jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-bold text-text", children: account.label || account.username }), _jsx("span", { className: `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${account.active
                                                            ? 'bg-ok/20 text-ok border border-ok/30'
                                                            : 'bg-error/20 text-error border border-error/30'}`, children: account.active ? 'نشط' : 'معطّل' })] }), _jsxs("p", { className: "mt-1 font-mono text-xs text-gold", children: ["@", account.username] }), _jsxs("p", { className: "mt-1 text-xs text-mute", children: [typeLabel(account.accountType), account.category && ` • اختصاص: ${account.category}`, account.theoryTrack && ` (${account.theoryTrack === 'office' ? 'كتابي' : 'عام'})`] }), account.specialization && (_jsxs("div", { className: "mt-2 inline-block rounded-lg bg-panel px-2.5 py-1 text-xs font-semibold text-light-gold border border-line", children: ["\u0627\u0644\u062A\u062E\u0635\u0635: ", account.specialization] })), account.description && (_jsx("p", { className: "mt-2 text-xs text-text-2 line-clamp-2", children: account.description }))] }) }), _jsxs("div", { className: "mt-4 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3", children: [_jsx("button", { type: "button", disabled: busy || account.role === 'admin', onClick: () => handleToggleStatus(account), className: `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition border ${account.active
                                                ? 'border-error/40 text-error hover:bg-error/10'
                                                : 'border-ok/40 text-ok hover:bg-ok/10'}`, title: account.role === 'admin' ? 'لا يمكن تعطيل حساب مسؤول النظام' : undefined, children: account.active ? (_jsxs(_Fragment, { children: [_jsx(UserX, { className: "h-3.5 w-3.5" }), " \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628"] })) : (_jsxs(_Fragment, { children: [_jsx(UserCheck, { className: "h-3.5 w-3.5" }), " \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628"] })) }), _jsxs("button", { type: "button", className: "inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-bold text-text-2 hover:border-gold hover:text-gold transition", onClick: () => {
                                                setSelected(account);
                                                setActiveTab('passwords');
                                                setError('');
                                                setNotice('');
                                            }, children: [_jsx(KeyRound, { className: "h-3.5 w-3.5" }), " \u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631"] })] })] }, `${account.accountType}:${account.id}`))) })] })), showCreateModal && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4", children: _jsxs("div", { className: "surface-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/40 p-6 shadow-2xl", children: [_jsx("h2", { className: "text-xl font-bold text-light-gold", children: "\u0625\u0636\u0627\u0641\u0629 \u062D\u0633\u0627\u0628 \u0645\u0634\u063A\u0644 / \u0645\u0633\u0624\u0648\u0644 \u0627\u062E\u062A\u0635\u0627\u0635 \u062C\u062F\u064A\u062F" }), _jsx("p", { className: "mt-1 text-xs text-mute", children: "\u0623\u0646\u0634\u0626 \u062D\u0633\u0627\u0628\u0627\u064B \u0644\u0645\u0634\u0631\u0641 \u0642\u0627\u0639\u0629 \u0623\u0648 \u0645\u062A\u062E\u0635\u0635 \u064A\u062A\u0648\u0644\u0649 \u062A\u0635\u062D\u064A\u062D \u0623\u0648 \u0625\u062F\u0627\u0631\u0629 \u0627\u062E\u062A\u0635\u0627\u0635 \u0648\u0645\u0633\u0627\u0631 \u0645\u0639\u064A\u0646." }), _jsxs("form", { onSubmit: handleCreateAccount, className: "mt-5 space-y-4 text-right", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-text mb-1", children: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 (Username) *" }), _jsx("input", { className: field, required: true, dir: "ltr", pattern: "[a-zA-Z0-9_\\-\\.]+", placeholder: "\u0645\u062B\u0627\u0644: op_telecom_01", value: newUsername, onChange: (e) => setNewUsername(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-text mb-1", children: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 (14 \u0645\u062D\u0631\u0641\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644) *" }), _jsx("input", { className: field, type: "password", required: true, minLength: 14, placeholder: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0642\u0648\u064A\u0629 \u0648\u0645\u0639\u0642\u062F\u0629", value: newPassword, onChange: (e) => setNewPassword(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-text mb-1", children: "\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0635\u0641\u0629 \u0627\u0644\u0638\u0627\u0647\u0631\u0629" }), _jsx("input", { className: field, placeholder: "\u0645\u062B\u0627\u0644: \u0645. \u0623\u062D\u0645\u062F - \u0645\u0634\u0631\u0641 \u0634\u0628\u0643\u0627\u062A", value: newLabel, onChange: (e) => setNewLabel(e.target.value) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-text mb-1", children: "\u0627\u0644\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0623\u0633\u0627\u0633\u064A *" }), _jsxs("select", { className: field, value: newCategory, onChange: (e) => setNewCategory(e.target.value), children: [_jsx("option", { value: "theory", children: "\u0627\u062E\u062A\u0628\u0627\u0631 \u0639\u0627\u0645" }), _jsx("option", { value: "oral", children: "\u0645\u0642\u0627\u0628\u0644\u0629 \u0634\u0641\u0647\u064A\u0629" }), _jsx("option", { value: "driving", children: "\u0627\u062E\u062A\u0628\u0627\u0631 \u0642\u064A\u0627\u062F\u0629" }), _jsx("option", { value: "personality", children: "\u062A\u062D\u0644\u064A\u0644 \u0634\u062E\u0635\u064A\u0629" })] })] }), newCategory === 'theory' ? (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-text mb-1", children: "\u0645\u0633\u0627\u0631 \u0627\u0644\u0639\u0627\u0645 / \u0627\u0644\u0643\u062A\u0627\u0628\u064A" }), _jsxs("select", { className: field, value: newTheoryTrack, onChange: (e) => setNewTheoryTrack(e.target.value), children: [_jsx("option", { value: "general", children: "\u0645\u0633\u0627\u0631 \u0639\u0627\u0645" }), _jsx("option", { value: "office", children: "\u0627\u062E\u062A\u0628\u0627\u0631 \u0643\u062A\u0627\u0628\u064A" })] })] })) : newCategory === 'oral' ? (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-text mb-1", children: "\u062F\u0648\u0631 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629" }), _jsxs("select", { className: field, value: newOralRole, onChange: (e) => setNewOralRole(e.target.value), children: [_jsx("option", { value: "programmer", children: "\u0645\u0628\u0631\u0645\u062C \u0648\u0646\u0638\u0645" }), _jsx("option", { value: "network_engineer", children: "\u0645\u0647\u0646\u062F\u0633 \u0634\u0628\u0643\u0627\u062A" }), _jsx("option", { value: "technician", children: "\u0641\u0646\u064A \u062A\u0642\u0646\u064A" }), _jsx("option", { value: "admin", children: "\u0625\u062F\u0627\u0631\u064A" })] })] })) : (_jsx("div", {}))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-text mb-1", children: "\u0627\u0644\u062A\u062E\u0635\u0635 \u0627\u0644\u062F\u0642\u064A\u0642" }), _jsx("input", { className: field, placeholder: "\u0645\u062B\u0627\u0644: \u0647\u0646\u062F\u0633\u0629 \u0628\u0631\u0645\u062C\u064A\u0627\u062A\u060C \u0627\u062A\u0635\u0627\u0644\u0627\u062A\u060C \u0623\u0645\u0646 \u0633\u064A\u0628\u0631\u0627\u0646\u064A...", value: newSpecialization, onChange: (e) => setNewSpecialization(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-text mb-1", children: "\u0648\u0635\u0641 \u0623\u0648 \u0645\u0644\u0627\u062D\u0638\u0627\u062A" }), _jsx("textarea", { className: `${field} h-20 resize-none`, placeholder: "\u0645\u0647\u0627\u0645 \u0627\u0644\u062D\u0633\u0627\u0628\u060C \u0627\u0644\u0642\u0627\u0639\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0641 \u0639\u0644\u064A\u0647\u0627\u060C \u0625\u0644\u062E.", value: newDescription, onChange: (e) => setNewDescription(e.target.value) })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-3", children: [_jsx("button", { type: "button", className: button, onClick: () => setShowCreateModal(false), children: "\u0625\u0644\u063A\u0627\u0621" }), _jsx("button", { type: "submit", disabled: busy, className: "rounded-xl bg-gold px-5 py-2 text-sm font-bold text-ink hover:bg-accent-gold disabled:opacity-40", children: busy ? 'جاري الإنشاء...' : 'إنشاء الحساب الآن' })] })] })] }) })), activeTab === 'passwords' && (_jsxs("div", { className: "space-y-6", children: [_jsxs("section", { className: "surface-card space-y-4 rounded-2xl p-5", children: [_jsx("h2", { className: "text-lg font-bold text-gold", children: "\u0627\u062E\u062A\u064A\u0627\u0631 \u062D\u0633\u0627\u0628 \u0644\u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631" }), _jsx("input", { className: field, value: query, onChange: (event) => setQuery(event.target.value), placeholder: "\u0628\u062D\u062B \u0628\u0627\u0633\u0645 \u0627\u0644\u062D\u0633\u0627\u0628 \u0623\u0648 \u0635\u0627\u062D\u0628\u0647..." }), _jsx("div", { className: "grid gap-3 md:grid-cols-2", children: filtered.map((account) => (_jsxs("article", { className: "flex items-center justify-between gap-3 rounded-xl border border-line p-4", children: [_jsxs("div", { children: [_jsx("p", { className: "font-bold", children: account.label || account.username }), _jsxs("p", { className: "text-sm text-mute", children: [account.username, " \u2022 ", typeLabel(account.accountType), !account.active ? ' • معطل' : ''] })] }), _jsx("button", { className: button, onClick: () => {
                                                setSelected(account);
                                                setError('');
                                                setNotice('');
                                            }, children: "\u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637" })] }, `${account.accountType}:${account.id}`))) })] }), selected && (_jsxs("form", { onSubmit: resetPassword, className: "surface-card space-y-4 rounded-2xl p-5 border border-gold/40", children: [_jsxs("h2", { className: "text-lg font-bold text-gold", children: ["\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062C\u062F\u064A\u062F\u0629 \u0644\u0644\u062D\u0633\u0627\u0628: ", selected.username, " (", selected.label || typeLabel(selected.accountType), ")"] }), _jsxs("label", { className: "block text-sm font-bold", children: ["\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 (14 \u0645\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644)", _jsx("input", { className: field, type: "password", minLength: 14, maxLength: 72, autoComplete: "new-password", required: true, value: password, onChange: (event) => setPassword(event.target.value) })] }), _jsxs("label", { className: "block text-sm font-bold", children: ["\u062A\u0623\u0643\u064A\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", _jsx("input", { className: field, type: "password", minLength: 14, maxLength: 72, autoComplete: "new-password", required: true, value: confirmation, onChange: (event) => setConfirmation(event.target.value) })] }), _jsxs("label", { className: "block text-sm font-bold", children: ["\u0633\u0628\u0628 \u0627\u0644\u062A\u063A\u064A\u064A\u0631 (\u0644\u0644\u062A\u0648\u062B\u064A\u0642 \u0641\u064A \u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642)", _jsx("input", { className: field, required: true, maxLength: 500, value: reason, onChange: (event) => setReason(event.target.value) })] }), _jsxs("div", { className: "flex gap-3 pt-2", children: [_jsx("button", { disabled: busy, className: "rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-ink hover:bg-accent-gold disabled:opacity-40", children: busy ? 'جارٍ الحفظ…' : 'حفظ وإلغاء الجلسات القديمة' }), _jsx("button", { type: "button", className: button, onClick: () => setSelected(null), children: "\u0625\u0644\u063A\u0627\u0621" })] })] })), _jsxs("section", { className: "surface-card rounded-2xl p-5", children: [_jsx("h2", { className: "text-lg font-bold text-gold", children: "\u0633\u062C\u0644 \u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0631\u0648\u0631 (Audit Trail)" }), _jsx("div", { className: "mt-4 space-y-3", children: history.length ? (history.map((entry) => (_jsxs("article", { className: "rounded-xl border border-line p-4 text-sm", children: [_jsxs("p", { className: "font-bold", children: [entry.targetUsername, " \u2014 ", actionLabel(entry.action)] }), _jsxs("p", { className: "mt-1 text-mute", children: ["\u0628\u0648\u0627\u0633\u0637\u0629: ", entry.actorUsername, " \u2022 ", new Date(entry.changedAt).toLocaleString('ar-SA')] }), entry.reason && _jsxs("p", { className: "mt-1 text-xs text-text-2", children: ["\u0627\u0644\u0633\u0628\u0628: ", entry.reason] })] }, entry.id)))) : (_jsx("p", { className: "text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0639\u0645\u0644\u064A\u0627\u062A \u062A\u063A\u064A\u064A\u0631 \u0645\u0633\u062C\u0644\u0629 \u062D\u062A\u0649 \u0627\u0644\u0622\u0646." })) })] })] }))] }));
}
