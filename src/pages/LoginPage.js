import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { KeyRound, LogIn, QrCode } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiLoginAdmin } from '../api/client';
import { useAuth } from '../auth/AuthContext';
/** هذه البوابة لحسابات الوصول، وتتيح أيضاً للممتحنين إدخال رمز البطاقة أو الرابط يدوياً. */
export function LoginPage() {
    const navigate = useNavigate();
    const { setUser } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [examineeInput, setExamineeInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    async function submit(event) {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            const result = await apiLoginAdmin(username, password);
            setUser(result);
            navigate(result.role?.startsWith('committee_')
                ? '/committees'
                : result.role === 'commander'
                    ? '/admin/briefing'
                    : '/admin', { replace: true });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
        }
        finally {
            setLoading(false);
        }
    }
    function handleExamineeTokenSubmit(event) {
        event.preventDefault();
        const trimmed = examineeInput.trim();
        if (!trimmed)
            return;
        let token = trimmed;
        const enterMatch = trimmed.match(/\/enter\/([a-zA-Z0-9_-]+)/);
        if (enterMatch) {
            token = enterMatch[1];
        }
        navigate(`/enter/${encodeURIComponent(token)}`);
    }
    return (_jsx("main", { className: "mx-auto flex min-h-[70vh] max-w-xl items-center py-8", children: _jsxs("section", { className: "surface-card w-full rounded-3xl p-6 sm:p-9", children: [_jsxs("div", { className: "mb-7 flex items-center gap-3", children: [_jsx("div", { className: "flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold", children: _jsx(KeyRound, { className: "h-6 w-6" }) }), _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u0628\u0648\u0627\u0628\u0629 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" }), _jsx("p", { className: "mt-1 text-sm text-mute", children: "\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0648\u0627\u0644\u0644\u062C\u0627\u0646\u060C \u0645\u0639 \u0625\u0645\u0643\u0627\u0646\u064A\u0629 \u062F\u062E\u0648\u0644 \u0627\u0644\u0645\u0645\u062A\u062D\u0646 \u0639\u0628\u0631 \u0631\u0645\u0632 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0623\u0648 \u0627\u0644\u0631\u0627\u0628\u0637." })] })] }), _jsxs("form", { onSubmit: submit, className: "space-y-4", children: [_jsxs("label", { className: "block text-sm font-bold text-text", children: ["\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645", _jsx("input", { value: username, onChange: (e) => setUsername(e.target.value), autoComplete: "username", required: true, className: "mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text outline-none focus:border-gold" })] }), _jsxs("label", { className: "block text-sm font-bold text-text", children: ["\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), autoComplete: "current-password", required: true, className: "mt-2 w-full rounded-xl border border-line bg-void px-4 py-3 text-text outline-none focus:border-gold" })] }), error && _jsx("p", { role: "alert", className: "rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error", children: error }), _jsxs("button", { disabled: loading, className: "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3.5 font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-60", children: [_jsx(LogIn, { className: "h-4 w-4" }), loading ? 'جارٍ التحقق…' : 'تسجيل الدخول'] })] }), _jsxs("div", { className: "mt-8 border-t border-line/60 pt-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold", children: _jsx(QrCode, { className: "h-5 w-5" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-base font-bold text-light-gold", children: "\u062F\u062E\u0648\u0644 \u0627\u0644\u0645\u0645\u062A\u062D\u0646 (\u0628\u0631\u0645\u0632 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0623\u0648 \u0627\u0644\u0631\u0627\u0628\u0637)" }), _jsx("p", { className: "text-xs text-mute", children: "\u0625\u0630\u0627 \u0643\u0646\u062A \u062A\u0633\u062A\u062E\u062F\u0645 \u062C\u0647\u0627\u0632 \u0643\u0645\u0628\u064A\u0648\u062A\u0631 \u0623\u0648 \u0642\u0627\u0631\u0626 \u0628\u0627\u0631\u0643\u0648\u062F\u060C \u0623\u0644\u0635\u0642 \u0627\u0644\u0631\u0627\u0628\u0637 \u0623\u0648 \u0631\u0645\u0632 \u0627\u0644\u062F\u062E\u0648\u0644 \u0647\u0646\u0627." })] })] }), _jsxs("form", { onSubmit: handleExamineeTokenSubmit, className: "mt-4 flex gap-2", children: [_jsx("input", { type: "text", placeholder: "\u0623\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0623\u0648 \u0627\u0644\u0631\u0645\u0632 (enter/token...)", value: examineeInput, onChange: (e) => setExamineeInput(e.target.value), className: "flex-1 rounded-xl border border-line bg-void px-4 py-2.5 text-xs text-text outline-none focus:border-gold", dir: "ltr" }), _jsx("button", { type: "submit", disabled: !examineeInput.trim(), className: "rounded-xl bg-gold px-4 py-2.5 text-xs font-bold text-ink hover:bg-light-gold disabled:cursor-not-allowed disabled:opacity-50", children: "\u062F\u062E\u0648\u0644 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" })] })] })] }) }));
}
