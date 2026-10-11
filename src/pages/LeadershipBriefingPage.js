import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { FileSpreadsheet, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiLeadershipBriefing, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { exportLeadershipBriefingExcel } from '../utils/exportLeadershipBriefing';
import { CATEGORY_LABELS_AR, THRESHOLDS, evaluateDecision, normalizeThresholds, } from '../../shared/decisionRules.js';
const STATUS_ORDER = ['qualified', 'conditional', 'not_qualified', 'incomplete'];
const STATUS_RANK = {
    qualified: 0,
    conditional: 1,
    not_qualified: 2,
    incomplete: 3,
};
const STATUS_STYLES = {
    qualified: { border: 'border-ok/40', bg: 'bg-ok/10', text: 'text-ok' },
    conditional: { border: 'border-warn/40', bg: 'bg-warn/10', text: 'text-warn' },
    not_qualified: { border: 'border-error/40', bg: 'bg-error/10', text: 'text-error' },
    incomplete: { border: 'border-line', bg: 'bg-panel/60', text: 'text-mute' },
};
const BANK_LABELS = {
    theory: 'عام',
    oral: 'الشفهي',
    driving: 'أهلية القيادة',
    personality: 'تقييم الشخصية',
};
function formatWhen(iso) {
    try {
        return new Date(iso).toLocaleString('ar');
    }
    catch {
        return iso;
    }
}
function gapLabel(person) {
    const pending = (person.pendingCategories || []).map((c) => CATEGORY_LABELS_AR[c] || c);
    const missing = (person.missingCategories || []).map((c) => CATEGORY_LABELS_AR[c] || c);
    const parts = [
        pending.length ? `معلّق: ${pending.join('، ')}` : '',
        missing.length ? `ناقص: ${missing.join('، ')}` : '',
    ].filter(Boolean);
    return parts.join(' · ') || '—';
}
function sortSlate(people) {
    return [...people].sort((a, b) => {
        const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (rank !== 0)
            return rank;
        const ca = a.compositePercent == null ? -1 : a.compositePercent;
        const cb = b.compositePercent == null ? -1 : b.compositePercent;
        if (cb !== ca)
            return cb - ca;
        return a.name.localeCompare(b.name, 'ar');
    });
}
function GroupTable({ title, rows, empty, onSelectLabel, }) {
    return (_jsxs("section", { className: "overflow-hidden rounded-2xl border border-gold/30 bg-card", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-line/70 px-4 py-3", children: [_jsx("h3", { className: "text-sm font-extrabold text-gold", children: title }), _jsx(Link, { to: "/admin/examinees", className: "text-xs font-bold text-light-gold hover:underline", children: "\u0627\u0644\u0645\u0645\u062A\u062D\u0646\u0648\u0646" })] }), rows.length === 0 ? (_jsx("p", { className: "px-4 py-8 text-center text-sm text-mute", children: empty })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-right text-sm", children: [_jsx("thead", { className: "bg-panel/80 text-xs text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2 font-bold", children: title === 'حسب الجهة' ? 'الجهة' : 'المسمى' }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0639\u062F\u062F" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0643\u062A\u0645\u0627\u0644" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0645\u0631\u0643\u0651\u0628\u0629" })] }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs("tr", { className: "border-t border-line/50", children: [_jsx("td", { className: "px-3 py-2 font-bold text-text", children: onSelectLabel ? (_jsx("button", { type: "button", className: "text-gold hover:underline", onClick: () => onSelectLabel(row.label), children: row.label })) : (row.label) }), _jsx("td", { className: "px-3 py-2 text-light-gold", children: row.applicantCount }), _jsxs("td", { className: "px-3 py-2", children: [row.completeCount, "/", row.applicantCount, _jsxs("span", { className: "mr-2 text-xs text-mute", children: [row.completionRate, "%"] })] }), _jsx("td", { className: "px-3 py-2 font-bold text-gold", children: row.averageComposite != null ? `${row.averageComposite}%` : '—' })] }, row.key))) })] }) }))] }));
}
export function LeadershipBriefingPage() {
    const { user } = useAuth();
    const [period, setPeriod] = useState('all');
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [sim, setSim] = useState(THRESHOLDS);
    const [jobFilter, setJobFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [slateSearch, setSlateSearch] = useState('');
    const allowed = user?.role === 'admin' || user?.role === 'commander';
    const applicantsHref = user?.role === 'admin' ? '/admin/applicants' : '/admin/examinees';
    async function load(nextPeriod) {
        if (!user?.token)
            return;
        setLoading(true);
        try {
            const briefing = await apiLeadershipBriefing(user.token, nextPeriod);
            setData(briefing);
            setSim(briefing.defaultThresholds || THRESHOLDS);
            setError('');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل تحميل تقرير القيادة');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!allowed)
            return;
        void load(period);
    }, [user?.token, period, allowed]);
    const thresholds = useMemo(() => normalizeThresholds(sim), [sim]);
    const defaults = data?.defaultThresholds || THRESHOLDS;
    const simulating = thresholds.qualifiedComposite !== defaults.qualifiedComposite ||
        thresholds.conditionalComposite !== defaults.conditionalComposite ||
        thresholds.minPerCategory !== defaults.minPerCategory;
    const simulatedPeople = useMemo(() => {
        if (!data)
            return [];
        return data.people.map((person) => {
            const decision = evaluateDecision({
                categoryPercents: person.categoryPercents,
                pendingCategories: person.pendingCategories,
                thresholds,
            });
            return {
                ...person,
                status: decision.status,
                labelAr: decision.labelAr,
                compositePercent: decision.compositePercent,
                pendingCategories: decision.pendingCategories,
                missingCategories: decision.missingCategories,
            };
        });
    }, [data, thresholds]);
    const simulatedCounts = useMemo(() => {
        const counts = {
            qualified: 0,
            conditional: 0,
            not_qualified: 0,
            incomplete: 0,
        };
        for (const person of simulatedPeople)
            counts[person.status] += 1;
        return counts;
    }, [simulatedPeople]);
    const jobOptions = useMemo(() => {
        return [...new Set((data?.people || []).map((row) => row.jobTitle))].sort((a, b) => a.localeCompare(b, 'ar'));
    }, [data]);
    const slate = useMemo(() => {
        const q = slateSearch.trim().toLowerCase();
        return sortSlate(simulatedPeople.filter((person) => {
            if (jobFilter !== 'all' && person.jobTitle !== jobFilter)
                return false;
            if (statusFilter !== 'all' && person.status !== statusFilter)
                return false;
            if (q && !person.name.toLowerCase().includes(q) && !person.org.toLowerCase().includes(q))
                return false;
            return true;
        }));
    }, [simulatedPeople, jobFilter, statusFilter, slateSearch]);
    if (!allowed)
        return _jsx(Navigate, { to: "/admin", replace: true });
    async function exportExcel() {
        if (!data)
            return;
        setExporting(true);
        try {
            await exportLeadershipBriefingExcel(data, { slate, simulatedCounts, simulating, thresholds });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل تصدير Excel');
        }
        finally {
            setExporting(false);
        }
    }
    function patchSim(partial) {
        setSim((prev) => normalizeThresholds({ ...prev, ...partial }));
    }
    return (_jsxs("div", { className: "print-area space-y-6", dir: "rtl", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0642\u064A\u0627\u062F\u0629" }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u0645\u0644\u062E\u0635 \u062C\u0644\u0633\u0629 \u0644\u0644\u0642\u0631\u0627\u0621\u0629 \u0641\u0642\u0637 \u2014 \u062F\u0648\u0646 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u062A\u0635\u062D\u064A\u062D \u0623\u0648 \u0627\u0644\u0623\u0631\u0634\u064A\u0641 \u0623\u0648 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0644\u062C\u0646\u0629." }), data && (_jsxs("p", { className: "mt-1 text-xs text-mute", children: [data.policyVersion, " \u00B7 ", formatWhen(data.generatedAt)] }))] }), _jsxs("div", { className: "no-print flex flex-wrap items-center gap-2", children: [_jsx("div", { className: "flex rounded-xl border border-line bg-panel p-1", children: ([
                                    { id: 'all', label: 'كل الفترات' },
                                    { id: '30d', label: 'آخر 30 يوماً' },
                                ]).map((option) => (_jsx("button", { type: "button", onClick: () => setPeriod(option.id), className: `rounded-lg px-3 py-1.5 text-xs font-bold ${period === option.id
                                        ? 'bg-gold text-ink'
                                        : 'text-mute hover:text-light-gold'}`, children: option.label }, option.id))) }), _jsxs("button", { type: "button", disabled: !data || exporting, onClick: () => void exportExcel(), className: "inline-flex items-center gap-1.5 rounded-xl border border-gold/50 bg-gold/15 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/25 disabled:opacity-40", children: [_jsx(FileSpreadsheet, { className: "h-4 w-4" }), "Excel"] }), _jsxs("button", { type: "button", onClick: () => window.print(), className: "inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-mute hover:border-gold hover:text-gold", children: [_jsx(Printer, { className: "h-4 w-4" }), "\u0637\u0628\u0627\u0639\u0629"] })] })] }), data && _jsx("p", { className: "text-xs text-mute", children: data.disclaimerAr }), error && (_jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error })), loading && !data ? (_jsx("p", { className: "rounded-2xl border border-line bg-card p-8 text-center text-sm text-mute", children: "\u062C\u0627\u0631\u064D \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u062A\u0642\u0631\u064A\u0631\u2026" })) : data ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-5", children: [
                            { label: 'المتقدمون', value: data.kpis.applicantCount, to: applicantsHref },
                            { label: 'مكتمل 4/4', value: data.kpis.completeFour, to: '/admin/examinees' },
                            { label: 'قيد الاستكمال', value: data.kpis.inProgress, to: '/admin/examinees' },
                            { label: 'معلّق تقييم يدوي', value: data.kpis.pendingManual, to: '/admin/examinees' },
                            { label: 'اختبارات نشطة', value: data.kpis.activeExams, to: '/admin' },
                        ].map((card) => (_jsxs(Link, { to: card.to, className: "rounded-2xl border border-gold/35 bg-card p-4 transition hover:border-gold", children: [_jsx("div", { className: "text-xs font-bold text-mute", children: card.label }), _jsx("div", { className: "mt-2 text-3xl font-extrabold text-light-gold", children: card.value })] }, card.label))) }), _jsxs("section", { className: "no-print space-y-3 rounded-2xl border border-gold/30 bg-card p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-extrabold text-gold", children: "\u0645\u062D\u0627\u0643\u0627\u0629 \u0627\u0644\u0639\u062A\u0628\u0627\u062A" }), _jsx("p", { className: "text-xs text-mute", children: "\u062A\u062C\u0631\u0628\u0629 \u0639\u0631\u0636 \u0641\u0642\u0637 \u2014 \u0644\u0627 \u062A\u064F\u062D\u0641\u0638 \u0648\u0644\u0627 \u062A\u062F\u062E\u0644 \u062E\u062A\u0645 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F. \u063A\u064A\u0631 \u0627\u0644\u0645\u0643\u062A\u0645\u0644 \u064A\u0628\u0642\u0649 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644." })] }), _jsx("button", { type: "button", className: "rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-mute hover:border-gold hover:text-gold", onClick: () => setSim(defaults), children: "\u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637 \u0627\u0644\u0633\u064A\u0627\u0633\u0629" })] }), simulating && (_jsx("p", { className: "rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-bold text-warn", children: "\u0639\u0631\u0636 \u062A\u062C\u0631\u064A\u0628\u064A \u0628\u0627\u0644\u0639\u062A\u0628\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u2014 \u0623\u0639\u062F\u0627\u062F \u0627\u0644\u062C\u062F\u0627\u0631\u0629 \u0648\u0627\u0644\u0644\u0627\u0626\u062D\u0629 \u062A\u062A\u063A\u064A\u0631\u060C \u0648\u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A \u0627\u0644\u0623\u0635\u0644\u064A\u0629 \u0623\u0639\u0644\u0627\u0647 \u062B\u0627\u0628\u062A\u0629." })), _jsx("div", { className: "grid gap-4 md:grid-cols-3", children: [
                                    { key: 'qualifiedComposite', label: 'عتبة التأهل' },
                                    { key: 'conditionalComposite', label: 'عتبة المشروط' },
                                    { key: 'minPerCategory', label: 'الحد الأدنى للمسار' },
                                ].map((item) => (_jsxs("label", { className: "block text-sm font-bold text-text", children: [item.label, ": ", thresholds[item.key], "%", _jsx("input", { type: "range", min: 0, max: 100, value: thresholds[item.key], onChange: (e) => patchSim({ [item.key]: Number(e.target.value) }), className: "mt-2 w-full accent-gold" })] }, item.key))) })] }), _jsxs("section", { className: "space-y-3 rounded-2xl border border-gold/30 bg-card p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsx("h2", { className: "text-lg font-extrabold text-gold", children: "\u062A\u0642\u062F\u064A\u0631 \u0627\u0644\u062C\u062F\u0627\u0631\u0629 (\u062A\u062C\u0645\u064A\u0639\u064A)" }), _jsx(Link, { to: applicantsHref, className: "text-xs font-bold text-light-gold hover:underline", children: user?.role === 'admin' ? 'سجل المتقدمين' : 'الممتحنون' })] }), _jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: STATUS_ORDER.map((status) => {
                                    const style = STATUS_STYLES[status];
                                    return (_jsxs("div", { className: `rounded-xl border ${style.border} ${style.bg} px-4 py-3`, children: [_jsx("div", { className: "text-xs font-bold text-mute", children: data.statusLabels[status] }), _jsx("div", { className: `mt-1 text-3xl font-extrabold ${style.text}`, children: simulatedCounts[status] })] }, status));
                                }) })] }), _jsxs("section", { className: "overflow-hidden rounded-2xl border border-gold/30 bg-card", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-extrabold text-gold", children: "\u0644\u0627\u0626\u062D\u0629 \u0645\u0641\u0627\u0636\u0644\u0629 \u0627\u0644\u0634\u0627\u063A\u0631" }), _jsx("p", { className: "text-xs text-mute", children: "\u062A\u0631\u062A\u064A\u0628 \u062D\u0633\u0628 \u0627\u0644\u062A\u0642\u062F\u064A\u0631 \u062B\u0645 \u0627\u0644\u0645\u0631\u0643\u0651\u0628\u0629 \u2014 \u0644\u0644\u062C\u0644\u0633\u0629 \u0644\u0627 \u0644\u0644\u062A\u0635\u062D\u064A\u062D." })] }), _jsx(Link, { to: "/admin/examinees", className: "text-xs font-bold text-light-gold hover:underline", children: "\u0627\u0644\u0645\u0645\u062A\u062D\u0646\u0648\u0646" })] }), _jsxs("div", { className: "no-print flex flex-wrap gap-2 px-4 py-3", children: [_jsx("input", { value: slateSearch, onChange: (e) => setSlateSearch(e.target.value), placeholder: "\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u062C\u0647\u0629", className: "min-w-[180px] flex-1 rounded-xl border border-line bg-void px-3 py-2 text-sm text-text" }), _jsxs("select", { value: jobFilter, onChange: (e) => setJobFilter(e.target.value), className: "rounded-xl border border-line bg-void px-3 py-2 text-sm text-text", children: [_jsx("option", { value: "all", children: "\u0643\u0644 \u0627\u0644\u0645\u0633\u0645\u064A\u0627\u062A" }), jobOptions.map((job) => (_jsx("option", { value: job, children: job }, job)))] }), _jsxs("select", { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), className: "rounded-xl border border-line bg-void px-3 py-2 text-sm text-text", children: [_jsx("option", { value: "all", children: "\u0643\u0644 \u0627\u0644\u062D\u0627\u0644\u0627\u062A" }), STATUS_ORDER.map((status) => (_jsx("option", { value: status, children: data.statusLabels[status] }, status)))] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-right text-sm", children: [_jsx("thead", { className: "bg-panel/80 text-xs text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2 font-bold", children: "\u0645" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0627\u0633\u0645" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0645\u0631\u0643\u0651\u0628\u0629" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u062A\u0642\u062F\u064A\u0631" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0646\u0648\u0627\u0642\u0635" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u062C\u0647\u0629" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })] }) }), _jsxs("tbody", { children: [slate.map((person, index) => {
                                                    const style = STATUS_STYLES[person.status];
                                                    return (_jsxs("tr", { className: "border-t border-line/50", children: [_jsx("td", { className: "px-3 py-2 text-mute", children: index + 1 }), _jsx("td", { className: "px-3 py-2", children: _jsx(Link, { to: `/admin/examinees/${encodeURIComponent(person.id)}`, className: "font-bold text-gold hover:underline", children: person.name }) }), _jsx("td", { className: "px-3 py-2 text-light-gold", children: person.compositePercent != null ? `${person.compositePercent}%` : '—' }), _jsx("td", { className: `px-3 py-2 font-bold ${style.text}`, children: person.labelAr }), _jsx("td", { className: "px-3 py-2 text-xs text-mute", children: gapLabel(person) }), _jsx("td", { className: "px-3 py-2", children: person.org }), _jsx("td", { className: "px-3 py-2 text-xs", children: person.adoption ? (_jsx("span", { className: "font-bold text-gold", children: person.adoption.adoptedLabelAr })) : (_jsx("span", { className: "text-mute", children: "\u0628\u062F\u0648\u0646 \u062E\u062A\u0645" })) })] }, person.id));
                                                }), slate.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-3 py-8 text-center text-mute", children: "\u0644\u0627 \u0635\u0641\u0648\u0641 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0641\u0644\u062A\u0631." }) }))] })] }) })] }), _jsxs("div", { className: "grid gap-4 lg:grid-cols-2", children: [_jsx(GroupTable, { title: "\u062D\u0633\u0628 \u0627\u0644\u0645\u0633\u0645\u0649", rows: data.byJob, empty: "\u0644\u0627 \u062A\u062C\u0645\u064A\u0639 \u062D\u0633\u0628 \u0627\u0644\u0645\u0633\u0645\u0649 \u0628\u0639\u062F.", onSelectLabel: (label) => setJobFilter(label) }), _jsx(GroupTable, { title: "\u062D\u0633\u0628 \u0627\u0644\u062C\u0647\u0629", rows: data.byOrg, empty: "\u0644\u0627 \u062A\u062C\u0645\u064A\u0639 \u062D\u0633\u0628 \u0627\u0644\u062C\u0647\u0629 \u0628\u0639\u062F." })] }), _jsxs("section", { className: "overflow-hidden rounded-2xl border border-gold/30 bg-card", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-line/70 px-4 py-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-extrabold text-gold", children: "\u062C\u0627\u0647\u0632\u064A\u0629 \u0627\u0644\u0628\u0646\u0643" }), _jsxs("p", { className: "text-xs text-mute", children: ["\u0645\u0633\u0645\u064A\u0627\u062A \u064A\u0642\u0644 \u0645\u062E\u0632\u0648\u0646\u0647\u0627 \u0639\u0646 ", data.bankThreshold, " \u0633\u0624\u0627\u0644\u0627\u064B \u0641\u064A \u0627\u0644\u0634\u0641\u0647\u064A \u0623\u0648 \u0623\u0647\u0644\u064A\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629 \u0623\u0648 \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0634\u062E\u0635\u064A\u0629."] })] }), _jsx(Link, { to: "/banks", className: "text-xs font-bold text-light-gold hover:underline", children: "\u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629" })] }), data.bankShortages.length === 0 ? (_jsx("p", { className: "px-4 py-8 text-center text-sm text-ok", children: "\u0644\u0627 \u0646\u0648\u0627\u0642\u0635 \u062F\u0648\u0646 \u0639\u062A\u0628\u0629 \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0641\u064A \u0627\u0644\u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u062B\u0644\u0627\u062B\u0629." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-right text-sm", children: [_jsx("thead", { className: "bg-panel/80 text-xs text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0645\u0633\u0645\u0649" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0634\u0641\u0647\u064A" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0623\u0647\u0644\u064A\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0634\u062E\u0635\u064A\u0629" }), _jsx("th", { className: "px-3 py-2 font-bold", children: "\u0627\u0644\u0646\u0648\u0627\u0642\u0635" })] }) }), _jsx("tbody", { children: data.bankShortages.map((row) => (_jsxs("tr", { className: "border-t border-line/50", children: [_jsx("td", { className: "px-3 py-2 font-bold text-text", children: row.label }), ['oral', 'driving', 'personality'].map((category) => (_jsx("td", { className: `px-3 py-2 ${(row.counts[category] || 0) < data.bankThreshold
                                                            ? 'font-bold text-warn'
                                                            : 'text-light-gold'}`, children: row.counts[category] || 0 }, category))), _jsx("td", { className: "px-3 py-2 text-xs text-mute", children: row.shortCategories.map((category) => BANK_LABELS[category] || category).join('، ') })] }, row.profileId))) })] }) }))] })] })) : null] }));
}
