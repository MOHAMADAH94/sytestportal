import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiCommittee, apiListEvaluationCandidates } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { CATEGORY_META } from '../data/types';
import { JOB_PROFILES, effectiveJobTitle, groupApplicants, inferJobLevel, oralRolesCompatible, resolveJobProfile } from '../../shared/jobProfiles.js';
import { candidateVisibleToOperator, EVALUATION_TRACKS, summarizeTracksForApplicants, } from '../../shared/evaluationMatrix.js';
import { CLASSIFICATION_RULES, COMMITTEE_LANES } from '../../shared/committeeCatalog.js';
const field = 'w-full rounded-xl border border-line bg-panel px-3 py-2 text-text';
const button = 'rounded-xl border border-line px-4 py-2 hover:border-gold disabled:opacity-40';
const primary = 'rounded-xl bg-gold px-6 py-3 font-bold text-black disabled:opacity-40';
const evaluationModes = [
    { id: 'suggested', title: 'أسئلة مقترحة من النظام', text: 'مراجعة أسئلة البنك وتعديلها واعتماد المناسب.' },
    { id: 'qr', title: 'اختبار عبر QR مع المراقبة', text: 'دخول المتقدم عبر QR ومتابعة الشاشة والتقدم والتنبيهات المتاحة.' },
    { id: 'interview', title: 'مقابلة مباشرة', text: 'استخدام المتاح من البنك أو إدخال أسئلة المقيم مباشرة، ثم تسجيل الإجابات والدرجات.' },
    { id: 'manual', title: 'مقابلة يدوية بالكامل', text: 'لا تحتاج بنك الأسئلة؛ يكتب المقيم الأسئلة والإجابات المتوقعة والأوزان.' },
];
const packageLabels = {
    oral: 'شفهي',
    driving: 'أهلية قيادة',
    personality: 'شخصية',
};
const FORMAT_OPTIONS = [
    { id: 'mixed', title: 'جميع الأنماط المتاحة', text: 'مزيج من أنماط البنك المناسبة لنوع التقييم.' },
    { id: 'objective', title: 'اختيار من متعدد', text: 'أسئلة MCQ وصح/خطأ من البنك.' },
    { id: 'written', title: 'كتابي / مقالي', text: 'أسئلة كتابية تتطلب إجابة نصية وتقييمًا يدويًا.' },
];
/** مسارات الفرز — من جدول اللجان الواحد */
const SORT_LANES = COMMITTEE_LANES.map((lane) => ({
    ...lane,
    category: lane.category,
}));
function questionTypesFor(category, format) {
    if (category === 'oral')
        return ['oral'];
    if (category === 'personality') {
        if (format === 'written')
            return ['open'];
        if (format === 'objective')
            return ['scale'];
        return [];
    }
    if (format === 'objective')
        return ['mcq', 'true_false'];
    if (format === 'written')
        return ['open', 'classic'];
    return [];
}
function laneOperatorView(lane) {
    return {
        role: 'operator',
        category: lane.category,
        oralRole: lane.oralRole,
        theoryTrack: lane.theoryTrack,
    };
}
function applicantInLane(applicant, lane) {
    return candidateVisibleToOperator(laneOperatorView(lane), applicant);
}
/** لجنة الحساب الجاهز فقط — owner_username = oral_tech / driving / … */
function committeeForLane(committees, lane) {
    const owner = lane.username.toLowerCase();
    return (committees.find((c) => String(c.owner_username || c.ownerUsername || '').toLowerCase() === owner) || null);
}
/** واجهة الأدمن: فرز حسب oral_tech / theory / … ثم تمرير للجنة */
function AdminSortToCommittee({ token }) {
    const [laneId, setLaneId] = useState('oral_tech');
    const [candidates, setCandidates] = useState([]);
    const [committees, setCommittees] = useState([]);
    const [committeeId, setCommitteeId] = useState('');
    const [selected, setSelected] = useState([]);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const lane = SORT_LANES.find((l) => l.id === laneId) || SORT_LANES[0];
    const targetCommittee = useMemo(() => committeeForLane(committees, lane), [committees, lane]);
    useEffect(() => {
        apiListEvaluationCandidates(token)
            .then(setCandidates)
            .catch((e) => setError(e instanceof Error ? e.message : 'تعذر تحميل المتقدمين'));
        apiCommittee(token, '/committees')
            .then(setCommittees)
            .catch(() => setCommittees([]));
    }, [token]);
    useEffect(() => {
        setCommitteeId(targetCommittee?.id || '');
        setSelected([]);
        setMessage('');
    }, [laneId, targetCommittee]);
    const pool = useMemo(() => {
        const q = search.trim().toLowerCase();
        return candidates.filter((a) => {
            if (!applicantInLane(a, lane))
                return false;
            if (!q)
                return true;
            const title = effectiveJobTitle(a);
            return [a.name, title, a.jobTitle, a.org, a.evaluationStreamLabel]
                .filter(Boolean)
                .some((s) => String(s).toLowerCase().includes(q));
        });
    }, [candidates, lane, search]);
    const byJob = useMemo(() => {
        const groups = groupApplicants(pool);
        const byId = new Map(pool.map((a) => [a.id, a]));
        return groups
            .map((g) => ({
            ...g,
            applicants: g.applicantIds.map((id) => byId.get(id)).filter(Boolean),
        }))
            .sort((a, b) => {
            if (a.missingTitle !== b.missingTitle)
                return a.missingTitle ? 1 : -1;
            return (a.jobTitle || '').localeCompare(b.jobTitle || '', 'ar');
        });
    }, [pool]);
    const unresolved = useMemo(() => candidates.filter((a) => a.evaluationStream === 'unresolved' || !effectiveJobTitle(a)), [candidates]);
    async function forwardToCommittee() {
        if (!committeeId || !selected.length)
            return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const result = await apiCommittee(token, `/committees/${committeeId}/candidates`, 'POST', { applicantIds: selected });
            setMessage(`فُرز ${result.addedCount} متقدم لحساب ${lane.username}` +
                (result.skippedCount ? ` (تُجُوهل ${result.skippedCount})` : '') +
                `. ادخل بحساب «${lane.username}» لإنشاء الاختبار.`);
            setSelected([]);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر التمرير للجنة');
        }
        finally {
            setBusy(false);
        }
    }
    async function sortAll() {
        setBusy(true);
        setError('');
        setMessage('');
        const lines = [];
        try {
            for (const item of SORT_LANES) {
                if (!item.toCommittee)
                    continue;
                const committee = committeeForLane(committees, item);
                const ids = candidates.filter((a) => applicantInLane(a, item)).map((a) => a.id);
                if (!committee || !ids.length)
                    continue;
                const result = await apiCommittee(token, `/committees/${committee.id}/candidates`, 'POST', { applicantIds: ids });
                const reasons = [...new Set((result.skipped || []).map((row) => row.reason).filter(Boolean))];
                lines.push(`${item.label}: فُرز ${result.addedCount}` +
                    (result.skippedCount ? `، تُجوهل ${result.skippedCount}${reasons.length ? ` (${reasons.join('، ')})` : ''}` : ''));
            }
            if (unresolved.length)
                lines.push(`مسمى غير معروف ولم يُفرز: ${unresolved.length}`);
            setMessage(lines.length ? lines.join('\n') : 'لا متقدمين مطابقين للفرز.');
            setSelected([]);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر الفرز');
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "mx-auto max-w-6xl space-y-6", dir: "rtl", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gold", children: "\u0641\u0631\u0632 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u062D\u0633\u0628 \u0627\u0644\u0645\u0635\u0641\u0648\u0641\u0629" }), _jsx("p", { className: "mt-2 text-mute", children: "\u0643\u0644 \u0645\u062A\u0642\u062F\u0645 \u064A\u0630\u0647\u0628 \u0625\u0644\u0649 \u0627\u0644\u0644\u062C\u0627\u0646 \u0627\u0644\u062A\u064A \u062A\u0637\u0627\u0628\u0642 \u0645\u0633\u0645\u0627\u0647. \u0627\u0644\u0645\u0633\u0645\u0649 \u063A\u064A\u0631 \u0627\u0644\u0645\u0639\u0631\u0648\u0641 \u0644\u0627 \u064A\u064F\u0641\u0631\u0632. \u0627\u0644\u0644\u062C\u0646\u0629 \u0628\u0639\u062F\u0647\u0627 \u062A\u0646\u0634\u0626 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629." }), _jsx("p", { className: "mt-2 text-sm text-light-gold", children: "\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u062C\u0627\u0647\u0632\u0629 \u0647\u064A \u0627\u0644\u0644\u062C\u0627\u0646 \u2014 \u0644\u0627 \u062A\u064F\u0646\u0634\u0623 \u0643\u0644\u0645\u0627\u062A \u0645\u0631\u0648\u0631 \u062C\u062F\u064A\u062F\u0629." })] }), _jsxs("section", { className: "grid gap-4 lg:grid-cols-2", children: [_jsxs("div", { className: "overflow-hidden rounded-2xl border border-line bg-card", children: [_jsx("h2", { className: "border-b border-line px-4 py-3 font-bold text-gold", children: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u062D\u0633\u0628 \u0627\u0644\u062A\u0635\u0646\u064A\u0641" }), _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-2 text-right font-medium", children: "\u0627\u0644\u062A\u0635\u0646\u064A\u0641" }), _jsx("th", { className: "px-4 py-2 text-right font-medium", children: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A" })] }) }), _jsx("tbody", { children: Object.values(CLASSIFICATION_RULES).map((rule) => (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "px-4 py-2 font-bold", children: rule.label }), _jsx("td", { className: "px-4 py-2", children: rule.examTrackIds.map((id) => EVALUATION_TRACKS[id]?.label || id).join('، ') })] }, rule.id))) })] })] }), _jsxs("div", { className: "overflow-hidden rounded-2xl border border-line bg-card", children: [_jsx("h2", { className: "border-b border-line px-4 py-3 font-bold text-gold", children: "\u0627\u0644\u0644\u062C\u0627\u0646 \u0648\u0645\u0627 \u062A\u062E\u062A\u0628\u0631\u0647" }), _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-2 text-right font-medium", children: "\u0627\u0644\u062D\u0633\u0627\u0628" }), _jsx("th", { className: "px-4 py-2 text-right font-medium", children: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" }), _jsx("th", { className: "px-4 py-2 text-right font-medium", children: "\u0627\u0644\u062A\u0635\u0646\u064A\u0641\u0627\u062A" })] }) }), _jsx("tbody", { children: COMMITTEE_LANES.map((lane) => (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "px-4 py-2 font-mono text-xs", children: lane.username }), _jsx("td", { className: "px-4 py-2", children: lane.tests }), _jsx("td", { className: "px-4 py-2", children: lane.classifications.join('، ') })] }, lane.username))) })] })] })] }), error && (_jsx("div", { role: "alert", className: "rounded-xl border border-error/40 p-4 text-error", children: error })), message && _jsx("p", { className: "whitespace-pre-line rounded-xl border border-ok/40 bg-ok/10 p-3 text-ok", children: message }), !!unresolved.length && (_jsxs("section", { className: "space-y-2 rounded-2xl border border-warn/40 bg-warn/10 p-5", children: [_jsxs("h2", { className: "font-bold text-warn", children: ["\u0645\u0633\u0645\u0649 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641 \u2014 \u0644\u0627 \u064A\u064F\u0641\u0631\u0632 (", unresolved.length, ")"] }), _jsx("p", { className: "text-sm text-mute", children: "\u0635\u062D\u0651\u062D \u0627\u0644\u0645\u0633\u0645\u0649 \u0641\u064A \u0633\u062C\u0644 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u062D\u062A\u0649 \u064A\u064F\u062D\u0633\u0628 \u0645\u0633\u0627\u0631\u0647 \u0641\u064A \u0627\u0644\u0645\u0635\u0641\u0648\u0641\u0629." }), _jsx("ul", { className: "max-h-40 space-y-1 overflow-auto text-sm", children: unresolved.slice(0, 40).map((a) => (_jsxs("li", { children: [a.name, " \u2014 ", effectiveJobTitle(a) || 'بلا مسمى'] }, a.id))) })] })), _jsx("button", { type: "button", className: primary, disabled: busy || !candidates.length, onClick: () => void sortAll(), children: busy ? 'جاري الفرز…' : 'فرز الجميع حسب المصفوفة' }), _jsxs("section", { className: "space-y-4 rounded-2xl border border-gold/40 bg-card p-5", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm font-bold text-gold", children: "\u0627\u0644\u062E\u0637\u0648\u0629 \u0627\u0644\u0623\u0648\u0644\u0649" }), _jsx("h2", { className: "mt-1 text-xl font-bold", children: "\u0627\u062E\u062A\u0631 \u0645\u0633\u0627\u0631 \u0627\u0644\u0641\u0631\u0632" })] }), _jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: SORT_LANES.map((l) => {
                            const count = candidates.filter((a) => applicantInLane(a, l)).length;
                            const ready = l.toCommittee ? !!committeeForLane(committees, l) : true;
                            return (_jsxs("button", { type: "button", onClick: () => setLaneId(l.id), className: `rounded-2xl border p-4 text-right transition ${laneId === l.id ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'}`, children: [_jsx("div", { className: "font-mono text-xs text-mute", children: l.username }), _jsx("div", { className: "mt-1 font-bold text-gold", children: l.label }), _jsx("div", { className: "mt-1 text-xs text-mute", children: l.description }), _jsxs("div", { className: "mt-2 text-xs text-mute", children: [count, " \u0645\u062A\u0642\u062F\u0645", l.toCommittee ? (ready ? ' · حساب جاهز' : ' · بانتظار التهيئة') : ' · من حساب الأمن'] })] }, l.id));
                        }) })] }), _jsxs("section", { className: "space-y-4 rounded-2xl border border-line bg-card p-5", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm font-bold text-gold", children: "\u0627\u0644\u062E\u0637\u0648\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629" }), _jsxs("h2", { className: "mt-1 text-xl font-bold", children: ["\u0627\u0644\u0645\u0641\u0631\u0648\u0632\u0648\u0646 \u0644\u0645\u0633\u0627\u0631 ", _jsx("span", { className: "font-mono text-gold", children: lane.username })] }), _jsxs("p", { className: "mt-1 text-sm text-mute", children: ["\u0645\u062C\u0645\u0651\u0639\u0648\u0646 \u062D\u0633\u0628 \u0645\u0633\u0645\u0649 \u0627\u0644\u0639\u0645\u0644 (", pool.length, " \u0645\u062A\u0642\u062F\u0645 \u00B7 ", byJob.length, " \u0645\u0633\u0645\u0649)"] })] }), _jsx("input", { "aria-label": "\u0628\u062D\u062B", className: field, placeholder: "\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0645\u0633\u0645\u0649 \u0623\u0648 \u0627\u0644\u062C\u0647\u0629", value: search, onChange: (e) => setSearch(e.target.value) }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs("button", { type: "button", className: button, onClick: () => setSelected(pool.map((a) => a.id)), children: ["\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0643\u0644 \u0627\u0644\u0645\u0641\u0631\u0648\u0632 (", pool.length, ")"] }), _jsx("button", { type: "button", className: button, onClick: () => setSelected([]), children: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062A\u062D\u062F\u064A\u062F" })] }), _jsxs("div", { className: "max-h-96 space-y-3 overflow-auto", children: [byJob.map((g) => {
                                const ids = g.applicants.map((a) => a.id);
                                const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
                                return (_jsxs("div", { className: "rounded-xl border border-line", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel/50 px-3 py-2", children: [_jsxs("span", { className: "font-bold text-gold", children: [g.missingTitle || !g.jobTitle ? 'بلا مسمى' : g.jobTitle, _jsx("span", { className: "mr-2 text-xs font-normal text-mute", children: g.applicants.length })] }), _jsx("button", { type: "button", className: button, onClick: () => setSelected((prev) => allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]), children: allOn ? 'إلغاء المجموعة' : 'تحديد المجموعة' })] }), _jsx("div", { className: "grid gap-1 p-2 md:grid-cols-2", children: g.applicants.map((a) => {
                                                const tracks = (a.evaluationTracks || []).map((t) => t.label).join(' · ');
                                                return (_jsxs("label", { className: "flex cursor-pointer items-start gap-2 rounded-lg border border-transparent p-2 hover:border-line", children: [_jsx("input", { type: "checkbox", className: "mt-1", checked: selected.includes(a.id), onChange: (e) => setSelected((prev) => e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)) }), _jsxs("span", { children: [a.name, _jsxs("small", { className: "block text-mute", children: [a.org || '—', a.evaluationStreamLabel ? ` · ${a.evaluationStreamLabel}` : '', tracks ? ` — ${tracks}` : ''] })] })] }, a.id));
                                            }) })] }, g.key));
                            }), !byJob.length && _jsx("p", { className: "p-4 text-mute", children: "\u0644\u0627 \u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0627\u0631 \u0648\u0641\u0642 \u0645\u0635\u0641\u0648\u0641\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645." })] })] }), lane.toCommittee ? (_jsxs("section", { className: "space-y-4 rounded-2xl border border-gold/40 bg-gold/5 p-5", children: [_jsxs("h2", { className: "text-lg font-bold text-gold", children: ["\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0641\u0631\u0632 \u0644\u062D\u0633\u0627\u0628 ", _jsx("span", { className: "font-mono", children: lane.username })] }), !targetCommittee ? (_jsxs("p", { className: "text-sm text-warn", children: ["\u0644\u062C\u0646\u0629 \u0627\u0644\u062D\u0633\u0627\u0628 \u00AB", lane.username, "\u00BB \u063A\u064A\u0631 \u062C\u0627\u0647\u0632\u0629 \u0628\u0639\u062F. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u062E\u0627\u062F\u0645 \u2014 \u062A\u064F\u0646\u0634\u0623 \u0627\u0644\u0644\u062C\u0627\u0646 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0639\u0646\u062F \u0641\u062A\u062D \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0644\u062C\u0627\u0646."] })) : (_jsxs(_Fragment, { children: [_jsxs("p", { className: "text-sm text-mute", children: ["\u0627\u0644\u0647\u062F\u0641: ", targetCommittee.name, " \u2014 \u0627\u0644\u0641\u0631\u0632 \u0641\u0642\u0637 \u062F\u0648\u0646 \u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631. \u0627\u062F\u062E\u0644 \u0644\u0627\u062D\u0642\u0627\u064B \u0628\u062D\u0633\u0627\u0628", ' ', _jsx("span", { className: "font-mono text-gold", children: lane.username }), " \u0644\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631."] }), _jsx("button", { type: "button", className: primary, disabled: busy || !selected.length || !committeeId, onClick: () => void forwardToCommittee(), children: busy ? 'جاري الفرز…' : `تأكيد فرز ${selected.length} متقدم لحساب ${lane.username}` })] }))] })) : (_jsxs("section", { className: "rounded-2xl border border-line bg-card p-5 text-sm text-mute", children: ["\u0645\u0633\u0627\u0631 \u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0639\u0633\u0643\u0631\u064A \u064A\u064F\u062F\u0627\u0631 \u0645\u0646 \u062D\u0633\u0627\u0628\u0647 \u0645\u0628\u0627\u0634\u0631\u0629 \u0648\u0644\u064A\u0633 \u0639\u0628\u0631 \u0644\u062C\u0646\u0629 \u0641\u0631\u0632 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A.", _jsx(Link, { className: "mr-2 text-gold underline", to: "/admin/applicants", children: "\u0633\u062C\u0644 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646" })] }))] }));
}
export function AdminCreateExamPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [category, setCategory] = useState(user?.role === 'operator' ? user.category || '' : '');
    const [packageMode, setPackageMode] = useState(false);
    const [evaluationMode, setEvaluationMode] = useState('');
    const [questionFormat, setQuestionFormat] = useState('mixed');
    const [questionCount, setQuestionCount] = useState(20);
    const [title, setTitle] = useState('');
    const [candidates, setCandidates] = useState([]);
    const [selected, setSelected] = useState([]);
    const [search, setSearch] = useState('');
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState(null);
    useEffect(() => {
        if (!user?.token || isAdmin)
            return;
        apiListEvaluationCandidates(user.token)
            .then(setCandidates)
            .catch((e) => setError(e.message));
    }, [user?.token, isAdmin]);
    const questionTypes = useMemo(() => questionTypesFor(category, questionFormat), [category, questionFormat]);
    const showFormatPicker = !packageMode && !!category && category !== 'oral' && evaluationMode !== 'manual';
    const formatOptions = useMemo(() => {
        if (category === 'personality') {
            return [
                { id: 'mixed', title: 'مقياس السمات (الافتراضي)', text: 'عبارات مقياس موافقة من 1 إلى 5.' },
                { id: 'objective', title: 'مقياس السمات فقط', text: 'أسئلة scale من بنك الشخصية.' },
                { id: 'written', title: 'كتابي معرفي', text: 'أسئلة مقالية معرفية من بنك الشخصية.' },
            ];
        }
        return FORMAT_OPTIONS;
    }, [category]);
    const groups = useMemo(() => groupApplicants(candidates.filter((a) => selected.includes(a.id))), [candidates, selected]);
    const configs = groups.map((g) => {
        const profile = JOB_PROFILES.find((p) => p.id === (g.profileId || 'unclassified')) || JOB_PROFILES.find((p) => p.id === 'unclassified');
        return {
            key: g.key,
            profileId: profile.id,
            specialty: profile.specialty,
            jobLevel: inferJobLevel(g.jobTitle),
            difficulty: 'mixed',
            questionCount: Math.max(1, Math.min(100, Number(questionCount) || 20)),
            includeShared: ['driving', 'personality'].includes(category),
            skills: [],
            questionTypes: packageMode ? [] : questionTypes,
        };
    });
    const payload = packageMode
        ? { title, evaluationMode: 'qr', applicantIds: selected, groups: configs }
        : { title, category, evaluationMode: category === 'theory' ? null : evaluationMode, applicantIds: selected, groups: configs };
    const fingerprint = JSON.stringify(payload);
    const currentPreview = preview?.fingerprint === fingerprint ? preview : null;
    const trackIdForCategory = useMemo(() => {
        if (packageMode)
            return null;
        if (category === 'personality')
            return 'personality';
        if (category === 'driving')
            return 'driving';
        if (category === 'security')
            return 'security';
        if (category === 'theory')
            return user?.theoryTrack === 'office' ? 'writing' : 'general';
        if (category === 'oral') {
            const role = user?.oralRole || '';
            if (['programmer', 'systems_engineer'].includes(role))
                return 'programming';
            if (role === 'network_engineer')
                return 'networks';
            if (role === 'admin')
                return 'admin_oral';
            return 'maintenance';
        }
        return null;
    }, [category, packageMode, user?.oralRole, user?.theoryTrack]);
    const matrixSummary = useMemo(() => summarizeTracksForApplicants(candidates.filter((a) => selected.includes(a.id))), [candidates, selected]);
    const visible = candidates.filter((a) => {
        if (user?.role === 'operator' && category === 'oral' && user.oralRole) {
            const role = resolveJobProfile(effectiveJobTitle(a) || a.jobTitle || '')?.oralRole;
            if (role && !oralRolesCompatible(user.oralRole, role))
                return false;
        }
        if (trackIdForCategory && Array.isArray(a.evaluationTracks) && a.evaluationTracks.length) {
            if (!a.evaluationTracks.some((t) => t.id === trackIdForCategory))
                return false;
        }
        const jobTitle = effectiveJobTitle(a);
        return !search || [a.name, jobTitle, a.jobTitle, a.jobTitleOrg, a.jobTitleCommittee, a.org, a.evaluationStreamLabel].some((s) => s?.includes(search));
    });
    async function submit(create) {
        if (!user)
            return;
        setBusy(true);
        setError('');
        try {
            const path = packageMode
                ? create
                    ? '/admin/exams/package'
                    : '/admin/exams/package/preview'
                : create
                    ? '/admin/exams'
                    : '/admin/exams/preview';
            const data = await apiCommittee(user.token, path, 'POST', payload);
            if (create)
                setCreated({ ...data, evaluationMode: payload.evaluationMode, package: packageMode || !!data.package, questionFormat, splitOral: !!data.splitOral });
            else
                setPreview({ ...data, fingerprint });
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر تنفيذ الطلب');
        }
        finally {
            setBusy(false);
        }
    }
    if (user?.role === 'commander') {
        return (_jsxs("div", { className: "rounded-xl border border-line p-6 text-center", children: [_jsx("p", { className: "text-mute", children: "\u062D\u0633\u0627\u0628 \u0627\u0644\u0642\u0627\u0626\u062F \u0645\u062E\u0635\u0635 \u0644\u0644\u0639\u0631\u0636 \u0648\u0644\u0627 \u064A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A." }), _jsx(Link, { className: "mt-4 inline-block text-gold", to: "/admin", children: "\u0627\u0644\u0639\u0648\u062F\u0629 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A" })] }));
    }
    if (isAdmin && user?.token) {
        return _jsx(AdminSortToCommittee, { token: user.token });
    }
    if (created?.package && created.exams) {
        return (_jsxs("div", { className: "mx-auto max-w-4xl space-y-5", dir: "rtl", children: [_jsx("h1", { className: "text-2xl font-bold text-gold", children: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u062D\u0632\u0645\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0639\u0628\u0631 QR" }), _jsx("p", { children: "\u062A\u064F\u0641\u0635\u0644 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0634\u0641\u0647\u064A \u062D\u0633\u0628 \u0627\u0644\u062A\u062E\u0635\u0635 \u0644\u064A\u0631\u062A\u0628\u0637 \u0643\u0644 \u0627\u062E\u062A\u0628\u0627\u0631 \u0628\u062D\u0633\u0627\u0628\u0647." }), _jsx("div", { className: "grid gap-3", children: created.exams.map((exam) => (_jsxs("article", { className: "rounded-2xl border border-line bg-card p-4", children: [_jsx("h2", { className: "font-bold text-gold", children: exam.title }), _jsxs("p", { className: "text-sm text-mute", children: [packageLabels[exam.category] || exam.category, exam.oralLabel ? ` — ${exam.oralLabel}` : '', " \u2022 ", exam.rosterCount || exam.roster?.length || 0, " \u0645\u062A\u0642\u062F\u0645"] }), exam.showsBarcode !== false && (_jsx(Link, { className: button + ' mt-3 inline-block', to: '/admin/roster/' + exam.id, children: "\u0628\u0637\u0627\u0642\u0627\u062A QR" }))] }, exam.id))) }), _jsx("button", { className: button, onClick: () => { setCreated(null); setPreview(null); }, children: "\u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631 \u0622\u062E\u0631" })] }));
    }
    if (created?.splitOral && created.exams) {
        return (_jsxs("div", { className: "mx-auto max-w-4xl space-y-5", dir: "rtl", children: [_jsx("h1", { className: "text-2xl font-bold text-gold", children: "\u062A\u0645 \u0641\u0635\u0644 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0634\u0641\u0647\u064A \u062D\u0633\u0628 \u0627\u0644\u062A\u062E\u0635\u0635" }), _jsx("p", { children: "oral_tech \u00B7 oral_prog \u00B7 oral_net" }), _jsx("div", { className: "grid gap-3", children: created.exams.map((exam) => (_jsxs("article", { className: "rounded-2xl border border-line bg-card p-4", children: [_jsx("h2", { className: "font-bold text-gold", children: exam.title }), exam.showsBarcode !== false && (_jsx(Link, { className: button + ' mt-3 inline-block', to: '/admin/roster/' + exam.id, children: "\u0628\u0637\u0627\u0642\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644" }))] }, exam.id))) }), _jsx("button", { className: button, onClick: () => { setCreated(null); setPreview(null); }, children: "\u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631 \u0622\u062E\u0631" })] }));
    }
    if (created) {
        return (_jsxs("div", { className: "mx-auto max-w-4xl space-y-5", dir: "rtl", children: [_jsxs("h1", { className: "text-2xl font-bold text-gold", children: ["\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 ", created.title] }), created.evaluationMode && (_jsxs("p", { className: "rounded-xl border border-gold/40 p-3 text-light-gold", children: ["\u0648\u0636\u0639 \u0627\u0644\u062A\u0646\u0641\u064A\u0630: ", evaluationModes.find((mode) => mode.id === created.evaluationMode)?.title] })), created.pendingQuestions ? (_jsx(Link, { className: "inline-block rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink", to: '/admin/complete-questions/' + created.id, children: "\u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0633\u0648\u062F\u0629" })) : created.showsBarcode === false ? (_jsx("p", { className: "rounded-xl border border-line p-3 text-sm text-mute", children: "\u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0644\u0627 \u064A\u062D\u062A\u0627\u062C \u0628\u0627\u0631\u0643\u0648\u062F \u062F\u062E\u0648\u0644." })) : (_jsx(Link, { className: button, to: '/admin/roster/' + created.id, children: "\u0628\u0637\u0627\u0642\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644" })), _jsx("button", { className: button, onClick: () => { setCreated(null); setPreview(null); }, children: "\u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631 \u0622\u062E\u0631" })] }));
    }
    const readyForCandidates = packageMode || (category && (category === 'theory' || evaluationMode));
    return (_jsxs("div", { className: "mx-auto max-w-6xl space-y-6", dir: "rtl", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gold", children: "\u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631 \u062D\u0633\u0628 \u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0648\u0638\u064A\u0641\u064A" }), _jsx("p", { className: "mt-2 text-mute", children: "\u0627\u062E\u062A\u0628\u0627\u0631 \u0648\u0627\u062D\u062F \u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A \u0645\u062E\u062A\u0644\u0641\u0629 \u0648\u0641\u0642 \u0645\u0635\u0641\u0648\u0641\u0629 \u0622\u0644\u064A\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645. \u0634\u0641\u0647\u064A \u0627\u0644\u0645\u0628\u0631\u0645\u062C \u0648\u0645\u0647\u0646\u062F\u0633 \u0627\u0644\u0646\u0638\u0645 \u0645\u0633\u0627\u0631 \u0645\u0648\u062D\u0651\u062F." })] }), !(user?.role === 'operator' && user.category === 'theory') && (_jsxs("section", { className: "space-y-4 rounded-2xl border border-gold/50 bg-card p-5", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm font-bold text-gold", children: "\u0627\u0644\u062E\u0637\u0648\u0629 \u0627\u0644\u0623\u0648\u0644\u0649" }), _jsx("h2", { className: "mt-1 text-xl font-bold", children: "\u0627\u062E\u062A\u0631 \u0648\u0636\u0639 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u0648\u0627\u0644\u062A\u0642\u064A\u064A\u0645" })] }), _jsx("div", { className: "grid gap-4 md:grid-cols-2", children: evaluationModes.map((mode) => (_jsxs("button", { type: "button", onClick: () => {
                                setEvaluationMode(mode.id);
                                if (mode.id !== 'qr')
                                    setPackageMode(false);
                                setPreview(null);
                            }, className: `space-y-2 rounded-2xl border p-5 text-right transition ${evaluationMode === mode.id ? 'border-gold bg-gold/10' : 'border-line bg-panel hover:border-gold'}`, children: [_jsx("h3", { className: "font-bold text-gold", children: mode.title }), _jsx("p", { className: "text-sm text-mute", children: mode.text })] }, mode.id))) })] })), error && (_jsx("div", { role: "alert", className: "rounded-xl border border-error/40 p-4 text-error", children: error })), evaluationMode && !packageMode && (_jsxs("section", { className: "space-y-4 rounded-2xl border border-line bg-card p-5", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm font-bold text-gold", children: "\u0627\u0644\u062E\u0637\u0648\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629" }), _jsx("h2", { className: "mt-1 text-xl font-bold", children: "\u0627\u062E\u062A\u0631 \u0646\u0648\u0639 \u0627\u0644\u062A\u0642\u064A\u064A\u0645" })] }), _jsx("div", { className: "grid gap-3 sm:grid-cols-3", children: Object.entries(CATEGORY_META)
                            .filter(([id]) => id !== 'theory' && id !== 'security')
                            .map(([id, meta]) => {
                            const disabled = user?.role === 'operator' && user.category !== id;
                            return (_jsx("button", { type: "button", disabled: disabled, onClick: () => {
                                    setCategory(id);
                                    setQuestionFormat('mixed');
                                    setPreview(null);
                                }, className: `rounded-2xl border p-5 text-right transition disabled:opacity-30 ${category === id ? 'border-gold bg-gold/10 text-light-gold' : 'border-line bg-panel hover:border-gold'}`, children: _jsx("span", { className: "font-bold", children: meta.label }) }, id));
                        }) })] })), showFormatPicker && (_jsxs("section", { className: "space-y-4 rounded-2xl border border-line bg-card p-5", children: [_jsx("h2", { className: "text-xl font-bold", children: "\u0627\u062E\u062A\u0631 \u0634\u0643\u0644 \u0627\u0644\u0623\u0633\u0626\u0644\u0629" }), _jsx("div", { className: "grid gap-3 md:grid-cols-3", children: formatOptions.map((opt) => (_jsxs("button", { type: "button", onClick: () => {
                                setQuestionFormat(opt.id);
                                setPreview(null);
                            }, className: `space-y-2 rounded-2xl border p-5 text-right transition ${questionFormat === opt.id ? 'border-gold bg-gold/10' : 'border-line bg-panel hover:border-gold'}`, children: [_jsx("h3", { className: "font-bold text-gold", children: opt.title }), _jsx("p", { className: "text-sm text-mute", children: opt.text })] }, opt.id))) })] })), readyForCandidates && (_jsxs(_Fragment, { children: [_jsxs("section", { className: "grid gap-4 rounded-2xl border border-line bg-card p-5", children: [_jsxs("label", { children: ["\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", _jsx("input", { className: field, value: title, onChange: (e) => setTitle(e.target.value), placeholder: "\u0645\u062B\u0627\u0644: \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u0631\u0634\u062D\u064A\u0646 \u2014 \u0627\u0644\u062F\u0641\u0639\u0629 \u0627\u0644\u0623\u0648\u0644\u0649" })] }), evaluationMode !== 'manual' && (_jsxs("label", { children: ["\u0639\u062F\u062F \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0644\u0643\u0644 \u0645\u062A\u0642\u062F\u0645", _jsx("input", { className: field, type: "number", min: 1, max: 100, value: questionCount, onChange: (e) => {
                                            setQuestionCount(Number(e.target.value) || 1);
                                            setPreview(null);
                                        } })] }))] }), _jsxs("section", { className: "space-y-3 rounded-2xl border border-line bg-card p-5", children: [_jsxs("div", { className: "flex justify-between gap-3", children: [_jsxs("h2", { className: "text-lg font-bold", children: ["\u0627\u0644\u0645\u062A\u0642\u062F\u0645\u0648\u0646 (", selected.length, " \u0645\u062D\u062F\u062F)"] }), _jsx(Link, { className: "text-gold", to: "/admin/applicants", children: "\u0633\u062C\u0644 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646" })] }), _jsx("input", { "aria-label": "\u0628\u062D\u062B \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646", className: field, placeholder: "\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0645\u0633\u0645\u0649 \u0627\u0644\u0639\u0645\u0644 \u0623\u0648 \u0627\u0644\u062C\u0647\u0629", value: search, onChange: (e) => setSearch(e.target.value) }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("button", { className: button, onClick: () => setSelected([...new Set([...selected, ...visible.map((a) => a.id)])]), children: ["\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0638\u0627\u0647\u0631 (", visible.length, ")"] }), _jsx("button", { className: button, onClick: () => setSelected([]), children: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062A\u062D\u062F\u064A\u062F" })] }), _jsx("div", { className: "grid max-h-72 gap-2 overflow-auto md:grid-cols-2", children: visible.map((a) => {
                                    const jobTitle = effectiveJobTitle(a);
                                    const missing = a.missingTitle || !jobTitle;
                                    const tracks = (a.evaluationTracks || []).map((t) => t.label).join(' · ');
                                    return (_jsxs("label", { className: "flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3", children: [_jsx("input", { type: "checkbox", checked: selected.includes(a.id), onChange: (e) => setSelected(e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id)) }), _jsxs("span", { children: [a.name, _jsxs("small", { className: "block text-mute", children: [missing ? 'بلا مسمى' : jobTitle, a.org ? ` • ${a.org}` : '', a.evaluationStreamLabel ? ` • ${a.evaluationStreamLabel}` : '', tracks ? ` — ${tracks}` : ''] })] })] }, a.id));
                                }) })] }), matrixSummary.length > 0 && (_jsxs("section", { className: "space-y-3 rounded-2xl border border-gold/40 bg-gold/5 p-5", children: [_jsx("h2", { className: "text-lg font-bold text-gold", children: "\u0645\u0646 \u064A\u0638\u0647\u0631 \u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u062D\u0633\u0628 \u0622\u0644\u064A\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645" }), _jsx("div", { className: "grid gap-3 md:grid-cols-2", children: matrixSummary.map((row) => (_jsxs("article", { className: "rounded-xl border border-line bg-card p-4", children: [_jsxs("h3", { className: "font-bold", children: [row.label, " ", _jsxs("span", { className: "text-mute", children: ["(", row.count, ")"] })] }), _jsx("p", { className: "mt-2 text-sm text-mute", children: row.tracks.join(' · ') || '—' })] }, row.streamId))) }), trackIdForCategory && (_jsxs("p", { className: "text-sm text-light-gold", children: ["\u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u062D\u0627\u0644\u064A: ", EVALUATION_TRACKS[trackIdForCategory]?.label || trackIdForCategory] }))] })), groups.length > 0 && (_jsxs("section", { className: "space-y-4", children: [_jsxs("h2", { className: "text-xl font-bold", children: ["\u0645\u0644\u062E\u0635 \u062D\u0633\u0628 \u0645\u0633\u0645\u0649 \u0627\u0644\u0639\u0645\u0644 (", groups.length, ")"] }), groups.map((g, i) => {
                                const c = configs[i];
                                const profile = JOB_PROFILES.find((p) => p.id === c.profileId);
                                const result = currentPreview?.groups?.find((r) => r.key === g.key);
                                return (_jsxs("article", { className: "space-y-3 rounded-2xl border border-line bg-card p-5", children: [_jsxs("div", { className: "flex flex-wrap justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-bold text-gold", children: g.missingTitle || !g.jobTitle ? 'بلا مسمى' : g.jobTitle }), _jsx("p", { className: "mt-1 text-sm text-mute", children: g.profileId ? profile?.specialtyLabel : 'تخصص جديد' })] }), _jsxs("span", { children: [g.applicantIds.length, " \u0645\u062A\u0642\u062F\u0645"] })] }), result && (_jsxs("div", { role: "status", className: 'rounded-xl border p-3 ' + (result.enough ? 'border-ok text-ok' : 'border-gold text-gold'), children: ["\u0627\u0644\u0645\u062A\u0627\u062D: ", result.available, " \u2022 \u0627\u0644\u0645\u0637\u0644\u0648\u0628: ", result.requested, " \u2022 \u0627\u0644\u0641\u0639\u0644\u064A: ", result.actual] }))] }, g.key));
                            })] })), _jsxs("div", { className: "flex flex-wrap items-center gap-3 pb-10", children: [_jsx("button", { className: button, disabled: busy || !selected.length, onClick: () => void submit(false), children: busy ? 'جارٍ التنفيذ…' : 'معاينة الأسئلة المتاحة' }), _jsx("button", { className: primary, disabled: busy || !title.trim() || selected.length === 0, onClick: () => void submit(true), children: "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0628\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u062A\u0627\u062D\u0629" }), selected.length === 0 && _jsx("span", { className: "text-sm text-mute", children: "\u064A\u0631\u062C\u0649 \u062A\u062D\u062F\u064A\u062F \u0645\u062A\u0642\u062F\u0645\u064A\u0646." })] })] }))] }));
}
