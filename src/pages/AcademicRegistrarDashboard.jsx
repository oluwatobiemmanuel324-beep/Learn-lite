import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, getApiErrorMessage } from '../services/api';

export default function AcademicRegistrarDashboard() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('learn_lite_user') || '{}');
  const role = localStorage.getItem('user_role') || currentUser?.role || 'USER';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workplace, setWorkplace] = useState({ groups: [], quizBackups: 0 });

  useEffect(() => {
    if (!['ACADEMIC_REGISTRAR', 'SYSTEM_OWNER'].includes(role)) {
      navigate('/');
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await adminAPI.getAcademicWorkplace();
        setWorkplace(res.workplace || { groups: [], quizBackups: 0 });
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load academic workplace'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, role]);

  if (loading) return <div className="container"><p className="muted">Loading academic workplace...</p></div>;

  return (
    <div className="container" style={{ display: 'grid', gap: 16 }}>
      <div className="hero-card">
        <h1 style={{ margin: 0 }}>Academic Registrar Workplace</h1>
        <p className="muted">Class group oversight and quiz content health.</p>
        {error && <p style={{ color: '#ef4444' }}>{error}</p>}
        <h2>Quiz Backups: {Number(workplace.quizBackups || 0).toLocaleString()}</h2>
      </div>

      <div className="hero-card" style={{ overflowX: 'auto' }}>
        <h3>Recent Groups</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Join Code</th>
              <th style={{ textAlign: 'left' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {(workplace.groups || []).map((group) => (
              <tr key={group.id}>
                <td>{group.name}</td>
                <td>{group.joinCode}</td>
                <td>{new Date(group.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
