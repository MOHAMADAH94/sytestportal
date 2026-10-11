import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowRight, ClipboardPlus, Save, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiAdminExamQuestions, apiManualResult, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { QuestionCard } from '../components/QuestionCard';
import { CATEGORY_META, EXAM_LEVELS } from '../data/types';
export function AdminEnterResultsPage() {
    const { examId } = useParams();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const [exam, setExam] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [variants, setVariants] = useState([]);
    const [questionsLoading, setQuestionsLoading] = useState(false);
    const selectedCandidate = searchParams.get('name') || '';
    const [examineeName, setExamineeName] = useState(() => selectedCandidate);
    const [answers, setAnswers] = useState({});
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastReport, setLastReport] = useState(null);
    async function load() {
        if (!user?.token || !examId)
            return;
        setLoading(true);
        try {
            const res = await apiAdminExamQuestions(user.token, examId, selectedCandidate || undefined);
            setExam(res.exam);
            setVariants(res.variants || []);
            setQuestions(res.questions);
            setError('');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل التحميل');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void load();
    }, [user?.token, examId]);
    useEffect(() => {
        if (selectedCandidate)
            setExamineeName(selectedCandidate);
    }, [selectedCandidate]);
    useEffect(() => {
        if (!exam?.jobBased || !user || !examId)
            return;
        let current = true;
        setAnswers({});
        setQuestions([]);
        if (!examineeName) {
            setQuestionsLoading(false);
            return;
        }
        setQuestionsLoading(true);
        apiAdminExamQuestions(user.token, examId, examineeName).then((res) => { if (current) {
            setQuestions(res.questions);
            setError('');
        } })
            .catch((e) => { if (current)
            setError(e.message); }).finally(() => { if (current)
            setQuestionsLoading(false); });
        return () => { current = false; };
    }, [exam?.jobBased, examId, user?.token, examineeName]);
    function resetForm() {
        setExamineeName('');
        setAnswers({});
        setOkMsg('');
    }
    async function save() {
        if (!user?.token || !examId)
            return;
        const name = examineeName.trim();
        if (!name) {
            setError('أدخل اسم الممتحن');
            return;
        }
        const unanswered = questions.filter((q) => {
            const v = answers[q.id];
            return v === undefined || v === '';
        });
        if (unanswered.length > 0) {
            setError(`أكمل جميع الأسئلة (متبقٍ ${unanswered.length})`);
            return;
        }
        setSaving(true);
        setError('');
        setOkMsg('');
        try {
            const res = await apiManualResult(user.token, examId, {
                examineeName: name,
                answers,
            });
            setLastReport({
                name: res.attempt.examineeName,
                percent: res.attempt.percent,
                personality: res.attempt.personality || null,
            });
            setOkMsg(`تم حفظ نتيجة «${name}» بنجاح.`);
            setExamineeName('');
            setAnswers({});
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل الحفظ');
        }
        finally {
            setSaving(false);
        }
    }
    if (loading)
        return _jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." });
    if (!exam) {
        return _jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 p-4 text-error", children: error || 'غير موجود' });
    }
    const remaining = exam.capacity - exam.usedSeats;
    const isPersonality = exam.category === 'personality';
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsxs(Link, { to: `/admin/results/${exam.id}`, className: "mb-3 inline-flex items-center gap-1 text-sm font-bold text-gold", children: [_jsx(ArrowRight, { className: "h-4 w-4" }), " \u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0646\u062A\u0627\u0626\u062C"] }), _jsxs("h1", { className: "text-2xl font-extrabold text-light-gold", children: ["\u0625\u062F\u062E\u0627\u0644 \u0646\u062A\u0627\u0626\u062C: ", exam.title] }), _jsxs("p", { className: "mt-1 text-sm text-mute", children: [CATEGORY_META[exam.category].label, " \u00B7 ", EXAM_LEVELS.find((l) => l.id === exam.level)?.label, " \u00B7 \u0627\u0644\u0645\u0642\u0627\u0639\u062F", ' ', exam.usedSeats, "/", exam.capacity, " (\u0645\u062A\u0628\u0642\u064D ", remaining, ")"] }), _jsx("p", { className: "mt-2 text-sm text-text-2", children: isPersonality
                            ? 'أدخل اسم كل شخص ثم ضع درجاته على مقياس 1–5 لكل عبارة، واحفظ. يمكنك إضافة عدة أشخاص تباعاً.'
                            : 'أدخل اسم الممتحن وأجوبته يدوياً ثم احفظ النتيجة في قاعدة البيانات.' })] }), error && (_jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error })), okMsg && (_jsx("div", { className: "rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok", children: okMsg })), lastReport && (_jsxs("div", { className: "rounded-2xl border border-gold/30 bg-panel p-4", children: [_jsxs("div", { className: "mb-2 font-bold text-light-gold", children: ["\u0622\u062E\u0631 \u0646\u062A\u064A\u062C\u0629 \u0645\u062D\u0641\u0648\u0638\u0629 \u2014 ", lastReport.name] }), lastReport.percent != null && (_jsxs("p", { className: "mb-2 text-sm text-text-2", children: ["\u0627\u0644\u0646\u0633\u0628\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629: ", lastReport.percent, "%"] })), lastReport.personality?.summary && (_jsx("p", { className: "mb-3 text-sm leading-relaxed text-text-2", children: lastReport.personality.summary })), lastReport.personality?.traits && lastReport.personality.traits.length > 0 && (_jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: lastReport.personality.traits.map((t) => (_jsxs("div", { className: "rounded-xl border border-line bg-card px-3 py-2 text-sm", children: [_jsxs("div", { className: "flex justify-between gap-2 font-semibold text-text", children: [_jsx("span", { children: t.name }), _jsxs("span", { className: "text-light-gold", children: [t.percent, "%"] })] }), _jsx("div", { className: "mt-1.5 h-2 overflow-hidden rounded-full bg-ink", children: _jsx("div", { className: "h-full rounded-full bg-gold", style: { width: `${t.percent}%` } }) })] }, t.name))) }))] })), remaining <= 0 ? (_jsx("div", { className: "rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute", children: "\u0627\u0643\u062A\u0645\u0644 \u0639\u062F\u062F \u0627\u0644\u0645\u0645\u062A\u062D\u0646\u064A\u0646. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0636\u0627\u0641\u0629 \u0646\u062A\u0627\u0626\u062C \u062C\u062F\u064A\u062F\u0629." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "rounded-2xl border border-line bg-card p-4", children: [_jsx("label", { className: "mb-2 block text-sm font-bold text-text", children: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0645\u062A\u062D\u0646" }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [exam.jobBased ? _jsxs("select", { "aria-label": "\u0627\u0633\u0645 \u0627\u0644\u0645\u0645\u062A\u062D\u0646", value: examineeName, onChange: (e) => setExamineeName(e.target.value), className: "min-w-[220px] flex-1 rounded-xl border border-line bg-panel px-4 py-2.5 text-text", children: [_jsx("option", { value: "", children: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0645\u062A\u0642\u062F\u0645 \u0644\u0639\u0631\u0636 \u0623\u0633\u0626\u0644\u062A\u0647" }), variants.map((v) => _jsxs("option", { value: v.examineeName, children: [v.examineeName, " \u2014 ", v.jobTitle] }, v.examineeName))] }) : _jsx("input", { type: "text", value: examineeName, onChange: (e) => setExamineeName(e.target.value), readOnly: !!selectedCandidate, placeholder: "\u0645\u062B\u0627\u0644: \u0623\u062D\u0645\u062F \u0645\u062D\u0645\u062F", className: "min-w-[220px] flex-1 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm text-text outline-none focus:border-gold" }), _jsxs("button", { type: "button", onClick: resetForm, className: "inline-flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-xs font-bold text-text-2", children: [_jsx(UserPlus, { className: "h-3.5 w-3.5" }), " \u0645\u0633\u062D \u0627\u0644\u0646\u0645\u0648\u0630\u062C"] })] })] }), _jsx("div", { className: "space-y-3", children: questions.map((q, i) => (_jsx(QuestionCard, { question: q, index: i, value: answers[q.id], onChange: (v) => setAnswers((prev) => ({ ...prev, [q.id]: v })) }, q.id))) }), _jsx("div", { className: "sticky bottom-4 z-10 flex justify-end", children: _jsxs("button", { type: "button", disabled: saving || questionsLoading || !questions.length || !examineeName, onClick: () => void save(), className: "inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink shadow-lg hover:bg-accent-gold disabled:opacity-60", children: [_jsx(Save, { className: "h-4 w-4" }), saving ? 'جاري الحفظ...' : 'حفظ نتيجة هذا الشخص'] }) })] })), _jsxs(Link, { to: `/admin/results/${exam.id}`, className: "inline-flex items-center gap-1 text-sm font-bold text-gold", children: [_jsx(ClipboardPlus, { className: "h-4 w-4" }), " \u0639\u0631\u0636 \u0643\u0644 \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629"] })] }));
}
