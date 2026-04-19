import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Home, LogOut } from 'lucide-react';
import '../styles/error-pages.css';

function safeParseUser(rawValue) {
  try {
    const parsed = JSON.parse(rawValue || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('user_role') || 'USER';
  const currentUser = safeParseUser(localStorage.getItem('learn_lite_user'));

  useEffect(() => {
    console.warn(`⚠️ UNAUTHORIZED ACCESS ATTEMPT: User (${currentUser.username} - ${userRole}) tried to access restricted admin area.`);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('learn_lite_token');
    localStorage.removeItem('learn_lite_user');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_role');
    window.dispatchEvent(new Event('learnlite-auth-changed'));
    navigate('/login');
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const roleRights = {
    SYSTEM_OWNER: { dashboard: '/dashboard/system-owner', name: 'Control Tower' },
    FINANCE_CONTROLLER: { dashboard: '/dashboard/finance-controller', name: 'Finance Dashboard' },
    ACADEMIC_REGISTRAR: { dashboard: '/dashboard/academic-registrar', name: 'Academic Dashboard' },
    OPS_MODERATOR: { dashboard: '/dashboard/ops-moderator', name: 'Operations Dashboard' },
    SOCIAL_MEDIA_CONTROLLER: { dashboard: '/dashboard/social-media-controller', name: 'Social Media Dashboard' },
    USER: { dashboard: null, name: 'User Portal' }
  };

  const userInfo = roleRights[userRole] || roleRights.USER;

  return (
    <div className="error-page">
      <motion.div
        className="error-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Icon */}
        <motion.div
          className="error-icon"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <AlertCircle size={64} color="#EF4444" />
        </motion.div>

        {/* Content */}
        <h1 className="error-title">Access Denied</h1>
        <p className="error-subtitle">
          You don't have permission to access this area.
        </p>

        {/* User Info */}
        <motion.div className="user-access-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <p>
            <strong>Your Role:</strong> <span style={{ color: '#3B82F6' }}>{userRole}</span>
          </p>
          <p>
            <strong>Username:</strong> <span>{currentUser.username || 'Unknown'}</span>
          </p>
        </motion.div>

        {/* Allowed Access */}
        {userInfo.dashboard && (
          <motion.div className="allowed-access" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <p>You have access to:</p>
            <button className="access-link" onClick={() => navigate(userInfo.dashboard)}>
              → {userInfo.name}
            </button>
          </motion.div>
        )}

        {/* Actions */}
        <div className="error-actions">
          <motion.button
            className="btn btn-primary"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} />
            Go Back
          </motion.button>

          <motion.button
            className="btn btn-secondary"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleGoHome}
          >
            <Home size={16} />
            Home
          </motion.button>

          <motion.button
            className="btn btn-danger"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleLogout}
          >
            <LogOut size={16} />
            Logout
          </motion.button>
        </div>

        {/* Security Notice */}
        <motion.p
          className="security-notice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          This incident has been logged. Unauthorized access attempts are monitored.
        </motion.p>
      </motion.div>
    </div>
  );
}
