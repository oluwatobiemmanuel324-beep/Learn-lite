import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VideoGenerator from './pages/VideoGenerator';
import AdminDashboard from './pages/AdminDashboard';
import { authAPI } from './services/api';
import './styles/global.css';

// ========================================
// APP ROUTES WITH TOKEN VERIFICATION
// ========================================

function AppRoutes() {
  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
          console.log('✅ Token verified, user authenticated:', response.user.username);
        } else {
          throw new Error('Invalid verification response');
        }
      } catch (error) {
        console.warn('❌ Token verification failed:', error.response?.data?.error || error.message);
        console.warn('Error code:', error.response?.data?.code);
        
        // Clear invalid token
        localStorage.removeItem('learn_lite_token');
        setIsAuthenticated(false);
        
        // Redirect to login if token verification fails
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
          window.location.href = '/login';
        }
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, []);

  // Show loading state while verifying
  if (isVerifying) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '100px' }}>
        <div className="hero-card" style={{ maxWidth: '400px', margin: '0 auto', padding: '40px' }}>
          <div className="logo" style={{ width: '64px', height: '64px', margin: '0 auto 16px', fontSize: '20px' }}>
            LL
          </div>
          <p className="muted">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/generate-video" element={<VideoGenerator />} />
      <Route path="/admin" element={<AdminDashboard />} />
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
      </Router>
    </AppProvider>
  );
}
