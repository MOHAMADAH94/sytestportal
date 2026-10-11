import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, BookOpen } from 'lucide-react';
import { apiEvaluateClassicQuestions } from '../api/client';
import { useAuth } from '../auth/AuthContext';
export function ClassicEvaluationModal({ isOpen, onClose, onSuccess, examId, attemptId, examineeName, questions, evaluations, answers, }) {
    const { user } = useAuth();
    const [scores, setScores] = useState({});
    const [feedbacks, setFeedbacks] = useState({});
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const classicQuestions = questions.filter((q) => q.type === 'classic' || q.type === 'open');
    useEffect(() => {
        if (!isOpen)
            return;
        const initialScores = {};
        const initialFeedbacks = {};
        classicQuestions.forEach((q) => {
            const ev = evaluations?.find((e) => e.questionId === q.id);
            initialScores[q.id] = ev ? Number(ev.awardedScore) : 0;
            initialFeedbacks[q.id] = ev?.feedback || '';
        });
        setScores(initialScores);
        setFeedbacks(initialFeedbacks);
        setReason('');
        setError('');
    }, [isOpen, attemptId]);
    if (!isOpen)
        return null;
    async function handleSave() {
        if (!user)
            return;
        setBusy(true);
        setError('');
        for (const q of classicQuestions) {
            const score = Number(scores[q.id]);
            if (isNaN(score) || score < 0 || score > q.points) {
                setError(`الدرجة الممنوحة للسؤال «${q.text.slice(0, 30)}...» يجب أن تكون بين 0 و ${q.points}`);
                setBusy(false);
                return;
            }
        }
        try {
            const payload = classicQuestions.map((q) => ({
                questionId: q.id,
                score: Number(scores[q.id] || 0),
                feedback: feedbacks[q.id] || '',
            }));
            await apiEvaluateClassicQuestions(user.token, examId, attemptId, payload, reason);
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل حفظ وتحديث تقييم الأسئلة');
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm", dir: "rtl", children: _jsxs("div", { className: "flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-gold/40 bg-card shadow-2xl", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-line p-5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(BookOpen, { className: "h-5 w-5 text-gold" }), _jsxs("h2", { className: "text-lg font-bold text-text", children: ["\u062A\u0635\u062D\u064A\u062D \u0648\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0642\u0627\u0644\u064A\u0629 \u0644\u0644\u0645\u0645\u062A\u062D\u0646: ", _jsx("span", { className: "text-light-gold", children: examineeName })] })] }), _jsx("button", { type: "button", onClick: onClose, className: "rounded-lg p-1.5 text-mute transition hover:bg-panel hover:text-text", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsxs("div", { className: "flex-1 space-y-6 overflow-y-auto p-5", children: [error && (_jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error", children: [_jsx(AlertCircle, { className: "h-4 w-4 shrink-0" }), _jsx("span", { children: error })] })), classicQuestions.length === 0 ? (_jsx("p", { className: "text-center text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0633\u0626\u0644\u0629 \u0645\u0642\u0627\u0644\u064A\u0629 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631." })) : (classicQuestions.map((q, idx) => {
                            const candAnswer = evaluations?.find((e) => e.questionId === q.id)?.candidateAnswer ||
                                answers?.[q.id] ||
                                '';
                            return (_jsxs("div", { className: "space-y-3 rounded-xl border border-line bg-panel/50 p-4", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-2", children: [_jsxs("h3", { className: "text-sm font-bold text-text", children: [_jsx("span", { className: "ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-gold/20 text-xs text-light-gold", children: idx + 1 }), q.text] }), _jsxs("span", { className: "rounded-full border border-line bg-ink px-2.5 py-0.5 text-xs font-semibold text-warn", children: ["\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0639\u0638\u0645\u0649: ", q.points] })] }), q.rubric && q.rubric.length > 0 && (_jsxs("div", { className: "rounded-lg border border-line/60 bg-panel px-3 py-2 text-xs", children: [_jsx("div", { className: "mb-1 font-semibold text-text-2", children: "\u0645\u0639\u0627\u064A\u064A\u0631 \u0627\u0644\u062A\u0635\u062D\u064A\u062D (Rubric):" }), _jsx("ul", { className: "space-y-1 text-mute", children: q.rubric.map((r, i) => (_jsxs("li", { className: "flex justify-between", children: [_jsxs("span", { children: ["\u2022 ", r.criterion] }), _jsxs("span", { className: "text-warn", children: [r.maxPoints, " \u062F\u0631\u062C\u0629"] })] }, i))) })] })), q.answerKey && (_jsxs("div", { className: "rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-xs text-text-2", children: [_jsx("strong", { className: "text-ok", children: "\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0625\u062C\u0627\u0628\u0629 / \u0633\u0644\u0645 \u0627\u0644\u062D\u0644: " }), q.answerKey] })), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-xs font-semibold text-mute", children: "\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0645\u0645\u062A\u062D\u0646 \u0627\u0644\u0645\u0633\u062C\u0644\u0629:" }), _jsx("div", { className: "whitespace-pre-wrap rounded-lg border border-line bg-card p-3 text-sm text-text", children: candAnswer ? String(candAnswer) : _jsx("span", { className: "text-mute italic", children: "\u0644\u0645 \u064A\u062A\u0645 \u062A\u0642\u062F\u064A\u0645 \u0625\u062C\u0627\u0628\u0629" }) })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { children: [_jsxs("label", { className: "mb-1 block text-xs font-semibold text-mute", children: ["\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0645\u0645\u0646\u0648\u062D\u0629 (\u0645\u0646 ", q.points, "):"] }), _jsx("input", { type: "number", min: 0, max: q.points, step: "any", value: scores[q.id] ?? 0, onChange: (e) => setScores({ ...scores, [q.id]: Number(e.target.value) }), className: "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-bold text-gold outline-none focus:border-gold" })] }), _jsxs("div", { className: "sm:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs font-semibold text-mute", children: "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0648\u062A\u063A\u0630\u064A\u0629 \u0631\u0627\u062C\u0639\u0629 \u0644\u0644\u0645\u0645\u062A\u062D\u0646 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A):" }), _jsx("input", { type: "text", placeholder: "\u0633\u0628\u0628 \u0645\u0646\u062D \u0627\u0644\u062F\u0631\u062C\u0629 \u0623\u0648 \u0646\u0642\u0627\u0637 \u0627\u0644\u0642\u0648\u0629/\u0627\u0644\u0636\u0639\u0641...", value: feedbacks[q.id] || '', onChange: (e) => setFeedbacks({ ...feedbacks, [q.id]: e.target.value }), className: "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none focus:border-gold" })] })] })] }, q.id));
                        })), classicQuestions.length > 0 && (_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs font-semibold text-mute", children: "\u0633\u0628\u0628 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 / \u0645\u0631\u062C\u0639 \u0627\u0644\u062A\u062F\u0642\u064A\u0642 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A):" }), _jsx("input", { type: "text", placeholder: "\u0645\u062B\u0627\u0644: \u062A\u0635\u062D\u064A\u062D \u064A\u062F\u0648\u064A \u0644\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0642\u0627\u0644\u064A\u0629 \u062D\u0633\u0628 \u0633\u0644\u0645 \u0627\u0644\u062A\u0635\u062D\u064A\u062D \u0627\u0644\u0645\u0639\u062A\u0645\u062F", value: reason, onChange: (e) => setReason(e.target.value), className: "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-text outline-none focus:border-gold" })] }))] }), _jsxs("div", { className: "flex items-center justify-end gap-3 border-t border-line p-4", children: [_jsx("button", { type: "button", onClick: onClose, className: "rounded-xl border border-line px-4 py-2 text-sm font-medium text-mute hover:border-gold/60 hover:text-text", children: "\u0625\u0644\u063A\u0627\u0621" }), _jsxs("button", { type: "button", disabled: busy || classicQuestions.length === 0, onClick: handleSave, className: "inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2 text-sm font-bold text-ink transition hover:bg-accent-gold disabled:opacity-50", children: [_jsx(CheckCircle, { className: "h-4 w-4" }), busy ? 'جاري الاعتماد...' : 'اعتماد وحفظ الدرجات'] })] })] }) }));
}
