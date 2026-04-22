import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminAPI, getApiErrorMessage } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CARD_CLASS = 'dasher-card mb-6';
const HERO_STYLE = { background: 'linear-gradient(135deg, #450a0a 0%, #065f46 55%, #064e3b 100%)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 16, padding: 24 };
const MANAGEABLE_ADMIN_ROLES = ['ROOT_ADMIN', 'ADMIN', 'FINANCE_CONTROLLER', 'ACADEMIC_REGISTRAR', 'OPS_MODERATOR', 'SOCIAL_MEDIA_CONTROLLER'];

export default function SystemOwnerDashboard({ dashboardRole }) {
  const navigate = useNavigate();
  const { role, roleLabel, user, token } = useAuth();
  const effectiveRole = dashboardRole || role;
  const effectiveRoleLabel = dashboardRole === 'ROOT_ADMIN' ? 'Root Admin' : roleLabel;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState({ businessHealth: { score: 0 } });
  const [auditLogs, setAuditLogs] = useState([]);
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [credentialDrafts, setCredentialDrafts] = useState({});
  const [credentialBusyId, setCredentialBusyId] = useState(null);
  const [credentialStatus, setCredentialStatus] = useState({ type: '', text: '' });
  const pollRef = useRef(null);

  const loadData = async () => {
    try {
      const [owner, audit, usersPayload] = await Promise.all([
        adminAPI.getOwnerOverview(),
        adminAPI.getAuditLogs(1, 12),
        adminAPI.getUsers()
      ]);
      setOverview(owner.overview || { businessHealth: { score: 0 } });
      setAuditLogs(audit.logs || []);

      const users = Array.isArray(usersPayload?.users) ? usersPayload.users : [];
      const admins = users
        .filter((item) => MANAGEABLE_ADMIN_ROLES.includes(String(item?.role || '').toUpperCase()))
        .sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));

      setAdminAccounts(admins);
      setCredentialDrafts((current) => {
        const next = { ...current };
        admins.forEach((admin) => {
          const key = String(admin.id);
          if (!next[key]) {
            next[key] = { email: String(admin.email || ''), newPassword: '' };
          } else if (!next[key].email) {
            next[key] = { ...next[key], email: String(admin.email || '') };
          }
        });
        return next;
      });

      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load system owner workspace'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!['SYSTEM_OWNER', 'ROOT_ADMIN'].includes(effectiveRole)) return;
    loadData();
    pollRef.current = setInterval(loadData, 15000);
    return () => clearInterval(pollRef.current);
  }, [effectiveRole]);

  const ceoPulse = useMemo(() => Number(overview.businessHealth?.score || 0), [overview.businessHealth?.score]);
  const auditTrend = useMemo(() => {
    const recent = auditLogs.slice(0, 7).reverse();
    return recent.map((item, idx) => ({
      label: `D${idx + 1}`,
      events: Number(item?.id || idx + 1) % 16 + 4
    }));
  }, [auditLogs]);

  const scopeShare = useMemo(() => ([
    { name: 'Governance', value: Number(overview.businessHealth?.score || 0) || 30 },
    { name: 'Operations', value: Number(overview.businessHealth?.newQuestionsLast7Days || 0) || 20 },
    { name: 'Revenue', value: Number(overview.businessHealth?.revenueLast30Days || 0) / 1000 || 25 }
  ]), [overview.businessHealth]);

  const handleCredentialDraftChange = (adminId, field, value) => {
    const key = String(adminId);
    setCredentialDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        [field]: value
      }
    }));
  };

  const handleUpdateAdminCredentials = async (admin) => {
    const key = String(admin.id);
    const draft = credentialDrafts[key] || { email: admin.email || '', newPassword: '' };
    const nextEmail = String(draft.email || '').trim();
    const nextPassword = String(draft.newPassword || '').trim();

    if (!nextEmail && !nextPassword) {
      setCredentialStatus({ type: 'error', text: 'Add a new email or password before updating.' });
      return;
    }

    const payload = {};
    if (nextEmail && nextEmail !== String(admin.email || '')) {
      payload.email = nextEmail;
    }
    if (nextPassword) {
      payload.newPassword = nextPassword;
    }

    if (!Object.keys(payload).length) {
      setCredentialStatus({ type: 'error', text: 'No credential changes detected for this admin.' });
      return;
    }

    setCredentialBusyId(admin.id);
    setCredentialStatus({ type: '', text: '' });
    try {
      const result = await adminAPI.updateAdminCredentials(admin.id, payload);
      setCredentialStatus({ type: 'success', text: result?.message || `Updated login details for ${admin.username}.` });
      setCredentialDrafts((current) => ({
        ...current,
        [key]: {
          email: String(result?.user?.email || payload.email || admin.email || ''),
          newPassword: ''
        }
      }));
      await loadData();
    } catch (err) {
      setCredentialStatus({ type: 'error', text: getApiErrorMessage(err, 'Failed to update admin credentials.') });
    } finally {
      setCredentialBusyId(null);
    }
  };

  return (
      <DashboardLayout userRole={effectiveRole} userName={user?.username}>
      <div id="command-center" className="grid gap-6 scroll-mt-8 md:grid-cols-2">
        <div className={CARD_CLASS} style={HERO_STYLE}>
          <p className="m-0 text-xs uppercase tracking-[0.18em] text-emerald-100/80">Executive Workspace</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="m-0 text-xs uppercase tracking-[0.16em] text-emerald-100/75">Command Status</p>
              <p className="mt-2 text-2xl font-bold text-white">Live</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="m-0 text-xs uppercase tracking-[0.16em] text-emerald-100/75">Audits</p>
              <p className="mt-2 text-2xl font-bold text-white">{auditLogs.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="m-0 text-xs uppercase tracking-[0.16em] text-emerald-100/75">Pulse</p>
              <p className="mt-2 text-2xl font-bold text-white">{loading ? '...' : ceoPulse}</p>
            </div>
          </div>
        </div>

        <div id="instruction-inbox" className={CARD_CLASS}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Ideas for You</h3>
            <div className="flex gap-2 text-slate-400">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10">⌁</span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10">⌁</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold leading-tight text-slate-100">Review audit activity and escalate any anomalies quickly</h2>
          <p className="mb-6 mt-3 text-sm leading-6 text-gray-400">Real-time polling keeps the command center current without leaving the workspace.</p>
          <button type="button" className="dasher-btn-primary mt-5 text-sm">Read Now</button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100 shadow-sm">
          <p className="m-0 text-xs uppercase tracking-[0.16em] text-amber-200/80">Data notice</p>
          <p className="m-0 mt-2 text-sm leading-6">{error}</p>
        </div>
      ) : null}

      <div id="admin-login-controls" className={`${CARD_CLASS} scroll-mt-8`}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Admin Login Controls</h3>
            <p className="mb-0 mt-2 text-sm text-gray-400">Change admin email and password from the owner dashboard when credentials need rotation.</p>
          </div>
          <button type="button" onClick={loadData} className="dasher-btn-primary text-xs">Reload Admins</button>
        </div>

        {credentialStatus.text ? (
          <div className={`mb-4 rounded-xl border p-3 text-sm ${credentialStatus.type === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
            {credentialStatus.text}
          </div>
        ) : null}

        <div className="space-y-3">
          {adminAccounts.length === 0 ? (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 text-sm text-slate-300">
              No manageable admin accounts found.
            </div>
          ) : (
            adminAccounts.map((admin) => {
              const draft = credentialDrafts[String(admin.id)] || { email: admin.email || '', newPassword: '' };

              return (
                <div key={admin.id} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="m-0 text-base font-semibold text-slate-100">{admin.username}</p>
                      <p className="m-0 mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">{admin.role}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${admin.isActive ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200'}`}>
                      {admin.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      type="email"
                      value={draft.email}
                      onChange={(event) => handleCredentialDraftChange(admin.id, 'email', event.target.value)}
                      placeholder="Admin email"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    />
                    <input
                      type="text"
                      value={draft.newPassword}
                      onChange={(event) => handleCredentialDraftChange(admin.id, 'newPassword', event.target.value)}
                      placeholder="New password (leave blank to keep current)"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="dasher-btn-primary text-xs"
                      onClick={() => handleUpdateAdminCredentials(admin)}
                      disabled={credentialBusyId === admin.id}
                    >
                      {credentialBusyId === admin.id ? 'Updating...' : 'Update Login'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div id="ceo-pulse" className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 scroll-mt-8">
        <div className={CARD_CLASS}>
          <p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">CEO Pulse Score</p>
          <div className="mt-3 flex items-end justify-between">
            <p className="m-0 text-4xl font-extrabold text-emerald-400">{loading ? '...' : ceoPulse}</p>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">Executive</span>
          </div>
          <p className="m-0 mt-2 text-xs text-slate-500">Overall business health composite.</p>
        </div>
        <div className={CARD_CLASS}><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Global Reach</p><p className="mt-2 text-2xl font-bold text-slate-100">{Number(overview.businessHealth?.activeUsers || 0)}</p><p className="m-0 mt-1 text-xs text-slate-500">Authenticated active users</p></div>
        <div className={CARD_CLASS}><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Revenue Signal</p><p className="mt-2 text-2xl font-bold text-slate-100">{Number(overview.businessHealth?.revenueLast30Days || 0).toLocaleString()}</p><p className="m-0 mt-1 text-xs text-slate-500">Last 30 days revenue</p></div>
        <div className={CARD_CLASS}><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Ops Signal</p><p className="mt-2 text-2xl font-bold text-slate-100">{Number(overview.businessHealth?.newQuestionsLast7Days || 0).toLocaleString()}</p><p className="m-0 mt-1 text-xs text-slate-500">Recent governance events</p></div>
      </div>

      <div id="global-audit" className={`${CARD_CLASS} scroll-mt-8`}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Smart Audit Feed</h3>
            <p className="mb-0 mt-2 text-sm text-gray-400">High signal event stream for governance, operations, and revenue movement.</p>
          </div>
          <button type="button" onClick={loadData} className="dasher-btn-primary text-xs">Refresh</button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#1f2937] bg-[#0b0f19]">
          <table className="min-w-full text-sm text-slate-200">
            <thead>
              <tr>
                <th className="px-4 py-4 text-left text-[11px] uppercase tracking-[0.22em] text-gray-400">Event</th>
                <th className="px-4 py-4 text-left text-[11px] uppercase tracking-[0.22em] text-gray-400">Scope</th>
                <th className="px-4 py-4 text-left text-[11px] uppercase tracking-[0.22em] text-gray-400">Time</th>
                <th className="px-4 py-4 text-center text-[11px] uppercase tracking-[0.22em] text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr className="border-b border-gray-800">
                  <td className="px-4 py-6" colSpan={4}>
                    <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                      <div className="grid h-12 w-12 place-items-center rounded-full border border-dashed border-gray-700 text-gray-400">◌</div>
                      <p className="mt-4 text-sm font-semibold text-slate-200">No audit events available</p>
                      <p className="mt-2 text-xs text-gray-400">The activity feed will populate as the platform records governance events.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800 transition hover:bg-white/5">
                  <td className="px-4 py-4 font-semibold text-slate-100">{log.action || 'ACTION'}</td>
                  <td className="px-4 py-4 font-mono text-slate-300">{log.scope || 'System'}</td>
                  <td className="px-4 py-4 font-mono text-slate-400">{log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Unknown time'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">Active</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className={`dasher-card mb-6 lg:col-span-3`}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Executive Trendline</h3>
          <p className="mb-6 mt-2 text-sm text-gray-400">Trendline for executive oversight across recent audit activity.</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={auditTrend}>
                <defs>
                  <linearGradient id="auditFlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Area type="monotone" dataKey="events" stroke="#34d399" fill="url(#auditFlow)" fillOpacity={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`dasher-card mb-6 lg:col-span-2`}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Portfolio Mix</h3>
          <p className="mb-6 mt-2 text-sm text-gray-400">Balance of governance, operational, and revenue signals.</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={scopeShare} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={82} fill="#34d399" label />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div id="root-access" className={`${CARD_CLASS} scroll-mt-8`}>
        <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Root Access</h3>
        <p className="mb-6 mt-3 text-sm leading-6 text-gray-400">Session active for {user?.username || 'User'} with {effectiveRoleLabel} permissions. Authentication token is {token ? 'present' : 'missing'}.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <button type="button" className="dasher-btn-primary text-left text-sm" onClick={() => navigate('/dashboard/finance-controller')}>Audit Finance Desk</button>
          <button type="button" className="dasher-btn-primary text-left text-sm" onClick={() => navigate('/dashboard/academic-registrar')}>Audit Academic Desk</button>
          <button type="button" className="dasher-btn-danger text-left text-sm" onClick={() => navigate('/dashboard/ops-moderator')}>Audit Operations Desk</button>
          <button type="button" className="dasher-btn-primary text-left text-sm" onClick={() => navigate('/dashboard/social-media-controller')}>Audit Social Desk</button>
          <button type="button" className="dasher-btn-primary text-left text-sm" onClick={() => navigate('/dashboard/system-owner')}>Return Command Center</button>
        </div>
      </div>
    </DashboardLayout>
  );
}
