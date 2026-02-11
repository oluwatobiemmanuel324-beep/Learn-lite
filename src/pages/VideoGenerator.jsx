import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import axios from 'axios';

export default function VideoGenerator() {
  const { theme } = useApp();
  const navigate = useNavigate();
  
  // State Management
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [success, setSuccess] = useState(false);
  const [fuelBalance, setFuelBalance] = useState(0);
  const [loadingFuel, setLoadingFuel] = useState(true);
  const [showPaystack, setShowPaystack] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  const getUserIdFromToken = (token) => {
    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return null;
      const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(normalized));
      const userId = Number(decoded?.userId);
      return Number.isFinite(userId) ? userId : null;
    } catch (err) {
      console.error('Failed to decode token:', err);
      return null;
    }
  };

  // Fetch fuel balance on mount
  useEffect(() => {
    const token = localStorage.getItem('learn_lite_token');
    if (!token) {
      // Redirect to login if session was lost
      navigate('/login');
      return;
    }
    fetchFuelBalance();
  }, [navigate]);

  // Check for payment callback on mount
  useEffect(() => {
    const checkPaymentCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const reference = urlParams.get('reference');
      
      if (reference) {
        console.log('🔗 Payment callback detected:', reference);
        
        // Clear URL params immediately to prevent double processing
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Verify payment
        await verifyPaymentCallback(reference);
      }
    };

    checkPaymentCallback();
  }, []);

  // Fetch fuel balance
  const fetchFuelBalance = async () => {
    try {
      const token = localStorage.getItem('learn_lite_token');
      if (!token) {
        setLoadingFuel(false);
        navigate('/login');
        return;
      }

      const currentUserId = getUserIdFromToken(token);
      if (!currentUserId) {
        localStorage.removeItem('learn_lite_token');
        setLoadingFuel(false);
        navigate('/login');
        return;
      }

      const response = await axios.get(
        'http://localhost:4000/api/user/fuel?t=' + Date.now(),
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.data.success) {
        const fuelFromServer = response.data.fuel;
        console.log('📊 Fuel balance retrieved from server:', fuelFromServer);
        // Explicitly set the state with the number from server
        setFuelBalance(Number(fuelFromServer));
      }
    } catch (err) {
      console.error('Fetch fuel error:', err);
      // If unauthorized (401), redirect to login
      if (err.response?.status === 401) {
        localStorage.removeItem('learn_lite_token');
        navigate('/login');
      }
    } finally {
      setLoadingFuel(false);
    }
  };

  // Initialize Paystack payment
  const handleBuyFuel = async () => {
    // Check if user is logged in
    const token = localStorage.getItem('learn_lite_token');
    if (!token) {
      alert('Please log in first');
      return;
    }

    const currentUserId = getUserIdFromToken(token);
    if (!currentUserId) {
      alert('Your session is invalid. Please log in again.');
      navigate('/login');
      return;
    }

    setProcessingPayment(true);
    setError('');
    try {
      console.log('📤 Sending payment initialization request...');
     
      const response = await axios.post(
        'http://localhost:4000/api/payments/initialize',
        JSON.stringify({ userId: currentUserId }),
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        const authorizationUrl = response.data.authorizationUrl;
        
        console.log('✓ Payment initialized, redirecting to Paystack...');
        console.log('Authorization URL:', authorizationUrl);
       
        if (!authorizationUrl) {
          setError('❌ No authorization URL received from payment service');
          setProcessingPayment(false);
          return;
        }

        // Redirect to Paystack payment page
        window.location.href = authorizationUrl;
      } else {
        const errorMsg = response.data.error || 'Failed to initialize payment';
        const details = response.data.details || '';
        setError(`${errorMsg}${details ? ': ' + details : ''}`);
        console.error('Payment init failed:', response.data);
        setProcessingPayment(false);
      }
    } catch (err) {
      console.error('❌ Payment initialization error:', err);
      
      // Extract detailed error from response
      const errorMsg = err.response?.data?.error || 'Failed to connect to payment service';
      const details = err.response?.data?.details || '';
      const status = err.response?.status || 'unknown';
      
      console.error({
        status,
        error: errorMsg,
        details,
        configStatus: err.response?.data?.configStatus
      });
      
      setError(`❌ ${errorMsg}${details ? '\n' + details : ''}`);
      setProcessingPayment(false);
    }
  };

  // Verify payment callback (after redirect)
  const verifyPaymentCallback = async (reference) => {
    try {
      console.log('🔄 Verifying payment callback...');
      setProcessingPayment(true);
      setError('');
     
      const token = localStorage.getItem('learn_lite_token');
      if (!token) {
        setError('❌ Not authenticated. Please log in again.');
        setProcessingPayment(false);
        return;
      }

      const currentUserId = getUserIdFromToken(token);
      if (!currentUserId) {
        setError('❌ Session is invalid. Please log in again.');
        setProcessingPayment(false);
        navigate('/login');
        return;
      }

      const response = await axios.get(
        `http://localhost:4000/api/payments/verify/${reference}?t=` + Date.now(),
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        const newFuel = Number(response.data.newBalance || response.data.fuel);
        const fuelAdded = response.data.fuelAdded || 50;
        const alreadyProcessed = response.data.alreadyProcessed;
        
        // Update fuel balance in state immediately with the backend response
        console.log('🔥 Setting fuel balance to:', newFuel);
        setFuelBalance(newFuel);
        console.log(`✅ Payment verified! Fuel: ${newFuel}`);
        
        // Show success message
        if (alreadyProcessed) {
          alert(`ℹ️ This payment was already processed. Your current fuel balance is ${newFuel}.`);
        } else {
          alert(`✅ Fuel Added Successfully! You gained ${fuelAdded} fuel. Your balance is now ${newFuel} fuel.`);
        }
        
        // Refresh fuel balance from server to ensure DB sync
        console.log('🔄 Fetching fuel balance from server...');
        await fetchFuelBalance();
        
        setShowPaystack(false);
        setProcessingPayment(false);
      } else {
        const errorMsg = response.data.error || 'Payment verification failed';
        const details = response.data.details || '';
        setError(`${errorMsg}${details ? ': ' + details : ''}`);
        console.error('Payment verify failed:', response.data);
        setProcessingPayment(false);
      }
    } catch (err) {
      console.error('Verify payment error:', err);
      
      const errorMsg = err.response?.data?.error || 'Failed to verify payment';
      const details = err.response?.data?.details || '';
      setError(`❌ ${errorMsg}${details ? '\n' + details : ''}`);
      console.error('Payment verification failed:', {
        status: err.response?.status,
        error: errorMsg,
        details
      });
      setProcessingPayment(false);
    }
  };

  // API Call Handler
  const handleGenerate = async () => {
    // Validation
    if (!prompt.trim()) {
      setError('Please enter a prompt to generate a video.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);
    setVideoUrl('');

    try {
      const token = localStorage.getItem('learn_lite_token');
      
      const response = await axios.post(
        'http://localhost:4000/api/videos/generate',
        { prompt: prompt.trim() },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log('Video generation response:', response.data);

      // Handle successful response
      if (response.data.success && response.data.videoUrl) {
        setVideoUrl(response.data.videoUrl);
        setSuccess(true);
        setError('');
        // Update fuel balance after successful generation
        if (response.data.fuelRemaining !== undefined) {
          setFuelBalance(response.data.fuelRemaining);
        }
      } else if (response.data.videoUrl) {
        setVideoUrl(response.data.videoUrl);
        setSuccess(true);
        if (response.data.fuelRemaining !== undefined) {
          setFuelBalance(response.data.fuelRemaining);
        }
      } else {
        setError('Video generated but no URL was returned. Please try again.');
      }
    } catch (err) {
      console.error('Video generation error:', err);
      
      // Check if it's a fuel error
      if (err.response?.status === 402) {
        setError('❌ Insufficient fuel! ' + (err.response?.data?.error || 'Please buy fuel to generate videos.'));
      } else {
        // Extract error message
        const errorMessage = err.response?.data?.error 
          || err.response?.data?.message 
          || err.message 
          || 'Failed to generate video. Please try again.';
        
        setError(errorMessage);
      }
      setSuccess(false);
    } finally {
      setLoading(false);
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
        justifyContent: 'space-between',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
              <h2 style={{ margin: 0, fontSize: '18px' }}>Video Generator</h2>
              <div className="muted" style={{ fontSize: '12px' }}>AI-powered video tutorials</div>
            </div>
          </div>
        </div>

        {/* Fuel Display and Buy Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            padding: '8px 16px',
            background: 'var(--glass)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
            <span style={{ fontWeight: 700 }}>
              {loadingFuel ? '...' : fuelBalance}
            </span>
            <span className="muted" style={{ fontSize: '12px' }}>Fuel</span>
          </div>
          <button
            onClick={handleBuyFuel}
            disabled={processingPayment}
            className="btn"
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 700
            }}
          >
            💳 {processingPayment ? 'Redirecting to Paystack...' : 'Buy Fuel'}
          </button>
          <button
            onClick={fetchFuelBalance}
            disabled={loadingFuel}
            className="btn"
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 700,
              background: 'var(--secondary)',
              opacity: loadingFuel ? 0.5 : 1,
              cursor: loadingFuel ? 'not-allowed' : 'pointer'
            }}
            title="Manually refresh fuel balance"
          >
            🔄 {loadingFuel ? 'Refreshing...' : 'Refresh Fuel'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px' }}>
        {/* Video Generator Card */}
        <div className="hero-card" style={{ padding: '32px', marginBottom: '30px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '60px', marginBottom: '12px' }}>🎬</div>
            <h1 style={{ 
              fontSize: '28px', 
              marginBottom: '12px',
              background: 'linear-gradient(135deg, #6ad7ff, #0b61ff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              AI Video Generator
            </h1>
            <p className="muted" style={{ fontSize: '15px', margin: 0 }}>
              Describe your video and let AI create it for you
            </p>
            {/* Fuel Requirement Info */}
            <div style={{
              marginTop: '12px',
              padding: '10px 16px',
              background: fuelBalance > 0 ? 'var(--glass)' : 'rgba(255, 23, 68, 0.1)',
              borderRadius: '8px',
              border: fuelBalance > 0 ? '1px solid var(--glass)' : '1px solid var(--accent-2)',
              fontSize: '13px',
              color: fuelBalance > 0 ? 'var(--muted)' : 'var(--accent-2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⚡</span>
              <span>
                {fuelBalance > 0 
                  ? `You have ${fuelBalance} fuel available` 
                  : 'You need fuel to generate videos. Click "Buy Fuel" to purchase.'}
              </span>
            </div>
          </div>

          {/* Prompt Input */}
          <div style={{ marginBottom: '20px' }}>
            <label 
              htmlFor="videoPrompt" 
              style={{ 
                display: 'block', 
                marginBottom: '10px', 
                fontWeight: 700, 
                fontSize: '14px' 
              }}
            >
              Video Prompt
            </label>
            <textarea
              id="videoPrompt"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError(''); // Clear error on input
              }}
              placeholder="Example: Create a 2-minute educational video explaining photosynthesis with animations..."
              rows="6"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'var(--glass-2)',
                color: 'var(--text)',
                fontSize: '15px',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '120px'
              }}
            />
            <div className="muted" style={{ fontSize: '13px', marginTop: '8px' }}>
              Be specific about the topic, style, and duration for best results
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                background: 'rgba(255, 23, 68, 0.1)',
                border: '1px solid var(--accent-2)',
                marginBottom: '20px',
                fontSize: '14px',
                color: 'var(--accent-2)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Success Display */}
          {success && !error && (
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                background: 'rgba(0, 200, 83, 0.1)',
                border: '1px solid #00c853',
                marginBottom: '20px',
                fontSize: '14px',
                color: '#00c853',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <span style={{ fontSize: '20px' }}>✅</span>
              <span>Video generated successfully!</span>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="btn"
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '16px',
              fontWeight: 700,
              opacity: (loading || !prompt.trim()) ? 0.6 : 1,
              cursor: (loading || !prompt.trim()) ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? (
              <>
                <span style={{ display: 'inline-block', marginRight: '8px' }}>⏳</span>
                Generating Video...
              </>
            ) : (
              <>
                <span style={{ display: 'inline-block', marginRight: '8px' }}>🎬</span>
                Generate Video
              </>
            )}
          </button>

          {/* Loading Progress */}
          {loading && (
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: '14px', marginBottom: '12px' }}>
                AI is processing your request...
              </div>
              <div style={{ 
                width: '100%', 
                height: '8px', 
                background: 'var(--glass)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #0b61ff, #6ad7ff, #0b61ff)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite linear'
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Video Player / Result Display */}
        {videoUrl && (
          <div className="hero-card" style={{ padding: '32px', marginBottom: '30px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '20px', textAlign: 'center' }}>
              Your Generated Video
            </h3>
            
            {/* Video Player */}
            <div style={{ 
              width: '100%', 
              maxWidth: '100%',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#000',
              marginBottom: '20px'
            }}>
              <video
                controls
                style={{ width: '100%', display: 'block' }}
                src={videoUrl}
              >
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Video Actions */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <a
                href={videoUrl}
                download
                className="btn"
                style={{ 
                  textDecoration: 'none', 
                  flex: 1,
                  textAlign: 'center',
                  minWidth: '150px'
                }}
              >
                ⬇️ Download Video
              </a>
              <button
                onClick={() => {
                  setPrompt('');
                  setVideoUrl('');
                  setSuccess(false);
                  setError('');
                }}
                className="secondary"
                style={{ flex: 1, minWidth: '150px' }}
              >
                ✨ Generate New Video
              </button>
            </div>
          </div>
        )}

        {/* Info Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '20px',
          marginBottom: '30px'
        }}>
          <div className="hero-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📝</div>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Script Generation</h3>
            <p className="muted" style={{ fontSize: '14px', margin: 0 }}>
              AI converts your prompts into engaging video scripts
            </p>
          </div>

          <div className="hero-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗣️</div>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Natural Voice</h3>
            <p className="muted" style={{ fontSize: '14px', margin: 0 }}>
              High-quality text-to-speech in multiple languages
            </p>
          </div>

          <div className="hero-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎥</div>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Video Production</h3>
            <p className="muted" style={{ fontSize: '14px', margin: 0 }}>
              Automatic scene creation with smooth transitions
            </p>
          </div>
        </div>
        <div className="hero-card" style={{ padding: '30px', marginTop: '40px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '20px' }}>Powered By</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <div style={{ 
              padding: '16px', 
              background: 'var(--glass)',
              borderRadius: '8px',
              border: '1px solid var(--glass)'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '4px' }}>Google Cloud TTS</div>
              <div className="muted" style={{ fontSize: '13px' }}>Natural voice synthesis</div>
            </div>
            <div style={{ 
              padding: '16px', 
              background: 'var(--glass)',
              borderRadius: '8px',
              border: '1px solid var(--glass)'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '4px' }}>HeyGen API</div>
              <div className="muted" style={{ fontSize: '13px' }}>AI video generation</div>
            </div>
            <div style={{ 
              padding: '16px', 
              background: 'var(--glass)',
              borderRadius: '8px',
              border: '1px solid var(--glass)'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '4px' }}>OpenAI GPT</div>
              <div className="muted" style={{ fontSize: '13px' }}>Script optimization</div>
            </div>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="hero-card" style={{ padding: '30px', marginTop: '40px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '20px' }}>Development Status</h3>
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
              <span>Backend API Integration</span>
            </div>
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
              <span>Google Cloud TTS Setup</span>
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
              <span className="muted">Frontend Video Preview</span>
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
              <span className="muted">HeyGen Video Generation</span>
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
              <span className="muted">Video Customization Options</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
