import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, Moon, Sun, LayoutGrid, ChevronRight, UserCircle2, PanelLeftOpen, PanelLeftClose, X, Shield, Building2, Camera, Phone, Globe, MapPin, Clock3, ImagePlus, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { authAPI, getApiErrorMessage } from '../../services/api';
import { useApp } from '../../context/AppContext';

const NAV_BY_ROLE = {
  SYSTEM_OWNER: [
    { label: 'Command Center', targetId: 'command-center' },
    { label: 'CEO Pulse', targetId: 'ceo-pulse' },
    { label: 'Global Audit', targetId: 'global-audit' },
    { label: 'Instruction Inbox', targetId: 'instruction-inbox' },
    { label: 'Root Access', targetId: 'root-access' }
  ],
  ROOT_ADMIN: [
    { label: 'Command Center', targetId: 'command-center' },
    { label: 'CEO Pulse', targetId: 'ceo-pulse' },
    { label: 'Global Audit', targetId: 'global-audit' },
    { label: 'Instruction Inbox', targetId: 'instruction-inbox' },
    { label: 'Root Access', targetId: 'root-access' }
  ],
  FINANCE_CONTROLLER: [
    { label: 'Revenue Analytics', targetId: 'revenue-analytics' },
    { label: 'Cash Flow Visualizer', targetId: 'cash-flow-visualizer' },
    { label: 'Anomaly Detection', targetId: 'anomaly-detection' },
    { label: 'Allocation Proposals', targetId: 'allocation-proposals' }
  ],
  OPS_MODERATOR: [
    { label: 'Content Moderation', targetId: 'content-moderation' },
    { label: 'Dispute Resolution', targetId: 'dispute-resolution' },
    { label: 'Staff Activity', targetId: 'staff-activity' },
    { label: 'System Health', targetId: 'system-health' }
  ],
  SOCIAL_MEDIA_CONTROLLER: [
    { label: 'Engagement Stats', targetId: 'engagement-stats' },
    { label: 'Campaign Tracker', targetId: 'campaign-tracker' },
    { label: 'Community Growth', targetId: 'community-growth' },
    { label: 'Social API Status', targetId: 'social-api-status' }
  ],
  ACADEMIC_REGISTRAR: [
    { label: 'Student Enrollment', targetId: 'student-enrollment' },
    { label: 'Course Validation', targetId: 'course-validation' },
    { label: 'Certification Desk', targetId: 'certification-desk' },
    { label: 'Grade Audits', targetId: 'grade-audits' }
  ]
};

const TEAM_ROUTES = [
  { label: 'Root Room', path: '/dashboard/root-admin' },
  { label: 'System Owner', path: '/dashboard/system-owner' },
  { label: 'Finance', path: '/dashboard/finance-controller' },
  { label: 'Academic', path: '/dashboard/academic-registrar' },
  { label: 'Operations', path: '/dashboard/ops-moderator' },
  { label: 'Social', path: '/dashboard/social-media-controller' }
];

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function DashboardLayout({ children, userRole, userName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, roleLabel, user, token } = useAuth();
  const { theme, setTheme } = useApp();
  const effectiveRole = userRole || role;
  const effectiveName = userName || user?.username || 'User';
  const profileKey = `learn_lite_dashboard_profile_${user?.id || user?.email || 'anon'}`;
  const initialProfile = safeParse(localStorage.getItem(profileKey), {});
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => sessionStorage.getItem('learn_lite_sidebar_open') !== 'false');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: initialProfile.fullName || effectiveName,
    businessName: initialProfile.businessName || `${effectiveName} Office`,
    title: initialProfile.title || roleLabel,
    department: initialProfile.department || roleLabel,
    industry: initialProfile.industry || 'Education Technology',
    email: initialProfile.email || user?.email || '',
    phone: initialProfile.phone || '',
    address: initialProfile.address || '',
    website: initialProfile.website || '',
    linkedIn: initialProfile.linkedIn || '',
    businessHours: initialProfile.businessHours || 'Mon-Fri 09:00-18:00',
    category: initialProfile.category || roleLabel,
    statusLine: initialProfile.statusLine || 'Available for operational updates',
    about: initialProfile.about || '',
    avatar: initialProfile.avatar || '',
    coverTone: initialProfile.coverTone || '#10b981'
  });

  const profileCompletion = useMemo(() => {
    const checks = [
      profileForm.fullName,
      profileForm.businessName,
      profileForm.title,
      profileForm.department,
      profileForm.industry,
      profileForm.email,
      profileForm.phone,
      profileForm.address,
      profileForm.website,
      profileForm.linkedIn,
      profileForm.businessHours,
      profileForm.category,
      profileForm.statusLine,
      profileForm.about,
      profileForm.avatar
    ];
    const filled = checks.filter((item) => String(item || '').trim()).length;
    return Math.round((filled / checks.length) * 100);
  }, [profileForm]);

  const navTargets = useMemo(() => {
    if (effectiveRole === 'SYSTEM_OWNER') return NAV_BY_ROLE.SYSTEM_OWNER;
    if (effectiveRole === 'ROOT_ADMIN') return NAV_BY_ROLE.ROOT_ADMIN;
    if (effectiveRole === 'FINANCE_CONTROLLER') return NAV_BY_ROLE.FINANCE_CONTROLLER;
    if (effectiveRole === 'OPS_MODERATOR') return NAV_BY_ROLE.OPS_MODERATOR;
    if (effectiveRole === 'SOCIAL_MEDIA_CONTROLLER') return NAV_BY_ROLE.SOCIAL_MEDIA_CONTROLLER;
    if (effectiveRole === 'ACADEMIC_REGISTRAR') return NAV_BY_ROLE.ACADEMIC_REGISTRAR;
    return [];
  }, [effectiveRole]);
  const [activeSection, setActiveSection] = useState(navTargets[0]?.targetId || '');

  useEffect(() => {
    setActiveSection(navTargets[0]?.targetId || '');

    const observedElements = navTargets
      .map(({ targetId }) => document.getElementById(targetId))
      .filter(Boolean);

    if (observedElements.length === 0) return undefined;

    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver((entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (visibleEntry?.target?.id) {
        setActiveSection(visibleEntry.target.id);
      }
    }, { root: null, threshold: [0.35, 0.5, 0.75], rootMargin: '-18% 0px -52% 0px' });

    observedElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [navTargets]);

  useEffect(() => {
    sessionStorage.setItem('learn_lite_sidebar_open', isSidebarOpen ? 'true' : 'false');
  }, [isSidebarOpen]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleNavClick = (targetId) => {
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(targetId);
    }
  };

  const handleProfileSave = async () => {
    setIsProfileSaving(true);
    setProfileError('');
    try {
      localStorage.setItem(profileKey, JSON.stringify(profileForm));
      await authAPI.updateProfile({
        fullName: profileForm.fullName,
        email: profileForm.email,
        title: profileForm.title,
        bio: profileForm.about
      });
      window.dispatchEvent(new Event('learnlite-auth-changed'));
      setIsProfileModalOpen(false);
    } catch (error) {
      setProfileError(getApiErrorMessage(error, 'Profile update failed.'));
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleAvatarUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Please choose a valid image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Profile image must be smaller than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfileError('');
      setProfileForm((prev) => ({ ...prev, avatar: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const isDark = theme === 'dark';
  const isCompactProfile = viewportWidth < 980;
  const isSmallProfile = viewportWidth < 700;
  const isNarrowMobile = viewportWidth < 768;
  const isMobileNav = viewportWidth < 1100;
  const palette = {
    pageBg: isDark ? '#0b0f19' : '#f3f7fb',
    sidebarBg: isDark ? '#111827' : '#ffffff',
    border: isDark ? '#1f2937' : '#d9e3ef',
    muted: isDark ? '#94a3b8' : '#475569',
    text: isDark ? '#e2e8f0' : '#0f172a',
    panel: isDark ? 'linear-gradient(180deg, rgba(17,24,39,0.96) 0%, rgba(15,23,42,0.92) 100%)' : 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(241,245,249,0.92) 100%)'
  };

  const shellBg = {
    background: isDark
      ? 'radial-gradient(1200px 500px at 90% -10%, rgba(16,185,129,0.15), transparent 55%), #0b0f19'
      : 'radial-gradient(1100px 450px at 95% -12%, rgba(14,165,233,0.16), transparent 55%), #eef4ff'
  };

  const navItemStyle = (isActive) => ({
    padding: '11px 12px',
    borderRadius: 12,
    border: isActive ? '1px solid rgba(16,185,129,0.35)' : `1px solid ${palette.border}`,
    background: isActive ? 'rgba(16,185,129,0.12)' : isDark ? 'rgba(15,23,42,0.45)' : 'rgba(248,250,252,0.9)',
    color: isActive ? '#34d399' : palette.text,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.01em'
  });

  const cardPanel = {
    background: palette.panel,
    border: `1px solid ${palette.border}`,
    borderRadius: 16,
    boxShadow: '0 12px 30px rgba(0,0,0,0.24)'
  };

  const contentShellStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: isSmallProfile ? '18px' : '28px',
    background: isDark ? 'rgba(11,15,25,0.28)' : 'rgba(248,250,252,0.7)'
  };

  const sectionFrameStyle = {
    border: `1px solid ${palette.border}`,
    borderRadius: 20,
    background: isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(14px)',
    boxShadow: isDark ? '0 18px 40px rgba(0,0,0,0.22)' : '0 18px 40px rgba(15,23,42,0.08)'
  };

  const shellFrameStyle = {
    display: 'flex',
    height: isSmallProfile ? '100vh' : 'calc(100vh - 20px)',
    width: '100%',
    borderRadius: isSmallProfile ? 0 : 18,
    border: `1px solid ${palette.border}`,
    overflow: 'hidden',
    boxShadow: isDark ? '0 20px 50px rgba(2,6,23,0.45)' : '0 20px 50px rgba(15,23,42,0.12)'
  };

  const showSidebar = isMobileNav ? isMobileNavOpen : true;

  const sidebarStyle = {
    width: isSidebarOpen ? '280px' : '84px',
    transition: 'width 0.2s ease, transform 0.24s ease',
    backgroundColor: palette.sidebarBg,
    borderRight: `1px solid ${palette.border}`,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    padding: '14px 12px 12px',
    ...(isMobileNav
      ? {
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 65,
          transform: showSidebar ? 'translateX(0)' : 'translateX(-105%)',
          boxShadow: isDark ? '0 20px 50px rgba(2,6,23,0.45)' : '0 20px 50px rgba(15,23,42,0.18)'
        }
      : {})
  };

  const closeMobileNav = () => {
    if (isMobileNav) {
      setIsMobileNavOpen(false);
    }
  };

  const handleGoBack = () => {
    closeMobileNav();
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', width: '100%', color: palette.text, overflow: 'hidden', ...shellBg, padding: isSmallProfile ? 0 : 10 }}>
      <div style={shellFrameStyle}>
      {isMobileNav && isMobileNavOpen ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.52)', zIndex: 60 }}
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside style={sidebarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center', gap: 10, padding: '10px 12px 18px', fontSize: '18px', fontWeight: '800', color: '#10b981', letterSpacing: '0.04em' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/app-icon.png" alt="Learn Lite" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
            {isSidebarOpen ? <span>LEARN LITE</span> : null}
          </div>
          <div style={{ width: 28, height: 28, borderRadius: 10, background: 'rgba(16,185,129,0.18)', display: 'grid', placeItems: 'center' }}>
            <LayoutGrid size={16} />
          </div>
        </div>
        {isSidebarOpen ? (
          <div style={{ margin: '0 8px 16px', padding: '8px 10px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <p style={{ margin: 0, fontSize: 11, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Workspace</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: isDark ? '#ecfdf5' : '#0f172a' }}>{roleLabel}</p>
          </div>
        ) : null}
        {isSidebarOpen ? <div style={{ margin: '0 8px 14px', color: palette.muted, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>PAGES</div> : null}
        <nav style={{ flex: 1, padding: '0 16px', overflowY: 'auto', scrollBehavior: 'smooth' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {navTargets.map(({ label, targetId }) => (
              <button key={label} type="button" onClick={() => { handleNavClick(targetId); closeMobileNav(); }} style={navItemStyle(activeSection === targetId)} aria-pressed={activeSection === targetId}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ChevronRight size={14} />
                  {isSidebarOpen ? label : null}
                </span>
              </button>
            ))}
          </div>
        </nav>
        <div style={{ padding: '14px 12px', borderTop: `1px solid ${palette.border}`, marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: '999px', background: 'linear-gradient(135deg, #10b981, #0f766e)', display: 'grid', placeItems: 'center', color: '#eff6ff', fontWeight: 800, fontSize: 14, overflow: 'hidden' }}>
            {profileForm.avatar ? <img src={profileForm.avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : effectiveName.slice(0, 2).toUpperCase()}
          </div>
          {isSidebarOpen ? (
            <div style={{ minWidth: 0 }}>
              <p className="m-0 text-sm font-semibold truncate" style={{ color: palette.text }}>{profileForm.fullName || effectiveName}</p>
              <p className="m-0 text-xs truncate" style={{ color: palette.muted }}>{profileForm.title || roleLabel}</p>
            </div>
          ) : null}
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <header style={{ minHeight: isNarrowMobile ? '60px' : '68px', position: 'sticky', top: 0, zIndex: 50, background: isDark ? 'rgba(11,15,25,0.95)' : 'rgba(255,255,255,0.95)', borderBottom: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: isNarrowMobile ? 10 : 16, padding: isNarrowMobile ? '10px 12px' : '0 18px 0 28px', flexWrap: isNarrowMobile ? 'wrap' : 'nowrap', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isNarrowMobile ? 10 : 16, minWidth: 0, flex: isNarrowMobile ? '1 1 auto' : '0 1 auto' }}>
            <button
              type="button"
              onClick={handleGoBack}
              aria-label="Go back"
              title="Go back"
              style={{ ...cardPanel, width: 36, height: 36, display: 'grid', placeItems: 'center', color: palette.muted, flexShrink: 0 }}
            >
              <ArrowLeft size={16} />
            </button>
            <button type="button" onClick={() => {
              if (isMobileNav) {
                setIsMobileNavOpen((prev) => !prev);
              } else {
                setIsSidebarOpen((prev) => !prev);
              }
            }} style={{ ...cardPanel, width: 36, height: 36, display: 'grid', placeItems: 'center', color: palette.muted, flexShrink: 0 }}>
              {isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            {!isNarrowMobile ? (
              <div style={{ ...cardPanel, padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 8, color: palette.muted, minWidth: isSmallProfile ? 180 : 290 }}>
                <Search size={16} />
                <span>Search dashboard routes...</span>
                <span style={{ marginLeft: 10, padding: '2px 6px', borderRadius: 6, border: `1px solid ${palette.border}`, color: palette.muted, fontSize: 11, fontWeight: 700 }}>CTRL+K</span>
              </div>
            ) : (
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: palette.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{roleLabel}</p>
                <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 800, color: palette.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '52vw' }}>{effectiveName}</p>
              </div>
            )}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: isNarrowMobile ? 8 : 12, marginLeft: isNarrowMobile ? 'auto' : 0 }}>
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ ...cardPanel, padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: 8, color: palette.muted }}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {!isNarrowMobile ? <span style={{ fontSize: 12, fontWeight: 700 }}>{theme === 'dark' ? 'Light' : 'Dark'}</span> : null}
            </button>
            {!isNarrowMobile ? (
              <div style={{ ...cardPanel, padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Bell size={18} style={{ color: palette.muted }} />
              <span style={{ width: 20, height: 20, borderRadius: '999px', background: '#ef4444', color: 'white', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>2</span>
              </div>
            ) : null}
            <button type="button" onClick={() => setIsProfileModalOpen(true)} style={{ width: 40, height: 40, borderRadius: '999px', overflow: 'hidden', border: '2px solid rgba(16,185,129,0.45)', background: isDark ? '#0f172a' : '#e2e8f0', display: 'grid', placeItems: 'center', color: palette.muted }}>
              {profileForm.avatar ? <img src={profileForm.avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserCircle2 size={24} />}
            </button>
          </div>
        </header>

        {(effectiveRole === 'SYSTEM_OWNER' || effectiveRole === 'ROOT_ADMIN') && isMobileNav ? (
          <div style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            padding: '8px 12px',
            borderBottom: `1px solid ${palette.border}`,
            background: isDark ? 'rgba(11,15,25,0.72)' : 'rgba(255,255,255,0.86)'
          }}>
            {TEAM_ROUTES.map((team) => (
              <button
                key={`top-${team.path}`}
                type="button"
                onClick={() => navigate(team.path)}
                style={{
                  whiteSpace: 'nowrap',
                  borderRadius: 999,
                  border: location.pathname === team.path ? '1px solid rgba(16,185,129,0.45)' : `1px solid ${palette.border}`,
                  background: location.pathname === team.path ? 'rgba(16,185,129,0.12)' : (isDark ? 'rgba(15,23,42,0.45)' : 'rgba(248,250,252,0.9)'),
                  color: location.pathname === team.path ? '#34d399' : palette.text,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {team.label}
              </button>
            ))}
          </div>
        ) : null}

        <div style={contentShellStyle}>
          <div style={{ maxWidth: 1480, margin: '0 auto' }}>
            <div style={sectionFrameStyle}>
              <div style={{ padding: isSmallProfile ? '18px' : '28px' }}>{children}</div>
            </div>
          </div>
        </div>
      </main>

      {isProfileModalOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'grid', placeItems: isSmallProfile ? 'start center' : 'center', zIndex: 50, padding: isSmallProfile ? 10 : 16, overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: 980, ...cardPanel, padding: isSmallProfile ? 14 : 20, maxHeight: '92vh', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield size={18} style={{ color: '#10b981' }} />
                <h3 style={{ margin: 0, color: palette.text }}>Business Profile Settings</h3>
              </div>
              <button type="button" onClick={() => setIsProfileModalOpen(false)} style={{ border: `1px solid ${palette.border}`, background: 'transparent', color: palette.muted, borderRadius: 10, width: 32, height: 32 }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: isCompactProfile ? '1fr' : 'minmax(260px, 320px) minmax(0, 1fr)', overflowY: 'auto', maxHeight: 'calc(92vh - 120px)', paddingRight: isSmallProfile ? 0 : 4 }}>
              <div style={{ border: `1px solid ${palette.border}`, borderRadius: 14, overflow: 'hidden', background: isDark ? '#0f172a' : '#ffffff' }}>
                <div style={{ height: 88, background: `linear-gradient(120deg, ${profileForm.coverTone} 0%, #0f766e 100%)` }} />
                <div style={{ padding: 16, marginTop: -40 }}>
                  <div style={{ width: 80, height: 80, borderRadius: '999px', border: `3px solid ${isDark ? '#0f172a' : '#ffffff'}`, background: '#10b981', overflow: 'hidden', display: 'grid', placeItems: 'center', fontWeight: 800, color: '#ffffff' }}>
                    {profileForm.avatar ? <img src={profileForm.avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (profileForm.fullName || effectiveName).slice(0, 2).toUpperCase()}
                  </div>
                  <h4 style={{ margin: '12px 0 4px', color: palette.text }}>{profileForm.businessName || 'Business Name'}</h4>
                  <p style={{ margin: 0, color: palette.muted, fontSize: 13 }}>{profileForm.category || roleLabel}</p>
                  <p style={{ margin: '8px 0 0', color: palette.muted, fontSize: 13 }}>{profileForm.statusLine || 'No status message set'}</p>
                  <div style={{ marginTop: 12, display: 'grid', gap: 7, fontSize: 12, color: palette.muted }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Phone size={13} /> {profileForm.phone || 'Phone not set'}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Globe size={13} /> {profileForm.website || 'Website not set'}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><MapPin size={13} /> {profileForm.address || 'Address not set'}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Clock3 size={13} /> {profileForm.businessHours || 'Hours not set'}</span>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: palette.muted }}>Profile completeness</span>
                      <span style={{ fontSize: 12, color: '#34d399', fontWeight: 700 }}>{profileCompletion}%</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 999, background: isDark ? '#1f2937' : '#e2e8f0', overflow: 'hidden' }}>
                      <div style={{ width: `${profileCompletion}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isSmallProfile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Department</span>
                    <input value={profileForm.department} onChange={(e) => setProfileForm((p) => ({ ...p, department: e.target.value }))} placeholder="Department" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Industry</span>
                    <input value={profileForm.industry} onChange={(e) => setProfileForm((p) => ({ ...p, industry: e.target.value }))} placeholder="Industry" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Owner Name</span>
                    <input value={profileForm.fullName} onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))} placeholder="Full name" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Business Name</span>
                    <input value={profileForm.businessName} onChange={(e) => setProfileForm((p) => ({ ...p, businessName: e.target.value }))} placeholder="Business display name" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Professional Title</span>
                    <input value={profileForm.title} onChange={(e) => setProfileForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Category</span>
                    <input value={profileForm.category} onChange={(e) => setProfileForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Business Email</span>
                    <input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Phone Number</span>
                    <input value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Website</span>
                    <input value={profileForm.website} onChange={(e) => setProfileForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://your-domain.com" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>LinkedIn</span>
                    <input value={profileForm.linkedIn} onChange={(e) => setProfileForm((p) => ({ ...p, linkedIn: e.target.value }))} placeholder="https://linkedin.com/in/..." style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Business Hours</span>
                    <input value={profileForm.businessHours} onChange={(e) => setProfileForm((p) => ({ ...p, businessHours: e.target.value }))} placeholder="Mon-Fri 09:00-18:00" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: palette.muted }}>Header Tone</span>
                    <input type="color" value={profileForm.coverTone} onChange={(e) => setProfileForm((p) => ({ ...p, coverTone: e.target.value }))} style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '4px 6px', height: 40, background: isDark ? '#0f172a' : '#ffffff' }} />
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: palette.muted }}>Business Address</span>
                  <input value={profileForm.address} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: palette.muted }}>Status Line</span>
                  <input value={profileForm.statusLine} onChange={(e) => setProfileForm((p) => ({ ...p, statusLine: e.target.value }))} placeholder="Short business status" style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: palette.muted }}>About</span>
                  <textarea value={profileForm.about} onChange={(e) => setProfileForm((p) => ({ ...p, about: e.target.value }))} placeholder="Business description" rows={4} style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '10px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label htmlFor="profileAvatarUpload" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${palette.border}`, borderRadius: 10, padding: '9px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text, cursor: 'pointer', fontWeight: 700 }}>
                    <ImagePlus size={15} /> Upload Profile Photo
                  </label>
                  <input id="profileAvatarUpload" type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                  <input value={profileForm.avatar} onChange={(e) => setProfileForm((p) => ({ ...p, avatar: e.target.value }))} placeholder="or paste image URL" style={{ minWidth: isSmallProfile ? '100%' : 280, flex: 1, border: `1px solid ${palette.border}`, borderRadius: 10, padding: '9px 12px', background: isDark ? '#0f172a' : '#ffffff', color: palette.text }} />
                  <button type="button" onClick={() => setProfileForm((p) => ({ ...p, avatar: '' }))} style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: '9px 12px', background: 'transparent', color: palette.muted, fontWeight: 700, cursor: 'pointer' }}>
                    <Camera size={14} style={{ display: 'inline-block', marginRight: 6 }} /> Remove photo
                  </button>
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#34d399', fontWeight: 700 }}>
                  <CheckCircle2 size={14} /> Business profile follows professional messaging app structure
                </div>

                {profileError ? <p style={{ margin: 0, color: '#f87171', fontSize: 13 }}>{profileError}</p> : null}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: isSmallProfile ? 'stretch' : 'flex-end', gap: 10, marginTop: 14, flexDirection: isSmallProfile ? 'column' : 'row' }}>
              <button type="button" onClick={() => setIsProfileModalOpen(false)} style={{ border: `1px solid ${palette.border}`, borderRadius: 10, background: 'transparent', color: palette.muted, padding: '10px 14px', fontWeight: 700 }}>Cancel</button>
              <button type="button" onClick={handleProfileSave} disabled={isProfileSaving} style={{ border: '1px solid rgba(16,185,129,0.35)', borderRadius: 10, background: 'rgba(16,185,129,0.14)', color: '#34d399', padding: '10px 14px', fontWeight: 700 }}>{isProfileSaving ? 'Saving...' : 'Save Profile'}</button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
