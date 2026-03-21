import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { adminAPI, getApiErrorMessage } from '../services/api';

function roleLabel(role) {
  if (role === 'ADMIN') return 'ROOT_ADMIN';
  return role || 'USER';
}

export default function AdminDashboard({ pageTitle = 'Staff Dashboard', allowedRoles = null }) {
  const { theme } = useApp();
  const navigate = useNavigate();

  const currentUser = JSON.parse(localStorage.getItem('learn_lite_user') || '{}');
  const currentRole = localStorage.getItem('user_role') || currentUser?.role || 'USER';

  const isSystemOwner = currentRole === 'SYSTEM_OWNER';
  const isRootAdmin = currentRole === 'ROOT_ADMIN' || currentRole === 'ADMIN';
  const isFinanceController = currentRole === 'FINANCE_CONTROLLER';
  const isAcademicRegistrar = currentRole === 'ACADEMIC_REGISTRAR';
  const isOpsModerator = currentRole === 'OPS_MODERATOR';

  const hasStaffDashboardRole =
    isSystemOwner || isRootAdmin || isFinanceController || isAcademicRegistrar || isOpsModerator;

  const normalizedAllowedRoles = (allowedRoles || []).map((role) => (role === 'ROOT_ADMIN' ? ['ROOT_ADMIN', 'ADMIN'] : [role])).flat();
  const isAllowedByRoute =
    !allowedRoles || normalizedAllowedRoles.length === 0 || normalizedAllowedRoles.includes(currentRole);

  const canAccessDashboard = hasStaffDashboardRole && isAllowedByRoute;

  const [users, setUsers] = useState([]);
  const [groupActivity, setGroupActivity] = useState([]);
  const [paymentLogs, setPaymentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingFuel, setAddingFuel] = useState({});

  const [staffForm, setStaffForm] = useState({
    email: '',
    username: '',
    password: '',
    role: 'FINANCE_CONTROLLER'
  });
  const [roleEmail, setRoleEmail] = useState('');
  const [roleToAssign, setRoleToAssign] = useState('ROOT_ADMIN');
  const [passwordResetEmail, setPasswordResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountStatusEmail, setAccountStatusEmail] = useState('');
  const [accountStatusValue, setAccountStatusValue] = useState('false');

  const [creatingStaff, setCreatingStaff] = useState(false);
  const [assigningRole, setAssigningRole] = useState(false);
  const [overwritingPassword, setOverwritingPassword] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  useEffect(() => {
    if (!canAccessDashboard) {
      setLoading(false);
      return;
    }
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      const requests = [];
      const map = {};

      if (isSystemOwner || isRootAdmin) {
        map.users = requests.length;
        requests.push(adminAPI.getUsers());
      }

      if (isSystemOwner || isRootAdmin || isAcademicRegistrar || isOpsModerator) {
        map.groups = requests.length;
        requests.push(adminAPI.getGroupActivity());
      }

      if (isSystemOwner || isFinanceController) {
        map.payments = requests.length;
        requests.push(adminAPI.getPaymentLogs());
      }

      const responses = await Promise.all(requests);

      if (map.users !== undefined) {
        setUsers(responses[map.users]?.users || []);
      }
      if (map.groups !== undefined) {
        setGroupActivity(responses[map.groups]?.activity || []);
      }
      if (map.payments !== undefined) {
        setPaymentLogs(responses[map.payments]?.payments || []);
      }
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to load staff dashboard data');
      setError(message);
      if (err.response?.status === 403) {
        setTimeout(() => navigate('/'), 1200);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddFuel = async (userId, username) => {
    try {
      setAddingFuel((prev) => ({ ...prev, [userId]: true }));
      const response = await adminAPI.addFuelToUser(userId);
      if (response.success) {
        setUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === userId ? { ...u, fuelBalance: response.user.fuelBalance } : u
          )
        );
      }
    } catch (err) {
      setError(getApiErrorMessage(err, `Failed to add fuel to ${username}`));
    } finally {
      setAddingFuel((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleCreateStaff = async (event) => {
    event.preventDefault();
    try {
      setCreatingStaff(true);
      setError('');
      const result = await adminAPI.createStaff(staffForm);
      alert(result.message || 'Staff account created');
      setStaffForm({ email: '', username: '', password: '', role: 'FINANCE_CONTROLLER' });
      await fetchDashboardData();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create staff account'));
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleAssignRole = async (event) => {
    event.preventDefault();
    try {
      setAssigningRole(true);
      setError('');
      const result = await adminAPI.assignRoleByEmail(roleEmail.trim(), roleToAssign);
      alert(result.message || 'Role assigned');
      setRoleEmail('');
      await fetchDashboardData();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to assign role'));
    } finally {
      setAssigningRole(false);
    }
  };

  const handleOverwritePassword = async (event) => {
    event.preventDefault();
    try {
      setOverwritingPassword(true);
      setError('');
      const result = await adminAPI.overwritePassword(passwordResetEmail.trim(), newPassword);
      alert(result.message || 'Password overwritten');
      setPasswordResetEmail('');
      setNewPassword('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to overwrite password'));
    } finally {
      setOverwritingPassword(false);
    }
  };

  const handleSetAccountActive = async (event) => {
    event.preventDefault();
    try {
      setTogglingActive(true);
      setError('');
      const result = await adminAPI.setAccountActive(accountStatusEmail.trim(), accountStatusValue === 'true');
      alert(result.message || 'Account status updated');
      setAccountStatusEmail('');
      await fetchDashboardData();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update account status'));
    } finally {
      setTogglingActive(false);
    }
  };

  const cardStyle = {
    background: 'var(--card)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '16px'
  };

  if (!canAccessDashboard) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Access denied</h2>
          <p className="muted">Only staff roles can access this dashboard.</p>
          <button className="btn" onClick={() => navigate('/')}>Back Home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: '0 0 6px 0' }}>{pageTitle}</h1>
          <p className="muted" style={{ margin: 0 }}>Signed in as {roleLabel(currentRole)}</p>
        </div>
        <button className="secondary" onClick={() => navigate('/')}>Back Home</button>
      </div>

      {error && (
        <div style={{ ...cardStyle, borderColor: 'rgba(255,0,0,0.35)', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={cardStyle}>Loading dashboard...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '16px' }}>
            {(isSystemOwner || isRootAdmin) && (
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Users</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px' }}>ID</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Username</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Email</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Role</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Active</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Fuel</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td style={{ padding: '8px' }}>{user.id}</td>
                          <td style={{ padding: '8px' }}>{user.username}</td>
                          <td style={{ padding: '8px' }}>{user.email}</td>
                          <td style={{ padding: '8px' }}>{roleLabel(user.role)}</td>
                          <td style={{ padding: '8px' }}>{user.isActive ? 'Yes' : 'No'}</td>
                          <td style={{ padding: '8px' }}>{user.fuelBalance}</td>
                          <td style={{ padding: '8px' }}>
                            <button
                              className="secondary"
                              onClick={() => handleAddFuel(user.id, user.username)}
                              disabled={addingFuel[user.id]}
                            >
                              {addingFuel[user.id] ? 'Adding...' : '+50 Fuel'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(isSystemOwner || isRootAdmin || isAcademicRegistrar || isOpsModerator) && (
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Group Creation Activity</h3>
                {groupActivity.length === 0 ? (
                  <p className="muted">No group activity yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {groupActivity.map((item) => (
                      <div key={item.id} style={{ padding: '10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 700 }}>{item.name}</div>
                        <div className="muted" style={{ fontSize: '12px' }}>Group ID: {item.id}</div>
                        <div className="muted" style={{ fontSize: '12px' }}>Unique Code: {item.joinCode}</div>
                        <div className="muted" style={{ fontSize: '12px' }}>
                          Created by: {item.creator?.username} ({item.creator?.email})
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(isSystemOwner || isFinanceController) && (
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Payment Logs (Finance Only)</h3>
                {paymentLogs.length === 0 ? (
                  <p className="muted">No payment logs available.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {paymentLogs.map((log) => (
                      <div key={log.id} style={{ padding: '10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 700 }}>{log.reference}</div>
                        <div className="muted" style={{ fontSize: '12px' }}>Amount: {log.amount}</div>
                        <div className="muted" style={{ fontSize: '12px' }}>Fuel Added: {log.fuelAdded}</div>
                        <div className="muted" style={{ fontSize: '12px' }}>Status: {log.status}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '16px' }}>
            {isSystemOwner && (
              <>
                <div style={cardStyle}>
                  <h3 style={{ marginTop: 0 }}>Create Staff</h3>
                  <form onSubmit={handleCreateStaff} style={{ display: 'grid', gap: '10px' }}>
                    <input type="email" placeholder="email" value={staffForm.email} onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))} required />
                    <input type="text" placeholder="username" value={staffForm.username} onChange={(e) => setStaffForm((p) => ({ ...p, username: e.target.value }))} required />
                    <input type="text" placeholder="temporary password" value={staffForm.password} onChange={(e) => setStaffForm((p) => ({ ...p, password: e.target.value }))} required />
                    <select value={staffForm.role} onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value }))}>
                      <option value="FINANCE_CONTROLLER">FINANCE_CONTROLLER</option>
                      <option value="ACADEMIC_REGISTRAR">ACADEMIC_REGISTRAR</option>
                      <option value="OPS_MODERATOR">OPS_MODERATOR</option>
                      <option value="ROOT_ADMIN">ROOT_ADMIN</option>
                    </select>
                    <button className="btn" type="submit" disabled={creatingStaff}>{creatingStaff ? 'Creating...' : 'Create Staff'}</button>
                  </form>
                </div>

                <div style={cardStyle}>
                  <h3 style={{ marginTop: 0 }}>Assign Role</h3>
                  <form onSubmit={handleAssignRole} style={{ display: 'grid', gap: '10px' }}>
                    <input type="email" placeholder="email" value={roleEmail} onChange={(e) => setRoleEmail(e.target.value)} required />
                    <select value={roleToAssign} onChange={(e) => setRoleToAssign(e.target.value)}>
                      <option value="ROOT_ADMIN">ROOT_ADMIN</option>
                      <option value="FINANCE_CONTROLLER">FINANCE_CONTROLLER</option>
                      <option value="ACADEMIC_REGISTRAR">ACADEMIC_REGISTRAR</option>
                      <option value="OPS_MODERATOR">OPS_MODERATOR</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="USER">USER</option>
                    </select>
                    <button className="btn" type="submit" disabled={assigningRole}>{assigningRole ? 'Assigning...' : 'Assign Role'}</button>
                  </form>
                </div>

                <div style={cardStyle}>
                  <h3 style={{ marginTop: 0 }}>Overwrite Password</h3>
                  <form onSubmit={handleOverwritePassword} style={{ display: 'grid', gap: '10px' }}>
                    <input type="email" placeholder="email" value={passwordResetEmail} onChange={(e) => setPasswordResetEmail(e.target.value)} required />
                    <input type="text" placeholder="new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                    <button className="btn" type="submit" disabled={overwritingPassword}>{overwritingPassword ? 'Updating...' : 'Overwrite Password'}</button>
                  </form>
                </div>

                <div style={cardStyle}>
                  <h3 style={{ marginTop: 0 }}>Kill Switch</h3>
                  <form onSubmit={handleSetAccountActive} style={{ display: 'grid', gap: '10px' }}>
                    <input type="email" placeholder="email" value={accountStatusEmail} onChange={(e) => setAccountStatusEmail(e.target.value)} required />
                    <select value={accountStatusValue} onChange={(e) => setAccountStatusValue(e.target.value)}>
                      <option value="false">Deactivate account</option>
                      <option value="true">Activate account</option>
                    </select>
                    <button className="btn" type="submit" disabled={togglingActive}>{togglingActive ? 'Updating...' : 'Update Status'}</button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button className="secondary" onClick={fetchDashboardData}>Refresh</button>
        </div>
      )}
    </div>
  );
}
