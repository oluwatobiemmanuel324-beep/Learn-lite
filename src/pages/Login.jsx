import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useApp } from '../context/AppContext';

export default function Login() {
  const navigate = useNavigate();
  const { theme } = useApp();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
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
    setLoading(true);

    try {
      const response = await authAPI.login(formData.email, formData.password);
      
      if (response.token) {
        // authAPI.login already calls client.setToken, but we can be explicit
        localStorage.setItem('learn_lite_token', response.token);
        
        // Redirect to home/dashboard
        navigate('/');
      } else {
        setError('Login failed. No token received.');
      }
    } catch (err) {
      console.error('Login error:', err);
      const message = err.response?.data?.message || err.message || 'Login failed. Please try again.';
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
          <div className="logo" style={{ width: '64px', height: '64px', margin: '0 auto 16px', fontSize: '20px' }}>
            LL
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
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="••••••••"
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
