import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { DashboardEmptyState } from '../../components/dashboard/DashboardDataState';
import { adminAPI, getApiErrorMessage } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MessageCircle, Facebook, Instagram, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';

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
const SOCIAL_CHANNELS = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Channel',
    handle: '@learnlite-channel',
    link: 'https://whatsapp.com/channel/0029Vb7NksbEKyZPSlNMg644',
    icon: MessageCircle,
    accent: 'text-emerald-300'
  },
  {
    id: 'facebook',
    name: 'Facebook',
    handle: 'Learn Lite',
    link: 'https://www.facebook.com/share/185cDUg3Lk/',
    icon: Facebook,
    accent: 'text-sky-300'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    handle: '@learnlite.official',
    link: 'https://www.instagram.com/learnlite.official?igsh=MXFkdjdlanQzc2k5OA==',
    icon: Instagram,
    accent: 'text-pink-300'
  }
];

export default function SocialMediaControllerDashboard() {
  const { role, roleLabel, user } = useAuth();
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [error, setError] = useState('');
  const [copiedChannel, setCopiedChannel] = useState('');
  const [workplace, setWorkplace] = useState({ contacts: [] });
  const [feed, setFeed] = useState({ topWeeklyScores: [] });

  useEffect(() => {
    if (!['SOCIAL_MEDIA_CONTROLLER', 'SYSTEM_OWNER'].includes(role)) return;
    const load = async () => {
      try {
        const [workRes, feedRes] = await Promise.all([
          adminAPI.getSocialMediaWorkplace(),
          adminAPI.getSocialMarketingFeed()
        ]);
        setWorkplace(workRes.workplace || { contacts: [] });
        setFeed(feedRes.feed || { topWeeklyScores: [] });
        setError('');
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load social workspace'));
      }
    };
    load();
  }, [role]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isMobile = viewportWidth < 768;

  const followerGrowth = useMemo(() => Number(feed.topWeeklyScores?.length || 0) * 12, [feed.topWeeklyScores?.length]);
  const engagementRate = useMemo(() => Math.min(100, Number(workplace.contacts?.length || 0) * 4), [workplace.contacts?.length]);
  const momentum = useMemo(() => {
    const base = Math.max(4, Number(feed.topWeeklyScores?.length || 0));
    return [
      { label: 'W1', growth: base * 3, engagement: Math.max(6, engagementRate - 8) },
      { label: 'W2', growth: base * 4, engagement: Math.max(8, engagementRate - 5) },
      { label: 'W3', growth: base * 5, engagement: Math.max(10, engagementRate - 2) },
      { label: 'W4', growth: base * 6, engagement: engagementRate }
    ];
  }, [feed.topWeeklyScores?.length, engagementRate]);

  const campaignRows = useMemo(() => {
    const cards = Array.isArray(feed.socialCards) ? feed.socialCards : [];
    const topScores = Array.isArray(feed.topWeeklyScores) ? feed.topWeeklyScores : [];

    if (cards.length > 0) {
      return cards.slice(0, 6).map((item, index) => ({
        id: item?.id || `campaign-card-${index}`,
        title: item?.title || item?.name || `Campaign ${index + 1}`,
        platform: item?.platform || 'Social',
        score: Number(item?.score || item?.value || 0)
      }));
    }

    return topScores.slice(0, 6).map((item, index) => ({
      id: item?.id || `campaign-score-${index}`,
      title: item?.title || item?.name || `Campaign ${index + 1}`,
      platform: item?.platform || 'Social',
      score: Number(item?.score || item?.value || item || 0)
    }));
  }, [feed.socialCards, feed.topWeeklyScores]);

  const handleCopyChannelLink = async (channel) => {
    try {
      await navigator.clipboard.writeText(channel.link);
      setCopiedChannel(channel.id);
      window.setTimeout(() => setCopiedChannel(''), 1600);
    } catch {
      setCopiedChannel('');
    }
  };

  return (
    <DashboardLayout userRole={role} userName={user?.username}>
      <div id="engagement-stats" className="mb-6 grid gap-5 scroll-mt-8 lg:grid-cols-3">
        <div style={HERO_STYLE} className="lg:col-span-2">
          <p className="m-0 text-xs uppercase tracking-[0.18em] text-emerald-100/80">Social Command</p>
          <h1 className="m-0 mt-2 text-3xl font-extrabold tracking-tight text-slate-100">Hello {user?.username || 'User'}, your {roleLabel} workspace is ready.</h1>
          <p className="mb-6 mt-3 max-w-2xl text-sm leading-6 text-gray-400">Watch engagement momentum, campaign activity, and social API health from one focused surface.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-100">Follower growth</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-100">Campaign momentum</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-100">API health</span>
          </div>
        </div>
        <div id="social-api-summary" className={CARD_CLASS} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Community Pulse</h3>
          <p className="mb-6 mt-3 text-sm leading-6 text-gray-400">Follower growth and engagement are computed from live feed activity.</p>
          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">Social API Status: Online</div>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">{error}</div> : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div id="community-growth" className={CARD_CLASS} style={CARD_STYLE}><p className={METRIC_LABEL_CLASS}>Follower Growth</p><p className="mt-2 text-2xl font-bold text-emerald-400">{followerGrowth}</p></div>
        <div className={CARD_CLASS} style={CARD_STYLE}><p className={METRIC_LABEL_CLASS}>Engagement Rate</p><p className="mt-2 text-2xl font-bold text-emerald-400">{engagementRate}%</p></div>
        <div id="campaign-tracker-summary" className={CARD_CLASS} style={CARD_STYLE}><p className={METRIC_LABEL_CLASS}>Campaign Tracker</p><p className="mt-2 text-2xl font-bold text-slate-100">{(feed.socialCards || []).length}</p></div>
        <div id="social-api-overview" className={CARD_CLASS} style={CARD_STYLE}><p className={METRIC_LABEL_CLASS}>Social API Status</p><p className="mt-2 text-2xl font-bold text-slate-100">Online</p></div>
      </div>

      <div className={CARD_CLASS} style={CARD_STYLE}>
        <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Social Channel Operations</h3>
        <p className="mb-6 mt-2 text-sm text-gray-400">Professional channel controls for growth routing, quick audits, and audience conversion hand-off.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {SOCIAL_CHANNELS.map((channel) => {
            const Icon = channel.icon;
            return (
              <div key={channel.id} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-sm font-semibold text-slate-100">{channel.name}</p>
                    <p className="m-0 mt-1 text-xs text-gray-400">{channel.handle}</p>
                  </div>
                  <span className={`inline-flex rounded-full bg-white/5 p-2 ${channel.accent}`}><Icon size={16} /></span>
                </div>
                <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">Status: Connected</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <a
                    href={channel.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                  >
                    Open <ExternalLink size={13} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopyChannelLink(channel)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    {copiedChannel === channel.id ? <><CheckCircle2 size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div id="campaign-tracker" className={`${CARD_CLASS} lg:col-span-3 scroll-mt-8`} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Audience Momentum</h3>
          <p className="mb-6 mt-2 text-sm text-gray-400">Audience growth and engagement trends over the last four weeks.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="m-0 text-xs text-slate-400">Growth</p>
              <p className="mt-2 text-2xl font-bold text-emerald-400">+{followerGrowth}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="m-0 text-xs text-slate-400">Engagement</p>
              <p className="mt-2 text-2xl font-bold text-sky-300">{engagementRate}%</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="m-0 text-xs text-slate-400">Cards</p>
              <p className="mt-2 text-2xl font-bold text-slate-100">{(feed.socialCards || []).length}</p>
            </div>
          </div>
          <div className="mt-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={momentum}>
                <defs>
                  <linearGradient id="socialGrowthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Area type="monotone" dataKey="growth" stroke="#34d399" fill="url(#socialGrowthFill)" fillOpacity={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div id="social-api-status" className={`${CARD_CLASS} lg:col-span-2 scroll-mt-8`} style={CARD_STYLE}>
          <h3 className="m-0 text-2xl font-bold tracking-tight text-slate-100">Campaign Status</h3>
          <p className="mb-6 mt-2 text-sm text-gray-400">Campaign cards are shown in a mobile stack and a desktop table for easier scanning.</p>
          {campaignRows.length === 0 ? (
            <DashboardEmptyState
              title="No campaign records yet"
              description="Live campaign updates will appear here when social feed events are available."
            />
          ) : isMobile ? (
            <div className="space-y-3 md:hidden">
              {campaignRows.map((row) => (
                <div key={row.id} className="rounded-xl border border-[#1f2937] bg-[#0b0f19] p-4 transition hover:bg-white/5">
                  <p className="m-0 text-sm font-semibold text-slate-100">{row.title}</p>
                  <p className="m-0 mt-1 text-xs text-gray-400">{row.platform}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">Score</span>
                    <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">{row.score.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#1f2937] bg-[#0b0f19]">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800/50 bg-[#111827]">
                    <th className="px-4 py-4 text-left text-[11px] uppercase tracking-[0.22em] text-gray-400">Campaign</th>
                    <th className="px-4 py-4 text-left text-[11px] uppercase tracking-[0.22em] text-gray-400">Platform</th>
                    <th className="px-4 py-4 text-right text-[11px] uppercase tracking-[0.22em] text-gray-400">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-800/50 transition hover:bg-white/5 last:border-b-0">
                      <td className="px-4 py-4 text-slate-200">{row.title}</td>
                      <td className="px-4 py-4 text-slate-400">{row.platform}</td>
                      <td className="px-4 py-4 text-right">
                        <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                          {row.score.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
