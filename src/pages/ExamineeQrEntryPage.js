import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Loader2, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiQrLoginExam } from '../api/client';
import { useAuth } from '../auth/AuthContext';
const QR_ERROR_MESSAGES = {
    TOKEN_NOT_FOUND: {
        title: 'رمز الاستجابة السريعة غير موجود',
        hint: 'تأكد من مسح الرمز المخصص لك من شاشة مشرف القاعة، أو تحقق من سلامة الرابط.',
    },
    EXAM_INACTIVE: {
        title: 'الاختبار غير مفعّل حالياً',
        hint: 'الاختبار متوقف من لوحة الإدارة. راجع المراقب لتفعيله من قائمة الاختبارات.',
    },
    EXAM_DRAFT_PENDING_QUESTIONS: {
        title: 'الاختبار لم يُجهَّز بالأسئلة بعد',
        hint: 'ما زال الاختبار مسودة. على المسؤول استكمال الأسئلة من «استكمال أسئلة الاختبار» ثم إعادة المحاولة.',
    },
    EXAM_SUBMITTED: {
        title: 'الاختبار تم تسليمه مسبقاً',
        hint: 'تم تسجيل تسليم إجابات هذا الاختبار بالفعل ولا يمكن الدخول إليه مرة ثانية.',
    },
    TOKEN_EXPIRED: {
        title: 'انتهت صلاحية رمز الدخول',
        hint: 'تجاوز الرمز المدة الزمنية المسموحة للصلاحية. اطلب من المشرف تحديث بطاقة الدخول.',
    },
    INVALID_TOKEN_FORMAT: {
        title: 'رمز الدخول ناقص أو غير مكتمل',
        hint: 'امسح رمز QR من البطاقة المطبوعة كاملةً، وليس رقم الممتحن. إن كانت البطاقة قديمة فأعد طباعتها من قائمة الممتحنين.',
    },
    COMMITTEE_QR_NOT_READY: {
        title: 'أسئلة QR غير جاهزة بعد',
        hint: 'على عضو اللجنة إعداد وضع QR واعتماد الأسئلة قبل مسح بطاقة المتقدم.',
    },
    TOKEN_ALREADY_USED: {
        title: 'الرمز مستخدم على جهاز آخر',
        hint: 'هذا الرمز مسجل لجهاز آخر أو جلسة أخرى نشطة. تواصل مع المشرف لإعادة ضبط الجلسة.',
    },
    ACCOUNT_DISABLED: {
        title: 'الحساب معطّل',
        hint: 'تم تعطيل هذا الحساب أو بطاقة الدخول من قبل الإدارة. يرجى مراجعة اللجنة المنظمة.',
    },
};
export function ExamineeQrEntryPage() {
    const { token } = useParams();
    const { setUser } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [errorCode, setErrorCode] = useState('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!token) {
            setError('رمز الدخول غير موجود');
            setErrorCode('TOKEN_NOT_FOUND');
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError('');
        setErrorCode('');
        apiQrLoginExam(token)
            .then((res) => {
            if (cancelled)
                return;
            setUser({
                token: res.token,
                role: 'examinee',
                examineeName: res.examineeName,
                examId: res.exam.id,
            });
            navigate('/take', { replace: true });
        })
            .catch((err) => {
            if (cancelled)
                return;
            const code = err?.code || '';
            setErrorCode(code);
            setError(err instanceof Error ? err.message : 'تعذر الدخول عبر QR');
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [token, setUser, navigate]);
    if (loading && !error) {
        return (_jsxs("div", { className: "mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center", dir: "rtl", children: [_jsx(Loader2, { className: "h-10 w-10 animate-spin text-gold" }), _jsx("p", { className: "text-sm text-mute", children: "\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0631\u0645\u0632 \u0627\u0644\u062F\u062E\u0648\u0644..." })] }));
    }
    const info = errorCode ? QR_ERROR_MESSAGES[errorCode] : null;
    return (_jsxs("div", { className: "mx-auto max-w-md space-y-4 py-12 text-center", dir: "rtl", children: [_jsx("div", { className: "mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10 text-error", children: _jsx(QrCode, { className: "h-10 w-10" }) }), _jsx("h1", { className: "text-xl font-extrabold text-light-gold", children: info ? info.title : 'تعذر الدخول للاختبار' }), _jsx("p", { className: "text-sm text-error", children: error }), info && (_jsxs("div", { className: "rounded-xl border border-gold/30 bg-gold/5 p-3.5 text-xs text-text-2 leading-relaxed text-right", children: [_jsx("strong", { className: "text-light-gold block mb-1", children: "\u0625\u0631\u0634\u0627\u062F\u0627\u062A \u0627\u0644\u0642\u0627\u0639\u0629:" }), info.hint] })), errorCode && (_jsxs("div", { className: "text-[11px] font-mono text-mute", dir: "ltr", children: ["Error Code: ", errorCode] })), _jsx("div", { className: "pt-2", children: _jsx(Link, { to: "/", className: "inline-flex rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink hover:bg-accent-gold transition", children: "\u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629" }) })] }));
}
