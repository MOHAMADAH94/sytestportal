import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Download, FileDown, Plus, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiBulkDeleteApplicants, apiCreateApplicant, apiCreateApplicantColumn, apiDeleteApplicant, apiEnrollApplicant, apiImportApplicants, apiListApplicants, apiListExams, apiUpdateApplicant, } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {} from '../data/types';
import { effectiveJobTitle, hasJobTitle } from '../../shared/jobProfiles.js';
import { resolveEvaluationStream, tracksForApplicant } from '../../shared/evaluationMatrix.js';
import { composeTripleName, splitTripleName } from '../../shared/personName.js';
import { downloadRosterTemplate, EXTERNAL_INTERVIEW_HEADERS, exportApplicantsExcel, INTERNAL_INTERVIEW_HEADERS, parseRosterExcel, } from '../utils/parseRosterExcel';
const REQUESTED_NEW_COLUMNS = [
    'المسمى الوارد من الجهة',
    'المسمى المقترح من اللجنة',
    'الراتب المقترح',
    'الرتبة المقترحة من اللجنة',
    'الراتب المقرر من مدير الإدارة',
    'التحصيل العلمي من اللجنة',
];
function fieldForColumn(label) {
    const key = label.replace(/_/g, ' ').trim();
    if (key === 'المسمى الوارد من الجهة' || key === 'مسمى العمل المقترح من الجهة' || key === 'مسمى العمل طلب الاحتياج' || key === 'مسمى المرفوع')
        return 'jobTitleOrg';
    if (key === 'المسمى المقترح من اللجنة' || (key.includes('مسمى عمل') && key.includes('اللجنة')))
        return 'jobTitleCommittee';
    if (key === 'الراتب المقترح' || key === 'راتب مقترح من الجهة')
        return 'proposedSalary';
    if (key === 'الرتبة المقترحة من اللجنة')
        return 'rankCommittee';
    if (key === 'الراتب المقرر من مدير الإدارة')
        return 'approvedSalary';
    if (key === 'التحصيل العلمي من اللجنة' || key === 'التأهيل العلمي مع الاختصاص')
        return 'educationCommittee';
    if (key === 'النتيجة النهائية')
        return 'finalResult';
    if (key.includes('السوية') || key === 'الجهة')
        return 'org';
    if (key.includes('مسمى العمل') || key.includes('المسمى الوظيفي'))
        return 'jobTitle';
    if (key === 'الرتبة')
        return 'rank';
    return 'extra';
}
function cellValue(applicant, column) {
    const field = fieldForColumn(column);
    if (field === 'jobTitleOrg')
        return applicant.jobTitleOrg || applicant.extra?.[column] || '';
    if (field === 'jobTitleCommittee')
        return applicant.jobTitleCommittee || applicant.extra?.[column] || '';
    if (field === 'proposedSalary')
        return applicant.proposedSalary != null ? String(applicant.proposedSalary) : (applicant.extra?.[column] || '');
    if (field === 'rankCommittee')
        return applicant.rankCommittee || applicant.extra?.[column] || '';
    if (field === 'approvedSalary')
        return applicant.approvedSalary != null ? String(applicant.approvedSalary) : (applicant.extra?.[column] || '');
    if (field === 'educationCommittee')
        return applicant.educationCommittee || applicant.extra?.[column] || '';
    if (field === 'org')
        return applicant.org || '';
    if (field === 'jobTitle')
        return applicant.jobTitle || '';
    if (field === 'rank')
        return applicant.rank || '';
    if (field === 'finalResult') {
        if (applicant.finalResult != null)
            return `${applicant.finalResult}%`;
        return `قيد الاستكمال (${applicant.completedCategories?.length || 0}/${applicant.requiredExamCount || 0})`;
    }
    return applicant.extra?.[column] || '';
}
function interviewTypeOf(a) {
    return a.extra?.['نوع المقابلة'] || '';
}
function requiredTracksOf(a) {
    return tracksForApplicant(a).filter((track) => track.category !== 'security');
}
function scoreLabel(a, category) {
    const pct = a.categoryResults?.[category];
    if (pct != null)
        return `${pct}%`;
    if (a.pendingCategories?.includes(category))
        return 'معلّق';
    return '—';
}
function hasAnyExam(a) {
    return Object.keys(a.categoryResults || {}).length > 0 || (a.pendingCategories?.length || 0) > 0;
}
function completionOf(a) {
    if (!hasAnyExam(a))
        return 'none';
    const required = a.requiredExamCount || 0;
    const completed = a.completedCategories?.length || 0;
    if (required > 0 && completed >= required && !(a.pendingCategories?.length))
        return 'complete';
    return 'partial';
}
function securityLabel(a) {
    if (!a.securityReview)
        return 'بانتظار الأمن';
    if (a.securityReview.decision === 'accepted')
        return 'مقبول أمنياً';
    if (a.securityReview.decision === 'rejected')
        return 'مرفوض أمنياً';
    return 'غير محدد';
}
function securityTone(a) {
    if (!a.securityReview)
        return 'border-line text-mute';
    if (a.securityReview.decision === 'accepted')
        return 'border-ok/40 bg-ok/10 text-ok';
    if (a.securityReview.decision === 'rejected')
        return 'border-error/40 bg-error/10 text-error';
    return 'border-warn/40 bg-warn/10 text-warn';
}
export function AdminApplicantsPage() {
    const { user } = useAuth();
    const fileRef = useRef(null);
    const [list, setList] = useState([]);
    const [columns, setColumns] = useState([]);
    const [search, setSearch] = useState('');
    const [newFirst, setNewFirst] = useState('');
    const [newFather, setNewFather] = useState('');
    const [newFamily, setNewFamily] = useState('');
    const [newSeq, setNewSeq] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importType, setImportType] = useState('داخلية');
    const [activeExams, setActiveExams] = useState([]);
    const [selectedExamIds, setSelectedExamIds] = useState([]);
    const [pickedIds, setPickedIds] = useState([]);
    const [enrollExamIds, setEnrollExamIds] = useState([]);
    const [interviewFilter, setInterviewFilter] = useState('all');
    const [completionFilter, setCompletionFilter] = useState('all');
    const [editing, setEditing] = useState(null);
    const [editFirst, setEditFirst] = useState('');
    const [editFather, setEditFather] = useState('');
    const [editFamily, setEditFamily] = useState('');
    const [editSeq, setEditSeq] = useState('');
    const [editValues, setEditValues] = useState({});
    const newName = composeTripleName(newFirst, newFather, newFamily);
    const editName = composeTripleName(editFirst, editFather, editFamily);
    async function load() {
        if (!user?.token)
            return;
        setLoading(true);
        try {
            const result = await apiListApplicants(user.token);
            setList(result.applicants);
            setColumns(result.columns);
            const exams = await apiListExams(user.token);
            setActiveExams(exams.filter((exam) => exam.active !== false));
            setError('');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل تحميل سجل المتقدمين');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void load();
    }, [user?.token]);
    const detailColumns = useMemo(() => {
        const scoped = interviewFilter === 'داخلية' || interviewFilter === 'خارجية'
            ? list.filter((a) => interviewTypeOf(a) === interviewFilter)
            : interviewFilter === 'بلا مسمى'
                ? list.filter((a) => !hasJobTitle(a))
                : list;
        const otherColumns = new Set();
        if (interviewFilter === 'داخلية')
            INTERNAL_INTERVIEW_HEADERS.forEach((h) => otherColumns.add(h));
        if (interviewFilter === 'خارجية')
            EXTERNAL_INTERVIEW_HEADERS.forEach((h) => otherColumns.add(h));
        if (interviewFilter === 'all' || interviewFilter === 'بلا مسمى') {
            otherColumns.add('نوع المقابلة');
            columns.forEach((column) => otherColumns.add(column));
        }
        scoped.forEach((a) => Object.keys(a.extra || {}).forEach((key) => otherColumns.add(key)));
        if (scoped.some((a) => a.org) && ![...otherColumns].some((c) => fieldForColumn(c) === 'org')) {
            otherColumns.add('السوية التنظيمية الأولى');
        }
        if (scoped.some((a) => a.rank) && ![...otherColumns].some((c) => fieldForColumn(c) === 'rank')) {
            otherColumns.add('الرتبة');
        }
        REQUESTED_NEW_COLUMNS.forEach((col) => otherColumns.delete(col));
        otherColumns.delete('النتيجة النهائية');
        otherColumns.delete('مسمى العمل');
        otherColumns.delete('مسمى العمل المقترح من الجهة');
        otherColumns.delete('مسمى عمل  - اللجنة');
        otherColumns.delete('مسمى عمل - اللجنة');
        return [...REQUESTED_NEW_COLUMNS, ...otherColumns];
    }, [columns, list, interviewFilter]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return [...list]
            .filter((a) => {
            const interviewType = interviewTypeOf(a);
            if (interviewFilter === 'بلا مسمى') {
                if (hasJobTitle(a))
                    return false;
            }
            else if (interviewFilter !== 'all' && interviewType !== interviewFilter) {
                return false;
            }
            if (completionFilter !== 'all' && completionOf(a) !== completionFilter)
                return false;
            if (!q)
                return true;
            const hay = [
                a.name,
                a.displayId,
                effectiveJobTitle(a),
                a.jobTitleOrg,
                a.jobTitleCommittee,
                resolveEvaluationStream(a).label,
                ...detailColumns.map((c) => cellValue(a, c)),
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        })
            .sort((a, b) => a.seqNumber - b.seqNumber);
    }, [list, search, detailColumns, interviewFilter, completionFilter]);
    const completionCounts = useMemo(() => ({
        none: list.filter((a) => completionOf(a) === 'none').length,
        partial: list.filter((a) => completionOf(a) === 'partial').length,
        complete: list.filter((a) => completionOf(a) === 'complete').length,
    }), [list]);
    async function addApplicant() {
        if (!user?.token || !newName.trim())
            return;
        setSaving(true);
        try {
            const applicant = await apiCreateApplicant(user.token, {
                name: newName.trim(),
                seqNumber: Number(newSeq) || undefined,
                extra: { 'نوع المقابلة': importType },
            });
            const joined = [];
            const failed = [];
            for (const examId of selectedExamIds) {
                const exam = activeExams.find((item) => item.id === examId);
                try {
                    await apiEnrollApplicant(user.token, examId, applicant.id);
                    joined.push(exam?.title || examId);
                }
                catch (err) {
                    failed.push(`${exam?.title || 'اختبار'}: ${err instanceof Error ? err.message : 'تعذر الإلحاق'}`);
                }
            }
            setList((prev) => [...prev, applicant]);
            setNewFirst('');
            setNewFather('');
            setNewFamily('');
            setNewSeq('');
            setSelectedExamIds([]);
            setMessage(`تمت إضافة «${applicant.name}»${joined.length ? ` وأُلحق بـ: ${joined.join('، ')}` : ''}${failed.length ? `. تعذر: ${failed.join(' — ')}` : ''}`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشلت إضافة المتقدم');
        }
        finally {
            setSaving(false);
        }
    }
    async function enrollExisting() {
        if (!user?.token || !pickedIds.length || !enrollExamIds.length)
            return;
        setSaving(true);
        setError('');
        setMessage('');
        const people = list.filter((applicant) => pickedIds.includes(applicant.id));
        const joined = [];
        const already = [];
        const failed = [];
        for (const applicant of people) {
            for (const examId of enrollExamIds) {
                const exam = activeExams.find((item) => item.id === examId);
                const label = `${applicant.name} ← ${exam?.title || 'اختبار'}`;
                try {
                    await apiEnrollApplicant(user.token, examId, applicant.id);
                    joined.push(label);
                }
                catch (err) {
                    const text = err instanceof Error ? err.message : 'تعذر الإلحاق';
                    if (text.includes('مسبقاً'))
                        already.push(label);
                    else
                        failed.push(`${label}: ${text}`);
                }
            }
        }
        setMessage([
            joined.length ? `أُلحق ${joined.length}: ${joined.join('، ')}` : '',
            already.length ? `مسجّل مسبقاً (${already.length}): ${already.join('، ')}` : '',
            failed.length ? `تعذر (${failed.length}): ${failed.join(' — ')}` : '',
        ].filter(Boolean).join('\n'));
        setPickedIds([]);
        setSaving(false);
    }
    function openEditor(applicant) {
        setEditing(applicant);
        const parts = splitTripleName(applicant.name);
        setEditFirst(parts.first);
        setEditFather(parts.father);
        setEditFamily(parts.family);
        setEditSeq(String(applicant.seqNumber));
        setEditValues(Object.fromEntries([
            ...detailColumns.map((column) => [column, cellValue(applicant, column)]),
            ['المسمى الوارد من الجهة', applicant.jobTitleOrg || cellValue(applicant, 'المسمى الوارد من الجهة')],
            ['المسمى المقترح من اللجنة', applicant.jobTitleCommittee || cellValue(applicant, 'المسمى المقترح من اللجنة')],
        ]));
    }
    async function saveDetails() {
        if (!user?.token || !editing || !editName.trim())
            return;
        setSaving(true);
        try {
            const extra = {};
            let org = '';
            let jobTitle = '';
            let rank = '';
            let jobTitleOrg = editValues['المسمى الوارد من الجهة'] || '';
            let jobTitleCommittee = editValues['المسمى المقترح من اللجنة'] || '';
            let proposedSalary = null;
            let rankCommittee = '';
            let approvedSalary = null;
            let educationCommittee = '';
            for (const column of detailColumns) {
                const value = editValues[column] || '';
                const field = fieldForColumn(column);
                if (field === 'org')
                    org = value;
                else if (field === 'jobTitle')
                    jobTitle = value;
                else if (field === 'rank')
                    rank = value;
                else if (field === 'jobTitleOrg')
                    jobTitleOrg = value;
                else if (field === 'jobTitleCommittee')
                    jobTitleCommittee = value;
                else if (field === 'proposedSalary') {
                    const num = value.trim() === '' ? null : Number(value.replace(/,/g, '').trim());
                    proposedSalary = Number.isFinite(num) ? num : null;
                }
                else if (field === 'rankCommittee')
                    rankCommittee = value;
                else if (field === 'approvedSalary') {
                    const num = value.trim() === '' ? null : Number(value.replace(/,/g, '').trim());
                    approvedSalary = Number.isFinite(num) ? num : null;
                }
                else if (field === 'educationCommittee')
                    educationCommittee = value;
                else if (field === 'finalResult')
                    continue;
                else
                    extra[column] = value;
            }
            const updated = await apiUpdateApplicant(user.token, editing.id, {
                name: editName.trim(),
                seqNumber: Number(editSeq) || editing.seqNumber,
                org,
                jobTitle,
                rank,
                jobTitleOrg,
                jobTitleCommittee,
                proposedSalary,
                rankCommittee,
                approvedSalary,
                educationCommittee,
                extra,
            });
            setList((prev) => prev.map((a) => (a.id === editing.id ? { ...a, ...updated } : a)));
            setEditing(null);
            setMessage(`تم حفظ بيانات «${updated.name}»`);
            await load();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر حفظ البيانات');
        }
        finally {
            setSaving(false);
        }
    }
    async function addColumn() {
        if (!user?.token)
            return;
        const label = window.prompt('اسم العمود الجديد:')?.trim();
        if (!label)
            return;
        try {
            const created = await apiCreateApplicantColumn(user.token, label);
            setColumns((prev) => (prev.includes(created.label) ? prev : [...prev, created.label]));
            setMessage(`تمت إضافة عمود «${created.label}»`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشلت إضافة العمود');
        }
    }
    async function removeApplicant(applicant) {
        if (!user?.token || !window.confirm(`حذف المتقدم «${applicant.name}»؟`))
            return;
        try {
            await apiDeleteApplicant(user.token, applicant.id);
            setList((prev) => prev.filter((a) => a.id !== applicant.id));
            if (editing?.id === applicant.id)
                setEditing(null);
            setMessage(`تم حذف «${applicant.name}» من المتقدمين.`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل حذف المتقدم');
        }
    }
    async function removeFilteredApplicants() {
        if (!user?.token || !filtered.length)
            return;
        const scope = interviewFilter === 'all'
            ? 'كل المتقدمين الظاهرين'
            : interviewFilter === 'بلا مسمى'
                ? 'المتقدمين بلا مسمى الظاهرين'
                : `متقدمي المقابلة ${interviewFilter} الظاهرين`;
        const ok = window.confirm(`حذف ${filtered.length} متقدم (${scope}) نهائياً؟\nلا يمكن التراجع. قرارات الأمن المرتبطة بهم ستُحذف أيضاً.`);
        if (!ok)
            return;
        const confirmWord = window.prompt(`للتأكيد اكتب الرقم ${filtered.length} ثم موافق:`);
        if (String(confirmWord || '').trim() !== String(filtered.length)) {
            setMessage('تم إلغاء الحذف الجماعي.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const result = await apiBulkDeleteApplicants(user.token, filtered.map((a) => a.id));
            setEditing(null);
            await load();
            setMessage(`تم حذف ${result.deleted} متقدم. المتبقي في السجل: ${result.total}.`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل الحذف الجماعي');
        }
        finally {
            setSaving(false);
        }
    }
    async function handleFile(file) {
        if (!user?.token)
            return;
        setImporting(true);
        try {
            const rows = (await parseRosterExcel(file)).map((row) => ({
                ...row,
                extra: { ...row.extra, 'نوع المقابلة': importType },
            }));
            const result = await apiImportApplicants(user.token, { rows });
            setList(result.applicants);
            setSearch('');
            setInterviewFilter(importType);
            await load();
            setMessage(`تمت الإضافة التراكمية: ${result.created} جديد، ${result.updated} مدمج مع سجله الحالي، ${result.skipped} متجاهل.`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'فشل استيراد الملف');
        }
        finally {
            setImporting(false);
            if (fileRef.current)
                fileRef.current.value = '';
        }
    }
    async function handleExportExcel() {
        if (!filtered.length) {
            setError('لا توجد بيانات مطابقة للفلاتر الحالية لتصديرها.');
            return;
        }
        setError('');
        const exportCols = ['الاسم الثلاثي', ...detailColumns, 'النتيجة النهائية'];
        const ok = await exportApplicantsExcel(filtered, exportCols);
        if (ok)
            setMessage(`تم تصدير ${filtered.length} متقدم إلى Excel.`);
    }
    const missingCount = list.filter((a) => !hasJobTitle(a)).length;
    const internalCount = list.filter((a) => interviewTypeOf(a) === 'داخلية').length;
    const externalCount = list.filter((a) => interviewTypeOf(a) === 'خارجية').length;
    const titleFields = ['المسمى الوارد من الجهة', 'المسمى المقترح من اللجنة'];
    const otherEditColumns = detailColumns.filter((c) => !titleFields.includes(c));
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u0633\u062C\u0644 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646" }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u064A\u0628\u0642\u0649 \u0627\u0644\u0627\u0633\u0645 \u0647\u0646\u0627 \u062D\u062A\u0649 \u064A\u0646\u0647\u064A \u0643\u0644 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0635\u0646\u0641\u0647\u060C \u062B\u0645 \u064A\u0646\u062A\u0642\u0644 \u0625\u0644\u0649 \u0627\u0644\u0645\u0645\u062A\u062D\u0646\u064A\u0646. \u0627\u0636\u063A\u0637 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0644\u0644\u062A\u0639\u062F\u064A\u0644\u060C \u0623\u0648 \u0627\u062D\u0630\u0641 \u0645\u0646 \u0644\u0645 \u064A\u0628\u062F\u0623." })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", onClick: () => void downloadRosterTemplate(importType), className: "inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-bold text-gold", children: [_jsx(FileDown, { className: "h-4 w-4 shrink-0", "aria-hidden": true }), _jsxs("span", { children: ["\u0642\u0627\u0644\u0628 ", importType] })] }), _jsxs("button", { type: "button", onClick: () => void addColumn(), className: "inline-flex items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 px-3 py-2 text-xs font-bold text-gold", children: [_jsx(Plus, { className: "h-4 w-4 shrink-0", "aria-hidden": true }), _jsx("span", { children: "\u0625\u0636\u0627\u0641\u0629 \u0639\u0645\u0648\u062F" })] }), _jsxs("button", { type: "button", disabled: !filtered.length || saving, onClick: () => void removeFilteredApplicants(), className: "inline-flex items-center gap-2 rounded-xl border border-error/50 bg-error/10 px-3 py-2 text-xs font-bold text-error disabled:opacity-40", title: !filtered.length ? 'لا يوجد متقدمون ظاهرون للحذف' : `حذف ${filtered.length} متقدم ظاهر`, children: [_jsx(Trash2, { className: "h-4 w-4 shrink-0", "aria-hidden": true }), _jsxs("span", { children: ["\u062D\u0630\u0641 \u0627\u0644\u0638\u0627\u0647\u0631 (", filtered.length, ")"] })] }), _jsxs("button", { type: "button", disabled: importing, onClick: () => {
                                    if (fileRef.current) {
                                        fileRef.current.value = '';
                                        fileRef.current.click();
                                    }
                                }, className: "inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-xs font-bold text-ink disabled:opacity-40", title: "\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0645\u0644\u0641 Excel", children: [_jsx(Download, { className: "h-4 w-4 shrink-0", "aria-hidden": true }), _jsx("span", { children: importing ? 'جاري الاستيراد...' : 'استيراد Excel' })] }), _jsx(Link, { to: "/admin/create", className: "inline-flex items-center gap-2 rounded-xl border border-gold/60 bg-gold/15 px-3 py-2 text-xs font-bold text-gold", title: "\u0641\u0631\u0632 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0625\u0644\u0649 \u0644\u062C\u0627\u0646 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u062F\u0648\u0646 \u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631", children: _jsx("span", { children: "\u0641\u0631\u0632 \u0644\u0644\u062C\u0627\u0646" }) }), _jsxs("button", { type: "button", disabled: !filtered.length, onClick: () => void handleExportExcel(), className: "inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-bold text-gold disabled:opacity-40", children: [_jsx(Upload, { className: "h-4 w-4 shrink-0", "aria-hidden": true }), _jsxs("span", { children: ["\u062A\u0635\u062F\u064A\u0631 Excel", filtered.length > 0 ? ` (${filtered.length})` : ''] })] }), _jsx("input", { ref: fileRef, type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", className: "hidden", onChange: (e) => {
                                    const file = e.target.files?.[0];
                                    if (file)
                                        void handleFile(file);
                                } })] })] }), _jsxs("div", { className: "flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-panel p-4", children: [_jsxs("label", { className: "flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-bold text-mute", children: ["\u0627\u0644\u0627\u0633\u0645", _jsx("input", { value: newFirst, onChange: (e) => setNewFirst(e.target.value), onKeyDown: (e) => {
                                    if (e.key === 'Enter')
                                        void addApplicant();
                                }, className: "rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none", placeholder: "\u0627\u0644\u0627\u0633\u0645" })] }), _jsxs("label", { className: "flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-bold text-mute", children: ["\u0627\u0633\u0645 \u0627\u0644\u0623\u0628", _jsx("input", { value: newFather, onChange: (e) => setNewFather(e.target.value), onKeyDown: (e) => {
                                    if (e.key === 'Enter')
                                        void addApplicant();
                                }, className: "rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none", placeholder: "\u0627\u0633\u0645 \u0627\u0644\u0623\u0628" })] }), _jsxs("label", { className: "flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-bold text-mute", children: ["\u0627\u0644\u0643\u0646\u064A\u0629", _jsx("input", { value: newFamily, onChange: (e) => setNewFamily(e.target.value), onKeyDown: (e) => {
                                    if (e.key === 'Enter')
                                        void addApplicant();
                                }, className: "rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none", placeholder: "\u0627\u0644\u0643\u0646\u064A\u0629" })] }), _jsxs("label", { className: "flex w-28 flex-col gap-1 text-xs font-bold text-mute", children: ["\u0627\u0644\u062A\u0633\u0644\u0633\u0644", _jsx("input", { value: newSeq, onChange: (e) => setNewSeq(e.target.value), className: "rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none", inputMode: "numeric", placeholder: "\u062A\u0644\u0642\u0627\u0626\u064A" })] }), _jsxs("label", { className: "flex w-44 flex-col gap-1 text-xs font-bold text-mute", children: ["\u0646\u0648\u0639 \u0627\u0644\u0645\u062A\u0642\u062F\u0645", _jsxs("select", { value: importType, onChange: (e) => setImportType(e.target.value), className: "rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none", children: [_jsx("option", { value: "\u062F\u0627\u062E\u0644\u064A\u0629", children: "\u0645\u0642\u0627\u0628\u0644\u0629 \u062F\u0627\u062E\u0644\u064A\u0629" }), _jsx("option", { value: "\u062E\u0627\u0631\u062C\u064A\u0629", children: "\u0645\u0642\u0627\u0628\u0644\u0629 \u062E\u0627\u0631\u062C\u064A\u0629" })] })] }), _jsxs("button", { type: "button", disabled: !newName.trim() || saving, onClick: () => void addApplicant(), className: "inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40", children: [_jsx(UserPlus, { className: "h-4 w-4 shrink-0", "aria-hidden": true }), _jsx("span", { children: "\u0625\u0636\u0627\u0641\u0629 \u0634\u062E\u0635" })] }), activeExams.length > 0 && (_jsxs("div", { className: "flex w-full flex-col gap-2", children: [_jsx("p", { className: "text-xs font-bold text-mute", children: "\u0625\u0644\u062D\u0627\u0642\u0647 \u0628\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0641\u0639\u0651\u0644 \u0627\u0644\u0622\u0646" }), _jsx("div", { className: "flex flex-wrap gap-2", children: activeExams.map((exam) => (_jsxs("label", { className: "inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs font-bold text-text", children: [_jsx("input", { type: "checkbox", checked: selectedExamIds.includes(exam.id), onChange: (e) => {
                                                setSelectedExamIds((prev) => e.target.checked ? [...prev, exam.id] : prev.filter((id) => id !== exam.id));
                                            } }), _jsx("span", { children: exam.title })] }, exam.id))) })] })), _jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), className: "min-w-[200px] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-text outline-none", placeholder: "\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0645\u0633\u0645\u0649 \u0623\u0648 \u0623\u064A \u062D\u0642\u0644" })] }), _jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [
                    { id: 'داخلية', title: 'مقابلات داخلية', count: internalCount },
                    { id: 'خارجية', title: 'مقابلات خارجية', count: externalCount },
                    { id: 'بلا مسمى', title: 'بلا مسمى — للجميع', count: missingCount },
                    { id: 'all', title: 'كل المتقدمين', count: list.length },
                ].map((chip) => (_jsxs("button", { type: "button", onClick: () => setInterviewFilter(chip.id), className: `rounded-2xl border p-4 text-right transition ${interviewFilter === chip.id ? 'border-gold bg-gold/15' : 'border-line bg-card hover:border-gold/50'}`, children: [_jsx("div", { className: "font-extrabold text-light-gold", children: chip.title }), _jsxs("div", { className: "mt-1 text-sm text-mute", children: [chip.count, " \u0645\u062A\u0642\u062F\u0645"] })] }, chip.id))) }), _jsx("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [
                    { id: 'none', title: 'لم يتقدم لأي اختبار', count: completionCounts.none },
                    { id: 'partial', title: 'تقدم لبعض الاختبارات', count: completionCounts.partial },
                    { id: 'complete', title: 'أكمل الاختبارات المطلوبة', count: completionCounts.complete },
                    { id: 'all', title: 'كل حالات الاستكمال', count: list.length },
                ].map((chip) => (_jsxs("button", { type: "button", onClick: () => setCompletionFilter(chip.id), className: `rounded-2xl border p-4 text-right transition ${completionFilter === chip.id ? 'border-gold bg-gold/15' : 'border-line bg-card hover:border-gold/50'}`, children: [_jsx("div", { className: "font-extrabold text-light-gold", children: chip.title }), _jsxs("div", { className: "mt-1 text-sm text-mute", children: [chip.count, " \u0645\u062A\u0642\u062F\u0645"] })] }, chip.id))) }), activeExams.length > 0 && (_jsxs("div", { className: "space-y-3 rounded-2xl border border-line bg-panel p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsx("p", { className: "text-sm font-bold text-light-gold", children: "\u0625\u0644\u062D\u0627\u0642 \u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0645\u0648\u062C\u0648\u062F\u064A\u0646 \u0628\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0641\u0639\u0651\u0644" }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", onClick: () => {
                                            const visible = filtered.map((applicant) => applicant.id);
                                            const allVisible = visible.every((id) => pickedIds.includes(id));
                                            setPickedIds(allVisible ? pickedIds.filter((id) => !visible.includes(id)) : [...new Set([...pickedIds, ...visible])]);
                                        }, className: "rounded-lg border border-line px-3 py-2 text-xs font-bold text-text", children: filtered.length > 0 && filtered.every((applicant) => pickedIds.includes(applicant.id)) ? 'إلغاء تحديد الظاهر' : `تحديد الظاهر (${filtered.length})` }), pickedIds.length > 0 && (_jsxs("button", { type: "button", onClick: () => setPickedIds([]), className: "rounded-lg border border-line px-3 py-2 text-xs font-bold text-mute", children: ["\u0645\u0633\u062D \u0627\u0644\u062A\u062D\u062F\u064A\u062F (", pickedIds.length, ")"] }))] })] }), _jsx("div", { className: "flex flex-wrap gap-2", children: activeExams.map((exam) => (_jsxs("label", { className: "inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs font-bold text-text", children: [_jsx("input", { type: "checkbox", checked: enrollExamIds.includes(exam.id), onChange: (e) => {
                                        setEnrollExamIds((prev) => e.target.checked ? [...prev, exam.id] : prev.filter((id) => id !== exam.id));
                                    } }), _jsx("span", { children: exam.title })] }, exam.id))) }), _jsxs("button", { type: "button", disabled: saving || !pickedIds.length || !enrollExamIds.length, onClick: () => void enrollExisting(), className: "inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40", children: ["\u0625\u0644\u062D\u0627\u0642 \u0627\u0644\u0645\u062D\u062F\u062F\u064A\u0646 (", pickedIds.length, ")"] })] })), error && _jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error }), message && _jsx("div", { className: "whitespace-pre-wrap rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok", children: message }), loading ? (_jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644..." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", children: filtered.map((a) => {
                            const title = effectiveJobTitle(a);
                            const type = interviewTypeOf(a);
                            return (_jsxs("div", { role: "button", tabIndex: 0, onClick: () => openEditor(a), onKeyDown: (event) => {
                                    if (event.key === 'Enter')
                                        openEditor(a);
                                }, className: "group rounded-2xl border border-line bg-card p-4 text-right transition hover:border-gold/60 hover:bg-panel", children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("label", { className: "inline-flex items-center gap-2 text-xs font-bold text-gold", onClick: (event) => event.stopPropagation(), children: [_jsx("input", { type: "checkbox", checked: pickedIds.includes(a.id), onChange: (event) => {
                                                                    setPickedIds((prev) => event.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id));
                                                                } }), "\u0645 ", a.seqNumber] }), _jsx("h2", { className: "mt-1 truncate text-lg font-extrabold text-light-gold group-hover:text-gold", children: a.name })] }), _jsx("span", { className: "shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-mute", children: type || 'غير محدد' })] }), _jsx("p", { className: "mt-3 text-sm text-mute", children: title || 'بلا مسمى — يظهر للجميع ويمكن تصنيفه' }), a.jobTitleOrg && a.jobTitleCommittee && a.jobTitleOrg !== a.jobTitleCommittee && (_jsxs("p", { className: "mt-1 text-xs text-mute", children: ["\u062C\u0647\u0629: ", a.jobTitleOrg] })), _jsxs("p", { className: "mt-2 text-[11px] font-bold text-mute", children: ["\u0627\u0644\u0641\u0631\u0632: ", resolveEvaluationStream(a).label, requiredTracksOf(a).length === 1 ? ' — اختبار واحد + أمن' : ''] }), _jsxs("div", { className: "mt-4 grid grid-cols-2 gap-2", children: [requiredTracksOf(a).map((track) => (_jsxs("div", { className: "rounded-lg border border-line/80 bg-panel px-2 py-1.5", children: [_jsxs("div", { className: "text-[10px] text-mute", children: [track.label, track.weight != null ? ` (${track.weight}%)` : ''] }), _jsx("div", { className: "text-xs font-bold text-text", children: scoreLabel(a, track.category) })] }, track.id))), !requiredTracksOf(a).length && (_jsx("div", { className: "col-span-2 rounded-lg border border-line/80 bg-panel px-2 py-1.5 text-xs text-mute", children: "\u0628\u0644\u0627 \u0645\u0633\u0627\u0631 \u062A\u0642\u064A\u064A\u0645 \u0628\u0639\u062F \u2014 \u0635\u062D\u0651\u062D \u0627\u0644\u0645\u0633\u0645\u0649" })), _jsxs("div", { className: `col-span-2 rounded-lg border px-2 py-1.5 ${securityTone(a)}`, children: [_jsx("div", { className: "text-[10px] opacity-80", children: "\u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0639\u0633\u0643\u0631\u064A" }), _jsx("div", { className: "text-xs font-bold", children: securityLabel(a) }), a.securityReview?.note ? (_jsx("div", { className: "mt-1 line-clamp-2 text-[10px] opacity-80", children: a.securityReview.note })) : null] })] }), _jsxs("div", { className: "mt-3 flex items-center justify-between text-xs", children: [_jsx("span", { className: "font-bold text-gold", children: a.finalResult != null ? `النتيجة ${a.finalResult}%` : `استكمال ${a.completedCategories?.length || 0}/${a.requiredExamCount || 0}` }), _jsxs("button", { type: "button", onClick: (event) => {
                                                    event.stopPropagation();
                                                    void removeApplicant(a);
                                                }, className: "inline-flex items-center gap-1 rounded-lg border border-error/40 px-2 py-1 font-bold text-error", children: [_jsx(Trash2, { className: "h-3.5 w-3.5" }), " \u062D\u0630\u0641"] })] })] }, a.id));
                        }) }), !filtered.length && (_jsxs("div", { className: "rounded-2xl border border-line p-8 text-center text-mute", children: [list.length ? 'لا يوجد متقدمون مطابقون للفلاتر الحالية.' : 'لم تتم إضافة متقدمين بعد.', list.length > 0 && (_jsxs("button", { type: "button", onClick: () => {
                                    setSearch('');
                                    setInterviewFilter('all');
                                    setCompletionFilter('all');
                                }, className: "mx-3 text-gold underline", children: ["\u0639\u0631\u0636 \u0627\u0644\u0643\u0644 (", list.length, ")"] }))] }))] })), editing && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4", children: _jsxs("div", { className: "max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl", children: [_jsxs("div", { className: "mb-5 flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-extrabold text-light-gold", children: editName || 'بيانات المتقدم' }), _jsx("p", { className: "text-xs text-mute", children: "\u0639\u062F\u0651\u0644 \u0627\u0644\u0645\u0633\u0645\u064A\u0627\u062A \u0648\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062B\u0645 \u0627\u062D\u0641\u0638. \u062A\u0638\u0647\u0631 \u0647\u0646\u0627 \u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0641\u0631\u0632 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0645\u0649 \u0641\u0642\u0637." })] }), _jsx("button", { type: "button", onClick: () => setEditing(null), className: "rounded-lg p-2 text-mute hover:bg-card", children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsxs("p", { className: "mb-3 text-xs font-bold text-mute", children: ["\u0627\u0644\u0641\u0631\u0632: ", resolveEvaluationStream(editing).label, requiredTracksOf(editing).length === 1 ? ' — يخضع لاختبار عام فقط (وزن 100%) بالإضافة للأمن العسكري' : ''] }), _jsxs("div", { className: "mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4", children: [requiredTracksOf(editing).map((track) => (_jsxs("div", { className: "rounded-xl border border-line bg-card px-3 py-2", children: [_jsxs("div", { className: "text-[11px] text-mute", children: [track.label, track.weight != null ? ` — وزن ${track.weight}%` : ''] }), _jsx("div", { className: "text-sm font-bold text-gold", children: scoreLabel(editing, track.category) })] }, track.id))), !requiredTracksOf(editing).length && (_jsx("div", { className: "rounded-xl border border-line bg-card px-3 py-2 text-sm text-mute", children: "\u0628\u0644\u0627 \u0645\u0633\u0627\u0631 \u062A\u0642\u064A\u064A\u0645 \u0628\u0639\u062F" }))] }), _jsxs("div", { className: `mb-5 rounded-xl border px-3 py-3 ${securityTone(editing)}`, children: [_jsxs("div", { className: "text-xs font-bold", children: ["\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0639\u0633\u0643\u0631\u064A: ", securityLabel(editing)] }), editing.securityReview ? (_jsxs("p", { className: "mt-1 text-xs opacity-90", children: [editing.securityReview.reviewedByName, " \u2014 ", new Date(editing.securityReview.reviewedAt).toLocaleString('ar'), editing.securityReview.note ? ` — ${editing.securityReview.note}` : ''] })) : (_jsx("p", { className: "mt-1 text-xs opacity-80", children: "\u0644\u0645 \u064A\u064F\u0633\u062C\u0651\u064E\u0644 \u0642\u0631\u0627\u0631 \u0623\u0645\u0646\u064A \u0628\u0639\u062F. \u064A\u064F\u062F\u062E\u0644 \u0645\u0646 \u062D\u0633\u0627\u0628 \u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0639\u0633\u0643\u0631\u064A." }))] }), _jsxs("div", { className: "mb-5 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm", children: ["\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0646\u0647\u0627\u0626\u064A\u0629:", ' ', _jsx("strong", { className: "text-gold", children: editing.finalResult != null
                                        ? `${editing.finalResult}%`
                                        : `قيد الاستكمال (${editing.completedCategories?.length || 0}/${editing.requiredExamCount || 0})` })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [_jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u062A\u0633\u0644\u0633\u0644", _jsx("input", { value: editSeq, onChange: (e) => setEditSeq(e.target.value), inputMode: "numeric", className: "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-text outline-none" })] }), _jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u0627\u0633\u0645", _jsx("input", { value: editFirst, onChange: (e) => setEditFirst(e.target.value), className: "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-text outline-none", placeholder: "\u0627\u0644\u0627\u0633\u0645" })] }), _jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0633\u0645 \u0627\u0644\u0623\u0628", _jsx("input", { value: editFather, onChange: (e) => setEditFather(e.target.value), className: "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-text outline-none", placeholder: "\u0627\u0633\u0645 \u0627\u0644\u0623\u0628" })] }), _jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u0643\u0646\u064A\u0629", _jsx("input", { value: editFamily, onChange: (e) => setEditFamily(e.target.value), className: "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-text outline-none", placeholder: "\u0627\u0644\u0643\u0646\u064A\u0629" })] })] }), _jsxs("div", { className: "mt-5 rounded-2xl border border-gold/40 bg-card p-4", children: [_jsx("h3", { className: "mb-3 text-sm font-extrabold text-gold", children: "\u0627\u0644\u0645\u0633\u0645\u064A\u0627\u062A \u0648\u0627\u0644\u062A\u0635\u0646\u064A\u0641" }), _jsx("p", { className: "mb-3 text-xs text-mute", children: "\u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0644\u0644\u062A\u0642\u064A\u064A\u0645: \u0642\u0631\u0627\u0631 \u0627\u0644\u0644\u062C\u0646\u0629\u060C \u0648\u0625\u0644\u0627 \u0627\u0644\u0648\u0627\u0631\u062F \u0645\u0646 \u0627\u0644\u062C\u0647\u0629. \u0645\u0646 \u0628\u0644\u0627 \u0645\u0633\u0645\u0649 \u064A\u0638\u0647\u0631 \u0644\u0644\u062C\u0645\u064A\u0639 \u062D\u062A\u0649 \u064A\u064F\u0635\u0646\u0651\u064E\u0641 \u0647\u0646\u0627." }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0648\u0627\u0631\u062F \u0645\u0646 \u0627\u0644\u062C\u0647\u0629 \u0627\u0644\u0645\u0631\u0634\u062D\u0629", _jsx("input", { value: editValues['المسمى الوارد من الجهة'] || '', onChange: (e) => setEditValues((prev) => ({ ...prev, 'المسمى الوارد من الجهة': e.target.value })), className: "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-text outline-none", placeholder: "\u0645\u0633\u0645\u0649 \u0627\u0644\u062C\u0647\u0629" })] }), _jsxs("label", { className: "text-xs font-bold text-mute", children: ["\u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0630\u064A \u062A\u0642\u0631\u0631\u0647 \u0627\u0644\u0644\u062C\u0646\u0629", _jsx("input", { value: editValues['المسمى المقترح من اللجنة'] || '', onChange: (e) => setEditValues((prev) => ({ ...prev, 'المسمى المقترح من اللجنة': e.target.value })), className: "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-text outline-none", placeholder: "\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0644\u062C\u0646\u0629 / \u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0645\u0639\u062A\u0645\u062F" })] })] }), _jsxs("p", { className: "mt-3 text-xs text-mute", children: ["\u0627\u0644\u0645\u0639\u062A\u0645\u062F \u062D\u0627\u0644\u064A\u0627\u064B:", ' ', _jsx("span", { className: "font-bold text-light-gold", children: String(editValues['المسمى المقترح من اللجنة'] || editValues['المسمى الوارد من الجهة'] || 'بلا مسمى').trim() ||
                                                'بلا مسمى' })] })] }), _jsx("div", { className: "mt-5 grid gap-3 sm:grid-cols-2", children: otherEditColumns.map((column) => {
                                const field = fieldForColumn(column);
                                const readOnly = field === 'finalResult';
                                return (_jsxs("label", { className: "text-xs font-bold text-mute", children: [column, _jsx("input", { value: editValues[column] || '', readOnly: readOnly, onChange: (e) => setEditValues((prev) => ({ ...prev, [column]: e.target.value })), className: `mt-1 w-full rounded-lg border border-line px-3 py-2 text-text outline-none ${readOnly ? 'bg-panel/50 text-mute' : 'bg-card'}` })] }, column));
                            }) }), _jsxs("div", { className: "mt-6 flex flex-wrap justify-between gap-2", children: [_jsxs("button", { type: "button", onClick: () => void removeApplicant(editing), className: "inline-flex items-center gap-2 rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-sm font-bold text-error", children: [_jsx(Trash2, { className: "h-4 w-4" }), "\u062D\u0630\u0641 \u0627\u0644\u0645\u062A\u0642\u062F\u0645"] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", onClick: () => setEditing(null), className: "rounded-lg border border-line px-4 py-2 text-sm font-bold text-mute", children: "\u0625\u0644\u063A\u0627\u0621" }), _jsx("button", { type: "button", disabled: saving || !editName.trim(), onClick: () => void saveDetails(), className: "rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40", children: saving ? 'جاري الحفظ...' : 'حفظ التعديلات' })] })] })] }) }))] }));
}
