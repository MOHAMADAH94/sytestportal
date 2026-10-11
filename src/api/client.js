import { safeRandomUUID } from '../utils/uuid';
export const LEVEL_META = {
    technician: {
        label: 'مستوى فني',
        description: 'أسئلة مناسبة للمستوى الفني',
    },
    engineer: {
        label: 'مستوى مهندس',
        description: 'أسئلة مناسبة للمستوى الهندسي',
    },
};
const TOKEN_KEY = 'exam-platform-auth';
export const COOKIE_SESSION = 'http-only-cookie';
export const AUTH_INVALID_EVENT = 'exam-platform-auth-invalid';
export function saveSession(user) {
    // نخزن بيانات العرض فقط؛ JWT يبقى في cookie لا تستطيع JavaScript قراءتها.
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ ...user, token: COOKIE_SESSION }));
    localStorage.removeItem(TOKEN_KEY);
}
export function loadSession() {
    try {
        const raw = sessionStorage.getItem(TOKEN_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return null;
        if (typeof parsed.token !== 'string' || !parsed.token.trim()) {
            clearSession();
            return null;
        }
        if (parsed.role !== 'admin' &&
            parsed.role !== 'operator' &&
            parsed.role !== 'commander' &&
            parsed.role !== 'committee_manager' &&
            parsed.role !== 'committee_member' &&
            parsed.role !== 'examinee') {
            clearSession();
            return null;
        }
        return { ...parsed, token: parsed.token.trim() };
    }
    catch {
        clearSession();
        return null;
    }
}
export function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
}
function notifyInvalidSession() {
    clearSession();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_INVALID_EVENT));
    }
}
async function request(path, options = {}, token) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    const cleanToken = token?.trim();
    if (cleanToken && cleanToken !== COOKIE_SESSION)
        headers.Authorization = `Bearer ${cleanToken}`;
    const res = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data.error || 'حدث خطأ في الاتصال بالخادم';
        if (res.status === 401 && (msg.includes('جلسة') || msg.includes('غير مصرح'))) {
            notifyInvalidSession();
            throw new Error('انتهت الجلسة أو أصبحت غير صالحة — سجّل الدخول من جديد');
        }
        throw Object.assign(new Error(msg), {
            code: typeof data.code === 'string' ? data.code : undefined,
            status: res.status,
        });
    }
    return data;
}
export function apiAuthMe(token) {
    return request('/auth/me', {}, token);
}
/** تحقق من الجلسة دون مسحها عند أخطاء الشبكة */
export async function apiValidateSession(token) {
    try {
        const cleanToken = token.trim();
        const res = await fetch('/api/auth/me', {
            headers: cleanToken && cleanToken !== COOKIE_SESSION ? { Authorization: `Bearer ${cleanToken}` } : {},
            credentials: 'same-origin',
        });
        if (res.status === 401 || res.status === 403)
            return 'invalid';
        if (!res.ok)
            return 'offline';
        return 'ok';
    }
    catch {
        return 'offline';
    }
}
export function apiAccessAccounts() {
    return request('/access-accounts');
}
export function apiLoginAdmin(username, password) {
    return request('/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });
}
export function apiQrLoginExam(token) {
    let deviceId = localStorage.getItem('exam-platform-device-id');
    if (!deviceId) {
        deviceId = safeRandomUUID();
        localStorage.setItem('exam-platform-device-id', deviceId);
    }
    return request('/auth/exam/qr-login', {
        method: 'POST',
        body: JSON.stringify({ token, deviceId }),
    });
}
export function apiListExams(token) {
    return request('/admin/exams', {}, token);
}
export function apiExamineeFilters(token) {
    return request('/admin/examinee-filters', {}, token);
}
export function apiUpdateExamineeRank(token, identifier, rank) {
    return request(`/admin/examinees/${encodeURIComponent(identifier)}/rank`, { method: 'PATCH', body: JSON.stringify({ rank }) }, token);
}
export function apiListExaminees(token) {
    return request('/admin/examinees', {}, token);
}
export function apiListApplicants(token) {
    return request('/admin/applicants', {}, token);
}
export function apiListEvaluationCandidates(token) {
    return request('/admin/evaluation-candidates', {}, token);
}
export function apiCreateApplicantColumn(token, label) {
    return request('/admin/applicant-columns', { method: 'POST', body: JSON.stringify({ label }) }, token);
}
export function apiDeleteApplicantColumn(token, label) {
    return request(`/admin/applicant-columns/${encodeURIComponent(label)}`, { method: 'DELETE' }, token);
}
export function apiApplicantFilters(token) {
    return request('/admin/applicant-filters', {}, token);
}
export function apiSearchCorrections(token, q) {
    return request(`/admin/corrections?q=${encodeURIComponent(q)}`, {}, token);
}
export function apiEnrollApplicant(token, examId, applicantId) {
    return request(`/admin/exams/${encodeURIComponent(examId)}/enroll`, { method: 'POST', body: JSON.stringify({ applicantId }) }, token);
}
export function apiCreateApplicant(token, body) {
    return request('/admin/applicants', { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiImportApplicants(token, body) {
    return request('/admin/applicants/import', { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiUpdateApplicant(token, id, body) {
    return request(`/admin/applicants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
}
export function apiDeleteApplicant(token, id) {
    return request(`/admin/applicants/${id}`, { method: 'DELETE' }, token);
}
export function apiDeleteExaminee(token, identifier) {
    return request(`/admin/examinees/${encodeURIComponent(identifier)}`, { method: 'DELETE' }, token);
}
export function apiBulkDeleteApplicants(token, ids) {
    return request('/admin/applicants/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }, token);
}
export function apiAutoGenerateExams(token, body = {}) {
    return request('/admin/applicants/auto-generate-exams', { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiExamineeDetail(token, name) {
    return request(`/admin/examinees/${encodeURIComponent(name)}`, {}, token);
}
export function apiExamineeDecision(token, name) {
    return request(`/admin/examinees/${encodeURIComponent(name)}/decision`, {}, token);
}
export function apiAdoptExamineeDecision(token, name, body) {
    return request(`/admin/examinees/${encodeURIComponent(name)}/decision-adoption`, { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiListSecurityQueue(token) {
    return request('/admin/security-reviews', {}, token);
}
export function apiSaveSecurityReviewsBulk(token, body) {
    return request('/admin/security-reviews/bulk', { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiSaveSecurityReview(token, applicantId, body) {
    return request(`/admin/security-reviews/${encodeURIComponent(applicantId)}`, { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiLeadershipBriefing(token, period = 'all') {
    const query = period === '30d' ? '?period=30d' : '?period=all';
    return request(`/admin/leadership-briefing${query}`, {}, token);
}
export function apiCreateExam(token, body) {
    return request('/admin/exams', { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiExamRoster(token, examId) {
    return request(`/admin/exams/${examId}/roster`, {}, token);
}
export function apiExamResults(token, examId) {
    return request(`/admin/exams/${examId}/results`, {}, token);
}
export function apiAdminExamQuestions(token, examId, examineeName) {
    return request(`/admin/exams/${examId}/questions${examineeName ? '?examineeName=' + encodeURIComponent(examineeName) : ''}`, {}, token);
}
export function apiManualResult(token, examId, body) {
    return request(`/admin/exams/${examId}/manual-result`, { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiUpdateAttemptScore(token, examId, attemptId, body) {
    return request(`/admin/exams/${examId}/attempts/${attemptId}/score`, { method: 'PATCH', body: JSON.stringify(body) }, token);
}
export function apiManualScore(token, examId, body) {
    return request(`/admin/exams/${examId}/manual-score`, { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiSaveOralEvaluation(token, examId, body) {
    return request(`/admin/exams/${examId}/oral-evaluations`, { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiListOralArchive(token, filters) {
    const params = new URLSearchParams();
    if (filters?.examId)
        params.set('examId', filters.examId);
    if (filters?.examineeName)
        params.set('examineeName', filters.examineeName);
    if (filters?.examTitle)
        params.set('examTitle', filters.examTitle);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/admin/oral-archive${qs}`, {}, token);
}
export function apiListAssessmentArchive(token, filters) {
    const params = new URLSearchParams();
    if (filters?.category)
        params.set('category', filters.category);
    if (filters?.examId)
        params.set('examId', filters.examId);
    if (filters?.examineeName)
        params.set('examineeName', filters.examineeName);
    if (filters?.examTitle)
        params.set('examTitle', filters.examTitle);
    if (filters?.org)
        params.set('org', filters.org);
    if (filters?.cursor)
        params.set('cursor', filters.cursor);
    if (filters?.limit)
        params.set('limit', String(filters.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/admin/assessment-archive${qs}`, {}, token);
}
export function apiModifyAttemptResult(token, attemptId, body) {
    return request(`/admin/attempts/${attemptId}/modify-result`, { method: 'POST', body: JSON.stringify(body) }, token);
}
export function apiGetAttemptAuditHistory(token, attemptId) {
    return request(`/admin/attempts/${attemptId}/audit-history`, {}, token);
}
export function apiGetExamineeAuditHistory(token, examineeName) {
    return request(`/admin/examinees/${encodeURIComponent(examineeName)}/audit-history`, {}, token);
}
export function apiToggleExam(token, examId, active) {
    return request(`/admin/exams/${examId}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }, token);
}
export function apiDeleteExam(token, examId) {
    return request(`/admin/exams/${examId}`, { method: 'DELETE' }, token);
}
export function apiGetExamQuestions(token) {
    return request('/exam/questions', {}, token);
}
export function apiSubmitExam(token, answers, startedAt, submissionKey, revision) {
    return request('/exam/submit', { method: 'POST', body: JSON.stringify({ answers, startedAt, submissionKey, revision }) }, token);
}
export function apiCommittee(token, path, method = 'GET', body) {
    return request(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, token);
}
export function apiLogout() {
    return request('/auth/logout', { method: 'POST' });
}
export function apiChangePassword(token, currentPassword, newPassword) {
    return request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, token);
}
export function apiEvaluateClassicQuestions(token, examId, attemptId, scores, reason) {
    return request(`/admin/exams/${examId}/attempts/${attemptId}/evaluate-classic`, { method: 'POST', body: JSON.stringify({ scores, reason }) }, token);
}
export function apiGetMyExamResults(token) {
    return request('/exam/my-results', {}, token);
}
export function apiGetNetworkStatus(token) {
    return request('/admin/network-status', {}, token);
}
export function apiGetAdminAccounts(token) {
    return request('/admin/accounts', {}, token);
}
export function apiCreateAdminAccount(token, accountData) {
    return request('/admin/accounts', { method: 'POST', body: JSON.stringify(accountData) }, token);
}
export function apiToggleAccountStatus(token, type, id, active, reason) {
    return request(`/admin/accounts/${type}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active, reason }) }, token);
}
