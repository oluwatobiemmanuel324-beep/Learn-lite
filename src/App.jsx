import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import QuizGenerator from './pages/QuizGenerator';
import VideoGenerator from './pages/VideoGenerator';
import AdminDashboard from './pages/AdminDashboard';
import SystemOwnerDashboard from './pages/SystemOwnerDashboard';
import FinanceControllerDashboard from './pages/FinanceControllerDashboard';
import AcademicRegistrarDashboard from './pages/AcademicRegistrarDashboard';
import OpsModeratorDashboard from './pages/OpsModeratorDashboard';
import SocialMediaControllerDashboard from './pages/SocialMediaControllerDashboard';
import AuthDebug from './components/AuthDebug';
import { authAPI } from './services/api';
import './styles/global.css';

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

    window.addEventListener('storage', onAuthChanged);
    window.addEventListener('learnlite-auth-changed', onAuthChanged);

    return () => {
      window.removeEventListener('storage', onAuthChanged);
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
      ADMIN: '/dashboard/root-admin',
      FINANCE_CONTROLLER: '/dashboard/finance-controller',
      ACADEMIC_REGISTRAR: '/dashboard/academic-registrar',
      OPS_MODERATOR: '/dashboard/ops-moderator',
      SOCIAL_MEDIA_CONTROLLER: '/dashboard/social-media-controller'
    };

    const target = rolePathMap[role] || '/';
    return <Navigate to={target} replace />;
  };

  const RoleProtectedRoute = ({ allowedRoles, children }) => {
    const hasToken = Boolean(localStorage.getItem('learn_lite_token'));
    if (!isAuthenticated && !hasToken) {
      return <Navigate to="/login" replace />;
    }

    const role = currentRole || localStorage.getItem('user_role') || 'USER';
    if (role === 'SYSTEM_OWNER') {
      return children;
    }

    if (!allowedRoles.includes(role)) {
      return <Navigate to="/admin" replace />;
    }

    return children;
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
      <Route path="/generate-video" element={<VideoGenerator />} />
      <Route path="/admin" element={<AdminRouteRedirect />} />

      <Route
        path="/dashboard/system-owner"
        element={(
          <RoleProtectedRoute allowedRoles={['SYSTEM_OWNER']}>
            <SystemOwnerDashboard />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/dashboard/root-admin"
        element={(
          <RoleProtectedRoute allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN', 'ADMIN']}>
            <AdminDashboard pageTitle="Root Admin Dashboard" allowedRoles={['SYSTEM_OWNER', 'ROOT_ADMIN', 'ADMIN']} />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/dashboard/finance-controller"
        element={(
          <RoleProtectedRoute allowedRoles={['SYSTEM_OWNER', 'FINANCE_CONTROLLER']}>
            <FinanceControllerDashboard />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/dashboard/academic-registrar"
        element={(
          <RoleProtectedRoute allowedRoles={['SYSTEM_OWNER', 'ACADEMIC_REGISTRAR']}>
            <AcademicRegistrarDashboard />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/dashboard/ops-moderator"
        element={(
          <RoleProtectedRoute allowedRoles={['SYSTEM_OWNER', 'OPS_MODERATOR']}>
            <OpsModeratorDashboard />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/dashboard/social-media-controller"
        element={(
          <RoleProtectedRoute allowedRoles={['SYSTEM_OWNER', 'SOCIAL_MEDIA_CONTROLLER']}>
            <SocialMediaControllerDashboard />
          </RoleProtectedRoute>
        )}
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
        <AppRoutes />
        <AuthDebug />
      </Router>
    </AppProvider>
  );
}
