import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowRight, CheckCircle2, History, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiExamineeDetail, apiExamineeDecision, apiGetExamineeAuditHistory, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DecisionRecommendationCard } from '../components/DecisionRecommendationCard';
import { DecisionAdoptionPanel } from '../components/DecisionAdoptionPanel';
import { EditResultModal } from '../components/EditResultModal';
import { CATEGORY_META, EXAM_LEVELS, ORAL_ROLES } from '../data/types';
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
export function AdminExamineeDetailPage() {
    const { name } = useParams();
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [decision, setDecision] = useState(null);
    const [auditHistory, setAuditHistory] = useState([]);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [selectedAttempt, setSelectedAttempt] = useState(null);
    async function loadData() {
        if (!user?.token || !name)
            return;
        try {
            const decoded = decodeURIComponent(name);
            const [resDetail, resHistory, resDecision] = await Promise.all([
                apiExamineeDetail(user.token, decoded),
                apiGetExamineeAuditHistory(user.token, decoded).catch(() => ({ history: [], total: 0 })),
                apiExamineeDecision(user.token, decoded).catch(() => null),
            ]);
            setData(resDetail);
            setAuditHistory(resHistory.history || []);
            setDecision(resDecision);
            setError('');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل التحميل');
        }
    }
    useEffect(() => {
        void loadData();
    }, [user?.token, name]);
    function handleModifySuccess() {
        setSuccessMsg('تم اعتماد تعديل النتيجة بنجاح وتوثيق سجل التدقيق الدائم.');
        void loadData();
        setTimeout(() => setSuccessMsg(''), 5000);
    }
    if (error) {
        return (_jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 p-4 text-error", children: error }));
    }
    if (!data)
        return _jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0645\u0645\u062A\u062D\u0646..." });
    return (_jsxs("div", { className: "space-y-6", dir: "rtl", children: [_jsxs("div", { children: [_jsxs(Link, { to: "/admin/examinees", className: "mb-3 inline-flex items-center gap-1 text-sm font-bold text-gold", children: [_jsx(ArrowRight, { className: "h-4 w-4" }), " \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0645\u062A\u062D\u0646\u064A\u0646"] }), _jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: data.examineeName }), _jsxs("p", { className: "mt-1 text-sm text-mute", children: ["\u0642\u062F\u0651\u0645 ", data.examCount, " \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u064B \u0636\u0645\u0646 \u0646\u0637\u0627\u0642 \u0635\u0644\u0627\u062D\u064A\u062A\u0643."] })] }), successMsg && (_jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm font-bold text-ok", children: [_jsx(CheckCircle2, { className: "h-5 w-5 shrink-0" }), successMsg] })), _jsxs("div", { className: "rounded-2xl border border-gold/40 bg-gold/10 p-5", children: [_jsx("div", { className: "text-sm font-bold text-mute", children: "\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0646\u0647\u0627\u0626\u064A\u0629 (\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0646\u0633\u0628)" }), _jsx("div", { className: "mt-2 text-4xl font-extrabold text-light-gold", children: data.finalPercent != null ? `${data.finalPercent}%` : '—' }), _jsx("p", { className: "mt-2 text-xs text-mute", children: "\u064A\u064F\u062D\u0633\u0628 \u0627\u0644\u0645\u062A\u0648\u0633\u0637 \u0645\u0646 \u0646\u0633\u0628 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0630\u0627\u062A \u0627\u0644\u062A\u0635\u062D\u064A\u062D \u0627\u0644\u0622\u0644\u064A \u0648\u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u0631\u0633\u0645\u064A\u0627\u064B." })] }), decision && _jsx(DecisionRecommendationCard, { decision: decision }), decision && (_jsx(DecisionAdoptionPanel, { decision: decision, onAdopted: () => {
                    setSuccessMsg('تم ختم الاعتماد وتثبيت لقطة القرار.');
                    void loadData();
                    setTimeout(() => setSuccessMsg(''), 5000);
                } })), _jsx("div", { className: "overflow-x-auto rounded-2xl border border-line", children: _jsxs("table", { className: "w-full min-w-[760px] text-sm", children: [_jsx("thead", { className: "bg-panel text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u0646\u0648\u0639" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u062F\u0631\u062C\u0629" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u0646\u0633\u0628\u0629" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0648\u0642\u062A \u0627\u0644\u062A\u0633\u0644\u064A\u0645" }), _jsx("th", { className: "px-4 py-3 text-center font-bold", children: "\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A" })] }) }), _jsx("tbody", { children: data.attempts.map((a) => (_jsxs("tr", { className: "border-t border-line bg-card", children: [_jsxs("td", { className: "px-4 py-3", children: [_jsx("div", { className: "font-semibold text-text", children: a.examTitle }), _jsx(Link, { to: `/admin/results/${a.examId}`, className: "text-xs font-bold text-gold hover:underline", children: "\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" })] }), _jsxs("td", { className: "px-4 py-3 text-mute", children: [CATEGORY_META[a.category]?.label, a.oralRole
                                                ? ` · ${ORAL_ROLES.find((r) => r.id === a.oralRole)?.label || a.oralRole}`
                                                : '', _jsx("div", { className: "text-[11px]", children: EXAM_LEVELS.find((l) => l.id === a.level)?.label })] }), _jsx("td", { className: "px-4 py-3 text-ok", children: a.maxScore > 0 ? `${a.score} / ${a.maxScore}` : 'تقييم يدوي' }), _jsxs("td", { className: "px-4 py-3 font-bold text-light-gold", children: [a.percent != null ? `${a.percent}%` : '—', a.committeeNote && _jsxs("div", { className: "mt-1 text-[11px] font-normal text-mute", children: ["\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0644\u062C\u0646\u0629: ", a.committeeNote] }), a.estimatedSalary != null && _jsxs("div", { className: "text-[11px] font-normal text-text", children: ["\u0627\u0644\u0631\u0627\u062A\u0628 \u0627\u0644\u0645\u0642\u062F\u0631: ", a.estimatedSalary.toLocaleString('ar-SY')] })] }), _jsx("td", { className: "px-4 py-3 text-mute", children: formatDate(a.finishedAt) }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { className: "flex items-center justify-center gap-2", children: [_jsxs("button", { type: "button", id: `edit-result-${a.attemptId}`, disabled: !!a.committeeResult && user?.role !== 'admin', onClick: () => setSelectedAttempt(a), className: "inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold transition hover:border-gold hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-60", children: [_jsx(Pencil, { className: "h-3.5 w-3.5" }), a.committeeResult && user?.role !== 'admin' ? 'معتمد من اللجنة' : 'تعديل النتيجة'] }), (a.auditCount || 0) > 0 && (_jsxs("span", { title: `تم تعديل هذه النتيجة ${a.auditCount} مرة`, className: "inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-bold text-warn", children: [_jsx(History, { className: "h-3 w-3" }), "\u0645\u0639\u062F\u0651\u0644\u0629 (", a.auditCount, ")"] }))] }) })] }, a.attemptId))) })] }) }), auditHistory.length > 0 && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(History, { className: "h-5 w-5 text-gold" }), _jsxs("h2", { className: "text-lg font-extrabold text-light-gold", children: ["\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u0648\u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0627\u0644\u0631\u0633\u0645\u064A\u0629 (", auditHistory.length, ")"] })] }), _jsx("div", { className: "overflow-x-auto rounded-2xl border border-line bg-card", children: _jsxs("table", { className: "w-full min-w-[760px] text-sm", children: [_jsx("thead", { className: "bg-panel text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-2.5 text-right font-bold text-xs", children: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E" }), _jsx("th", { className: "px-4 py-2.5 text-right font-bold text-xs", children: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" }), _jsx("th", { className: "px-4 py-2.5 text-right font-bold text-xs", children: "\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0633\u0627\u0628\u0642\u0629" }), _jsx("th", { className: "px-4 py-2.5 text-right font-bold text-xs", children: "\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u062C\u062F\u064A\u062F\u0629" }), _jsx("th", { className: "px-4 py-2.5 text-right font-bold text-xs", children: "\u0633\u0628\u0628 \u0627\u0644\u062A\u0639\u062F\u064A\u0644" }), _jsx("th", { className: "px-4 py-2.5 text-right font-bold text-xs", children: "\u0642\u0631\u0627\u0631 \u0627\u0644\u0644\u062C\u0646\u0629 / \u0627\u0644\u0645\u0631\u062C\u0639" }), _jsx("th", { className: "px-4 py-2.5 text-right font-bold text-xs", children: "\u0627\u0644\u0645\u0639\u062F\u0650\u0651\u0644" })] }) }), _jsx("tbody", { children: auditHistory.map((h) => (_jsxs("tr", { className: "border-t border-line text-xs", children: [_jsx("td", { className: "px-4 py-2.5 text-mute", children: formatDate(h.createdAt) }), _jsx("td", { className: "px-4 py-2.5 font-semibold text-text", children: h.examTitle }), _jsx("td", { className: "px-4 py-2.5 text-mute font-mono", children: h.originalPercent != null ? `${h.originalPercent}%` : '—' }), _jsxs("td", { className: "px-4 py-2.5 font-bold text-light-gold font-mono", children: [h.newPercent, "%", ' ', h.diffPercent != null && (_jsxs("span", { className: `text-[11px] ${h.diffPercent > 0
                                                            ? 'text-ok'
                                                            : h.diffPercent < 0
                                                                ? 'text-error'
                                                                : 'text-mute'}`, children: ["(", h.diffPercent > 0 ? `+${h.diffPercent}%` : `${h.diffPercent}%`, ")"] }))] }), _jsx("td", { className: "px-4 py-2.5 text-text-2 max-w-xs", children: h.reason }), _jsx("td", { className: "px-4 py-2.5 text-mute", children: h.committeeReference || '—' }), _jsxs("td", { className: "px-4 py-2.5 text-mute font-medium", children: [h.modifiedByName, " (", h.modifiedByRole, ")"] })] }, h.id))) })] }) })] })), data.attempts.some((a) => a.personality) && (_jsxs("div", { className: "space-y-3", children: [_jsx("h2", { className: "text-lg font-bold text-light-gold", children: "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0634\u062E\u0635\u064A\u0629" }), data.attempts
                        .filter((a) => a.personality)
                        .map((a) => (_jsxs("div", { className: "rounded-xl border border-line bg-card p-4 text-sm", children: [_jsx("div", { className: "mb-1 font-bold text-text", children: a.examTitle }), a.personality?.summary && (_jsx("p", { className: "mb-3 leading-relaxed text-text-2", children: a.personality.summary })), a.personality?.traits && (_jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: a.personality.traits.map((t) => (_jsxs("div", { className: "rounded-xl border border-line bg-panel px-3 py-2", children: [_jsxs("div", { className: "flex justify-between gap-2 font-semibold text-text", children: [_jsx("span", { children: t.name }), _jsxs("span", { className: "text-light-gold", children: [t.percent, "%"] })] }), _jsx("div", { className: "mt-1.5 h-2 overflow-hidden rounded-full bg-ink", children: _jsx("div", { className: "h-full rounded-full bg-gold", style: { width: `${t.percent}%` } }) })] }, t.name))) }))] }, a.attemptId)))] })), selectedAttempt && (_jsx(EditResultModal, { isOpen: !!selectedAttempt, onClose: () => setSelectedAttempt(null), onSuccess: handleModifySuccess, attemptId: selectedAttempt.attemptId, candidateName: data.examineeName, examTitle: selectedAttempt.examTitle, category: selectedAttempt.category, currentPercent: selectedAttempt.percent, currentScore: selectedAttempt.score, currentMaxScore: selectedAttempt.maxScore }))] }));
}
