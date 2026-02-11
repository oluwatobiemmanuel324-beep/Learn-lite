import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../services/api';
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
      const message = err.response?.data?.message || err.message || 'Registration failed. Please try again.';
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
          <div className="logo" style={{ width: '64px', height: '64px', margin: '0 auto 16px', fontSize: '20px' }}>
            LL
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
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="••••••••"
              minLength="6"
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
            <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="••••••••"
              minLength="6"
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
