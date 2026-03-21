import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { groupAPI } from '../services/api';

const backgroundPresets = [
  'linear-gradient(135deg, #0f7b6c 0%, #0b141a 100%)',
  'linear-gradient(135deg, #1f4db8 0%, #08131d 100%)',
  'linear-gradient(135deg, #912f56 0%, #100a12 100%)',
  'linear-gradient(135deg, #6257ff 0%, #111827 100%)',
  'linear-gradient(135deg, #198754 0%, #0f1720 100%)',
  'linear-gradient(135deg, #ff8a00 0%, #1f1b2e 100%)'
];

const reactionOptions = ['👍', '❤️', '😂'];

function WorkspaceState({ title, message, actionLabel, onAction }) {
  return (
    <div className="workspace-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {onAction && (
        <button className="workspace-ghost-button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default function QuizGenerator() {
  const navigate = useNavigate();
  const { id: groupId } = useParams();
  const fileInputRef = useRef(null);
  const bgImageInputRef = useRef(null);

  const [group, setGroup] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [customBackground, setCustomBackground] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newJoinCode, setNewJoinCode] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [attachedNote, setAttachedNote] = useState(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [workspaceMessages, setWorkspaceMessages] = useState([]);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);

  const normalizeBackgroundForCss = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (/^data:image\//i.test(trimmed)) {
      return `url("${trimmed}")`;
    }
    return trimmed;
  };

  const currentUser = JSON.parse(localStorage.getItem('learn_lite_user') || '{}');
  const currentUsername = currentUser?.username || 'You';

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    const fetchGroup = async () => {
      try {
        const result = await groupAPI.getGroupWorkspace(groupId);
        if (result.success && result.group) {
          setGroup(result.group);
          setCurrentUserRole(result.group.currentUserRole);
          setCustomBackground(normalizeBackgroundForCss(result.group.currentUserBackground));
        } else {
          setError(result.error || 'Failed to load group');
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Server error');
        console.error('Fetch group error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [groupId]);

  const appendWorkspaceMessage = (message) => {
    setWorkspaceMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        reactions: {},
        replyTo: null,
        ...message
      }
    ]);
  };

  const handleReplyToMessage = (message) => {
    if (message.tone === 'system') return;

    setReplyTarget({
      id: message.id,
      title: message.title,
      text: message.text
    });
  };

  const handleToggleReaction = (messageId, emoji) => {
    setWorkspaceMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const currentUsers = message.reactions?.[emoji] || [];
        const hasReacted = currentUsers.includes(currentUsername);
        const nextUsers = hasReacted
          ? currentUsers.filter((username) => username !== currentUsername)
          : [...currentUsers, currentUsername];

        const nextReactions = {
          ...(message.reactions || {}),
          [emoji]: nextUsers
        };

        if (nextUsers.length === 0) {
          delete nextReactions[emoji];
        }

        return {
          ...message,
          reactions: nextReactions
        };
      })
    );
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this user from the group?')) return;

    try {
      const result = await groupAPI.removeMember(groupId, userId);
      if (result.success) {
        setGroup((current) => ({
          ...current,
          members: current.members.filter((member) => member.user.id !== userId)
        }));
        appendWorkspaceMessage({
          tone: 'system',
          title: 'Member removed',
          text: 'The member list has been updated for everyone in this group view.'
        });
      } else {
        alert(result.error || 'Failed to remove member');
      }
    } catch (err) {
      alert('Error removing member: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePromoteAdmin = async (userId) => {
    if (!window.confirm('Promote this user to Admin?')) return;

    try {
      const result = await groupAPI.promoteToAdmin(groupId, userId);
      if (result.success) {
        setGroup((current) => ({
          ...current,
          members: current.members.map((member) =>
            member.user.id === userId ? { ...member, role: 'ADMIN' } : member
          )
        }));
        appendWorkspaceMessage({
          tone: 'system',
          title: 'Admin updated',
          text: 'A member has been promoted to admin.'
        });
      } else {
        alert(result.error || 'Failed to promote member');
      }
    } catch (err) {
      alert('Error promoting member: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleChangeJoinCode = async () => {
    if (!newJoinCode && !window.confirm('Generate a new random join code?')) return;

    try {
      const result = await groupAPI.updateGroupCode(groupId, newJoinCode || undefined);
      if (result.success) {
        setGroup((current) => ({ ...current, joinCode: result.group.joinCode }));
        setNewJoinCode('');
        setShowCodeInput(false);
        appendWorkspaceMessage({
          tone: 'system',
          title: 'Join code refreshed',
          text: `Current invite code is now ${result.group.joinCode}.`
        });
      } else {
        alert(result.error || 'Failed to update join code');
      }
    } catch (err) {
      alert('Error updating join code: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSetBackground = async (backgroundValue) => {
    const normalizedBackground = normalizeBackgroundForCss(backgroundValue);

    try {
      const result = await groupAPI.setCustomBackground(groupId, normalizedBackground);
      if (result.success) {
        setCustomBackground(normalizedBackground);
      } else {
        alert(result.error || 'Failed to set background');
      }
    } catch (err) {
      alert('Error setting background: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSelectNote = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAttachedNote(file);
    appendWorkspaceMessage({
      tone: 'outgoing',
      title: 'Note attached',
      text: `${file.name} is attached to this workspace and ready for the next study action.`
    });
    event.target.value = '';
  };

  const handleSendMessage = async () => {
    if (!draftMessage.trim()) return;

    const messageText = draftMessage.trim();
    const mentionsAI = /@learnlite/i.test(messageText);
    const outgoingReply = replyTarget
      ? {
          id: replyTarget.id,
          title: replyTarget.title,
          text: replyTarget.text
        }
      : null;

    // Add user message to chat
    appendWorkspaceMessage({
      tone: 'outgoing',
      title: currentUsername,
      text: messageText,
      replyTo: outgoingReply
    });

    // If message mentions @learnlite, trigger AI response
    if (mentionsAI) {
      // Simulate AI thinking delay
      setTimeout(() => {
        appendWorkspaceMessage({
          tone: 'incoming',
          title: '@learnlite',
          text: "Hey there! I'm @learnlite, your study companion. How can I help you learn today? Ask me anything about your classwork, and I'll do my best to help! 📚",
          replyTo: {
            id: `${Date.now()}-prompt`,
            title: currentUsername,
            text: messageText
          }
        });
      }, 800);
    }

    setDraftMessage('');
    setReplyTarget(null);
  };

  const handleGenerateQuizShortcut = () => {
    if (!attachedNote) {
      alert('Upload a note first so the workspace knows what to generate from.');
      return;
    }

    appendWorkspaceMessage({
      tone: 'system',
      title: 'Generate quiz',
      text: `Quiz generation has been staged for ${attachedNote.name}. Wire this action to the quiz backend next.`
    });
  };

  const handleGenerateVideoShortcut = () => {
    navigate('/generate-video');
  };

  const handleSelectBackgroundImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      event.target.value = '';
      return;
    }

    // Keep payload size low to avoid API body limit errors when persisting base64.
    const maxSizeBytes = 4 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert('Image too large. Please upload an image smaller than 4MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      handleSetBackground(dataUrl);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  if (loading) {
    return (
      <div className="workspace-shell workspace-shell--centered">
        <WorkspaceState title="Loading workspace" message="Preparing the class chat and member space..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="workspace-shell workspace-shell--centered">
        <WorkspaceState
          title="Workspace error"
          message={error}
          actionLabel="Return Home"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="workspace-shell workspace-shell--centered">
        <WorkspaceState
          title="Group not found"
          message="This class workspace does not exist anymore or you no longer have access to it."
          actionLabel="Return Home"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  const isAdmin = currentUserRole === 'ADMIN';
  const isCreator = group.createdById === Number(localStorage.getItem('user_id') || '0');
  const activeBackground = customBackground || 'linear-gradient(180deg, rgba(11, 20, 26, 0.96), rgba(11, 20, 26, 0.98))';

  return (
    <div className="workspace-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*,.txt,.doc,.docx"
        style={{ display: 'none' }}
        onChange={handleSelectNote}
      />
      <input
        ref={bgImageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleSelectBackgroundImage}
      />

      <div className="workspace-layout workspace-layout--full-width">
        {/* Hidden sidebar, revealed as modal on demand */}
        {showGroupDetails && (
          <div className="workspace-modal-overlay" onClick={() => setShowGroupDetails(false)}>
            <div className="workspace-modal" onClick={(e) => e.stopPropagation()}>
              <div className="workspace-modal__header">
                <h2>Group Details</h2>
                <button className="workspace-modal__close" onClick={() => setShowGroupDetails(false)}>×</button>
              </div>

              <div className="workspace-modal__content">
                <div className="workspace-sidebar__hero">
                  <div className="workspace-avatar">{group.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <h1>{group.name}</h1>
                    <p>{group.members.length} member{group.members.length === 1 ? '' : 's'} in this study room</p>
                  </div>
                </div>

                <div className="workspace-join-code-card">
                  <span className="workspace-card-label">Invite code</span>
                  <div className="workspace-join-code-row">
                    <code>{group.joinCode}</code>
                    {isAdmin && (
                      <button className="workspace-pill-button" onClick={() => setShowCodeInput((current) => !current)}>
                        {showCodeInput ? 'Close' : 'Change'}
                      </button>
                    )}
                  </div>
                  {showCodeInput && (
                    <div className="workspace-join-code-form">
                      <input
                        type="text"
                        maxLength="6"
                        placeholder="ABC123"
                        value={newJoinCode}
                        onChange={(event) => setNewJoinCode(event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 6))}
                      />
                      <button className="workspace-primary-button" onClick={handleChangeJoinCode}>
                        {newJoinCode ? 'Set code' : 'Generate'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="workspace-personalization-card">
                  <h3>Personalize your space</h3>
                  <p>Choose a background or upload a custom image (only visible to you)</p>
                  
                  <div className="workspace-background-grid" style={{ marginTop: '12px' }}>
                    {backgroundPresets.map((backgroundValue) => (
                      <button
                        key={backgroundValue}
                        className={`workspace-background-swatch${customBackground === backgroundValue ? ' is-active' : ''}`}
                        style={{ background: backgroundValue }}
                        onClick={() => handleSetBackground(backgroundValue)}
                      />
                    ))}
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                    <button className="workspace-inline-button" onClick={() => bgImageInputRef.current?.click()}>
                      Upload Image
                    </button>
                    <button className="workspace-inline-button" onClick={() => handleSetBackground(null)}>
                      Clear background
                    </button>
                  </div>
                </div>

                <div className="workspace-members">
                  <div className="workspace-section-heading">
                    <h2>Members</h2>
                    <span>{group.members.length}</span>
                  </div>

                  <div className="workspace-member-list">
                    {group.members.map((member) => (
                      <div className="workspace-member-card" key={member.user.id}>
                        <div className="workspace-member-main">
                          <div className="workspace-member-avatar">{member.user.username.slice(0, 1).toUpperCase()}</div>
                          <div>
                            <div className="workspace-member-name">{member.user.username}</div>
                            <div className="workspace-member-email">{member.user.email}</div>
                            <div className="workspace-member-role">{member.role}</div>
                          </div>
                        </div>

                        {isAdmin && (
                          <div className="workspace-member-actions">
                            {member.role === 'MEMBER' && isCreator && (
                              <button className="workspace-mini-button workspace-mini-button--accent" onClick={() => handlePromoteAdmin(member.user.id)}>
                                Promote
                              </button>
                            )}
                            <button className="workspace-mini-button workspace-mini-button--danger" onClick={() => handleRemoveMember(member.user.id)}>
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <aside className="workspace-sidebar workspace-sidebar--hidden">
          <div className="workspace-sidebar__top">
            <button className="workspace-ghost-button" onClick={() => navigate('/')}>
              Back Home
            </button>
            <div className="workspace-sidebar__badge">Class Group</div>
          </div>

          <div className="workspace-sidebar__hero">
            <div className="workspace-avatar">{group.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <h1>{group.name}</h1>
              <p>{group.members.length} member{group.members.length === 1 ? '' : 's'} in this study room</p>
            </div>
          </div>

          <div className="workspace-join-code-card">
            <span className="workspace-card-label">Invite code</span>
            <div className="workspace-join-code-row">
              <code>{group.joinCode}</code>
              {isAdmin && (
                <button className="workspace-pill-button" onClick={() => setShowCodeInput((current) => !current)}>
                  {showCodeInput ? 'Close' : 'Change'}
                </button>
              )}
            </div>
            {showCodeInput && (
              <div className="workspace-join-code-form">
                <input
                  type="text"
                  maxLength="6"
                  placeholder="ABC123"
                  value={newJoinCode}
                  onChange={(event) => setNewJoinCode(event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 6))}
                />
                <button className="workspace-primary-button" onClick={handleChangeJoinCode}>
                  {newJoinCode ? 'Set code' : 'Generate'}
                </button>
              </div>
            )}
          </div>

          <div className="workspace-members">
            <div className="workspace-section-heading">
              <h2>Members</h2>
              <span>{group.members.length}</span>
            </div>

            <div className="workspace-member-list">
              {group.members.map((member) => (
                <div className="workspace-member-card" key={member.user.id}>
                  <div className="workspace-member-main">
                    <div className="workspace-member-avatar">{member.user.username.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <div className="workspace-member-name">{member.user.username}</div>
                      <div className="workspace-member-email">{member.user.email}</div>
                      <div className="workspace-member-role">{member.role}</div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="workspace-member-actions">
                      {member.role === 'MEMBER' && isCreator && (
                        <button className="workspace-mini-button workspace-mini-button--accent" onClick={() => handlePromoteAdmin(member.user.id)}>
                          Promote
                        </button>
                      )}
                      <button className="workspace-mini-button workspace-mini-button--danger" onClick={() => handleRemoveMember(member.user.id)}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="workspace-chat-panel">
          <header className="workspace-chat-header">
            <button className="workspace-ghost-button" onClick={() => navigate(-1)}>
              Back
            </button>
            <button
              className="workspace-chat-header__group-button"
              onClick={() => setShowGroupDetails(true)}
            >
              <div className="workspace-chat-avatar">{group.name.slice(0, 1).toUpperCase()}</div>
              <div>
                <h2>{group.name}</h2>
                <p>{isAdmin ? 'Admin controls enabled' : 'Member view'} • collaborative learning space</p>
              </div>
            </button>

            <div className="workspace-chat-header__meta">
              <span>{attachedNote ? `Attached: ${attachedNote.name}` : 'No note attached yet'}</span>
            </div>
          </header>

          <div className="workspace-chat-body" style={{ background: activeBackground }}>
            <div className="workspace-chat-scroll">
              <div className="workspace-day-separator">Today</div>

              <article className="workspace-message workspace-message--incoming">
                <span className="workspace-message__eyebrow">Workspace</span>
                <h3>Welcome to {group.name}</h3>
                <p>
                  This room now behaves like a focused class chat. Use the composer below to attach notes, stage quiz work,
                  or jump into video tutorial creation. Mention @learnlite to chat with your AI study assistant! 🤖
                </p>
              </article>

              <article className="workspace-message workspace-message--outgoing">
                <span className="workspace-message__eyebrow">Group code</span>
                <h3>{group.joinCode}</h3>
                <p>Share this code with classmates who should join this workspace.</p>
              </article>

              {workspaceMessages.map((message) => (
                <article
                  className={`workspace-message ${message.tone === 'outgoing' ? 'workspace-message--outgoing' : 'workspace-message--incoming'}`}
                  key={message.id}
                >
                  {message.replyTo && (
                    <div className="workspace-message__reply-context">
                      <strong>{message.replyTo.title}</strong>
                      <span>{message.replyTo.text}</span>
                    </div>
                  )}
                  <span className="workspace-message__eyebrow">{message.title}</span>
                  <p>{message.text}</p>

                  {message.tone !== 'system' && (
                    <div className="workspace-message__footer">
                      <button
                        className="workspace-message__reply-button"
                        onClick={() => handleReplyToMessage(message)}
                      >
                        Reply
                      </button>

                      <div className="workspace-message__reaction-picker">
                        {reactionOptions.map((emoji) => {
                          const reactionUsers = message.reactions?.[emoji] || [];
                          const isActive = reactionUsers.includes(currentUsername);

                          return (
                            <button
                              key={`${message.id}-${emoji}`}
                              className={`workspace-message__reaction-button${isActive ? ' is-active' : ''}`}
                              onClick={() => handleToggleReaction(message.id, emoji)}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {Object.keys(message.reactions || {}).length > 0 && (
                    <div className="workspace-message__reactions">
                      {Object.entries(message.reactions).map(([emoji, usernames]) => (
                        <span className="workspace-message__reaction-pill" key={`${message.id}-${emoji}-count`}>
                          {emoji} {usernames.length}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>

          <div className="workspace-composer-wrap">
            {replyTarget && (
              <div className="workspace-reply-preview">
                <div>
                  <span>Replying to {replyTarget.title}</span>
                  <strong>{replyTarget.text}</strong>
                </div>
                <button className="workspace-mini-button workspace-mini-button--danger" onClick={() => setReplyTarget(null)}>
                  Cancel
                </button>
              </div>
            )}

            {attachedNote && (
              <div className="workspace-attached-note">
                <span>Attached note</span>
                <strong>{attachedNote.name}</strong>
              </div>
            )}

            <div className="workspace-composer">
              <div className="workspace-composer__actions">
                <button
                  className="workspace-icon-button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Upload note"
                  title="Upload note"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  className="workspace-icon-button workspace-icon-button--secondary"
                  onClick={handleGenerateQuizShortcut}
                  aria-label="Generate quiz"
                  title="Generate quiz"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 7H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9 17H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>

                <button
                  className="workspace-icon-button workspace-icon-button--secondary"
                  onClick={handleGenerateVideoShortcut}
                  aria-label="Generate video tutorial"
                  title="Generate video tutorial"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="6" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                    <path d="M16 10L21 7V17L16 14V10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <textarea
                rows={1}
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                placeholder="Type a class update, a study prompt, or a quick instruction..."
              />

              <button
                className="workspace-send-button workspace-send-button--icon"
                onClick={handleSendMessage}
                disabled={!draftMessage.trim()}
                aria-label="Send message"
                title="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}