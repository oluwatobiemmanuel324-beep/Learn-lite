import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI, getApiErrorMessage } from '../services/api';
import { useApp } from '../context/AppContext';

export default function Login() {
  const navigate = useNavigate();
  const { theme } = useApp();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError(''); // Clear error on change
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

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
      const message = getApiErrorMessage(err, 'Login failed. Please try again.');
      setError(message);
      alert(message);
    } finally {
      setLoading(false);
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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
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

          <button type="submit" className="btn" disabled={loading} style={{ width: '100%', padding: '14px' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

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
