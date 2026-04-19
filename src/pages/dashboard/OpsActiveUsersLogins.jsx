import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { DashboardEmptyState, TableSkeletonRows } from '../../components/dashboard/DashboardDataState';
import { adminAPI, getApiErrorMessage } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

const CARD_STYLE = {
  background: 'rgba(17,24,39,0.8)',
  border: '1px solid #1f2937',
  borderRadius: 16,
  padding: 32,
  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 10px 24px rgba(0,0,0,0.18)',
  backdropFilter: 'blur(16px)'
};
const METRIC_LABEL_CLASS = 'm-0 text-xs uppercase tracking-[0.16em] text-slate-400';

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString();
}

export default function OpsActiveUsersLogins() {
  const { role, user } = useAuth();
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState({ allActiveWebUsers: 0, suspendedActiveWebUsers: 0, unsuspendedActiveWebUsers: 0 });

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getOpsActiveUserLogins({ q: search, status });
      setUsers(Array.isArray(response.users) ? response.users : []);
      setSummary(response.summary || { allActiveWebUsers: 0, suspendedActiveWebUsers: 0, unsuspendedActiveWebUsers: 0 });
      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load active users login monitor.'));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    if (!['OPS_MODERATOR', 'SYSTEM_OWNER', 'ROOT_ADMIN'].includes(role)) return;
    loadUsers();
  }, [role, loadUsers]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSuspendToggle = async (targetUser) => {
    if (!targetUser?.id) return;

    const nextSuspended = !Boolean(targetUser.isSuspended);
    const actionLabel = nextSuspended ? 'freeze' : 'unfreeze';
    const ok = window.confirm(
      `Are you sure you want to ${actionLabel} ${targetUser.username}? This action applies only to regular web-app users.`
    );

    if (!ok) return;

    try {
      setSavingId(targetUser.id);
      await adminAPI.setUserSuspended(targetUser.id, nextSuspended);
      setUsers((prev) => prev.map((item) => (
        item.id === targetUser.id
          ? { ...item, isSuspended: nextSuspended }
          : item
      )));

      setSummary((prev) => {
        const delta = nextSuspended ? 1 : -1;
        const suspended = Math.max(0, Number(prev.suspendedActiveWebUsers || 0) + delta);
        const total = Math.max(0, Number(prev.allActiveWebUsers || 0));
        return {
          ...prev,
          suspendedActiveWebUsers: suspended,
          unsuspendedActiveWebUsers: Math.max(0, total - suspended)
        };
      });

      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update suspension state.'));
    } finally {
      setSavingId(null);
    }
  };

  const rows = useMemo(() => users.map((userRecord) => ({
    ...userRecord,
    loginLabel: formatDate(userRecord.lastLoginAt),
    joinedLabel: formatDate(userRecord.createdAt)
  })), [users]);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1100;

  return (
    <DashboardLayout userRole={role} userName={user?.username}>
      <section id="ops-user-logins" className="mb-6" style={CARD_STYLE}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="m-0 text-xs uppercase tracking-[0.16em] text-emerald-300">Ops Control</p>
            <h1 className="m-0 mt-2 text-2xl font-bold tracking-tight text-slate-100">Active User Login Monitor</h1>
            <p className="mb-6 mt-2 text-sm text-gray-400">This panel shows regular web-app users only. Admin and staff accounts are excluded.</p>
          </div>
          <button
            type="button"
            onClick={loadUsers}
            className="dasher-btn-primary"
          >
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className={METRIC_LABEL_CLASS}>Active Web Users</p>
            <p className="m-0 mt-2 text-2xl font-bold text-emerald-400">{Number(summary.allActiveWebUsers || 0).toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className={METRIC_LABEL_CLASS}>Unsuspended</p>
            <p className="m-0 mt-2 text-2xl font-bold text-slate-100">{Number(summary.unsuspendedActiveWebUsers || 0).toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className={METRIC_LABEL_CLASS}>Suspended</p>
            <p className="m-0 mt-2 text-2xl font-bold text-amber-300">{Number(summary.suspendedActiveWebUsers || 0).toLocaleString()}</p>
          </div>
        </div>

        <div className="mt-5" style={{ display: 'grid', gap: 12, gridTemplateColumns: isMobile ? '1fr' : (isTablet ? '1fr 220px' : '1fr 220px 120px') }}>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by username or email"
            className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/60"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/60"
          >
            <option value="all">All</option>
            <option value="unsuspended">Unsuspended</option>
            <option value="suspended">Suspended</option>
          </select>
          <button
            type="button"
            onClick={loadUsers}
            className="dasher-btn-primary"
            style={{ justifySelf: isMobile || isTablet ? 'stretch' : 'auto' }}
          >
            Apply
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div>
        ) : null}
      </section>

      <section id="ops-user-logins-table" style={CARD_STYLE}>
        {isMobile ? (
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={`ops-active-mobile-skeleton-${idx}`} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-4">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-700/60" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-700/60" />
                </div>
              ))
            ) : null}

            {!loading && rows.length === 0 ? (
              <DashboardEmptyState
                title="No users matched this filter"
                description="Try a different username, email, or suspension status."
              />
            ) : null}

            {!loading && rows.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-4 transition hover:bg-white/5">
                <p className="m-0 text-sm font-semibold text-slate-100">{item.username}</p>
                <p className="m-0 mt-1 font-mono text-xs text-slate-400">{item.email}</p>
                <p className="m-0 mt-1 font-mono text-xs text-slate-500">Last login: {item.loginLabel}</p>
                <p className="m-0 mt-1 font-mono text-xs text-slate-500">Joined: {item.joinedLabel}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.isSuspended ? 'bg-amber-500/20 text-amber-200 border border-amber-300/30' : 'bg-emerald-500/20 text-emerald-200 border border-emerald-300/30'}`}>
                    {item.isSuspended ? 'Frozen' : 'Active'}
                  </span>
                  <button
                    type="button"
                    disabled={savingId === item.id}
                    onClick={() => handleSuspendToggle(item)}
                    className={`rounded-md border px-3 py-1 text-xs uppercase font-bold transition-all ${item.isSuspended ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'border-red-500/30 bg-transparent text-red-500/80 hover:bg-red-500 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {savingId === item.id ? 'Updating...' : item.isSuspended ? 'Unfreeze User' : 'Freeze User'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm text-slate-200">
            <thead>
              <tr className="border-b border-gray-800/50 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
                <th className="px-3 py-4">User</th>
                <th className="px-3 py-4">Email</th>
                <th className="px-3 py-4">Last Login</th>
                <th className="px-3 py-4">Joined</th>
                <th className="px-3 py-4">Status</th>
                <th className="px-3 py-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeletonRows columns={6} rows={4} />
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-5" colSpan={6}>
                    <DashboardEmptyState
                      title="No users matched this filter"
                      description="Try a different username, email, or suspension status."
                    />
                  </td>
                </tr>
              ) : rows.map((item) => (
                <tr key={item.id} className="border-b border-gray-800/50 transition hover:bg-white/5">
                  <td className="px-3 py-4 font-semibold text-slate-100">{item.username}</td>
                  <td className="px-3 py-4 font-mono text-slate-300">{item.email}</td>
                  <td className="px-3 py-4 font-mono text-slate-300">{item.loginLabel}</td>
                  <td className="px-3 py-4 font-mono text-slate-400">{item.joinedLabel}</td>
                  <td className="px-3 py-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.isSuspended ? 'bg-amber-500/20 text-amber-200 border border-amber-300/30' : 'bg-emerald-500/20 text-emerald-200 border border-emerald-300/30'}`}>
                      {item.isSuspended ? 'Frozen' : 'Active'}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      disabled={savingId === item.id}
                      onClick={() => handleSuspendToggle(item)}
                      className={`rounded-md border px-3 py-1 text-xs uppercase font-bold transition-all ${item.isSuspended ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'border-red-500/30 bg-transparent text-red-500/80 hover:bg-red-500 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {savingId === item.id ? 'Updating...' : item.isSuspended ? 'Unfreeze User' : 'Freeze User'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </DashboardLayout>
  );
}
