import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import axios from 'axios';

export default function AdminDashboard() {
  const { theme } = useApp();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingFuel, setAddingFuel] = useState({});

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('learn_lite_token');
      
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await axios.get(
        'http://localhost:4000/api/admin/users',
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setUsers(response.data.users);
        console.log(`✅ Loaded ${response.data.count} users`);
      } else {
        setError(response.data.error || 'Failed to load users');
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      const errorMsg = err.response?.data?.error || 'Failed to load users';
      setError(errorMsg);
      
      if (err.response?.status === 403) {
        setTimeout(() => navigate('/'), 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddFuel = async (userId, username) => {
    try {
      setAddingFuel((prev) => ({ ...prev, [userId]: true }));
      const token = localStorage.getItem('learn_lite_token');

      const response = await axios.post(
        `http://localhost:4000/api/admin/users/${userId}/add-fuel`,
        {},
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        console.log(`✅ Added 50 fuel to ${username}`);
        // Update the user in the list
        setUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === userId ? { ...u, fuelBalance: response.data.user.fuelBalance } : u
          )
        );
      } else {
        setError(`Failed to add fuel: ${response.data.error}`);
      }
    } catch (err) {
      console.error('Add fuel error:', err);
      setError(err.response?.data?.error || 'Failed to add fuel');
    } finally {
      setAddingFuel((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text)',
    minHeight: '100vh'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(255,255,255,0.1)'
  };

  const buttonStyle = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--accent)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'opacity 0.2s'
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'var(--glass-1)',
    borderRadius: '8px',
    overflow: 'hidden'
  };

  const thStyle = {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '700',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    backgroundColor: 'var(--glass-2)'
  };

  const tdStyle = {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontSize: '14px'
  };

  const fuelBadgeStyle = {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '20px',
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
    color: '#ffc107',
    fontSize: '13px',
    fontWeight: '600'
  };

  const addFuelButtonStyle = {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    color: '#4caf50',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    transition: 'all 0.2s',
    border: '1px solid #4caf50'
  };

  const errorStyle = {
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 23, 68, 0.1)',
    border: '1px solid rgba(255, 23, 68, 0.5)',
    color: '#ff1744',
    marginBottom: '16px'
  };

  const loadingStyle = {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--text-muted)'
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '28px' }}>🔧 Admin Dashboard</h1>
          <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
            Manage users and fuel balance
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          style={{
            ...buttonStyle,
            backgroundColor: 'rgba(100, 100, 100, 0.5)'
          }}
          onMouseOver={(e) => (e.target.style.opacity = '0.8')}
          onMouseOut={(e) => (e.target.style.opacity = '1')}
        >
          ← Back to Home
        </button>
      </div>

      {/* Error Message */}
      {error && <div style={errorStyle}>{error}</div>}

      {/* Loading State */}
      {loading && <div style={loadingStyle}>Loading users...</div>}

      {/* Users Table */}
      {!loading && users.length > 0 && (
        <div>
          <p className="muted" style={{ marginBottom: '12px' }}>
            Total Users: <strong>{users.length}</strong>
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Username</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Fuel Balance</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td style={tdStyle}>
                    <code style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {user.id}
                    </code>
                  </td>
                  <td style={tdStyle}>
                    <strong>{user.username}</strong>
                  </td>
                  <td style={tdStyle}>
                    <code style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {user.email}
                    </code>
                  </td>
                  <td style={tdStyle}>
                    <div style={fuelBadgeStyle}>{user.fuelBalance} ⛽</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleAddFuel(user.id, user.username)}
                      disabled={addingFuel[user.id]}
                      style={{
                        ...addFuelButtonStyle,
                        opacity: addingFuel[user.id] ? 0.6 : 1,
                        cursor: addingFuel[user.id] ? 'not-allowed' : 'pointer'
                      }}
                      onMouseOver={(e) => {
                        if (!addingFuel[user.id]) {
                          e.target.style.backgroundColor = 'rgba(76, 175, 80, 0.3)';
                        }
                      }}
                      onMouseOut={(e) => {
                        e.target.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
                      }}
                    >
                      {addingFuel[user.id] ? 'Adding...' : '+50 Fuel'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {!loading && users.length === 0 && (
        <div style={loadingStyle}>
          <p>No users found</p>
        </div>
      )}

      {/* Refresh Button */}
      {!loading && (
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            onClick={fetchUsers}
            style={{
              ...buttonStyle,
              backgroundColor: 'rgba(100, 150, 200, 0.5)'
            }}
            onMouseOver={(e) => (e.target.style.opacity = '0.8')}
            onMouseOut={(e) => (e.target.style.opacity = '1')}
          >
            🔄 Refresh Users
          </button>
        </div>
      )}
    </div>
  );
}
