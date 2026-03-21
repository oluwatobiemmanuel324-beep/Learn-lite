// Learn Lite Backend - Express Server
// Unified project structure: learn-lite/server/

// MUST BE FIRST: Load environment variables before anything else
require('dotenv').config();

console.log('Starting Learn Lite backend...');
const fs = require('fs');
const path = require('path');

if (!fs.existsSync('.env')) {
  console.warn('⚠️  Warning: .env file not found. Creating one with defaults...');
}

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const validator = require('validator');
const disposableEmailDomains = require('disposable-email-domains');
const { PrismaClient } = require('@prisma/client');
const { sendWelcomeEmail } = require('./utils/email');

// CONFIGURATION
// ========================================

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const PUBLIC_URL = 'https://disallowable-untamable-glen.ngrok-free.dev';
const HEYGEN_API_VERSION = process.env.HEYGEN_API_VERSION || 'v1';
const HEYGEN_BASE_URL = `https://api.heygen.com/${HEYGEN_API_VERSION}`;

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET must be provided in production via .env');
    process.exit(1);
  }
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  Using ephemeral JWT_SECRET for development. Set JWT_SECRET in .env for production.');
}

// Check Paystack configuration
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (NODE_ENV === 'production' && !PAYSTACK_PUBLIC_KEY) {
  console.warn('⚠️  PAYSTACK_PUBLIC_KEY not set in production. Payment functionality will be limited.');
}

// Check HeyGen configuration
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
if (!HEYGEN_API_KEY) {
  console.warn('⚠️  HEYGEN_API_KEY not set. Video generation will use sample videos.');
}

// Log Paystack key status (without revealing actual keys)
console.log(`🔐 Paystack Public Key: ${PAYSTACK_PUBLIC_KEY ? '✓ Configured' : '✗ Not configured'}`);
console.log(`🔐 Paystack Secret Key: ${PAYSTACK_SECRET_KEY ? '✓ Configured' : '✗ Not configured'}`);

const paystackKeysLoaded = Boolean(PAYSTACK_PUBLIC_KEY && PAYSTACK_SECRET_KEY);
if (paystackKeysLoaded) {
  console.log('🔐 Paystack Keys Loaded: YES.');
} else {
  console.log('🔐 Paystack Keys Loaded: NO.');
}

const app = express();

// ========================================
// CORS CONFIGURATION - MUST BE FIRST
// ========================================

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || FRONTEND_ORIGIN)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function corsOriginHandler(origin, callback) {
  if (!origin) return callback(null, true);
  if (NODE_ENV !== 'production') {
    return callback(null, true);
  }
  if (allowedOrigins.length === 0) return callback(new Error('CORS: no allowed origins configured'), false);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Not allowed by CORS'), false);
}

app.use(cors({
  origin: corsOriginHandler,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ========================================
// BODY PARSER
// ========================================

// Middleware to capture raw body for webhook signature verification
app.use(express.json({
  limit: '10mb',
  strict: false,
  verify: (req, res, buf, encoding) => {
    if (req.path === '/api/paystack/webhook') {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON body'
    });
  }
  return next(err);
});

// ========================================
// SECURITY MIDDLEWARE
// ========================================

app.disable('x-powered-by');
app.set('trust proxy', 1);

if (NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", process.env.FRONTEND_ORIGIN || 'https://your-frontend.example.com'],
        objectSrc: ["'none'"],
      }
    }
  }));
} else {
  app.use(helmet());
}

app.use(cookieParser());

// ========================================
// STATIC FILE SERVING - Videos
// ========================================

// Serve static files from the public/videos directory
const videosPath = path.join(__dirname, '..', 'public', 'videos');
if (!fs.existsSync(videosPath)) {
  fs.mkdirSync(videosPath, { recursive: true });
  console.log('📁 Created videos directory:', videosPath);
}

app.use('/videos', express.static(videosPath));
console.log('📹 Serving videos from:', videosPath);

// ========================================
// RATE LIMITING
// ========================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

// ========================================
// DATABASE SETUP
// ========================================

const prisma = new PrismaClient();

const SOCIAL_MEDIA_PLACEHOLDER_EMAIL = process.env.SOCIAL_MEDIA_CONTROLLER_EMAIL || 'socialmedia.controller@learnlite.app';

const MANAGED_ACCOUNT_ROLE_MAP = {
  'oluwatobiemmanuel324@gmail.com': 'SYSTEM_OWNER',
  'financialcontrollerlearnlite@gmail.com': 'FINANCE_CONTROLLER',
  'academicregistrarlearnlite@gmail.com': 'ACADEMIC_REGISTRAR',
  'operationmoderatorlearnlite@gmail.com': 'OPS_MODERATOR',
  'socialmediacontrollerlearnlite@gmail.com': 'SOCIAL_MEDIA_CONTROLLER',
  [SOCIAL_MEDIA_PLACEHOLDER_EMAIL.toLowerCase()]: 'SOCIAL_MEDIA_CONTROLLER'
};

const STAFF_ROLES = ['FINANCE_CONTROLLER', 'ACADEMIC_REGISTRAR', 'OPS_MODERATOR', 'SOCIAL_MEDIA_CONTROLLER', 'ROOT_ADMIN'];
const ALL_ADMIN_ROLES = ['SYSTEM_OWNER', 'ROOT_ADMIN', 'ADMIN', 'FINANCE_CONTROLLER', 'ACADEMIC_REGISTRAR', 'OPS_MODERATOR', 'SOCIAL_MEDIA_CONTROLLER'];

function getRedirectPathForRole(role) {
  const redirectByRole = {
    SYSTEM_OWNER: '/dashboard/system-owner',
    ROOT_ADMIN: '/dashboard/root-admin',
    ADMIN: '/dashboard/root-admin',
    FINANCE_CONTROLLER: '/dashboard/finance-controller',
    ACADEMIC_REGISTRAR: '/dashboard/academic-registrar',
    OPS_MODERATOR: '/dashboard/ops-moderator',
    SOCIAL_MEDIA_CONTROLLER: '/dashboard/social-media-controller'
  };

  return redirectByRole[role] || '/';
}

function requireRoles(allowedRoles) {
  return (req, res, next) => {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden: insufficient role privileges' });
    }

    return next();
  };
}

async function logStaffActivity({ actorId, actorRole, action, target = null, details = null }) {
  try {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { email: true }
    });

    await prisma.staffActivity.create({
      data: {
        actorId,
        actorRole,
        actorEmail: actor?.email || 'unknown',
        action,
        target,
        details
      }
    });
  } catch (err) {
    console.warn('Staff activity log failed:', err.message);
  }
}

function parseJsonSafely(value, fallback = null) {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractNumericScore(record) {
  if (!record || typeof record !== 'object') return null;
  const candidates = ['score', 'percentage', 'percent', 'finalScore', 'avgScore'];
  for (const key of candidates) {
    const raw = Number(record[key]);
    if (Number.isFinite(raw)) return raw;
  }
  return null;
}

function summarizeQuestionsFromBackup(rawQuizzes) {
  const parsed = parseJsonSafely(rawQuizzes, null);
  if (!parsed) return { scores: [], questionCount: 0 };

  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  const scores = [];
  let questionCount = 0;

  for (const node of nodes) {
    const score = extractNumericScore(node);
    if (Number.isFinite(score)) {
      scores.push(Math.max(0, Math.min(100, Math.round(score))));
    }

    if (Array.isArray(node?.questions)) {
      questionCount += node.questions.length;
    } else if (Array.isArray(node?.quiz?.questions)) {
      questionCount += node.quiz.questions.length;
    } else if (Array.isArray(node?.items)) {
      questionCount += node.items.length;
    }
  }

  return { scores, questionCount };
}

function calculateBusinessHealthScore({ revenueLast30Days, activeUsers, newQuestionsLast7Days }) {
  const revenueScore = Math.min(100, Math.round((Number(revenueLast30Days || 0) / 500000) * 100));
  const activeUsersScore = Math.min(100, Math.round((Number(activeUsers || 0) / 200) * 100));
  const newQuestionsScore = Math.min(100, Math.round((Number(newQuestionsLast7Days || 0) / 150) * 100));

  const score = Math.round((revenueScore * 0.4) + (activeUsersScore * 0.35) + (newQuestionsScore * 0.25));

  return {
    score,
    factors: {
      revenueScore,
      activeUsersScore,
      newQuestionsScore
    }
  };
}

// Graceful Prisma shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true, email: true }
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account deactivated. Contact SYSTEM_OWNER.',
        code: 'ACCOUNT_DISABLED'
      });
    }

    const expectedManagedRole = MANAGED_ACCOUNT_ROLE_MAP[String(user.email || '').toLowerCase()];
    if (expectedManagedRole && user.role !== expectedManagedRole) {
      return res.status(403).json({
        success: false,
        error: `Department access policy violation. Expected role ${expectedManagedRole} for ${user.email}.`,
        code: 'ROLE_POLICY_MISMATCH'
      });
    }

    decoded.role = user.role;
    decoded.email = user.email;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

// ========================================
// FUEL MIDDLEWARE
// ========================================

async function fuelMiddleware(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { fuelBalance: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.fuelBalance <= 0) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient fuel. Please buy fuel to continue.',
        fuelRequired: 1,
        fuelAvailable: user.fuelBalance
      });
    }

    // Store fuel in request for later use
    req.userFuel = user.fuelBalance;
    next();
  } catch (err) {
    console.error('Fuel middleware error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// ========================================
// CONTACT & SOCIAL MEDIA ENDPOINTS
// ========================================

// Public: Submit contact form message (no authentication required)
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, subject, and message are all required'
      });
    }

    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address'
      });
    }

    const trimmedMessage = String(message).trim();
    if (trimmedMessage.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Message must be at least 10 characters long'
      });
    }

    const contact = await prisma.contact.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        subject: String(subject).trim(),
        message: trimmedMessage,
        status: 'unread'
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you for contacting us. We will get back to you soon.',
      contact: {
        id: contact.id,
        timestamp: contact.timestamp
      }
    });
  } catch (err) {
    console.error('Contact submission error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// SOCIAL_MEDIA_CONTROLLER workplace: Get all contacts
app.get('/api/admin/socialmedia/workplace', authMiddleware, requireRoles(['SYSTEM_OWNER', 'SOCIAL_MEDIA_CONTROLLER']), async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      orderBy: { timestamp: 'desc' },
      take: 200,
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            responderEmail: true,
            replyBody: true,
            createdAt: true
          }
        }
      }
    });

    const unreadCount = contacts.filter(c => c.status === 'unread').length;
    const respondedCount = contacts.filter(c => c.status === 'responded').length;

    return res.json({
      success: true,
      workplace: {
        contacts,
        stats: {
          total: contacts.length,
          unread: unreadCount,
          responded: respondedCount
        }
      }
    });
  } catch (err) {
    console.error('Social media workplace error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// SOCIAL_MEDIA_CONTROLLER: automated marketing feed
app.get('/api/admin/socialmedia/marketing-feed', authMiddleware, requireRoles(['SYSTEM_OWNER', 'SOCIAL_MEDIA_CONTROLLER']), async (req, res) => {
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const [weeklyBackups, newGroups, newClassSections] = await Promise.all([
      prisma.backup.findMany({
        where: { timestamp: { gte: weekStart }, quizzes: { not: null } },
        select: {
          id: true,
          userId: true,
          timestamp: true,
          quizzes: true,
          user: { select: { id: true, username: true, email: true } }
        },
        orderBy: { timestamp: 'desc' },
        take: 300
      }),
      prisma.group.findMany({
        where: { createdAt: { gte: weekStart } },
        select: { id: true, name: true, joinCode: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 8
      }),
      prisma.classSection.findMany({
        where: { createdAt: { gte: weekStart } },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 8
      })
    ]);

    const leaderboardMap = new Map();
    weeklyBackups.forEach((backup) => {
      const key = backup.userId || backup.user?.id;
      if (!key) return;

      const scoreBucket = summarizeQuestionsFromBackup(backup.quizzes);
      const existing = leaderboardMap.get(key) || {
        userId: key,
        username: backup.user?.username || `user-${key}`,
        email: backup.user?.email || 'unknown@learnlite.app',
        scores: [],
        attempts: 0
      };

      existing.scores.push(...scoreBucket.scores);
      existing.attempts += 1;
      leaderboardMap.set(key, existing);
    });

    const topWeeklyScores = Array.from(leaderboardMap.values())
      .map((item) => {
        const avg = item.scores.length
          ? item.scores.reduce((a, b) => a + b, 0) / item.scores.length
          : 0;
        return {
          userId: item.userId,
          username: item.username,
          email: item.email,
          averageScore: Math.round(avg),
          attempts: item.attempts
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore || b.attempts - a.attempts)
      .slice(0, 5)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    const newCourseLaunches = [
      ...newGroups.map((group) => ({
        kind: 'GROUP',
        id: group.id,
        title: group.name,
        subtitle: `Join Code: ${group.joinCode}`,
        launchedAt: group.createdAt
      })),
      ...newClassSections.map((section) => ({
        kind: 'CLASS_SECTION',
        id: section.id,
        title: section.name,
        subtitle: 'New Class Section',
        launchedAt: section.createdAt
      }))
    ]
      .sort((a, b) => new Date(b.launchedAt) - new Date(a.launchedAt))
      .slice(0, 8);

    const socialCards = [
      ...topWeeklyScores.map((score) => ({
        type: 'TOP_SCORE',
        headline: `Top ${score.rank}: ${score.username}`,
        body: `Weekly average ${score.averageScore}% across ${score.attempts} attempt(s)`,
        meta: `#TopScorer #LearnLite`
      })),
      ...newCourseLaunches.map((course) => ({
        type: 'COURSE_LAUNCH',
        headline: `New Launch: ${course.title}`,
        body: course.subtitle,
        meta: `Launched ${new Date(course.launchedAt).toLocaleDateString()}`
      }))
    ];

    return res.json({
      success: true,
      feed: {
        topWeeklyScores,
        newCourseLaunches,
        socialCards
      }
    });
  } catch (err) {
    console.error('Marketing feed error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Mark contact as read
app.patch('/api/admin/contact/:id/read', authMiddleware, requireRoles(['SYSTEM_OWNER', 'SOCIAL_MEDIA_CONTROLLER']), async (req, res) => {
  try {
    const contactId = Number(req.params.id);

    if (!Number.isFinite(contactId)) {
      return res.status(400).json({ success: false, error: 'Invalid contact id' });
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId }
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { status: contact.status === 'unread' ? 'read' : contact.status }
    });

    return res.json({ success: true, contact: updated });
  } catch (err) {
    console.error('Mark contact read error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Reply to contact message
app.post('/api/admin/contact/:id/reply', authMiddleware, requireRoles(['SYSTEM_OWNER', 'SOCIAL_MEDIA_CONTROLLER']), async (req, res) => {
  try {
    const contactId = Number(req.params.id);
    const { replyBody } = req.body;

    if (!Number.isFinite(contactId)) {
      return res.status(400).json({ success: false, error: 'Invalid contact id' });
    }

    if (!replyBody || String(replyBody).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Reply body is required' });
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, email: true }
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true }
    });

    const reply = await prisma.contactReply.create({
      data: {
        contactId,
        responderId: req.user.userId,
        responderEmail: user.email,
        replyBody: String(replyBody).trim()
      }
    });

    await prisma.contact.update({
      where: { id: contactId },
      data: { status: 'responded' }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'REPLY_CONTACT',
      target: contact.email,
      details: 'Replied to contact message'
    });

    return res.status(201).json({
      success: true,
      message: 'Reply sent successfully',
      reply
    });
  } catch (err) {
    console.error('Reply to contact error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ========================================
// HEALTH CHECK
// ========================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Learn Lite backend is running',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// ========================================
// AUTH ENDPOINTS (Frontend: http://localhost:5173)
// ========================================

async function generateUniqueIdNumber() {
  const maxAttempts = 30;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = crypto.randomInt(100000, 1000000);
    const existing = await prisma.user.findUnique({
      where: { idNumber: candidate },
      select: { id: true }
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique 6-digit idNumber');
}

async function callHeyGenGenerateWithRetry(requestPayload, maxRetries = 3) {
  const requestTimeoutMs = 30000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.post(`${HEYGEN_BASE_URL}/video_agent/generate`, requestPayload, {
        headers: {
          'X-API-KEY': HEYGEN_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: requestTimeoutMs,
        family: 4
      });
    } catch (err) {
      const status = err.response?.status;
      const retriable =
        status === 503 ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'ECONNREFUSED';

      if (!retriable || attempt === maxRetries) {
        throw err;
      }

      const delayMs = 2000 * Math.pow(2, attempt);
      console.warn(`[HeyGen Retry] Attempt ${attempt + 1} failed (${status || err.code}). Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('HeyGen retry loop exited unexpectedly');
}

// Signup: POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and password are required'
      });
    }

    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address'
      });
    }

    const emailDomain = normalizedEmail.split('@')[1];
    if (!emailDomain || disposableEmailDomains.includes(emailDomain)) {
      return res.status(400).json({
        success: false,
        error: 'Disposable email addresses are not allowed'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: normalizedEmail }] }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Username or email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const idNumber = await generateUniqueIdNumber();
    const user = await prisma.user.create({
      data: { username, email: normalizedEmail, password: hashedPassword, idNumber }
    });

    try {
      await sendWelcomeEmail({
        email: user.email,
        username: user.username,
        idNumber: user.idNumber
      });
      console.log(`📧 Welcome email sent to ${user.email}`);
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr.message);
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        idNumber: user.idNumber,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Login: POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'This account has been deactivated by SYSTEM_OWNER.',
        code: 'ACCOUNT_DISABLED'
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Enforce managed account roles by official email mapping.
    const expectedManagedRole = MANAGED_ACCOUNT_ROLE_MAP[normalizedEmail];
    if (expectedManagedRole && user.role !== expectedManagedRole) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: expectedManagedRole }
      });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        idNumber: user.idNumber,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      },
      redirectPath: getRedirectPathForRole(user.role)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Verify: POST /api/auth/verify
app.post('/api/auth/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token is empty',
        code: 'EMPTY_TOKEN'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError.message);
      return res.status(401).json({ 
        success: false, 
        error: 'Token verification failed. Please log in again.',
        code: 'INVALID_TOKEN',
        details: jwtError.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid signature'
      });
    }

    if (!decoded.userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token missing userId',
        code: 'INVALID_TOKEN_PAYLOAD'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, idNumber: true, username: true, email: true, fuelBalance: true, role: true, isActive: true }
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found in database. Please sign up again.',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account deactivated. Contact SYSTEM_OWNER.',
        code: 'ACCOUNT_DISABLED'
      });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(401).json({ 
      success: false, 
      error: 'Token verification failed',
      code: 'SERVER_ERROR',
      details: err.message
    });
  }
});

// ========================================
// FUEL & VIDEO ENDPOINTS (Protected)
// ========================================

// Get user fuel balance: GET /api/user/fuel
app.get('/api/user/fuel', authMiddleware, async (req, res) => {
  try {
    // Disable caching for fuel balance to prevent 304 Not Modified responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: missing userId' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { fuelBalance: true, username: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      fuelBalance: user.fuelBalance,
      fuel: user.fuelBalance,
      username: user.username
    });
  } catch (err) {
    console.error('Get fuel error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Generate video: POST /api/videos/generate
app.post('/api/videos/generate', authMiddleware, fuelMiddleware, async (req, res) => {
  try {
    const { prompt, language } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Log the generation request with language
    const selectedLanguage = language || 'English';
    console.log(`[Video Generation] User ${req.user.userId} generating video for "${prompt.trim()}" in ${selectedLanguage}`);

    if (req.userFuel == null || req.userFuel <= 0) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient Fuel'
      });
    }

    // If HeyGen API key is not configured, use sample video
    if (!HEYGEN_API_KEY) {
      console.warn('[Video Generation] HEYGEN_API_KEY not configured, using sample video');
      
      // Deduct 1 fuel
      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: { fuelBalance: { decrement: 1 } },
        select: { fuelBalance: true }
      });

      const videoUrl = `http://localhost:${PORT}/videos/sample-video.mp4`;
      console.log(`🎬 Sample video served for user ${req.user.userId}`);

      return res.json({
        success: true,
        message: 'Video generated successfully (sample)',
        videoUrl: videoUrl,
        fuelRemaining: user.fuelBalance,
        prompt: prompt.substring(0, 100)
      });
    }

    // HeyGen API integration
    try {
      const dns = require('dns');
      dns.lookup('api.heygen.com', (err, address, family) => {
        if (err) {
          console.log('[HeyGen DNS Lookup Error]:', err.code, err.message);
          return;
        }
        console.log(`[HeyGen DNS Lookup]: ${address} (IPv${family})`);
      });

      // Prepare the prompt with language instruction
      const enhancedPrompt = `${prompt.trim()} Please present this in ${selectedLanguage} language.`;

      console.log(`[HeyGen API] Initiating video generation for user ${req.user.userId}`);

      // Step 1: Call HeyGen API to generate video with retry logic
      const requestPayload = {
        prompt: enhancedPrompt,
        callback_url: `${PUBLIC_URL}/api/webhooks/heygen`
      };
      const heygenResponse = await callHeyGenGenerateWithRetry(requestPayload);

      console.log('[HeyGen RAW]:', JSON.stringify(heygenResponse.data, null, 2));

      // Check if HeyGen returned an error
      if (heygenResponse.data?.error) {
        console.log('[HeyGen API Error]:', heygenResponse.data.error);
        if (heygenResponse.data.error.toLowerCase().includes('insufficient credits')) {
          return res.status(402).json({
            success: false,
            error: 'Out of HeyGen Credits'
          });
        }
        return res.status(400).json({
          success: false,
          error: heygenResponse.data.error
        });
      }

      // Try both V1 and V2 API response structures
      const videoId = heygenResponse.data?.data?.video_id || heygenResponse.data?.video_id;

      if (!videoId) {
        const responseText = JSON.stringify(heygenResponse.data || {});
        console.log('[HeyGen Missing video_id] Full Response:', responseText);
        return res.status(400).json({
          success: false,
          error: 'HeyGen did not return a video ID. Check server logs for details.'
        });
      }

      console.log(`[HeyGen API] Received video_id: ${videoId}`);

      // Step 2: Deduct fuel only after successful API request
      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: { fuelBalance: { decrement: 1 } },
        select: { fuelBalance: true }
      });

      console.log(`⛽ Fuel deducted for user ${req.user.userId}. Remaining: ${user.fuelBalance}`);

      // Step 3: Polling function to check video status
      const pollForCompletion = async (vid, maxAttempts = 30, delayMs = 2000) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const statusResponse = await axios.get(
              `${HEYGEN_BASE_URL}/video_agent/get_video?video_id=${vid}`,
              {
                headers: {
                  'X-API-KEY': HEYGEN_API_KEY
                },
                timeout: 30000,
                family: 4
              }
            );

            const status = statusResponse.data?.status;
            const videoUrl = statusResponse.data?.video_url;

            console.log(`[HeyGen Poll] Attempt ${attempt + 1}/${maxAttempts}: Status = ${status}`);

            if (status === 'completed' && videoUrl) {
              console.log(`✅ Video completed for user ${req.user.userId}: ${videoUrl}`);
              return { success: true, videoUrl, status };
            }

            if (status === 'failed') {
              console.error(`❌ Video generation failed for video_id ${vid}`);
              return { success: false, error: 'Video generation failed', status };
            }

            // Not yet complete, wait and retry
            if (attempt < maxAttempts - 1) {
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          } catch (pollErr) {
            console.error(`[HeyGen Poll] Error on attempt ${attempt + 1}:`, pollErr.message);
            if (attempt === maxAttempts - 1) {
              throw pollErr;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        return { success: false, error: 'Polling timeout - video generation took too long', status: 'processing' };
      };

      // Execute polling with timeout
      const pollResult = await Promise.race([
        pollForCompletion(videoId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Polling timeout after 60 seconds')), 60000)
        )
      ]);

      if (!pollResult.success) {
        return res.json({
          success: false,
          message: pollResult.error || 'Video generation in progress',
          videoId: videoId,
          status: pollResult.status,
          fuelRemaining: user.fuelBalance
        });
      }

      res.json({
        success: true,
        message: 'Video generated successfully',
        videoUrl: pollResult.videoUrl,
        videoId: videoId,
        fuelRemaining: user.fuelBalance,
        prompt: prompt.substring(0, 100)
      });

    } catch (heygenErr) {
      console.log('[HeyGen Debug]', heygenErr.response?.data || heygenErr.message);
      console.log('[HeyGen Error Details]', heygenErr.code, heygenErr.syscall);

      if (heygenErr.code === 'ENOTFOUND' || heygenErr.code === 'ETIMEDOUT') {
        return res.status(503).json({
          success: false,
          error: 'Network connection to HeyGen failed. Check your internet or firewall.'
        });
      }

      // Note: Fuel is already deducted if we reached this point and got a video_id
      // Only for request errors before getting video_id, we might want to refund
      if (heygenErr.response?.status === 401 || heygenErr.response?.status === 403) {
        return res.status(401).json({
          success: false,
          error: 'API Key issue'
        });
      }

      if (heygenErr.response?.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Out of Credits or Throttled'
        });
      }

      const errorText = JSON.stringify(heygenErr.response?.data || '').toLowerCase();
      if (errorText.includes('insufficient credits')) {
        return res.status(402).json({
          success: false,
          error: 'Out of HeyGen Credits'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'HeyGen API error. Check server logs for details.'
      });
    }
  } catch (err) {
    console.error('[Video Generation] Error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during video generation',
      details: NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ========================================
// PAYSTACK PAYMENT ENDPOINTS
// ========================================

// Verify payment from Paystack: GET /api/payments/verify/:reference
app.get('/api/payments/verify/:reference', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: missing userId' });
    }

    // Disable caching for payment verification to prevent 304 Not Modified responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Payment reference is required'
      });
    }

    // Check if this payment has already been processed (idempotency)
    const existingPayment = await prisma.payment.findUnique({
      where: { reference }
    });

    if (existingPayment) {
      console.log('⚠️ Payment already processed:', reference);
      
      // Return the existing payment info
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { fuelBalance: true, username: true, email: true }
      });

      return res.json({
        success: true,
        message: 'Payment already verified (no duplicate fuel added)',
        fuelBalance: user.fuelBalance,
        fuel: user.fuelBalance,
        fuelAdded: existingPayment.fuelAdded,
        reference,
        alreadyProcessed: true,
        user: {
          username: user.username,
          email: user.email
        }
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Payment service not configured'
      });
    }

    const rawSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (/\[|\]/.test(rawSecretKey)) {
      return res.status(400).json({
        success: false,
        error: 'PAYSTACK_SECRET_KEY contains invalid brackets []. Remove brackets from the key.'
      });
    }

    const cleanSecretKey = rawSecretKey.replace(/[\[\]]/g, '');
    console.log('🔍 Verifying payment with Paystack:', reference);
    
    const verifyResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: 'Bearer ' + cleanSecretKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!verifyResponse.data || !verifyResponse.data.status) {
      return res.status(502).json({
        success: false,
        error: 'Failed to verify Paystack payment'
      });
    }

    const paystackData = verifyResponse.data.data;
    if (!paystackData || paystackData.status !== 'success') {
      // Record failed payment
      await prisma.payment.create({
        data: {
          reference,
          userId: req.user.userId,
          amount: paystackData?.amount || 0,
          fuelAdded: 0,
          status: 'failed',
          paystackData: JSON.stringify(paystackData)
        }
      });

      return res.status(400).json({
        success: false,
        error: 'Payment not successful',
        paystackStatus: paystackData?.status
      });
    }

    // Extract User ID: Ensure you are getting the userId from the payment metadata or the active session
    let metadataUserId = null;
    if (paystackData?.metadata) {
      if (typeof paystackData.metadata === 'string') {
        try {
          const parsedMetadata = JSON.parse(paystackData.metadata);
          metadataUserId = Number(parsedMetadata?.userId);
        } catch (parseError) {
          console.error('Failed to parse Paystack metadata JSON:', parseError);
        }
      } else {
        metadataUserId = Number(paystackData.metadata.userId);
      }
    }

    const userIdFromMeta = Number.isFinite(metadataUserId) ? metadataUserId : null;
    const userId = Number.isFinite(userIdFromMeta) ? userIdFromMeta : req.user?.userId;
    
    console.log('🔍 User ID Extraction:');
    console.log('  - From Metadata:', userIdFromMeta);
    console.log('  - From Session (req.user.userId):', req.user?.userId);
    console.log('  - Final User ID:', userId);

    if (!userId || !Number.isFinite(userId)) {
      console.error('❌ ERROR: Could not extract valid userId from payment metadata or session');
      return res.status(400).json({
        success: false,
        error: 'Could not identify user for fuel credit'
      });
    }

    // Atomic Update: Use atomic increment to add fuel safely
    let updatedUser;
    try {
      console.log(`⏳ Attempting to update user ${userId} fuel balance...`);
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { fuelBalance: { increment: 50 } },
        select: { fuelBalance: true, username: true, email: true }
      });
      console.log('DATABASE UPDATED: 50 fuel added to user', userId);
      console.log('✅ New fuel balance:', updatedUser.fuelBalance);
    } catch (updateError) {
      console.error('❌ DATABASE UPDATE FAILED for user', userId);
      console.error('Error details:', updateError.message);
      console.error('Error code:', updateError.code);
      return res.status(500).json({
        success: false,
        error: 'Failed to update fuel balance in database',
        details: updateError.message
      });
    }
    console.log('FUEL UPDATE COMPLETE FOR USER:', userId, 'New fuel balance:', updatedUser.fuelBalance);

    // Store payment record to prevent duplicate processing
    await prisma.payment.create({
      data: {
        reference,
        userId,
        amount: paystackData.amount || 0,
        fuelAdded: 50,
        status: 'success',
        paystackData: JSON.stringify(paystackData)
      }
    });

    console.log(`✅ Payment verified! User ${updatedUser.username} gained 50 fuel`);

    res.json({
      success: true,
      message: 'Payment verified and fuel added',
      fuelBalance: updatedUser.fuelBalance,
      fuel: updatedUser.fuelBalance,
      newBalance: updatedUser.fuelBalance,
      fuelAdded: 50,
      reference,
      user: {
        username: updatedUser.username,
        email: updatedUser.email
      }
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    console.log('Paystack API response error:', err.response?.data);
    res.status(500).json({ success: false, error: 'Server error', details: err.message });
  }
});

// Verify payment from Paystack: POST /api/payments/verify
app.post('/api/payments/verify', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: missing userId' });
    }

    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Payment reference is required'
      });
    }

    // TODO: Verify payment with Paystack API
    // For demo purposes, we'll assume verification is successful
    // In production, call: https://api.paystack.co/transaction/verify/:reference
    
    const PAYSTACK_FUEL_AMOUNT = 100; // 100 fuel units per purchase

    // Update user fuel balance
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { fuelBalance: { increment: PAYSTACK_FUEL_AMOUNT } },
      select: { fuelBalance: true, username: true, email: true }
    });

    res.json({
      success: true,
      message: 'Payment verified and fuel added',
      fuelBalance: user.fuelBalance,
      fuel: user.fuelBalance,
      fuelAdded: PAYSTACK_FUEL_AMOUNT,
      user: {
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get Paystack payment link: POST /api/payments/initialize
app.post('/api/payments/initialize', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: missing userId' });
    }

    const requestBody = req.body && typeof req.body === 'object' ? req.body : {};
    const requestUserId = Number(requestBody.userId);

    if (requestBody.userId != null && !Number.isFinite(requestUserId)) {
      return res.status(400).json({ success: false, error: 'Invalid userId in request body' });
    }

    // Key Verification: Check if secret key is available at request time
    if (!process.env.PAYSTACK_SECRET_KEY) {
      throw new Error('Secret key is undefined at the moment of request');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true, username: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Data Validation: Ensure user has a valid email
    if (!user.email || !user.email.trim()) {
      return res.status(400).json({ success: false, error: 'User email is required' });
    }

    if (!process.env.PAYSTACK_PUBLIC_KEY || !process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Payment service not configured'
      });
    }

    const rawSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!rawSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'PAYSTACK_SECRET_KEY is undefined in the environment'
      });
    }

    if (/\[|\]/.test(rawSecretKey)) {
      return res.status(400).json({
        success: false,
        error: 'PAYSTACK_SECRET_KEY contains invalid brackets []. Remove brackets from the key.'
      });
    }

    if (rawSecretKey.toLowerCase().includes('dummy')) {
      return res.status(400).json({
        success: false,
        error: 'PAYSTACK_SECRET_KEY looks like a dummy key. Please set your real Paystack secret key.'
      });
    }

    // Calculate amount: 500 NGN = 50000 kobo (multiply by 100)
    const FUEL_PRICE_NGN = 500;
    const FUEL_PRICE = FUEL_PRICE_NGN * 100; // Convert to kobo
    const PAYSTACK_FUEL_AMOUNT = 100;
    const resolvedUserId = Number.isFinite(requestUserId) ? requestUserId : req.user.userId;
    const reference = `ref_${resolvedUserId}_${Date.now()}`;

    if (!Number.isFinite(resolvedUserId)) {
      return res.status(400).json({ success: false, error: 'Could not determine userId for payment' });
    }

    // Header Check: Verify Authorization header format is correct
    // Strip any accidental brackets from the key
    const cleanSecretKey = rawSecretKey.replace(/[\[\]]/g, '');

    console.log('DEBUG: Sending request with Key starting with:', rawSecretKey?.substring(0, 7));
    
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email,
        amount: FUEL_PRICE,
        currency: 'NGN',
        reference,
        metadata: JSON.stringify({ userId: resolvedUserId })
      },
      {
        headers: {
          Authorization: 'Bearer ' + cleanSecretKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!paystackResponse.data || !paystackResponse.data.status) {
      return res.status(502).json({
        success: false,
        error: 'Failed to initialize Paystack payment'
      });
    }

    res.json({
      success: true,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: FUEL_PRICE, // in kobo
      currency: 'NGN',
      fuelAmount: PAYSTACK_FUEL_AMOUNT,
      reference,
      description: `Buy ${PAYSTACK_FUEL_AMOUNT} Fuel for Learn Lite`,
      authorizationUrl: paystackResponse.data.data?.authorization_url
    });
  } catch (error) {
    // Raw Response Logging: Log Paystack API error details
    console.error('FULL ERROR:', error);
    console.log('Paystack API response error:', error.response?.data);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// ========================================
// GROUP MANAGEMENT ENDPOINTS (Protected)
// ========================================

function getRequesterUserId(req) {
  return Number(req.user?.id ?? req.user?.userId);
}

/**
 * Generates a random 6-character alphanumeric code (A-Z, 0-9)
 * Example: AB12CD, MATH24, XYZ789
 * @returns {string} 6-character uppercase alphanumeric code
 */
function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

/**
 * Generates a unique join code by checking against database
 * Retries up to 20 times to handle collision edge cases
 * @returns {Promise<string>} Unique 6-character join code
 * @throws {Error} If unable to generate unique code after 20 attempts
 */
async function generateUniqueJoinCode() {
  for (let i = 0; i < 20; i++) {
    const candidate = generateJoinCode();
    const existing = await prisma.group.findUnique({ where: { joinCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Unable to generate unique join code');
}

async function getGroupAndMembership(groupId, userId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      joinCode: true,
      createdById: true,
      members: {
        where: { userId },
        select: { role: true, customBackground: true }
      }
    }
  });

  if (!group) return { group: null, membership: null };
  const membership = group.members[0] || null;
  return { group, membership };
}

// ========================================
// CREATE GROUP - Generate unique 6-digit code
// ========================================
/**
 * POST /api/groups/create
 * Creates a new group with a unique alphanumeric join code
 * 
 * Request body:
 * {
 *   "name": "String - Group name (required)",
 *   "description": "String - Optional group description"
 * }
 * 
 * Response (Success):
 * {
 *   "success": true,
 *   "group": {
 *     "id": 1,
 *     "name": "Class Name",
 *     "joinCode": "MATH24",
 *     "createdById": 5
 *   }
 * }
 */
app.post('/api/groups/create', authMiddleware, async (req, res) => {
  try {
    const createdById = getRequesterUserId(req);
    const { name } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (!Number.isFinite(createdById)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!trimmedName) {
      return res.status(400).json({ success: false, error: 'Group name is required' });
    }

    if (trimmedName.length > 100) {
      return res.status(400).json({ success: false, error: 'Group name must be 100 characters or less' });
    }

    const requester = await prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true }
    });

    if (!requester) {
      return res.status(401).json({ success: false, error: 'Session is no longer valid. Please log in again.' });
    }

    // Generate unique join code (6 alphanumeric)
    const joinCode = await generateUniqueJoinCode();

    // Create group and add creator as ADMIN member
    const group = await prisma.group.create({
      data: {
        name: trimmedName,
        joinCode,
        createdById,
        members: {
          create: {
            userId: createdById,
            role: 'ADMIN'
          }
        }
      },
      select: {
        id: true,
        name: true,
        joinCode: true,
        createdById: true,
        createdAt: true
      }
    });

    return res.status(201).json({ success: true, group });
  } catch (err) {
    console.error('❌ Error creating group:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to create group',
      ...(NODE_ENV !== 'production' ? {
        detail: err?.message,
        code: err?.code || null
      } : {})
    });
  }
});

// ========================================
// JOIN GROUP - Using 6-digit code
// ========================================
/**
 * POST /api/groups/join
 * Joins an existing group using its 6-digit alphanumeric code
 * 
 * Request body:
 * {
 *   "code": "String - 6-character join code (e.g., MATH24)",
 *   "customBackground": "String (optional) - Custom workspace background"
 * }
 * 
 * Response (Success):
 * {
 *   "success": true,
 *   "group": {
 *     "id": 1,
 *     "name": "Class Name",
 *     "joinCode": "MATH24",
 *     "createdById": 5
 *   }
 * }
 * 
 * Response (Errors):
 * - "Join code not found" - Code doesn't exist
 * - "Already a member" - User already in this group
 * - "Unauthorized" - No valid JWT token
 */
app.post('/api/groups/join', authMiddleware, async (req, res) => {
  try {
    const userId = getRequesterUserId(req);
    const { code, customBackground } = req.body;

    if (!Number.isFinite(userId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!requester) {
      return res.status(401).json({ success: false, error: 'Session is no longer valid. Please log in again.' });
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Join code is required' });
    }

    // Normalize code to uppercase for lookup
    const normalizedCode = code.trim().toUpperCase();
    
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      return res.status(400).json({ success: false, error: 'Join code must be 6 alphanumeric characters' });
    }

    // Find group by code
    const group = await prisma.group.findUnique({
      where: { joinCode: normalizedCode },
      select: {
        id: true,
        name: true,
        joinCode: true,
        createdById: true,
        members: {
          where: { userId },
          select: { role: true }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ success: false, error: 'Join code not found' });
    }

    // Check if user already a member
    if (group.members.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'You are already a member of this group',
        group: {
          id: group.id,
          name: group.name,
          joinCode: group.joinCode
        }
      });
    }

    // Add user as MEMBER
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId,
        role: 'MEMBER',
        customBackground: customBackground || null
      }
    });

    return res.status(201).json({ success: true, group });
  } catch (err) {
    console.error('❌ Error joining group:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to join group',
      ...(NODE_ENV !== 'production' ? {
        detail: err?.message,
        code: err?.code || null
      } : {})
    });
  }
});

// Group details for workspace page
app.get('/api/groups/:id', authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const requesterId = getRequesterUserId(req);

    if (!Number.isFinite(groupId)) {
      return res.status(400).json({ success: false, error: 'Invalid group id' });
    }

    if (!Number.isFinite(requesterId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        joinCode: true,
        createdById: true,
        members: {
          select: {
            role: true,
            customBackground: true,
            joinedAt: true,
            user: {
              select: { id: true, username: true, email: true }
            }
          },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }]
        }
      }
    });

    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const currentMembership = group.members.find(m => m.user.id === requesterId);
    if (!currentMembership) {
      return res.status(403).json({ success: false, error: 'You are not a member of this group' });
    }

    return res.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        joinCode: group.joinCode,
        createdById: group.createdById,
        members: group.members,
        currentUserRole: currentMembership.role,
        currentUserBackground: currentMembership.customBackground || null
      }
    });
  } catch (err) {
    console.error('Get group error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Personalize space for current member
app.put('/api/groups/:id/background', authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const requesterId = getRequesterUserId(req);
    const customBackground = req.body?.customBackground || null;

    if (!Number.isFinite(groupId)) {
      return res.status(400).json({ success: false, error: 'Invalid group id' });
    }

    if (!Number.isFinite(requesterId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const updated = await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: requesterId } },
      data: { customBackground },
      select: { groupId: true, userId: true, role: true, customBackground: true }
    });

    return res.json({ success: true, membership: updated });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(403).json({ success: false, error: 'You are not a member of this group' });
    }
    console.error('Update group background error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Admin only: regenerate/change 6-digit join code
app.put('/api/groups/:id/code', authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const requesterId = getRequesterUserId(req);
    const requestedJoinCode = req.body?.joinCode ? String(req.body.joinCode).trim() : null;

    if (!Number.isFinite(groupId)) {
      return res.status(400).json({ success: false, error: 'Invalid group id' });
    }

    if (!Number.isFinite(requesterId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { group, membership } = await getGroupAndMembership(groupId, requesterId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin role required for this group' });
    }

    let nextCode = requestedJoinCode;
    if (nextCode && !/^\d{6}$/.test(nextCode)) {
      return res.status(400).json({ success: false, error: 'joinCode must be exactly 6 digits' });
    }

    if (!nextCode) {
      nextCode = await generateUniqueJoinCode();
    }

    const conflict = await prisma.group.findUnique({ where: { joinCode: nextCode } });
    if (conflict && conflict.id !== groupId) {
      return res.status(409).json({ success: false, error: 'joinCode already in use' });
    }

    const updated = await prisma.group.update({
      where: { id: groupId },
      data: { joinCode: nextCode },
      select: { id: true, joinCode: true, updatedAt: true }
    });

    return res.json({ success: true, group: updated });
  } catch (err) {
    console.error('Update group code error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Admin only: remove member from group
app.delete('/api/groups/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const requesterId = getRequesterUserId(req);

    if (!Number.isFinite(groupId) || !Number.isFinite(targetUserId)) {
      return res.status(400).json({ success: false, error: 'Invalid group id or user id' });
    }

    if (!Number.isFinite(requesterId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { group, membership } = await getGroupAndMembership(groupId, requesterId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Admin role required for this group' });
    }

    if (targetUserId === group.createdById) {
      return res.status(400).json({ success: false, error: 'Cannot remove group creator' });
    }

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId: targetUserId } }
    });

    return res.json({ success: true, removedUserId: targetUserId, groupId });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Member not found in this group' });
    }
    console.error('Remove group member error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Creator only: promote member to admin
app.patch('/api/groups/:id/role', authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const requesterId = getRequesterUserId(req);
    const targetUserId = Number(req.body?.userId);
    const role = String(req.body?.role || '').toUpperCase();

    if (!Number.isFinite(groupId) || !Number.isFinite(targetUserId)) {
      return res.status(400).json({ success: false, error: 'Invalid group id or user id' });
    }

    if (role !== 'ADMIN') {
      return res.status(400).json({ success: false, error: 'Only promotion to ADMIN is supported by this endpoint' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, createdById: true }
    });

    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    if (requesterId !== group.createdById) {
      return res.status(403).json({ success: false, error: 'Only group creator can promote members' });
    }

    const updated = await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      data: { role: 'ADMIN' },
      select: {
        groupId: true,
        userId: true,
        role: true,
        user: { select: { username: true, email: true } }
      }
    });

    return res.json({ success: true, member: updated });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Member not found in this group' });
    }
    console.error('Promote group member error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ========================================
// AI ASSISTANT ENDPOINTS (Protected)
// ========================================

// AI Chat endpoint: POST /api/ai/chat
// Responds to messages mentioning @learnlite
app.post('/api/ai/chat', authMiddleware, async (req, res) => {
  try {
    const { groupId, message } = req.body;

    if (!message || !groupId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message and groupId are required' 
      });
    }

    // Check if user is part of the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: Number(groupId),
          userId: req.user.userId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ 
        success: false, 
        error: 'You are not a member of this group' 
      });
    }

    // Check if message mentions @learnlite
    if (!/@learnlite/i.test(message)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message must mention @learnlite to get a response' 
      });
    }

    // ========================================
    // PLACEHOLDER: Mock AI Response
    // TODO: Replace with actual Gemini API call
    // ========================================
    
    const aiResponse = "Hey there! I'm @learnlite, your study companion. How can I help you learn today? Ask me anything about your classwork, and I'll do my best to help! 📚";

    res.json({
      success: true,
      message: aiResponse,
      isAIMock: true,
      note: 'This is a mock response. Real Gemini API integration coming soon.'
    });

  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ========================================
// PROFILE ENDPOINTS (Protected)
// ========================================

app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, idNumber: true, username: true, email: true, fuelBalance: true, createdAt: true }
    });


    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const updates = {};
    if (req.body.email) updates.email = req.body.email;
    if (req.body.username) updates.username = req.body.username;
    if (req.body.password) updates.password = await bcrypt.hash(req.body.password, 10);

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: updates,
      select: { id: true, username: true, email: true, createdAt: true }
    });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ========================================
// ADMIN ENDPOINTS (Protected)
// ========================================

// Admin middleware to check if user is admin (email = your-email@example.com)
function adminMiddleware(req, res, next) {
  if (!req.user?.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!ALL_ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Admin access required' });
  }

  next();
}

function systemOwnerMiddleware(req, res, next) {
  if (!req.user?.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.user.role !== 'SYSTEM_OWNER') {
    return res.status(403).json({ success: false, error: 'Forbidden: SYSTEM_OWNER access required' });
  }

  next();
}

// Get all users: GET /api/admin/users
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { 
        id: true, 
        username: true, 
        email: true, 
        fuelBalance: true, 
        createdAt: true,
        role: true,
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Group creation activity: GET /api/admin/group-activity
app.get('/api/admin/group-activity', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const activity = await prisma.group.findMany({
      select: {
        id: true,
        name: true,
        joinCode: true,
        createdAt: true,
        creator: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    return res.json({ success: true, count: activity.length, activity });
  } catch (err) {
    console.error('Get group activity error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// SYSTEM_OWNER performance overview: combines finance, academic and staff activity
app.get('/api/admin/owner/overview', authMiddleware, requireRoles(['SYSTEM_OWNER']), async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 13);

    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: start } },
      select: { amount: true, createdAt: true, status: true }
    });

    const groups = await prisma.group.findMany({
      where: { createdAt: { gte: start } },
      select: { id: true, createdAt: true }
    });

    const backupQuizzes = await prisma.backup.findMany({
      where: {
        timestamp: { gte: start },
        quizzes: { not: null }
      },
      select: { id: true, timestamp: true, quizzes: true }
    });

    const [activeUsers, paymentsLast30Days, backupQuizzesLast7Days] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.payment.findMany({
        where: {
          status: 'success',
          createdAt: { gte: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)) }
        },
        select: { amount: true }
      }),
      prisma.backup.findMany({
        where: {
          timestamp: { gte: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)) },
          quizzes: { not: null }
        },
        select: { quizzes: true }
      })
    ]);

    const staffActivity = await prisma.staffActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40
    });

    const trendByDay = new Map();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const label = d.toISOString().slice(0, 10);
      trendByDay.set(label, { date: label, revenue: 0, groups: 0, quizzes: 0 });
    }

    payments.forEach((payment) => {
      const key = new Date(payment.createdAt).toISOString().slice(0, 10);
      if (trendByDay.has(key) && payment.status === 'success') {
        trendByDay.get(key).revenue += Number(payment.amount || 0);
      }
    });

    groups.forEach((group) => {
      const key = new Date(group.createdAt).toISOString().slice(0, 10);
      if (trendByDay.has(key)) {
        trendByDay.get(key).groups += 1;
      }
    });

    backupQuizzes.forEach((item) => {
      const key = new Date(item.timestamp).toISOString().slice(0, 10);
      if (trendByDay.has(key)) {
        trendByDay.get(key).quizzes += 1;
      }
    });

    const performanceTrend = Array.from(trendByDay.values());
    const revenueLast30Days = paymentsLast30Days.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const newQuestionsLast7Days = backupQuizzesLast7Days.reduce((sum, item) => {
      const bucket = summarizeQuestionsFromBackup(item.quizzes);
      return sum + Number(bucket.questionCount || 0);
    }, 0);
    const businessHealth = calculateBusinessHealthScore({
      revenueLast30Days,
      activeUsers,
      newQuestionsLast7Days
    });

    return res.json({
      success: true,
      overview: {
        performanceTrend,
        staffActivity,
        businessHealth: {
          score: businessHealth.score,
          factors: businessHealth.factors,
          revenueLast30Days,
          activeUsers,
          newQuestionsLast7Days
        }
      }
    });
  } catch (err) {
    console.error('Owner overview error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// FINANCE_CONTROLLER workplace summary
app.get('/api/admin/finance/workplace', authMiddleware, requireRoles(['SYSTEM_OWNER', 'FINANCE_CONTROLLER']), async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { reference: true, amount: true, fuelAdded: true, status: true, createdAt: true, userId: true }
    });

    const totalRevenue = payments
      .filter((payment) => payment.status === 'success')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const successfulPayments = payments.filter((payment) => payment.status === 'success' && Number.isFinite(payment.userId));
    const latestPaymentByUser = new Map();
    successfulPayments.forEach((payment) => {
      const userId = Number(payment.userId);
      if (!Number.isFinite(userId)) return;

      const existing = latestPaymentByUser.get(userId);
      if (!existing || new Date(payment.createdAt) > new Date(existing.createdAt)) {
        latestPaymentByUser.set(userId, payment);
      }
    });

    const userIds = Array.from(latestPaymentByUser.keys());
    const users = userIds.length
      ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, username: true }
      })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    const now = Date.now();
    const expiringSubscriptions = Array.from(latestPaymentByUser.entries())
      .map(([userId, payment]) => {
        const expiryDate = new Date(payment.createdAt);
        expiryDate.setDate(expiryDate.getDate() + 30);
        const daysRemaining = Math.ceil((expiryDate.getTime() - now) / (24 * 60 * 60 * 1000));
        const user = usersById.get(userId);
        return {
          userId,
          email: user?.email || 'unknown@learnlite.app',
          username: user?.username || `user-${userId}`,
          paymentReference: payment.reference,
          expiryDate,
          daysRemaining
        };
      })
      .filter((item) => item.daysRemaining >= 0 && item.daysRemaining <= 3)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    return res.json({
      success: true,
      workplace: {
        totalRevenue,
        payments,
        expiringSubscriptions,
        expiringSoonCount: expiringSubscriptions.length
      }
    });
  } catch (err) {
    console.error('Finance workplace error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ACADEMIC_REGISTRAR workplace summary
app.get('/api/admin/academic/workplace', authMiddleware, requireRoles(['SYSTEM_OWNER', 'ACADEMIC_REGISTRAR']), async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, name: true, joinCode: true, createdAt: true }
    });

    const quizBackups = await prisma.backup.count({
      where: { quizzes: { not: null } }
    });

    return res.json({
      success: true,
      workplace: {
        groups,
        quizBackups
      }
    });
  } catch (err) {
    console.error('Academic workplace error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// OPS_MODERATOR workplace summary
app.get('/api/admin/ops/workplace', authMiddleware, requireRoles(['SYSTEM_OWNER', 'OPS_MODERATOR']), async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const disabledUsers = await prisma.user.count({ where: { isActive: false } });

    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, username: true, email: true, role: true, isActive: true, createdAt: true }
    });

    return res.json({
      success: true,
      workplace: {
        totalUsers,
        activeUsers,
        disabledUsers,
        recentUsers
      }
    });
  } catch (err) {
    console.error('Ops workplace error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Admin inbox: SYSTEM_OWNER can send to staff roles, staff can read their own inbox
app.get('/api/admin/inbox', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const messages = await prisma.staffMessage.findMany({
      where: { recipientId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        subject: true,
        body: true,
        isRead: true,
        createdAt: true,
        sender: {
          select: { id: true, username: true, email: true, role: true }
        }
      }
    });

    return res.json({ success: true, count: messages.length, messages });
  } catch (err) {
    console.error('Inbox fetch error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/admin/inbox/send', authMiddleware, requireRoles(['SYSTEM_OWNER']), async (req, res) => {
  try {
    const { recipientEmail, subject, body } = req.body;
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase();

    if (!recipientEmail || !subject || !body) {
      return res.status(400).json({ success: false, error: 'recipientEmail, subject and body are required' });
    }

    const recipient = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true, email: true }
    });

    if (!recipient) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

    if (!ALL_ADMIN_ROLES.includes(recipient.role) || recipient.role === 'SYSTEM_OWNER') {
      return res.status(400).json({ success: false, error: 'Recipient must be a managed staff role' });
    }

    const message = await prisma.staffMessage.create({
      data: {
        senderId: req.user.userId,
        recipientId: recipient.id,
        recipientRole: recipient.role,
        subject: String(subject).trim(),
        body: String(body).trim()
      }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'INBOX_SENT',
      target: recipient.email,
      details: `Subject: ${String(subject).trim()}`
    });

    return res.status(201).json({ success: true, message: 'Message sent', staffMessage: message });
  } catch (err) {
    console.error('Inbox send error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.patch('/api/admin/inbox/:id/read', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isFinite(messageId)) {
      return res.status(400).json({ success: false, error: 'Invalid message id' });
    }

    const message = await prisma.staffMessage.findUnique({
      where: { id: messageId },
      select: { id: true, recipientId: true }
    });

    if (!message || message.recipientId !== req.user.userId) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const updated = await prisma.staffMessage.update({
      where: { id: messageId },
      data: { isRead: true }
    });

    return res.json({ success: true, staffMessage: updated });
  } catch (err) {
    console.error('Inbox read update error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Staff factory: create staff/admin users with specific roles
app.post('/api/admin/create-staff', authMiddleware, systemOwnerMiddleware, async (req, res) => {
  try {
    const { email, username, password, role } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || !username || !password || !role) {
      return res.status(400).json({ success: false, error: 'email, username, password and role are required' });
    }

    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: `Invalid staff role. Allowed: ${STAFF_ROLES.join(', ')}` });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { username: String(username).trim() }]
      }
    });

    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const idNumber = await generateUniqueIdNumber();

    const staffUser = await prisma.user.create({
      data: {
        username: String(username).trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role,
        isActive: true,
        idNumber
      },
      select: {
        id: true,
        idNumber: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'CREATE_STAFF',
      target: staffUser.email,
      details: `Assigned role ${staffUser.role}`
    });

    return res.status(201).json({
      success: true,
      message: 'Staff account created successfully',
      user: staffUser
    });
  } catch (err) {
    console.error('Create staff error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Assign/change role for an existing account by email
app.post('/api/admin/assign-role', authMiddleware, systemOwnerMiddleware, async (req, res) => {
  try {
    const { email, role } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || !role) {
      return res.status(400).json({ success: false, error: 'email and role are required' });
    }

    if (!['USER', 'ADMIN', 'ROOT_ADMIN', 'FINANCE_CONTROLLER', 'ACADEMIC_REGISTRAR', 'OPS_MODERATOR', 'SOCIAL_MEDIA_CONTROLLER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role provided' });
    }

    const managedRoleByEmail = MANAGED_ACCOUNT_ROLE_MAP[normalizedEmail];
    if (managedRoleByEmail && role !== managedRoleByEmail) {
      return res.status(400).json({
        success: false,
        error: `Managed account ${normalizedEmail} must remain ${managedRoleByEmail}`
      });
    }

    const updated = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { role },
      select: { id: true, username: true, email: true, role: true, isActive: true }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'ASSIGN_ROLE',
      target: updated.email,
      details: `Role set to ${updated.role}`
    });

    return res.json({
      success: true,
      message: `${updated.email} is now ${role}`,
      user: updated
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    console.error('Assign role error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Finance logs: only FINANCE_CONTROLLER and SYSTEM_OWNER
app.get('/api/admin/payment-logs', authMiddleware, async (req, res) => {
  try {
    if (!['SYSTEM_OWNER', 'FINANCE_CONTROLLER'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Finance access required' });
    }

    const payments = await prisma.payment.findMany({
      select: {
        id: true,
        reference: true,
        userId: true,
        amount: true,
        fuelAdded: true,
        status: true,
        createdAt: true,
        processedAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    return res.json({ success: true, count: payments.length, payments });
  } catch (err) {
    console.error('Get payment logs error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// SYSTEM_OWNER can overwrite password for any non-owner account
app.post('/api/admin/overwrite-password', authMiddleware, systemOwnerMiddleware, async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || !newPassword) {
      return res.status(400).json({ success: false, error: 'email and newPassword are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const target = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true, email: true }
    });

    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (target.role === 'SYSTEM_OWNER') {
      return res.status(403).json({ success: false, error: 'SYSTEM_OWNER password cannot be overwritten' });
    }

    const managedRoleByEmail = MANAGED_ACCOUNT_ROLE_MAP[normalizedEmail];
    if (managedRoleByEmail && req.user.role !== 'SYSTEM_OWNER') {
      return res.status(403).json({ success: false, error: 'Only SYSTEM_OWNER can change managed account passwords' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email: normalizedEmail },
      data: { password: hashedPassword }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'OVERWRITE_PASSWORD',
      target: target.email,
      details: 'Password reset by SYSTEM_OWNER'
    });

    return res.json({
      success: true,
      message: `Password overwritten for ${target.email}`
    });
  } catch (err) {
    console.error('Overwrite password error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Kill switch: activate/deactivate any non-owner account by email
app.post('/api/admin/set-active', authMiddleware, systemOwnerMiddleware, async (req, res) => {
  try {
    const { email, isActive } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, error: 'email and boolean isActive are required' });
    }

    const target = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true, email: true }
    });

    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (target.role === 'SYSTEM_OWNER') {
      return res.status(403).json({ success: false, error: 'SYSTEM_OWNER account cannot be deactivated' });
    }

    if (target.id === req.user.userId && isActive === false) {
      return res.status(400).json({ success: false, error: 'You cannot deactivate your own account' });
    }

    const managedRoleByEmail = MANAGED_ACCOUNT_ROLE_MAP[normalizedEmail];
    if (managedRoleByEmail && req.user.role !== 'SYSTEM_OWNER') {
      return res.status(403).json({ success: false, error: 'Only SYSTEM_OWNER can change managed account status' });
    }

    const updated = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { isActive },
      select: { id: true, username: true, email: true, role: true, isActive: true }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'SET_ACCOUNT_ACTIVE',
      target: updated.email,
      details: `Account set ${updated.isActive ? 'active' : 'inactive'}`
    });

    return res.json({
      success: true,
      message: `${updated.email} is now ${updated.isActive ? 'active' : 'inactive'}`,
      user: updated
    });
  } catch (err) {
    console.error('Set active error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Add fuel to user: POST /api/admin/users/:userId/add-fuel
app.post('/api/admin/users/:userId/add-fuel', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUserId = Number(userId);

    if (!Number.isFinite(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid userId'
      });
    }

    // Add 50 fuel to target user
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { fuelBalance: { increment: 50 } },
      select: { 
        id: true, 
        username: true, 
        email: true, 
        fuelBalance: true 
      }
    });

    console.log(`✅ Admin ${req.user.userId} added 50 fuel to user ${updatedUser.username}`);

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'ADD_FUEL',
      target: updatedUser.email,
      details: 'Added 50 fuel units'
    });

    res.json({
      success: true,
      message: `Added 50 fuel to ${updatedUser.username}`,
      user: updatedUser
    });
  } catch (err) {
    console.error('Add fuel error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ========================================
// WEBHOOK ROUTES
// ========================================

// Paystack Payment Webhook: POST /api/paystack/webhook
app.post('/api/paystack/webhook', express.json(), async (req, res) => {
  // IMMEDIATE ACK: Tell Paystack we received it (don't wait for processing)
  console.log('--- NEW PAYSTACK WEBHOOK ---');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  res.sendStatus(200);

  // Process webhook asynchronously (don't block response)
  try {
    // Verify signature from Paystack
    const signature = req.headers['x-paystack-signature'];
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      console.warn('[Paystack Webhook] ⚠️  PAYSTACK_SECRET_KEY not configured in .env');
    } else if (!signature) {
      console.warn('[Paystack Webhook] ⚠️  Missing signature header');
    } else {
      // Use raw body for signature verification (not stringified)
      const bodyData = req.rawBody || JSON.stringify(req.body);
      const hash = crypto.createHmac('sha512', secretKey)
        .update(bodyData)
        .digest('hex');
      
      console.log('[Paystack Webhook] Signature Check:');
      console.log('  Expected:', signature);
      console.log('  Computed:', hash);

      if (hash === signature) {
        console.log('[Paystack Webhook] ✅ Signature verified - webhook is authentic');
      } else {
        console.error('[Paystack Webhook] ❌ SIGNATURE MISMATCH - ignoring webhook (not authentic)');
        return;
      }
    }

    const { data, event } = req.body;

    console.log('[Webhook Data Received] Paystack:', JSON.stringify(req.body, null, 2));
    console.log(`[Paystack Webhook] Event: ${event}`, JSON.stringify(data, null, 2));

    if (event === 'charge.success') {
      const reference = data?.reference;
      const amountPaid = Number(data?.amount || 0);
      const customerEmail = data?.customer?.email ? String(data.customer.email).trim().toLowerCase() : '';

      if (!reference || !customerEmail || !Number.isFinite(amountPaid) || amountPaid <= 0) {
        console.error('[Paystack Webhook] Invalid charge.success payload', {
          reference,
          amountPaid,
          customerEmail
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { email: customerEmail },
        select: { id: true, username: true, email: true, fuelBalance: true }
      });

      if (!user) {
        console.error(`[Paystack Webhook] User not found for email ${customerEmail}`);
        return;
      }

      const fuelAdded = amountPaid;

      // Check if payment already processed (idempotency)
      const existingPayment = await prisma.payment.findUnique({
        where: { reference }
      });

      if (existingPayment) {
        console.log(`[Paystack Webhook] Payment ${reference} already processed`);
        return;
      }

      // Update user fuel balance
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { fuelBalance: { increment: fuelAdded } },
        select: { id: true, username: true, email: true, fuelBalance: true }
      });

      // Record the payment
      await prisma.payment.create({
        data: {
          reference,
          userId: user.id,
          amount: amountPaid,
          fuelAdded,
          status: 'success',
          paystackData: JSON.stringify(data)
        }
      });

      console.log(`✅ [Paystack Webhook] User ${updatedUser.username} received ${fuelAdded} fuel. Total: ${updatedUser.fuelBalance}`);
    }
  } catch (err) {
    console.error('[Paystack Webhook] Error processing webhook:', err);
  }
});

// HeyGen Video Webhook: POST /api/webhooks/heygen
app.post('/api/webhooks/heygen', express.json(), async (req, res) => {
  try {
    const { video_id, status, video_url, metadata } = req.body;

    console.log('[Webhook Data Received] HeyGen:', JSON.stringify(req.body, null, 2));
    console.log(`[HeyGen Webhook] Video ID: ${video_id}, Status: ${status}`, JSON.stringify(req.body, null, 2));

    if (status === 'completed' && video_url) {
      // Extract userId from metadata or from the request
      let userId = metadata?.userId;

      if (!userId) {
        console.warn('[HeyGen Webhook] Warning: userId not found in metadata');
        return res.json({ success: true, message: 'Video completed but userId not found' });
      }

      userId = Number(userId);

      // Update user record with the video information (optional: store video_id and video_url)
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          // Store latest video info (you can customize this based on your schema)
          // For now, just logging the completion
        },
        select: { id: true, username: true, email: true, fuelBalance: true }
      }).catch(err => {
        if (err.code === 'P2025') {
          console.error(`[HeyGen Webhook] User ${userId} not found`);
          return null;
        }
        throw err;
      });

      console.log(`✅ [HeyGen Webhook] Video ${video_id} completed for user ${userId}. URL: ${video_url}`);

      // Optional: Store the video record in database if you have a Video model
      // await prisma.video.create({
      //   data: {
      //     userId,
      //     videoId: video_id,
      //     videoUrl: video_url,
      //     status: 'completed'
      //   }
      // });

      return res.json({
        success: true,
        message: 'Video processed successfully',
        video_id,
        video_url,
        user: updatedUser
      });
    }

    if (status === 'failed') {
      console.error(`[HeyGen Webhook] Video generation failed for ${video_id}`);
      return res.json({ success: true, message: 'Video generation failed' });
    }

    res.json({ success: true, message: 'Webhook received' });
  } catch (err) {
    console.error('[HeyGen Webhook] Error:', err);
    res.status(500).json({ success: false, error: 'Webhook processing error' });
  }
});

// ========================================
// ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err && err.status ? err.status : 500;

  if (NODE_ENV === 'production') {
    return res.status(status).json({ success: false, error: 'Server error' });
  }

  return res.status(status).json({
    success: false,
    error: err.message || 'Server error',
    stack: err.stack
  });
});

// ========================================
// 404 HANDLER
// ========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Learn Lite Backend Running`);
  console.log(`📍 Host: 0.0.0.0 (localhost + 127.0.0.1)`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`🔐 CORS Origin: ${FRONTEND_ORIGIN}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL || 'file:./dev.db'}`);
  console.log(`🌐 API: http://localhost:${PORT} | http://127.0.0.1:${PORT}\n`);
});

module.exports = app;
