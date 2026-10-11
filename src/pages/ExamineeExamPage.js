import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { safeRandomUUID } from '../utils/uuid';
import { CheckCircle2, Clock, Eye, MonitorUp, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGetExamQuestions, apiSubmitExam, apiCommittee } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { QuestionCard } from '../components/QuestionCard';
import { CATEGORY_META, EXAM_LEVELS } from '../data/types';
import { useExamineeLiveStream } from '../hooks/useLiveMonitor';
import { useExamAntiCheat } from '../hooks/useExamAntiCheat';
import { examDurationSeconds, formatCountdown } from '../utils/examTimer';
import { isObjectiveExam } from '../../shared/examPresentation.js';
export function ExamineeExamPage() {
    const { user, logout } = useAuth();
    const [exam, setExam] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [index, setIndex] = useState(0);
    const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
    const [deadlineAt, setDeadlineAt] = useState(null);
    const saveQueue = useRef(Promise.resolve());
    const runRevision = useRef(0);
    const pendingSync = useRef(false);
    const indexRef = useRef(0);
    const submissionKey = useRef(safeRandomUUID());
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [doneMessage, setDoneMessage] = useState('');
    const [submissionStatus, setSubmissionStatus] = useState(null);
    const [revealedScore, setRevealedScore] = useState(null);
    const [sessionStopped, setSessionStopped] = useState(false);
    const [acceptedMonitor, setAcceptedMonitor] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [timedOut, setTimedOut] = useState(false);
    const [startingShare, setStartingShare] = useState(false);
    // متصفحات الجوال غالباً لا تدعم getDisplayMedia؛ لا نمنع جلسة QR بسبب ذلك.
    const screenShareRequired = window.isSecureContext && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
    const answersRef = useRef(answers);
    const submittingRef = useRef(false);
    const finishedRef = useRef(false);
    const timeoutFiredRef = useRef(false);
    const outboxKey = user?.role === 'examinee' ? `exam-outbox:${user.examId}:${user.id || user.examineeName}` : '';
    useExamAntiCheat(acceptedMonitor && !doneMessage);
    const { screenSharing, monitoringStatus, connected, startCapture, stopCapture } = useExamineeLiveStream({
        token: user?.token,
        enabled: acceptedMonitor && !doneMessage && questions.length > 0,
        questionIndex: index,
        questionTotal: questions.length,
        secondsLeft,
        onError: (msg) => setError(msg),
        onSessionEnded: () => { if (!submittingRef.current) {
            setSessionStopped(true);
            setDoneMessage('انتهت جلسة المراقبة على هذا الجهاز. حُفظ ما وصل من إجابات؛ راجع المسؤول عند الحاجة.');
        } },
    });
    useEffect(() => {
        answersRef.current = answers;
        indexRef.current = index;
    }, [answers, index]);
    useEffect(() => {
        if (!user?.token || user.role !== 'examinee')
            return;
        apiGetExamQuestions(user.token)
            .then((res) => {
            setExam(res.exam);
            setQuestions(res.questions);
            setSecondsLeft(examDurationSeconds(res.questions.length, res.exam.secondsPerQuestion));
            if (res.run) {
                runRevision.current = res.run.revision || 0;
                let recoveredAnswers = res.run.answers, recoveredIndex = res.run.questionIndex;
                try {
                    const pending = JSON.parse(sessionStorage.getItem(`exam-outbox:${user.examId}:${user.id || user.examineeName}`) || 'null');
                    if (pending?.deadlineAt === res.run.deadlineAt && pending?.revision === res.run.revision) {
                        recoveredAnswers = { ...res.run.answers, ...(pending.answers || {}) };
                        recoveredIndex = Math.max(res.run.questionIndex, Number(pending.questionIndex) || 0);
                        if (typeof pending.submissionKey === 'string')
                            submissionKey.current = pending.submissionKey;
                    }
                }
                catch { /* تجاهل outbox تالف */ }
                setAnswers(recoveredAnswers);
                setIndex(recoveredIndex);
                setStartedAt(res.run.startedAt);
                setDeadlineAt(res.run.deadlineAt);
                setSecondsLeft(res.run.secondsLeft);
                if (res.run.status !== 'active')
                    setDoneMessage('تم استلام إجاباتك سابقًا وهي قيد التقييم من المسؤول.');
            }
        })
            .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل الاختبار'))
            .finally(() => setLoading(false));
    }, [user]);
    useEffect(() => {
        if (!outboxKey || !deadlineAt || doneMessage)
            return;
        sessionStorage.setItem(outboxKey, JSON.stringify({ answers, questionIndex: index, revision: runRevision.current, deadlineAt, submissionKey: submissionKey.current, savedAt: new Date().toISOString() }));
    }, [answers, index, deadlineAt, doneMessage, outboxKey]);
    useEffect(() => {
        if (!user || exam?.executionMode !== 'qr' || !acceptedMonitor || doneMessage)
            return;
        pendingSync.current = true;
        const timer = window.setTimeout(() => {
            saveQueue.current = saveQueue.current.catch(() => { }).then(() => apiCommittee(user.token, '/exam/execution/progress', 'PUT', { answers: answersRef.current, questionIndex: indexRef.current, revision: runRevision.current }))
                .then((saved) => {
                if (typeof saved.revision === 'number')
                    runRevision.current = saved.revision;
                pendingSync.current = false;
                if (outboxKey)
                    sessionStorage.setItem(outboxKey, JSON.stringify({ answers: answersRef.current, questionIndex: indexRef.current, revision: runRevision.current, deadlineAt, submissionKey: submissionKey.current, savedAt: new Date().toISOString() }));
            })
                .catch(() => setError('لم يصل آخر تحديث للإجابات؛ احتفظ بالصفحة مفتوحة حتى عودة الاتصال.'));
        }, 500);
        return () => clearTimeout(timer);
    }, [answers, index, acceptedMonitor, doneMessage, exam?.executionMode, user?.token]);
    useEffect(() => {
        if (!user || exam?.executionMode !== 'qr' || !acceptedMonitor || doneMessage)
            return;
        const retry = () => {
            if (!pendingSync.current)
                return;
            saveQueue.current = saveQueue.current.catch(() => { }).then(() => apiCommittee(user.token, '/exam/execution/progress', 'PUT', { answers: answersRef.current, questionIndex: indexRef.current, revision: runRevision.current }))
                .then((saved) => {
                if (typeof saved.revision === 'number')
                    runRevision.current = saved.revision;
                pendingSync.current = false;
                setError((current) => current.startsWith('لم يصل آخر تحديث') ? '' : current);
                if (outboxKey)
                    sessionStorage.setItem(outboxKey, JSON.stringify({ answers: answersRef.current, questionIndex: indexRef.current, revision: runRevision.current, deadlineAt, submissionKey: submissionKey.current, savedAt: new Date().toISOString() }));
            }).catch(() => { pendingSync.current = true; });
        };
        const timer = window.setInterval(retry, 5000);
        window.addEventListener('online', retry);
        return () => { window.clearInterval(timer); window.removeEventListener('online', retry); };
    }, [acceptedMonitor, doneMessage, exam?.executionMode, user?.token, outboxKey, deadlineAt]);
    useEffect(() => {
        const blockBack = () => {
            window.history.pushState(null, '', window.location.href);
        };
        window.history.pushState(null, '', window.location.href);
        window.addEventListener('popstate', blockBack);
        return () => window.removeEventListener('popstate', blockBack);
    }, []);
    async function finish(finalAnswers, reason = 'manual') {
        if (!user?.token || finishedRef.current || submittingRef.current)
            return;
        finishedRef.current = true;
        submittingRef.current = true;
        setSubmitting(true);
        setError('');
        if (reason === 'timeout') {
            setTimedOut(true);
            stopCapture();
        }
        try {
            await saveQueue.current.catch(() => { });
            const res = await apiSubmitExam(user.token, finalAnswers, startedAt, submissionKey.current, runRevision.current);
            if (outboxKey)
                sessionStorage.removeItem(outboxKey);
            stopCapture();
            if (res.evaluationStatus) {
                setSubmissionStatus(res.evaluationStatus);
            }
            if (res.revealScore && res.percent != null && res.score != null && res.maxScore != null) {
                setRevealedScore({ score: res.score, maxScore: res.maxScore, percent: res.percent });
            }
            setDoneMessage(reason === 'timeout'
                ? `انتهى الوقت. تم تسليم ما أُجيب عنه تلقائياً. ${res.message}`
                : res.message);
        }
        catch (err) {
            finishedRef.current = false;
            setError(err instanceof Error ? err.message : 'فشل التسليم');
        }
        finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }
    useEffect(() => {
        if (!acceptedMonitor || !questions.length || doneMessage)
            return;
        const id = window.setInterval(() => {
            setSecondsLeft((prev) => deadlineAt ? Math.max(0, Math.ceil((Date.parse(deadlineAt) - Date.now()) / 1000)) : (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => window.clearInterval(id);
    }, [acceptedMonitor, questions.length, doneMessage, deadlineAt]);
    useEffect(() => {
        if (!acceptedMonitor || doneMessage || !questions.length)
            return;
        if (secondsLeft !== 0)
            return;
        if (timeoutFiredRef.current)
            return;
        timeoutFiredRef.current = true;
        void finish(answersRef.current, 'timeout');
    }, [secondsLeft, acceptedMonitor, questions.length, doneMessage]);
    useEffect(() => {
        if (!timedOut || doneMessage)
            return;
        const retrySubmission = () => { if (!submittingRef.current)
            void finish(answersRef.current, 'timeout'); };
        const timer = window.setInterval(retrySubmission, 5000);
        window.addEventListener('online', retrySubmission);
        return () => { window.clearInterval(timer); window.removeEventListener('online', retrySubmission); };
    }, [timedOut, doneMessage, user?.token]);
    const current = questions[index];
    const answeredCount = Object.keys(answers).length;
    const totalSeconds = examDurationSeconds(questions.length, exam?.secondsPerQuestion);
    const urgent = secondsLeft > 0 && secondsLeft <= 60;
    function confirmCurrentAndNext() {
        if (!current || submitting)
            return;
        const value = answers[current.id];
        if (value === undefined || value === '') {
            setError('يجب اختيار/كتابة إجابة قبل الانتقال للسؤال التالي');
            return;
        }
        setError('');
        if (index >= questions.length - 1) {
            void finish(answers, 'manual');
            return;
        }
        setIndex((i) => i + 1);
    }
    async function beginExam() {
        setStartingShare(true);
        setError('');
        await startCapture();
        try {
            if (exam?.executionMode === 'qr' && user) {
                const result = await apiCommittee(user.token, '/exam/execution/start', 'POST');
                runRevision.current = result.run.revision || 0;
                setDeadlineAt(result.run.deadlineAt);
                setStartedAt(result.run.startedAt);
                setSecondsLeft(result.run.secondsLeft);
                if (result.run.status !== 'active') {
                    stopCapture();
                    setDoneMessage('سبق تسليم هذه الجلسة.');
                    return;
                }
            }
            setAcceptedMonitor(true);
        }
        catch (e) {
            stopCapture();
            setError(e instanceof Error ? e.message : 'تعذر بدء الجلسة');
        }
        finally {
            setStartingShare(false);
        }
    }
    if (doneMessage) {
        const isClassicPending = submissionStatus === 'pending' || doneMessage.includes('مقالية');
        return (_jsxs("div", { className: "mx-auto max-w-lg rounded-3xl border border-ok/30 bg-card p-8 text-center", children: [_jsx(CheckCircle2, { className: "mx-auto mb-3 h-14 w-14 text-ok" }), _jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: sessionStopped ? 'انتهت الجلسة على هذا الجهاز' : timedOut ? 'انتهى الوقت — تم التسليم' : 'تم التسليم' }), _jsx("p", { className: "mt-3 text-sm leading-relaxed text-text-2", children: doneMessage }), revealedScore ? (_jsxs("div", { className: "mt-4 rounded-xl border border-gold/40 bg-gold/10 p-4", children: [_jsx("p", { className: "text-sm text-mute", children: "\u0639\u0644\u0627\u0645\u062A\u0643 \u0641\u064A \u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646 \u0645\u062A\u0639\u062F\u062F" }), _jsxs("p", { className: "mt-1 text-3xl font-extrabold text-light-gold", children: [revealedScore.percent, "%"] }), _jsxs("p", { className: "mt-1 text-sm text-text", children: [revealedScore.score, " / ", revealedScore.maxScore] })] })) : (_jsx("p", { className: "mt-2 text-xs text-mute", children: "\u0644\u0646 \u062A\u0638\u0647\u0631 \u0646\u062A\u064A\u062C\u062A\u0643 \u0647\u0646\u0627 \u2014 \u062A\u064F\u0631\u0627\u062C\u0639 \u0645\u0646 \u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0641\u0642\u0637." })), isClassicPending && (_jsx("div", { className: "mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm font-medium text-warn", children: "\u062A\u0645 \u062A\u0633\u0644\u064A\u0645 \u0625\u062C\u0627\u0628\u0627\u062A\u0643 \u0628\u0646\u062C\u0627\u062D. \u064A\u062D\u062A\u0648\u064A \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0639\u0644\u0649 \u0623\u0633\u0626\u0644\u0629 \u0645\u0642\u0627\u0644\u064A\u0629 \u062A\u062E\u0636\u0639 \u0644\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u064A\u062F\u0648\u064A\u060C \u0648\u0633\u062A\u064F\u062D\u062F\u0651\u062B \u0646\u062A\u064A\u062C\u062A\u0643 \u0641\u0648\u0631 \u0627\u0639\u062A\u0645\u0627\u062F\u0647\u0627 \u0645\u0646 \u0642\u0628\u0644 \u0627\u0644\u0645\u0635\u062D\u062D \u0627\u0644\u0645\u062E\u062A\u0635." })), _jsx(Link, { to: "/", onClick: () => logout(), className: "mt-6 inline-flex rounded-xl bg-gold px-5 py-3 text-sm font-bold text-ink", children: "\u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" })] }));
    }
    if (loading)
        return _jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631..." });
    if (error && !questions.length) {
        return (_jsxs("div", { className: "rounded-2xl border border-error/40 bg-error/10 p-6 text-center", children: [_jsx("p", { className: "text-error", children: error }), _jsx(Link, { to: "/", className: "mt-4 inline-block font-bold text-gold", children: "\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629" })] }));
    }
    if (!acceptedMonitor) {
        const mins = Math.ceil(totalSeconds / 60);
        const objectiveExam = isObjectiveExam(questions.map((q) => q.type));
        return (_jsx("div", { className: "mx-auto max-w-xl space-y-5", children: _jsxs("div", { className: "rounded-3xl border border-warn/50 bg-card p-8 text-center shadow-lg", children: [_jsx(ShieldAlert, { className: "mx-auto mb-4 h-14 w-14 text-warn" }), _jsx("h1", { className: "text-2xl font-extrabold text-light-gold", children: "\u062A\u0646\u0628\u064A\u0647 \u0642\u0628\u0644 \u0627\u0644\u0628\u062F\u0621" }), _jsxs("div", { className: "mt-4 space-y-3 text-right text-sm leading-7 text-text-2", children: [_jsxs("p", { className: "rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-light-gold", children: [_jsx(Clock, { className: "mb-1 inline h-4 w-4" }), " \u0627\u0644\u0645\u062F\u0629:", ' ', _jsxs("strong", { children: [questions.length, " \u0633\u0624\u0627\u0644 \u2248 ", mins, " \u062F\u0642\u064A\u0642\u0629"] })] }), screenShareRequired ? (_jsxs("p", { className: "rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-warn", children: [_jsx(MonitorUp, { className: "mb-1 inline h-4 w-4" }), " \u0633\u064A\u0637\u0644\u0628 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0645\u0648\u0627\u0641\u0642\u062A\u0643 \u0639\u0644\u0649 \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0634\u0627\u0634\u0629 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0629 \u0641\u0642\u0637. \u0645\u0634\u0627\u0631\u0643\u0629 \u0646\u0627\u0641\u0630\u0629 \u0623\u0648 \u062A\u0628\u0648\u064A\u0628 \u062A\u062A\u064A\u062D \u0645\u0631\u0627\u0642\u0628\u0629 \u062C\u0632\u0626\u064A\u0629\u061B \u062A\u0638\u0647\u0631 \u0644\u0644\u0645\u0633\u0624\u0648\u0644 \u0637\u0628\u064A\u0639\u0629 \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0641\u0639\u0644\u064A\u0629."] })) : (_jsx("p", { className: "rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-light-gold", children: "\u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0634\u0627\u0634\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0623\u0648 \u0627\u0644\u0627\u062A\u0635\u0627\u0644. \u0633\u064A\u0638\u0647\u0631 \u0644\u0644\u0645\u0633\u0624\u0648\u0644 \u0623\u0646 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629 \u062C\u0632\u0626\u064A\u0629 \u0648\u062A\u0642\u062A\u0635\u0631 \u0639\u0644\u0649 \u0623\u062D\u062F\u0627\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u0648\u0627\u0644\u062A\u0642\u062F\u0645." })), _jsxs("ul", { className: "list-disc pr-5 text-mute", children: [_jsx("li", { children: "\u0633\u0624\u0627\u0644 \u0648\u0627\u062D\u062F \u0641\u064A \u0643\u0644 \u0645\u0631\u0629 \u0648\u0644\u0627 \u0631\u062C\u0648\u0639 \u0628\u0639\u062F \u0627\u0644\u062A\u0623\u0643\u064A\u062F." }), _jsx("li", { children: objectiveExam ? 'ستظهر علامتك فور التسليم، وتظهر للجنة كذلك.' : 'النتيجة لا تظهر لك وتُحفظ للإدارة.' }), screenShareRequired && _jsx("li", { children: "\u0625\u064A\u0642\u0627\u0641 \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0634\u0627\u0634\u0629 \u064A\u0638\u0647\u0631 \u062A\u0646\u0628\u064A\u0647\u0627\u064B \u0641\u064A \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629." }), _jsx("li", { children: "\u062A\u064F\u0633\u062C\u0651\u0644 \u0645\u063A\u0627\u062F\u0631\u0629 \u0627\u0644\u0635\u0641\u062D\u0629 \u0648\u0641\u0642\u062F\u0627\u0646 \u0627\u0644\u062A\u0631\u0643\u064A\u0632 \u0648\u0627\u0646\u0642\u0637\u0627\u0639 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0643\u0623\u062D\u062F\u0627\u062B \u062A\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629\u060C \u0648\u0644\u064A\u0633\u062A \u062F\u0644\u064A\u0644\u064B\u0627 \u0642\u0637\u0639\u064A\u064B\u0627 \u0639\u0644\u0649 \u0627\u0644\u063A\u0634." })] }), error && (_jsx("p", { className: "rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-error", children: error }))] }), _jsx("button", { type: "button", disabled: startingShare, onClick: () => void beginExam(), className: "mt-6 w-full rounded-xl bg-gold py-3.5 text-sm font-extrabold text-ink hover:bg-accent-gold disabled:opacity-60", children: screenShareRequired
                            ? startingShare ? 'انتظر مشاركة الشاشة...' : 'مشاركة الشاشة وبدء الاختبار'
                            : 'بدء الاختبار' })] }) }));
    }
    return (_jsxs("div", { className: "mx-auto max-w-3xl space-y-5", children: [_jsxs("div", { className: `sticky top-[4.5rem] z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${urgent ? 'border-error/50 bg-error/15 text-error' : 'border-warn/40 bg-warn/10 text-warn'}`, children: [_jsxs("span", { className: "inline-flex items-center gap-2 font-bold", children: [_jsx(Clock, { className: "h-4 w-4" }), "\u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0645\u062A\u0628\u0642\u064A: ", formatCountdown(secondsLeft)] }), screenShareRequired ? (_jsxs("span", { className: `inline-flex items-center gap-1 text-xs font-bold ${screenSharing ? 'text-ok' : 'text-error'}`, children: [_jsx(Eye, { className: "h-3.5 w-3.5" }), screenSharing ? (monitoringStatus === 'screen' ? 'مشاركة شاشة كاملة' : 'مشاركة جزئية') : 'لا تُشارك الشاشة'] })) : (_jsxs("span", { className: "inline-flex items-center gap-1 text-xs font-bold text-gold", children: [_jsx(Eye, { className: "h-3.5 w-3.5" }), " \u0645\u0631\u0627\u0642\u0628\u0629 \u062C\u0632\u0626\u064A\u0629 \u2014 \u0627\u0644\u0634\u0627\u0634\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629"] }))] }), _jsxs("div", { className: "flex justify-between gap-3 text-sm", children: [_jsx("span", { className: connected ? 'text-ok' : 'text-warn', children: connected ? 'متصل بالمراقبة' : 'المراقبة غير متصلة — جاري إعادة الاتصال' }), document.fullscreenEnabled && _jsx("button", { className: "text-gold underline", onClick: () => void document.documentElement.requestFullscreen().catch(() => setError('تعذر الدخول في وضع ملء الشاشة')), children: "\u0639\u0631\u0636 \u0628\u0645\u0644\u0621 \u0627\u0644\u0634\u0627\u0634\u0629" })] }), screenShareRequired && !screenSharing && (_jsxs("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: ["\u062A\u0648\u0642\u0641\u062A \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0634\u0627\u0634\u0629.", ' ', _jsx("button", { type: "button", className: "font-bold underline", onClick: () => void startCapture(), children: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644" })] })), _jsxs("div", { className: "rounded-2xl border border-line bg-card p-5", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsx("h1", { className: "text-xl font-extrabold text-light-gold", children: exam?.title }), _jsxs("span", { className: "rounded-full border border-line bg-panel px-3 py-1 text-xs font-bold text-gold", children: ["\u0633\u0624\u0627\u0644 ", index + 1, " \u0645\u0646 ", questions.length] })] }), _jsxs("p", { className: "mt-1 text-sm text-mute", children: [user?.examineeName, " \u00B7 ", exam && CATEGORY_META[exam.category].label, " \u00B7", ' ', exam && EXAM_LEVELS.find((l) => l.id === exam.level)?.label] }), _jsx("div", { className: "mt-3 h-2 overflow-hidden rounded-full bg-panel", children: _jsx("div", { className: "h-full rounded-full bg-gradient-to-l from-gold to-light-gold transition-all", style: { width: `${Math.round((answeredCount / Math.max(questions.length, 1)) * 100)}%` } }) })] }), current && (_jsx(QuestionCard, { question: current, index: index, value: answers[current.id], onChange: (v) => setAnswers((a) => ({ ...a, [current.id]: v })), hideMeta: true }, current.id)), error && (_jsx("div", { className: "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error", children: error })), _jsx("button", { type: "button", disabled: submitting, onClick: confirmCurrentAndNext, className: "sticky bottom-4 w-full rounded-2xl bg-gold py-4 text-base font-extrabold text-ink shadow-xl shadow-gold/20 hover:bg-accent-gold disabled:opacity-60", children: submitting
                    ? 'جاري التسليم والتصحيح...'
                    : index >= questions.length - 1
                        ? 'تأكيد الإجابة وتسليم الاختبار'
                        : 'تأكيد الإجابة والانتقال للتالي' }), _jsx("p", { className: "text-center text-xs text-mute", children: "\u0628\u0639\u062F \u0627\u0644\u062A\u0623\u0643\u064A\u062F \u0644\u0646 \u062A\u062A\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0633\u0624\u0627\u0644." })] }));
}
