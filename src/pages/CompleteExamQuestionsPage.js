import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiCommittee } from '../api/client';
const field = 'mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-text';
const button = 'rounded-xl border border-line px-4 py-2 text-sm text-gold disabled:opacity-40';
export function CompleteExamQuestionsPage() {
    const { examId } = useParams(), { user } = useAuth();
    const [data, setData] = useState(null), [forms, setForms] = useState({});
    const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const url = '/admin/exams/' + examId + '/pending-questions';
    const load = () => user && apiCommittee(user.token, url).then(setData).catch((e) => setError(e.message));
    useEffect(() => { void load(); }, [examId, user?.token]);
    function patch(key, index, value) {
        setForms((old) => ({ ...old, [key]: (old[key] || []).map((q, i) => i === index ? { ...q, ...value } : q) }));
    }
    async function save(key, source) {
        if (!user)
            return;
        if (source === 'manual' && !(forms[key]?.length)) {
            setError('أضف سؤالاً يدوياً واحداً على الأقل قبل الاعتماد');
            return;
        }
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await apiCommittee(user.token, url, 'POST', { key, source, questions: forms[key] || [] });
            setForms((old) => ({ ...old, [key]: [] }));
            setNotice(result.ready ? 'اكتملت جميع المجموعات وفُتح الاختبار.' : 'حُفظت أسئلة المجموعة من البنك؛ استكمل المجموعات المتبقية.');
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر الحفظ');
        }
        finally {
            setBusy(false);
        }
    }
    async function fillAllFromBank() {
        if (!user)
            return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await apiCommittee(user.token, url, 'POST', { source: 'bank-all', all: true });
            const failText = result.failures?.length ? ` بعض المجموعات لم تُملأ: ${result.failures.join('؛ ')}` : '';
            setNotice(result.ready
                ? `تم سحب الأسئلة من البنك لكل المجموعات (${result.filled}) وفُتح الاختبار.`
                : `تم تعبئة ${result.filled || 0} مجموعة من البنك.${failText}`);
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر التعبئة من البنك');
        }
        finally {
            setBusy(false);
        }
    }
    const pending = data?.groups?.length || 0;
    const bankReady = (data?.groups || []).filter((g) => (g.availableFromBank || 0) > 0).length;
    return _jsxs("div", { className: "mx-auto max-w-4xl space-y-5", dir: "rtl", children: [_jsx("h1", { className: "text-2xl font-bold text-gold", children: "\u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0627\u0644\u0628\u0646\u0643" }), _jsx("p", { children: data?.exam?.title }), _jsx("p", { className: "text-mute", children: "\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u062A\u064F\u0633\u062D\u0628 \u0645\u0646 \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u062D\u0633\u0628 \u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0648\u0638\u064A\u0641\u064A \u0644\u0643\u0644 \u0645\u062A\u0642\u062F\u0645. \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062A\u062E\u0635\u0635 \u0623\u0648\u0644\u0627\u064B\u060C \u0648\u0627\u0644\u0645\u0634\u062A\u0631\u0643\u0629 \u0627\u062D\u062A\u064A\u0627\u0637 \u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0642\u064A\u0627\u062F\u0629 \u0648\u0627\u0644\u0634\u062E\u0635\u064A\u0629 \u0641\u0642\u0637. \u0627\u0644\u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u064A\u062F\u0648\u064A \u0639\u0646\u062F \u063A\u064A\u0627\u0628 \u0623\u0633\u0626\u0644\u0629 \u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0644\u0645\u0633\u0645\u0649." }), pending > 0 && (_jsxs("div", { className: "space-y-3 rounded-xl border border-gold/40 bg-gold/10 p-4", children: [_jsxs("p", { className: "text-light-gold", children: ["\u0645\u062A\u0628\u0642\u064D ", pending, " \u0645\u062C\u0645\u0648\u0639\u0629 \u0628\u0644\u0627 \u0623\u0633\u0626\u0644\u0629. \u0645\u062A\u0627\u062D \u0645\u0646 \u0627\u0644\u0628\u0646\u0643 \u0644\u0640 ", bankReady, " \u0645\u062C\u0645\u0648\u0639\u0629."] }), user?.role !== 'commander' && (_jsx("button", { disabled: busy || bankReady === 0, className: "rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink disabled:opacity-40", onClick: () => void fillAllFromBank(), children: "\u062A\u0639\u0628\u0626\u0629 \u0643\u0644 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A \u0627\u0644\u0641\u0627\u0631\u063A\u0629 \u0645\u0646 \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629" }))] })), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx(Link, { className: button, to: "/admin", children: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A" }), _jsx(Link, { className: button, to: "/banks", children: "\u0625\u062F\u0627\u0631\u0629 \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629" }), data?.exam && !data.exam.pendingQuestions && data.exam.showsBarcode !== false && _jsx(Link, { className: button, to: '/admin/roster/' + examId, children: "\u0628\u0637\u0627\u0642\u0627\u062A QR \u062C\u0627\u0647\u0632\u0629" })] }), error && _jsx("p", { role: "alert", className: "rounded-xl border border-error/40 bg-error/10 p-3 text-error", children: error }), notice && _jsx("p", { role: "status", className: "rounded-xl border border-ok/40 bg-ok/10 p-3 text-ok", children: notice }), data?.groups.length === 0 && _jsx("p", { className: "rounded-xl border border-ok p-4 text-ok", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u062C\u0645\u0648\u0639\u0627\u062A \u062E\u0627\u0644\u064A\u0629. \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u064F\u0639\u0628\u0651\u064E\u0623 \u0645\u0646 \u0627\u0644\u0628\u0646\u0643." }), data?.groups.map((group) => _jsxs("section", { className: "space-y-4 rounded-2xl border border-line bg-card p-5", children: [_jsxs("h2", { className: "text-lg font-bold text-gold", children: [group.jobTitle, " \u2014 ", group.applicantCount, " \u0645\u062A\u0642\u062F\u0645"] }), _jsxs("p", { children: ["\u0627\u0644\u0645\u0637\u0644\u0648\u0628: ", group.requested, " \u0633\u0624\u0627\u0644 \u00B7 \u0627\u0644\u0645\u062A\u0627\u062D \u0641\u064A \u0627\u0644\u0628\u0646\u0643: ", group.availableFromBank ?? '—'] }), user?.role !== 'commander' && _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx("button", { disabled: busy || !(group.availableFromBank > 0), className: "rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40", onClick: () => void save(group.key, 'bank'), children: "\u0633\u062D\u0628 \u0623\u0633\u0626\u0644\u0629 \u0647\u0630\u0647 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u0645\u0646 \u0627\u0644\u0628\u0646\u0643" }), _jsx("button", { disabled: busy, className: button, onClick: () => setForms((old) => ({ ...old, [group.key]: [...(old[group.key] || []), { text: '', answerKey: '', points: 5, trait: 'سلوك العمل', reverse: false }] })), children: "\u0625\u0636\u0627\u0641\u0629 \u0633\u0624\u0627\u0644 \u064A\u062F\u0648\u064A (\u0627\u062D\u062A\u064A\u0627\u0637\u064A)" })] }), (forms[group.key] || []).map((q, i) => _jsxs("article", { className: "space-y-3 rounded-xl border border-line p-4", children: [_jsxs("label", { className: "block", children: [data.exam.category === 'personality' ? 'عبارة يجيب عنها المتقدم بمقياس موافقة من 1 إلى 5' : 'السؤال', _jsx("textarea", { className: field, value: q.text, onChange: (e) => patch(group.key, i, { text: e.target.value }) })] }), data.exam.category === 'personality' ? _jsxs(_Fragment, { children: [_jsxs("label", { className: "block", children: ["\u0627\u0644\u0633\u0645\u0629", _jsx("input", { className: field, value: q.trait, onChange: (e) => patch(group.key, i, { trait: e.target.value }) })] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: q.reverse, onChange: (e) => patch(group.key, i, { reverse: e.target.checked }) }), " \u0639\u0628\u0627\u0631\u0629 \u0630\u0627\u062A \u0627\u062A\u062C\u0627\u0647 \u0645\u0639\u0643\u0648\u0633"] })] }) : _jsxs(_Fragment, { children: [_jsxs("label", { className: "block", children: ["\u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C\u064A\u0629 \u0648\u0645\u0639\u064A\u0627\u0631 \u0627\u0644\u062A\u0635\u062D\u064A\u062D", _jsx("textarea", { className: field, value: q.answerKey, onChange: (e) => patch(group.key, i, { answerKey: e.target.value }) })] }), _jsxs("label", { className: "block", children: ["\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0639\u0638\u0645\u0649", _jsx("input", { className: field, type: "number", min: "1", max: "100", value: q.points, onChange: (e) => patch(group.key, i, { points: Number(e.target.value) }) })] })] }), _jsx("button", { className: button, onClick: () => setForms((old) => ({ ...old, [group.key]: old[group.key].filter((_, n) => n !== i) })), children: "\u062D\u0630\u0641 \u0627\u0644\u0633\u0624\u0627\u0644 \u063A\u064A\u0631 \u0627\u0644\u0645\u062D\u0641\u0648\u0638" })] }, i)), (forms[group.key]?.length || 0) > 0 && _jsxs("button", { disabled: busy, className: "rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40", onClick: () => void save(group.key, 'manual'), children: ["\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u064A\u062F\u0648\u064A\u0629 \u0644\u0644\u0645\u062C\u0645\u0648\u0639\u0629 (", forms[group.key].length, ")"] })] }, group.key))] });
}
