import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LineChart as LineChartIcon, Send, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { adminAPI, getApiErrorMessage } from '../services/api';

function cardStyle(theme) {
  return {
    background: theme === 'light' ? '#ffffff' : 'rgba(16, 23, 32, 0.8)',
    border: theme === 'light' ? '1px solid #e5e7eb' : '1px solid rgba(255, 255, 255, 0.09)',
    borderRadius: 14,
    padding: 18,
    boxShadow: theme === 'light' ? '0 8px 28px rgba(2, 6, 23, 0.08)' : 'none'
  };
}

export default function SystemOwnerDashboard() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('learn_lite_user') || '{}');
  const role = localStorage.getItem('user_role') || currentUser?.role || 'USER';
  const theme = localStorage.getItem('learn_lite_theme') || 'dark';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState({ performanceTrend: [], staffActivity: [], businessHealth: { score: 0, factors: {} } });
  const [inbox, setInbox] = useState([]);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ recipientEmail: '', subject: '', body: '' });
  const [staffUsers, setStaffUsers] = useState([]);

  useEffect(() => {
    if (role !== 'SYSTEM_OWNER') {
      navigate('/');
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [overviewRes, inboxRes, usersRes] = await Promise.all([
          adminAPI.getOwnerOverview(),
          adminAPI.getInbox(),
          adminAPI.getUsers()
        ]);

        setOverview(overviewRes.overview || { performanceTrend: [], staffActivity: [], businessHealth: { score: 0, factors: {} } });
        setInbox(inboxRes.messages || []);
        const allowedRoles = ['FINANCE_CONTROLLER', 'ACADEMIC_REGISTRAR', 'OPS_MODERATOR', 'SOCIAL_MEDIA_CONTROLLER', 'ROOT_ADMIN', 'ADMIN'];
        const filteredUsers = (usersRes.users || [])
          .filter((user) => allowedRoles.includes(user.role))
          .map((user) => ({ email: user.email, username: user.username, role: user.role }));
        setStaffUsers(filteredUsers);
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load System Owner dashboard'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, role]);

  const unreadCount = useMemo(() => inbox.filter((m) => !m.isRead).length, [inbox]);
  const recipientSuggestions = useMemo(() => {
    const q = form.recipientEmail.trim().toLowerCase();
    if (!q) return staffUsers.slice(0, 8);
    return staffUsers
      .filter((u) => u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
      .slice(0, 8);
  }, [form.recipientEmail, staffUsers]);
  const trend = overview.performanceTrend || [];
  const staffActivity = overview.staffActivity || [];
  const businessHealth = overview.businessHealth || { score: 0, factors: {}, revenueLast30Days: 0, activeUsers: 0, newQuestionsLast7Days: 0 };
  const healthChartData = [{ name: 'Health', value: Number(businessHealth.score || 0), fill: '#22c55e' }];

  const handleSend = async () => {
    if (!form.recipientEmail || !form.subject || !form.body) {
      alert('recipientEmail, subject and body are required');
      return;
    }

    try {
      setSending(true);
      await adminAPI.sendInboxMessage(form);
      const inboxRes = await adminAPI.getInbox();
      setInbox(inboxRes.messages || []);
      setForm({ recipientEmail: '', subject: '', body: '' });
    } catch (err) {
      alert(getApiErrorMessage(err, 'Failed to send message'));
    } finally {
      setSending(false);
    }
  };

  const markRead = async (messageId) => {
    try {
      await adminAPI.markInboxMessageRead(messageId);
      setInbox((current) => current.map((m) => (m.id === messageId ? { ...m, isRead: true } : m)));
    } catch (err) {
      alert(getApiErrorMessage(err, 'Failed to mark message read'));
    }
  };

  if (loading) {
    return <div className="container"><p className="muted">Loading System Owner command center...</p></div>;
  }

  if (error) {
    return (
      <div className="container">
        <div style={cardStyle(theme)}>
          <h2>System Owner Dashboard</h2>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: 'grid', gap: 18 }}>
      <div style={{ ...cardStyle(theme), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>System Owner Command Center</h1>
          <p className="muted" style={{ marginTop: 6 }}>Cross-team analytics, staff monitoring and internal communication.</p>
        </div>
        <button className="secondary" onClick={() => navigate('/dashboard/root-admin')}>Open Root Admin Tools</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={cardStyle(theme)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LineChartIcon size={18} /><strong>CEO Pulse Score</strong></div>
          <h2 style={{ marginTop: 10 }}>{businessHealth.score || 0}/100</h2>
        </div>
        <div style={cardStyle(theme)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LineChartIcon size={18} /><strong>Revenue (14d)</strong></div>
          <h2 style={{ marginTop: 10 }}>{trend.reduce((sum, d) => sum + Number(d.revenue || 0), 0).toLocaleString()}</h2>
        </div>
        <div style={cardStyle(theme)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Users size={18} /><strong>Team Activity</strong></div>
          <h2 style={{ marginTop: 10 }}>{staffActivity.length}</h2>
        </div>
        <div style={cardStyle(theme)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bell size={18} /><strong>Inbox Unread</strong></div>
          <h2 style={{ marginTop: 10 }}>{unreadCount}</h2>
        </div>
      </div>

      <div style={{ ...cardStyle(theme), minHeight: 300 }}>
        <h3 style={{ marginTop: 0 }}>CEO Pulse: Business Health Score</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'center' }}>
          <ResponsiveContainer width="100%" height={240}>
            <RadialBarChart innerRadius="55%" outerRadius="100%" barSize={18} data={healthChartData} startAngle={180} endAngle={0}>
              <RadialBar background dataKey="value" cornerRadius={8} />
              <Tooltip />
            </RadialBarChart>
          </ResponsiveContainer>
          <div style={{ display: 'grid', gap: 8 }}>
            <div><strong>Revenue (30d):</strong> {Number(businessHealth.revenueLast30Days || 0).toLocaleString()}</div>
            <div><strong>Active Users:</strong> {Number(businessHealth.activeUsers || 0).toLocaleString()}</div>
            <div><strong>New Questions (7d):</strong> {Number(businessHealth.newQuestionsLast7Days || 0).toLocaleString()}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Weighted Factors - Revenue: {businessHealth.factors?.revenueScore || 0}, Active Users: {businessHealth.factors?.activeUsersScore || 0}, Questions: {businessHealth.factors?.newQuestionsScore || 0}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle(theme), minHeight: 300 }}>
        <h3 style={{ marginTop: 0 }}>Revenue Growth Trend</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle(theme), minHeight: 300 }}>
        <h3 style={{ marginTop: 0 }}>Content Volume Chart</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="groups" fill="#3b82f6" />
            <Bar dataKey="quizzes" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle(theme), display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Staff Activity Audit (System Owner Only)</h3>
          <div style={{ maxHeight: 280, overflow: 'auto', display: 'grid', gap: 8 }}>
            {staffActivity.length === 0 && <p className="muted">No staff activity yet.</p>}
            {staffActivity.map((item) => (
              <div key={item.id} style={{ border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: 10, padding: 10 }}>
                <strong>{item.action}</strong>
                <p style={{ margin: '6px 0' }}>{item.actorEmail} {item.target ? `→ ${item.target}` : ''}</p>
                <small className="muted">{new Date(item.createdAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Owner Inbox</h3>
          <input
            className="input"
            placeholder="recipient email"
            value={form.recipientEmail}
            onChange={(e) => setForm((f) => ({ ...f, recipientEmail: e.target.value }))}
            style={{ marginBottom: 8 }}
            list="staffRecipientEmails"
          />
          <datalist id="staffRecipientEmails">
            {staffUsers.map((user) => (
              <option key={user.email} value={user.email}>{`${user.username} (${user.role})`}</option>
            ))}
          </datalist>
          {form.recipientEmail && recipientSuggestions.length > 0 && (
            <div style={{ marginBottom: 8, border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: 8, maxHeight: 140, overflow: 'auto' }}>
              {recipientSuggestions.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, recipientEmail: user.email }))}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
                    padding: '8px 10px',
                    cursor: 'pointer'
                  }}
                >
                  <strong>{user.email}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{user.username} · {user.role}</div>
                </button>
              ))}
            </div>
          )}
          <input
            className="input"
            placeholder="subject"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            style={{ marginBottom: 8 }}
          />
          <textarea
            className="input"
            placeholder="message body"
            rows={3}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
          <button className="btn" onClick={handleSend} disabled={sending} style={{ marginTop: 8, width: '100%' }}>
            <Send size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {sending ? 'Sending...' : 'Send Instruction'}
          </button>

          <div style={{ maxHeight: 160, overflow: 'auto', marginTop: 10, display: 'grid', gap: 8 }}>
            {inbox.map((item) => (
              <button
                key={item.id}
                onClick={() => !item.isRead && markRead(item.id)}
                style={{
                  textAlign: 'left',
                  borderRadius: 10,
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  padding: 10,
                  background: item.isRead ? 'transparent' : 'rgba(59,130,246,0.12)',
                  cursor: item.isRead ? 'default' : 'pointer'
                }}
              >
                <strong>{item.subject}</strong>
                <p style={{ margin: '4px 0 0 0' }}>{item.body}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
