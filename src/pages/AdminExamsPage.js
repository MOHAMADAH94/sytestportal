import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { AlertTriangle, CheckCircle2, ClipboardPen, Eye, FileDown, Layers, Loader2, Plus, Power, QrCode, Trash2, TrendingUp, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiAdminExamQuestions, apiDeleteExam, apiListEvaluationCandidates, apiListExams, apiToggleExam, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AdminListToolbar } from '../components/AdminListToolbar';
import { CATEGORY_META, EXAM_LEVELS } from '../data/types';
import { openPrintWindow } from '../utils/printPdf';
const CATEGORY_FILTERS = [
    { id: 'all', label: 'كل الأنواع' },
    { id: 'theory', label: CATEGORY_META.theory.label },
    { id: 'oral', label: CATEGORY_META.oral.label },
    { id: 'driving', label: CATEGORY_META.driving.label },
    { id: 'personality', label: CATEGORY_META.personality.label },
];
export function AdminExamsPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [exams, setExams] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);
    const [examToDelete, setExamToDelete] = useState(null);
    const [exportingId, setExportingId] = useState(null);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [levelFilter, setLevelFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sort, setSort] = useState('date_desc');
    const [baseCandidatesCount, setBaseCandidatesCount] = useState(null);
    async function load() {
        if (!user?.token)
            return;
        setLoading(true);
        try {
            const list = await apiListExams(user.token);
            setExams(list);
            if (user.role === 'operator' && ['driving', 'personality'].includes(user.category || '')) {
                const candidates = await apiListEvaluationCandidates(user.token);
                setBaseCandidatesCount(candidates.length);
            }
            else {
                setBaseCandidatesCount(null);
            }
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
    // الأمن العسكري: صفحة القبول/الرفض فقط — لا قائمة اختبارات.
    useEffect(() => {
        if (user?.role === 'operator' && user.category === 'security') {
            navigate('/admin/security', { replace: true });
        }
    }, [user, navigate]);
    // شفهي: يُفتح مباشرةً على قائمة المتقدمين عند وجود اختبار واحد جاهز — لا داعٍ لاختياره يدوياً.
    useEffect(() => {
        if (loading || user?.role !== 'operator' || user.category !== 'oral')
            return;
        const ready = exams.filter((e) => e.hasRoster && !e.committeeId);
        if (ready.length === 1)
            navigate(`/admin/oral/${ready[0].id}`, { replace: true });
    }, [loading, user, exams, navigate]);
    async function toggle(exam) {
        if (!user?.token)
            return;
        if (!exam.active && exam.pendingQuestions) {
            setError('استكمل أسئلة المسودة قبل تفعيل الاختبار');
            navigate('/admin/complete-questions/' + exam.id);
            return;
        }
        setError('');
        try {
            await apiToggleExam(user.token, exam.id, !exam.active);
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر تغيير حالة الاختبار');
        }
    }
    async function confirmDelete() {
        if (!user?.token || !examToDelete)
            return;
        setDeletingId(examToDelete.id);
        try {
            await apiDeleteExam(user.token, examToDelete.id);
            setExamToDelete(null);
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل الحذف');
        }
        finally {
            setDeletingId(null);
        }
    }
    async function exportPdf(exam, mode) {
        if (!user?.token)
            return;
        if (exam.jobBased) {
            navigate('/admin/roster/' + exam.id);
            return;
        }
        setExportingId(exam.id);
        setError('');
        try {
            const res = await apiAdminExamQuestions(user.token, exam.id);
            const config = {
                id: exam.id,
                title: exam.title,
                category: exam.category,
                role: exam.oralRole || undefined,
                level: exam.level,
                capacity: exam.capacity,
                questionCount: res.questions.length,
                createdAt: exam.createdAt,
                questionIds: res.questions.map((q) => q.id),
            };
            openPrintWindow(config, res.questions, mode);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل التصدير');
        }
        finally {
            setExportingId(null);
        }
    }
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let rows = exams.filter((e) => {
            if (categoryFilter !== 'all' && e.category !== categoryFilter)
                return false;
            if (levelFilter !== 'all' && e.level !== levelFilter)
                return false;
            if (statusFilter === 'active' && !e.active)
                return false;
            if (statusFilter === 'inactive' && e.active)
                return false;
            if (statusFilter === 'roster' && !e.hasRoster)
                return false;
            if (!q)
                return true;
            const hay = [
                e.title,
                e.id,
                CATEGORY_META[e.category]?.label,
                EXAM_LEVELS.find((l) => l.id === e.level)?.label,
                e.createdBy,
            ];
            return hay.some((h) => h?.toLowerCase().includes(q));
        });
        rows = [...rows].sort((a, b) => {
            switch (sort) {
                case 'title_asc':
                    return a.title.localeCompare(b.title, 'ar');
                case 'title_desc':
                    return b.title.localeCompare(a.title, 'ar');
                case 'seats_desc':
                    return b.usedSeats - a.usedSeats;
                case 'questions_desc':
                    return b.questionCount - a.questionCount;
                case 'date_asc':
                    return String(a.createdAt).localeCompare(String(b.createdAt));
                case 'date_desc':
                default:
                    return String(b.createdAt).localeCompare(String(a.createdAt));
            }
        });
        return rows;
    }, [exams, search, categoryFilter, levelFilter, statusFilter, sort]);
    const stats = useMemo(() => {
        const totalExams = exams.length;
        const activeExams = exams.filter((e) => e.active).length;
        const totalSeats = exams.reduce((acc, e) => acc + (e.rosterCount || e.capacity || 0), 0);
        const evaluatedSeats = exams.reduce((acc, e) => acc + (e.usedSeats || 0), 0);
        const percentDone = totalSeats > 0 ? Math.round((evaluatedSeats / totalSeats) * 100) : 0;
        return { totalExams, activeExams, totalSeats, evaluatedSeats, percentDone };
    }, [exams]);
    const isCandidateEvaluationOperator = user?.role === 'operator' && ['oral', 'driving', 'personality'].includes(user.category || '');
    if (isCandidateEvaluationOperator) {
        const isOral = user?.category === 'oral';
        return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-extrabold text-light-gold", children: ["\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u2014 ", user?.label] }), _jsx("p", { className: "mt-1 text-sm text-mute", children: isOral
                                ? 'اختر الاختبار لعرض المتقدمين وبدء جلسة التقييم الشفهي ورصد الدرجات.'
                                : 'اختر الاختبار أو افتح قائمة المتقدمين لرصد نتائج الفحص مباشرة.' })] }), loading ? (_jsx("div", { className: "flex justify-center py-12", children: _jsx(Loader2, { className: "h-8 w-8 animate-spin text-gold" }) })) : exams.length === 0 ? (_jsx("div", { className: "rounded-2xl border border-line bg-card p-12 text-center text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0645\u062E\u0635\u0635\u0629 \u0644\u0643 \u062D\u0627\u0644\u064A\u0627\u064B." })) : (_jsx("div", { className: "grid gap-4 md:grid-cols-2", children: exams.map((exam) => (_jsxs("div", { className: "rounded-2xl border border-line bg-card p-5", children: [_jsx("h2", { className: "font-extrabold text-light-gold", children: exam.title }), _jsxs("p", { className: "mt-2 text-sm text-mute", children: [isOral ? 'قائمة المتقدمين' : 'المتقدمون الأساسيون', ": ", isOral ? (exam.rosterCount || 0) : (baseCandidatesCount ?? exam.capacity), " \u00B7 \u062A\u0645 \u062A\u0642\u064A\u064A\u0645 ", exam.usedSeats] }), exam.hasRoster || !isOral ? (_jsxs(Link, { to: exam.committeeId ? `/admin/results/${exam.id}` : isOral ? `/admin/oral/${exam.id}` : `/admin/candidates/${exam.id}`, className: "mt-5 inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink", children: [_jsx(ClipboardPen, { className: "h-4 w-4" }), " \u0639\u0631\u0636 \u0627\u0644\u0623\u0633\u0645\u0627\u0621 \u0648\u0628\u062F\u0621 \u0627\u0644\u062A\u0642\u064A\u064A\u0645"] })) : (_jsx("p", { className: "mt-5 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-mute", children: "\u064A\u062A\u0637\u0644\u0628 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0634\u0641\u0647\u064A \u0631\u0641\u0639 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0639\u0646\u062F \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631." }))] }, exam.id))) }))] }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: user?.role === 'operator' ? `اختبارات — ${user.label}` : 'لوحة الاختبارات' }), _jsx("p", { className: "mt-1 text-sm text-mute", children: user?.role === 'operator'
                                    ? 'تعرض اختبارات اختصاصك فقط'
                                    : 'إدارة جميع الاختبارات والحسابات والنتائج' })] }), user?.role !== 'commander' && (_jsxs(Link, { to: user?.role === 'admin' ? '/admin/create' : '/committees', className: "inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink hover:bg-accent-gold", children: [_jsx(Plus, { className: "h-4 w-4" }), user?.role === 'admin' ? 'فرز المتقدمين' : 'إنشاء الاختبار'] }))] }), error && (_jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error })), !loading && exams.length > 0 && (_jsxs("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-4", children: [_jsxs("div", { className: "glass-card rounded-2xl p-4", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs font-semibold text-mute", children: [_jsx(Layers, { className: "h-4 w-4 text-gold" }), _jsx("span", { children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A" })] }), _jsxs("div", { className: "mt-2 text-2xl font-black text-light-gold", children: [stats.totalExams, " ", _jsx("span", { className: "text-xs font-normal text-mute", children: "\u0627\u062E\u062A\u0628\u0627\u0631" })] }), _jsxs("div", { className: "mt-1 text-xs text-mute", children: [stats.activeExams, " \u0641\u0639\u0651\u0627\u0644 \u062D\u0627\u0644\u064A\u0627\u064B"] })] }), _jsxs("div", { className: "glass-card rounded-2xl p-4", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs font-semibold text-mute", children: [_jsx(Users, { className: "h-4 w-4 text-accent-gold" }), _jsx("span", { children: "\u0637\u0627\u0642\u0629 \u0627\u0644\u0645\u0642\u0627\u0639\u062F \u0627\u0644\u0643\u0644\u064A\u0629" })] }), _jsxs("div", { className: "mt-2 text-2xl font-black text-light-gold", children: [stats.totalSeats, " ", _jsx("span", { className: "text-xs font-normal text-mute", children: "\u0645\u062A\u0642\u062F\u0645" })] }), _jsx("div", { className: "mt-1 text-xs text-mute", children: "\u0639\u0628\u0631 \u0643\u0627\u0641\u0629 \u0627\u0644\u0644\u062C\u0627\u0646" })] }), _jsxs("div", { className: "glass-card rounded-2xl p-4", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs font-semibold text-mute", children: [_jsx(CheckCircle2, { className: "h-4 w-4 text-success" }), _jsx("span", { children: "\u0627\u0644\u0645\u062A\u0642\u062F\u0645\u0648\u0646 \u0627\u0644\u0645\u0642\u064A\u0645\u0648\u0646" })] }), _jsxs("div", { className: "mt-2 text-2xl font-black text-light-gold", children: [stats.evaluatedSeats, " ", _jsx("span", { className: "text-xs font-normal text-mute", children: "\u062A\u0645 \u0625\u0646\u0647\u0627\u0624\u0647\u0645" })] }), _jsxs("div", { className: "mt-1 text-xs text-mute", children: ["\u0646\u0633\u0628\u0629 \u0627\u0644\u0625\u0646\u062C\u0627\u0632 ", stats.percentDone, "%"] })] }), _jsxs("div", { className: "glass-card rounded-2xl p-4", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs font-semibold text-mute", children: [_jsx(TrendingUp, { className: "h-4 w-4 text-gold" }), _jsx("span", { children: "\u0645\u0639\u062F\u0644 \u0627\u0644\u062A\u0642\u062F\u0645 \u0627\u0644\u0639\u0627\u0645" })] }), _jsxs("div", { className: "mt-2 text-2xl font-black text-light-gold", children: [stats.percentDone, "%"] }), _jsx("div", { className: "mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel", children: _jsx("div", { className: "h-full rounded-full bg-gradient-to-r from-gold to-accent-gold transition-all duration-500", style: { width: `${Math.min(stats.percentDone, 100)}%` } }) })] })] })), !loading && exams.length > 0 && (_jsx(AdminListToolbar, { search: search, onSearchChange: setSearch, searchPlaceholder: "\u0627\u0628\u062D\u062B \u0628\u0627\u0644\u0639\u0646\u0648\u0627\u0646\u060C \u0627\u0644\u062D\u0633\u0627\u0628\u060C \u0623\u0648 \u0627\u0644\u0645\u0639\u0631\u0641...", filters: [
                    {
                        id: 'category',
                        label: 'نوع الاختبار',
                        value: categoryFilter,
                        options: CATEGORY_FILTERS,
                        onChange: (v) => setCategoryFilter(v),
                    },
                    {
                        id: 'level',
                        label: 'المستوى',
                        value: levelFilter,
                        options: [
                            { id: 'all', label: 'كل المستويات' },
                            ...EXAM_LEVELS.map((l) => ({ id: l.id, label: l.label })),
                        ],
                        onChange: (v) => setLevelFilter(v),
                    },
                    {
                        id: 'status',
                        label: 'الحالة',
                        value: statusFilter,
                        options: [
                            { id: 'all', label: 'الكل' },
                            { id: 'active', label: 'فعّال' },
                            { id: 'inactive', label: 'متوقف' },
                            { id: 'roster', label: 'قائمة Excel / QR' },
                        ],
                        onChange: (v) => setStatusFilter(v),
                    },
                ], sortValue: sort, sortOptions: [
                    { id: 'date_desc', label: 'الأحدث إنشاءً' },
                    { id: 'date_asc', label: 'الأقدم إنشاءً' },
                    { id: 'title_asc', label: 'العنوان أ–ي' },
                    { id: 'title_desc', label: 'العنوان ي–أ' },
                    { id: 'seats_desc', label: 'الأكثر إشغالاً' },
                    { id: 'questions_desc', label: 'الأكثر أسئلة' },
                ], onSortChange: setSort, shown: filtered.length, total: exams.length, onReset: () => {
                    setSearch('');
                    setCategoryFilter('all');
                    setLevelFilter('all');
                    setStatusFilter('all');
                    setSort('date_desc');
                } })), loading ? (_jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." })) : exams.length === 0 ? (_jsxs("div", { className: "rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute", children: ["\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0628\u0639\u062F.", user?.role !== 'commander' && _jsx("div", { className: "mt-3", children: _jsx(Link, { to: user?.role === 'admin' ? '/admin/create' : '/committees', className: "font-bold text-gold", children: user?.role === 'admin' ? 'فرز المتقدمين' : 'إنشاء الاختبار من قائمة اللجنة' }) })] })) : filtered.length === 0 ? (_jsx("div", { className: "rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0644\u0628\u062D\u062B \u0623\u0648 \u0627\u0644\u062A\u0635\u0641\u064A\u0629." })) : (_jsx("div", { className: "space-y-3", children: filtered.map((e) => (_jsx("div", { className: "rounded-2xl border border-line bg-card p-4", children: _jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-text", children: e.title }), e.pendingQuestions && _jsx(Link, { className: "mt-2 block text-sm font-bold text-gold underline", to: '/admin/complete-questions/' + e.id, children: "\u0645\u0633\u0648\u062F\u0629 \u062A\u062D\u062A\u0627\u062C \u0623\u0633\u0626\u0644\u0629 \u2014 \u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" }), _jsxs("div", { className: "mt-1 text-xs text-mute", children: [CATEGORY_META[e.category].label, " \u00B7", ' ', EXAM_LEVELS.find((l) => l.id === e.level)?.label, " \u00B7", ' ', e.questionCount, " \u0633\u0624\u0627\u0644 \u00B7 \u0627\u0644\u0645\u0642\u0627\u0639\u062F ", e.usedSeats, "/", e.capacity, !e.active && _jsx("span", { className: "mr-2 text-error", children: " \u00B7 \u0645\u062A\u0648\u0642\u0641" })] }), e.hasRoster ? (_jsxs("div", { className: "mt-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-light-gold", children: ["\u0642\u0627\u0626\u0645\u0629 \u0645\u0645\u062A\u062D\u0646\u064A\u0646 \u0645\u0631\u0641\u0648\u0639\u0629 (", e.rosterCount, ") \u2014", ' ', e.pendingQuestions ? (_jsxs(Link, { to: `/admin/complete-questions/${e.id}`, className: "font-bold underline", children: ["\u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", e.showsBarcode === false ? '' : ' قبل تفعيل QR'] })) : e.showsBarcode === false ? (_jsx(Link, { to: `/admin/roster/${e.id}`, className: "font-bold underline", children: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0645\u062A\u062D\u0646\u064A\u0646 \u0628\u0644\u0627 \u0628\u0627\u0631\u0643\u0648\u062F" })) : (_jsx(Link, { to: `/admin/roster/${e.id}`, className: "font-bold underline", children: "\u0639\u0631\u0636 \u0627\u0644\u0628\u0637\u0627\u0642\u0627\u062A \u0648 QR" }))] })) : (_jsx("div", { className: "mt-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn", children: "\u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0642\u062F\u064A\u0645 \u0628\u0644\u0627 \u0628\u0637\u0627\u0642\u0627\u062A QR\u060C \u0648\u0644\u0646 \u064A\u0633\u0645\u062D \u0627\u0644\u0646\u0638\u0627\u0645 \u0628\u062F\u062E\u0648\u0644 \u0645\u0645\u062A\u062D\u0646\u064A\u0646 \u0625\u0644\u064A\u0647." }))] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", disabled: exportingId === e.id, onClick: () => void exportPdf(e, 'exam'), className: "inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-text-2 disabled:opacity-50", children: [_jsx(FileDown, { className: "h-3.5 w-3.5" }), " \u0646\u0645\u0648\u0630\u062C PDF"] }), e.category !== 'personality' && (_jsxs("button", { type: "button", disabled: exportingId === e.id, onClick: () => void exportPdf(e, 'answer_key'), className: "inline-flex items-center gap-1 rounded-lg border border-ok/40 bg-ok/10 px-3 py-1.5 text-xs font-bold text-ok disabled:opacity-50", children: [_jsx(FileDown, { className: "h-3.5 w-3.5" }), e.category === 'oral' ? 'سلم التقييم' : 'سلم الحل'] })), e.hasRoster && !e.committeeId && (_jsxs(Link, { to: e.pendingQuestions ? `/admin/complete-questions/${e.id}` : `/admin/roster/${e.id}`, className: "inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold", children: [_jsx(QrCode, { className: "h-3.5 w-3.5" }), " ", e.pendingQuestions ? 'استكمال الأسئلة' : e.showsBarcode === false ? 'قائمة الممتحنين' : 'بطاقات QR'] })), _jsxs(Link, { to: e.committeeId ? (user?.role === 'admin' ? '/committees' : `/admin/results/${e.id}`) : e.category !== 'theory' ? `/evaluation/${e.id}` : `/admin/enter/${e.id}`, className: "inline-flex items-center gap-1 rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-xs font-bold text-light-gold", children: [_jsx(ClipboardPen, { className: "h-3.5 w-3.5" }), ' ', e.committeeId ? 'تقييم اللجنة' : e.category === 'oral' ? 'رصد الدرجات' : 'إدخال نتائج'] }), _jsxs(Link, { to: `/admin/results/${e.id}`, className: "inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink", children: [_jsx(Eye, { className: "h-3.5 w-3.5" }), " \u0627\u0644\u0646\u062A\u0627\u0626\u062C"] }), _jsxs("button", { type: "button", onClick: () => void toggle(e), disabled: !e.active && !!e.pendingQuestions, title: !e.active && e.pendingQuestions ? 'استكمل الأسئلة أولاً' : undefined, className: "inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-text-2 disabled:opacity-40", children: [_jsx(Power, { className: "h-3.5 w-3.5" }), e.active ? 'إيقاف' : e.pendingQuestions ? 'مسودة' : 'تفعيل'] }), _jsxs("button", { type: "button", disabled: deletingId === e.id || !!e.committeeId, title: e.committeeId ? 'مرتبط بلجنة تقييم؛ يمكن إيقاف الاختبار' : undefined, onClick: () => setExamToDelete(e), className: "inline-flex items-center gap-1 rounded-lg border border-error/40 bg-error/10 px-3 py-1.5 text-xs font-bold text-error hover:bg-error/20 disabled:opacity-50", children: [_jsx(Trash2, { className: "h-3.5 w-3.5" }), "\u062D\u0630\u0641"] })] })] }) }, e.id))) })), examToDelete && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in", dir: "rtl", children: _jsxs("div", { className: "w-full max-w-md rounded-2xl border border-error/30 bg-card p-6 shadow-2xl space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between pb-3 border-b border-line", children: [_jsxs("div", { className: "flex items-center gap-2 text-error font-bold", children: [_jsx(AlertTriangle, { className: "h-5 w-5" }), _jsx("span", { children: "\u062A\u0623\u0643\u064A\u062F \u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" })] }), _jsx("button", { type: "button", onClick: () => setExamToDelete(null), className: "text-mute hover:text-text p-1 rounded-lg hover:bg-white/5", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsxs("p", { className: "text-sm text-text leading-relaxed", children: ["\u0647\u0644 \u062A\u0631\u064A\u062F \u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u061F", _jsx("br", {}), _jsxs("strong", { className: "text-light-gold text-base block mt-2", children: ["\u00AB", examToDelete.title, "\u00BB"] })] }), _jsx("div", { className: "rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error leading-relaxed", children: "\u0633\u064A\u062A\u0648\u0642\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0648\u062A\u062A\u0639\u0637\u0644 \u0628\u0637\u0627\u0642\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u064A\u0647. \u062A\u0628\u0642\u0649 \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0648\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0648\u0623\u062D\u062F\u0627\u062B \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629 \u0648\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0645\u062D\u0641\u0648\u0638\u0629\u060C \u0648\u064A\u0645\u0643\u0646 \u0627\u0644\u0631\u062C\u0648\u0639 \u0625\u0644\u064A\u0647\u0627 \u0645\u0646 \u0627\u0644\u0623\u0631\u0634\u064A\u0641. \u062A\u064F\u0646\u0634\u0623 \u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u0633\u0644\u064A\u0645\u0629 \u0642\u0628\u0644 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062D\u0630\u0641." }), _jsxs("div", { className: "flex items-center justify-end gap-3 pt-2", children: [_jsx("button", { type: "button", disabled: deletingId === examToDelete.id, onClick: () => setExamToDelete(null), className: "rounded-xl border border-line px-4 py-2 text-sm font-semibold text-text-2 hover:bg-white/5 disabled:opacity-50", children: "\u0625\u0644\u063A\u0627\u0621" }), _jsx("button", { type: "button", disabled: deletingId === examToDelete.id, onClick: () => void confirmDelete(), className: "inline-flex items-center gap-2 rounded-xl bg-error px-4 py-2 text-sm font-bold text-white hover:bg-error/90 disabled:opacity-50", children: deletingId === examToDelete.id ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u062C\u0627\u0631\u064A \u0627\u0644\u062D\u0630\u0641..."] })) : (_jsxs(_Fragment, { children: [_jsx(Trash2, { className: "h-4 w-4" }), "\u062D\u0630\u0641 \u0645\u0639 \u062D\u0641\u0638 \u0627\u0644\u0633\u062C\u0644\u0627\u062A"] })) })] })] }) }))] }));
}
