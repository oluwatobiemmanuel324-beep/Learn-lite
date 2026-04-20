import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Facebook, Instagram, Menu, MessageCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getApiErrorMessage, groupAPI, publicAPI } from '../services/api';

const SOCIAL_LINKS = {
  whatsapp: 'https://whatsapp.com/channel/0029Vb7NksbEKyZPSlNMg644',
  facebook: 'https://www.facebook.com/share/185cDUg3Lk/',
  instagram: 'https://www.instagram.com/learnlite.official?igsh=MXFkdjdlanQzc2k5OA=='
};

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

const FALLBACK_SLIDES = [
  {
    id: 'slide-1',
    title: 'Turn Complex Notes into Visual Insights',
    subtitle: 'See concepts transformed into clean study visuals, diagrams, and guided summaries.',
    kicker: 'Educational Visual Story'
  },
  {
    id: 'slide-2',
    title: 'Admin-Curated Media for the Homepage',
    subtitle: 'Your assigned ops and social-media admin controls what appears on the landing page.',
    kicker: 'Managed by Admin'
  },
  {
    id: 'slide-3',
    title: 'Learn Faster with Quizzes and Summaries',
    subtitle: 'Build understanding with instant question generation and smart revision aids.',
    kicker: 'AI Study Companion'
  }
];

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
  const navigate = useNavigate();
  const { theme, toggleTheme } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 640) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

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

      <button
        type="button"
        className="nav-toggle"
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <nav className={`main-nav ${mobileMenuOpen ? 'is-open' : ''}`}>
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

const Slideshow = ({ mediaItems = [], onSlideChange }) => {
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const fallbackSlides = [
    {
      id: 'fallback-1',
      type: 'image',
      url: makeSVGDataURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='g1' x1='0' x2='1' y1='0' y2='1'><stop offset='0' stop-color='#0b61ff'/><stop offset='1' stop-color='#6ad7ff'/></linearGradient></defs><rect width='1200' height='800' fill='url(#g1)'/><circle cx='250' cy='260' r='180' fill='rgba(255,255,255,0.12)'/><circle cx='860' cy='520' r='260' fill='rgba(255,255,255,0.10)'/></svg>`),
      title: 'Turn Complex Notes into Visual Insights',
      subtitle: 'Convert dense learning material into clear, memorable study visuals.',
      kicker: 'Educational Visual Story'
    },
    {
      id: 'fallback-2',
      type: 'image',
      url: makeSVGDataURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='g2' x1='0' x2='1' y1='0' y2='1'><stop offset='0' stop-color='#ff7a00'/><stop offset='1' stop-color='#ff3da1'/></linearGradient></defs><rect width='1200' height='800' fill='url(#g2)'/><circle cx='260' cy='220' r='200' fill='rgba(255,255,255,0.10)'/><circle cx='900' cy='500' r='300' fill='rgba(255,255,255,0.12)'/></svg>`),
      title: 'Admin-Curated Media for the Homepage',
      subtitle: 'Your assigned admin can update the public homepage visuals at any time.',
      kicker: 'Managed by Admin'
    },
    {
      id: 'fallback-3',
      type: 'image',
      url: makeSVGDataURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='g3' x1='0' x2='1' y1='0' y2='1'><stop offset='0' stop-color='#4f46e5'/><stop offset='1' stop-color='#06b6d4'/></linearGradient></defs><rect width='1200' height='800' fill='url(#g3)'/><circle cx='240' cy='500' r='250' fill='rgba(255,255,255,0.09)'/><circle cx='840' cy='230' r='170' fill='rgba(255,255,255,0.11)'/></svg>`),
      title: 'Learn Faster with Quizzes and Summaries',
      subtitle: 'Build understanding with instant questions and concise revision aids.',
      kicker: 'AI Study Companion'
    }
  ];

  const slides = (mediaItems.length ? mediaItems : fallbackSlides).map((item, index) => ({
    id: item.id || `${item.fileName || 'slide'}-${index}`,
    type: item.type || (item.mimeType?.startsWith('video/') ? 'video' : 'image'),
    url: item.url,
    title: item.title || item.fileName || `Slide ${index + 1}`,
    subtitle: item.description || item.caption || 'Curated by the assigned admin for homepage visitors.',
    kicker: item.kicker || 'Admin-managed showcase'
  }));

  const activeSlide = slides[current % slides.length];

  useEffect(() => {
    if (!slides.length || isHovered) return undefined;

    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 4500);

    return () => clearInterval(interval);
  }, [isHovered, slides.length]);

  useEffect(() => {
    if (activeSlide && onSlideChange) {
      onSlideChange(activeSlide.title);
    }
  }, [activeSlide, onSlideChange]);

  const goToSlide = (index) => setCurrent(index);
  const goPrev = () => setCurrent((prev) => (prev - 1 + slides.length) % slides.length);
  const goNext = () => setCurrent((prev) => (prev + 1) % slides.length);

  return (
    <section
      className="carousel-shell hero-card"
      aria-label="Homepage slideshow"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="carousel-topbar">
        <span className="kicker">Interactive slideshow</span>
        <span className="carousel-admin-badge">Admin-controlled</span>
      </div>

      <div className="carousel-stage">
        {slides.map((slide, idx) => (
          <article key={slide.id} className={`carousel-slide ${idx === current ? 'is-active' : ''}`}>
            {slide.type === 'video' ? (
              <video src={slide.url} muted loop autoPlay playsInline className="carousel-media" />
            ) : (
              <img src={slide.url} alt={slide.title} className="carousel-media" />
            )}

            <div className="carousel-overlay">
              <div className="carousel-overlay-inner">
                <span className="carousel-kicker">{slide.kicker}</span>
                <h3>{slide.title}</h3>
                <p>{slide.subtitle}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="carousel-actions">
        <button type="button" className="carousel-arrow" onClick={goPrev} aria-label="Previous slide">
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="carousel-arrow" onClick={goNext} aria-label="Next slide">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="carousel-dots" role="tablist" aria-label="Slideshow navigation">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className={`carousel-dot ${index === current ? 'is-active' : ''}`}
            onClick={() => goToSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
            aria-pressed={index === current}
          />
        ))}
      </div>
    </section>
  );
};

// ========================================
// FILE UPLOAD COMPONENT
// ========================================

const FileUpload = ({ onFileChange, uploadedFile, onGenerate, openPickerSignal = 0 }) => {
  const [preview, setPreview] = useState(null);
  const [qCount, setQCount] = useState(10);
  const fileInputRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (openPickerSignal > 0) {
      fileInputRef.current?.click();
    }
  }, [openPickerSignal]);

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

  const handleGenerate = async () => {
    if (!uploadedFile) {
      alert('Please upload a file first.');
      return;
    }

    if (!onGenerate) {
      alert('Quiz generator is not available right now.');
      return;
    }

    setGenerating(true);
    try {
      await onGenerate(uploadedFile, { questionCount: qCount });
    } catch (err) {
      alert('Unable to start quiz generation right now. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSample = () => {
    const blob = new Blob(['Sample note: Key concept — Law of Gravity'], { type: 'text/plain' });
    blob.name = 'sample-notes.txt';
    handleFile(blob);
    setQCount(12);
  };

  return (
    <aside className="hero-card quick-start-card action-uploader">
      <div className="quick-start-header">
        <span className="kicker">Primary Action Area</span>
        <h3 style={{ margin: '8px 0 0 0' }}>Drag & drop your notes to get instant quiz output</h3>
      </div>
      <div className="quick-start-body">
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
          <div className="quick-start-actions">
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
  const [modalType, setModalType] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickAccessLoading, setQuickAccessLoading] = useState(false);
  const [homeMediaItems, setHomeMediaItems] = useState([]);
  const [openPickerSignal, setOpenPickerSignal] = useState(0);

  useEffect(() => {
    const loadHomeMedia = async () => {
      try {
        const res = await publicAPI.getHomeMedia();
        setHomeMediaItems(Array.isArray(res?.items) ? res.items : []);
      } catch (err) {
        setHomeMediaItems([]);
      }
    };

    loadHomeMedia();
  }, []);

  const handleCreateGroup = () => {
    setGroupName('');
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
    const section = document.getElementById('explore-courses');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleGenerateFromHome = async () => {
    navigate('/generate-quiz', { state: { autoGenerate: true } });
  };

  const handlePrimaryUploadCTA = () => {
    setOpenPickerSignal((prev) => prev + 1);
  };

  return (
    <>
      <section className="hero-wrap" aria-label="Hero area">
        <div className="hero-shell">
          <div className="hero-main-column utility-hero-column">
            <div className="hero-card hero-lead-card utility-hero-card">
              <span className="kicker">Learn Lite • Utility-First Workspace</span>
              <h2 id="hero-heading">Upload your notes. Generate smart quiz practice in seconds.</h2>
              <p className="hero-lead-copy">
                Skip browsing and go straight to value. Drop your file, extract key concepts, and start practicing immediately.
              </p>

              <div className="hero-primary-actions">
                <button type="button" className="btn" onClick={handlePrimaryUploadCTA}>
                  Upload Notes
                </button>
                <button type="button" className="secondary" onClick={handleExamples}>
                  Explore Courses
                </button>
              </div>

              <div className="hero-action-area" role="region" aria-label="Drag and drop upload action">
                <FileUpload
                  uploadedFile={uploadedFile}
                  onFileChange={onFileChange}
                  onGenerate={handleGenerateFromHome}
                  openPickerSignal={openPickerSignal}
                />
              </div>
            </div>
          </div>
        </div>

        <section id="explore-courses" className="below-fold-shell" aria-label="Explore courses and media">
          <div className="below-fold-heading">
            <span className="kicker">Explore After Action</span>
            <h3>Course discovery and media showcase</h3>
            <p className="hero-summary-copy">
              Your upload workflow comes first. Browse curated homepage media and extra learning tools after starting your quiz flow.
            </p>
          </div>

          <div className="below-fold-grid">
            <Slideshow mediaItems={homeMediaItems} />

            <div className="hero-summary-grid">
              <article className="hero-card hero-summary-card">
                <div className="kicker">Features</div>
                <h3>Visuals, summaries, and exam-ready quizzes.</h3>
                <p className="hero-summary-copy">
                  Learn Lite turns uploaded notes into visual explanations, concise summaries, and practical question sets.
                </p>
                <div className="tag-row">
                  {['Quiz generation', 'AI summaries', 'Fast revision'].map((tag) => (
                    <span key={tag} className="tag-pill">{tag}</span>
                  ))}
                </div>
              </article>

              <article className="hero-card hero-summary-card">
                <div className="kicker">Secure Top-Up</div>
                <h3>Paystack-powered fuel for uninterrupted study sessions.</h3>
                <p className="hero-summary-copy">
                  Add Fuel safely and keep your learning workflow running when you need more AI-powered processing.
                </p>
                <div className="tag-row">
                  {['Secure payments', 'Fuel credits', 'Fast checkout'].map((tag) => (
                    <span key={tag} className="tag-pill tag-pill--accent">{tag}</span>
                  ))}
                </div>
              </article>
            </div>
          </div>

          <div className="hero-actions-row">
            <button className="btn" id="createGroupBtn" onClick={handleCreateGroup}>
              Create Class Group
            </button>
            <button className="secondary" id="joinGroupBtn" onClick={handleJoinGroup}>
              Join Class Group
            </button>
            <button className="secondary" id="myGroupBtn" onClick={handleQuickAccessGroup} disabled={quickAccessLoading}>
              {quickAccessLoading ? 'Opening...' : 'Go to My Group'}
            </button>
            <button className="secondary" id="examplesBtn" onClick={handleExamples}>
              See Showcase
            </button>
          </div>
        </section>
      </section>

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
        <button className="btn" id="proceedCreate" onClick={proceedCreate} disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Creating...' : 'Create Group'}
        </button>
      </Modal>

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
        <button className="btn" id="proceedJoin" onClick={proceedJoin} disabled={loading} style={{ width: '100%' }}>
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
        <a href={SOCIAL_LINKS.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" title="WhatsApp" style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}><MessageCircle size={15} /></a>
        {' '}
        <a href={SOCIAL_LINKS.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook" style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}><Facebook size={15} /></a>
        {' '}
        <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram" style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}><Instagram size={15} /></a>
        {' '}|{' '}
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
      const response = await fetch('/api/contact', {
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
      <Footer onOpenContact={() => setIsContactOpen(true)} />

      <Modal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)}>
        <Contact onSubmit={handleContactSubmit} />
      </Modal>
    </div>
  );
}
