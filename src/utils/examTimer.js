/** تقدير الواجهة فقط؛ الخادم هو المرجع النهائي للموعد. */
export function examDurationSeconds(questionCount, secondsPerQuestion = 30) {
    const n = Math.max(1, Math.floor(questionCount) || 1);
    return n * Math.max(30, Math.floor(secondsPerQuestion) || 30);
}
export function formatCountdown(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
