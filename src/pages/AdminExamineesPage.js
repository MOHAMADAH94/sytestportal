import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowLeft, Check, Download, Pencil, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDeleteExaminee, apiExamineeFilters, apiListExaminees, apiUpdateExamineeRank, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AdminListToolbar } from '../components/AdminListToolbar';
import { CATEGORY_META } from '../data/types';
import { exportExamineesScoresExcel } from '../utils/parseRosterExcel';
const CATEGORY_FILTERS = [
    { id: 'all', label: 'كل الأنواع' },
    { id: 'theory', label: CATEGORY_META.theory.label },
    { id: 'oral', label: CATEGORY_META.oral.label },
    { id: 'driving', label: CATEGORY_META.driving.label },
    { id: 'personality', label: CATEGORY_META.personality.label },
];
export function AdminExamineesPage() {
    const { user } = useAuth();
    const isCommander = user?.role === 'commander';
    const isAdmin = user?.role === 'admin';
    const [list, setList] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [orgFilter, setOrgFilter] = useState('all');
    const [jobFilter, setJobFilter] = useState('all');
    const [sort, setSort] = useState('date_desc');
    const [editingName, setEditingName] = useState(null);
    const [draftRank, setDraftRank] = useState('');
    const [savingRank, setSavingRank] = useState(false);
    async function load() {
        if (!user?.token)
            return;
        setLoading(true);
        try {
            const [examinees, filters] = await Promise.all([
                apiListExaminees(user.token),
                apiExamineeFilters(user.token),
            ]);
            setList(examinees);
            setOrgs(filters.orgs);
            setJobs(filters.jobs);
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
    }, [user?.token]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let rows = list.filter((e) => {
            if (categoryFilter !== 'all' && !e.categories.includes(categoryFilter))
                return false;
            if (orgFilter !== 'all' && (e.org || '') !== orgFilter)
                return false;
            if (jobFilter !== 'all' && (e.jobTitle || '') !== jobFilter)
                return false;
            if (!q)
                return true;
            const hay = [
                e.examineeName,
                ...(e.examineeIds || []),
                e.org,
                e.jobTitle,
                e.rank,
                ...e.categories.map((c) => CATEGORY_META[c]?.label || c),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
        rows = [...rows].sort((a, b) => {
            switch (sort) {
                case 'name_asc':
                    return a.examineeName.localeCompare(b.examineeName, 'ar');
                case 'name_desc':
                    return b.examineeName.localeCompare(a.examineeName, 'ar');
                case 'org_asc':
                    return (a.org || '').localeCompare(b.org || '', 'ar');
                case 'job_asc':
                    return (a.jobTitle || '').localeCompare(b.jobTitle || '', 'ar');
                case 'exams_desc':
                    return b.examCount - a.examCount;
                case 'exams_asc':
                    return a.examCount - b.examCount;
                case 'percent_desc':
                    return (b.finalPercent ?? -1) - (a.finalPercent ?? -1);
                case 'percent_asc':
                    return (a.finalPercent ?? 999) - (b.finalPercent ?? 999);
                case 'date_asc':
                    return String(a.lastFinishedAt).localeCompare(String(b.lastFinishedAt));
                case 'date_desc':
                default:
                    return String(b.lastFinishedAt).localeCompare(String(a.lastFinishedAt));
            }
        });
        return rows;
    }, [list, search, categoryFilter, orgFilter, jobFilter, sort]);
    async function removeExaminee(item) {
        if (!user?.token)
            return;
        const ok = window.confirm(`حذف «${item.examineeName}» من الممتحنين؟\nيختفي من القوائم، وتبقى نتيجته في الأرشيف.`);
        if (!ok)
            return;
        try {
            await apiDeleteExaminee(user.token, item.applicantId || item.examineeName);
            setList((prev) => prev.filter((row) => (row.applicantId || row.examineeName) !== (item.applicantId || item.examineeName)));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل حذف الممتحن');
        }
    }
    async function saveRank(item) {
        if (!user?.token)
            return;
        setSavingRank(true);
        try {
            const identifier = item.applicantId || item.examineeName;
            const res = await apiUpdateExamineeRank(user.token, identifier, draftRank);
            setList((prev) => prev.map((e) => ((e.applicantId || e.examineeName) === identifier ? { ...e, rank: res.rank } : e)));
            setEditingName(null);
            setDraftRank('');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل حفظ الرتبة');
        }
        finally {
            setSavingRank(false);
        }
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u0627\u0644\u0645\u0645\u062A\u062D\u0646\u0648\u0646" }), _jsxs("p", { className: "mt-1 text-sm text-mute", children: ["\u064A\u0638\u0647\u0631 \u0647\u0646\u0627 \u0645\u0646 \u0633\u064F\u062C\u0651\u0644\u062A \u0644\u0647 \u0646\u062A\u064A\u062C\u0629 \u0627\u0645\u062A\u062D\u0627\u0646. \u0627\u0644\u0628\u062D\u062B \u0648\u0627\u0644\u062A\u0635\u0641\u064A\u0629 \u062D\u0633\u0628 \u0627\u0644\u062C\u0647\u0629 \u0648\u0627\u0644\u0645\u0633\u0645\u0649", isCommander ? ' — يمكنك تعديل الرتب من عمود القائد.' : '.'] }), !loading && filtered.length > 0 && (_jsxs("button", { type: "button", className: "mt-3 inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-bold text-light-gold", onClick: () => {
                            void exportExamineesScoresExcel(filtered).catch(() => setError('تعذر تصدير ملف العلامات'));
                        }, children: [_jsx(Download, { className: "h-4 w-4" }), "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062A \u0625\u0644\u0649 \u0625\u0643\u0633\u0644"] }))] }), error && (_jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error })), !loading && list.length > 0 && (_jsx(AdminListToolbar, { search: search, onSearchChange: setSearch, searchPlaceholder: "\u0627\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0645\u0639\u0631\u0651\u0641 \u0623\u0648 \u0627\u0644\u062C\u0647\u0629 \u0623\u0648 \u0627\u0644\u0645\u0633\u0645\u0649...", filters: [
                    {
                        id: 'category',
                        label: 'نوع الاختبار',
                        value: categoryFilter,
                        options: CATEGORY_FILTERS,
                        onChange: (v) => setCategoryFilter(v),
                    },
                    {
                        id: 'org',
                        label: 'الجهة',
                        value: orgFilter,
                        options: [
                            { id: 'all', label: 'كل الجهات' },
                            ...orgs.map((o) => ({ id: o, label: o })),
                        ],
                        onChange: setOrgFilter,
                    },
                    {
                        id: 'job',
                        label: 'المسمى الوظيفي',
                        value: jobFilter,
                        options: [
                            { id: 'all', label: 'كل المسميات' },
                            ...jobs.map((j) => ({ id: j, label: j })),
                        ],
                        onChange: setJobFilter,
                    },
                ], sortValue: sort, sortOptions: [
                    { id: 'date_desc', label: 'الأحدث تسليماً' },
                    { id: 'date_asc', label: 'الأقدم تسليماً' },
                    { id: 'name_asc', label: 'الاسم أ–ي' },
                    { id: 'name_desc', label: 'الاسم ي–أ' },
                    { id: 'org_asc', label: 'الجهة' },
                    { id: 'job_asc', label: 'المسمى الوظيفي' },
                    { id: 'percent_desc', label: 'أعلى متوسط' },
                    { id: 'percent_asc', label: 'أقل متوسط' },
                    { id: 'exams_desc', label: 'أكثر اختبارات' },
                    { id: 'exams_asc', label: 'أقل اختبارات' },
                ], onSortChange: setSort, shown: filtered.length, total: list.length, onReset: () => {
                    setSearch('');
                    setCategoryFilter('all');
                    setOrgFilter('all');
                    setJobFilter('all');
                    setSort('date_desc');
                } })), loading ? (_jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." })) : list.length === 0 ? (_jsxs("div", { className: "rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute", children: [_jsx(Users, { className: "mx-auto mb-3 h-10 w-10 opacity-50" }), "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0645\u062A\u062D\u0646\u0648\u0646 \u0628\u0639\u062F."] })) : filtered.length === 0 ? (_jsx("div", { className: "rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0644\u0628\u062D\u062B \u0623\u0648 \u0627\u0644\u062A\u0635\u0641\u064A\u0629." })) : (_jsx("div", { className: "overflow-x-auto rounded-2xl border border-line", children: _jsxs("table", { className: "w-full min-w-[900px] text-sm", children: [_jsx("thead", { className: "bg-panel text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u0645\u0639\u0631\u0651\u0641" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u0645\u0645\u062A\u062D\u0646" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u062C\u0647\u0629" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0648\u0638\u064A\u0641\u064A" }), isCommander && (_jsx("th", { className: "px-4 py-3 text-right font-bold text-gold", children: "\u0627\u0644\u0631\u062A\u0628\u0629 (\u0627\u0644\u0642\u0627\u0626\u062F)" })), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0639\u062F\u062F \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0646\u0647\u0627\u0626\u064A" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0622\u062E\u0631 \u062A\u0633\u0644\u064A\u0645" }), _jsx("th", { className: "px-4 py-3 text-right font-bold", children: "\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644" })] }) }), _jsx("tbody", { children: filtered.map((e) => (_jsxs("tr", { className: "border-t border-line bg-card", children: [_jsx("td", { className: "px-4 py-3 font-mono text-xs text-gold", dir: "ltr", children: e.examineeIds?.length ? e.examineeIds.join(' · ') : '—' }), _jsx("td", { className: "px-4 py-3 font-semibold text-text", children: e.examineeName }), _jsx("td", { className: "px-4 py-3 text-text-2", children: e.org || '—' }), _jsx("td", { className: "px-4 py-3 text-text-2", children: e.jobTitle || '—' }), isCommander && (_jsx("td", { className: "px-4 py-3", children: editingName === (e.applicantId || e.examineeName) ? (_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("input", { value: draftRank, onChange: (ev) => setDraftRank(ev.target.value), className: "w-28 rounded-lg border border-gold/50 bg-panel px-2 py-1 text-xs text-text outline-none", placeholder: "\u0627\u0644\u0631\u062A\u0628\u0629", autoFocus: true }), _jsx("button", { type: "button", disabled: savingRank, onClick: () => void saveRank(e), className: "rounded-lg bg-ok/20 p-1.5 text-ok", title: "\u062D\u0641\u0638", children: _jsx(Check, { className: "h-3.5 w-3.5" }) }), _jsx("button", { type: "button", onClick: () => {
                                                        setEditingName(null);
                                                        setDraftRank('');
                                                    }, className: "rounded-lg bg-error/10 p-1.5 text-error", title: "\u0625\u0644\u063A\u0627\u0621", children: _jsx(X, { className: "h-3.5 w-3.5" }) })] })) : (_jsxs("button", { type: "button", onClick: () => {
                                                setEditingName(e.applicantId || e.examineeName);
                                                setDraftRank(e.rank || '');
                                            }, className: "inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-bold text-gold", children: [_jsx(Pencil, { className: "h-3 w-3" }), e.rank || 'تعيين رتبة'] })) })), _jsx("td", { className: "px-4 py-3 text-text-2", children: e.examCount }), _jsx("td", { className: "px-4 py-3 font-bold text-light-gold", children: e.finalPercent != null ? `${e.finalPercent}%` : '—' }), _jsx("td", { className: "px-4 py-3 text-mute", children: new Date(e.lastFinishedAt).toLocaleString('ar-SA') }), _jsxs("td", { className: "px-4 py-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs(Link, { to: `/admin/examinees/${encodeURIComponent(e.applicantId || e.examineeName)}`, className: "inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink", children: ["\u0627\u0644\u0646\u062A\u0627\u0626\u062C ", _jsx(ArrowLeft, { className: "h-3.5 w-3.5" })] }), isAdmin && (_jsxs("button", { type: "button", onClick: () => void removeExaminee(e), className: "inline-flex items-center gap-1 rounded-lg border border-error/40 px-2.5 py-1.5 text-xs font-bold text-error", children: [_jsx(Trash2, { className: "h-3.5 w-3.5" }), " \u062D\u0630\u0641"] }))] }), e.categories?.length > 0 && (_jsx("div", { className: "mt-1 text-[11px] text-mute", children: e.categories.map((c) => CATEGORY_META[c]?.label || c).join(' · ') }))] })] }, e.applicantId || e.examineeName))) })] }) }))] }));
}
