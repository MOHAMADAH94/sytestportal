import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FileDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiExamRoster, apiAdminExamQuestions } from '../api/client';
import { openPrintWindow } from '../utils/printPdf';
import { useAuth } from '../auth/AuthContext';
import { RosterCards, rosterEnterUrls } from '../components/RosterCards';
import { exportRosterExcel } from '../utils/parseRosterExcel';
export function AdminExamRosterPage() {
    const { examId } = useParams();
    const { user } = useAuth();
    const [title, setTitle] = useState('');
    const [roster, setRoster] = useState([]);
    const [publicAppUrl, setPublicAppUrl] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [jobBased, setJobBased] = useState(false);
    const [pendingQuestions, setPendingQuestions] = useState(false);
    const [showBarcode, setShowBarcode] = useState(true);
    const [printing, setPrinting] = useState('');
    async function print(name, mode) {
        if (!user || !examId)
            return;
        setPrinting(name);
        try {
            const { exam, questions } = await apiAdminExamQuestions(user.token, examId, name);
            openPrintWindow({ id: exam.id, title: exam.title + ' — ' + name, category: exam.category, level: exam.level, role: exam.oralRole || undefined, questionCount: questions.length, questionIds: questions.map((q) => q.id), createdAt: exam.createdAt }, questions, mode);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر الطباعة');
        }
        finally {
            setPrinting('');
        }
    }
    useEffect(() => {
        if (!user?.token || !examId)
            return;
        apiExamRoster(user.token, examId)
            .then((res) => {
            setTitle(res.exam.title);
            setJobBased(!!res.exam.jobBased);
            setPendingQuestions(!!res.exam.pendingQuestions);
            setShowBarcode(res.exam.showsBarcode !== false);
            setRoster(res.roster);
            setPublicAppUrl(res.publicAppUrl);
        })
            .catch((err) => setError(err instanceof Error ? err.message : 'فشل التحميل'))
            .finally(() => setLoading(false));
    }, [user?.token, examId]);
    if (loading)
        return _jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0645\u062A\u062D\u0646\u064A\u0646..." });
    if (error) {
        return (_jsxs("div", { className: "rounded-xl border border-error/40 bg-error/10 p-4 text-error", children: [error, _jsx(Link, { to: "/admin", className: "mt-3 block font-bold text-gold", children: "\u0631\u062C\u0648\u0639" })] }));
    }
    if (!roster.length) {
        return (_jsxs("div", { className: "rounded-xl border border-line bg-card p-6 text-center text-mute", children: ["\u0644\u0627 \u062A\u0648\u062C\u062F \u0642\u0627\u0626\u0645\u0629 \u0645\u0645\u062A\u062D\u0646\u064A\u0646 \u0645\u0631\u0641\u0648\u0639\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.", _jsx(Link, { to: "/admin", className: "mt-3 block font-bold text-gold", children: "\u0631\u062C\u0648\u0639" })] }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [pendingQuestions && (_jsxs("div", { className: "space-y-3 rounded-xl border border-error/40 bg-error/10 p-4 text-error", children: [_jsx("p", { className: "font-bold", children: showBarcode
                            ? 'الاختبار مسودة ولم تُستكمل أسئلته — بطاقات QR غير صالحة للمسح حتى اكتمال الأسئلة وتفعيل الاختبار.'
                            : 'الاختبار مسودة ولم تُستكمل أسئلته. هذا المسار لا يطبع باركود دخول.' }), _jsx(Link, { className: "inline-flex rounded-xl bg-gold px-4 py-2 text-sm font-bold text-ink", to: '/admin/complete-questions/' + examId, children: "\u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0622\u0646" })] })), _jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: showBarcode ? 'بطاقات الممتحنين' : 'قائمة الممتحنين' }), _jsx("p", { className: "mt-1 text-sm text-mute", children: title })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [!pendingQuestions && showBarcode && (_jsxs("button", { type: "button", onClick: () => exportRosterExcel(title, rosterEnterUrls(roster, publicAppUrl)), className: "inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-text", children: [_jsx(FileDown, { className: "h-4 w-4" }), " \u062A\u0635\u062F\u064A\u0631 Excel"] })), _jsx(Link, { to: "/admin", className: "rounded-xl border border-line px-4 py-2 text-sm font-bold text-text", children: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A" })] })] }), jobBased && !pendingQuestions && (_jsxs("section", { className: "space-y-3 rounded-2xl border border-line bg-card p-5", children: [_jsx("h2", { className: "text-lg font-bold text-gold", children: "\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629 \u0644\u0643\u0644 \u0645\u062A\u0642\u062F\u0645" }), _jsx("p", { className: "text-sm text-mute", children: "\u0643\u0644 \u0646\u0645\u0648\u0630\u062C \u064A\u0637\u0627\u0628\u0642 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u062E\u0635\u0635\u0629 \u0644\u0635\u0627\u062D\u0628 \u0627\u0644\u0628\u0637\u0627\u0642\u0629\u060C \u0628\u0645\u0627 \u0641\u064A\u0647\u0627 \u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0648\u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A." }), roster.map((row) => (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 border-t border-line py-3", children: [_jsxs("span", { children: [row.name, " \u2014 ", row.jobTitle] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { disabled: !!printing, onClick: () => print(row.name, 'exam'), className: "rounded-xl border border-line px-3 py-2 text-sm", children: "\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0623\u0633\u0626\u0644\u0629" }), _jsx("button", { disabled: !!printing, onClick: () => print(row.name, 'answer_key'), className: "rounded-xl border border-line px-3 py-2 text-sm", children: "\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0625\u062C\u0627\u0628\u0629" })] })] }, row.id)))] })), pendingQuestions ? (_jsx("p", { className: "rounded-xl border border-line p-4 text-mute", children: showBarcode
                    ? 'ستظهر بطاقات QR هنا تلقائياً بعد استكمال أسئلة جميع المجموعات وتفعيل الاختبار.'
                    : 'ستظهر أسماء الممتحنين هنا بعد استكمال الأسئلة، دون باركود.' })) : (_jsx(RosterCards, { examTitle: title, roster: roster, publicAppUrl: publicAppUrl, showBarcode: showBarcode }))] }));
}
