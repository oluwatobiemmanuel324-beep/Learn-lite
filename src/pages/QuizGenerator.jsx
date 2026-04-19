import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { aiAPI, chatAPI, getApiErrorMessage, groupAPI, quizAPI, userAPI } from '../services/api';
import { useApp } from '../context/AppContext';

const backgroundPresets = [
  'linear-gradient(135deg, #0f7b6c 0%, #0b141a 100%)',
  'linear-gradient(135deg, #1f4db8 0%, #08131d 100%)',
  'linear-gradient(135deg, #912f56 0%, #100a12 100%)',
  'linear-gradient(135deg, #6257ff 0%, #111827 100%)',
  'linear-gradient(135deg, #198754 0%, #0f1720 100%)',
  'linear-gradient(135deg, #ff8a00 0%, #1f1b2e 100%)'
];

const reactionOptions = ['👍', '❤️', '😂'];
const DEFAULT_EXAM_DURATION_SECONDS = 15 * 60;

function parseQuizQuestionsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const sources = [
    payload.questions,
    payload.quiz?.questions,
    payload.data?.questions,
    payload.data?.quiz?.questions,
    payload.result?.questions,
    payload.result?.quiz?.questions
  ];

  const rawQuestions = sources.find((candidate) => Array.isArray(candidate)) || [];

  return rawQuestions
    .map((item, index) => {
      const stem = item?.question || item?.prompt || item?.text || `Question ${index + 1}`;
      const choiceCandidates = [
        item?.options,
        item?.choices,
        item?.answers,
        item?.alternatives
      ].find((candidate) => Array.isArray(candidate));

      const normalizedChoices = Array.isArray(choiceCandidates)
        ? choiceCandidates.map((choice, choiceIndex) => {
            if (typeof choice === 'string') {
              return { key: String.fromCharCode(65 + choiceIndex), text: choice };
            }

            if (choice && typeof choice === 'object') {
              const key = String(choice.key || choice.label || String.fromCharCode(65 + choiceIndex));
              const text = String(choice.text || choice.value || choice.option || `Option ${key}`);
              return { key, text };
            }

            return { key: String.fromCharCode(65 + choiceIndex), text: String(choice || '') };
          })
        : [];

      const rawCorrect = item?.correctAnswer ?? item?.answer ?? item?.correct_option;
      const normalizedCorrect = rawCorrect == null ? null : String(rawCorrect).trim();

      return {
        id: item?.id || `q-${index + 1}`,
        question: String(stem),
        options: normalizedChoices,
        correctAnswer: normalizedCorrect,
        explanation: item?.explanation || ''
      };
    })
    .filter((item) => item.question && item.options.length > 0);
}

function generateFallbackQuestionsFromNote(noteName, count = 8) {
  const total = Math.max(5, Math.min(Number(count) || 8, 20));
  return Array.from({ length: total }).map((_, idx) => {
    const qNo = idx + 1;
    const options = [
      { key: 'A', text: `Core concept in ${noteName} (option A)` },
      { key: 'B', text: `Core concept in ${noteName} (option B)` },
      { key: 'C', text: `Core concept in ${noteName} (option C)` },
      { key: 'D', text: `Core concept in ${noteName} (option D)` }
    ];

    return {
      id: `fallback-${qNo}`,
      question: `From ${noteName}, which option best answers question ${qNo}?`,
      options,
      correctAnswer: options[qNo % options.length].key,
      explanation: 'Generated from local fallback template because parser payload was not available.'
    };
  });
}

function WorkspaceState({ title, message, actionLabel, onAction }) {
  return (
    <div className="workspace-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {onAction && (
        <button className="workspace-ghost-button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default function QuizGenerator() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: groupId } = useParams();
  const { uploadedFile } = useApp();
  const fileInputRef = useRef(null);
  const bgImageInputRef = useRef(null);

  const [group, setGroup] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [customBackground, setCustomBackground] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newJoinCode, setNewJoinCode] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [attachedNote, setAttachedNote] = useState(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [workspaceMessages, setWorkspaceMessages] = useState([]);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [generatedQuiz, setGeneratedQuiz] = useState(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizGenerationError, setQuizGenerationError] = useState('');
  const [fuelBalance, setFuelBalance] = useState(0);
  const [loadingFuel, setLoadingFuel] = useState(false);
  const [publishingQuiz, setPublishingQuiz] = useState(false);
  const [publishedQuizAt, setPublishedQuizAt] = useState(null);
  const [examMode, setExamMode] = useState(false);
  const [examTimeLeft, setExamTimeLeft] = useState(DEFAULT_EXAM_DURATION_SECONDS);
  const [examAnswers, setExamAnswers] = useState({});
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [examResult, setExamResult] = useState(null);
  const [showExamOverview, setShowExamOverview] = useState(false);
  const [proStudyMode, setProStudyMode] = useState('none');
  const [examHistory, setExamHistory] = useState([]);
  const [autoGeneratedOnce, setAutoGeneratedOnce] = useState(false);

  const normalizeBackgroundForCss = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (/^data:image\//i.test(trimmed)) {
      return `url("${trimmed}")`;
    }
    return trimmed;
  };

  const currentUser = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('learn_lite_user') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  })();
  const currentUsername = currentUser?.username || 'You';
  const currentUserId = Number(localStorage.getItem('user_id') || currentUser?.id || 0);
  const examHistoryKey = `learn_lite_exam_history_${currentUserId || 'anon'}`;
  const isStandaloneMode = !groupId;

  useEffect(() => {
    if (!groupId) {
      const fallbackId = Number(localStorage.getItem('user_id') || currentUser?.id || 0);
      setGroup({
        id: 'solo-room',
        name: 'Personal Study Room',
        joinCode: 'SOLO00',
        createdById: fallbackId,
        members: [
          {
            role: 'ADMIN',
            user: {
              id: fallbackId || 0,
              username: currentUsername,
              email: currentUser?.email || 'you@learnlite.local'
            }
          }
        ]
      });
      setCurrentUserRole('ADMIN');
      setLoading(false);
      return;
    }

    const fetchGroup = async () => {
      try {
        const result = await groupAPI.getGroupWorkspace(groupId);
        if (result.success && result.group) {
          setGroup(result.group);
          setCurrentUserRole(result.group.currentUserRole);
          setCustomBackground(normalizeBackgroundForCss(result.group.currentUserBackground));
        } else {
          setError(result.error || 'Failed to load group');
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Server error');
        console.error('Fetch group error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [groupId]);

  useEffect(() => {
    if (uploadedFile && !attachedNote) {
      setAttachedNote(uploadedFile);
    }
  }, [uploadedFile, attachedNote]);

  useEffect(() => {
    if (autoGeneratedOnce) return;
    if (!location.state?.autoGenerate) return;
    if (!attachedNote) return;

    setAutoGeneratedOnce(true);
    handleGenerateQuizShortcut();
  }, [location.state, attachedNote, autoGeneratedOnce]);

  const fetchFuelBalance = async () => {
    setLoadingFuel(true);
    try {
      const result = await userAPI.getFuel();
      const nextFuel = Number(result?.fuelBalance ?? result?.fuel ?? 0);
      setFuelBalance(Number.isFinite(nextFuel) ? nextFuel : 0);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to refresh fuel balance right now.');
      appendWorkspaceMessage({
        tone: 'system',
        title: 'Fuel status',
        text: message
      });
    } finally {
      setLoadingFuel(false);
    }
  };

  useEffect(() => {
    fetchFuelBalance();
  }, []);

  const loadGroupMessages = async () => {
    if (!groupId) return;

    try {
      const result = await chatAPI.getMessages(groupId);
      if (!result?.success || !Array.isArray(result?.messages)) {
        return;
      }

      const normalizedMessages = result.messages.map((message) => {
        const senderId = Number(message?.senderId || 0);
        const tone = senderId && senderId === currentUserId ? 'outgoing' : 'incoming';

        return {
          id: String(message.id || `${Date.now()}-${Math.random()}`),
          tone,
          title: String(message.title || 'Classmate'),
          text: String(message.text || '').trim(),
          replyTo: message.replyTo || null,
          reactions: message.reactions && typeof message.reactions === 'object' ? message.reactions : {}
        };
      }).filter((message) => message.text);

      setWorkspaceMessages(normalizedMessages);
    } catch (err) {
      console.warn('Unable to load class messages:', getApiErrorMessage(err, 'Unable to load class messages right now.'));
    }
  };

  useEffect(() => {
    if (!groupId) return;

    loadGroupMessages();
    const intervalId = window.setInterval(loadGroupMessages, 8000);
    return () => window.clearInterval(intervalId);
  }, [groupId]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(examHistoryKey) || '[]');
      setExamHistory(Array.isArray(parsed) ? parsed : []);
    } catch {
      setExamHistory([]);
    }
  }, [examHistoryKey]);

  useEffect(() => {
    if (!examMode || examSubmitted) return;
    if (examTimeLeft <= 0) {
      handleSubmitExam(true);
      return;
    }

    const timer = setInterval(() => {
      setExamTimeLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [examMode, examSubmitted, examTimeLeft]);

  const appendWorkspaceMessage = (message) => {
    setWorkspaceMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        reactions: {},
        replyTo: null,
        ...message
      }
    ]);
  };

  const handleReplyToMessage = (message) => {
    if (message.tone === 'system') return;

    setReplyTarget({
      id: message.id,
      title: message.title,
      text: message.text
    });
  };

  const handleToggleReaction = (messageId, emoji) => {
    setWorkspaceMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const currentUsers = message.reactions?.[emoji] || [];
        const hasReacted = currentUsers.includes(currentUsername);
        const nextUsers = hasReacted
          ? currentUsers.filter((username) => username !== currentUsername)
          : [...currentUsers, currentUsername];

        const nextReactions = {
          ...(message.reactions || {}),
          [emoji]: nextUsers
        };

        if (nextUsers.length === 0) {
          delete nextReactions[emoji];
        }

        return {
          ...message,
          reactions: nextReactions
        };
      })
    );
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this user from the group?')) return;

    try {
      const result = await groupAPI.removeMember(groupId, userId);
      if (result.success) {
        setGroup((current) => ({
          ...current,
          members: current.members.filter((member) => member.user.id !== userId)
        }));
        appendWorkspaceMessage({
          tone: 'system',
          title: 'Member removed',
          text: 'The member list has been updated for everyone in this group view.'
        });
      } else {
        alert(result.error || 'Failed to remove member');
      }
    } catch (err) {
      alert('Error removing member: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePromoteAdmin = async (userId) => {
    if (!window.confirm('Promote this user to Admin?')) return;

    try {
      const result = await groupAPI.promoteToAdmin(groupId, userId);
      if (result.success) {
        setGroup((current) => ({
          ...current,
          members: current.members.map((member) =>
            member.user.id === userId ? { ...member, role: 'ADMIN' } : member
          )
        }));
        appendWorkspaceMessage({
          tone: 'system',
          title: 'Admin updated',
          text: 'A member has been promoted to admin.'
        });
      } else {
        alert(result.error || 'Failed to promote member');
      }
    } catch (err) {
      alert('Error promoting member: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleChangeJoinCode = async () => {
    if (isStandaloneMode) {
      return;
    }

    if (!newJoinCode && !window.confirm('Generate a new random join code?')) return;

    try {
      const result = await groupAPI.updateGroupCode(groupId, newJoinCode || undefined);
      if (result.success) {
        setGroup((current) => ({ ...current, joinCode: result.group.joinCode }));
        setNewJoinCode('');
        setShowCodeInput(false);
        appendWorkspaceMessage({
          tone: 'system',
          title: 'Join code refreshed',
          text: `Current invite code is now ${result.group.joinCode}.`
        });
      } else {
        alert(result.error || 'Failed to update join code');
      }
    } catch (err) {
      alert('Error updating join code: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSetBackground = async (backgroundValue) => {
    const normalizedBackground = normalizeBackgroundForCss(backgroundValue);

    if (isStandaloneMode) {
      setCustomBackground(normalizedBackground);
      return;
    }

    try {
      const result = await groupAPI.setCustomBackground(groupId, normalizedBackground);
      if (result.success) {
        setCustomBackground(normalizedBackground);
      } else {
        alert(result.error || 'Failed to set background');
      }
    } catch (err) {
      alert('Error setting background: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSelectNote = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAttachedNote(file);
    appendWorkspaceMessage({
      tone: 'outgoing',
      title: 'Note attached',
      text: `${file.name} is attached to this workspace and ready for the next study action.`
    });
    event.target.value = '';
  };

  const handleSendMessage = async () => {
    if (!draftMessage.trim()) return;

    const messageText = draftMessage.trim();
    const mentionsAI = /@learnlite/i.test(messageText);
    const outgoingReply = replyTarget
      ? {
          id: replyTarget.id,
          title: replyTarget.title,
          text: replyTarget.text
        }
      : null;

    if (isStandaloneMode) {
      appendWorkspaceMessage({
        tone: 'outgoing',
        title: currentUsername,
        text: messageText,
        replyTo: outgoingReply
      });

      if (mentionsAI) {
        appendWorkspaceMessage({
          tone: 'incoming',
          title: '@learnlite',
          text: "Hey there! I'm @learnlite, your study companion. How can I help you learn today? Ask me anything about your classwork, and I'll do my best to help! 📚",
          replyTo: {
            id: `${Date.now()}-prompt`,
            title: currentUsername,
            text: messageText
          }
        });
      }

      setDraftMessage('');
      setReplyTarget(null);
      return;
    }

    try {
      const sendResult = await chatAPI.sendMessage(groupId, {
        text: messageText,
        replyTo: outgoingReply
      });

      if (sendResult?.success && sendResult?.message) {
        const sentMessage = sendResult.message;
        appendWorkspaceMessage({
          id: sentMessage.id,
          tone: 'outgoing',
          title: sentMessage.title || currentUsername,
          text: sentMessage.text || messageText,
          replyTo: sentMessage.replyTo || outgoingReply,
          reactions: sentMessage.reactions || {}
        });
      } else {
        appendWorkspaceMessage({
          tone: 'outgoing',
          title: currentUsername,
          text: messageText,
          replyTo: outgoingReply
        });
      }

      if (mentionsAI) {
        try {
          const aiResult = await aiAPI.chat(groupId, messageText);
          if (aiResult?.success && aiResult?.message) {
            appendWorkspaceMessage({
              tone: 'incoming',
              title: '@learnlite',
              text: String(aiResult.message).trim(),
              replyTo: {
                id: `${Date.now()}-prompt`,
                title: currentUsername,
                text: messageText
              }
            });
          }
        } catch (aiErr) {
          const aiMessage = getApiErrorMessage(aiErr, 'AI assistant is currently unavailable.');
          appendWorkspaceMessage({
            tone: 'system',
            title: '@learnlite',
            text: aiMessage
          });
        }
      }
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to send message to your class group.');
      appendWorkspaceMessage({
        tone: 'system',
        title: 'Message failed',
        text: message
      });
    } finally {
      setDraftMessage('');
      setReplyTarget(null);
    }
  };

  const handleGenerateQuizShortcut = () => {
    if (!attachedNote) {
      alert('Upload a note first so the workspace knows what to generate from.');
      return;
    }

    setQuizGenerationError('');
    setIsGeneratingQuiz(true);
    setExamMode(false);
    setExamSubmitted(false);
    setExamResult(null);
    setExamAnswers({});

    (async () => {
      try {
        const response = await quizAPI.generateQuiz(attachedNote, {
          questionCount: 10,
          difficulty: 'mixed',
          mode: 'exam-ready'
        });

        const parsedQuestions = parseQuizQuestionsFromPayload(response);
        const effectiveQuestions = parsedQuestions.length
          ? parsedQuestions
          : generateFallbackQuestionsFromNote(attachedNote.name, 10);

        const generated = {
          id: response?.quizId || response?.id || `generated-${Date.now()}`,
          source: attachedNote.name,
          generatedAt: new Date().toISOString(),
          questions: effectiveQuestions,
          backendResponse: response
        };

        setGeneratedQuiz(generated);
        appendWorkspaceMessage({
          tone: 'system',
          title: 'Quiz generated',
          text: `Created ${effectiveQuestions.length} questions from ${attachedNote.name}. Choose Review, Exam Mode, or Publish to Class Group.`
        });
      } catch (err) {
        const message = getApiErrorMessage(err, 'Quiz generation failed. Please try again.');
        setQuizGenerationError(message);
        appendWorkspaceMessage({
          tone: 'system',
          title: 'Quiz generation failed',
          text: message
        });
      } finally {
        setIsGeneratingQuiz(false);
      }
    })();
  };

  const handleStartExamMode = () => {
    if (!generatedQuiz?.questions?.length) {
      alert('Generate a quiz first.');
      return;
    }

    setExamAnswers({});
    setExamTimeLeft(DEFAULT_EXAM_DURATION_SECONDS);
    setExamSubmitted(false);
    setExamResult(null);
    setExamMode(true);
    appendWorkspaceMessage({
      tone: 'system',
      title: 'Exam mode started',
      text: 'Timer started. You have 15 minutes. Your exam auto-submits when time expires.'
    });
  };

  const handleSelectExamAnswer = (questionId, answerKey) => {
    if (examSubmitted) return;
    setExamAnswers((current) => ({ ...current, [questionId]: answerKey }));
  };

  const scoreQuizDetailed = () => {
    const questions = generatedQuiz?.questions || [];
    if (!questions.length) return { score: 0, total: 0, percent: 0, review: [], mistakes: [] };

    let correct = 0;
    const review = questions.map((question) => {
      const selectedRaw = String(examAnswers[question.id] || '').trim().toUpperCase();
      const expectedRaw = String(question.correctAnswer || '').trim().toUpperCase();

      const selectedOption = question.options.find((option) => String(option.key || '').trim().toUpperCase() === selectedRaw) || null;
      const expectedOption = question.options.find((option) => String(option.key || '').trim().toUpperCase() === expectedRaw)
        || question.options.find((option) => String(option.text || '').trim().toUpperCase() === expectedRaw)
        || null;

      const isCorrect = Boolean(selectedOption && expectedOption && selectedOption.key === expectedOption.key);
      if (isCorrect) correct += 1;

      return {
        id: question.id,
        question: question.question,
        selectedLabel: selectedOption ? `${selectedOption.key}. ${selectedOption.text}` : 'No answer selected',
        correctLabel: expectedOption ? `${expectedOption.key}. ${expectedOption.text}` : 'Not available',
        explanation: question.explanation || '',
        isCorrect
      };
    });

    const total = questions.length;
    const percent = Math.round((correct / total) * 100);
    const mistakes = review.filter((item) => !item.isCorrect);
    return { score: correct, total, percent, review, mistakes };
  };

  const persistExamAttempt = (result, autoSubmitted) => {
    const attempt = {
      id: `attempt-${Date.now()}`,
      quizId: generatedQuiz?.id || null,
      quizSource: generatedQuiz?.source || 'Unknown source',
      takenAt: new Date().toISOString(),
      autoSubmitted,
      score: result.score,
      total: result.total,
      percent: result.percent,
      mistakes: result.mistakes,
      review: result.review
    };

    const nextHistory = [attempt, ...examHistory].slice(0, 30);
    setExamHistory(nextHistory);
    localStorage.setItem(examHistoryKey, JSON.stringify(nextHistory));
  };

  const handleSubmitExam = (autoSubmitted = false) => {
    if (!generatedQuiz?.questions?.length || examSubmitted) return;

    const result = scoreQuizDetailed();
    setExamSubmitted(true);
    setExamResult(result);
    setShowExamOverview(true);
    setProStudyMode('none');
    persistExamAttempt(result, autoSubmitted);

    appendWorkspaceMessage({
      tone: 'system',
      title: autoSubmitted ? 'Exam auto-submitted' : 'Exam submitted',
      text: `Score: ${result.score}/${result.total} (${result.percent}%). Mistakes saved for focused study.`
    });
  };

  const handleRetakeExam = () => {
    if (!generatedQuiz?.questions?.length) return;
    setExamAnswers({});
    setExamSubmitted(false);
    setExamResult(null);
    setShowExamOverview(false);
    setProStudyMode('none');
    setExamTimeLeft(DEFAULT_EXAM_DURATION_SECONDS);
    setExamMode(true);
  };

  const buildProStudyPrompt = () => {
    const mistakes = examResult?.mistakes || [];
    if (!mistakes.length) {
      return 'Create a focused remediation lesson based on my recent exam performance and include worked examples.';
    }

    const focusLines = mistakes.slice(0, 6).map((item, idx) => `${idx + 1}. ${item.question}`);
    return `Create a concise remedial study lesson from these missed exam areas:\n${focusLines.join('\n')}\nExplain each mistake and include memory aids and practice drills.`;
  };

  const handleProStudyVideo = () => {
    navigate('/generate-video', { state: { prefillPrompt: buildProStudyPrompt() } });
  };

  const handlePublishQuizToGroup = async () => {
    if (isStandaloneMode) {
      alert('Publishing to class group is available inside a class workspace. Create or join a class group first.');
      return;
    }

    if (!generatedQuiz?.questions?.length) {
      alert('Generate a quiz first.');
      return;
    }

    if (fuelBalance < 1) {
      alert('Insufficient fuel. Buy fuel to publish this quiz to your class group.');
      return;
    }

    setPublishingQuiz(true);
    try {
      const payload = {
        title: generatedQuiz.source ? `Quiz from ${generatedQuiz.source}` : 'Class Quiz',
        quiz: {
          sourceFileName: generatedQuiz.source,
          questionCount: generatedQuiz.questions.length,
          generatedAt: generatedQuiz.generatedAt,
          questions: generatedQuiz.questions
        }
      };
      const result = await groupAPI.publishQuiz(groupId, payload);
      const serverFuel = Number(result?.fuelRemaining);
      if (Number.isFinite(serverFuel)) {
        setFuelBalance(serverFuel);
      } else {
        setFuelBalance((current) => Math.max(0, current - 1));
      }

      setPublishedQuizAt(new Date().toISOString());
      appendWorkspaceMessage({
        tone: 'system',
        title: 'Quiz published to class group',
        text: `Published ${generatedQuiz.questions.length} questions. Fuel remaining: ${Number.isFinite(serverFuel) ? serverFuel : Math.max(0, fuelBalance - 1)}.`
      });
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to publish quiz to class group.');
      appendWorkspaceMessage({
        tone: 'system',
        title: 'Publish failed',
        text: message
      });
      alert(message);
    } finally {
      setPublishingQuiz(false);
    }
  };

  const formatExamTime = (seconds) => {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleGenerateVideoShortcut = () => {
    navigate('/generate-video');
  };

  const handleSelectBackgroundImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      event.target.value = '';
      return;
    }

    // Keep payload size low to avoid API body limit errors when persisting base64.
    const maxSizeBytes = 4 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert('Image too large. Please upload an image smaller than 4MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      handleSetBackground(dataUrl);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  if (loading) {
    return (
      <div className="workspace-shell workspace-shell--centered">
        <WorkspaceState title="Loading workspace" message="Preparing the class chat and member space..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="workspace-shell workspace-shell--centered">
        <WorkspaceState
          title="Workspace error"
          message={error}
          actionLabel="Return Home"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="workspace-shell workspace-shell--centered">
        <WorkspaceState
          title="Group not found"
          message="This class workspace does not exist anymore or you no longer have access to it."
          actionLabel="Return Home"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  const isAdmin = currentUserRole === 'ADMIN';
  const isCreator = group.createdById === Number(localStorage.getItem('user_id') || '0');
  const activeBackground = customBackground || 'linear-gradient(180deg, rgba(11, 20, 26, 0.96), rgba(11, 20, 26, 0.98))';

  return (
    <div className="workspace-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*,.txt,.doc,.docx"
        style={{ display: 'none' }}
        onChange={handleSelectNote}
      />
      <input
        ref={bgImageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleSelectBackgroundImage}
      />

      <div className="workspace-layout workspace-layout--full-width">
        {/* Hidden sidebar, revealed as modal on demand */}
        {showGroupDetails && !isStandaloneMode && (
          <div className="workspace-modal-overlay" onClick={() => setShowGroupDetails(false)}>
            <div className="workspace-modal" onClick={(e) => e.stopPropagation()}>
              <div className="workspace-modal__header">
                <h2>Group Details</h2>
                <button className="workspace-modal__close" onClick={() => setShowGroupDetails(false)}>×</button>
              </div>

              <div className="workspace-modal__content">
                <div className="workspace-sidebar__hero">
                  <div className="workspace-avatar">{group.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <h1>{group.name}</h1>
                    <p>{group.members.length} member{group.members.length === 1 ? '' : 's'} in this study room</p>
                  </div>
                </div>

                <div className="workspace-join-code-card">
                  <span className="workspace-card-label">Invite code</span>
                  <div className="workspace-join-code-row">
                    <code>{group.joinCode}</code>
                    {isAdmin && (
                      <button className="workspace-pill-button" onClick={() => setShowCodeInput((current) => !current)}>
                        {showCodeInput ? 'Close' : 'Change'}
                      </button>
                    )}
                  </div>
                  {showCodeInput && (
                    <div className="workspace-join-code-form">
                      <input
                        type="text"
                        maxLength="6"
                        placeholder="ABC123"
                        value={newJoinCode}
                        onChange={(event) => setNewJoinCode(event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 6))}
                      />
                      <button className="workspace-primary-button" onClick={handleChangeJoinCode}>
                        {newJoinCode ? 'Set code' : 'Generate'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="workspace-personalization-card">
                  <h3>Personalize your space</h3>
                  <p>Choose a background or upload a custom image (only visible to you)</p>
                  
                  <div className="workspace-background-grid" style={{ marginTop: '12px' }}>
                    {backgroundPresets.map((backgroundValue) => (
                      <button
                        key={backgroundValue}
                        className={`workspace-background-swatch${customBackground === backgroundValue ? ' is-active' : ''}`}
                        style={{ background: backgroundValue }}
                        onClick={() => handleSetBackground(backgroundValue)}
                      />
                    ))}
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                    <button className="workspace-inline-button" onClick={() => bgImageInputRef.current?.click()}>
                      Upload Image
                    </button>
                    <button className="workspace-inline-button" onClick={() => handleSetBackground(null)}>
                      Clear background
                    </button>
                  </div>
                </div>

                <div className="workspace-members">
                  <div className="workspace-section-heading">
                    <h2>Members</h2>
                    <span>{group.members.length}</span>
                  </div>

                  <div className="workspace-member-list">
                    {group.members.map((member) => (
                      <div className="workspace-member-card" key={member.user.id}>
                        <div className="workspace-member-main">
                          <div className="workspace-member-avatar">{member.user.username.slice(0, 1).toUpperCase()}</div>
                          <div>
                            <div className="workspace-member-name">{member.user.username}</div>
                            <div className="workspace-member-email">{member.user.email}</div>
                            <div className="workspace-member-role">{member.role}</div>
                          </div>
                        </div>

                        {isAdmin && (
                          <div className="workspace-member-actions">
                            {member.role === 'MEMBER' && isCreator && (
                              <button className="workspace-mini-button workspace-mini-button--accent" onClick={() => handlePromoteAdmin(member.user.id)}>
                                Promote
                              </button>
                            )}
                            <button className="workspace-mini-button workspace-mini-button--danger" onClick={() => handleRemoveMember(member.user.id)}>
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <aside className="workspace-sidebar workspace-sidebar--hidden">
          <div className="workspace-sidebar__top">
            <button className="workspace-ghost-button" onClick={() => navigate('/')}>
              Back Home
            </button>
            <div className="workspace-sidebar__badge">Class Group</div>
          </div>

          <div className="workspace-sidebar__hero">
            <div className="workspace-avatar">{group.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <h1>{group.name}</h1>
              <p>{group.members.length} member{group.members.length === 1 ? '' : 's'} in this study room</p>
            </div>
          </div>

          <div className="workspace-join-code-card">
            <span className="workspace-card-label">Invite code</span>
            <div className="workspace-join-code-row">
              <code>{group.joinCode}</code>
              {isAdmin && (
                <button className="workspace-pill-button" onClick={() => setShowCodeInput((current) => !current)}>
                  {showCodeInput ? 'Close' : 'Change'}
                </button>
              )}
            </div>
            {showCodeInput && (
              <div className="workspace-join-code-form">
                <input
                  type="text"
                  maxLength="6"
                  placeholder="ABC123"
                  value={newJoinCode}
                  onChange={(event) => setNewJoinCode(event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 6))}
                />
                <button className="workspace-primary-button" onClick={handleChangeJoinCode}>
                  {newJoinCode ? 'Set code' : 'Generate'}
                </button>
              </div>
            )}
          </div>

          <div className="workspace-members">
            <div className="workspace-section-heading">
              <h2>Members</h2>
              <span>{group.members.length}</span>
            </div>

            <div className="workspace-member-list">
              {group.members.map((member) => (
                <div className="workspace-member-card" key={member.user.id}>
                  <div className="workspace-member-main">
                    <div className="workspace-member-avatar">{member.user.username.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <div className="workspace-member-name">{member.user.username}</div>
                      <div className="workspace-member-email">{member.user.email}</div>
                      <div className="workspace-member-role">{member.role}</div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="workspace-member-actions">
                      {member.role === 'MEMBER' && isCreator && (
                        <button className="workspace-mini-button workspace-mini-button--accent" onClick={() => handlePromoteAdmin(member.user.id)}>
                          Promote
                        </button>
                      )}
                      <button className="workspace-mini-button workspace-mini-button--danger" onClick={() => handleRemoveMember(member.user.id)}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="workspace-chat-panel">
          <header className="workspace-chat-header">
            <button className="workspace-ghost-button" onClick={() => navigate(-1)}>
              Back
            </button>
            <button
              className="workspace-chat-header__group-button"
              onClick={() => {
                if (!isStandaloneMode) {
                  setShowGroupDetails(true);
                }
              }}
            >
              <div className="workspace-chat-avatar">{group.name.slice(0, 1).toUpperCase()}</div>
              <div>
                <h2>{group.name}</h2>
                <p>
                  {isStandaloneMode
                    ? 'Solo mode • exam-ready study workspace'
                    : `${isAdmin ? 'Admin controls enabled' : 'Member view'} • collaborative learning space`}
                </p>
              </div>
            </button>

            <div className="workspace-chat-header__meta">
              <span>{attachedNote ? `Attached: ${attachedNote.name}` : 'No note attached yet'}</span>
              <span>Fuel: {loadingFuel ? '...' : fuelBalance}</span>
            </div>
          </header>

          <div className="workspace-chat-body" style={{ background: activeBackground }}>
            <div className="workspace-chat-scroll">
              <div className="workspace-day-separator">Today</div>

              <article className="workspace-message workspace-message--incoming">
                <span className="workspace-message__eyebrow">Workspace</span>
                <h3>Welcome to {group.name}</h3>
                <p>
                  This room now behaves like a focused class chat. Use the composer below to attach notes, stage quiz work,
                  or jump into video tutorial creation. Mention @learnlite to chat with your AI study assistant! 🤖
                </p>
              </article>

              {!isStandaloneMode && (
                <article className="workspace-message workspace-message--outgoing">
                  <span className="workspace-message__eyebrow">Group code</span>
                  <h3>{group.joinCode}</h3>
                  <p>Share this code with classmates who should join this workspace.</p>
                </article>
              )}

              {workspaceMessages.map((message) => (
                <article
                  className={`workspace-message ${message.tone === 'outgoing' ? 'workspace-message--outgoing' : 'workspace-message--incoming'}`}
                  key={message.id}
                >
                  {message.replyTo && (
                    <div className="workspace-message__reply-context">
                      <strong>{message.replyTo.title}</strong>
                      <span>{message.replyTo.text}</span>
                    </div>
                  )}
                  <span className="workspace-message__eyebrow">{message.title}</span>
                  <p>{message.text}</p>

                  {message.tone !== 'system' && (
                    <div className="workspace-message__footer">
                      <button
                        className="workspace-message__reply-button"
                        onClick={() => handleReplyToMessage(message)}
                      >
                        Reply
                      </button>

                      <div className="workspace-message__reaction-picker">
                        {reactionOptions.map((emoji) => {
                          const reactionUsers = message.reactions?.[emoji] || [];
                          const isActive = reactionUsers.includes(currentUsername);

                          return (
                            <button
                              key={`${message.id}-${emoji}`}
                              className={`workspace-message__reaction-button${isActive ? ' is-active' : ''}`}
                              onClick={() => handleToggleReaction(message.id, emoji)}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {Object.keys(message.reactions || {}).length > 0 && (
                    <div className="workspace-message__reactions">
                      {Object.entries(message.reactions).map(([emoji, usernames]) => (
                        <span className="workspace-message__reaction-pill" key={`${message.id}-${emoji}-count`}>
                          {emoji} {usernames.length}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}

              {generatedQuiz?.questions?.length > 0 && (
                <article className="workspace-message workspace-message--wide workspace-message--incoming workspace-quiz-result-card">
                  <span className="workspace-message__eyebrow">Quiz ready</span>
                  <h3>{generatedQuiz.questions.length} questions from {generatedQuiz.source}</h3>
                  <p>
                    Generated at {new Date(generatedQuiz.generatedAt).toLocaleString()}.
                    {' '}Use the actions below to review, switch to exam mode, or publish to your class group (costs 1 fuel).
                  </p>

                  {quizGenerationError && <p className="workspace-quiz-error">{quizGenerationError}</p>}

                  <div className="workspace-quiz-actions">
                    <button className="workspace-primary-button" onClick={handleStartExamMode}>
                      Take In Exam Mode
                    </button>
                    {!isStandaloneMode && (
                      <button
                        className="workspace-inline-button"
                        onClick={handlePublishQuizToGroup}
                        disabled={publishingQuiz || fuelBalance < 1}
                      >
                        {publishingQuiz ? 'Publishing...' : 'Publish to Class Group (1 Fuel)'}
                      </button>
                    )}
                  </div>

                  {publishedQuizAt && (
                    <div className="workspace-publish-badge">
                      Published at {new Date(publishedQuizAt).toLocaleTimeString()}.
                    </div>
                  )}

                  {examHistory.length > 0 && (
                    <div className="workspace-exam-history-inline">
                      Last exam: {examHistory[0]?.score}/{examHistory[0]?.total} ({examHistory[0]?.percent}%) • Attempts saved: {examHistory.length}
                    </div>
                  )}

                  {!examMode && (
                    <div className="workspace-quiz-review-list">
                      {generatedQuiz.questions.slice(0, 5).map((question, idx) => (
                        <div className="workspace-quiz-review-item" key={question.id}>
                          <strong>Q{idx + 1}.</strong> {question.question}
                        </div>
                      ))}
                      {generatedQuiz.questions.length > 5 && (
                        <div className="workspace-quiz-review-item workspace-quiz-review-item--muted">
                          +{generatedQuiz.questions.length - 5} more questions
                        </div>
                      )}
                    </div>
                  )}
                </article>
              )}

              {examMode && generatedQuiz?.questions?.length > 0 && (
                <article className="workspace-message workspace-message--wide workspace-message--incoming workspace-exam-card">
                  <div className="workspace-exam-header">
                    <span className="workspace-message__eyebrow">Exam mode</span>
                    <div className={`workspace-exam-timer${examTimeLeft <= 120 ? ' is-danger' : ''}`}>
                      Time Left: {formatExamTime(examTimeLeft)}
                    </div>
                  </div>

                  <h3>Timed CBT Session</h3>
                  <p>Answer all questions before the timer expires. Unanswered questions score zero.</p>

                  <div className="workspace-exam-questions">
                    {generatedQuiz.questions.map((question, index) => (
                      <div className="workspace-exam-question" key={question.id}>
                        <div className="workspace-exam-question-title">{index + 1}. {question.question}</div>
                        <div className="workspace-exam-options">
                          {question.options.map((option) => {
                            const checked = examAnswers[question.id] === option.key;
                            return (
                              <label className={`workspace-exam-option${checked ? ' is-selected' : ''}`} key={`${question.id}-${option.key}`}>
                                <input
                                  type="radio"
                                  name={`question-${question.id}`}
                                  value={option.key}
                                  checked={checked}
                                  onChange={() => handleSelectExamAnswer(question.id, option.key)}
                                  disabled={examSubmitted}
                                />
                                <span>{option.key}. {option.text}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {!examSubmitted ? (
                    <button className="workspace-primary-button" onClick={() => handleSubmitExam(false)}>
                      Submit Exam
                    </button>
                  ) : (
                    <>
                      <div className="workspace-exam-result">
                        Score: {examResult?.score}/{examResult?.total} ({examResult?.percent}%) • Mistakes: {examResult?.mistakes?.length || 0}
                      </div>

                      <div className="workspace-exam-post-actions">
                        <button className="workspace-primary-button" onClick={handleRetakeExam}>
                          Retake Exam
                        </button>
                        <button
                          className="workspace-inline-button"
                          onClick={() => setShowExamOverview((current) => !current)}
                        >
                          {showExamOverview ? 'Hide Exam Overview' : 'See Exam Overview'}
                        </button>
                        <button
                          className="workspace-inline-button"
                          onClick={() => setProStudyMode((current) => (current === 'none' ? 'choose' : 'none'))}
                        >
                          {proStudyMode === 'none' ? 'Pro Study' : 'Close Pro Study'}
                        </button>
                      </div>

                      {showExamOverview && (
                        <div className="workspace-exam-overview">
                          <h4>Exam Overview</h4>
                          {(examResult?.review || []).map((item, idx) => (
                            <div
                              key={`overview-${item.id}`}
                              className={`workspace-exam-overview-item${item.isCorrect ? ' is-correct' : ' is-wrong'}`}
                            >
                              <div className="workspace-exam-overview-title">
                                Q{idx + 1}. {item.question}
                              </div>
                              <div className="workspace-exam-overview-line">
                                Your answer: {item.selectedLabel}
                              </div>
                              {!item.isCorrect && (
                                <div className="workspace-exam-overview-line workspace-exam-overview-correct">
                                  Correct answer: {item.correctLabel}
                                </div>
                              )}
                              {!item.isCorrect && item.explanation && (
                                <div className="workspace-exam-overview-line workspace-exam-overview-explain">
                                  Why: {item.explanation}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {proStudyMode !== 'none' && (
                        <div className="workspace-prostudy-wrap">
                          {proStudyMode === 'choose' && (
                            <div className="workspace-prostudy-choice">
                              <p>Pick your focused remediation mode:</p>
                              <div className="workspace-exam-post-actions">
                                <button className="workspace-primary-button" onClick={() => setProStudyMode('text')}>
                                  Text-based Study
                                </button>
                                <button className="workspace-inline-button" onClick={handleProStudyVideo}>
                                  Video-based Study
                                </button>
                              </div>
                            </div>
                          )}

                          {proStudyMode === 'text' && (
                            <div className="workspace-prostudy-text">
                              <h4>Error-Focused Study Mode</h4>
                              {(examResult?.mistakes || []).length === 0 ? (
                                <p>You had no mistakes in this attempt. Great work. Use retake for speed practice.</p>
                              ) : (
                                (examResult?.mistakes || []).map((mistake, idx) => (
                                  <div key={`mistake-${mistake.id}`} className="workspace-prostudy-item">
                                    <div className="workspace-prostudy-item-title">Focus {idx + 1}: {mistake.question}</div>
                                    <div className="workspace-prostudy-item-line">Missed with: {mistake.selectedLabel}</div>
                                    <div className="workspace-prostudy-item-line">Correct: {mistake.correctLabel}</div>
                                    {mistake.explanation ? <div className="workspace-prostudy-item-line">Tip: {mistake.explanation}</div> : null}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </article>
              )}
            </div>
          </div>

          <div className="workspace-composer-wrap">
            {replyTarget && (
              <div className="workspace-reply-preview">
                <div>
                  <span>Replying to {replyTarget.title}</span>
                  <strong>{replyTarget.text}</strong>
                </div>
                <button className="workspace-mini-button workspace-mini-button--danger" onClick={() => setReplyTarget(null)}>
                  Cancel
                </button>
              </div>
            )}

            {attachedNote && (
              <div className="workspace-attached-note">
                <span>Attached note</span>
                <strong>{attachedNote.name}</strong>
              </div>
            )}

            <div className="workspace-composer">
              <div className="workspace-composer__actions">
                <button
                  className="workspace-icon-button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Upload note"
                  title="Upload note"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  className="workspace-icon-button workspace-icon-button--secondary"
                  onClick={handleGenerateQuizShortcut}
                  aria-label="Generate quiz"
                  title="Generate quiz"
                  disabled={isGeneratingQuiz}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 7H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9 17H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>

                <button
                  className="workspace-icon-button workspace-icon-button--secondary"
                  onClick={handleGenerateVideoShortcut}
                  aria-label="Generate video tutorial"
                  title="Generate video tutorial"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="6" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                    <path d="M16 10L21 7V17L16 14V10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <textarea
                rows={1}
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                placeholder={isGeneratingQuiz ? 'Generating quiz from attached note...' : 'Type a class update, a study prompt, or a quick instruction...'}
              />

              <button
                className="workspace-send-button workspace-send-button--icon"
                onClick={handleSendMessage}
                disabled={!draftMessage.trim()}
                aria-label="Send message"
                title="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}