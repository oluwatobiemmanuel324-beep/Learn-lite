import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

function humanSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

async function readFileForInsight(file) {
  const fallback = {
    extractedText: '',
    insight: `Uploaded ${file.name}. The note is ready for drill generation.`
  };

  try {
    const type = String(file.type || '').toLowerCase();
    if (type.startsWith('text/') || type.includes('json') || type.includes('csv')) {
      const text = await file.text();
      const compact = text.replace(/\s+/g, ' ').trim();
      const preview = compact.slice(0, 480);
      return {
        extractedText: compact,
        insight: preview || fallback.insight
      };
    }

    if (type.startsWith('image/')) {
      return {
        extractedText: '',
        insight: `Image note detected. LearnLite will extract visible text and convert it to drill questions.`
      };
    }

    if (type.includes('pdf')) {
      return {
        extractedText: '',
        insight: `PDF note detected. LearnLite will parse the PDF content and generate exam-style CBT drills.`
      };
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export default function SoloStudyPage() {
  const navigate = useNavigate();
  const { setFile } = useApp();
  const inputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);
  const [showExplanationDialog, setShowExplanationDialog] = useState(false);
  const [readingStep, setReadingStep] = useState(0);
  const [noteInsight, setNoteInsight] = useState('');

  const stepLabels = useMemo(
    () => [
      'Reading note structure...',
      'Extracting key concepts...',
      'Preparing smart study options...'
    ],
    []
  );

  useEffect(() => {
    if (!reading) {
      setReadingStep(0);
      return;
    }

    const timer = setInterval(() => {
      setReadingStep((current) => (current + 1) % stepLabels.length);
    }, 1000);

    return () => clearInterval(timer);
  }, [reading, stepLabels.length]);

  const handleChooseFile = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setShowOptionsDialog(false);
    setShowExplanationDialog(false);
    setNoteInsight('');
  };

  const handleAnalyzeNote = async () => {
    if (!selectedFile) {
      alert('Choose a note first.');
      return;
    }

    setReading(true);
    const readResult = await readFileForInsight(selectedFile);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    setReading(false);
    setNoteInsight(readResult.insight);
    setShowOptionsDialog(true);
  };

  const handleExamDrills = () => {
    if (!selectedFile) return;
    setFile(selectedFile);
    navigate('/generate-quiz', {
      state: {
        autoGenerate: true,
        startInExamMode: true,
        fromSoloStudy: true
      }
    });
  };

  const handleVideoGeneration = () => {
    const prompt = selectedFile
      ? `Create a concise study video from this note: ${selectedFile.name}. Focus on key concepts and exam understanding.`
      : 'Create a concise study video from my note.';
    navigate('/generate-video', { state: { prefillPrompt: prompt } });
  };

  const handleExplanation = () => {
    setShowExplanationDialog(true);
    setShowOptionsDialog(false);
  };

  return (
    <div className="solo-study-page">
      <div className="solo-study-shell">
        <header className="solo-study-header">
          <div>
            <p className="solo-study-eyebrow">No group required</p>
            <h1>Solo Study Drill Lab</h1>
            <p>
              Upload your note once, let LearnLite read it, then choose what you want: CBT Exam Drills, Video
              Generation, or plain Explanation.
            </p>
          </div>
          <Link to="/" className="solo-study-back-link">Back to Homepage</Link>
        </header>

        <section className="solo-study-upload-card">
          <h2>Upload note</h2>
          <div
            className="solo-study-dropzone"
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <p className="solo-study-dropzone-title">Drag & drop note or click to browse</p>
            <p className="solo-study-dropzone-sub">PDF, image, or text supported</p>
            {selectedFile ? (
              <div className="solo-study-file-chip">
                {selectedFile.name} • {humanSize(selectedFile.size)}
              </div>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*,text/*"
            style={{ display: 'none' }}
            onChange={(e) => handleChooseFile(e.target.files?.[0])}
          />

          <div className="solo-study-actions">
            <button className="btn" type="button" onClick={handleAnalyzeNote} disabled={!selectedFile || reading}>
              {reading ? 'Reading note...' : 'Read Note'}
            </button>
            <button className="secondary" type="button" onClick={() => inputRef.current?.click()}>
              Change File
            </button>
          </div>
        </section>

        {noteInsight ? (
          <section className="solo-study-insight-card">
            <h3>What we understood from your note</h3>
            <p>{noteInsight}</p>
          </section>
        ) : null}
      </div>

      {reading ? (
        <div className="solo-dialog-overlay" role="dialog" aria-modal="true" aria-label="Reading note">
          <div className="solo-dialog-card">
            <div className="solo-dialog-spinner" aria-hidden="true" />
            <h3>LearnLite is reading your note</h3>
            <p>{stepLabels[readingStep]}</p>
          </div>
        </div>
      ) : null}

      {showOptionsDialog ? (
        <div className="solo-dialog-overlay" role="dialog" aria-modal="true" aria-label="Choose output option">
          <div className="solo-dialog-card">
            <h3>How do you want to use this note?</h3>
            <p>Pick one option below. You can always come back and choose another.</p>
            <div className="solo-option-grid">
              <button type="button" className="solo-option-btn" onClick={handleExamDrills}>
                <strong>Exam Drills</strong>
                <span>Open standard CBT page with questions generated from this note.</span>
              </button>
              <button type="button" className="solo-option-btn" onClick={handleVideoGeneration}>
                <strong>Video Generation</strong>
                <span>Use the same note context to create an explanation video.</span>
              </button>
              <button type="button" className="solo-option-btn" onClick={handleExplanation}>
                <strong>Explanation</strong>
                <span>See a plain-language explanation before drills or video.</span>
              </button>
            </div>
            <button type="button" className="secondary" onClick={() => setShowOptionsDialog(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {showExplanationDialog ? (
        <div className="solo-dialog-overlay" role="dialog" aria-modal="true" aria-label="Note explanation">
          <div className="solo-dialog-card">
            <h3>Note Explanation</h3>
            <p>
              {noteInsight ||
                'Your note is ready. Start with exam drills for structured practice, or generate a video for concept walkthrough.'}
            </p>
            <div className="solo-dialog-actions">
              <button type="button" className="btn" onClick={handleExamDrills}>Go to Exam Drills</button>
              <button type="button" className="secondary" onClick={() => setShowExplanationDialog(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
