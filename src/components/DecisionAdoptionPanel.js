import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { apiAdoptExamineeDecision, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { STATUS_LABELS_AR } from '../../shared/decisionRules.js';
const STATUSES = ['qualified', 'conditional', 'not_qualified', 'incomplete'];
export function DecisionAdoptionPanel({ decision, onAdopted }) {
    const { user } = useAuth();
    const canAdopt = user?.role === 'admin' || user?.role === 'commander';
    const [adoptedStatus, setAdoptedStatus] = useState(decision.status);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    if (!canAdopt || !decision.applicantId)
        return null;
    const disagree = adoptedStatus !== decision.status;
    const adoption = decision.adoption;
    async function submit() {
        if (!user?.token || !decision.applicantId)
            return;
        setBusy(true);
        setError('');
        try {
            await apiAdoptExamineeDecision(user.token, decision.applicantId, {
                adoptedStatus,
                reason,
            });
            setReason('');
            onAdopted();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر اعتماد القرار');
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("section", { className: "space-y-3 rounded-2xl border border-gold/35 bg-card p-5", dir: "rtl", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-extrabold text-gold", children: "\u062E\u062A\u0645 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0631\u0633\u0645\u064A" }), _jsx("p", { className: "mt-1 text-xs text-mute", children: "\u064A\u062B\u0628\u0651\u062A \u0644\u0642\u0637\u0629 \u0627\u0644\u062A\u0648\u0635\u064A\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629. \u0644\u0627 \u064A\u063A\u064A\u0651\u0631 \u062F\u0631\u062C\u0627\u062A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631. \u0623\u064A \u062A\u0639\u062F\u064A\u0644 \u0644\u0627\u062D\u0642 \u0644\u0644\u0646\u062A\u064A\u062C\u0629 \u064A\u0638\u0647\u0631 \u0643\u0627\u062E\u062A\u0644\u0627\u0641 \u0639\u0646 \u0627\u0644\u0644\u0642\u0637\u0629." })] }), adoption && (_jsxs("div", { className: "rounded-xl border border-line/70 bg-panel/60 px-4 py-3 text-sm", children: [_jsxs("p", { className: "font-bold text-light-gold", children: ["\u0645\u0639\u062A\u0645\u062F: ", adoption.adoptedLabelAr, adoption.agreed ? ' — مطابق للتوصية' : ` — مخالف لتوصية ${adoption.recommendedLabelAr}`] }), _jsxs("p", { className: "mt-1 text-xs text-mute", children: [adoption.adoptedByName, " \u00B7 ", new Date(adoption.adoptedAt).toLocaleString('ar'), adoption.compositePercent != null ? ` · لقطة المركّبة ${adoption.compositePercent}%` : ''] }), adoption.reason && _jsxs("p", { className: "mt-1 text-xs text-text", children: ["\u0627\u0644\u0633\u0628\u0628: ", adoption.reason] }), decision.adoptionDrifted && (_jsx("p", { className: "mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-bold text-warn", children: "\u0627\u0644\u0646\u0633\u0628 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0627\u062E\u062A\u0644\u0641\u062A \u0639\u0646 \u0644\u0642\u0637\u0629 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u2014 \u0631\u0627\u062C\u0639 \u0633\u062C\u0644 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0646\u062A\u0627\u0626\u062C." }))] })), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("label", { className: "text-sm font-bold text-text", children: ["\u0627\u0644\u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629", _jsx("select", { value: adoptedStatus, onChange: (e) => setAdoptedStatus(e.target.value), className: "mt-2 w-full rounded-xl border border-line bg-void px-3 py-2 text-sm font-normal text-text", children: STATUSES.map((status) => (_jsxs("option", { value: status, children: [STATUS_LABELS_AR[status], status === decision.status ? ' (التوصية الحالية)' : ''] }, status))) })] }), _jsxs("label", { className: "text-sm font-bold text-text", children: ["\u0627\u0644\u0633\u0628\u0628 ", disagree ? '(إلزامي عند المخالفة)' : '(اختياري)', _jsx("input", { value: reason, onChange: (e) => setReason(e.target.value), className: "mt-2 w-full rounded-xl border border-line bg-void px-3 py-2 text-sm font-normal text-text", placeholder: disagree ? 'سبب المخالفة' : 'ملاحظة اختيارية' })] })] }), error && _jsx("p", { className: "text-sm text-error", children: error }), _jsx("button", { type: "button", disabled: busy, onClick: () => void submit(), className: "rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-ink disabled:opacity-40", children: busy ? 'جارٍ الحفظ…' : adoption ? 'اعتماد جديد (ينسخ السابق)' : 'اعتماد التوصية' })] }));
}
