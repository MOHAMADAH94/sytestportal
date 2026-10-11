import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiCommittee } from '../api/client';
import { useAuth } from '../auth/AuthContext';
export function ArchiveProtectionStatus() {
    const { user } = useAuth();
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    useEffect(() => {
        if (user?.role !== 'admin')
            return;
        const refresh = () => apiCommittee(user.token, '/admin/archive-protection')
            .then(setStatus)
            .catch((e) => setError(e.message));
        void refresh();
        const timer = setInterval(refresh, 60000);
        return () => clearInterval(timer);
    }, [user?.token]);
    async function backup() {
        if (!user)
            return;
        setBusy(true);
        setError('');
        setOkMsg('');
        try {
            const res = await apiCommittee(user.token, '/admin/archive-protection/backup', 'POST');
            setStatus(res);
            setOkMsg('تم إنشاء نسخة احتياطية حقيقية بنجاح والتحقق من سلامة فحص SQLite (PRAGMA integrity_check) وتطابق بصمة SHA-256.');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر إنشاء النسخة');
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("section", { className: "space-y-4 rounded-2xl border border-gold/40 bg-card p-5 text-sm", dir: "rtl", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ShieldCheck, { className: "h-6 w-6 text-gold" }), _jsx("h2", { className: "text-base font-bold text-light-gold", children: "\u062D\u0645\u0627\u064A\u0629 \u0648\u0623\u0645\u0627\u0646 \u0633\u062C\u0644 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u0627\u062A \u0648\u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A" })] }), status?.lastSuccess && (_jsxs("span", { className: "inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/15 px-2.5 py-0.5 text-xs font-bold text-ok", children: [_jsx(CheckCircle2, { className: "h-3.5 w-3.5" }), " \u0641\u062D\u0635 \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0633\u0644\u064A\u0645"] }))] }), _jsx("p", { className: "text-xs leading-relaxed text-text-2", children: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0645\u062D\u0645\u064A\u0629 \u0628\u0642\u064A\u0648\u062F SQL \u0648\u0645\u064F\u0634\u063A\u0644\u0627\u062A \u0623\u0645\u0627\u0646 \u062A\u0645\u0646\u0639 \u062D\u0630\u0641 \u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u0627\u0631\u064A\u062E\u064A\u0629 \u0623\u0648 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0639\u0644\u0649 \u0645\u062D\u0641\u0648\u0638\u0627\u062A \u0627\u0644\u062A\u062F\u0642\u064A\u0642. \u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u064A\u062D\u062C\u0628 \u0638\u0647\u0648\u0631\u0647 \u0648\u064A\u0648\u0642\u0641\u0647 \u0645\u0639 \u0628\u0642\u0627\u0621 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0648\u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0648\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u062F\u0642\u064A\u0642 \u0645\u062D\u0641\u0648\u0638\u0629 \u0648\u0645\u0624\u0631\u0634\u0641\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644." }), user?.role === 'admin' && (_jsxs("div", { className: "space-y-3 rounded-xl border border-line bg-panel p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs text-mute", children: "\u062D\u0627\u0644\u0629 \u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A:" }), _jsx("p", { className: `font-semibold ${status?.lastSuccess ? 'text-ok' : 'text-warn'}`, children: status?.lastSuccess
                                            ? `آخر نسخة سليمة: ${new Date(status.lastSuccess.createdAt).toLocaleString('ar-SA')}`
                                            : 'جارٍ التحقق من حالة النسخ الاحتياطية…' })] }), status?.lastSuccess?.sha256 && (_jsxs("div", { className: "font-mono text-[11px] text-mute", dir: "ltr", children: ["SHA-256: ", status.lastSuccess.sha256.slice(0, 16), "..."] }))] }), status?.lastSuccess?.archiveCount != null && (_jsxs("p", { className: "text-xs text-text-2", children: ["\u0639\u062F\u062F \u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u0624\u0631\u0634\u0641\u0629 \u0641\u064A \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0623\u062E\u064A\u0631\u0629: ", _jsx("strong", { children: status.lastSuccess.archiveCount }), " \u0633\u062C\u0644."] })), _jsxs("div", { className: "border-t border-line/60 pt-2 text-xs text-mute space-y-1", children: [_jsx("p", { children: "\u2022 \u0646\u0633\u062E \u062A\u0644\u0642\u0627\u0626\u064A\u0629 \u0639\u0646\u062F \u062A\u063A\u064A\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062E\u0644\u0627\u0644 \u062F\u0642\u064A\u0642\u0629\u060C \u0648\u0646\u0633\u062E\u0629 \u0625\u062C\u0628\u0627\u0631\u064A\u0629 \u0642\u0628\u0644 \u0623\u064A \u0639\u0645\u0644\u064A\u0629 \u062D\u0630\u0641." }), status?.mirrorDirectory ? (_jsxs("p", { className: "text-ok", children: ["\u2713 \u0646\u0633\u062E\u0629 \u0625\u0636\u0627\u0641\u064A\u0629 \u0645\u062A\u0632\u0627\u0645\u0646\u0629 \u0641\u064A: ", _jsx("span", { className: "break-all font-mono", dir: "ltr", children: status.mirrorDirectory }), status.encryptedExternalCopy && ' (مشفرة بـ AES-256-GCM)'] })) : (_jsx("p", { className: "text-warn", children: "! \u0644\u0645 \u062A\u064F\u0636\u0628\u0637 \u0648\u062C\u0647\u0629 \u062E\u0627\u0631\u062C\u064A\u0629 \u0625\u0636\u0627\u0641\u064A\u0629 \u0639\u0628\u0631 \u0645\u062A\u063A\u064A\u0631 ARCHIVE_BACKUP_MIRROR_DIR." })), status?.directory && (_jsxs("p", { children: ["\u0645\u062C\u0644\u062F \u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0623\u0633\u0627\u0633\u064A: ", _jsx("span", { className: "break-all font-mono text-[11px]", dir: "ltr", children: status.directory })] }))] }), error && _jsx("p", { role: "alert", className: "rounded-lg bg-error/10 p-2.5 text-xs text-error", children: error }), okMsg && _jsx("p", { role: "status", className: "rounded-lg bg-ok/10 p-2.5 text-xs text-ok", children: okMsg }), _jsx("div", { className: "pt-2", children: _jsxs("button", { className: "inline-flex items-center gap-2 rounded-xl bg-gold/15 border border-gold/40 px-4 py-2 text-xs font-bold text-gold hover:bg-gold hover:text-ink transition disabled:opacity-50", disabled: busy || status?.busy, onClick: () => void backup(), children: [_jsx(RefreshCw, { className: `h-3.5 w-3.5 ${busy || status?.busy ? 'animate-spin' : ''}` }), busy || status?.busy ? 'جارٍ إنشاء النسخة والتحقق من سلامتها…' : 'إنشاء نسخة احتياطية حقيقية وفحصها الآن'] }) })] }))] }));
}
export function ArchiveVersions({ id }) {
    const { user } = useAuth();
    const [versions, setVersions] = useState(null);
    const [error, setError] = useState('');
    return (_jsxs("div", { className: "mb-4 rounded-xl border border-line p-3", dir: "rtl", children: [_jsx("button", { className: "text-xs font-bold text-gold underline hover:text-light-gold", onClick: () => user &&
                    apiCommittee(user.token, '/admin/assessment-archive/' + encodeURIComponent(id) + '/versions')
                        .then(setVersions)
                        .catch((e) => setError(e.message)), children: "\u0639\u0631\u0636 \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u062A\u0639\u062F\u064A\u0644\u0627\u062A \u0648\u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629 \u0644\u0644\u0646\u062A\u064A\u062C\u0629" }), error && _jsx("p", { className: "mt-1 text-xs text-error", children: error }), versions?.map((v, i) => (_jsxs("p", { className: "mt-2 text-xs text-text-2", children: [i === 0 ? 'النسخة الأصلية عند الإدخال' : 'تعديل موثق في الأرشيف', " \u2014 \u0627\u0644\u062F\u0631\u062C\u0629: ", v.score, "/", v.maxScore, " (", v.percent != null ? `${v.percent}%` : '—', ") \u2014 \u0627\u0644\u062A\u0627\u0631\u064A\u062E: ", new Date(v.recordedAt).toLocaleString('ar-SA')] }, v.id)))] }));
}
