import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowRight, CheckCircle2, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiExamResults, apiListEvaluationCandidates, apiExamRoster } from '../api/client';
import { useAuth } from '../auth/AuthContext';
/** اختيار متقدم لتقييم القيادة أو الشخصية؛ كل القائمة متاحة للحساب المختص. */
export function AdminCandidatePickerPage() {
    const { examId } = useParams();
    const { user } = useAuth();
    const [exam, setExam] = useState(null);
    const [names, setNames] = useState([]);
    const [done, setDone] = useState(new Set());
    const [error, setError] = useState('');
    useEffect(() => {
        if (!user?.token || !examId)
            return;
        Promise.all([apiListEvaluationCandidates(user.token), apiExamResults(user.token, examId)])
            .then(async ([candidates, results]) => {
            const applicable = results.exam.jobBased ? (await apiExamRoster(user.token, examId)).roster : candidates;
            setExam(results.exam);
            setNames(applicable.sort((a, b) => a.seqNumber - b.seqNumber).map((item) => item.name));
            setDone(new Set(results.attempts.map((item) => item.examineeName)));
        })
            .catch((err) => setError(err instanceof Error ? err.message : 'فشل تحميل المتقدمين'));
    }, [user?.token, examId]);
    if (error)
        return _jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 p-4 text-error", children: error });
    if (!exam)
        return _jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646..." });
    const title = exam.category === 'driving' ? 'أهلية قيادة الضابط' : 'تقييم الشخصية';
    return _jsxs("div", { className: "space-y-5", children: [_jsxs(Link, { to: "/admin", className: "inline-flex items-center gap-1 text-sm font-bold text-gold", children: [_jsx(ArrowRight, { className: "h-4 w-4" }), " \u0631\u062C\u0648\u0639"] }), _jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-extrabold text-light-gold", children: ["\u0645\u062A\u0642\u062F\u0645\u0648 ", title] }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u0643\u0644 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0641\u064A \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u062A\u0627\u062D\u0648\u0646 \u0644\u0644\u062A\u0642\u064A\u064A\u0645." })] }), !names.length ? _jsx("div", { className: "rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0642\u0627\u0626\u0645\u0629 \u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0644\u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631." }) : _jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: names.map((name, index) => _jsxs("div", { className: "rounded-2xl border border-line bg-card p-4", children: [_jsx("div", { className: "mb-3 font-bold text-text", children: name }), done.has(name) ? _jsxs("div", { className: "flex items-center gap-2 text-sm text-ok", children: [_jsx(CheckCircle2, { className: "h-4 w-4" }), " \u062A\u0645 \u0627\u0644\u062A\u0642\u064A\u064A\u0645"] }) : _jsxs(Link, { to: `/evaluation/${exam.id}?name=${encodeURIComponent(name)}`, className: "inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-sm font-bold text-ink", children: [_jsx(Play, { className: "h-4 w-4" }), " \u0628\u062F\u0621 \u0627\u0644\u062A\u0642\u064A\u064A\u0645"] })] }, `${name}-${index}`)) })] });
}
