import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function QuizGenerator() {
  const { theme } = useApp();
  const navigate = useNavigate();
  const [uploadedFile, setUploadedFile] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', paddingTop: '60px' }}>
      {/* Header with Back Button */}
      <header style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        background: 'var(--card)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--glass)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        zIndex: 100
      }}>
        <button 
          onClick={() => navigate('/')}
          className="secondary"
          style={{ padding: '8px 16px' }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo" style={{ width: '40px', height: '40px' }}>LL</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Quiz Generator</h2>
            <div className="muted" style={{ fontSize: '12px' }}>Generate quizzes from your notes</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px' }}>
        {/* Under Construction Card */}
        <div className="hero-card" style={{ 
          textAlign: 'center', 
          padding: '60px 40px',
          marginBottom: '30px'
        }}>
          {/* Construction Icon */}
          <div style={{ 
            fontSize: '80px', 
            marginBottom: '20px',
            opacity: 0.8
          }}>
            🚧
          </div>
          
          <h1 style={{ 
            fontSize: '32px', 
            marginBottom: '16px',
            background: 'linear-gradient(135deg, var(--accent), #6ad7ff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Coming Soon
          </h1>
          
          <p className="muted" style={{ 
            fontSize: '16px', 
            maxWidth: '500px', 
            margin: '0 auto 30px',
            lineHeight: '1.6'
          }}>
            The Quiz Generator is currently under construction. We're building an amazing AI-powered 
            quiz creation system that will transform your notes into interactive learning experiences.
          </p>

          {/* Feature Badges */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '12px', 
            justifyContent: 'center',
            marginBottom: '30px'
          }}>
            <span style={{ 
              padding: '8px 16px', 
              background: 'var(--glass)',
              borderRadius: '20px',
              fontSize: '14px',
              border: '1px solid var(--glass)'
            }}>
              📝 Multiple Choice
            </span>
            <span style={{ 
              padding: '8px 16px', 
              background: 'var(--glass)',
              borderRadius: '20px',
              fontSize: '14px',
              border: '1px solid var(--glass)'
            }}>
              ✅ True/False
            </span>
            <span style={{ 
              padding: '8px 16px', 
              background: 'var(--glass)',
              borderRadius: '20px',
              fontSize: '14px',
              border: '1px solid var(--glass)'
            }}>
              📊 Instant Grading
            </span>
            <span style={{ 
              padding: '8px 16px', 
              background: 'var(--glass)',
              borderRadius: '20px',
              fontSize: '14px',
              border: '1px solid var(--glass)'
            }}>
              🤖 AI-Powered
            </span>
          </div>

          <Link to="/" className="btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Return to Home
          </Link>
        </div>

        {/* Preview of What's Coming */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '20px',
          marginTop: '40px'
        }}>
          <div className="hero-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📤</div>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Upload Notes</h3>
            <p className="muted" style={{ fontSize: '14px', margin: 0 }}>
              Support for PDF, images, and text files
            </p>
          </div>

          <div className="hero-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚡</div>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>AI Processing</h3>
            <p className="muted" style={{ fontSize: '14px', margin: 0 }}>
              Smart question generation in seconds
            </p>
          </div>

          <div className="hero-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎯</div>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Take Quiz</h3>
            <p className="muted" style={{ fontSize: '14px', margin: 0 }}>
              Interactive quiz with instant feedback
            </p>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="hero-card" style={{ padding: '30px', marginTop: '40px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '20px' }}>Development Roadmap</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                width: '24px', 
                height: '24px', 
                borderRadius: '50%', 
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px'
              }}>✓</div>
              <span>UI Design & Layout</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                width: '24px', 
                height: '24px', 
                borderRadius: '50%', 
                background: 'var(--glass)',
                border: '2px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px'
              }}>⏳</div>
              <span className="muted">File Upload & Processing</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                width: '24px', 
                height: '24px', 
                borderRadius: '50%', 
                background: 'var(--glass)',
                border: '2px solid var(--muted)',
                opacity: 0.5
              }}></div>
              <span className="muted">AI Quiz Generation</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                width: '24px', 
                height: '24px', 
                borderRadius: '50%', 
                background: 'var(--glass)',
                border: '2px solid var(--muted)',
                opacity: 0.5
              }}></div>
              <span className="muted">Quiz Taking Interface</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
