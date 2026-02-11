import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

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
        <div className="logo" aria-hidden="true">LL</div>
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
  const [slideText, setSlideText] = useState('');
  const [modalType, setModalType] = useState(null);
  const [groupLink, setGroupLink] = useState('');
  const fileInputRef = useRef(null);

  const handleCreateGroup = () => {
    const groupId = 'CG-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    const link = window.location.origin + '/secondquizpage.html?id=' + groupId;
    setGroupLink(link);
    setModalType('create');
  };

  const handleJoinGroup = () => {
    setModalType('join');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(groupLink).then(() => {
      alert('Link copied!');
    });
  };

  const proceedCreate = () => {
    setModalType(null);
    alert('Class group created! (Demo)');
  };

  const proceedJoin = () => {
    const id = document.getElementById('classIdInput')?.value.trim();
    if (!id) {
      alert('Please enter a class ID.');
      return;
    }
    setModalType(null);
    window.location.href = '/secondquizpage.html?id=' + encodeURIComponent(id);
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
        <div style={{ margin: '18px 0 8px 0', fontSize: '16px' }}>Create a class group with only ten members.</div>
        <div style={{ margin: '12px 0', fontSize: '15px' }}>
          Share this link with others to join your group:
          <br />
          <input
            type="text"
            id="groupLinkInput"
            value={groupLink}
            readOnly
            style={{ width: '90%', marginTop: '8px' }}
          />
          <button className="btn" id="copyLinkBtn" style={{ marginTop: '8px' }} onClick={copyLink}>
            Copy Link
          </button>
        </div>
        <button className="btn" id="proceedCreate" onClick={proceedCreate}>
          Proceed
        </button>
      </Modal>

      {/* Join Group Modal */}
      <Modal isOpen={modalType === 'join'} onClose={() => setModalType(null)}>
        <h3>Join Class Group</h3>
        <div style={{ margin: '18px 0 8px 0', fontSize: '16px' }}>Enter class ID number to join:</div>
        <input type="text" id="classIdInput" placeholder="Class ID" maxLength="16" />
        <button className="btn" id="proceedJoin" onClick={proceedJoin}>
          Proceed
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
// FOOTER
// ========================================

const Footer = () => {
  return (
    <footer>
      <div>
        © Learn Lite — built for students • <span className="muted">Made with ♥</span>
      </div>
      <div>
        <a href="#contact">Contact</a> | <a href="#terms">Terms</a> | <a href="#privacy">Privacy</a>
      </div>
    </footer>
  );
};

// ========================================
// HOME PAGE
// ========================================

export default function Home() {
  const { uploadedFile, setFile } = useApp();

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
      <Footer />
    </div>
  );
}
