import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import QuizGenerator from './pages/QuizGenerator';
import VideoGenerator from './pages/VideoGenerator';
import SoloStudyPage from './pages/SoloStudyPage';
import AdminDashboard from './pages/AdminDashboard';
import RootAdminDashboard from './pages/RootAdminDashboard';
import SystemOwnerDashboard from './pages/SystemOwnerDashboard';
import FinanceControllerDashboard from './pages/FinanceControllerDashboard';
import AcademicRegistrarDashboard from './pages/AcademicRegistrarDashboard';
import OpsModeratorDashboard from './pages/OpsModeratorDashboard';
import OpsActiveUsersLogins from './pages/dashboard/OpsActiveUsersLogins';
import SocialMediaControllerDashboard from './pages/SocialMediaControllerDashboard';
import AuthDebug from './components/AuthDebug';
import AppErrorBoundary from './components/AppErrorBoundary';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import UnauthorizedPage from './pages/UnauthorizedPage';
import { authAPI } from './services/api';
import './styles/global.css';

function safeParseUser(rawValue) {
  try {
    const parsed = JSON.parse(rawValue || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// ========================================
// APP ROUTES WITH TOKEN VERIFICATION
// ========================================

function AppRoutes() {
  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentRole, setCurrentRole] = useState(localStorage.getItem('user_role') || 'USER');

  const syncAuthFromStorage = () => {
    const token = localStorage.getItem('learn_lite_token');
    const role = localStorage.getItem('user_role') || 'USER';
    setIsAuthenticated(Boolean(token));
    setCurrentRole(role);
  };

  useEffect(() => {
    // Check if token exists and verify it
    const verifyToken = async () => {
      const token = localStorage.getItem('learn_lite_token');
      
      if (!token) {
        setIsVerifying(false);
        return;
      }

      try {
        // Verify token is still valid
        const response = await authAPI.verify();
        if (response.success && response.user) {
          setIsAuthenticated(true);
          localStorage.setItem('learn_lite_user', JSON.stringify(response.user));
          localStorage.setItem('user_id', String(response.user.id));
          localStorage.setItem('user_role', response.user.role || 'USER');
          setCurrentRole(response.user.role || 'USER');
          console.log('✅ Token verified, user authenticated:', response.user.username);
        } else {
          throw new Error('Invalid verification response');
        }
      } catch (error) {
        console.warn('❌ Token verification failed:', error.response?.data?.error || error.message);
        console.warn('Error code:', error.response?.data?.code);
        
        // Clear invalid token
        localStorage.removeItem('learn_lite_token');
        localStorage.removeItem('learn_lite_user');
        localStorage.removeItem('user_id');
        localStorage.removeItem('user_role');
        setIsAuthenticated(false);
        setCurrentRole('USER');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();

    const onAuthChanged = () => {
      syncAuthFromStorage();
    };

    const onStorage = (event) => {
      // Ignore unrelated localStorage writes (theme/sidebar/profile) from other tabs.
      if (!event || !event.key) {
        return;
      }

      const authKeys = new Set(['learn_lite_token', 'learn_lite_user', 'user_id', 'user_role']);
      if (!authKeys.has(event.key)) {
        return;
      }

      syncAuthFromStorage();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('learnlite-auth-changed', onAuthChanged);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('learnlite-auth-changed', onAuthChanged);
    };
  }, []);

  // Show loading state while verifying
  if (isVerifying) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '100px' }}>
        <div className="hero-card" style={{ maxWidth: '400px', margin: '0 auto', padding: '40px' }}>
          <div className="logo" style={{ width: '64px', height: '64px', margin: '0 auto 16px', fontSize: '20px', overflow: 'hidden' }}>
            <img
              src="/app-icon.png"
              alt="Learn Lite logo"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <p className="muted">Verifying session...</p>
        </div>
      </div>
    );
  }

  const AdminRouteRedirect = () => {
    const hasToken = Boolean(localStorage.getItem('learn_lite_token'));
    if (!isAuthenticated && !hasToken) {
      return <Navigate to="/login" replace />;
    }

    const role = currentRole || localStorage.getItem('user_role') || 'USER';

    const rolePathMap = {
      SYSTEM_OWNER: '/dashboard/system-owner',
      ROOT_ADMIN: '/dashboard/root-admin',
      ADMIN: '/admin/unauthorized',
      FINANCE_CONTROLLER: '/dashboard/finance-controller',
      ACADEMIC_REGISTRAR: '/dashboard/academic-registrar',
      OPS_MODERATOR: '/dashboard/ops-moderator',
      SOCIAL_MEDIA_CONTROLLER: '/dashboard/social-media-controller'
    };

    const target = rolePathMap[role] || '/';
    return <Navigate to={target} replace />;
  };

  const PublicOnlyRoute = ({ children }) => {
    if (isAuthenticated) {
      return <Navigate to="/admin" replace />;
    }
    return children;
  };

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/login"
        element={(
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        )}
      />
      <Route
        path="/signup"
        element={(
          <PublicOnlyRoute>
            <Signup />
          </PublicOnlyRoute>
        )}
      />
      <Route path="/generate-quiz" element={<QuizGenerator />} />
      <Route path="/generate-quiz/:id" element={<QuizGenerator />} />
      <Route path="/solo-study" element={<SoloStudyPage />} />
      <Route path="/generate-video" element={<VideoGenerator />} />
      <Route path="/admin" element={<AdminRouteRedirect />} />
      <Route path="/admin/unauthorized" element={<UnauthorizedPage />} />

      <Route
        path="/dashboard/system-owner"
        element={(
          <ProtectedAdminRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN']}>
            <SystemOwnerDashboard />
          </ProtectedAdminRoute>
        )}
      />
      <Route
        path="/dashboard/root-admin"
        element={(
          <ProtectedAdminRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN']}>
            <RootAdminDashboard />
          </ProtectedAdminRoute>
        )}
      />
      <Route
        path="/admin/users/:userId"
        element={(
          <ProtectedAdminRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN']}>
            <AdminDashboard pageTitle="Mission Control" allowedRoles={['SYSTEM_OWNER']} />
          </ProtectedAdminRoute>
        )}
      />
      <Route
        path="/dashboard/finance-controller"
        element={(
          <ProtectedAdminRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN', 'FINANCE_CONTROLLER']}>
            <FinanceControllerDashboard />
          </ProtectedAdminRoute>
        )}
      />
      <Route
        path="/dashboard/academic-registrar"
        element={(
          <ProtectedAdminRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN', 'ACADEMIC_REGISTRAR']}>
            <AcademicRegistrarDashboard />
          </ProtectedAdminRoute>
        )}
      />
      <Route
        path="/dashboard/ops-moderator"
        element={(
          <ProtectedAdminRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN', 'OPS_MODERATOR']}>
            <OpsModeratorDashboard />
          </ProtectedAdminRoute>
        )}
      />
      <Route
        path="/dashboard/ops-moderator/active-users"
        element={(
          <ProtectedAdminRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN', 'OPS_MODERATOR']}>
            <OpsActiveUsersLogins />
          </ProtectedAdminRoute>
        )}
      />
      <Route
        path="/dashboard/social-media-controller"
        element={(
          <ProtectedAdminRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN', 'SOCIAL_MEDIA_CONTROLLER']}>
            <SocialMediaControllerDashboard />
          </ProtectedAdminRoute>
        )}
      />

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/admin' : '/'} replace />}
      />
    </Routes>
  );
}

// ========================================
// MAIN APP WITH ROUTER
// Complete 1:1 migration wrapping with AppProvider
// ========================================

export default function App() {
  return (
    <AppProvider>
      <Router>
        <AppErrorBoundary>
          <AppRoutes />
          {import.meta.env.DEV ? <AuthDebug /> : null}
        </AppErrorBoundary>
      </Router>
    </AppProvider>
  );
}
