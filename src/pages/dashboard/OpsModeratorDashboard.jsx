import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { DashboardEmptyState } from '../../components/dashboard/DashboardDataState';
import { adminAPI, getApiErrorMessage } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CARD_CLASS = 'dasher-card mb-6';
const HERO_STYLE = { background: 'linear-gradient(135deg, #450a0a 0%, #065f46 55%, #064e3b 100%)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 16, padding: 24 };
const METRIC_LABEL_CLASS = 'm-0 text-xs uppercase tracking-[0.16em] text-slate-400';
const TABLE_HEADER_CLASS = 'px-4 py-4 text-left text-[11px] uppercase tracking-[0.22em] text-gray-400';
const TABLE_CELL_CLASS = 'px-4 py-4 align-top';

export default function OpsModeratorDashboard() {
  const navigate = useNavigate();
  const { role, roleLabel, user } = useAuth();
  const [error, setError] = useState('');
  const [workplace, setWorkplace] = useState({ activeUsers: 0, suspendedUsers: 0, recentUsers: [] });
  const [activeUserRows, setActiveUserRows] = useState([]);
  const [activeUsersLoading, setActiveUsersLoading] = useState(true);
  const [activeUsersActionId, setActiveUsersActionId] = useState(null);
  const [activeUsersError, setActiveUsersError] = useState('');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaRemovingId, setMediaRemovingId] = useState(null);
  const [removedMediaToast, setRemovedMediaToast] = useState(null);
  const [mediaMessage, setMediaMessage] = useState({ type: '', text: '' });
  const [visibleMediaCount, setVisibleMediaCount] = useState(6);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const trend = [
    { label: 'Mon', active: Math.max(2, Number(workplace.activeUsers || 0) - 18), disputes: Math.max(0, Number(workplace.suspendedUsers || 0) + 2) },
    { label: 'Tue', active: Math.max(2, Number(workplace.activeUsers || 0) - 10), disputes: Math.max(0, Number(workplace.suspendedUsers || 0) + 1) },
    { label: 'Wed', active: Math.max(2, Number(workplace.activeUsers || 0) - 7), disputes: Math.max(0, Number(workplace.suspendedUsers || 0)) },
    { label: 'Thu', active: Math.max(2, Number(workplace.activeUsers || 0) - 5), disputes: Math.max(0, Number(workplace.suspendedUsers || 0) - 1) },
    { label: 'Fri', active: Math.max(2, Number(workplace.activeUsers || 0)), disputes: Math.max(0, Number(workplace.suspendedUsers || 0)) }
  ];

  useEffect(() => {
    if (!['OPS_MODERATOR', 'SYSTEM_OWNER'].includes(role)) return;
    const load = async () => {
      try {
        const [res, mediaRes, activeUsersRes] = await Promise.all([
          adminAPI.getOpsWorkplace(),
          adminAPI.getHomeMedia(),
          adminAPI.getOpsActiveUserLogins({ status: 'all' })
        ]);
        setWorkplace(res.workplace || { activeUsers: 0, suspendedUsers: 0, recentUsers: [] });
        setMediaItems(Array.isArray(mediaRes?.items) ? mediaRes.items : []);
        setActiveUserRows(Array.isArray(activeUsersRes?.users) ? activeUsersRes.users : []);
        setActiveUsersError('');
        setError('');
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load ops workspace'));
      } finally {
        setActiveUsersLoading(false);
      }
    };
    load();
  }, [role]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!mediaMessage.text || mediaBusy) return;
    const timeoutId = setTimeout(() => {
      setMediaMessage({ type: '', text: '' });
    }, 4500);
    return () => clearTimeout(timeoutId);
  }, [mediaBusy, mediaMessage]);

  useEffect(() => {
    if (!removedMediaToast) return undefined;
    const timeoutId = setTimeout(() => setRemovedMediaToast(null), 7000);
    return () => clearTimeout(timeoutId);
  }, [removedMediaToast]);

  const handleUploadHomeMedia = async (e) => {
    e.preventDefault();

    if (!mediaFile) {
      setMediaMessage({ type: 'error', text: 'Please choose an image or video file before uploading.' });
      return;
    }

    if (!(mediaFile.type || '').startsWith('image/') && !(mediaFile.type || '').startsWith('video/')) {
      setMediaMessage({ type: 'error', text: 'Only image and video files are supported.' });
      return;
    }

    setMediaBusy(true);
    setMediaMessage({ type: 'info', text: 'Uploading...' });

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(mediaFile);
      });

      const result = await adminAPI.uploadHomeMedia({
        fileName: mediaFile.name,
        mimeType: mediaFile.type,
        dataUrl,
        title: mediaTitle
      });

      setMediaItems(Array.isArray(result?.items) ? result.items : mediaItems);
      setMediaTitle('');
      setMediaFile(null);
      setVisibleMediaCount(6);
      setMediaMessage({ type: 'success', text: result?.message || 'Uploaded successfully.' });
    } catch (err) {
      setMediaMessage({ type: 'error', text: getApiErrorMessage(err, 'Failed to upload homepage media.') });
    } finally {
      setMediaBusy(false);
    }
  };

  const handleRemoveHomeMedia = async (item) => {
    const mediaId = String(item?.id || '').trim();
    if (!mediaId) {
      setMediaMessage({ type: 'error', text: 'Cannot remove this media item because its id is missing.' });
      return;
    }

    const confirmed = window.confirm(`Remove "${item?.title || 'Homepage media'}" from the homepage?`);
    if (!confirmed) return;

    try {
      setMediaRemovingId(mediaId);
      const result = await adminAPI.removeHomeMedia(mediaId);
      setMediaItems(Array.isArray(result?.items) ? result.items : mediaItems.filter((media) => media.id !== mediaId));
      setMediaMessage({ type: 'success', text: result?.message || 'Media removed successfully.' });
      setRemovedMediaToast({ mediaId, item });
    } catch (err) {
      setMediaMessage({ type: 'error', text: getApiErrorMessage(err, 'Failed to remove homepage media.') });
    } finally {
      setMediaRemovingId(null);
    }
  };

  const handleUndoRemoveHomeMedia = async () => {
    if (!removedMediaToast?.mediaId || !removedMediaToast?.item) return;

    try {
      setMediaBusy(true);
      const result = await adminAPI.restoreHomeMedia(removedMediaToast.mediaId, removedMediaToast.item);
      setMediaItems(Array.isArray(result?.items) ? result.items : mediaItems);
      setMediaMessage({ type: 'success', text: result?.message || 'Media restored successfully.' });
      setRemovedMediaToast(null);
    } catch (err) {
      setMediaMessage({ type: 'error', text: getApiErrorMessage(err, 'Failed to restore homepage media.') });
    } finally {
      setMediaBusy(false);
    }
  };

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1100;
  const mediaColumns = isMobile ? '1fr' : (isTablet ? 'repeat(1, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))');
  const mediaFormColumns = isMobile ? '1fr' : (isTablet ? '1fr 1fr' : 'minmax(0,1fr) 280px 190px');

  const refreshActiveUsers = async () => {
    try {
      setActiveUsersLoading(true);
      const response = await adminAPI.getOpsActiveUserLogins({ status: 'all' });
      setActiveUserRows(Array.isArray(response?.users) ? response.users : []);
      setActiveUsersError('');
    } catch (err) {
      setActiveUsersError(getApiErrorMessage(err, 'Failed to refresh active users.'));
    } finally {
      setActiveUsersLoading(false);
    }
  };

  const handleToggleSuspension = async (targetUser) => {
    if (!targetUser?.id) return;
    const nextSuspended = !Boolean(targetUser.isSuspended);
    const prompt = nextSuspended ? 'freeze' : 'unfreeze';
    const ok = window.confirm(`Are you sure you want to ${prompt} ${targetUser.username}?`);
    if (!ok) return;

    try {
      setActiveUsersActionId(targetUser.id);
      await adminAPI.setUserSuspended(targetUser.id, nextSuspended);
      setActiveUserRows((rows) => rows.map((row) => (
        row.id === targetUser.id ? { ...row, isSuspended: nextSuspended } : row
      )));
      setActiveUsersError('');
    } catch (err) {
      setActiveUsersError(getApiErrorMessage(err, 'Failed to update user status.'));
    } finally {
      setActiveUsersActionId(null);
    }
  };

  return (
    <DashboardLayout userRole={role} userName={user?.username}>
      <div id="ops-overview" className="grid gap-6 scroll-mt-8 md:grid-cols-2">
        <div className={CARD_CLASS} style={HERO_STYLE}>
          <p className="m-0 text-xs uppercase tracking-[0.18em] text-emerald-100/80">Operations Desk</p>
          <h1 className="m-0 mt-2 text-3xl font-extrabold tracking-tight text-slate-100">Hello {user?.username || 'User'}, your {roleLabel} workspace is ready.</h1>
          <p className="mb-6 mt-3 max-w-2xl text-sm leading-6 text-gray-400">Moderate content, resolve disputes, and monitor staff activity with a focused production control surface.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100">
              Live moderation signal
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard/ops-moderator/active-users')}
              className="dasher-btn-primary"
            >
              View User Login Monitor
            </button>
          </div>
        </div>
        <div id="ops-summary" className={CARD_CLASS}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Control Summary</h3>
          <p className="mb-6 mt-3 text-sm leading-6 text-gray-400">The ops desk is optimized for quick review and escalation of volatile records.</p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] p-4"><p className={METRIC_LABEL_CLASS}>Active Users</p><p className="m-0 mt-2 text-2xl font-bold text-emerald-400">{Number(workplace.activeUsers || 0).toLocaleString()}</p></div>
            <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] p-4"><p className={METRIC_LABEL_CLASS}>Disputes</p><p className="m-0 mt-2 text-2xl font-bold text-slate-100">{Number(workplace.suspendedUsers || 0).toLocaleString()}</p></div>
          </div>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">{error}</div> : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div id="content-moderation" className={CARD_CLASS}><p className={METRIC_LABEL_CLASS}>Content Moderation</p><p className="mt-2 text-2xl font-bold text-emerald-400">{Number(workplace.activeUsers || 0).toLocaleString()}</p></div>
        <div id="dispute-resolution" className={CARD_CLASS}><p className={METRIC_LABEL_CLASS}>Dispute Resolution</p><p className="mt-2 text-2xl font-bold text-slate-100">{Number(workplace.suspendedUsers || 0).toLocaleString()}</p></div>
        <div id="staff-activity" className={CARD_CLASS}><p className={METRIC_LABEL_CLASS}>Staff Activity</p><p className="mt-2 text-2xl font-bold text-slate-100">{(workplace.recentUsers || []).length}</p></div>
        <div id="system-health" className={CARD_CLASS}><p className={METRIC_LABEL_CLASS}>System Health</p><p className="mt-2 text-2xl font-bold text-emerald-400">{Math.max(0, 100 - Number(workplace.suspendedUsers || 0))}%</p></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={CARD_CLASS}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Active Users Login Control</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={refreshActiveUsers}
                className="dasher-btn-primary"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard/ops-moderator/active-users')}
                className="dasher-btn-primary"
              >
                Open Full Monitor
              </button>
            </div>
          </div>
          <p className="mb-6 text-sm text-gray-400">View user login activity and freeze or unfreeze accounts directly from Ops desk.</p>
          {activeUsersError ? <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{activeUsersError}</p> : null}

          {isMobile ? (
            <div className="mt-4 space-y-3">
              {activeUsersLoading ? Array.from({ length: 3 }).map((_, idx) => (
                <div key={`ops-user-skeleton-${idx}`} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-3">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-700/60" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-700/60" />
                </div>
              )) : null}

              {!activeUsersLoading && activeUserRows.length === 0 ? (
                <DashboardEmptyState
                  title="No active users found"
                  description="User login records will appear here once users sign in."
                />
              ) : null}

              {!activeUsersLoading && activeUserRows.slice(0, 6).map((row) => (
                <div key={`ops-user-card-${row.id}`} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-4">
                  <p className="m-0 text-sm font-semibold text-slate-100">{row.username}</p>
                  <p className="m-0 mt-1 text-xs text-slate-400">{row.email}</p>
                  <p className="m-0 mt-1 text-xs text-slate-500">Last login: {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : 'Never'}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.isSuspended ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                      {row.isSuspended ? 'Frozen' : 'Active'}
                    </span>
                    <button
                      type="button"
                      disabled={activeUsersActionId === row.id}
                      onClick={() => handleToggleSuspension(row)}
                      className={`${row.isSuspended ? 'dasher-btn-primary' : 'dasher-btn-danger'} text-xs disabled:opacity-60`}
                    >
                      {activeUsersActionId === row.id ? 'Updating...' : row.isSuspended ? 'Unfreeze User' : 'Freeze User'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[#1f2937] bg-[#0b0f19]">
              <table className="min-w-full text-sm text-slate-200">
                <thead>
                  <tr>
                    <th className={TABLE_HEADER_CLASS}>User</th>
                    <th className={TABLE_HEADER_CLASS}>Email</th>
                    <th className={TABLE_HEADER_CLASS}>Last Login</th>
                    <th className="px-4 py-4 text-center text-[11px] uppercase tracking-[0.22em] text-gray-400">Status</th>
                    <th className="px-4 py-4 text-center text-[11px] uppercase tracking-[0.22em] text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeUsersLoading ? Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={`ops-user-table-skeleton-${idx}`} className="border-b border-gray-800/50">
                      <td className={TABLE_CELL_CLASS} colSpan={5}><div className="h-3 w-full animate-pulse rounded bg-slate-700/60" /></td>
                    </tr>
                  )) : null}

                  {!activeUsersLoading && activeUserRows.length === 0 ? (
                    <tr className="border-b border-gray-800/50">
                      <td className={TABLE_CELL_CLASS} colSpan={5}>
                        <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                          <div className="grid h-12 w-12 place-items-center rounded-full border border-dashed border-gray-700 text-gray-400">◌</div>
                          <p className="mt-4 text-sm font-semibold text-slate-200">No active users found</p>
                          <p className="mt-2 text-xs text-gray-400">User login records will appear here once users sign in.</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {!activeUsersLoading && activeUserRows.slice(0, 12).map((row) => (
                    <tr key={`ops-user-row-${row.id}`} className="border-b border-gray-800/50 transition hover:bg-white/5">
                      <td className={TABLE_CELL_CLASS + ' font-semibold text-slate-100'}>{row.username}</td>
                      <td className={TABLE_CELL_CLASS + ' font-mono text-slate-300'}>{row.email}</td>
                      <td className={TABLE_CELL_CLASS + ' font-mono text-slate-400'}>{row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : 'Never'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.isSuspended ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                          {row.isSuspended ? 'Frozen' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={activeUsersActionId === row.id}
                          onClick={() => handleToggleSuspension(row)}
                          className={`${row.isSuspended ? 'dasher-btn-primary' : 'dasher-btn-danger'} text-xs disabled:opacity-60`}
                        >
                          {activeUsersActionId === row.id ? 'Updating...' : row.isSuspended ? 'Unfreeze User' : 'Freeze User'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={CARD_CLASS}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Homepage Display Media</h3>
          <p className="mb-6 mt-2 text-sm text-gray-400">Upload homepage images or short videos that will be displayed on the public landing page.</p>

          <form
            onSubmit={handleUploadHomeMedia}
            className="mt-4"
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: mediaFormColumns,
              alignItems: 'center'
            }}
          >
            <input
              type="text"
              value={mediaTitle}
              onChange={(e) => setMediaTitle(e.target.value)}
              placeholder="Media title (optional)"
              className="rounded-lg border border-[#1f2937] bg-[#0b0f19] px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/60"
            />
            <label
              className="flex cursor-pointer items-center justify-between rounded-lg border border-[#1f2937] bg-[#0b0f19] px-3 py-2 text-sm text-slate-200 transition hover:border-blue-500/40"
              style={{ minHeight: 42 }}
            >
              <span className="truncate pr-2">{mediaFile ? mediaFile.name : 'Choose image or video file'}</span>
              <span className="rounded-md border border-[#1f2937] bg-black/20 px-2 py-0.5 text-xs text-slate-300">Browse</span>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                style={{ display: 'none' }}
              />
            </label>
            <button
              type="submit"
              disabled={mediaBusy}
              className="dasher-btn-primary disabled:opacity-60"
              style={{ justifySelf: isMobile ? 'stretch' : 'start', minWidth: isMobile ? 0 : 190 }}
            >
              {mediaBusy ? 'Uploading...' : 'Upload to Homepage'}
            </button>
          </form>

          {mediaMessage.text ? (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              mediaMessage.type === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                : mediaMessage.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-sky-500/40 bg-sky-500/10 text-sky-200'
            }`}>
              {mediaMessage.text}
            </div>
          ) : null}

          {removedMediaToast ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <span>Removed {removedMediaToast.item?.title || 'homepage media'}.</span>
              <button
                type="button"
                onClick={handleUndoRemoveHomeMedia}
                className="dasher-btn-primary text-xs"
              >
                Undo
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>Showing {Math.min(visibleMediaCount, mediaItems.length)} of {mediaItems.length} media items</span>
            {mediaItems.length > visibleMediaCount ? (
              <button
                type="button"
                onClick={() => setVisibleMediaCount((count) => count + 6)}
                className="dasher-btn-primary text-xs"
              >
                Load more
              </button>
            ) : null}
          </div>

          <div className="mt-4 overflow-y-auto" style={{ display: 'grid', gap: 12, gridTemplateColumns: mediaColumns, maxHeight: '600px' }}>
            {mediaItems.length === 0 ? (
              <div style={{ gridColumn: '1 / -1' }}>
                <DashboardEmptyState
                  title="No homepage media uploaded"
                  description="Upload your first image or video to populate the landing page media strip."
                />
              </div>
            ) : null}
            {mediaItems.slice(0, visibleMediaCount).map((item) => (
              <div key={item.id || item.url} className="overflow-hidden rounded-xl border border-[#1f2937] bg-[#0b0f19]" style={{ minWidth: 0 }}>
                {item.type === 'video' ? (
                  <video src={item.url} controls muted style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <img src={item.url} alt={item.title || 'Homepage media'} style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }} />
                )}
                <div className="p-3" style={{ overflow: 'hidden' }}>
                  <p className="m-0 text-sm font-semibold text-slate-100 truncate">{item.title || 'Homepage media'}</p>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveHomeMedia(item)}
                      disabled={mediaRemovingId === item.id}
                      className="dasher-btn-danger text-xs disabled:opacity-60"
                    >
                      {mediaRemovingId === item.id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={CARD_CLASS}>
        <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Moderation Throughput</h3>
        <p className="mb-6 mt-2 text-sm text-gray-400">Live signal across active moderation load and dispute pressure.</p>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="throughputFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(16,185,129,0.2)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Area type="monotone" dataKey="active" stroke="#34d399" fill="url(#throughputFill)" fillOpacity={1} strokeWidth={2.5} />
              <Line type="monotone" dataKey="disputes" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DashboardLayout>
  );
}
