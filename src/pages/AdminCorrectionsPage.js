import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiEnrollApplicant, apiListExams, apiSearchCorrections, apiUpdateApplicant, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { EditResultModal } from '../components/EditResultModal';
import { CATEGORY_META } from '../data/types';
const emptyForm = {
    name: '',
    org: '',
    jobTitle: '',
    jobTitleOrg: '',
    jobTitleCommittee: '',
    rank: '',
    proposedSalary: '',
    approvedSalary: '',
};
export function AdminCorrectionsPage() {
    const { user } = useAuth();
    const [query, setQuery] = useState('');
    const [people, setPeople] = useState([]);
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [exams, setExams] = useState([]);
    const [pickedExams, setPickedExams] = useState([]);
    const [attemptId, setAttemptId] = useState(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!user?.token)
            return;
        void apiListExams(user.token)
            .then((rows) => setExams(rows.filter((exam) => exam.active !== false)))
            .catch(() => setExams([]));
    }, [user?.token]);
    useEffect(() => {
        if (!selected)
            return;
        setForm({
            name: selected.name,
            org: selected.org,
            jobTitle: selected.jobTitle,
            jobTitleOrg: selected.jobTitleOrg,
            jobTitleCommittee: selected.jobTitleCommittee,
            rank: selected.rank,
            proposedSalary: selected.proposedSalary == null ? '' : String(selected.proposedSalary),
            approvedSalary: selected.approvedSalary == null ? '' : String(selected.approvedSalary),
        });
        setPickedExams([]);
    }, [selected]);
    async function search() {
        if (!user?.token || query.trim().length < 2)
            return;
        setBusy(true);
        setError('');
        try {
            const result = await apiSearchCorrections(user.token, query.trim());
            setPeople(result.people);
            setSelected(result.people[0] || null);
            if (!result.people.length)
                setMessage('لا يوجد تطابق.');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل البحث');
        }
        finally {
            setBusy(false);
        }
    }
    async function saveData() {
        if (!user?.token || !selected || !form.name.trim())
            return;
        setBusy(true);
        setError('');
        try {
            await apiUpdateApplicant(user.token, selected.id, {
                name: form.name.trim(),
                org: form.org,
                jobTitle: form.jobTitle,
                jobTitleOrg: form.jobTitleOrg,
                jobTitleCommittee: form.jobTitleCommittee,
                rank: form.rank,
                proposedSalary: form.proposedSalary.trim() === '' ? null : Number(form.proposedSalary),
                approvedSalary: form.approvedSalary.trim() === '' ? null : Number(form.approvedSalary),
            });
            setMessage(`حُفظت بيانات «${form.name.trim()}».`);
            const result = await apiSearchCorrections(user.token, form.name.trim());
            setPeople(result.people);
            setSelected(result.people.find((person) => person.id === selected.id) || result.people[0] || null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل حفظ البيانات');
        }
        finally {
            setBusy(false);
        }
    }
    async function enroll() {
        if (!user?.token || !selected || !pickedExams.length)
            return;
        setBusy(true);
        setError('');
        const joined = [];
        const failed = [];
        for (const examId of pickedExams) {
            const exam = exams.find((item) => item.id === examId);
            try {
                await apiEnrollApplicant(user.token, examId, selected.id);
                joined.push(exam?.title || examId);
            }
            catch (err) {
                failed.push(`${exam?.title || 'اختبار'}: ${err instanceof Error ? err.message : 'تعذر الإلحاق'}`);
            }
        }
        setMessage(`${joined.length ? `أُلحق بـ: ${joined.join('، ')}` : ''}${failed.length ? `${joined.length ? '. ' : ''}تعذر: ${failed.join(' — ')}` : ''}`);
        try {
            const result = await apiSearchCorrections(user.token, selected.name);
            setPeople(result.people);
            setSelected(result.people.find((person) => person.id === selected.id) || null);
        }
        catch {
            /* البحث التالي يعيد الحالة */
        }
        setBusy(false);
    }
    const editing = selected?.attempts.find((attempt) => attempt.id === attemptId) || null;
    const openExams = exams.filter((exam) => selected && !selected.enrolledExamIds.includes(exam.id));
    return (_jsxs("div", { className: "mx-auto max-w-5xl space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-gold", children: "\u062A\u0635\u062D\u064A\u062D \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0627\u0644\u0646\u062A\u0627\u0626\u062C" }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u0627\u0628\u062D\u062B \u0639\u0646 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u060C \u0639\u062F\u0651\u0644 \u0628\u064A\u0627\u0646\u0627\u062A\u0647\u060C \u0623\u0648 \u0623\u0644\u062D\u0642\u0647 \u0628\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0641\u0639\u0651\u0644. \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0639\u0644\u0627\u0645\u0629 \u064A\u0645\u0631 \u0628\u0633\u062C\u0644 \u0627\u0644\u0633\u0628\u0628 \u0646\u0641\u0633\u0647." })] }), _jsxs("form", { className: "flex gap-2", onSubmit: (e) => {
                    e.preventDefault();
                    void search();
                }, children: [_jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), className: "min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm text-text outline-none", placeholder: "\u0627\u0633\u0645 \u0623\u0648 \u0645\u0633\u0645\u0649 \u0623\u0648 \u062C\u0647\u0629" }), _jsxs("button", { type: "submit", disabled: busy || query.trim().length < 2, className: "inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40", children: [_jsx(Search, { className: "h-4 w-4", "aria-hidden": true }), "\u0628\u062D\u062B"] })] }), error && _jsx("p", { className: "rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error", children: error }), message && _jsx("p", { className: "rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok", children: message }), people.length > 1 && (_jsx("div", { className: "flex flex-wrap gap-2", children: people.map((person) => (_jsx("button", { type: "button", onClick: () => setSelected(person), className: `rounded-lg border px-3 py-2 text-xs font-bold ${selected?.id === person.id ? 'border-gold text-gold' : 'border-line text-text'}`, children: person.name }, person.id))) })), selected && (_jsxs("div", { className: "grid gap-4 lg:grid-cols-2", children: [_jsxs("section", { className: "space-y-3 rounded-2xl border border-line bg-panel p-4", children: [_jsx("h2", { className: "font-bold text-gold", children: "\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A" }), [
                                ['name', 'الاسم'],
                                ['org', 'الجهة'],
                                ['jobTitle', 'المسمى'],
                                ['jobTitleOrg', 'المسمى الوارد من الجهة'],
                                ['jobTitleCommittee', 'المسمى المقترح من اللجنة'],
                                ['rank', 'الرتبة'],
                                ['proposedSalary', 'الراتب المقترح'],
                                ['approvedSalary', 'الراتب المقرر'],
                            ].map(([key, label]) => (_jsxs("label", { className: "flex flex-col gap-1 text-xs font-bold text-mute", children: [label, _jsx("input", { value: form[key], onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })), className: "rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none" })] }, key))), _jsx("button", { type: "button", disabled: busy || !form.name.trim(), onClick: () => void saveData(), className: "rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40", children: "\u062D\u0641\u0638 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A" })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("section", { className: "space-y-3 rounded-2xl border border-line bg-panel p-4", children: [_jsx("h2", { className: "font-bold text-gold", children: "\u0627\u0644\u0646\u062A\u0627\u0626\u062C" }), selected.attempts.length === 0 && _jsx("p", { className: "text-sm text-mute", children: "\u0644\u0627 \u0646\u062A\u064A\u062C\u0629 \u0645\u0633\u062C\u0651\u0644\u0629 \u0628\u0639\u062F." }), selected.attempts.map((attempt) => (_jsxs("div", { className: "flex items-center justify-between gap-2 border-t border-line pt-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-bold", children: attempt.examTitle }), _jsxs("p", { className: "text-xs text-mute", children: [CATEGORY_META[attempt.category]?.label || attempt.category, attempt.percent == null ? '' : ` · ${attempt.percent}%`] })] }), _jsx("button", { type: "button", onClick: () => setAttemptId(attempt.id), className: "rounded-lg border border-gold px-3 py-1.5 text-xs font-bold text-gold", children: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0639\u0644\u0627\u0645\u0629" })] }, attempt.id)))] }), _jsxs("section", { className: "space-y-3 rounded-2xl border border-line bg-panel p-4", children: [_jsx("h2", { className: "font-bold text-gold", children: "\u0625\u0644\u062D\u0627\u0642 \u0628\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0641\u0639\u0651\u0644" }), openExams.length === 0 && _jsx("p", { className: "text-sm text-mute", children: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0641\u0639\u0651\u0644 \u062E\u0627\u0631\u062C \u062A\u0633\u062C\u064A\u0644\u0647 \u0627\u0644\u062D\u0627\u0644\u064A." }), openExams.map((exam) => (_jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: pickedExams.includes(exam.id), onChange: (e) => setPickedExams((prev) => e.target.checked ? [...prev, exam.id] : prev.filter((id) => id !== exam.id)) }), _jsx("span", { children: exam.title })] }, exam.id))), openExams.length > 0 && (_jsx("button", { type: "button", disabled: busy || !pickedExams.length, onClick: () => void enroll(), className: "rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40", children: "\u0625\u0644\u062D\u0627\u0642" }))] })] })] })), editing && selected && (_jsx(EditResultModal, { isOpen: true, onClose: () => setAttemptId(null), onSuccess: () => {
                    setAttemptId(null);
                    setMessage('اعتُمدت العلامة الجديدة وسُجّل السبب.');
                    void search();
                }, attemptId: editing.id, candidateName: selected.name, examTitle: editing.examTitle, category: editing.category, currentPercent: editing.percent }))] }));
}
