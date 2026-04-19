import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Hard-gating route guard for admin dashboards.
 * Strictly enforces role-based access control.
 * 
 * Usage:
 * <ProtectedAdminRoute 
 *   allowedRoles={['SYSTEM_OWNER', 'FINANCE_CONTROLLER']} 
 *   children={<FinanceControllerDashboard />}
 * />
 */
export default function ProtectedAdminRoute({ allowedRoles, children, role }) {
  // Get user role from localStorage
  const userRole = role || localStorage.getItem('user_role') || 'USER';
  const token = localStorage.getItem('learn_lite_token');

  // Hard-gate 1: No token = not authenticated
  if (!token) {
    console.warn('🚨 ACCESS DENIED: No authentication token found. Redirecting to login.');
    return <Navigate to="/login" replace />;
  }

  // Hard-gate 2: SYSTEM_OWNER always has access (superuser exception)
  if (userRole === 'SYSTEM_OWNER' && allowedRoles.includes('SYSTEM_OWNER')) {
    return children;
  }

  // Hard-gate 3: Check if role is in allowedRoles array
  if (!allowedRoles.includes(userRole)) {
    console.warn(`🚨 ACCESS DENIED: Role '${userRole}' not in allowed roles: ${allowedRoles.join(', ')}. Redirecting to unauthorized.`);
    return <Navigate to="/admin/unauthorized" replace />;
  }

  // All checks passed - render the protected component
  return children;
}
