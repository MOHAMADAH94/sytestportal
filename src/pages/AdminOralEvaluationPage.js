import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowRight, CheckCircle2, ClipboardList, PenLine, Play, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { apiExamResults, apiExamRoster, apiSaveOralEvaluation } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { getBank } from '../data/banks';
function shuffled(items) {
    return [...items].sort(() => Math.random() - 0.5);
}
export function AdminOralEvaluationPage() {
    const navigate = useNavigate();
    const { examId } = useParams();
    const { user } = useAuth();
    const [exam, setExam] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [completed, setCompleted] = useState({});
    const [selectedName, setSelectedName] = useState('');
    const [mode, setMode] = useState('choose');
    const [count, setCount] = useState(5);
    const [topic, setTopic] = useState('all');
    const [questions, setQuestions] = useState([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const bank = useMemo(() => exam ? getBank('oral', exam.oralRole || undefined, exam.level) : [], [exam]);
    const topics = useMemo(() => [...new Set(bank.map((q) => q.topic))].sort((a, b) => a.localeCompare(b, 'ar')), [bank]);
    /** تجميع المتقدمين حسب مسمى العمل لتسهيل تتبع المقابل لفئته. */
    const groupedCandidates = useMemo(() => {
        const groups = new Map();
        for (const candidate of candidates) {
            if (!groups.has(candidate.jobTitle))
                groups.set(candidate.jobTitle, []);
            groups.get(candidate.jobTitle).push(candidate);
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
    }, [candidates]);
    async function load() {
        if (!user?.token || !examId)
            return;
        setLoading(true);
        try {
            const [rosterData, resultsData] = await Promise.all([apiExamRoster(user.token, examId), apiExamResults(user.token, examId)]);
            if (rosterData.exam.category !== 'oral')
                throw new Error('هذه الصفحة مخصصة للمقابلات الشفهية');
            setExam(rosterData.exam);
            setCandidates(rosterData.roster.map((row) => ({ name: row.name, jobTitle: row.jobTitle?.trim() || 'غير محدد' })));
            setCompleted(Object.fromEntries(resultsData.attempts.map((a) => [a.examineeName, { score: a.score, maxScore: a.maxScore, percent: a.percent }])));
            setError('');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل تحميل قائمة المقابلة');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => { void load(); }, [user?.token, examId]);
    function openCandidate(name) {
        if (!completed[name])
            navigate('/evaluation/' + examId + '?name=' + encodeURIComponent(name));
    }
    function createGeneratedQuestions() {
        const pool = topic === 'all' ? bank : bank.filter((q) => q.topic === topic);
        if (!pool.length) {
            setError('لا توجد أسئلة مطابقة لهذا النوع');
            return;
        }
        const list = shuffled(pool).slice(0, Math.min(count, pool.length)).map((q, index) => ({
            id: `${q.id}-${Date.now()}-${index}`, text: q.text, points: 10, answer: '', awarded: '',
        }));
        setQuestions(list);
        setMode('evaluate');
        setError('');
    }
    function createManualQuestions() {
        const safeCount = Math.max(1, Math.min(30, count || 1));
        setQuestions(Array.from({ length: safeCount }, (_, index) => ({ id: `manual-${Date.now()}-${index}`, text: '', points: 10, answer: '', awarded: '' })));
        setMode('evaluate');
        setError('');
    }
    function updateQuestion(index, patch) {
        setQuestions((prev) => prev.map((q, i) => i === index ? { ...q, ...patch } : q));
    }
    async function saveEvaluation() {
        if (!user?.token || !examId || !selectedName)
            return;
        if (!questions.length || questions.some((q) => q.awarded.trim() === '')) {
            setError('أدخل درجة لكل سؤال، ويمكن إدخال صفر.');
            return;
        }
        const payload = questions.map((q) => ({ ...q, points: Number(q.points), awarded: Number(q.awarded) }));
        if (payload.some((q) => !q.text.trim() || !q.answer.trim() || !Number.isFinite(q.points) || q.points <= 0 || !Number.isFinite(q.awarded) || q.awarded < 0 || q.awarded > q.points)) {
            setError('أكمل نص السؤال وإجابة المتقدم وعلامة صحيحة لكل سؤال.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const result = await apiSaveOralEvaluation(user.token, examId, { examineeName: selectedName, questions: payload });
            setCompleted((prev) => ({ ...prev, [selectedName]: { score: result.attempt.score, maxScore: result.attempt.maxScore, percent: result.attempt.percent } }));
            setMessage(`تم حفظ تقييم ${selectedName}: ${result.attempt.score}/${result.attempt.maxScore} (${result.attempt.percent}%)`);
            setSelectedName('');
            setQuestions([]);
            setMode('choose');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل حفظ التقييم');
        }
        finally {
            setSaving(false);
        }
    }
    if (loading)
        return _jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629..." });
    if (!exam)
        return _jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 p-4 text-error", children: error || 'الاختبار غير موجود' });
    if (!selectedName)
        return _jsxs("div", { className: "space-y-5", children: [_jsxs(Link, { to: `/admin/results/${exam.id}`, className: "inline-flex items-center gap-1 text-sm font-bold text-gold", children: [_jsx(ArrowRight, { className: "h-4 w-4" }), " \u0631\u062C\u0648\u0639 \u0644\u0644\u0646\u062A\u0627\u0626\u062C"] }), _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0627\u062A \u0627\u0644\u0634\u0641\u0647\u064A\u0629" }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u0627\u062E\u062A\u0631 \u0645\u062A\u0642\u062F\u0645\u0627\u064B \u0644\u0628\u062F\u0621 \u062A\u0642\u064A\u064A\u0645\u0647. \u0644\u0627 \u064A\u0648\u062C\u062F \u0623\u064A \u0625\u062C\u0631\u0627\u0621 \u0645\u0637\u0644\u0648\u0628 \u0645\u0646 \u0627\u0644\u0645\u0645\u062A\u062D\u064E\u0646." })] }), message && _jsx("div", { className: "rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok", children: message }), error && _jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error }), !candidates.length ? _jsx("div", { className: "rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0642\u0627\u0626\u0645\u0629 \u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0644\u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631. \u0623\u0646\u0634\u0626 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0639 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0623\u0633\u0645\u0627\u0621." }) : _jsx("div", { className: "space-y-6", children: groupedCandidates.map(([jobTitle, list]) => (_jsxs("div", { children: [_jsxs("h2", { className: "mb-3 text-sm font-extrabold text-gold", children: [jobTitle, " ", _jsxs("span", { className: "font-normal text-mute", children: ["(", list.length, ")"] })] }), _jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: list.map(({ name }, index) => {
                                    const done = completed[name];
                                    return _jsxs("div", { className: "rounded-2xl border border-line bg-card p-4", children: [_jsx("div", { className: "mb-3 font-bold text-text", children: name }), done ? _jsxs("div", { className: "flex items-center gap-2 text-sm text-ok", children: [_jsx(CheckCircle2, { className: "h-4 w-4" }), " \u062A\u0645 \u0627\u0644\u062A\u0642\u064A\u064A\u0645: ", done.score, "/", done.maxScore, " (", done.percent ?? 0, "%)"] }) : _jsxs("button", { type: "button", onClick: () => openCandidate(name), className: "inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-sm font-bold text-ink", children: [_jsx(Play, { className: "h-4 w-4" }), " \u0628\u062F\u0621 \u0627\u0644\u062A\u0642\u064A\u064A\u0645"] })] }, `${name}-${index}`);
                                }) })] }, jobTitle))) })] });
    return _jsxs("div", { className: "space-y-5", children: [_jsxs("button", { type: "button", onClick: () => { setSelectedName(''); setMode('choose'); setQuestions([]); setError(''); }, className: "inline-flex items-center gap-1 text-sm font-bold text-gold", children: [_jsx(ArrowRight, { className: "h-4 w-4" }), " \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646"] }), _jsxs("div", { className: "rounded-2xl border border-gold/40 bg-gold/10 p-5", children: [_jsx("p", { className: "text-xs font-bold text-mute", children: "\u062A\u0642\u064A\u064A\u0645 \u0634\u0641\u0647\u064A" }), _jsx("h1", { className: "mt-1 text-2xl font-extrabold text-light-gold", children: selectedName }), _jsx("p", { className: "mt-1 text-sm text-text-2", children: "\u0627\u0644\u0645\u0642\u0627\u0628\u0650\u0644 \u064A\u062F\u0648\u0651\u0646 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0648\u064A\u0645\u0646\u062D \u0639\u0644\u0627\u0645\u0629 \u0643\u0644 \u0633\u0624\u0627\u0644\u061B \u0644\u0627 \u062A\u0638\u0647\u0631 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0644\u0644\u0645\u062A\u0642\u062F\u0645." })] }), error && _jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error }), mode === 'choose' && _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("button", { type: "button", onClick: () => setMode('generated'), className: "rounded-2xl border border-gold/40 bg-panel p-6 text-right hover:bg-gold/10", children: [_jsx(ClipboardList, { className: "mb-3 h-7 w-7 text-gold" }), _jsx("h2", { className: "font-extrabold text-light-gold", children: "\u0625\u0646\u0634\u0627\u0621 \u0623\u0633\u0626\u0644\u0629 \u0645\u0646 \u0627\u0644\u0628\u0646\u0643" }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u062D\u062F\u062F \u0627\u0644\u0639\u062F\u062F \u0648\u0646\u0648\u0639/\u0645\u062D\u0648\u0631 \u0627\u0644\u0623\u0633\u0626\u0644\u0629\u060C \u062B\u0645 \u0642\u064A\u0651\u0645 \u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645 \u064A\u062F\u0648\u064A\u0627\u064B." })] }), _jsxs("button", { type: "button", onClick: () => setMode('manual'), className: "rounded-2xl border border-line bg-panel p-6 text-right hover:border-gold/50", children: [_jsx(PenLine, { className: "mb-3 h-7 w-7 text-gold" }), _jsx("h2", { className: "font-extrabold text-light-gold", children: "\u0623\u0633\u0626\u0644\u0629 \u064A\u062F\u0648\u064A\u0629" }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u0627\u0643\u062A\u0628 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629 \u0628\u0646\u0641\u0633\u0643\u060C \u0648\u062D\u062F\u062F \u0639\u0644\u0627\u0645\u0629 \u0643\u0644 \u0633\u0624\u0627\u0644 \u0648\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645." })] })] }), (mode === 'generated' || mode === 'manual') && _jsxs("div", { className: "space-y-4 rounded-2xl border border-line bg-card p-5", children: [_jsx("h2", { className: "font-extrabold text-light-gold", children: mode === 'generated' ? 'إعداد أسئلة من البنك' : 'إعداد أسئلة يدوية' }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs("label", { className: "text-sm font-bold text-text-2", children: ["\u0639\u062F\u062F \u0627\u0644\u0623\u0633\u0626\u0644\u0629", _jsx("input", { type: "number", min: 1, max: mode === 'generated' ? Math.max(1, bank.length) : 30, value: count, onChange: (e) => setCount(Number(e.target.value)), className: "mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text outline-none" })] }), mode === 'generated' && _jsxs("label", { className: "text-sm font-bold text-text-2", children: ["\u0646\u0648\u0639 / \u0645\u062D\u0648\u0631 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", _jsxs("select", { value: topic, onChange: (e) => setTopic(e.target.value), className: "mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text outline-none", children: [_jsx("option", { value: "all", children: "\u0643\u0644 \u0627\u0644\u0645\u062D\u0627\u0648\u0631" }), topics.map((item) => _jsx("option", { value: item, children: item }, item))] })] })] }), _jsx("button", { type: "button", onClick: mode === 'generated' ? createGeneratedQuestions : createManualQuestions, className: "rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink", children: "\u0645\u062A\u0627\u0628\u0639\u0629 \u0625\u0644\u0649 \u0627\u0644\u062A\u0642\u064A\u064A\u0645" })] }), mode === 'evaluate' && _jsxs(_Fragment, { children: [_jsx("div", { className: "space-y-4", children: questions.map((q, index) => _jsxs("div", { className: "rounded-2xl border border-line bg-card p-4", children: [_jsxs("div", { className: "mb-3 font-bold text-light-gold", children: ["\u0627\u0644\u0633\u0624\u0627\u0644 ", index + 1] }), q.answerKey && _jsxs("details", { className: "mb-3 text-sm text-gold", children: [_jsx("summary", { children: "\u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C\u064A\u0629 \u0648\u0645\u0639\u064A\u0627\u0631 \u0627\u0644\u062A\u0642\u064A\u064A\u0645" }), _jsx("p", { className: "mt-2 whitespace-pre-wrap", children: q.answerKey })] }), _jsxs("label", { className: "block text-xs font-bold text-mute", children: ["\u0646\u0635 \u0627\u0644\u0633\u0624\u0627\u0644", _jsx("textarea", { value: q.text, readOnly: !q.id.startsWith('manual-'), onChange: (e) => updateQuestion(index, { text: e.target.value }), rows: 2, className: "mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-text outline-none disabled:opacity-70" })] }), _jsxs("div", { className: "mt-3 grid gap-3 sm:grid-cols-[1fr_130px_130px]", children: [_jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645", _jsx("textarea", { value: q.answer, onChange: (e) => updateQuestion(index, { answer: e.target.value }), rows: 2, className: "mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-text outline-none" })] }), _jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u0633\u0624\u0627\u0644", _jsx("input", { type: "number", readOnly: !!exam.jobBased, min: 1, value: q.points, onChange: (e) => updateQuestion(index, { points: Number(e.target.value) }), className: "mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text outline-none" })] }), _jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0645\u0645\u0646\u0648\u062D\u0629", _jsx("input", { type: "number", min: 0, max: q.points, value: q.awarded, onChange: (e) => updateQuestion(index, { awarded: e.target.value }), className: "mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text outline-none" })] })] })] }, q.id)) }), _jsx("div", { className: "sticky bottom-4 flex justify-end", children: _jsxs("button", { type: "button", disabled: saving, onClick: () => void saveEvaluation(), className: "inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink shadow-lg disabled:opacity-50", children: [_jsx(Save, { className: "h-4 w-4" }), " ", saving ? 'جاري الحفظ...' : 'حفظ النتيجة النهائية'] }) })] })] });
}
