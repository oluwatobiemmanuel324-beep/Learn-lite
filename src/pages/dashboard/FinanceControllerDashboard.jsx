import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { DashboardEmptyState, TableSkeletonRows } from '../../components/dashboard/DashboardDataState';
import { adminAPI, getApiErrorMessage } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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

export default function FinanceControllerDashboard() {
  const { role, roleLabel, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workplace, setWorkplace] = useState({ cashFlow: { byCategory: [] }, proposedDisbursements: [] });

  useEffect(() => {
    if (!['FINANCE_CONTROLLER', 'SYSTEM_OWNER'].includes(role)) return;
    const load = async () => {
      try {
        const res = await adminAPI.getFinanceWorkplace();
        setWorkplace(res.workplace || { cashFlow: { byCategory: [] }, proposedDisbursements: [] });
        setError('');
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load finance workspace'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [role]);

  const trend = useMemo(() => (workplace.cashFlow?.byCategory || []).map((item) => ({
    label: item.category,
    revenue: Number(item.totalAmount || 0)
  })), [workplace.cashFlow?.byCategory]);

  const pendingRows = useMemo(() => (workplace.proposedDisbursements || []).filter((item) => item.status === 'PENDING'), [workplace.proposedDisbursements]);

  const getPriorityInfo = (amount) => {
    if (amount > 50000) {
      return { label: 'HIGH', class: 'border-rose-500/40 bg-rose-500/10 text-rose-300', dot: 'bg-rose-400' };
    } else if (amount > 10000) {
      return { label: 'MEDIUM', class: 'border-amber-500/40 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' };
    } else {
      return { label: 'LOW', class: 'border-slate-500/40 bg-slate-500/10 text-slate-300', dot: 'bg-slate-400' };
    }
  };

  return (
    <DashboardLayout userRole={role} userName={user?.username}>
      <div id="revenue-analytics" className="mb-6 grid gap-5 scroll-mt-8 lg:grid-cols-3">
        <div style={HERO_STYLE} className="lg:col-span-2">
          <p className="m-0 text-xs uppercase tracking-[0.18em] text-emerald-100/80">Finance Command</p>
          <h1 className="m-0 mt-2 text-3xl font-extrabold tracking-tight text-slate-100">Hello {user?.username || 'User'}, your {roleLabel} workspace is ready.</h1>
          <p className="mb-6 mt-3 max-w-2xl text-sm leading-6 text-gray-400">Track revenue performance, monitor anomalies, and process allocation proposals with confidence.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="rounded-xl border border-emerald-400/30 bg-emerald-400/20 px-4 py-2.5 text-sm font-bold text-emerald-100 transition hover:bg-emerald-300/30">Start AI Analysis</button>
            <button type="button" className="rounded-xl border border-slate-300/20 bg-slate-400/10 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-300/15">Open Treasury Log</button>
          </div>
        </div>

        <div id="cash-flow-visualizer" className={CARD_CLASS} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Treasury Snapshot</h3>
          <p className="mb-6 mt-3 text-sm leading-6 text-gray-400">Revenue, anomalies, and pending proposals remain synchronized with the Node backend.</p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Revenue</p><p className="m-0 mt-1 text-2xl font-bold text-emerald-400">{Number(workplace.totalRevenue || 0).toLocaleString()}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Pending Proposals</p><p className="m-0 mt-1 text-2xl font-bold text-slate-100">{pendingRows.length}</p></div>
          </div>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">{error}</div> : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div id="anomaly-detection" className={CARD_CLASS} style={CARD_STYLE}><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Anomalies</p><p className="mt-2 text-2xl font-bold text-amber-300">{(workplace.cashFlow?.anomalies || []).length}</p><p className="m-0 mt-1 text-xs text-slate-500">Flagged transactions</p></div>
        <div className={CARD_CLASS} style={CARD_STYLE}><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Revenue</p><p className="mt-2 text-2xl font-bold text-emerald-400">{Number(workplace.totalRevenue || 0).toLocaleString()}</p><p className="m-0 mt-1 text-xs text-slate-500">Total settled revenue</p></div>
        <div className={CARD_CLASS} style={CARD_STYLE}><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Pending</p><p className="mt-2 text-2xl font-bold text-slate-100">{pendingRows.length}</p><p className="m-0 mt-1 text-xs text-slate-500">Awaiting approval</p></div>
        <div className={CARD_CLASS} style={CARD_STYLE}><p className="m-0 text-xs uppercase tracking-[0.16em] text-slate-400">Avg Tx</p><p className="mt-2 text-2xl font-bold text-slate-100">{Math.round(Number(workplace.cashFlow?.averageSuccessfulAmount || 0)).toLocaleString()}</p><p className="m-0 mt-1 text-xs text-slate-500">Average successful transfer</p></div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div id="allocation-proposals" className={`${CARD_CLASS} lg:col-span-3 scroll-mt-8`} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Revenue Growth</h3>
          <p className="mb-6 mt-2 text-sm text-gray-400">Revenue trendline with executive visibility across categories.</p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="revGrowthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#10B981" fill="url(#revGrowthFill)" fillOpacity={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`${CARD_CLASS} lg:col-span-2`} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Pending Proposals</h3>
          <p className="mb-6 mt-2 text-sm text-gray-400">Review disbursement requests awaiting your approval.</p>
          <div className="space-y-3 md:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={`finance-mobile-skeleton-${index}`} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-3">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-700/60" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-700/60" />
                </div>
              ))
            ) : null}

            {!loading && pendingRows.length === 0 ? (
              <DashboardEmptyState
                title="No pending proposals"
                description="New disbursement requests will appear here for review."
              />
            ) : null}

            {!loading && pendingRows.map((row) => {
              const amount = Number(row.requestedAmount || 0);
              const priorityInfo = getPriorityInfo(amount);
              return (
                <div key={`finance-mobile-${row.id}`} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-4 transition hover:bg-white/5">
                  <p className="m-0 text-sm font-semibold text-slate-200">{row.destinationDepartment}</p>
                  <p className="m-0 mt-1 font-mono text-sm text-slate-300">Amount: <span className="font-semibold text-emerald-300">N{amount.toLocaleString()}</span></p>
                  <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityInfo.class}`}>
                    <span className={`h-2 w-2 rounded-full ${priorityInfo.dot}`} />
                    {priorityInfo.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-[#1f2937] md:block">
            <table className="hidden min-w-full bg-[#0b0f19] text-sm md:table">
              <thead>
                <tr className="border-b border-gray-800/50 bg-[#111827]">
                  <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">Department</th>
                  <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">Amount</th>
                  <th className="px-4 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">Priority</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <TableSkeletonRows columns={3} rows={3} /> : null}
                {!loading && pendingRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6" colSpan={3}>
                      <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                        <div className="grid h-12 w-12 place-items-center rounded-full border border-dashed border-gray-700 text-gray-400">◌</div>
                        <p className="mt-4 text-sm font-semibold text-slate-200">No pending proposals</p>
                        <p className="mt-2 text-xs text-gray-400">New disbursement requests will appear here for review.</p>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {pendingRows.map((row) => {
                  const amount = Number(row.requestedAmount || 0);
                  const priorityInfo = getPriorityInfo(amount);
                  return (
                    <tr key={row.id} className="border-b border-gray-800/50 transition hover:bg-white/5">
                      <td className="px-4 py-4 font-medium text-slate-200">{row.destinationDepartment}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-emerald-400 font-bold">₦</span>
                          <span className="text-slate-100 font-semibold">{amount.toLocaleString()}</span>
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityInfo.class}`}>
                          <span className={`w-2 h-2 rounded-full ${priorityInfo.dot}`} />
                          {priorityInfo.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex gap-4">
            <span>Total Pending: <span className="text-slate-300 font-semibold">{pendingRows.length}</span></span>
            <span>Total Amount: <span className="text-emerald-400 font-semibold">₦{pendingRows.reduce((sum, r) => sum + Number(r.requestedAmount || 0), 0).toLocaleString()}</span></span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
