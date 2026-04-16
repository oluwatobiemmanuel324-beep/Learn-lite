import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Search, Moon, LayoutGrid, ChevronRight, UserCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const NAV_BY_ROLE = {
  SYSTEM_OWNER: [
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

export default function DashboardLayout({ children, userRole, userName }) {
  const { role, roleLabel, user, token } = useAuth();
  const effectiveRole = userRole || role;
  const effectiveName = userName || user?.username || 'User';

  const navTargets = useMemo(() => {
    if (effectiveRole === 'SYSTEM_OWNER') return NAV_BY_ROLE.SYSTEM_OWNER;
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

  const handleNavClick = (targetId) => {
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(targetId);
    }
  };

  const shellBg = {
    background: 'radial-gradient(1200px 500px at 90% -10%, rgba(16,185,129,0.15), transparent 55%), #0b0f19'
  };

  const navItemStyle = (isActive) => ({
    padding: '11px 12px',
    borderRadius: 12,
    border: isActive ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(31,41,55,0.9)',
    background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(15,23,42,0.45)',
    color: isActive ? '#34d399' : '#cbd5e1',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.01em'
  });

  const cardPanel = {
    background: 'linear-gradient(180deg, rgba(17,24,39,0.96) 0%, rgba(15,23,42,0.92) 100%)',
    border: '1px solid #1f2937',
    borderRadius: 16,
    boxShadow: '0 12px 30px rgba(0,0,0,0.24)'
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', color: 'white', overflow: 'hidden', ...shellBg }}>
      <aside style={{ width: '260px', backgroundColor: '#111827', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '14px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 18px', fontSize: '18px', fontWeight: '800', color: '#10b981', letterSpacing: '0.04em' }}>
          <div style={{ width: 28, height: 28, borderRadius: 10, background: 'rgba(16,185,129,0.18)', display: 'grid', placeItems: 'center' }}>
            <LayoutGrid size={16} />
          </div>
          LEARN LITE
        </div>
        <div style={{ margin: '0 8px 16px', padding: '8px 10px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Workspace</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: '#ecfdf5' }}>{roleLabel}</p>
        </div>
        <div style={{ margin: '0 8px 14px', color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>PAGES</div>
        <nav style={{ flex: 1, padding: '0 16px' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {navTargets.map(({ label, targetId }) => (
              <button key={label} type="button" onClick={() => handleNavClick(targetId)} style={navItemStyle(activeSection === targetId)} aria-pressed={activeSection === targetId}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ChevronRight size={14} />
                  {label}
                </span>
              </button>
            ))}
          </div>
        </nav>
        <div style={{ padding: '14px 12px', borderTop: '1px solid #1f2937', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: '999px', background: 'linear-gradient(135deg, #10b981, #0f766e)', display: 'grid', placeItems: 'center', color: '#eff6ff', fontWeight: 800, fontSize: 14 }}>
            {effectiveName.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="m-0 text-sm font-semibold text-slate-100 truncate">{effectiveName}</p>
            <p className="m-0 text-xs text-slate-500 truncate">{roleLabel}</p>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <header style={{ height: '68px', background: 'rgba(11,15,25,0.85)', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px 0 28px', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 10, border: '1px solid #1f2937', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>↳</div>
            <div style={{ ...cardPanel, padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 8, color: '#94a3b8', minWidth: 290 }}>
              <Search size={16} />
              <span>Search dashboard routes...</span>
              <span style={{ marginLeft: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #334155', color: '#cbd5e1', fontSize: 11, fontWeight: 700 }}>⌘K</span>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <div style={{ ...cardPanel, padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Moon size={16} className="text-slate-400" />
            </div>
            <div style={{ ...cardPanel, padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Bell size={18} className="text-slate-400" />
              <span style={{ width: 20, height: 20, borderRadius: '999px', background: '#ef4444', color: 'white', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>2</span>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: '999px', overflow: 'hidden', border: '2px solid rgba(16,185,129,0.45)', background: '#0f172a', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
              <UserCircle2 size={24} />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>{children}</div>
      </main>
    </div>
  );
}
