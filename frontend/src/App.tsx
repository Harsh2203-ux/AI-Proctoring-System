import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';

import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { FaceEnrolmentPage } from './pages/student/FaceEnrolmentPage';
import { ReadinessCheckPage } from './pages/student/ReadinessCheckPage';
import { ExamPage } from './pages/student/ExamPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { ExamsPage } from './pages/admin/ExamsPage';
import { ExamDetailPage } from './pages/admin/ExamDetailPage';
import { StudentsPage } from './pages/admin/StudentsPage';
import { SessionsPage } from './pages/admin/SessionsPage';
import { ViolationsPage } from './pages/admin/ViolationsPage';
import { DisqualificationsPage } from './pages/admin/DisqualificationsPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { SessionDetailPage } from './pages/admin/SessionDetailPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode; role?: string }> = ({ children, role }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role && user?.role !== role) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' },
          error: { style: { background: '#450a0a', border: '1px solid #b91c1c', color: '#fca5a5' } },
          success: { style: { background: '#052e16', border: '1px solid #15803d', color: '#86efac' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Student routes */}
        <Route path="/student/dashboard" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
        <Route path="/student/enrol-face" element={<ProtectedRoute role="student"><FaceEnrolmentPage /></ProtectedRoute>} />
        <Route path="/student/exam/:examId/ready" element={<ProtectedRoute role="student"><ReadinessCheckPage /></ProtectedRoute>} />
        <Route path="/student/exam/:examId/take" element={<ProtectedRoute role="student"><ExamPage /></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><DashboardPage /></ProtectedRoute>} />
        <Route path="/admin/exams" element={<ProtectedRoute role="admin"><ExamsPage /></ProtectedRoute>} />
        <Route path="/admin/exams/:examId" element={<ProtectedRoute role="admin"><ExamDetailPage /></ProtectedRoute>} />
        <Route path="/admin/students" element={<ProtectedRoute role="admin"><StudentsPage /></ProtectedRoute>} />
        <Route path="/admin/sessions" element={<ProtectedRoute role="admin"><SessionsPage /></ProtectedRoute>} />
        <Route path="/admin/sessions/:sessionId" element={<ProtectedRoute role="admin"><SessionDetailPage /></ProtectedRoute>} />
        <Route path="/admin/violations" element={<ProtectedRoute role="admin"><ViolationsPage /></ProtectedRoute>} />
        <Route path="/admin/disqualifications" element={<ProtectedRoute role="admin"><DisqualificationsPage /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute role="admin"><ReportsPage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute role="admin"><SettingsPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
