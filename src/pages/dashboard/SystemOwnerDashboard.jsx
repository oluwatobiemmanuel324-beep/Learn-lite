import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminAPI, getApiErrorMessage } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CARD_CLASS = 'dasher-card mb-6';
const HERO_STYLE = { background: 'linear-gradient(135deg, #450a0a 0%, #065f46 55%, #064e3b 100%)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 16, padding: 24 };

export default function SystemOwnerDashboard({ dashboardRole }) {
  const navigate = useNavigate();
  const { role, roleLabel, user, token } = useAuth();
  const effectiveRole = dashboardRole || role;
  const effectiveRoleLabel = dashboardRole === 'ROOT_ADMIN' ? 'Root Admin' : roleLabel;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState({ businessHealth: { score: 0 } });
  const [auditLogs, setAuditLogs] = useState([]);
  const pollRef = useRef(null);

  const loadData = async () => {
    try {
      const [owner, audit] = await Promise.all([
        adminAPI.getOwnerOverview(),
        adminAPI.getAuditLogs(1, 12)
      ]);
      setOverview(owner.overview || { businessHealth: { score: 0 } });
      setAuditLogs(audit.logs || []);
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
