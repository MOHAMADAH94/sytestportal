import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RequireExaminee, RequireStaff, RequireCommittee, RequireEvaluator } from './auth/RequireAuth';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Layout } from './components/Layout';
import { ThemeProvider } from './theme/ThemeContext';
const page = (loader, name) => lazy(async () => ({ default: (await loader())[name] }));
const EvaluationSessionPage = page(() => import('./pages/EvaluationSessionPage'), 'EvaluationSessionPage');
const CommitteesPage = page(() => import('./pages/CommitteesPage'), 'CommitteesPage');
const AdminApplicantsPage = page(() => import('./pages/AdminApplicantsPage'), 'AdminApplicantsPage');
const AdminCorrectionsPage = page(() => import('./pages/AdminCorrectionsPage'), 'AdminCorrectionsPage');
const AdminCreateExamPage = page(() => import('./pages/AdminCreateExamPage'), 'AdminCreateExamPage');
const CompleteExamQuestionsPage = page(() => import('./pages/CompleteExamQuestionsPage'), 'CompleteExamQuestionsPage');
const AdminEnterResultsPage = page(() => import('./pages/AdminEnterResultsPage'), 'AdminEnterResultsPage');
const AdminExamRosterPage = page(() => import('./pages/AdminExamRosterPage'), 'AdminExamRosterPage');
const AdminExamineeDetailPage = page(() => import('./pages/AdminExamineeDetailPage'), 'AdminExamineeDetailPage');
const AdminExamineesPage = page(() => import('./pages/AdminExamineesPage'), 'AdminExamineesPage');
const AdminExamsPage = page(() => import('./pages/AdminExamsPage'), 'AdminExamsPage');
const AdminLiveMonitorPage = page(() => import('./pages/AdminLiveMonitorPage'), 'AdminLiveMonitorPage');
const AdminOralArchivePage = page(() => import('./pages/AdminOralArchivePage'), 'AdminOralArchivePage');
const AdminOralEvaluationPage = page(() => import('./pages/AdminOralEvaluationPage'), 'AdminOralEvaluationPage');
const AdminCandidatePickerPage = page(() => import('./pages/AdminCandidatePickerPage'), 'AdminCandidatePickerPage');
const AdminResultsPage = page(() => import('./pages/AdminResultsPage'), 'AdminResultsPage');
const BanksPage = page(() => import('./pages/BanksPage'), 'BanksPage');
const ExamineeExamPage = page(() => import('./pages/ExamineeExamPage'), 'ExamineeExamPage');
const ExamineeQrEntryPage = page(() => import('./pages/ExamineeQrEntryPage'), 'ExamineeQrEntryPage');
const HomePage = page(() => import('./pages/HomePage'), 'HomePage');
const LoginPage = page(() => import('./pages/LoginPage'), 'LoginPage');
const ChangePasswordPage = page(() => import('./pages/ChangePasswordPage'), 'ChangePasswordPage');
const AdminPasswordManagementPage = page(() => import('./pages/AdminPasswordManagementPage'), 'AdminPasswordManagementPage');
const AdminSecurityReviewPage = page(() => import('./pages/AdminSecurityReviewPage'), 'AdminSecurityReviewPage');
const LeadershipBriefingPage = page(() => import('./pages/LeadershipBriefingPage'), 'LeadershipBriefingPage');
function RootEntry() {
    const { user } = useAuth();
    if (user?.role?.startsWith('committee_'))
        return _jsx(Navigate, { to: "/committees", replace: true });
    if (user?.role === 'commander')
        return _jsx(Navigate, { to: "/admin/briefing", replace: true });
    if (user?.role === 'operator' && user.category === 'security')
        return _jsx(Navigate, { to: "/admin/security", replace: true });
    if (user?.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user.category || '')) {
        return _jsx(Navigate, { to: "/committees", replace: true });
    }
    if (user?.role === 'admin' || user?.role === 'operator') {
        return _jsx(Navigate, { to: "/admin", replace: true });
    }
    if (user?.role === 'examinee') {
        return _jsx(Navigate, { to: "/take", replace: true });
    }
    return _jsx(HomePage, {});
}
function StaffExamsRoute() {
    const { user } = useAuth();
    if (user?.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user.category || '')) {
        return _jsx(Navigate, { to: "/committees", replace: true });
    }
    return _jsx(AdminExamsPage, {});
}
function StaffCreateRoute() {
    const { user } = useAuth();
    if (user?.role === 'operator')
        return _jsx(Navigate, { to: "/committees", replace: true });
    return _jsx(AdminCreateExamPage, {});
}
export default function App() {
    return (_jsx(AppErrorBoundary, { children: _jsx(ThemeProvider, { children: _jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsx(Suspense, { fallback: _jsx("div", { className: "p-8 text-center text-mute", children: "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0635\u0641\u062D\u0629\u2026" }), children: _jsx(Routes, { children: _jsxs(Route, { element: _jsx(Layout, {}), children: [_jsx(Route, { path: "/", element: _jsx(RootEntry, {}) }), _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/change-password", element: _jsx(ChangePasswordPage, {}) }), _jsx(Route, { path: "/enter/:token", element: _jsx(ExamineeQrEntryPage, {}) }), _jsxs(Route, { element: _jsx(RequireEvaluator, {}), children: [_jsx(Route, { path: "/evaluation/live", element: _jsx(AdminLiveMonitorPage, {}) }), _jsx(Route, { path: "/evaluation/:examId", element: _jsx(EvaluationSessionPage, {}) })] }), _jsx(Route, { element: _jsx(RequireCommittee, {}), children: _jsx(Route, { path: "/committees", element: _jsx(CommitteesPage, {}) }) }), _jsxs(Route, { element: _jsx(RequireStaff, {}), children: [_jsx(Route, { path: "/admin", element: _jsx(StaffExamsRoute, {}) }), _jsx(Route, { path: "/admin/security", element: _jsx(AdminSecurityReviewPage, {}) }), _jsx(Route, { path: "/admin/briefing", element: _jsx(LeadershipBriefingPage, {}) }), _jsx(Route, { path: "/admin/create", element: _jsx(StaffCreateRoute, {}) }), _jsx(Route, { path: "/admin/complete-questions/:examId", element: _jsx(CompleteExamQuestionsPage, {}) }), _jsx(Route, { path: "/admin/roster/:examId", element: _jsx(AdminExamRosterPage, {}) }), _jsx(Route, { path: "/admin/results/:examId", element: _jsx(AdminResultsPage, {}) }), _jsx(Route, { path: "/admin/enter/:examId", element: _jsx(AdminEnterResultsPage, {}) }), _jsx(Route, { path: "/admin/oral/:examId", element: _jsx(AdminOralEvaluationPage, {}) }), _jsx(Route, { path: "/admin/candidates/:examId", element: _jsx(AdminCandidatePickerPage, {}) }), _jsx(Route, { path: "/admin/examinees", element: _jsx(AdminExamineesPage, {}) }), _jsx(Route, { path: "/admin/applicants", element: _jsx(AdminApplicantsPage, {}) }), _jsx(Route, { path: "/admin/corrections", element: _jsx(AdminCorrectionsPage, {}) }), _jsx(Route, { path: "/admin/passwords", element: _jsx(AdminPasswordManagementPage, {}) }), _jsx(Route, { path: "/admin/examinees/:name", element: _jsx(AdminExamineeDetailPage, {}) }), _jsx(Route, { path: "/admin/oral-archive", element: _jsx(AdminOralArchivePage, {}) }), _jsx(Route, { path: "/admin/assessment-archive", element: _jsx(AdminOralArchivePage, {}) }), _jsx(Route, { path: "/admin/live", element: _jsx(AdminLiveMonitorPage, {}) }), _jsx(Route, { path: "/banks", element: _jsx(BanksPage, {}) })] }), _jsx(Route, { element: _jsx(RequireExaminee, {}), children: _jsx(Route, { path: "/take", element: _jsx(ExamineeExamPage, {}) }) }), _jsx(Route, { path: "/create", element: _jsx(Navigate, { to: "/admin/create", replace: true }) }), _jsx(Route, { path: "/history", element: _jsx(Navigate, { to: "/admin", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) }) }) }) }) }));
}
