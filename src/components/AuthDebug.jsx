import React, { useState, useEffect } from 'react';

function safeParseUser(rawValue) {
  try {
    const parsed = JSON.parse(rawValue || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export default function AuthDebug() {
  const [authState, setAuthState] = useState({
    token: null,
    role: null,
    user: null,
    isVerifying: false
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const updateAuth = () => {
      const token = localStorage.getItem('learn_lite_token');
      const role = localStorage.getItem('user_role');
      const user = safeParseUser(localStorage.getItem('learn_lite_user'));
      
      setAuthState({
        token: token ? `${token.slice(0, 20)}...` : null,
        role: role,
        user: user ? { email: user.email, username: user.username, id: user.id } : null,
        isVerifying: false
      });
    };

    updateAuth();
    window.addEventListener('storage', updateAuth);
    window.addEventListener('learnlite-auth-changed', updateAuth);
    
    return () => {
      window.removeEventListener('storage', updateAuth);
      window.removeEventListener('learnlite-auth-changed', updateAuth);
    };
  }, []);

  const tokenPresent = !!authState.token;
  const rolePresent = !!authState.role;
  const userPresent = !!authState.user;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        fontFamily: 'monospace',
        fontSize: '11px',
        backgroundColor: authState.role ? '#10b981' : '#ef4444',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '6px',
        maxWidth: expanded ? '400px' : '120px',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        transition: 'all 0.2s'
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {!expanded ? (
        <div>
          <strong>Auth</strong>
          <div>Token: {tokenPresent ? '✓' : '✗'}</div>
          <div>Role: {authState.role || '✗'}</div>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Auth Debug</strong>
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Token:</strong> {tokenPresent ? '✓ Present' : '✗ Missing'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Role:</strong> {authState.role || '✗ Missing'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>User:</strong> {authState.user?.email || '✗ Missing'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Username:</strong> {authState.user?.username || '✗ Missing'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>User ID:</strong> {authState.user?.id || '✗ Missing'}
          </div>
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                localStorage.clear();
                window.location.reload();
              }}
              style={{
                width: '100%',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                marginBottom: '4px'
              }}
            >
              Clear & Reload
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetch('http://localhost:4000/api/auth/verify', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('learn_lite_token') || ''}`
                  }
                })
                  .then(r => r.json())
                  .then(d => {
                    console.log('Verify response:', d);
                    alert('Check console for verify response');
                  })
                  .catch(e => alert('Verify failed: ' + e.message));
              }}
              style={{
                width: '100%',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              Test Verify Endpoint
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
