import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, getApiErrorMessage } from '../services/api';

export default function FinanceControllerDashboard() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('learn_lite_user') || '{}');
  const role = localStorage.getItem('user_role') || currentUser?.role || 'USER';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workplace, setWorkplace] = useState({ totalRevenue: 0, payments: [], expiringSubscriptions: [], expiringSoonCount: 0 });

  useEffect(() => {
    if (!['FINANCE_CONTROLLER', 'SYSTEM_OWNER'].includes(role)) {
      navigate('/');
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await adminAPI.getFinanceWorkplace();
        setWorkplace(res.workplace || { totalRevenue: 0, payments: [], expiringSubscriptions: [], expiringSoonCount: 0 });
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load finance workplace'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, role]);

  if (loading) return <div className="container"><p className="muted">Loading finance workplace...</p></div>;

  return (
    <div className="container" style={{ display: 'grid', gap: 16 }}>
      <div className="hero-card">
        <h1 style={{ margin: 0 }}>Finance Controller Workplace</h1>
        <p className="muted">Revenue tracking and payment records.</p>
        {error && <p style={{ color: '#ef4444' }}>{error}</p>}
        <h2>Total Revenue: {Number(workplace.totalRevenue || 0).toLocaleString()}</h2>
      </div>

      <div className="hero-card" style={{ border: '1px solid rgba(239, 68, 68, 0.35)' }}>
        <h3 style={{ marginTop: 0 }}>Financial Alert System</h3>
        <p className="muted" style={{ marginTop: 0 }}>Students with subscriptions expiring in 3 days or less.</p>
        <h2 style={{ marginTop: 8, color: workplace.expiringSoonCount > 0 ? '#ef4444' : 'var(--text)' }}>
          {Number(workplace.expiringSoonCount || 0)} expiring soon
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Student</th>
                <th style={{ textAlign: 'left' }}>Email</th>
                <th style={{ textAlign: 'left' }}>Days Left</th>
                <th style={{ textAlign: 'left' }}>Expiry Date</th>
                <th style={{ textAlign: 'left' }}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {(workplace.expiringSubscriptions || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: '10px 0' }}>No expiring subscriptions in the next 3 days.</td>
                </tr>
              ) : (
                (workplace.expiringSubscriptions || []).map((item) => (
                  <tr key={`${item.userId}-${item.paymentReference}`}>
                    <td>{item.username}</td>
                    <td>{item.email}</td>
                    <td style={{ color: item.daysRemaining <= 1 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>{item.daysRemaining}</td>
                    <td>{new Date(item.expiryDate).toLocaleDateString()}</td>
                    <td>{item.paymentReference}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hero-card" style={{ overflowX: 'auto' }}>
        <h3>Recent Payments</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Reference</th>
              <th style={{ textAlign: 'left' }}>Amount</th>
              <th style={{ textAlign: 'left' }}>Fuel Added</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th style={{ textAlign: 'left' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {(workplace.payments || []).map((payment) => (
              <tr key={payment.reference}>
                <td>{payment.reference}</td>
                <td>{payment.amount}</td>
                <td>{payment.fuelAdded}</td>
                <td>{payment.status}</td>
                <td>{new Date(payment.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
