import { lazy, Suspense } from 'react'
import type { ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { RequireExaminee, RequireStaff, RequireCommittee, RequireEvaluator } from './auth/RequireAuth'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { Layout } from './components/Layout'
import { ThemeProvider } from './theme/ThemeContext'

const page = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await loader())[name] as ComponentType }))
const EvaluationSessionPage = page(() => import('./pages/EvaluationSessionPage'), 'EvaluationSessionPage')
const CommitteesPage = page(() => import('./pages/CommitteesPage'), 'CommitteesPage')
const AdminApplicantsPage = page(() => import('./pages/AdminApplicantsPage'), 'AdminApplicantsPage')
const AdminCorrectionsPage = page(() => import('./pages/AdminCorrectionsPage'), 'AdminCorrectionsPage')
const AdminCreateExamPage = page(() => import('./pages/AdminCreateExamPage'), 'AdminCreateExamPage')
const CompleteExamQuestionsPage = page(() => import('./pages/CompleteExamQuestionsPage'), 'CompleteExamQuestionsPage')
const AdminEnterResultsPage = page(() => import('./pages/AdminEnterResultsPage'), 'AdminEnterResultsPage')
const AdminExamRosterPage = page(() => import('./pages/AdminExamRosterPage'), 'AdminExamRosterPage')
const AdminExamineeDetailPage = page(() => import('./pages/AdminExamineeDetailPage'), 'AdminExamineeDetailPage')
const AdminExamineesPage = page(() => import('./pages/AdminExamineesPage'), 'AdminExamineesPage')
const AdminExamsPage = page(() => import('./pages/AdminExamsPage'), 'AdminExamsPage')
const AdminLiveMonitorPage = page(() => import('./pages/AdminLiveMonitorPage'), 'AdminLiveMonitorPage')
const AdminOralArchivePage = page(() => import('./pages/AdminOralArchivePage'), 'AdminOralArchivePage')
const AdminOralEvaluationPage = page(() => import('./pages/AdminOralEvaluationPage'), 'AdminOralEvaluationPage')
const AdminCandidatePickerPage = page(() => import('./pages/AdminCandidatePickerPage'), 'AdminCandidatePickerPage')
const AdminResultsPage = page(() => import('./pages/AdminResultsPage'), 'AdminResultsPage')
const BanksPage = page(() => import('./pages/BanksPage'), 'BanksPage')
const ExamineeExamPage = page(() => import('./pages/ExamineeExamPage'), 'ExamineeExamPage')
const ExamineeQrEntryPage = page(() => import('./pages/ExamineeQrEntryPage'), 'ExamineeQrEntryPage')
const HomePage = page(() => import('./pages/HomePage'), 'HomePage')
const LoginPage = page(() => import('./pages/LoginPage'), 'LoginPage')
const ChangePasswordPage = page(() => import('./pages/ChangePasswordPage'), 'ChangePasswordPage')
const AdminPasswordManagementPage = page(() => import('./pages/AdminPasswordManagementPage'), 'AdminPasswordManagementPage')

const AdminSecurityReviewPage = page(() => import('./pages/AdminSecurityReviewPage'), 'AdminSecurityReviewPage')
const LeadershipBriefingPage = page(() => import('./pages/LeadershipBriefingPage'), 'LeadershipBriefingPage')

function RootEntry() {
  const { user } = useAuth()
  if (user?.role?.startsWith('committee_')) return <Navigate to="/committees" replace />
  if (user?.role === 'commander') return <Navigate to="/admin/briefing" replace />
  if (user?.role === 'operator' && user.category === 'security') return <Navigate to="/admin/security" replace />
  if (user?.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user.category || '')) {
    return <Navigate to="/committees" replace />
  }
  if (user?.role === 'admin' || user?.role === 'operator') {
    return <Navigate to="/admin" replace />
  }
  if (user?.role === 'examinee') {
    return <Navigate to="/take" replace />
  }
  return <HomePage />
}

function StaffExamsRoute() {
  const { user } = useAuth()
  if (user?.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user.category || '')) {
    return <Navigate to="/committees" replace />
  }
  return <AdminExamsPage />
}

function StaffCreateRoute() {
  const { user } = useAuth()
  if (user?.role === 'operator') return <Navigate to="/committees" replace />
  return <AdminCreateExamPage />
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="p-8 text-center text-mute">جارٍ تحميل الصفحة…</div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<RootEntry />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/enter/:token" element={<ExamineeQrEntryPage />} />
              <Route element={<RequireEvaluator />}>
                <Route path="/evaluation/live" element={<AdminLiveMonitorPage />} />
                <Route path="/evaluation/:examId" element={<EvaluationSessionPage />} />
              </Route>
              <Route element={<RequireCommittee />}>
                <Route path="/committees" element={<CommitteesPage />} />
              </Route>

              <Route element={<RequireStaff />}>
                <Route path="/admin" element={<StaffExamsRoute />} />
                <Route path="/admin/security" element={<AdminSecurityReviewPage />} />
                <Route path="/admin/briefing" element={<LeadershipBriefingPage />} />
                <Route path="/admin/create" element={<StaffCreateRoute />} />
                <Route path="/admin/complete-questions/:examId" element={<CompleteExamQuestionsPage />} />
                <Route path="/admin/roster/:examId" element={<AdminExamRosterPage />} />
                <Route path="/admin/results/:examId" element={<AdminResultsPage />} />
                <Route path="/admin/enter/:examId" element={<AdminEnterResultsPage />} />
                <Route path="/admin/oral/:examId" element={<AdminOralEvaluationPage />} />
                <Route path="/admin/candidates/:examId" element={<AdminCandidatePickerPage />} />
                <Route path="/admin/examinees" element={<AdminExamineesPage />} />
                <Route path="/admin/applicants" element={<AdminApplicantsPage />} />
                <Route path="/admin/corrections" element={<AdminCorrectionsPage />} />
                <Route path="/admin/passwords" element={<AdminPasswordManagementPage />} />
                <Route path="/admin/examinees/:name" element={<AdminExamineeDetailPage />} />
                <Route path="/admin/oral-archive" element={<AdminOralArchivePage />} />
                <Route path="/admin/assessment-archive" element={<AdminOralArchivePage />} />
                <Route path="/admin/live" element={<AdminLiveMonitorPage />} />
                <Route path="/banks" element={<BanksPage />} />
              </Route>

              <Route element={<RequireExaminee />}>
                <Route path="/take" element={<ExamineeExamPage />} />
              </Route>

              <Route path="/create" element={<Navigate to="/admin/create" replace />} />
              <Route path="/history" element={<Navigate to="/admin" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}
