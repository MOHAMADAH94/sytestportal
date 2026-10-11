import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Archive, BookOpen, Brain, Car, CheckCircle2, ChevronDown, ChevronUp, FileText, MessageSquare, Search, Shield, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiListAssessmentArchive } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ORAL_ROLES } from '../data/types';
import { ArchiveProtectionStatus, ArchiveVersions } from '../components/ArchiveProtectionStatus';
function formatDate(iso) {
    try {
        return new Intl.DateTimeFormat('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(iso));
    }
    catch {
        return iso;
    }
}
function getOralRoleLabel(id) {
    if (!id)
        return null;
    return ORAL_ROLES.find((r) => r.id === id)?.label ?? id;
}
const CATEGORY_MAP = {
    theory: {
        label: 'عام',
        icon: BookOpen,
        badgeClass: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
    },
    oral: {
        label: 'شفهي',
        icon: MessageSquare,
        badgeClass: 'text-warn border-warn/30 bg-warn/10',
    },
    driving: {
        label: 'أهلية قيادة الضابط',
        icon: Car,
        badgeClass: 'text-ok border-ok/30 bg-ok/10',
    },
    personality: {
        label: 'تقييم الشخصية',
        icon: Brain,
        badgeClass: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    },
};
function CategoryBadge({ category }) {
    const meta = CATEGORY_MAP[category] || {
        label: category,
        icon: FileText,
        badgeClass: 'text-mute border-line bg-card',
    };
    const Icon = meta.icon;
    return (_jsxs("span", { className: `inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${meta.badgeClass}`, children: [_jsx(Icon, { className: "h-3 w-3" }), meta.label] }));
}
function ScoreBadge({ score, maxScore, percent }) {
    const pct = percent ?? (maxScore ? Math.round((score / maxScore) * 100) : 0);
    const color = pct >= 80
        ? 'text-ok border-ok/40 bg-ok/10'
        : pct >= 60
            ? 'text-gold border-gold/40 bg-gold/10'
            : 'text-error border-error/40 bg-error/10';
    return (_jsxs("span", { className: `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`, children: [score, "/", maxScore, " (", pct, "%)"] }));
}
function RecordRow({ record, canSeeRank }) {
    const [expanded, setExpanded] = useState(false);
    const roleLabel = getOralRoleLabel(record.oralRole);
    const detail = record.detail || {};
    // استخراج تفاصيل الشفهي (سواء بالشكل الجديد أو القديم)
    const oralQuestions = Array.isArray(detail.questions)
        ? detail.questions
        : [];
    // استخراج سمات الشخصية
    const personalityTraits = Array.isArray(detail.traits)
        ? detail.traits
        : [];
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { className: "border-b border-line transition-colors hover:bg-card/60", children: [_jsxs("td", { className: "px-4 py-3", children: [_jsx("div", { className: "text-sm font-bold text-text", children: record.examineeName }), record.displayId && _jsxs("div", { className: "text-xs text-mute", children: ["\u0631\u0642\u0645: ", record.displayId] })] }), _jsx("td", { className: "px-4 py-3 text-sm text-text-2", children: record.org || '—' }), _jsx("td", { className: "px-4 py-3", children: _jsx(CategoryBadge, { category: record.category }) }), _jsxs("td", { className: "px-4 py-3 text-sm text-text-2", children: [_jsx("div", { children: record.jobTitle || '—' }), roleLabel && _jsx("div", { className: "mt-0.5 text-xs text-mute", children: roleLabel })] }), _jsx("td", { className: "px-4 py-3 text-sm text-text-2", children: _jsx("div", { className: "max-w-[200px] truncate", title: record.examTitle, children: record.examTitle }) }), _jsx("td", { className: "px-4 py-3", children: _jsx(ScoreBadge, { score: record.score, maxScore: record.maxScore, percent: record.percent }) }), canSeeRank && (_jsx("td", { className: "px-4 py-3 text-sm text-text-2 font-medium", children: record.rank ? (_jsxs("span", { className: "inline-flex items-center gap-1 rounded bg-panel px-2 py-0.5 text-xs text-light-gold", children: [_jsx(Shield, { className: "h-3 w-3" }), record.rank] })) : ('—') })), _jsx("td", { className: "px-4 py-3 text-xs text-mute", children: formatDate(record.archivedAt) }), _jsx("td", { className: "px-4 py-3 text-xs text-mute", children: record.evaluator || '—' }), _jsx("td", { className: "px-4 py-3 text-left", children: _jsxs("button", { type: "button", onClick: () => setExpanded((v) => !v), className: "inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-bold text-mute transition hover:border-gold/50 hover:text-gold", "aria-label": expanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل', children: [expanded ? _jsx(ChevronUp, { className: "h-3.5 w-3.5" }) : _jsx(ChevronDown, { className: "h-3.5 w-3.5" }), expanded ? 'إخفاء' : 'تفاصيل'] }) })] }), expanded && (_jsx("tr", { className: "border-b border-line bg-panel/50", children: _jsxs("td", { colSpan: canSeeRank ? 10 : 9, className: "px-6 py-4", children: [_jsx(ArchiveVersions, { id: record.id }), (detail.type === 'evaluation_session' || Array.isArray(detail.evaluationSessions)) && _jsxs("div", { className: "mb-5 space-y-3 rounded-xl border border-gold/40 p-4", children: [_jsx("h3", { className: "font-bold text-gold", children: "\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0648\u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A" }), (detail.type === 'evaluation_session' ? [{ id: detail.sessionId, mode: detail.mode, questions: detail.questions, evaluator_label: detail.evaluator }] : detail.evaluationSessions).map((session) => _jsxs("details", { className: "rounded-xl border border-line p-3", children: [_jsxs("summary", { className: "cursor-pointer text-gold", children: [session.evaluator_label || session.evaluator_key || record.evaluator, " \u2014 ", { suggested: 'أسئلة مقترحة', qr: 'QR مع المراقبة', interview: 'مقابلة مباشرة', manual: 'مقابلة يدوية' }[session.mode]] }), session.questions?.map((q) => _jsxs("div", { className: "mt-3 space-y-1 border-t border-line pt-3 text-sm", children: [_jsx("p", { className: "font-bold", children: q.text }), _jsxs("p", { children: ["\u0627\u0644\u062D\u0627\u0644\u0629: ", q.status === 'approved' ? 'معتمد' : q.status === 'excluded' ? 'مستبعد' : 'مقترح', " \u2022 \u0627\u0644\u0645\u0635\u062F\u0631: ", q.source === 'manual' ? 'يدوي' : 'البنك'] }), _jsxs("p", { children: ["\u0627\u0644\u0625\u062C\u0627\u0628\u0629: ", q.choices?.find((c) => c.id === q.answer)?.text || q.answer || '—'] }), _jsxs("p", { children: ["\u0627\u0644\u062F\u0631\u062C\u0629: ", q.grade ?? '—', "/10 \u2022 \u0627\u0644\u0648\u0632\u0646: ", q.weight] }), _jsxs("p", { className: "whitespace-pre-wrap text-mute", children: ["\u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C\u064A\u0629: ", q.answerKey || '—'] })] }, q.id)), _jsx("a", { className: "mt-3 inline-block text-gold underline", href: '/evaluation/' + record.examId + '?session=' + session.id, children: "\u0641\u062A\u062D \u0633\u062C\u0644 \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0648\u0623\u062D\u062F\u0627\u062B \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629" })] }, session.id))] }), detail.type === 'committee' && Array.isArray(detail.members) && (_jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "font-bold text-gold", children: ["\u062A\u0642\u064A\u064A\u0645 \u0644\u062C\u0646\u0629: ", String(detail.committeeName || '')] }), _jsx("p", { className: "text-xs text-mute", children: "\u0627\u0644\u0623\u0648\u0632\u0627\u0646 \u0648\u0627\u0644\u062F\u0631\u062C\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u0629 \u0648\u0642\u062A \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0646\u062A\u064A\u062C\u0629." }), _jsxs("table", { className: "w-full text-right text-sm", children: [_jsx("thead", { className: "text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "p-2", children: "\u0627\u0644\u0639\u0636\u0648" }), _jsx("th", { className: "p-2", children: "\u0627\u0644\u0648\u0632\u0646" }), _jsx("th", { className: "p-2", children: "\u0627\u0644\u062F\u0631\u062C\u0629" }), _jsx("th", { className: "p-2", children: "\u0627\u0644\u0645\u0633\u0627\u0647\u0645\u0629" })] }) }), _jsx("tbody", { children: detail.members.map((member) => _jsxs("tr", { className: "border-t border-line", children: [_jsxs("td", { className: "p-2", children: [member.name, " \u2014 ", member.role === 'committee_manager' ? 'مدير اللجنة' : 'عضو اللجنة'] }), _jsxs("td", { className: "p-2", children: [member.weight, "%"] }), _jsxs("td", { className: "p-2", children: [member.score, "/100"] }), _jsx("td", { className: "p-2", children: member.contribution.toFixed(2) })] }, member.accountId)) })] })] })), detail.type !== 'committee' && detail.type !== 'evaluation_session' && record.category === 'oral' && (_jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "text-xs font-extrabold uppercase tracking-wider text-gold flex items-center gap-1.5", children: [_jsx(MessageSquare, { className: "h-3.5 w-3.5" }), "\u0623\u0633\u0626\u0644\u0629 \u0648\u0625\u062C\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629 \u0627\u0644\u0634\u0641\u0647\u064A\u0629 (", oralQuestions.length, " \u0633\u0624\u0627\u0644)"] }), oralQuestions.length === 0 ? (_jsx("p", { className: "text-xs text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0641\u0627\u0635\u064A\u0644 \u0623\u0633\u0626\u0644\u0629 \u0645\u0633\u062C\u0644\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629." })) : (_jsx("div", { className: "space-y-2.5", children: oralQuestions.map((q, i) => (_jsxs("div", { className: "rounded-xl border border-line bg-card p-4", children: [_jsxs("div", { className: "mb-2 flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("span", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u0633\u0624\u0627\u0644 ", i + 1] }), _jsx("p", { className: "mt-1 text-sm font-semibold text-text", children: q.text || '—' })] }), _jsxs("div", { className: "shrink-0 text-right", children: [_jsx("span", { className: "text-xs text-mute", children: "\u0627\u0644\u062F\u0631\u062C\u0629" }), _jsxs("div", { className: "text-sm font-bold text-light-gold", children: [q.awarded ?? 0, " / ", q.points ?? 0] })] })] }), q.answer && (_jsxs("div", { className: "rounded-lg bg-panel px-3 py-2", children: [_jsx("span", { className: "text-xs text-mute", children: "\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645:" }), _jsx("p", { className: "mt-0.5 text-sm text-text-2", children: q.answer })] }))] }, q.id || i))) }))] })), detail.type !== 'committee' && detail.type !== 'evaluation_session' && record.category === 'personality' && (_jsxs("div", { className: "space-y-4", children: [_jsxs("h3", { className: "text-xs font-extrabold uppercase tracking-wider text-purple-400 flex items-center gap-1.5", children: [_jsx(Brain, { className: "h-3.5 w-3.5" }), "\u062A\u062D\u0644\u064A\u0644 \u0633\u0645\u0627\u062A \u0627\u0644\u0634\u062E\u0635\u064A\u0629"] }), personalityTraits.length > 0 ? (_jsx("div", { className: "grid gap-3 sm:grid-cols-2", children: personalityTraits.map((t, idx) => (_jsxs("div", { className: "rounded-xl border border-line bg-card p-3", children: [_jsxs("div", { className: "flex justify-between text-xs font-semibold text-text mb-1", children: [_jsx("span", { children: t.name || t.trait || t.label || `سمة ${idx + 1}` }), _jsx("span", { className: "text-purple-300", children: t.score != null ? `${t.score}%` : '—' })] }), t.score != null && (_jsx("div", { className: "h-2 w-full overflow-hidden rounded-full bg-panel", children: _jsx("div", { className: "h-full bg-purple-500 transition-all", style: { width: `${Math.min(Math.max(t.score, 0), 100)}%` } }) }))] }, idx))) })) : (_jsx("p", { className: "text-xs text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0633\u0645\u0627\u062A \u062A\u0641\u0635\u064A\u0644\u064A\u0629 \u0645\u0633\u062C\u0644\u0629." })), typeof detail.summary === 'string' && detail.summary && (_jsxs("div", { className: "rounded-xl border border-line bg-card p-4", children: [_jsx("span", { className: "text-xs font-bold text-mute", children: "\u0627\u0644\u0645\u0644\u062E\u0635 \u0627\u0644\u062A\u0642\u064A\u064A\u0645\u064A:" }), _jsx("p", { className: "mt-1 text-sm text-text-2 whitespace-pre-wrap", children: detail.summary })] }))] })), detail.type !== 'committee' && detail.type !== 'evaluation_session' && record.category === 'theory' && (_jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "text-xs font-extrabold uppercase tracking-wider text-sky-400 flex items-center gap-1.5", children: [_jsx(BookOpen, { className: "h-3.5 w-3.5" }), "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0639\u0627\u0645"] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { className: "rounded-xl border border-line bg-card p-3 text-center", children: [_jsx("div", { className: "text-xs text-mute", children: "\u0639\u062F\u062F \u0627\u0644\u0623\u0633\u0626\u0644\u0629" }), _jsx("div", { className: "mt-1 text-lg font-bold text-text", children: detail.questionCount ?? '—' })] }), _jsxs("div", { className: "rounded-xl border border-line bg-card p-3 text-center", children: [_jsx("div", { className: "text-xs text-mute", children: "\u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A \u0627\u0644\u0635\u062D\u064A\u062D\u0629" }), _jsx("div", { className: "mt-1 text-lg font-bold text-ok", children: detail.correctCount ?? '—' })] }), _jsxs("div", { className: "rounded-xl border border-line bg-card p-3 text-center", children: [_jsx("div", { className: "text-xs text-mute", children: "\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u0648\u0636\u0648\u0639\u064A\u0629" }), _jsx("div", { className: "mt-1 text-lg font-bold text-light-gold", children: detail.objectiveCount ?? '—' })] })] })] })), detail.type !== 'committee' && detail.type !== 'evaluation_session' && record.category === 'driving' && (_jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "text-xs font-extrabold uppercase tracking-wider text-ok flex items-center gap-1.5", children: [_jsx(Car, { className: "h-3.5 w-3.5" }), "\u062A\u0642\u064A\u064A\u0645 \u0623\u0647\u0644\u064A\u0629 \u0642\u064A\u0627\u062F\u0629 \u0627\u0644\u0636\u0627\u0628\u0637"] }), _jsxs("div", { className: "rounded-xl border border-line bg-card p-4", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm text-text", children: [_jsx(CheckCircle2, { className: "h-4 w-4 text-ok" }), _jsx("span", { children: "\u062A\u0645 \u0631\u0635\u062F \u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0648\u0627\u0639\u062A\u0645\u0627\u062F\u0647\u0627 \u0631\u0633\u0645\u064A\u0627\u064B \u0641\u064A \u0645\u0646\u0638\u0648\u0645\u0629 \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0642\u064A\u0627\u062F\u0629." })] }), _jsxs("div", { className: "mt-2 text-xs text-mute", children: ["\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0645\u0633\u062C\u0644\u0629: ", record.score, " \u0645\u0646 \u0623\u0635\u0644 ", record.maxScore, " (", record.percent ?? 0, "%)"] })] })] }))] }) }))] }));
}
export function AdminOralArchivePage() {
    const { user } = useAuth();
    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState(null);
    const [error, setError] = useState('');
    // فلاتر البحث
    const [categoryFilter, setCategoryFilter] = useState('');
    const [nameFilter, setNameFilter] = useState('');
    const [titleFilter, setTitleFilter] = useState('');
    const [orgFilter, setOrgFilter] = useState('');
    const debounceRef = useRef(null);
    const canSeeRank = user?.role === 'admin' || user?.role === 'commander';
    const isOperator = user?.role === 'operator';
    async function load(filters) {
        if (!user?.token)
            return;
        setLoading(true);
        setError('');
        try {
            const data = await apiListAssessmentArchive(user.token, {
                category: filters?.category !== undefined ? filters.category : categoryFilter || undefined,
                examineeName: filters?.examineeName !== undefined ? filters.examineeName : nameFilter.trim() || undefined,
                examTitle: filters?.examTitle !== undefined ? filters.examTitle : titleFilter.trim() || undefined,
                org: filters?.org !== undefined ? filters.org : orgFilter.trim() || undefined,
            });
            setRecords(data.archive);
            setTotal(data.total);
            setNextCursor(data.hasNext ? data.nextCursor || null : null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل تحميل الأرشيف');
        }
        finally {
            setLoading(false);
        }
    }
    async function loadMore() {
        if (!user?.token || !nextCursor || loadingMore)
            return;
        setLoadingMore(true);
        try {
            const data = await apiListAssessmentArchive(user.token, {
                category: categoryFilter || undefined, examineeName: nameFilter.trim() || undefined,
                examTitle: titleFilter.trim() || undefined, org: orgFilter.trim() || undefined,
                cursor: nextCursor, limit: 100,
            });
            setRecords((current) => [...current, ...data.archive]);
            setNextCursor(data.hasNext ? data.nextCursor || null : null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل تحميل بقية الأرشيف');
        }
        finally {
            setLoadingMore(false);
        }
    }
    useEffect(() => {
        void load();
    }, [user?.token]);
    function handleFilterChange(fields) {
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            void load(fields);
        }, 350);
    }
    function handleCategorySelect(cat) {
        setCategoryFilter(cat);
        void load({
            category: cat || undefined,
            examineeName: nameFilter.trim() || undefined,
            examTitle: titleFilter.trim() || undefined,
            org: orgFilter.trim() || undefined,
        });
    }
    function clearFilters() {
        setCategoryFilter('');
        setNameFilter('');
        setTitleFilter('');
        setOrgFilter('');
        void load({ category: undefined, examineeName: undefined, examTitle: undefined, org: undefined });
    }
    const hasFilters = !!categoryFilter || !!nameFilter.trim() || !!titleFilter.trim() || !!orgFilter.trim();
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Archive, { className: "h-6 w-6 text-gold" }), _jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u0623\u0631\u0634\u064A\u0641 \u0627\u0644\u062A\u0642\u064A\u064A\u0645\u0627\u062A" })] }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u0633\u062C\u0644 \u0645\u062D\u0641\u0648\u0638 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u062A\u0642\u064A\u064A\u0645\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0645\u0644\u0629\u060C \u064A\u062D\u062A\u0641\u0638 \u0628\u0646\u0633\u062E \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0639\u0646\u062F \u062A\u0635\u062D\u064A\u062D\u0647\u0627 (\u0639\u0627\u0645 \u00B7 \u0634\u0641\u0647\u064A \u00B7 \u0642\u064A\u0627\u062F\u0629 \u00B7 \u0634\u062E\u0635\u064A\u0629)" })] }), !loading && (_jsxs("div", { className: "rounded-xl border border-line bg-card px-4 py-2 text-center", children: [_jsx("div", { className: "text-2xl font-extrabold text-light-gold", children: total }), _jsx("div", { className: "text-xs text-mute", children: "\u062A\u0642\u064A\u064A\u0645 \u0645\u0624\u0631\u0634\u0641" })] }))] }), _jsx(ArchiveProtectionStatus, {}), !isOperator && (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("button", { type: "button", onClick: () => handleCategorySelect(''), className: `rounded-xl px-4 py-2 text-xs font-bold transition ${categoryFilter === ''
                            ? 'bg-gold text-ink shadow-md shadow-gold/20'
                            : 'border border-line bg-card text-mute hover:border-gold/40 hover:text-text'}`, children: ["\u0627\u0644\u0643\u0644 (", total, ")"] }), Object.entries(CATEGORY_MAP).map(([key, meta]) => {
                        const Icon = meta.icon;
                        const isSelected = categoryFilter === key;
                        return (_jsxs("button", { type: "button", onClick: () => handleCategorySelect(key), className: `inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${isSelected
                                ? 'bg-gold text-ink shadow-md shadow-gold/20'
                                : 'border border-line bg-card text-mute hover:border-gold/40 hover:text-text'}`, children: [_jsx(Icon, { className: "h-3.5 w-3.5" }), meta.label] }, key));
                    })] })), _jsxs("div", { className: "rounded-2xl border border-line bg-card p-4", children: [_jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [_jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u0628\u062D\u062B \u0628\u0627\u0633\u0645 \u0627\u0644\u0645\u062A\u0642\u062F\u0645", _jsxs("div", { className: "relative mt-1", children: [_jsx(Search, { className: "absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" }), _jsx("input", { id: "archive-filter-name", type: "text", value: nameFilter, placeholder: "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u062A\u0642\u062F\u0645...", onChange: (e) => {
                                                    setNameFilter(e.target.value);
                                                    handleFilterChange({ examineeName: e.target.value.trim() || undefined });
                                                }, className: "w-full rounded-xl border border-line bg-panel py-2 pe-3 ps-9 text-sm text-text outline-none focus:border-gold/60" })] })] }), _jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u0628\u062D\u062B \u0628\u0627\u0644\u062C\u0647\u0629", _jsxs("div", { className: "relative mt-1", children: [_jsx(Search, { className: "absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" }), _jsx("input", { id: "archive-filter-org", type: "text", value: orgFilter, placeholder: "\u0627\u0633\u0645 \u0627\u0644\u062C\u0647\u0629 \u0623\u0648 \u0627\u0644\u0648\u062D\u062F\u0629...", onChange: (e) => {
                                                    setOrgFilter(e.target.value);
                                                    handleFilterChange({ org: e.target.value.trim() || undefined });
                                                }, className: "w-full rounded-xl border border-line bg-panel py-2 pe-3 ps-9 text-sm text-text outline-none focus:border-gold/60" })] })] }), _jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u0628\u062D\u062B \u0628\u0627\u0633\u0645 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631", _jsxs("div", { className: "relative mt-1", children: [_jsx(Search, { className: "absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" }), _jsx("input", { id: "archive-filter-title", type: "text", value: titleFilter, placeholder: "\u0627\u0643\u062A\u0628 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631...", onChange: (e) => {
                                                    setTitleFilter(e.target.value);
                                                    handleFilterChange({ examTitle: e.target.value.trim() || undefined });
                                                }, className: "w-full rounded-xl border border-line bg-panel py-2 pe-3 ps-9 text-sm text-text outline-none focus:border-gold/60" })] })] })] }), hasFilters && (_jsx("div", { className: "mt-3 flex justify-end", children: _jsxs("button", { type: "button", id: "archive-clear-filters", onClick: clearFilters, className: "inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-mute hover:border-error/50 hover:text-error", children: [_jsx(X, { className: "h-3.5 w-3.5" }), "\u0645\u0633\u062D \u0627\u0644\u0641\u0644\u0627\u062A\u0631"] }) }))] }), error && (_jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error })), loading && (_jsxs("div", { className: "flex items-center justify-center py-16", children: [_jsx("div", { className: "h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" }), _jsx("span", { className: "ms-3 text-sm text-mute", children: "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u0631\u0634\u064A\u0641..." })] })), !loading && !error && records.length === 0 && (_jsxs("div", { className: "rounded-2xl border border-dashed border-line bg-panel p-12 text-center", children: [_jsx(Archive, { className: "mx-auto mb-3 h-12 w-12 text-mute/40" }), _jsx("p", { className: "font-bold text-mute", children: hasFilters ? 'لا توجد نتائج تطابق معايير البحث' : 'لا توجد تقييمات مؤرشفة حتى الآن' }), _jsx("p", { className: "mt-1 text-sm text-mute/70", children: hasFilters
                            ? 'جرّب تعديل الفلاتر أو مسحها لعرض جميع السجلات'
                            : 'تؤرشف التقييمات تلقائياً بمجرد إتمام الاختبار واعتماد نتيجته' })] })), !loading && records.length > 0 && (_jsxs("div", { className: "overflow-hidden rounded-2xl border border-line", children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-right", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-line bg-panel/80", children: [_jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u0627\u0644\u0645\u062A\u0642\u062F\u0645" }), _jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u0627\u0644\u062C\u0647\u0629" }), _jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u0646\u0648\u0639 \u0627\u0644\u062A\u0642\u064A\u064A\u0645" }), _jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u0627\u0644\u0645\u0633\u0645\u0649 / \u0627\u0644\u062F\u0648\u0631" }), _jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" }), _jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u0627\u0644\u0646\u062A\u064A\u062C\u0629" }), canSeeRank && (_jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u0627\u0644\u0631\u062A\u0628\u0629" })), _jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u062A\u0642\u064A\u064A\u0645" }), _jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute", children: "\u0627\u0644\u0645\u0642\u064A\u0650\u0651\u0645" }), _jsx("th", { className: "px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-mute" })] }) }), _jsx("tbody", { children: records.map((r) => (_jsx(RecordRow, { record: r, canSeeRank: canSeeRank }, r.id))) })] }) }), _jsxs("div", { className: "flex items-center justify-between gap-3 border-t border-line bg-panel/60 px-4 py-2 text-xs text-mute", children: [_jsxs("span", { children: ["\u064A\u064F\u0639\u0631\u0636 ", records.length, " \u0645\u0646 \u0623\u0635\u0644 ", total, " \u0633\u062C\u0644 \u2014 \u0645\u0631\u062A\u0628\u0629 \u0645\u0646 \u0627\u0644\u0623\u062D\u062F\u062B \u0625\u0644\u0649 \u0627\u0644\u0623\u0642\u062F\u0645"] }), nextCursor && _jsx("button", { type: "button", disabled: loadingMore, onClick: () => void loadMore(), className: "rounded-lg border border-gold/40 px-3 py-1.5 font-bold text-gold disabled:opacity-50", children: loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد' })] })] }))] }));
}
