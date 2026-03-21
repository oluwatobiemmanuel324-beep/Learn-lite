import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { adminAPI, getApiErrorMessage } from '../services/api';
import { Mail, MessageSquare, Send, AlertCircle } from 'lucide-react';

export default function SocialMediaControllerDashboard() {
  useApp();
  const role = localStorage.getItem('user_role') || 'USER';
  const TEMPLATE_PRESETS = {
    instagram: { label: 'Instagram (1080x1080)', width: 1080, height: 1080 },
    x: { label: 'X / Twitter (1600x900)', width: 1600, height: 900 },
    linkedin: { label: 'LinkedIn (1200x627)', width: 1200, height: 627 }
  };

  const BRAND_THEMES = {
    aurora: {
      label: 'Learn Lite Aurora',
      gradientStart: '#0f172a',
      gradientEnd: '#1d4ed8',
      accent: '#22d3ee',
      panel: 'rgba(15, 23, 42, 0.42)',
      title: '#f8fafc',
      body: '#dbeafe',
      meta: '#93c5fd'
    },
    sunrise: {
      label: 'Learn Lite Sunrise',
      gradientStart: '#7c2d12',
      gradientEnd: '#f59e0b',
      accent: '#fde68a',
      panel: 'rgba(124, 45, 18, 0.45)',
      title: '#fff7ed',
      body: '#ffedd5',
      meta: '#fdba74'
    },
    mint: {
      label: 'Learn Lite Mint',
      gradientStart: '#064e3b',
      gradientEnd: '#14b8a6',
      accent: '#a7f3d0',
      panel: 'rgba(6, 78, 59, 0.45)',
      title: '#ecfeff',
      body: '#ccfbf1',
      meta: '#99f6e4'
    }
  };

  const [contacts, setContacts] = useState([]);
  const [marketingFeed, setMarketingFeed] = useState({ topWeeklyScores: [], newCourseLaunches: [], socialCards: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('instagram');
  const [selectedTheme, setSelectedTheme] = useState('aurora');

  // Check authorization
  if (role !== 'SOCIAL_MEDIA_CONTROLLER' && role !== 'SYSTEM_OWNER') {
    return <Navigate to="/login" replace />;
  }

  // Fetch contacts
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [response, feedResponse] = await Promise.all([
          adminAPI.getSocialMediaWorkplace(),
          adminAPI.getSocialMarketingFeed()
        ]);
        setContacts(response.workplace?.contacts || []);
        setMarketingFeed(feedResponse.feed || { topWeeklyScores: [], newCourseLaunches: [], socialCards: [] });
      } catch (err) {
        console.error('Error fetching contacts:', err);
        setError(getApiErrorMessage(err) || 'Failed to load contacts');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Handle mark contact as read
  const handleMarkAsRead = async (contactId) => {
    try {
      await adminAPI.markContactRead(contactId);
      setContacts(prev =>
        prev.map(c => c.id === contactId ? { ...c, status: 'read' } : c)
      );
    } catch (err) {
      console.error('Error marking contact as read:', err);
    }
  };

  // Handle submit reply
  const handleSubmitReply = async () => {
    if (!replyText.trim() || !selectedContact) return;

    setSubmittingReply(true);
    try {
      await adminAPI.replyToContact(selectedContact.id, replyText);
      
      // Update contact status to responded
      setContacts(prev =>
        prev.map(c => c.id === selectedContact.id ? { ...c, status: 'responded' } : c)
      );
      
      // Update selected contact with new reply
      setSelectedContact(prev => ({
        ...prev,
        status: 'responded',
        replies: [...(prev.replies || []), {
          id: Date.now(),
          responderEmail: 'You',
          replyBody: replyText,
          createdAt: new Date().toISOString()
        }]
      }));
      
      setReplyText('');
    } catch (err) {
      console.error('Error submitting reply:', err);
      alert(getApiErrorMessage(err) || 'Failed to send reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading contacts...</p>
      </div>
    );
  }

  const unreadCount = contacts.filter(c => c.status === 'unread').length;
  const respondedCount = contacts.filter(c => c.status === 'responded').length;
  const drawWrappedText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = String(text || '').split(' ');
    const lines = [];
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
    lines.forEach((line, index) => {
      ctx.fillText(line, x, y + (index * lineHeight));
    });

    return lines.length;
  };

  const createCardPngUrl = (card, templateKey, themeKey) => {
    const template = TEMPLATE_PRESETS[templateKey] || TEMPLATE_PRESETS.instagram;
    const theme = BRAND_THEMES[themeKey] || BRAND_THEMES.aurora;
    const width = template.width;
    const height = template.height;
    const cardPadding = Math.round(width * 0.06);
    const titleSize = Math.max(30, Math.round(width * 0.06));
    const bodySize = Math.max(22, Math.round(width * 0.04));
    const badgeSize = Math.max(18, Math.round(width * 0.03));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, theme.gradientStart);
    gradient.addColorStop(1, theme.gradientEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.panel;
    ctx.fillRect(cardPadding, cardPadding, width - (cardPadding * 2), height - (cardPadding * 2));

    ctx.fillStyle = theme.accent;
    ctx.font = `bold ${badgeSize}px Arial`;
    ctx.fillText(String(card.type || 'SOCIAL_CARD').replaceAll('_', ' '), cardPadding + 44, cardPadding + 52);

    ctx.fillStyle = theme.title;
    ctx.font = `bold ${titleSize}px Arial`;
    const headlineLines = drawWrappedText(
      ctx,
      card.headline,
      cardPadding + 44,
      cardPadding + 130,
      width - ((cardPadding + 44) * 2),
      Math.round(titleSize * 1.2)
    );

    ctx.fillStyle = theme.body;
    ctx.font = `${bodySize}px Arial`;
    const bodyStartY = cardPadding + 130 + (headlineLines * Math.round(titleSize * 1.2)) + 28;
    const bodyLines = drawWrappedText(
      ctx,
      card.body,
      cardPadding + 44,
      bodyStartY,
      width - ((cardPadding + 44) * 2),
      Math.round(bodySize * 1.25)
    );

    ctx.fillStyle = theme.meta;
    ctx.font = `italic ${Math.max(16, Math.round(width * 0.025))}px Arial`;
    const metaY = bodyStartY + (bodyLines * Math.round(bodySize * 1.25)) + 40;
    drawWrappedText(
      ctx,
      card.meta,
      cardPadding + 44,
      metaY,
      width - ((cardPadding + 44) * 2),
      Math.max(22, Math.round(width * 0.035))
    );

    ctx.fillStyle = theme.title;
    ctx.font = `bold ${Math.max(20, Math.round(width * 0.03))}px Arial`;
    ctx.fillText('Learn Lite', cardPadding + 44, height - cardPadding - 24);

    ctx.fillStyle = theme.accent;
    ctx.font = `${Math.max(14, Math.round(width * 0.018))}px Arial`;
    ctx.fillText(template.label, width - cardPadding - 260, height - cardPadding - 24);

    return canvas.toDataURL('image/png');
  };

  const exportCards = () => {
    const cards = marketingFeed.socialCards || [];
    if (!cards.length) {
      alert('No social cards available to export.');
      return;
    }

    cards.forEach((card, index) => {
      const url = createCardPngUrl(card, selectedTemplate, selectedTheme);
      const safeHeadline = String(card.headline || 'social-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTemplate}-${selectedTheme}-${String(index + 1).padStart(2, '0')}-${safeHeadline || 'social-card'}.png`;
      a.click();
    });
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0' }}>Social Media & Community Management</h2>
        <p className="muted" style={{ margin: 0 }}>
          Manage contact form submissions and respond to community messages
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'rgba(255, 23, 68, 0.1)',
          border: '1px solid rgba(255, 23, 68, 0.3)',
          color: '#ff1744',
          marginBottom: '16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          fontSize: '14px'
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: 'var(--card)',
          border: '1px solid var(--glass)'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Total Messages</div>
          <div style={{ fontSize: '28px', fontWeight: 700 }}>{contacts.length}</div>
        </div>
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: 'var(--card)',
          border: '1px solid var(--glass)'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Unread</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)' }}>{unreadCount}</div>
        </div>
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: 'var(--card)',
          border: '1px solid var(--glass)'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Responded</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#00c853' }}>{respondedCount}</div>
        </div>
      </div>

      <div style={{
        borderRadius: '8px',
        background: 'var(--card)',
        border: '1px solid var(--glass)',
        padding: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0 }}>Automated Marketing Feed</h4>
            <p className="muted" style={{ margin: '6px 0 0 0', fontSize: '13px' }}>Top 5 weekly scores and new course launches, ready for social posting.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="input"
              style={{ minWidth: 190 }}
            >
              {Object.entries(TEMPLATE_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              className="input"
              style={{ minWidth: 180 }}
            >
              {Object.entries(BRAND_THEMES).map(([key, theme]) => (
                <option key={key} value={key}>{theme.label}</option>
              ))}
            </select>
            <button type="button" className="btn" onClick={exportCards}>Export Branded PNGs</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '14px' }}>
          {(marketingFeed.socialCards || []).map((card, index) => (
            <div key={`${card.type}-${index}`} style={{ border: '1px solid var(--glass)', borderRadius: '8px', padding: '12px', background: 'var(--bg)' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>{card.type}</div>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>{card.headline}</div>
              <div style={{ fontSize: '13px', marginBottom: '8px' }}>{card.body}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{card.meta}</div>
            </div>
          ))}
          {(marketingFeed.socialCards || []).length === 0 && (
            <p className="muted">No social cards available yet. Generate more quiz activity and course launches.</p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
          <div>
            <h5 style={{ margin: '0 0 8px 0' }}>Top 5 Weekly Scores</h5>
            {(marketingFeed.topWeeklyScores || []).map((entry) => (
              <div key={entry.userId} style={{ fontSize: '13px', marginBottom: '6px' }}>
                #{entry.rank} {entry.username} - {entry.averageScore}% ({entry.attempts} attempts)
              </div>
            ))}
            {(marketingFeed.topWeeklyScores || []).length === 0 && <p className="muted">No weekly score data yet.</p>}
          </div>
          <div>
            <h5 style={{ margin: '0 0 8px 0' }}>New Course Launches</h5>
            {(marketingFeed.newCourseLaunches || []).map((course, index) => (
              <div key={`${course.kind}-${course.id}-${index}`} style={{ fontSize: '13px', marginBottom: '6px' }}>
                {course.title} - {course.subtitle}
              </div>
            ))}
            {(marketingFeed.newCourseLaunches || []).length === 0 && <p className="muted">No new launches this week.</p>}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', minHeight: '500px' }}>
        {/* Contacts List */}
        <div style={{
          borderRadius: '8px',
          background: 'var(--card)',
          border: '1px solid var(--glass)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--glass)' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>Messages</h4>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {contacts.length === 0 ? (
              <div style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '14px'
              }}>
                <Mail size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p>No messages yet</p>
              </div>
            ) : (
              contacts.map(contact => (
                <div
                  key={contact.id}
                  onClick={() => {
                    setSelectedContact(contact);
                    if (contact.status === 'unread') {
                      handleMarkAsRead(contact.id);
                    }
                  }}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--glass)',
                    cursor: 'pointer',
                    background: selectedContact?.id === contact.id ? 'var(--glass)' : 'transparent',
                    transition: 'background 0.2s',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedContact?.id !== contact.id) {
                      e.currentTarget.style.background = 'var(--glass-2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedContact?.id !== contact.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {contact.status === 'unread' && (
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        marginTop: '4px',
                        flexShrink: 0
                      }}></div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {contact.name || 'Anonymous'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {contact.subject}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        {new Date(contact.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Contact Details & Reply */}
        <div style={{
          borderRadius: '8px',
          background: 'var(--card)',
          border: '1px solid var(--glass)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {selectedContact ? (
            <>
              {/* Header */}
              <div style={{ padding: '16px', borderBottom: '1px solid var(--glass)' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700 }}>
                  {selectedContact.subject}
                </h4>
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  From: <strong>{selectedContact.email}</strong>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  Name: <strong>{selectedContact.name || 'Not provided'}</strong>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                  {new Date(selectedContact.timestamp).toLocaleString()}
                </div>
              </div>

              {/* Message Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                <div style={{
                  padding: '12px',
                  background: 'var(--glass)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  marginBottom: '16px'
                }}>
                  {selectedContact.message}
                </div>

                {/* Replies */}
                {selectedContact.replies && selectedContact.replies.length > 0 && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '12px' }}>
                      Replies ({selectedContact.replies.length})
                    </div>
                    {selectedContact.replies.map(reply => (
                      <div key={reply.id} style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                          {reply.responderEmail} • {new Date(reply.createdAt).toLocaleString()}
                        </div>
                        <div style={{
                          padding: '12px',
                          background: 'rgba(25, 118, 255, 0.1)',
                          borderLeft: '3px solid var(--accent)',
                          borderRadius: '4px',
                          fontSize: '13px',
                          lineHeight: '1.5'
                        }}>
                          {reply.replyBody}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reply Input */}
              {selectedContact.status !== 'responded' && (
                <div style={{ padding: '16px', borderTop: '1px solid var(--glass)' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                    Your Reply
                  </label>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your response here..."
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid var(--glass)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      marginBottom: '8px',
                      boxSizing: 'border-box',
                      minHeight: '80px',
                      resize: 'vertical'
                    }}
                  />
                  <button
                    onClick={handleSubmitReply}
                    disabled={!replyText.trim() || submittingReply}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'var(--accent)',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      opacity: (!replyText.trim() || submittingReply) ? 0.5 : 1,
                      transition: 'opacity 0.2s'
                    }}
                  >
                    <Send size={14} />
                    {submittingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
              )}
              {selectedContact.status === 'responded' && (
                <div style={{
                  padding: '16px',
                  borderTop: '1px solid var(--glass)',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: '#00c853'
                }}>
                  ✓ You have already responded to this message
                </div>
              )}
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              textAlign: 'center'
            }}>
              <div>
                <MessageSquare size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p>Select a message to view details and respond</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
