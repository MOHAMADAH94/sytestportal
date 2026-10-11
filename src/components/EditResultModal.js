import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AlertTriangle, CheckCircle2, History, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiGetAttemptAuditHistory, apiModifyAttemptResult, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
function formatDate(iso) {
    try {
        return new Intl.DateTimeFormat('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(iso));
    }
    catch {
        return iso;
    }
}
export function EditResultModal({ isOpen, onClose, onSuccess, attemptId, candidateName, examTitle, currentPercent, }) {
    const { user } = useAuth();
    const originalPctValue = currentPercent != null ? currentPercent : 0;
    const originalPctFormatted = `${originalPctValue.toFixed(2)}%`;
    const [newPercent, setNewPercent] = useState('');
    const [reason, setReason] = useState('');
    const [committeeReference, setCommitteeReference] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    useEffect(() => {
        if (isOpen) {
            setNewPercent('');
            setReason('');
            setCommitteeReference('');
            setError('');
            setLoading(false);
            // تحميل سجل التعديلات السابقة إن وُجد
            if (user?.token && attemptId) {
                setLoadingHistory(true);
                apiGetAttemptAuditHistory(user.token, attemptId)
                    .then((res) => {
                    setHistory(res.history || []);
                    if (res.history?.length > 0) {
                        setShowHistory(true);
                    }
                })
                    .catch(() => setHistory([]))
                    .finally(() => setLoadingHistory(false));
            }
        }
    }, [isOpen, attemptId, user?.token]);
    if (!isOpen)
        return null;
    async function handleSubmit(e) {
        e.preventDefault();
        if (!user?.token || !attemptId)
            return;
        const parsed = Number(newPercent);
        if (newPercent.trim() === '' || !Number.isFinite(parsed)) {
            setError('الرجاء إدخال النتيجة الجديدة كقيمة رقمية صحيحة');
            return;
        }
        if (parsed < 0 || parsed > 100) {
            setError('النتيجة الجديدة يجب أن تكون بين 0 و 100%');
            return;
        }
        if (currentPercent != null && Math.abs(parsed - originalPctValue) < 0.001) {
            setError('النتيجة الجديدة مطابقة للنتيجة الأصلية الحالية — لم يطرأ أي تغيير');
            return;
        }
        const trimmedReason = reason.trim();
        if (!trimmedReason || trimmedReason.length < 5) {
            setError('سبب التعديل إلزامي ويجب ألا يقل عن 5 أحرف (مثال: بناءً على قرار اللجنة...)');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await apiModifyAttemptResult(user.token, attemptId, {
                newPercent: Number(parsed.toFixed(2)),
                reason: trimmedReason,
                committeeReference: committeeReference.trim() || undefined,
            });
            onSuccess({ newPercent: res.result.newPercent });
            onClose();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل اعتماد التعديل');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm", dir: "rtl", children: _jsxs("div", { className: "relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-2xl", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between border-b border-line pb-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-extrabold text-light-gold", children: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0646\u0647\u0627\u0626\u064A\u0629" }), _jsx("p", { className: "mt-0.5 text-xs text-mute", children: examTitle })] }), _jsx("button", { type: "button", onClick: onClose, className: "rounded-lg p-1.5 text-mute transition hover:bg-card hover:text-text", "aria-label": "\u0625\u063A\u0644\u0627\u0642", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsxs("div", { className: "mb-5 rounded-xl border border-line bg-card px-4 py-3", children: [_jsx("span", { className: "text-xs font-bold text-mute", children: "\u0627\u0644\u0645\u0631\u0634\u062D:" }), _jsx("div", { className: "text-base font-extrabold text-text mt-0.5", children: candidateName })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-mute mb-1", children: "\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0623\u0635\u0644\u064A\u0629" }), _jsx("div", { className: "flex items-center justify-center rounded-xl border border-line bg-panel py-3 text-center", children: _jsx("span", { className: "text-2xl font-black tracking-wider text-text", children: originalPctFormatted }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-light-gold mb-1", children: "\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 *" }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", step: "0.01", min: "0", max: "100", required: true, value: newPercent, onChange: (e) => setNewPercent(e.target.value), placeholder: "\u0645\u062B\u0627\u0644: 90.00", className: "w-full rounded-xl border border-gold/50 bg-card py-2.5 pe-10 ps-4 text-center text-xl font-black text-text outline-none focus:border-gold focus:ring-1 focus:ring-gold" }), _jsx("span", { className: "pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-sm font-bold text-light-gold", children: "%" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-light-gold mb-1", children: "\u0633\u0628\u0628 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 *" }), _jsx("textarea", { required: true, rows: 3, value: reason, onChange: (e) => setReason(e.target.value), placeholder: "\u0628\u0646\u0627\u0621\u064B \u0639\u0644\u0649 \u0642\u0631\u0627\u0631 \u0627\u0644\u0644\u062C\u0646\u0629...", className: "w-full rounded-xl border border-line bg-card p-3 text-sm text-text outline-none transition focus:border-gold/60 focus:bg-panel" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-mute mb-1", children: "\u0642\u0631\u0627\u0631 \u0627\u0644\u0644\u062C\u0646\u0629 / \u0627\u0644\u0645\u0631\u062C\u0639" }), _jsx("input", { type: "text", value: committeeReference, onChange: (e) => setCommitteeReference(e.target.value), placeholder: "\u0645\u062D\u0636\u0631 \u0631\u0642\u0645 ............", className: "w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-text outline-none transition focus:border-gold/60 focus:bg-panel" })] }), _jsxs("div", { className: "flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3.5 text-xs leading-relaxed text-warn", children: [_jsx(AlertTriangle, { className: "h-5 w-5 shrink-0 text-warn mt-0.5" }), _jsxs("div", { children: [_jsx("span", { className: "font-bold", children: "\u062A\u0646\u0628\u064A\u0647 \u0646\u0638\u0627\u0645\u064A: " }), "\u0633\u064A\u062A\u0645 \u0627\u0644\u0627\u062D\u062A\u0641\u0627\u0638 \u0628\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0623\u0635\u0644\u064A\u0629 \u0648\u0633\u062C\u0644 \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0648\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u0627\u0644\u062F\u0627\u0626\u0645."] })] }), error && (_jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-2.5 text-xs font-bold text-error", children: error })), _jsxs("div", { className: "flex items-center justify-end gap-3 pt-2", children: [_jsx("button", { type: "button", disabled: loading, onClick: onClose, className: "rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-bold text-mute transition hover:bg-panel hover:text-text disabled:opacity-50", children: "\u0625\u0644\u063A\u0627\u0621" }), _jsx("button", { type: "submit", disabled: loading, className: "inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-2.5 text-sm font-extrabold text-ink shadow-lg shadow-gold/20 transition hover:bg-accent-gold disabled:opacity-50", children: loading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u062C\u0627\u0631\u064A \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F..."] })) : (_jsxs(_Fragment, { children: [_jsx(CheckCircle2, { className: "h-4 w-4" }), "\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062A\u0639\u062F\u064A\u0644"] })) })] })] }), loadingHistory && (_jsxs("div", { className: "mt-4 flex items-center justify-center gap-2 text-xs text-mute", children: [_jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin text-gold" }), "\u062C\u0627\u0631\u064A \u0627\u0633\u062A\u0631\u062C\u0627\u0639 \u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642..."] })), history.length > 0 && (_jsxs("div", { className: "mt-6 border-t border-line pt-4", children: [_jsxs("button", { type: "button", onClick: () => setShowHistory((v) => !v), className: "flex w-full items-center justify-between text-xs font-bold text-mute hover:text-light-gold", children: [_jsxs("span", { className: "flex items-center gap-1.5", children: [_jsx(History, { className: "h-3.5 w-3.5 text-gold" }), "\u0633\u062C\u0644 \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0627\u0644\u0633\u0627\u0628\u0642\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0646\u062A\u064A\u062C\u0629 (", history.length, ")"] }), _jsx("span", { children: showHistory ? 'إخفاء' : 'عرض' })] }), showHistory && (_jsx("div", { className: "mt-3 space-y-2.5", children: history.map((h) => (_jsxs("div", { className: "rounded-xl border border-line bg-card p-3 text-xs", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-line/50 pb-1.5 mb-1.5 font-bold", children: [_jsxs("span", { className: "text-light-gold", children: [h.originalPercent != null ? `${h.originalPercent}%` : '—', " \u2190", ' ', h.newPercent, "%"] }), _jsx("span", { className: "text-mute", children: formatDate(h.createdAt) })] }), _jsxs("div", { className: "text-text-2", children: [_jsx("span", { className: "font-bold text-mute", children: "\u0627\u0644\u0633\u0628\u0628: " }), h.reason] }), h.committeeReference && (_jsxs("div", { className: "mt-0.5 text-text-2", children: [_jsx("span", { className: "font-bold text-mute", children: "\u0627\u0644\u0645\u0631\u062C\u0639: " }), h.committeeReference] })), _jsxs("div", { className: "mt-1 text-[11px] text-mute", children: ["\u0627\u0644\u0645\u0639\u062F\u0650\u0651\u0644: ", h.modifiedByName, " (", h.modifiedByRole, ")"] })] }, h.id))) }))] }))] }) }));
}
