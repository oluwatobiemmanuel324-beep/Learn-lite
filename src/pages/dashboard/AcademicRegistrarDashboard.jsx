import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { DashboardEmptyState, TableSkeletonRows } from '../../components/dashboard/DashboardDataState';
import { adminAPI, getApiErrorMessage } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CARD_CLASS = 'dasher-card mb-6';
const CARD_STYLE = {
  background: 'rgba(17,24,39,0.8)',
  border: '1px solid #1f2937',
  borderRadius: 16,
  padding: 32,
  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 10px 24px rgba(0,0,0,0.18)',
  backdropFilter: 'blur(16px)'
};
const HERO_STYLE = { background: 'linear-gradient(135deg, #450a0a 0%, #065f46 55%, #064e3b 100%)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 16, padding: 24 };
const METRIC_LABEL_CLASS = 'm-0 text-xs uppercase tracking-[0.16em] text-slate-400';

function toStatus(group) {
  const count = Number(group.memberCount || 0);
  if (count >= 30) return 'VERIFIED';
  if (count >= 10) return 'PENDING';
  return 'FLAGGED';
}

function badgeClass(status) {
  if (status === 'VERIFIED') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  if (status === 'PENDING') return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  return 'border-rose-500/40 bg-rose-500/15 text-rose-300';
}

export default function AcademicRegistrarDashboard() {
  const { role, roleLabel, user } = useAuth();
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workplace, setWorkplace] = useState({ groups: [] });

  useEffect(() => {
    if (!['ACADEMIC_REGISTRAR', 'SYSTEM_OWNER'].includes(role)) return;
    const load = async () => {
      try {
        const res = await adminAPI.getAcademicWorkplace();
        setWorkplace(res.workplace || { groups: [] });
        setError('');
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load academic workspace'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [role]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const queue = useMemo(() => (workplace.groups || []).map((group) => ({
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    status: toStatus(group)
  })), [workplace.groups]);
  const queueHealth = useMemo(() => ([
    { label: 'Verified', total: queue.filter((r) => r.status === 'VERIFIED').length },
    { label: 'Pending', total: queue.filter((r) => r.status === 'PENDING').length },
    { label: 'Flagged', total: queue.filter((r) => r.status === 'FLAGGED').length }
  ]), [queue]);

  const isMobile = viewportWidth < 768;

  return (
    <DashboardLayout userRole={role} userName={user?.username}>
      <div id="academic-overview" className="mb-6 grid gap-5 scroll-mt-8 lg:grid-cols-3">
        <div style={HERO_STYLE} className="lg:col-span-2">
          <p className="m-0 text-xs uppercase tracking-[0.18em] text-emerald-100/80">Academic Operations</p>
          <h1 className="m-0 mt-2 text-3xl font-extrabold tracking-tight text-slate-100">Hello {user?.username || 'User'}, your {roleLabel} workspace is ready.</h1>
          <p className="mb-6 mt-3 max-w-2xl text-sm leading-6 text-gray-400">Approve enrollment queues, validate courses, and surface certification or grade audit risks faster.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100">
            Registry queue balanced
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
        </div>
        <div id="certification-desk" className={CARD_CLASS} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Registry Notes</h3>
          <p className="mb-6 mt-3 text-sm leading-6 text-gray-400">Status badges help distinguish verified, pending, and flagged groups at a glance.</p>
          <div className="mt-5 flex gap-2 flex-wrap">
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">Verified</span>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs text-amber-300">Pending</span>
            <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs text-rose-300">Flagged</span>
          </div>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">{error}</div> : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div id="student-enrollment" className={CARD_CLASS} style={CARD_STYLE}><p className={METRIC_LABEL_CLASS}>Student Enrollment</p><p className="mt-2 text-2xl font-bold text-emerald-400">{queue.length}</p></div>
        <div id="course-validation" className={CARD_CLASS} style={CARD_STYLE}><p className={METRIC_LABEL_CLASS}>Course Validation</p><p className="mt-2 text-2xl font-bold text-slate-100">{queue.filter((r) => r.status === 'VERIFIED').length}</p></div>
        <div id="certification-desk-summary" className={CARD_CLASS} style={CARD_STYLE}><p className={METRIC_LABEL_CLASS}>Certification Desk</p><p className="mt-2 text-2xl font-bold text-slate-100">{queue.filter((r) => r.status === 'PENDING').length}</p></div>
        <div id="grade-audits" className={CARD_CLASS} style={CARD_STYLE}><p className={METRIC_LABEL_CLASS}>Grade Audits</p><p className="mt-2 text-2xl font-bold text-slate-100">{queue.filter((r) => r.status === 'FLAGGED').length}</p></div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className={`${CARD_CLASS} lg:col-span-3`} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Registration Queue</h3>
          <p className="mb-6 mt-2 text-sm text-gray-400">All groups sorted by status. Verified groups have 30+ members, pending 10+, flagged have fewer.</p>
          {isMobile ? (
            <div className="space-y-3 md:hidden">
              {loading ? Array.from({ length: 4 }).map((_, index) => (
                <div key={`academic-mobile-skeleton-${index}`} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-4">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-700/60" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-700/60" />
                </div>
              )) : null}

              {!loading && queue.length === 0 ? (
                <DashboardEmptyState
                  title="No registrations available"
                  description="Groups will appear here when enrollment activity starts."
                />
              ) : null}

              {!loading && queue.map((row, idx) => (
                <div key={row.id} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-4 transition hover:bg-white/5">
                  <p className="m-0 text-sm font-semibold text-slate-100">{row.name}</p>
                  <p className="m-0 mt-1 text-xs text-gray-400">Members: {workplace.groups?.[idx]?.memberCount || 0}</p>
                  <p className="m-0 mt-1 font-mono text-xs text-gray-400">Created: {row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${badgeClass(row.status)}`}>
                      <span className={`h-2 w-2 rounded-full ${row.status === 'VERIFIED' ? 'bg-emerald-400' : row.status === 'PENDING' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                      {row.status}
                    </span>
                    <button className="rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25">
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#1f2937]">
              <table className="min-w-full text-sm bg-[#0b0f19]">
                <thead>
                  <tr className="border-b border-gray-800/50 bg-[#111827]">
                    <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">Group Name</th>
                    <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">Members</th>
                    <th className="hidden px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 lg:table-cell">Created Date</th>
                    <th className="px-4 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">Status</th>
                    <th className="hidden px-4 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400 md:table-cell">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <TableSkeletonRows columns={5} rows={3} /> : null}
                  {!loading && queue.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6" colSpan={5}>
                        <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                          <div className="grid h-12 w-12 place-items-center rounded-full border border-dashed border-gray-700 text-gray-400">◌</div>
                          <p className="mt-4 text-sm font-semibold text-slate-200">No registrations available</p>
                          <p className="mt-2 text-xs text-gray-400">Groups will appear here when enrollment activity starts.</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {!loading && queue.map((row, idx) => (
                    <tr key={row.id} className="border-b border-gray-800/50 transition hover:bg-white/5">
                      <td className="px-4 py-4 text-slate-200 font-medium">{row.name}</td>
                      <td className="px-4 py-4 text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                            {(workplace.groups?.[idx]?.memberCount || 0)}
                          </span>
                        </span>
                      </td>
                      <td className="hidden px-4 py-4 font-mono text-sm text-slate-400 lg:table-cell">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${badgeClass(row.status)}`}>
                          <span className={`h-2 w-2 rounded-full ${row.status === 'VERIFIED' ? 'bg-emerald-400' : row.status === 'PENDING' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                          {row.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-4 text-center md:table-cell">
                        <button className="rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25">
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span>Total: <span className="text-slate-300 font-semibold">{queue.length}</span></span>
            <span>Verified: <span className="text-emerald-400 font-semibold">{queue.filter((r) => r.status === 'VERIFIED').length}</span></span>
            <span>Pending: <span className="text-amber-400 font-semibold">{queue.filter((r) => r.status === 'PENDING').length}</span></span>
            <span>Flagged: <span className="text-rose-400 font-semibold">{queue.filter((r) => r.status === 'FLAGGED').length}</span></span>
          </div>
        </div>
        <div className={`${CARD_CLASS} lg:col-span-2`} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Registry Controls</h3>
          <p className="mb-6 mt-2 text-sm leading-6 text-gray-400">Prioritize verification, escalate flagged groups, and keep approval history visible.</p>
          <div className="mt-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={queueHealth}>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="total" fill="#34d399" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
