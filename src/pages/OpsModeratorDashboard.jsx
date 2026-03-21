import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, getApiErrorMessage } from '../services/api';

export default function OpsModeratorDashboard() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('learn_lite_user') || '{}');
  const role = localStorage.getItem('user_role') || currentUser?.role || 'USER';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workplace, setWorkplace] = useState({
    totalUsers: 0,
    activeUsers: 0,
    disabledUsers: 0,
    recentUsers: []
  });

  useEffect(() => {
    if (!['OPS_MODERATOR', 'SYSTEM_OWNER'].includes(role)) {
      navigate('/');
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await adminAPI.getOpsWorkplace();
        setWorkplace(res.workplace || {
          totalUsers: 0,
          activeUsers: 0,
          disabledUsers: 0,
          recentUsers: []
        });
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load ops workplace'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, role]);

  if (loading) return <div className="container"><p className="muted">Loading operations workplace...</p></div>;

  return (
    <div className="container" style={{ display: 'grid', gap: 16 }}>
      <div className="hero-card">
        <h1 style={{ margin: 0 }}>Operations Moderator Workplace</h1>
        <p className="muted">User activity and account state oversight.</p>
        {error && <p style={{ color: '#ef4444' }}>{error}</p>}
        <p>
          Total Users: <strong>{workplace.totalUsers}</strong> | Active: <strong>{workplace.activeUsers}</strong> | Disabled: <strong>{workplace.disabledUsers}</strong>
        </p>
      </div>

      <div className="hero-card" style={{ overflowX: 'auto' }}>
        <h3>Recent Users</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Username</th>
              <th style={{ textAlign: 'left' }}>Email</th>
              <th style={{ textAlign: 'left' }}>Role</th>
              <th style={{ textAlign: 'left' }}>Active</th>
              <th style={{ textAlign: 'left' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {(workplace.recentUsers || []).map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.isActive ? 'Yes' : 'No'}</td>
                <td>{new Date(user.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
