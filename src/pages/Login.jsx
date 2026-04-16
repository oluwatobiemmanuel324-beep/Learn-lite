import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI, getApiErrorMessage } from '../services/api';
import { useApp } from '../context/AppContext';

export default function Login() {
  const navigate = useNavigate();
  const { theme } = useApp();
  const submitLockRef = useRef(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldownEndsAt, setCooldownEndsAt] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState('request');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');

  useEffect(() => {
    if (!cooldownEndsAt) return undefined;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
      setCooldownSeconds(remaining);
      if (remaining === 0) {
        setCooldownEndsAt(0);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownEndsAt]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError(''); // Clear error on change
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLockRef.current || loading) return;

    setError('');
    setLoading(true);
    submitLockRef.current = true;

    try {
      console.log('🔐 Attempting login:', { email: formData.email });
      const response = await authAPI.login(formData.email, formData.password);
      console.log('✅ Login successful:', { token: response.token?.slice(0, 20) + '...', role: response.user?.role });
      
      if (response.token) {
        localStorage.setItem('learn_lite_token', response.token);
        if (response.user) {
          localStorage.setItem('learn_lite_user', JSON.stringify(response.user));
          localStorage.setItem('user_id', response.user.id);
          localStorage.setItem('user_role', response.user.role || 'USER');
        }
        window.dispatchEvent(new Event('learnlite-auth-changed'));
        console.log('📍 Redirecting to:', response.redirectPath || '/');
        navigate(response.redirectPath || '/');
      } else {
        setError('Login failed. No token received.');
      }
    } catch (err) {
      console.error('❌ Login error:', { 
        status: err.response?.status,
        error: err.response?.data?.error,
        message: err.message 
      });
      let message = getApiErrorMessage(err, 'Login failed. Please try again.');

      if (err.response?.status === 429) {
        const retryAfterHeader = Number(err.response?.headers?.['retry-after'] || err.response?.headers?.['Retry-After'] || 0);
        const retryAfterSeconds = Number(err.response?.data?.retryAfterSeconds || retryAfterHeader || 60);
        setCooldownEndsAt(Date.now() + Math.max(15, retryAfterSeconds) * 1000);
        message = `Too many login attempts. Try again in ${Math.max(15, retryAfterSeconds)} seconds.`;
      }

      setError(message);
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  const resetForgotFlow = () => {
    setForgotStep('request');
    setForgotLoading(false);
    setForgotEmail('');
    setForgotOtp('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setForgotMessage('');
    setForgotError('');
  };

  const handleForgotOpen = () => {
    setForgotOpen(true);
    setForgotMessage('');
    setForgotError('');
    if (!forgotEmail) {
      setForgotEmail(formData.email || '');
    }
  };

  const handleForgotClose = () => {
    setForgotOpen(false);
    resetForgotFlow();
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    if (forgotLoading) return;

    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');

    try {
      await authAPI.requestPasswordResetOtp(forgotEmail);
      setForgotStep('verify');
      setForgotMessage('If the account exists, a 6-digit OTP was sent to your email.');
    } catch (err) {
      setForgotError(getApiErrorMessage(err, 'Unable to send reset OTP.'));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotVerify = async (e) => {
    e.preventDefault();
    if (forgotLoading) return;

    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');

    try {
      const response = await authAPI.verifyPasswordResetOtp(forgotEmail, forgotOtp);
      setResetToken(response.resetToken || '');
      setForgotStep('reset');
      setForgotMessage('OTP verified. Set your new password now.');
    } catch (err) {
      setForgotError(getApiErrorMessage(err, 'OTP verification failed.'));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotReset = async (e) => {
    e.preventDefault();
    if (forgotLoading) return;

    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');

    try {
      await authAPI.resetPasswordWithOtp({
        resetToken,
        newPassword,
        confirmPassword
      });

      setForgotMessage('Password reset successful. You can sign in with the new password.');
      setForgotStep('done');
      setTimeout(() => {
        handleForgotClose();
      }, 1200);
    } catch (err) {
      setForgotError(getApiErrorMessage(err, 'Password reset failed.'));
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '480px', marginTop: '80px' }}>
      <div className="hero-card">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div className="logo" style={{ width: '64px', height: '64px', margin: '0 auto 16px', fontSize: '20px', overflow: 'hidden' }}>
            <img
              src="/app-icon.png"
              alt="Learn Lite logo"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px' }}>Welcome Back</h1>
          <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
            Sign in to continue to Learn Lite
          </p>
        </div>

        <form onSubmit={handleSubmit} method="POST" autoComplete="on">
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="username"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'var(--glass-2)',
                color: 'var(--text)',
                fontSize: '16px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '12px 44px 12px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'var(--glass-2)',
                  color: 'var(--text)',
                  fontSize: '16px',
                  fontFamily: 'inherit'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 3L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10.6 10.6A2 2 0 0013.4 13.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9.9 5.1A11 11 0 0112 4C17 4 21 8 22 12C21.6 13.8 20.6 15.4 19.3 16.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M6.7 7.4C5.4 8.6 4.4 10.2 4 12C5 16 9 20 14 20C16.1 20 18 19.3 19.5 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2 12C3 7 7 4 12 4C17 4 21 7 22 12C21 17 17 20 12 20C7 20 3 17 2 12Z" stroke="currentColor" strokeWidth="2" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: 'rgba(255, 23, 68, 0.1)',
                border: '1px solid var(--accent-2)',
                marginBottom: '16px',
                fontSize: '14px',
                color: 'var(--accent-2)'
              }}
            >
              {error}
            </div>
          )}

          {cooldownSeconds > 0 ? (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                fontSize: '14px',
                color: '#fbbf24'
              }}
            >
              Login is temporarily rate limited. Please wait {cooldownSeconds}s and try again.
            </div>
          ) : null}

          <button type="submit" className="btn" disabled={loading || cooldownSeconds > 0} style={{ width: '100%', padding: '14px' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={handleForgotOpen}
            style={{
              marginTop: '12px',
              width: '100%',
              background: 'transparent',
              border: '1px solid var(--glass)',
              color: 'var(--muted)',
              borderRadius: '8px',
              padding: '12px',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            Forgot password?
          </button>
        </form>

        {forgotOpen ? (
          <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass)', background: 'var(--glass-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Reset Password</h2>
              <button
                type="button"
                onClick={handleForgotClose}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px' }}
              >
                Close
              </button>
            </div>

            {forgotMessage ? (
              <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '14px' }}>
                {forgotMessage}
              </div>
            ) : null}

            {forgotError ? (
              <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '8px', background: 'rgba(255, 23, 68, 0.1)', border: '1px solid rgba(255, 23, 68, 0.3)', color: 'var(--accent-2)', fontSize: '14px' }}>
                {forgotError}
              </div>
            ) : null}

            {forgotStep === 'request' ? (
              <form onSubmit={handleForgotRequest}>
                <label htmlFor="forgotEmail" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
                  Email address
                </label>
                <input
                  type="email"
                  id="forgotEmail"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{ width: '100%', marginBottom: '12px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'var(--glass-2)', color: 'var(--text)', fontSize: '16px' }}
                />
                <button type="submit" className="btn" disabled={forgotLoading} style={{ width: '100%', padding: '12px' }}>
                  {forgotLoading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            ) : null}

            {forgotStep === 'verify' ? (
              <form onSubmit={handleForgotVerify}>
                <label htmlFor="forgotOtp" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
                  Enter OTP
                </label>
                <input
                  type="text"
                  id="forgotOtp"
                  inputMode="numeric"
                  maxLength={6}
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  placeholder="6-digit code"
                  style={{ width: '100%', marginBottom: '12px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'var(--glass-2)', color: 'var(--text)', fontSize: '16px', letterSpacing: '0.2em', textAlign: 'center' }}
                />
                <button type="submit" className="btn" disabled={forgotLoading} style={{ width: '100%', padding: '12px' }}>
                  {forgotLoading ? 'Verifying...' : 'Verify OTP'}
                </button>
              </form>
            ) : null}

            {forgotStep === 'reset' ? (
              <form onSubmit={handleForgotReset}>
                <label htmlFor="newPassword" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
                  New password
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password"
                  style={{ width: '100%', marginBottom: '12px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'var(--glass-2)', color: 'var(--text)', fontSize: '16px' }}
                />
                <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
                  Confirm new password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repeat new password"
                  style={{ width: '100%', marginBottom: '12px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'var(--glass-2)', color: 'var(--text)', fontSize: '16px' }}
                />
                <button type="submit" className="btn" disabled={forgotLoading} style={{ width: '100%', padding: '12px' }}>
                  {forgotLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px' }}>
          <span className="muted">Don't have an account? </span>
          <Link to="/signup" style={{ color: 'var(--accent)', fontWeight: 700 }}>
            Sign up
          </Link>
        </div>

        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <Link to="/" style={{ color: 'var(--muted)', fontSize: '13px', textDecoration: 'underline' }}>
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
