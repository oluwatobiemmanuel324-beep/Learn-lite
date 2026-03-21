import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI, getApiErrorMessage } from '../services/api';
import { useApp } from '../context/AppContext';

export default function Signup() {
  const navigate = useNavigate();
  const { theme } = useApp();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      const message = 'Passwords do not match';
      setError(message);
      alert(message);
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      const message = 'Password must be at least 6 characters';
      setError(message);
      alert(message);
      return;
    }

    setLoading(true);

    try {
      const userData = {
        username: formData.username,
        email: formData.email,
        password: formData.password
      };

      const response = await authAPI.register(userData);

      if (response.token) {
        // authAPI.register already calls client.setToken, but be explicit
        localStorage.setItem('learn_lite_token', response.token);
        
        // Auto-login: redirect to home
        alert('Account created successfully! Welcome to Learn Lite.');
        navigate('/');
      } else {
        // No token returned, redirect to login
        alert('Account created! Please log in.');
        navigate('/login');
      }
    } catch (err) {
      console.error('Signup error:', err);
      const message = getApiErrorMessage(err, 'Registration failed. Please try again.');
      setError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '480px', marginTop: '60px' }}>
      <div className="hero-card">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div className="logo" style={{ width: '64px', height: '64px', margin: '0 auto 16px', fontSize: '20px', overflow: 'hidden' }}>
            <img
              src="/app-icon.png"
              alt="Learn Lite logo"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px' }}>Create Account</h1>
          <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
            Join Learn Lite and start studying smarter
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="username" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
              Username
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="john_doe"
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

          <div style={{ marginBottom: '16px' }}>
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
                minLength="6"
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

          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="••••••••"
                minLength="6"
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
                onClick={() => setShowConfirmPassword((current) => !current)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
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
                {showConfirmPassword ? (
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
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px' }}>
          <span className="muted">Already have an account? </span>
          <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 700 }}>
            Sign in
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
