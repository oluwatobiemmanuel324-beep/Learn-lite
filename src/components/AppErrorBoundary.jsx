import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Unexpected runtime error'
    };
  }

  componentDidCatch(error, info) {
    console.error('AppErrorBoundary caught an error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b0f19',
          color: '#e2e8f0',
          padding: 24
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            borderRadius: 16,
            border: '1px solid #1f2937',
            background: '#111827',
            padding: 24,
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.25)'
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, color: '#f8fafc' }}>Display Recovery Mode</h1>
          <p style={{ margin: '12px 0 0', color: '#94a3b8', lineHeight: 1.6 }}>
            A runtime issue was detected, so the app switched to a safe view instead of showing a blank page.
          </p>
          <p style={{ margin: '10px 0 0', color: '#fca5a5', fontSize: 13 }}>
            Error: {this.state.message}
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                border: '1px solid #334155',
                borderRadius: 10,
                padding: '10px 14px',
                background: '#0f172a',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Return Home
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                border: '1px solid rgba(16,185,129,0.35)',
                borderRadius: 10,
                padding: '10px 14px',
                background: 'rgba(16,185,129,0.12)',
                color: '#34d399',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
