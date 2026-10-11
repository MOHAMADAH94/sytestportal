import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CheckCircle2, HelpCircle, Search, ShieldAlert, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiListSecurityQueue, apiSaveSecurityReview, apiSaveSecurityReviewsBulk, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
const DECISION_LABEL = {
    accepted: 'قبول',
    rejected: 'رفض',
    unspecified: 'غير محدد',
};
export function AdminSecurityReviewPage() {
    const { user } = useAuth();
    const [list, setList] = useState([]);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('pending');
    const [selected, setSelected] = useState(null);
    const [decision, setDecision] = useState('accepted');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [picked, setPicked] = useState([]);
    async function load() {
        if (!user?.token)
            return;
        setLoading(true);
        try {
            const rows = await apiListSecurityQueue(user.token);
            setList(rows);
            setError('');
            if (selected) {
                const fresh = rows.find((row) => row.id === selected.id) || null;
                setSelected(fresh);
                if (fresh?.review) {
                    setDecision(fresh.review.decision);
                    setNote(fresh.review.note || '');
                }
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الأمن');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void load();
    }, [user?.token]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return list.filter((row) => {
            const status = row.review?.decision || 'pending';
            if (filter === 'applicants' && row.examProgress !== 'partial')
                return false;
            if (filter === 'examinees' && row.examProgress !== 'complete')
                return false;
            if (filter === 'no_exam' && row.examProgress !== 'none')
                return false;
            if (['pending', 'accepted', 'rejected', 'unspecified'].includes(filter) && status !== filter)
                return false;
            if (!q)
                return true;
            return [row.name, row.jobTitle, row.org, row.interviewType, row.displayId, row.streamLabel, row.examProgressLabelAr]
                .join(' ')
                .toLowerCase()
                .includes(q);
        });
    }, [list, search, filter]);
    const counts = useMemo(() => ({
        all: list.length,
        pending: list.filter((r) => !r.review).length,
        accepted: list.filter((r) => r.review?.decision === 'accepted').length,
        rejected: list.filter((r) => r.review?.decision === 'rejected').length,
        unspecified: list.filter((r) => r.review?.decision === 'unspecified').length,
        applicants: list.filter((r) => r.examProgress === 'partial').length,
        examinees: list.filter((r) => r.examProgress === 'complete').length,
        no_exam: list.filter((r) => r.examProgress === 'none').length,
    }), [list]);
    function openReview(row) {
        setSelected(row);
        setDecision(row.review?.decision || (row.examProgress === 'none' ? 'unspecified' : 'accepted'));
        setNote(row.review?.note || '');
        setMessage('');
        setError('');
    }
    async function save() {
        if (!user?.token)
            return;
        const ids = picked.length ? picked : selected ? [selected.id] : [];
        if (!ids.length) {
            setError('حدد متقدماً واحداً على الأقل');
            return;
        }
        if (decision === 'rejected' && !note.trim()) {
            setError('أضف ملاحظة عند الرفض');
            return;
        }
        setSaving(true);
        setError('');
        try {
            if (ids.length === 1 && !picked.length) {
                await apiSaveSecurityReview(user.token, ids[0], { decision, note });
            }
            else {
                await apiSaveSecurityReviewsBulk(user.token, { applicantIds: ids, decision, note });
            }
            setMessage(`تم تسجيل قرار «${DECISION_LABEL[decision]}» لـ ${ids.length} متقدم`);
            setPicked([]);
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر حفظ القرار الأمني');
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("div", { className: "space-y-6", dir: "rtl", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0639\u0633\u0643\u0631\u064A" }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u0641\u0631\u0632 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0648\u0627\u0644\u0645\u0645\u062A\u062D\u0646\u064A\u0646 \u062D\u0633\u0628 \u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A. \u062E\u064A\u0627\u0631 \u00AB\u063A\u064A\u0631 \u0645\u062D\u062F\u062F\u00BB \u0644\u0645\u0646 \u0644\u0645 \u064A\u062A\u0642\u062F\u0645 \u0644\u0623\u064A \u0627\u062E\u062A\u0628\u0627\u0631. \u0627\u0644\u0642\u0628\u0648\u0644 \u0648\u0627\u0644\u0631\u0641\u0636 \u0642\u0631\u0627\u0631 \u0623\u0645\u0646\u064A \u0641\u0642\u0637 \u0628\u0644\u0627 \u062F\u0631\u062C\u0627\u062A." })] }), _jsx("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4", children: ([
                    { id: 'applicants', label: 'متقدمون (بعض الاختبارات)', count: counts.applicants },
                    { id: 'examinees', label: 'ممتحنون (أكملوا المطلوب)', count: counts.examinees },
                    { id: 'no_exam', label: 'غير محدد — بلا أي اختبار', count: counts.no_exam },
                    { id: 'all', label: 'الكل', count: counts.all },
                ]).map((chip) => (_jsxs("button", { type: "button", onClick: () => setFilter(chip.id), className: `rounded-2xl border p-4 text-right ${filter === chip.id ? 'border-gold bg-gold/15' : 'border-line bg-card'}`, children: [_jsx("div", { className: "font-extrabold text-light-gold", children: chip.label }), _jsx("div", { className: "mt-1 text-sm text-mute", children: chip.count })] }, chip.id))) }), _jsx("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4", children: ([
                    { id: 'pending', label: 'بانتظار القرار', count: counts.pending },
                    { id: 'accepted', label: 'مقبول', count: counts.accepted },
                    { id: 'rejected', label: 'مرفوض', count: counts.rejected },
                    { id: 'unspecified', label: 'قرار غير محدد', count: counts.unspecified },
                ]).map((chip) => (_jsxs("button", { type: "button", onClick: () => setFilter(chip.id), className: `rounded-2xl border p-4 text-right ${filter === chip.id ? 'border-gold bg-gold/15' : 'border-line bg-card'}`, children: [_jsx("div", { className: "font-extrabold text-light-gold", children: chip.label }), _jsx("div", { className: "mt-1 text-sm text-mute", children: chip.count })] }, chip.id))) }), _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" }), _jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), className: "w-full rounded-xl border border-line bg-panel py-2 pr-10 pl-3 text-sm text-text outline-none", placeholder: "\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0645\u0633\u0645\u0649 \u0623\u0648 \u0627\u0644\u062C\u0647\u0629 \u0623\u0648 \u0627\u0644\u0641\u0631\u0632" })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", className: "rounded-xl border border-line px-3 py-2 text-sm", onClick: () => setPicked(filtered.map((row) => row.id)), children: ["\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0638\u0627\u0647\u0631 (", filtered.length, ")"] }), _jsx("button", { type: "button", className: "rounded-xl border border-line px-3 py-2 text-sm", onClick: () => setPicked([]), children: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062A\u062D\u062F\u064A\u062F" }), _jsxs("span", { className: "self-center text-sm text-mute", children: ["\u0627\u0644\u0645\u062D\u062F\u062F: ", picked.length] })] }), error && _jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error }), message && _jsx("div", { className: "rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok", children: message }), loading ? (_jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." })) : (_jsxs("div", { className: "grid gap-4 lg:grid-cols-[1.2fr_1fr]", children: [_jsxs("div", { className: "grid max-h-[70vh] gap-2 overflow-auto", children: [filtered.map((row) => (_jsxs("div", { className: `flex items-start gap-3 rounded-2xl border p-4 text-right transition ${selected?.id === row.id ? 'border-gold bg-gold/10' : 'border-line bg-card'}`, children: [_jsx("input", { type: "checkbox", className: "mt-1", checked: picked.includes(row.id), "aria-label": `تحديد ${row.name}`, onChange: (event) => setPicked((prev) => event.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)) }), _jsx("button", { type: "button", onClick: () => openReview(row), className: "min-w-0 flex-1 text-right", children: _jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("div", { className: "text-xs font-bold text-gold", children: ["\u0645 ", row.seqNumber] }), _jsx("div", { className: "font-extrabold text-light-gold", children: row.name }), _jsxs("div", { className: "mt-1 text-xs text-mute", children: [row.jobTitle || 'بلا مسمى', row.org ? ` • ${row.org}` : '', row.streamLabel ? ` • فرز ${row.streamLabel}` : ''] }), _jsxs("div", { className: "mt-1 text-[11px] text-mute", children: [row.examProgressLabelAr || '—', row.requiredTracks?.length ? ` — ${row.requiredTracks.join('، ')}` : ''] })] }), !row.review ? (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-mute", children: [_jsx(ShieldAlert, { className: "h-3.5 w-3.5" }), " \u0628\u0627\u0646\u062A\u0638\u0627\u0631"] })) : row.review.decision === 'accepted' ? (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-lg border border-ok/40 bg-ok/10 px-2 py-1 text-[11px] text-ok", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5" }), " \u0645\u0642\u0628\u0648\u0644"] })) : row.review.decision === 'rejected' ? (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-lg border border-error/40 bg-error/10 px-2 py-1 text-[11px] text-error", children: [_jsx(XCircle, { className: "h-3.5 w-3.5" }), " \u0645\u0631\u0641\u0648\u0636"] })) : (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-lg border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn", children: [_jsx(HelpCircle, { className: "h-3.5 w-3.5" }), " \u063A\u064A\u0631 \u0645\u062D\u062F\u062F"] }))] }) })] }, row.id))), !filtered.length && _jsx("div", { className: "rounded-2xl border border-line p-8 text-center text-mute", children: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u062A\u0642\u062F\u0645\u0648\u0646 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636." })] }), _jsx("div", { className: "rounded-2xl border border-line bg-panel p-5", children: !selected && !picked.length ? (_jsx("p", { className: "text-sm text-mute", children: "\u062D\u062F\u062F \u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u062B\u0645 \u0633\u062C\u0651\u0644 \u0642\u0628\u0648\u0644\u0627\u064B \u0623\u0648 \u0631\u0641\u0636\u0627\u064B \u0623\u0648 \u063A\u064A\u0631 \u0645\u062D\u062F\u062F." })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-extrabold text-light-gold", children: picked.length > 1 ? `${picked.length} متقدمين محددين` : selected?.name || `${picked.length} متقدم` }), _jsxs("p", { className: "mt-1 text-sm text-mute", children: [picked.length > 1 ? 'يُطبَّق القرار والملاحظة على كل المحدد.' : (selected?.jobTitle || 'بلا مسمى'), picked.length <= 1 && selected?.org ? ` • ${selected.org}` : '', picked.length <= 1 && selected?.streamLabel ? ` • فرز ${selected.streamLabel}` : '', picked.length <= 1 && selected?.examProgressLabelAr ? ` • ${selected.examProgressLabelAr}` : ''] })] }), selected?.review && picked.length <= 1 && (_jsxs("div", { className: "rounded-xl border border-line bg-card px-3 py-2 text-xs text-mute", children: ["\u0622\u062E\u0631 \u0642\u0631\u0627\u0631: ", selected.review.decisionLabelAr, " \u2014 ", selected.review.reviewedByName, " \u2014", ' ', new Date(selected.review.reviewedAt).toLocaleString('ar')] })), _jsxs("div", { className: "grid gap-2 sm:grid-cols-3", children: [_jsx("button", { type: "button", onClick: () => setDecision('accepted'), className: `rounded-xl border px-4 py-3 font-bold ${decision === 'accepted' ? 'border-ok bg-ok/15 text-ok' : 'border-line bg-card text-mute'}`, children: "\u0642\u0628\u0648\u0644" }), _jsx("button", { type: "button", onClick: () => setDecision('rejected'), className: `rounded-xl border px-4 py-3 font-bold ${decision === 'rejected' ? 'border-error bg-error/15 text-error' : 'border-line bg-card text-mute'}`, children: "\u0631\u0641\u0636" }), _jsx("button", { type: "button", onClick: () => setDecision('unspecified'), className: `rounded-xl border px-4 py-3 font-bold ${decision === 'unspecified' ? 'border-warn bg-warn/15 text-warn' : 'border-line bg-card text-mute'}`, children: "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F" })] }), _jsxs("label", { className: "block text-xs font-bold text-mute", children: ["\u0645\u0644\u0627\u062D\u0638\u0629 ", decision === 'rejected' ? '(مطلوبة عند الرفض)' : '(اختياري)', _jsx("textarea", { value: note, onChange: (e) => setNote(e.target.value), rows: 5, className: "mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-text outline-none", placeholder: decision === 'rejected'
                                                ? 'سبب الرفض الأمني...'
                                                : decision === 'unspecified'
                                                    ? 'لم يتقدم لأي اختبار أو لم يُحسم قراره بعد...'
                                                    : 'ملاحظة أمنية إن وجدت...' })] }), _jsx("button", { type: "button", disabled: saving, onClick: () => void save(), className: "w-full rounded-xl bg-gold px-4 py-3 text-sm font-bold text-ink disabled:opacity-40", children: saving ? 'جاري الحفظ...' : picked.length > 1 ? `تطبيق القرار على ${picked.length}` : 'حفظ قرار الأمن' })] })) })] }))] }));
}
