import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getApiErrorMessage, groupAPI } from '../services/api';

// ========================================
// UTILITY FUNCTIONS
// ========================================

function makeSVGDataURL(svg) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function humanSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return Math.round(bytes / (1024 * 1024)) + ' MB';
}

// Lightweight client-side sanitizer
function sanitizeHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style').forEach(el => el.remove());
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    Array.from(node.attributes).forEach(attr => {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      if (attr.name === 'href' && /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    });
  }
  return doc.body.innerHTML;
}

// ========================================
// HEADER COMPONENT
// ========================================

const Header = () => {
  const { theme, toggleTheme } = useApp();

  return (
    <header>
      <div className="brand">
        <div className="logo" aria-hidden="true" style={{ overflow: 'hidden' }}>
          <img
            src="/app-icon.png"
            alt="Learn Lite logo"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div>
          <h1 style={{ margin: 0 }}>Learn Lite</h1>
          <div className="muted" style={{ fontSize: '12px' }}>
            Upload notes → Auto quizzes in seconds
          </div>
        </div>
      </div>
      <nav>
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <Link to="/generate-video">Generate Video</Link>
        <Link to="/signup">Sign Up</Link>
        <Link to="/login">Login</Link>
        <div
          className="theme-toggle"
          id="themeSwitch"
          role="button"
          aria-pressed={theme === 'light'}
          tabIndex="0"
          title="Toggle theme"
          onClick={toggleTheme}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleTheme();
            }
          }}
        >
          <div className="txt" id="themeText">
            {theme === 'light' ? 'Light' : 'Dark'}
          </div>
          <div className="switch" aria-hidden="true">
            <div className="knob"></div>
          </div>
        </div>
      </nav>
    </header>
  );
};

// ========================================
// SLIDESHOW COMPONENT
// ========================================

const Slideshow = ({ onSlideChange }) => {
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const svgSlides = [
    makeSVGDataURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
      <defs><linearGradient id='g1' x1='0' x2='1' y1='0' y2='1'><stop offset='0' stop-color='#0b61ff'/><stop offset='1' stop-color='#6ad7ff'/></linearGradient><filter id='f'><feGaussianBlur stdDeviation='60'/></filter></defs>
      <rect width='1200' height='800' fill='url(#g1)'/>
      <g filter='url(#f)' opacity='0.96'><circle cx='220' cy='260' r='220' fill='#0a3b9a'/><ellipse cx='740' cy='480' rx='320' ry='220' fill='#00c6ff'/></g>
    </svg>`),
    makeSVGDataURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
      <defs><linearGradient id='g2'><stop offset='0' stop-color='#ff7a00'/><stop offset='1' stop-color='#ff3da1'/></linearGradient><filter id='f2'><feGaussianBlur stdDeviation='50'/></filter></defs>
      <rect width='1200' height='800' fill='url(#g2)'/>
      <g filter='url(#f2)' opacity='0.92'><ellipse cx='300' cy='220' rx='240' ry='180' fill='#ffb35b'/><circle cx='820' cy='520' r='340' fill='#ff5b9a'/></g>
    </svg>`),
    makeSVGDataURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
      <defs><linearGradient id='g3'><stop offset='0' stop-color='#4f46e5'/><stop offset='1' stop-color='#06b6d4'/></linearGradient><filter id='f3'><feGaussianBlur stdDeviation='55'/></filter></defs>
      <rect width='1200' height='800' fill='url(#g3)'/>
      <g filter='url(#f3)' opacity='0.95'><ellipse cx='260' cy='520' rx='340' ry='220' fill='#2b1061'/><circle cx='860' cy='260' r='200' fill='#08a5be'/></g>
    </svg>`),
    makeSVGDataURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
      <defs><linearGradient id='g4'><stop offset='0' stop-color='#002b36'/><stop offset='1' stop-color='#00c853'/></linearGradient><filter id='f4'><feGaussianBlur stdDeviation='60'/></filter></defs>
      <rect width='1200' height='800' fill='url(#g4)'/>
      <g filter='url(#f4)' opacity='0.9'><circle cx='240' cy='200' r='220' fill='#003a4c'/><ellipse cx='760' cy='460' rx='360' ry='240' fill='#00ff9f'/></g>
    </svg>`)
  ];

  const slideTexts = [
    'Welcome to Learn Lite — Your AI-powered study partner!',
    'Upload your notes and get instant quizzes tailored to your course.',
    'Switch between dark and light mode for your comfort.',
    'Try uploading a sample note to see how it works!'
  ];

  useEffect(() => {
    if (isHovered) return;

    const interval = setInterval(() => {
      setCurrent((prev) => {
        const next = (prev + 1) % svgSlides.length;
        if (onSlideChange) onSlideChange(slideTexts[next]);
        return next;
      });
    }, 3500);

    return () => clearInterval(interval);
  }, [isHovered, svgSlides.length]);

  useEffect(() => {
    if (onSlideChange) onSlideChange(slideTexts[current]);
  }, []);

  return (
    <div
      className="slideshow"
      id="slideshow"
      aria-hidden="true"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {svgSlides.map((url, idx) => (
        <div
          key={idx}
          className={`slide ${idx === current ? 'show' : ''}`}
          style={{ backgroundImage: `url("${url}")` }}
          data-index={idx}
        />
      ))}
    </div>
  );
};

// ========================================
// FILE UPLOAD COMPONENT
// ========================================

const FileUpload = ({ onFileChange, uploadedFile }) => {
  const [preview, setPreview] = useState(null);
  const [qCount, setQCount] = useState(10);
  const fileInputRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  const handleFile = (file) => {
    if (!file) return;

    onFileChange(file);

    // Preview for images
    if (file.type && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      // PDF icon
      setPreview(
        makeSVGDataURL(
          `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect rx='8' width='64' height='64' fill='%23111'/><text x='50%' y='52%' fill='%23fff' font-size='12' font-family='Arial' text-anchor='middle' dominant-baseline='middle'>PDF</text></svg>`
        )
      );
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleGenerate = () => {
    if (!uploadedFile) {
      alert('Please upload a file first.');
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      alert('Quiz generated! (Demo) — In production you would be redirected to your quiz.');
    }, 1600);
  };

  const handleSample = () => {
    const blob = new Blob(['Sample note: Key concept — Law of Gravity'], { type: 'text/plain' });
    blob.name = 'sample-notes.txt';
    handleFile(blob);
    setQCount(12);
  };

  return (
    <aside className="uploader">
      <div className="hero-card" style={{ padding: '12px' }}>
        <div
          className="dropzone"
          id="dropzone"
          tabIndex="0"
          role="button"
          aria-label="Upload notes area. Press enter to browse files."
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ opacity: 0.95 }}>
            <path d="M12 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="3" y="13" width="18" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontWeight: 800 }}>Drag & drop your notes here</div>
          <div className="muted" style={{ fontSize: '13px' }}>
            PDF, PNG, JPG — up to 20MB
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <label className="btn" htmlFor="fileInput" style={{ cursor: 'pointer' }}>
              Browse files
            </label>
            <button className="secondary" id="sampleBtn" onClick={(e) => { e.stopPropagation(); handleSample(); }}>
              Use sample note
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          id="fileInput"
          accept="application/pdf,image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {uploadedFile && (
          <div id="previewArea" style={{ marginTop: '12px' }}>
            <div className="preview">
              {preview && <img id="thumb" src={preview} alt="file preview" />}
              <div className="file-meta">
                <div id="fileName" style={{ fontWeight: 800 }}>
                  {uploadedFile.name}
                </div>
                <div className="muted" id="fileSize">
                  {humanSize(uploadedFile.size)}
                </div>
              </div>
            </div>
            <div className="generate">
              <button className="btn" id="generateBtn" onClick={handleGenerate} disabled={generating}>
                {generating ? 'Generating...' : 'Generate Quiz'}
              </button>
              <button className="secondary" id="moreOptions">
                More options
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
        <div className="hero-card" style={{ flex: 1, padding: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Estimated time</div>
          <div style={{ fontWeight: 800, fontSize: '20px' }}>~ 30 sec</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>from upload to quiz</div>
        </div>
        <div
          className="hero-card"
          style={{
            padding: '12px',
            width: '110px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Questions</div>
          <div style={{ fontWeight: 800, fontSize: '20px' }} id="qCount">
            {qCount}
          </div>
        </div>
      </div>
    </aside>
  );
};

// ========================================
// MODAL COMPONENT
// ========================================

const Modal = ({ isOpen, onClose, children }) => {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-bg" style={{ display: 'flex' }} onClick={(e) => e.target.className === 'modal-bg' && onClose()}>
      <div className="modal" id="modalContent">
        <button className="close" id="closeModal" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        {children}
      </div>
    </div>
  );
};

// ========================================
// HERO SECTION
// ========================================

const Hero = ({ uploadedFile, onFileChange }) => {
  const navigate = useNavigate();
  const [slideText, setSlideText] = useState('');
  const [modalType, setModalType] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickAccessLoading, setQuickAccessLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleCreateGroup = () => {
    setGroupName('');
    setCreatedCode('');
    setModalType('create');
  };

  const handleJoinGroup = () => {
    setJoinCode('');
    setModalType('join');
  };

  const handleQuickAccessGroup = async () => {
    if (quickAccessLoading) return;

    setQuickAccessLoading(true);
    try {
      const result = await groupAPI.getMyGroups();
      const groups = result?.groups || [];

      if (!groups.length) {
        alert('You do not belong to any class group yet. Create one or join with a code.');
        return;
      }

      const preferredGroup = groups.find((group) => group.isOwner) || groups[0];
      localStorage.setItem('currentGroupId', String(preferredGroup.id));
      if (preferredGroup.joinCode) {
        localStorage.setItem('currentGroupCode', preferredGroup.joinCode);
      }

      navigate(`/generate-quiz/${preferredGroup.id}`);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to access your group right now.');
      alert(message);
    } finally {
      setQuickAccessLoading(false);
    }
  };

  const proceedCreate = async () => {
    if (!groupName.trim()) {
      alert('Please enter a group name.');
      return;
    }

    setLoading(true);
    try {
      const result = await groupAPI.createGroup(groupName);
      if (result.success) {
        setCreatedCode(result.group.joinCode);
        alert(`Success! Your Class Code is: ${result.group.joinCode}`);
        localStorage.setItem('currentGroupId', result.group.id);
        localStorage.setItem('currentGroupCode', result.group.joinCode);
        setModalType(null);
        navigate(`/generate-quiz/${result.group.id}`);
      } else {
        alert('Error: ' + (result.error || 'Failed to create group'));
      }
    } catch (err) {
      alert('Error creating group: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const proceedJoin = async () => {
    if (!joinCode.trim()) {
      alert('Please enter a join code.');
      return;
    }

    setLoading(true);
    try {
      const result = await groupAPI.joinGroupByCode(joinCode.trim());
      if (result.success) {
        alert(`Successfully joined ${result.group.name}!`);
        localStorage.setItem('currentGroupId', result.group.id);
        localStorage.setItem('currentGroupCode', result.group.joinCode);
        setModalType(null);
        navigate(`/generate-quiz/${result.group.id}`);
      } else {
        alert('Error: ' + (result.error || 'Failed to join group'));
      }
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to join group');
      const existingGroupId = err.response?.data?.group?.id;
      const existingGroupCode = err.response?.data?.group?.joinCode;

      if (existingGroupId && /already a member/i.test(message)) {
        localStorage.setItem('currentGroupId', existingGroupId);
        if (existingGroupCode) {
          localStorage.setItem('currentGroupCode', existingGroupCode);
        }
        setModalType(null);
        alert(`You're already a member of this group. Opening ${err.response?.data?.group?.name || 'the group'}...`);
        navigate(`/generate-quiz/${existingGroupId}`);
        return;
      }

      alert('Error joining group: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleExamples = () => {
    // Trigger slide change (this is demo behavior)
    alert('Examples feature would cycle through slides');
  };

  return (
    <>
      <section className="hero-wrap" aria-label="Hero area">
        <Slideshow onSlideChange={setSlideText} />
        <div className="hero-overlay" aria-hidden="true" />
        <div className="hero-content" role="region" aria-labelledby="hero-heading">
          <div className="hero-card" style={{ minHeight: '260px' }}>
            <span className="kicker">AI • Study Smarter</span>
            <h2 id="hero-heading">Turn your lecture notes into ready-to-take quizzes — instantly.</h2>
            <p className="muted">
              Upload a PDF or an image of your notes and Learn Lite extracts key points, generates questions (MCQ &
              short answer), and builds an interactive quiz tailored to your course.
            </p>
            <div className="steps" id="slideTextArea" aria-live="polite">
              {slideText && <div className="pill" style={{ fontWeight: 800 }}>{slideText}</div>}
            </div>
            <div style={{ marginTop: '18px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" id="ctaUpload" onClick={() => fileInputRef.current?.click()}>
                Upload Notes
              </button>
              <button className="secondary" id="examplesBtn" onClick={handleExamples}>
                Explore Examples
              </button>
              <button className="btn" id="createGroupBtn" onClick={handleCreateGroup}>
                Create Class Group
              </button>
              <button className="secondary" id="joinGroupBtn" onClick={handleJoinGroup}>
                Join Class Group
              </button>
              <button className="secondary" id="myGroupBtn" onClick={handleQuickAccessGroup} disabled={quickAccessLoading}>
                {quickAccessLoading ? 'Opening...' : 'Go to My Group'}
              </button>
            </div>
            <div style={{ marginTop: '14px', fontSize: '13px', color: 'var(--muted)' }}>
              Pro tip: Combine typed notes and photos of whiteboard scribbles for richer quizzes.
            </div>
          </div>
          <FileUpload
            uploadedFile={uploadedFile}
            onFileChange={onFileChange}
          />
        </div>
      </section>

      {/* Hidden file input for CTA button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => onFileChange(e.target.files?.[0])}
      />

      {/* Create Group Modal */}
      <Modal isOpen={modalType === 'create'} onClose={() => setModalType(null)}>
        <h3>Create Class Group</h3>
        <div style={{ margin: '18px 0 8px 0', fontSize: '16px' }}>Enter your class group name:</div>
        <input
          type="text"
          id="groupNameInput"
          placeholder="e.g., Biology 101, Advanced Calculus"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '6px', border: '1px solid #ddd' }}
        />
        <button 
          className="btn" 
          id="proceedCreate" 
          onClick={proceedCreate}
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? 'Creating...' : 'Create Group'}
        </button>
      </Modal>

      {/* Join Group Modal */}
      <Modal isOpen={modalType === 'join'} onClose={() => setModalType(null)}>
        <h3>Join Class Group</h3>
        <div style={{ margin: '18px 0 8px 0', fontSize: '16px' }}>Enter the 6-letter class code:</div>
        <input 
          type="text" 
          id="classIdInput" 
          placeholder="e.g., MATH24"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength="6"
          style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '6px', border: '1px solid #ddd', textTransform: 'uppercase', letterSpacing: '2px' }}
        />
        <button 
          className="btn" 
          id="proceedJoin" 
          onClick={proceedJoin}
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? 'Joining...' : 'Join Group'}
        </button>
      </Modal>
    </>
  );
};

// ========================================
// FEATURES SECTION
// ========================================

const Features = () => {
  return (
    <section id="how" className="section" aria-label="How it works">
      <h3 style={{ margin: '0 0 8px 0' }}>How it works</h3>
      <div className="features" id="features">
        <div className="feature">
          <h4>1. Upload notes</h4>
          <p>PDF or images accepted — Learn Lite reads text and images using OCR and PDF parsing.</p>
        </div>
        <div className="feature">
          <h4>2. AI extraction</h4>
          <p>Important facts are extracted, summarized, and converted into question/answer pairs.</p>
        </div>
        <div className="feature">
          <h4>3. Customize & take</h4>
          <p>Choose question types, difficulty, and length — then take the generated quiz.</p>
        </div>
      </div>
    </section>
  );
};

// ========================================
// CONTACT SECTION
// ========================================

const Contact = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      alert('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
      setFormData({ name: '', email: '', subject: '', message: '' });
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err) {
      alert('Failed to submit contact form. Please try again.');
      console.error('Contact submission error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div aria-label="Contact us">
      <h3 style={{ margin: '0 0 8px 0' }}>Get in Touch</h3>
      <p className="muted" style={{ margin: '0 0 24px 0' }}>
        Have a question or feedback? We'd love to hear from you. Drop us a comment below.
      </p>
      
      {submitted && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'rgba(0, 200, 83, 0.1)',
          border: '1px solid rgba(0, 200, 83, 0.3)',
          color: '#00c853',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          ✓ Thank you for your message! We'll get back to you soon.
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="contactName" style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
            Name
          </label>
          <input
            id="contactName"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Your name"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--glass)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="contactEmail" style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
            Email
          </label>
          <input
            id="contactEmail"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="your@email.com"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--glass)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="contactSubject" style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
            Subject
          </label>
          <input
            id="contactSubject"
            type="text"
            name="subject"
            value={formData.subject}
            onChange={handleInputChange}
            placeholder="e.g., Feature request, Bug report"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--glass)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="contactMessage" style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>
            Message
          </label>
          <textarea
            id="contactMessage"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            placeholder="Tell us what's on your mind..."
            rows="5"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--glass)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              resize: 'vertical'
            }}
          />
        </div>

        <button 
          type="submit"
          className="btn"
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? 'Sending...' : 'Send Message'}
        </button>
      </form>
    </div>
  );
};

// ========================================
// FOOTER
// ========================================

const Footer = ({ onOpenContact }) => {
  return (
    <footer>
      <div>
        © Learn Lite — built for students • <span className="muted">Made with ♥</span>
      </div>
      <div>
        <button
          type="button"
          onClick={onOpenContact}
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit' }}
        >
          Contact
        </button>
        {' '}| <a href="#terms">Terms</a> | <a href="#privacy">Privacy</a>
      </div>
    </footer>
  );
};

// ========================================
// HOME PAGE
// ========================================

export default function Home() {
  const { uploadedFile, setFile } = useApp();
  const [isContactOpen, setIsContactOpen] = useState(false);

  const handleContactSubmit = async (formData) => {
    try {
      const response = await fetch('http://localhost:4000/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Failed to submit contact form');
      }
    } catch (err) {
      console.error('Contact submission error:', err);
      throw err;
    }
  };

  // Service worker registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then(() => {
          console.log('Service worker registered');
        })
        .catch((err) => console.warn('SW registration failed', err));
    }
  }, []);

  return (
    <div className="container" id="app">
      <Header />
      <Hero uploadedFile={uploadedFile} onFileChange={setFile} />
      <Features />
      <Footer onOpenContact={() => setIsContactOpen(true)} />

      <Modal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)}>
        <Contact onSubmit={handleContactSubmit} />
      </Modal>
    </div>
  );
}
