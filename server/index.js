// Learn Lite Backend - Express Server
// Unified project structure: learn-lite/server/

// MUST BE FIRST: Load environment variables before anything else
require('dotenv').config();

console.log('Starting Learn Lite backend...');
const fs = require('fs');
const path = require('path');
const envFilePath = path.join(__dirname, '.env');

if (!fs.existsSync(envFilePath)) {
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
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { sendWelcomeEmail, sendPasswordResetOtpEmail } = require('./utils/email');
const { startWeeklyFinancialReportCron } = require('./cron/reports');
const { seedManagedAdminAccounts } = require('./prisma/managed-admins');

// CONFIGURATION
// ========================================

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_URL = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000';
const PAYSTACK_CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || `${FRONTEND_URL}/generate-video`;
const HEYGEN_API_VERSION = process.env.HEYGEN_API_VERSION || 'v1';
const HEYGEN_BASE_URL = `https://api.heygen.com/${HEYGEN_API_VERSION}`;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

if (NODE_ENV === 'production' && !DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL must be provided in production.');
  process.exit(1);
}

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

if (!GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY not set. AI chat and quiz generation will be unavailable.');
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

const quizUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }
});

const app = express();

// ========================================
// CORS CONFIGURATION - MUST BE FIRST
// ========================================

const FRONTEND_ORIGIN = FRONTEND_URL;
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

const JSON_BODY_LIMIT = '20mb';

// Middleware to capture raw body for webhook signature verification
app.use(express.json({
  limit: JSON_BODY_LIMIT,
  strict: false,
  verify: (req, res, buf, encoding) => {
    if (req.path === '/api/paystack/webhook') {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));
app.use(express.urlencoded({ limit: JSON_BODY_LIMIT, extended: true }));

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

const homeMediaPath = path.join(__dirname, '..', 'public', 'home-media');
const homeMediaManifestPath = path.join(homeMediaPath, 'manifest.json');
const communitySharesPath = path.join(__dirname, '..', 'public', 'community-study-shares.json');

if (!fs.existsSync(homeMediaPath)) {
  fs.mkdirSync(homeMediaPath, { recursive: true });
  console.log('🖼️ Created homepage media directory:', homeMediaPath);
}

if (!fs.existsSync(homeMediaManifestPath)) {
  fs.writeFileSync(homeMediaManifestPath, JSON.stringify({ items: [] }, null, 2), 'utf8');
}

if (!fs.existsSync(communitySharesPath)) {
  fs.writeFileSync(communitySharesPath, JSON.stringify({ items: [] }, null, 2), 'utf8');
}

app.use('/home-media', express.static(homeMediaPath));
console.log('🖼️ Serving homepage media from:', homeMediaPath);

function normalizeHomeMediaItem(item) {
  if (!item || typeof item !== 'object') return item;

  const url = String(item.url || '').trim();
  const relativeUrl = url.includes('/home-media/') ? url.slice(url.indexOf('/home-media/')) : url;

  return {
    ...item,
    url: relativeUrl || url
  };
}

function loadHomeMediaItems() {
  try {
    const raw = fs.readFileSync(homeMediaManifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items)) {
      return [];
    }
    return parsed.items.map(normalizeHomeMediaItem);
  } catch (err) {
    console.warn('Unable to read homepage media manifest:', err.message);
    return [];
  }
}

function saveHomeMediaItems(items) {
  fs.writeFileSync(homeMediaManifestPath, JSON.stringify({ items }, null, 2), 'utf8');
}

function sanitizeUploadFileName(fileName = '') {
  const ext = path.extname(String(fileName)).toLowerCase();
  const base = path.basename(String(fileName), ext).replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 60);
  const safeBase = base || 'homepage-media';
  const safeExt = ext && ext.length <= 10 ? ext : '';
  return `${safeBase}${safeExt}`;
}

function inferMediaTypeFromMime(mimeType = '') {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  return 'unknown';
}

function normalizeCommunityShareItem(item) {
  if (!item || typeof item !== 'object') return null;

  const category = String(item.category || 'General').trim() || 'General';
  const title = String(item.title || '').trim();
  const description = String(item.description || '').trim();
  if (!title || !description) return null;

  return {
    id: String(item.id || `share-${Date.now()}-${Math.round(Math.random() * 9999)}`),
    title: title.slice(0, 120),
    category: category.slice(0, 60),
    description: description.slice(0, 700),
    resourceType: String(item.resourceType || 'quiz').trim().toLowerCase().slice(0, 40),
    sharedBy: String(item.sharedBy || 'learnlite-user').trim().slice(0, 120),
    sharedByUserId: Number.isFinite(Number(item.sharedByUserId)) ? Number(item.sharedByUserId) : null,
    groupId: Number.isFinite(Number(item.groupId)) ? Number(item.groupId) : null,
    quizId: String(item.quizId || '').trim().slice(0, 120),
    isFree: true,
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function loadCommunityShares() {
  try {
    const raw = fs.readFileSync(communitySharesPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items)) return [];
    return parsed.items
      .map(normalizeCommunityShareItem)
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Unable to read community study shares:', err.message);
    return [];
  }
}

function saveCommunityShares(items) {
  fs.writeFileSync(communitySharesPath, JSON.stringify({ items }, null, 2), 'utf8');
}

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

app.use('/api/', (req, res, next) => {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const inputs = [req.body, req.query, req.params];
  for (const input of inputs) {
    const verdict = inspectPayload(input);
    if (!verdict.ok) {
      return res.status(400).json({
        success: false,
        error: verdict.reason || 'Rejected suspicious payload'
      });
    }
  }

  return next();
});

// Compatibility shim: normalize accidental double-prefixed API calls.
app.use('/api/api', (req, res) => {
  return res.redirect(307, `/api${req.url}`);
});

const forgotRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many OTP requests. Please try again later.' }
});

const forgotVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many reset attempts. Please try again later.' }
});

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
const ROOT_EQUIVALENT_ROLES = ['ROOT', 'SYSTEM_OWNER', 'ROOT_ADMIN'];
const passwordResetStore = new Map();
const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_MAX_VERIFY_ATTEMPTS = 5;
const PASSWORD_RESET_SESSION_TTL_MS = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [email, payload] of passwordResetStore.entries()) {
    if (!payload?.expiresAt || payload.expiresAt <= now) {
      passwordResetStore.delete(email);
    }
  }
}, 60 * 1000);

function normalizeEmailAddress(email) {
  return String(email || '').trim().toLowerCase();
}

function generatePasswordResetOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashPasswordResetOtp(email, otp) {
  return crypto
    .createHash('sha256')
    .update(`${normalizeEmailAddress(email)}:${String(otp)}:${JWT_SECRET}`)
    .digest('hex');
}

function storePasswordResetOtp({ email, userId, username }) {
  const otp = generatePasswordResetOtp();
  const expiresAt = Date.now() + PASSWORD_RESET_OTP_TTL_MS;
  const record = {
    userId,
    username,
    otpHash: hashPasswordResetOtp(email, otp),
    expiresAt,
    attempts: 0,
    createdAt: Date.now()
  };

  passwordResetStore.set(normalizeEmailAddress(email), record);
  return { otp, expiresAt };
}

function getPasswordResetRecord(email) {
  const key = normalizeEmailAddress(email);
  const record = passwordResetStore.get(key);

  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    passwordResetStore.delete(key);
    return null;
  }

  return record;
}

function clearPasswordResetRecord(email) {
  passwordResetStore.delete(normalizeEmailAddress(email));
}

function createPasswordResetSessionToken({ email, userId }) {
  return jwt.sign(
    {
      email: normalizeEmailAddress(email),
      userId,
      purpose: 'password-reset'
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function verifyPasswordResetSessionToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded?.purpose !== 'password-reset') {
    throw new Error('Invalid reset token purpose');
  }
  return decoded;
}

function hasMaliciousPattern(value) {
  if (typeof value !== 'string') return false;
  return /<\s*script|<\s*\/\s*script|javascript\s*:|data\s*:\s*text\/html|onerror\s*=|onload\s*=|__proto__|constructor\s*\(/i.test(value);
}

function inspectPayload(input, depth = 0) {
  if (depth > 12) {
    return { ok: false, reason: 'Payload nesting too deep' };
  }

  if (input == null) return { ok: true };

  if (typeof input === 'string') {
    const isMediaDataUrl = /^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,/i.test(input);
    const maxStringLength = isMediaDataUrl ? 16 * 1024 * 1024 : 50000;

    if (input.length > maxStringLength) {
      return { ok: false, reason: 'String payload too large' };
    }
    if (hasMaliciousPattern(input)) {
      return { ok: false, reason: 'Potentially malicious string detected' };
    }
    return { ok: true };
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const verdict = inspectPayload(item, depth + 1);
      if (!verdict.ok) return verdict;
    }
    return { ok: true };
  }

  if (typeof input === 'object') {
    const keys = Object.keys(input);
    if (keys.length > 1000) {
      return { ok: false, reason: 'Too many object keys in payload' };
    }

    for (const key of keys) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) {
        return { ok: false, reason: 'Prototype pollution key rejected' };
      }

      const verdict = inspectPayload(input[key], depth + 1);
      if (!verdict.ok) return verdict;
    }

    return { ok: true };
  }

  return { ok: true };
}

function isSovereignRole(role) {
  return ROOT_EQUIVALENT_ROLES.includes(String(role || '').toUpperCase());
}

function checkSovereign(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Mandatory rule from requirement.
    if (String(req.user.role || '').toUpperCase() === 'ROOT') {
      return next();
    }

    // Compatibility with current role model.
    if (isSovereignRole(req.user.role)) {
      return next();
    }

    if (allowedRoles.length && allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({ success: false, error: 'Forbidden: sovereign access required' });
  };
}

function isRootMiddleware(req, res, next) {
  if (!req.user?.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const role = String(req.user.role || '').toUpperCase();
  if (role === 'ROOT' || role === 'SYSTEM_OWNER') {
    return next();
  }

  return res.status(403).json({ success: false, error: 'Forbidden: ROOT access required' });
}

function mapActivityRoute(item) {
  const target = String(item?.target || '').toLowerCase();
  if (item?.action?.includes('ROLE') || item?.action?.includes('ACCOUNT') || target.includes('@')) {
    return '/dashboard/root-admin';
  }
  if (item?.action?.includes('PAYMENT')) {
    return '/dashboard/finance-controller';
  }
  if (item?.action?.includes('QUESTION') || item?.action?.includes('GROUP')) {
    return '/dashboard/academic-registrar';
  }
  return '/dashboard/root-admin';
}

function csvEscape(value) {
  const normalized = String(value ?? '');
  if (/[,"\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function toCsv(rows = []) {
  if (!rows.length) {
    return 'timestamp,actorRole,actorEmail,action,target,details\n';
  }

  const header = ['timestamp', 'actorRole', 'actorEmail', 'action', 'target', 'details'];
  const lines = rows.map((row) => [
    csvEscape(new Date(row.createdAt).toISOString()),
    csvEscape(row.actorRole || ''),
    csvEscape(row.actorEmail || ''),
    csvEscape(row.action || ''),
    csvEscape(row.target || ''),
    csvEscape(row.details || '')
  ].join(','));

  return `${header.join(',')}\n${lines.join('\n')}\n`;
}

async function getRootGlobalSettings() {
  const latest = await prisma.staffActivity.findFirst({
    where: { action: 'ROOT_GLOBAL_SETTINGS' },
    orderBy: { createdAt: 'desc' },
    select: { details: true, createdAt: true }
  });

  if (!latest?.details) {
    return {
      maintenanceMode: false,
      registrationOpen: true,
      updatedAt: new Date(0).toISOString()
    };
  }

  try {
    const parsed = JSON.parse(latest.details);
    return {
      maintenanceMode: Boolean(parsed.maintenanceMode),
      registrationOpen: parsed.registrationOpen !== false,
      updatedAt: parsed.updatedAt || latest.createdAt.toISOString(),
      updatedBy: parsed.updatedBy || null
    };
  } catch {
    return {
      maintenanceMode: false,
      registrationOpen: true,
      updatedAt: latest.createdAt.toISOString()
    };
  }
}

async function maintenanceModeGuard(req, res, next) {
  try {
    const settings = await getRootGlobalSettings();
    if (!settings.maintenanceMode) return next();

    const role = String(req.user?.role || '').toUpperCase();
    if (isSovereignRole(role)) return next();

    return res.status(503).json({
      success: false,
      error: 'System is in maintenance mode',
      code: 'MAINTENANCE_MODE'
    });
  } catch {
    return next();
  }
}

async function registrationOpenGuard(req, res, next) {
  try {
    const settings = await getRootGlobalSettings();
    if (settings.registrationOpen) return next();
    return res.status(403).json({
      success: false,
      error: 'Registration is currently closed by Root Override',
      code: 'REGISTRATION_CLOSED'
    });
  } catch {
    return next();
  }
}

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
      select: { id: true, role: true, isActive: true, isSuspended: true, email: true }
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

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        error: 'Account is suspended by OPS_MODERATOR. Contact support.',
        code: 'ACCOUNT_SUSPENDED'
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

const frontendDistPath = path.join(__dirname, '..', 'dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

if (NODE_ENV === 'production') {
  if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath, { maxAge: '1y', index: false }));

    app.get(/^(?!\/api\/).*/, (req, res) => {
      if (fs.existsSync(frontendIndexPath)) {
        return res.sendFile(frontendIndexPath);
      }

      return res.status(500).json({
        success: false,
        error: 'Frontend build not found. Ensure the client build runs before start.'
      });
    });
  } else {
    console.warn('⚠️  Production frontend build directory not found. SPA routes will not be served.');
  }
}

app.get('/api/home-media', (req, res) => {
  const items = loadHomeMediaItems()
    .filter((item) => item?.url && (item?.type === 'image' || item?.type === 'video'))
    .slice(0, 24);

  return res.json({ success: true, items });
});

app.get('/api/community/study-shares', (req, res) => {
  const category = String(req.query?.category || '').trim().toLowerCase();
  const search = String(req.query?.search || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 60)));

  let items = loadCommunityShares();

  if (category) {
    items = items.filter((item) => String(item.category || '').toLowerCase() === category);
  }

  if (search) {
    items = items.filter((item) => {
      const blob = `${item.title} ${item.description} ${item.category}`.toLowerCase();
      return blob.includes(search);
    });
  }

  return res.json({ success: true, items: items.slice(0, limit) });
});

app.post('/api/community/study-shares', authMiddleware, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const category = String(req.body?.category || '').trim();
    const description = String(req.body?.description || '').trim();
    const resourceType = String(req.body?.resourceType || 'quiz').trim().toLowerCase();
    const quizId = String(req.body?.quizId || '').trim();
    const groupId = Number(req.body?.groupId);

    if (!title || !category || !description) {
      return res.status(400).json({ success: false, error: 'Title, category, and description are required.' });
    }

    const shareItem = normalizeCommunityShareItem({
      id: `share-${Date.now()}-${Math.round(Math.random() * 9999)}`,
      title,
      category,
      description,
      resourceType,
      quizId,
      groupId: Number.isFinite(groupId) ? groupId : null,
      sharedBy: req.user?.username || req.user?.email || `user-${req.user?.userId || 'unknown'}`,
      sharedByUserId: Number(req.user?.userId),
      createdAt: new Date().toISOString(),
      isFree: true
    });

    if (!shareItem) {
      return res.status(400).json({ success: false, error: 'Invalid share payload.' });
    }

    const existing = loadCommunityShares();
    const updated = [shareItem, ...existing].slice(0, 300);
    saveCommunityShares(updated);

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'USER_SHARE_STUDY_RESOURCE',
      target: shareItem.title,
      details: `${shareItem.category} | ${shareItem.resourceType} shared for free community access`
    });

    return res.json({ success: true, message: 'Study resource shared successfully.', item: shareItem, items: updated.slice(0, 60) });
  } catch (err) {
    console.error('Community study share create error:', err);
    return res.status(500).json({ success: false, error: 'Failed to share study resource.' });
  }
});

app.get('/api/internal/health/providers', authMiddleware, async (req, res) => {
  try {
    const report = await buildProviderHealthReport();
    return res.json({
      success: true,
      summary: report.success ? 'PASS' : 'FAIL',
      checkedAt: new Date().toISOString(),
      checks: report.checks
    });
  } catch (err) {
    console.error('Provider health endpoint error:', err);
    return res.status(500).json({ success: false, error: 'Failed to execute provider health checks' });
  }
});

app.post('/api/quiz/generate', authMiddleware, maintenanceModeGuard, quizUpload.single('file'), async (req, res) => {
  try {
    const requestedCount = Math.max(5, Math.min(40, Number(req.body?.questionCount || 10)));
    const difficulty = String(req.body?.difficulty || 'mixed').trim().toLowerCase();
    const mode = String(req.body?.mode || 'exam-ready').trim().toLowerCase();
    const sourceName = String(req.file?.originalname || req.body?.sourceFileName || 'uploaded-note').trim();

    let extractedText = String(req.body?.noteText || '').trim();
    if (!extractedText && req.file?.buffer) {
      const mimeType = String(req.file.mimetype || '').toLowerCase();
      if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('csv')) {
        extractedText = req.file.buffer.toString('utf8').trim();
      }
    }

    const truncatedSource = extractedText.slice(0, 10000);
    const quizPrompt = [
      'You are an exam board engine. Create a STANDARD CBT (Computer-Based Test) quiz JSON.',
      `Generate exactly ${requestedCount} questions.`,
      `Difficulty: ${difficulty}. Mode: ${mode}.`,
      'Output STRICT JSON only with this shape:',
      '{"questions":[{"id":"q-1","question":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctAnswer":"A","explanation":"...","topic":"...","difficulty":"..."}]}',
      'Rules:',
      '- Each question must have exactly 4 options A-D.',
      '- correctAnswer must be one of A, B, C, D.',
      '- Questions must be unique, clear, and exam-grade.',
      '- Explanations should be concise (1-2 sentences).',
      `Source note/file: ${sourceName}`,
      truncatedSource ? `Use this source material:\n${truncatedSource}` : 'No extractable text was provided; infer quality generic study questions based on the source title.'
    ].join('\n');

    const geminiText = await callGeminiJson({
      prompt: quizPrompt,
      responseMimeType: 'application/json',
      temperature: 0.35
    });

    const parsed = parseJsonFromText(geminiText);
    const questions = normalizeCbtQuestions(parsed?.questions, requestedCount);

    if (!questions.length) {
      return res.status(502).json({
        success: false,
        error: 'Gemini returned unusable quiz data. Please try again.'
      });
    }

    const quizId = `quiz-${Date.now()}-${Math.round(Math.random() * 9999)}`;
    const quizRecord = {
      type: 'generated_quiz',
      quizId,
      sourceFileName: sourceName,
      questionCount: questions.length,
      mode,
      difficulty,
      generatedBy: 'gemini',
      generatedAt: new Date().toISOString(),
      questions
    };

    await prisma.backup.create({
      data: {
        userId: req.user.userId,
        quizzes: JSON.stringify(quizRecord)
      }
    });

    return res.status(201).json({
      success: true,
      quizId,
      sourceFileName: sourceName,
      mode,
      difficulty,
      generatedBy: 'gemini',
      questions,
      cbtStandard: true
    });
  } catch (err) {
    console.error('Quiz generation error:', err.response?.data || err.message || err);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate quiz from Gemini',
      details: NODE_ENV === 'development' ? (err.response?.data || err.message) : undefined
    });
  }
});

app.get('/api/quiz/list', authMiddleware, async (req, res) => {
  try {
    const backups = await prisma.backup.findMany({
      where: { userId: req.user.userId, quizzes: { not: null } },
      orderBy: { timestamp: 'desc' },
      take: 100,
      select: { id: true, timestamp: true, quizzes: true }
    });

    const quizzes = backups
      .map((item) => {
        const parsed = parseJsonSafely(item.quizzes, null);
        if (!parsed || parsed.type !== 'generated_quiz') return null;
        return {
          id: parsed.quizId,
          backupId: item.id,
          sourceFileName: parsed.sourceFileName || 'Unknown source',
          questionCount: Number(parsed.questionCount || parsed.questions?.length || 0),
          generatedAt: parsed.generatedAt || item.timestamp,
          mode: parsed.mode || 'exam-ready',
          difficulty: parsed.difficulty || 'mixed'
        };
      })
      .filter(Boolean);

    return res.json({ success: true, quizzes });
  } catch (err) {
    console.error('Quiz list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch quiz list' });
  }
});

app.get('/api/quiz/:id', authMiddleware, async (req, res) => {
  try {
    const quizId = String(req.params.id || '').trim();
    if (!quizId) return res.status(400).json({ success: false, error: 'quizId is required' });

    const backups = await prisma.backup.findMany({
      where: { userId: req.user.userId, quizzes: { not: null } },
      orderBy: { timestamp: 'desc' },
      take: 150,
      select: { id: true, timestamp: true, quizzes: true }
    });

    const match = backups.find((entry) => {
      const parsed = parseJsonSafely(entry.quizzes, null);
      return parsed?.type === 'generated_quiz' && parsed?.quizId === quizId;
    });

    if (!match) return res.status(404).json({ success: false, error: 'Quiz not found' });

    const quiz = parseJsonSafely(match.quizzes, null);
    return res.json({
      success: true,
      quiz: {
        id: quiz.quizId,
        sourceFileName: quiz.sourceFileName,
        questionCount: quiz.questionCount,
        generatedAt: quiz.generatedAt || match.timestamp,
        mode: quiz.mode,
        difficulty: quiz.difficulty,
        questions: quiz.questions || []
      }
    });
  } catch (err) {
    console.error('Get quiz error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch quiz' });
  }
});

app.post('/api/quiz/:id/attempt', authMiddleware, async (req, res) => {
  try {
    const quizId = String(req.params.id || '').trim();
    const answers = req.body?.answers || {};

    if (!quizId) return res.status(400).json({ success: false, error: 'quizId is required' });

    const backups = await prisma.backup.findMany({
      where: { userId: req.user.userId, quizzes: { not: null } },
      orderBy: { timestamp: 'desc' },
      take: 150,
      select: { quizzes: true }
    });

    const matched = backups
      .map((entry) => parseJsonSafely(entry.quizzes, null))
      .find((parsed) => parsed?.type === 'generated_quiz' && parsed?.quizId === quizId);

    if (!matched) return res.status(404).json({ success: false, error: 'Quiz not found' });

    const questions = Array.isArray(matched.questions) ? matched.questions : [];
    let correct = 0;

    const review = questions.map((q) => {
      const selected = String(answers[q.id] || '').trim().toUpperCase();
      const expected = String(q.correctAnswer || '').trim().toUpperCase();
      const isCorrect = selected && expected && selected === expected;
      if (isCorrect) correct += 1;
      return {
        id: q.id,
        selected,
        correct: expected,
        isCorrect
      };
    });

    const total = questions.length;
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        totalQuestionsAttempted: { increment: total },
        totalQuestionsCorrect: { increment: correct }
      }
    });

    await prisma.backup.create({
      data: {
        userId: req.user.userId,
        quizzes: JSON.stringify({
          type: 'quiz_attempt',
          quizId,
          score: correct,
          total,
          percent,
          review,
          attemptedAt: new Date().toISOString()
        })
      }
    });

    return res.json({ success: true, score: correct, total, percent, review });
  } catch (err) {
    console.error('Submit quiz attempt error:', err);
    return res.status(500).json({ success: false, error: 'Failed to score quiz attempt' });
  }
});

app.delete('/api/quiz/:id', authMiddleware, async (req, res) => {
  try {
    const quizId = String(req.params.id || '').trim();
    if (!quizId) return res.status(400).json({ success: false, error: 'quizId is required' });

    const backups = await prisma.backup.findMany({
      where: { userId: req.user.userId, quizzes: { not: null } },
      orderBy: { timestamp: 'desc' },
      take: 200,
      select: { id: true, quizzes: true }
    });

    const idsToDelete = backups
      .filter((entry) => {
        const parsed = parseJsonSafely(entry.quizzes, null);
        return parsed?.quizId === quizId;
      })
      .map((entry) => entry.id);

    if (!idsToDelete.length) {
      return res.status(404).json({ success: false, error: 'Quiz not found' });
    }

    await prisma.backup.deleteMany({ where: { id: { in: idsToDelete }, userId: req.user.userId } });
    return res.json({ success: true, deletedQuizId: quizId });
  } catch (err) {
    console.error('Delete quiz error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete quiz' });
  }
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

function stripCodeFence(text) {
  const normalized = String(text || '').trim();
  if (!normalized.startsWith('```')) return normalized;
  return normalized.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim();
}

function parseJsonFromText(text) {
  const cleaned = stripCodeFence(text);
  return JSON.parse(cleaned);
}

function normalizeCbtQuestions(rawQuestions, desiredCount = 10) {
  const questions = Array.isArray(rawQuestions) ? rawQuestions : [];

  return questions
    .map((item, idx) => {
      const optionPool = Array.isArray(item?.options)
        ? item.options
        : Array.isArray(item?.choices)
        ? item.choices
        : [];

      const options = optionPool
        .map((opt, optIdx) => {
          const fallbackKey = String.fromCharCode(65 + optIdx);
          if (typeof opt === 'string') {
            return { key: fallbackKey, text: opt.trim() };
          }

          if (opt && typeof opt === 'object') {
            const key = String(opt.key || opt.label || fallbackKey).trim().toUpperCase();
            const text = String(opt.text || opt.value || opt.option || '').trim();
            return { key, text };
          }

          return { key: fallbackKey, text: String(opt || '').trim() };
        })
        .filter((opt) => opt.text)
        .slice(0, 4)
        .map((opt, optIdx) => ({
          key: String.fromCharCode(65 + optIdx),
          text: opt.text
        }));

      const rawCorrect = String(item?.correctAnswer || item?.correct_option || item?.answer || '').trim().toUpperCase();
      const validKeys = options.map((opt) => opt.key);
      const correctAnswer = validKeys.includes(rawCorrect) ? rawCorrect : validKeys[0] || 'A';

      return {
        id: String(item?.id || `q-${idx + 1}`),
        question: String(item?.question || item?.prompt || `Question ${idx + 1}`).trim(),
        options,
        correctAnswer,
        explanation: String(item?.explanation || '').trim(),
        difficulty: String(item?.difficulty || 'mixed').trim(),
        topic: String(item?.topic || '').trim()
      };
    })
    .filter((q) => q.question && q.options.length >= 2)
    .slice(0, Math.max(1, Number(desiredCount) || 10));
}

async function callGeminiJson({ prompt, responseMimeType = 'application/json', temperature = 0.4 }) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType
      }
    },
    {
      timeout: 45000,
      headers: { 'Content-Type': 'application/json' }
    }
  );

  const text = response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Gemini returned empty response');
  }

  return text;
}

function buildGeminiFallbackResponse(cleanMessage) {
  const lower = String(cleanMessage || '').toLowerCase();
  if (!lower) {
    return 'Ask me a question about your classwork and I will help break it down step by step.';
  }

  if (lower.includes('math') || lower.includes('algebra') || lower.includes('equation')) {
    return 'Start by identifying the unknown, write the given values clearly, and solve step by step. If you want, send the full question and I will walk through it.';
  }

  if (lower.includes('biology') || lower.includes('photosynthesis') || lower.includes('cell')) {
    return 'Focus on the definition, the main process, and one real example. For exam prep, memorize the key steps and the final outcome.';
  }

  if (lower.includes('physics') || lower.includes('force') || lower.includes('motion')) {
    return 'Write the formula first, list the known values, then substitute carefully with units. If you send the exact question, I can break it down.';
  }

  return 'I could not reach Gemini just now, but here is a study hint: turn the question into small parts, identify the key concept, and answer with one clear example.';
}

async function buildProviderHealthReport() {
  const checks = [];

  if (PAYSTACK_SECRET_KEY) {
    try {
      const paystackResponse = await axios.get('https://api.paystack.co/bank', {
        timeout: 15000,
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      });
      checks.push({ provider: 'paystack', status: 'PASS', httpStatus: paystackResponse.status, message: 'Reachable and authenticated' });
    } catch (err) {
      checks.push({
        provider: 'paystack',
        status: 'FAIL',
        httpStatus: err.response?.status || null,
        message: err.response?.data?.message || err.message || 'Request failed'
      });
    }
  } else {
    checks.push({ provider: 'paystack', status: 'FAIL', httpStatus: null, message: 'PAYSTACK_SECRET_KEY not configured' });
  }

  if (GEMINI_API_KEY) {
    try {
      const geminiResponse = await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`, {
        timeout: 15000
      });
      checks.push({ provider: 'gemini', status: 'PASS', httpStatus: geminiResponse.status, message: 'Reachable and authenticated' });
    } catch (err) {
      checks.push({
        provider: 'gemini',
        status: 'FAIL',
        httpStatus: err.response?.status || null,
        message: err.response?.data?.error?.message || err.message || 'Request failed'
      });
    }
  } else {
    checks.push({ provider: 'gemini', status: 'FAIL', httpStatus: null, message: 'GEMINI_API_KEY not configured' });
  }

  if (HEYGEN_API_KEY) {
    try {
      await axios.post(
        `${HEYGEN_BASE_URL}/video_agent/generate`,
        { prompt: 'health-check', callback_url: `${PUBLIC_URL}/api/webhooks/heygen` },
        {
          timeout: 20000,
          headers: {
            'X-API-KEY': HEYGEN_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      checks.push({ provider: 'heygen', status: 'PASS', httpStatus: 200, message: 'Reachable and generation request accepted' });
    } catch (err) {
      const status = err.response?.status || null;
      const statusPass = [400, 401, 402, 403, 404, 429].includes(Number(status));
      checks.push({
        provider: 'heygen',
        status: statusPass ? 'PASS' : 'FAIL',
        httpStatus: status,
        message: err.response?.data?.error || err.response?.data?.message || err.message || 'Request failed'
      });
    }
  } else {
    checks.push({ provider: 'heygen', status: 'FAIL', httpStatus: null, message: 'HEYGEN_API_KEY not configured' });
  }

  return {
    success: checks.every((item) => item.status === 'PASS'),
    checks
  };
}

// Signup: POST /api/auth/signup
app.post('/api/auth/signup', registrationOpenGuard, async (req, res) => {
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
    // Fresh login guard: clear legacy auth cookies to prevent session ghosting.
    res.clearCookie('token');
    res.clearCookie('jwt');
    res.clearCookie('learn_lite_token');
    res.set('Cache-Control', 'no-store');

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

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        error: 'This account is suspended by OPS_MODERATOR.',
        code: 'ACCOUNT_SUSPENDED'
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

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: {
        id: true,
        idNumber: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        isSuspended: true
      }
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: updatedUser,
      redirectPath: getRedirectPathForRole(updatedUser.role)
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

// Forgot password: request OTP
app.post('/api/auth/forgot-password/request', forgotRequestLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmailAddress(req.body?.email);

    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, username: true, email: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return res.json({
        success: true,
        message: 'If the account exists, a password reset OTP has been sent.'
      });
    }

    const { otp, expiresAt } = storePasswordResetOtp({
      email: normalizedEmail,
      userId: user.id,
      username: user.username
    });

    await sendPasswordResetOtpEmail({
      email: user.email,
      username: user.username,
      otp,
      expiresMinutes: Math.max(1, Math.ceil((expiresAt - Date.now()) / 60000))
    });

    return res.json({
      success: true,
      message: 'Password reset OTP sent successfully.'
    });
  } catch (err) {
    console.error('Forgot password request error:', err);
    return res.status(500).json({ success: false, error: 'Unable to send password reset OTP' });
  }
});

// Forgot password: verify OTP and mint short-lived reset token
app.post('/api/auth/forgot-password/verify', forgotVerifyLimiter, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmailAddress(req.body?.email);
    const otp = String(req.body?.otp || '').trim();

    if (!validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    if (!/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({ success: false, error: 'OTP must be a 6-digit code' });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, username: true, email: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return res.status(400).json({ success: false, error: 'Invalid OTP or expired request' });
    }

    const record = getPasswordResetRecord(normalizedEmail);
    if (!record) {
      return res.status(400).json({ success: false, error: 'Invalid OTP or expired request' });
    }

    if (record.attempts >= PASSWORD_RESET_MAX_VERIFY_ATTEMPTS) {
      clearPasswordResetRecord(normalizedEmail);
      return res.status(429).json({ success: false, error: 'Too many invalid attempts. Please request a new OTP.' });
    }

    const expectedHash = hashPasswordResetOtp(normalizedEmail, otp);
    const storedHash = String(record.otpHash || '');
    const isValid = storedHash.length === expectedHash.length && crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(expectedHash));

    if (!isValid) {
      record.attempts += 1;
      passwordResetStore.set(normalizedEmail, record);
      return res.status(400).json({ success: false, error: 'Invalid OTP or expired request' });
    }

    const resetToken = createPasswordResetSessionToken({ email: normalizedEmail, userId: user.id });
    passwordResetStore.set(normalizedEmail, { ...record, verifiedAt: Date.now(), resetTokenIssuedAt: Date.now() });

    return res.json({
      success: true,
      message: 'OTP verified successfully.',
      resetToken,
      expiresInSeconds: Math.floor(PASSWORD_RESET_SESSION_TTL_MS / 1000)
    });
  } catch (err) {
    console.error('Forgot password verify error:', err);
    return res.status(500).json({ success: false, error: 'Unable to verify password reset OTP' });
  }
});

// Forgot password: complete reset with token + new password
app.post('/api/auth/forgot-password/reset', forgotVerifyLimiter, async (req, res) => {
  try {
    const resetToken = String(req.body?.resetToken || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!resetToken) {
      return res.status(400).json({ success: false, error: 'Reset token is required' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match' });
    }

    const decoded = verifyPasswordResetSessionToken(resetToken);
    const normalizedEmail = normalizeEmailAddress(decoded.email);

    const record = getPasswordResetRecord(normalizedEmail);
    if (!record || !record.verifiedAt) {
      return res.status(400).json({ success: false, error: 'Reset session expired. Please request a new OTP.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, isActive: true }
    });

    if (!user || normalizeEmailAddress(user.email) !== normalizedEmail || !user.isActive) {
      return res.status(400).json({ success: false, error: 'Reset session is no longer valid' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    clearPasswordResetRecord(normalizedEmail);

    return res.json({
      success: true,
      message: 'Password reset successfully. Please sign in with your new password.'
    });
  } catch (err) {
    console.error('Forgot password reset error:', err);
    return res.status(500).json({ success: false, error: 'Unable to reset password' });
  }
});

// ========================================
// FUEL & VIDEO ENDPOINTS (Protected)
// ========================================

// Get user fuel balance: GET /api/user/fuel
app.get('/api/user/fuel', authMiddleware, maintenanceModeGuard, async (req, res) => {
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
        const apiErrorText = String(heygenResponse.data.error || '').toLowerCase();
        if (/insufficient.*credit/.test(apiErrorText)) {
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
      if (errorText.includes('insufficient') && errorText.includes('credit')) {
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
        callback_url: PAYSTACK_CALLBACK_URL,
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
      callbackUrl: PAYSTACK_CALLBACK_URL,
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

function sanitizeReplyPayload(replyTo) {
  if (!replyTo || typeof replyTo !== 'object') return null;

  const title = String(replyTo.title || '').trim().slice(0, 120);
  const text = String(replyTo.text || '').trim().slice(0, 600);
  if (!title && !text) return null;

  return {
    id: String(replyTo.id || '').trim().slice(0, 80) || null,
    title: title || 'Message',
    text
  };
}

function mapGroupMessageRecordToWorkspaceMessage(record) {
  return {
    id: String(record.id || `msg-${Date.now()}`),
    tone: String(record.tone || 'incoming'),
    title: String(record.title || 'Classmate'),
    text: String(record.text || '').trim(),
    replyTo: sanitizeReplyPayload(record.replyTo),
    reactions: record.reactions && typeof record.reactions === 'object' ? record.reactions : {},
    createdAt: record.createdAt || new Date().toISOString(),
    senderId: Number(record.senderId) || null
  };
}

async function fetchGroupMessages(groupId, take = 400) {
  const rows = await prisma.backup.findMany({
    where: { messages: { not: null } },
    orderBy: { timestamp: 'desc' },
    take,
    select: { id: true, timestamp: true, messages: true }
  });

  const output = [];

  for (const row of rows.reverse()) {
    const parsed = parseJsonSafely(row.messages, null);
    if (!parsed || parsed.type !== 'GROUP_CHAT_MESSAGE') continue;
    if (Number(parsed.groupId) !== Number(groupId)) continue;

    const normalized = mapGroupMessageRecordToWorkspaceMessage({
      id: parsed.messageId || row.id,
      tone: parsed.tone || 'incoming',
      title: parsed.title,
      text: parsed.text,
      replyTo: parsed.replyTo,
      reactions: parsed.reactions,
      createdAt: parsed.createdAt || row.timestamp,
      senderId: parsed.senderId
    });

    if (normalized.text) {
      output.push(normalized);
    }
  }

  return output;
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

    let nextCode = requestedJoinCode ? requestedJoinCode.toUpperCase() : null;
    if (nextCode && !/^[A-Z0-9]{6}$/.test(nextCode)) {
      return res.status(400).json({ success: false, error: 'joinCode must be exactly 6 alphanumeric characters' });
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

// List groups for the authenticated member
app.get('/api/groups/mine', authMiddleware, async (req, res) => {
  try {
    const requesterId = getRequesterUserId(req);

    if (!Number.isFinite(requesterId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const memberships = await prisma.groupMember.findMany({
      where: { userId: requesterId },
      orderBy: { joinedAt: 'desc' },
      select: {
        role: true,
        joinedAt: true,
        group: {
          select: {
            id: true,
            name: true,
            joinCode: true,
            createdById: true,
            createdAt: true,
            _count: { select: { members: true } }
          }
        }
      }
    });

    const groups = memberships.map((entry) => ({
      id: entry.group.id,
      name: entry.group.name,
      joinCode: entry.group.joinCode,
      createdById: entry.group.createdById,
      createdAt: entry.group.createdAt,
      memberCount: Number(entry.group._count?.members || 0),
      role: entry.role,
      isOwner: entry.group.createdById === requesterId
    }));

    return res.json({ success: true, groups });
  } catch (err) {
    console.error('Get my groups error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Group chat messages: GET /api/chat/:groupId
app.get('/api/chat/:groupId', authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const requesterId = getRequesterUserId(req);

    if (!Number.isFinite(groupId)) {
      return res.status(400).json({ success: false, error: 'Invalid group id' });
    }

    if (!Number.isFinite(requesterId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: requesterId } },
      select: { groupId: true }
    });

    if (!membership) {
      return res.status(403).json({ success: false, error: 'You are not a member of this group' });
    }

    const messages = await fetchGroupMessages(groupId, 500);
    return res.json({ success: true, messages });
  } catch (err) {
    console.error('Get group chat messages error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Group chat messages: POST /api/chat/:groupId
app.post('/api/chat/:groupId', authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const requesterId = getRequesterUserId(req);
    const messageInput = typeof req.body?.message === 'string'
      ? req.body.message
      : (typeof req.body?.text === 'string' ? req.body.text : '');
    const rawMessage = String(messageInput || '').trim();

    if (!Number.isFinite(groupId)) {
      return res.status(400).json({ success: false, error: 'Invalid group id' });
    }

    if (!Number.isFinite(requesterId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!rawMessage) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const [membership, user] = await Promise.all([
      prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: requesterId } },
        select: { role: true }
      }),
      prisma.user.findUnique({
        where: { id: requesterId },
        select: { username: true }
      })
    ]);

    if (!membership) {
      return res.status(403).json({ success: false, error: 'You are not a member of this group' });
    }

    const message = mapGroupMessageRecordToWorkspaceMessage({
      id: `msg-${groupId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tone: 'outgoing',
      title: user?.username || 'Classmate',
      text: rawMessage.slice(0, 2000),
      replyTo: sanitizeReplyPayload(req.body?.replyTo),
      reactions: {},
      createdAt: new Date().toISOString(),
      senderId: requesterId
    });

    await prisma.backup.create({
      data: {
        userId: requesterId,
        messages: JSON.stringify({
          type: 'GROUP_CHAT_MESSAGE',
          groupId,
          senderId: requesterId,
          messageId: message.id,
          tone: message.tone,
          title: message.title,
          text: message.text,
          replyTo: message.replyTo,
          reactions: message.reactions,
          createdAt: message.createdAt
        })
      }
    });

    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('Send group chat message error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Premium publish: save quiz payload for a class group and deduct 1 fuel
app.post('/api/groups/:id/publish-quiz', authMiddleware, fuelMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const requesterId = getRequesterUserId(req);
    const title = String(req.body?.title || 'Untitled Quiz').trim().slice(0, 120);
    const sourceNote = req.body?.sourceNote ? String(req.body.sourceNote).trim().slice(0, 180) : null;
    const payloadQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];

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

    if (!membership) {
      return res.status(403).json({ success: false, error: 'You are not a member of this group' });
    }

    if (membership.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Only group admins can publish quizzes' });
    }

    if (!payloadQuestions.length) {
      return res.status(400).json({ success: false, error: 'questions is required and must be a non-empty array' });
    }

    const sanitizedQuestions = payloadQuestions.slice(0, 100).map((question, index) => {
      const prompt = String(
        question?.prompt || question?.question || question?.text || `Question ${index + 1}`
      ).trim().slice(0, 500);

      const options = Array.isArray(question?.options)
        ? question.options.map((option) => String(option).trim().slice(0, 300)).filter(Boolean).slice(0, 6)
        : [];

      const correctIndex = Number.isInteger(question?.correctIndex) ? question.correctIndex : 0;

      return {
        id: String(question?.id || `q-${index + 1}`),
        prompt,
        options,
        correctIndex,
        explanation: question?.explanation ? String(question.explanation).slice(0, 600) : null
      };
    });

    if (req.userFuel == null || req.userFuel <= 0) {
      return res.status(402).json({ success: false, error: 'Insufficient fuel' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: requesterId },
      data: { fuelBalance: { decrement: 1 } },
      select: { fuelBalance: true }
    });

    const publication = {
      type: 'group_quiz_publication',
      publishedAt: new Date().toISOString(),
      groupId,
      groupName: group.name,
      publishedById: requesterId,
      title,
      sourceNote,
      questions: sanitizedQuestions
    };

    const backup = await prisma.backup.create({
      data: {
        userId: requesterId,
        quizzes: JSON.stringify(publication)
      },
      select: { id: true, timestamp: true }
    });

    return res.status(201).json({
      success: true,
      message: 'Quiz published to class group',
      group: { id: group.id, name: group.name, joinCode: group.joinCode },
      publication: {
        id: backup.id,
        timestamp: backup.timestamp,
        title,
        questionCount: sanitizedQuestions.length
      },
      fuelUsed: 1,
      fuelRemaining: updatedUser.fuelBalance
    });
  } catch (err) {
    console.error('Publish group quiz error:', err);
    return res.status(500).json({ success: false, error: 'Failed to publish quiz' });
  }
});

// Admin-only: publish a generated quiz into a class group (costs 1 fuel)
app.post('/api/groups/:id/publish-quiz', authMiddleware, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const requesterId = getRequesterUserId(req);
    const quizPayload = req.body?.quiz || req.body;
    const quizTitle = String(req.body?.title || 'Class Quiz').trim().slice(0, 120);

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
      return res.status(403).json({ success: false, error: 'Only group admins can publish quizzes' });
    }

    const questions = Array.isArray(quizPayload?.questions) ? quizPayload.questions : [];
    if (!questions.length) {
      return res.status(400).json({ success: false, error: 'Quiz must contain at least one question' });
    }

    const user = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, fuelBalance: true }
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Session is no longer valid. Please log in again.' });
    }

    if ((user.fuelBalance || 0) <= 0) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient fuel. Add fuel to publish this quiz to your class group.',
        fuelRequired: 1,
        fuelAvailable: user.fuelBalance || 0
      });
    }

    const publicationRecord = {
      type: 'GROUP_PUBLISHED_QUIZ',
      title: quizTitle,
      group: {
        id: group.id,
        name: group.name,
        joinCode: group.joinCode
      },
      publisherId: requesterId,
      publishedAt: new Date().toISOString(),
      quiz: {
        ...quizPayload,
        questionCount: questions.length
      }
    };

    const [updatedUser, backup] = await prisma.$transaction([
      prisma.user.update({
        where: { id: requesterId },
        data: { fuelBalance: { decrement: 1 } },
        select: { fuelBalance: true }
      }),
      prisma.backup.create({
        data: {
          userId: requesterId,
          quizzes: JSON.stringify(publicationRecord)
        },
        select: { id: true, timestamp: true }
      })
    ]);

    return res.status(201).json({
      success: true,
      message: `Quiz published to ${group.name}`,
      publicationId: backup.id,
      publishedAt: backup.timestamp,
      fuelRemaining: updatedUser.fuelBalance,
      questionCount: questions.length
    });
  } catch (err) {
    console.error('Publish group quiz error:', err);
    return res.status(500).json({ success: false, error: 'Failed to publish quiz' });
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
    const requesterId = getRequesterUserId(req);

    if (!message || !groupId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message and groupId are required' 
      });
    }

    if (!Number.isFinite(requesterId)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Check if user is part of the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: Number(groupId),
          userId: requesterId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ 
        success: false, 
        error: 'You are not a member of this group' 
      });
    }

    // Check if message mentions learnlite with or without @
    if (!/\b@?learnlite\b/i.test(message)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message must mention learnlite to get a response' 
      });
    }

    const cleanMessage = String(message || '').replace(/\b@?learnlite\b/ig, '').trim() || 'Share a quick CBT study tip for the class.';

    const prompt = [
      'You are Learn Lite AI tutor for CBT exam preparation.',
      'Be concise, accurate, and practical for students.',
      'Provide short steps, examples, and memory hints where useful.',
      `Group context id: ${groupId}`,
      `Student message: ${cleanMessage}`
    ].join('\n');

    const aiResponse = await callGeminiJson({
      prompt,
      responseMimeType: 'text/plain',
      temperature: 0.55
    });

    const responseText = String(aiResponse || '').trim() || buildGeminiFallbackResponse(cleanMessage);
    await prisma.backup.create({
      data: {
        userId: requesterId,
        messages: JSON.stringify({
          type: 'GROUP_CHAT_MESSAGE',
          groupId: Number(groupId),
          senderId: 0,
          messageId: `ai-${groupId}-${Date.now()}`,
          tone: 'incoming',
          title: '@learnlite',
          text: responseText,
          replyTo: null,
          reactions: {},
          createdAt: new Date().toISOString(),
          generatedBy: 'gemini'
        })
      }
    });

    res.json({
      success: true,
      message: responseText,
      provider: 'gemini',
      isAIMock: false
    });

  } catch (err) {
    console.error('AI chat error:', err.response?.data || err.message || err);
    const fallbackText = buildGeminiFallbackResponse(req.body?.message);

    try {
      await prisma.backup.create({
        data: {
          userId: requesterId,
          messages: JSON.stringify({
            type: 'GROUP_CHAT_MESSAGE',
            groupId: Number(req.body?.groupId),
            senderId: 0,
            messageId: `ai-fallback-${req.body?.groupId || 'group'}-${Date.now()}`,
            tone: 'incoming',
            title: '@learnlite',
            text: fallbackText,
            replyTo: null,
            reactions: {},
            createdAt: new Date().toISOString(),
            generatedBy: 'fallback'
          })
        }
      });
    } catch (persistErr) {
      console.warn('Fallback AI persistence failed:', persistErr.message);
    }

    return res.json({
      success: true,
      message: fallbackText,
      provider: 'fallback',
      isAIMock: true
    });
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

async function getUserByIdForProtection(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, role: true }
  });
}

async function getUserByEmailForProtection(email) {
  return prisma.user.findUnique({
    where: { email: String(email || '').trim().toLowerCase() },
    select: { id: true, email: true, username: true, role: true }
  });
}

function assertNotSovereignTarget(targetUser) {
  if (!targetUser) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const targetRole = String(targetUser.role || '').toUpperCase();
  if (targetRole === 'ROOT' || targetRole === 'SYSTEM_OWNER') {
    const err = new Error('Sovereign accounts cannot be modified by subordinates');
    err.statusCode = 403;
    throw err;
  }

  return targetUser;
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

// SYSTEM_OWNER audit logs with pagination (Smart Audit Feed)
app.get('/api/admin/owner/audit-logs', authMiddleware, requireRoles(['SYSTEM_OWNER']), async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const filterAction = req.query.action ? String(req.query.action).trim() : null;

    const offset = (page - 1) * limit;

    const where = {};
    if (filterAction) {
      where.action = { contains: filterAction, mode: 'insensitive' };
    }

    const [logs, total] = await Promise.all([
      prisma.staffActivity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          actorId: true,
          actorEmail: true,
          actorRole: true,
          action: true,
          target: true,
          details: true,
          createdAt: true
        }
      }),
      prisma.staffActivity.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
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

    const successfulByStatus = payments.filter((item) => item.status === 'success');
    const amountValues = successfulByStatus.map((item) => Number(item.amount || 0));
    const avgAmount = amountValues.length
      ? amountValues.reduce((sum, amount) => sum + amount, 0) / amountValues.length
      : 0;
    const anomalyThresholdHigh = avgAmount * 1.8;
    const anomalyThresholdLow = avgAmount * 0.2;
    const anomalyTransactions = successfulByStatus
      .filter((item) => {
        const amount = Number(item.amount || 0);
        if (!Number.isFinite(amount) || avgAmount <= 0) return false;
        return amount >= anomalyThresholdHigh || amount <= anomalyThresholdLow;
      })
      .slice(0, 20)
      .map((item) => ({
        reference: item.reference,
        amount: Number(item.amount || 0),
        fuelAdded: Number(item.fuelAdded || 0),
        status: item.status,
        createdAt: item.createdAt,
        severity: Number(item.amount || 0) >= anomalyThresholdHigh ? 'HIGH' : 'LOW'
      }));

    const paymentsByCategory = [
      {
        category: 'Successful Transactions',
        totalAmount: successfulByStatus.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        count: successfulByStatus.length
      },
      {
        category: 'Pending Transactions',
        totalAmount: payments.filter((item) => item.status === 'pending').reduce((sum, item) => sum + Number(item.amount || 0), 0),
        count: payments.filter((item) => item.status === 'pending').length
      },
      {
        category: 'Failed Transactions',
        totalAmount: payments.filter((item) => item.status === 'failed').reduce((sum, item) => sum + Number(item.amount || 0), 0),
        count: payments.filter((item) => item.status === 'failed').length
      }
    ];

    const proposedDisbursements = await prisma.proposedDisbursement.findMany({
      where: {
        OR: [
          { createdById: req.user.userId },
          { status: 'PENDING' }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 25
    });

    return res.json({
      success: true,
      workplace: {
        totalRevenue,
        payments,
        expiringSubscriptions,
        expiringSoonCount: expiringSubscriptions.length,
        cashFlow: {
          byCategory: paymentsByCategory,
          averageSuccessfulAmount: avgAmount,
          anomalyThresholdHigh,
          anomalyThresholdLow,
          anomalies: anomalyTransactions
        },
        budgetVsActual: [
          { department: 'Academic', budget: 300000, actual: Math.round(totalRevenue * 0.32) },
          { department: 'Operations', budget: 220000, actual: Math.round(totalRevenue * 0.28) },
          { department: 'Marketing', budget: 180000, actual: Math.round(totalRevenue * 0.18) },
          { department: 'Infrastructure', budget: 260000, actual: Math.round(totalRevenue * 0.22) }
        ],
        proposedDisbursements
      }
    });
  } catch (err) {
    console.error('Finance workplace error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/admin/finance/allocation-requests', authMiddleware, requireRoles(['SYSTEM_OWNER', 'FINANCE_CONTROLLER']), async (req, res) => {
  try {
    const sourcePool = String(req.body?.sourcePool || '').trim();
    const destinationDepartment = String(req.body?.destinationDepartment || '').trim();
    const justification = String(req.body?.justification || '').trim();
    const requestedAmount = Number(req.body?.requestedAmount || 0);

    if (!sourcePool || !destinationDepartment || !justification) {
      return res.status(400).json({ success: false, error: 'sourcePool, destinationDepartment and justification are required' });
    }

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'requestedAmount must be greater than zero' });
    }

    const created = await prisma.proposedDisbursement.create({
      data: {
        sourcePool,
        destinationDepartment,
        justification,
        requestedAmount,
        status: 'PENDING',
        createdById: req.user.userId,
        createdByRole: req.user.role,
        createdByEmail: req.user.email
      }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'FINCON_PROPOSED_DISBURSEMENT',
      target: `${destinationDepartment}#${created.id}`,
      details: `Proposed ${requestedAmount} from ${sourcePool} to ${destinationDepartment}`
    });

    return res.json({ success: true, proposal: created });
  } catch (err) {
    console.error('Create allocation request error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/admin/finance/proposed-disbursements', authMiddleware, requireRoles(['SYSTEM_OWNER', 'FINANCE_CONTROLLER']), async (req, res) => {
  try {
    const proposals = await prisma.proposedDisbursement.findMany({
      where: req.user.role === 'FINANCE_CONTROLLER' ? { createdById: req.user.userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return res.json({ success: true, proposals });
  } catch (err) {
    console.error('Get proposed disbursements error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/admin/finance/activity-export.csv', authMiddleware, requireRoles(['SYSTEM_OWNER', 'FINANCE_CONTROLLER']), async (req, res) => {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);

    const activities = await prisma.staffActivity.findMany({
      where: {
        createdAt: { gte: fromDate },
        OR: [
          { action: { contains: 'PAYMENT' } },
          { action: { contains: 'FINCON' } },
          { action: { contains: 'DISBURSEMENT' } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    const csv = toCsv(activities);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="financial-activity-weekly.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    console.error('Finance activity export error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/admin/finance/activity-export.pdf', authMiddleware, requireRoles(['SYSTEM_OWNER', 'FINANCE_CONTROLLER']), async (req, res) => {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);

    const activities = await prisma.staffActivity.findMany({
      where: {
        createdAt: { gte: fromDate },
        OR: [
          { action: { contains: 'PAYMENT' } },
          { action: { contains: 'FINCON' } },
          { action: { contains: 'DISBURSEMENT' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 300
    });

    const lines = activities.map((item) => {
      const timestamp = new Date(item.createdAt).toISOString();
      return `${timestamp} | ${item.actorRole} | ${item.actorEmail} | ${item.action} | ${item.target || ''} | ${item.details || ''}`;
    });

    const report = [
      'Learn Lite Financial Activity Report (Last 7 Days)',
      `Generated: ${new Date().toISOString()}`,
      '',
      ...lines
    ].join('\n');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="financial-activity-weekly.pdf"');
    return res.status(200).send(Buffer.from(report, 'utf-8'));
  } catch (err) {
    console.error('Finance PDF export error:', err);
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

app.post('/api/admin/academic/questions/bulk-upload', authMiddleware, requireRoles(['SYSTEM_OWNER', 'ACADEMIC_REGISTRAR']), async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (!rows.length) {
      return res.status(400).json({ success: false, error: 'rows array is required' });
    }

    if (rows.length > 2000) {
      return res.status(400).json({ success: false, error: 'Maximum 2000 rows allowed per upload' });
    }

    const normalizeDifficulty = (value) => {
      const raw = String(value || 'medium').trim().toLowerCase();
      if (['easy', 'medium', 'hard'].includes(raw)) return raw;
      return 'medium';
    };

    const toQuestionPayload = (row) => {
      const optionA = String(row.optionA || '').trim();
      const optionB = String(row.optionB || '').trim();
      const optionC = String(row.optionC || '').trim();
      const optionD = String(row.optionD || '').trim();
      const rawAnswer = String(row.correctAnswer || '').trim();

      if (!row.question || !optionA || !optionB || !optionC || !optionD || !rawAnswer) {
        return { valid: false, reason: 'Missing required fields (question/options/correctAnswer)' };
      }

      const answerUpper = rawAnswer.toUpperCase();
      const answerByLabel = ['A', 'B', 'C', 'D'].includes(answerUpper)
        ? answerUpper
        : null;

      let finalAnswer = answerByLabel;
      if (!finalAnswer) {
        if (rawAnswer === optionA) finalAnswer = 'A';
        else if (rawAnswer === optionB) finalAnswer = 'B';
        else if (rawAnswer === optionC) finalAnswer = 'C';
        else if (rawAnswer === optionD) finalAnswer = 'D';
      }

      if (!finalAnswer) {
        return { valid: false, reason: 'correctAnswer must be A/B/C/D or match one option text' };
      }

      const failRate = Number(row.failRate || 0);

      return {
        valid: true,
        data: {
          question: String(row.question).trim(),
          optionA,
          optionB,
          optionC,
          optionD,
          correctAnswer: finalAnswer,
          difficulty: normalizeDifficulty(row.difficulty),
          topic: row.topic ? String(row.topic).trim() : null,
          failRate: Number.isFinite(failRate) ? Math.max(0, Math.min(1, failRate)) : 0,
          createdById: req.user.userId
        }
      };
    };

    const acceptedRows = [];
    const rejectedRows = [];

    rows.forEach((row, index) => {
      const parsed = toQuestionPayload(row || {});
      if (!parsed.valid) {
        rejectedRows.push({ row: index + 1, reason: parsed.reason });
        return;
      }
      acceptedRows.push(parsed.data);
    });

    if (!acceptedRows.length) {
      return res.status(400).json({
        success: false,
        error: 'No valid rows found in upload',
        summary: {
          accepted: 0,
          rejected: rejectedRows.length,
          rejectedRows: rejectedRows.slice(0, 30)
        }
      });
    }

    await prisma.questionBank.createMany({ data: acceptedRows });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'ACADEMIC_BULK_UPLOAD_QUESTIONS',
      target: `${acceptedRows.length} questions`,
      details: `Accepted ${acceptedRows.length}, rejected ${rejectedRows.length}`
    });

    return res.status(201).json({
      success: true,
      message: `Imported ${acceptedRows.length} questions successfully.`,
      summary: {
        accepted: acceptedRows.length,
        rejected: rejectedRows.length,
        rejectedRows: rejectedRows.slice(0, 30)
      }
    });
  } catch (err) {
    console.error('Academic bulk upload error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// OPS_MODERATOR workplace summary
app.get('/api/admin/ops/workplace', authMiddleware, requireRoles(['SYSTEM_OWNER', 'OPS_MODERATOR']), async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const disabledUsers = await prisma.user.count({ where: { isActive: false } });
    const suspendedUsers = await prisma.user.count({ where: { isSuspended: true } });

    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        isSuspended: true,
        createdAt: true,
        lastLoginAt: true,
      }
    });

    const inactiveUsers = await prisma.user.findMany({
      where: {
        createdAt: {
          lte: new Date(Date.now() - (48 * 60 * 60 * 1000))
        }
      },
      orderBy: { createdAt: 'asc' },
      take: 60,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isSuspended: true,
        lastLoginAt: true,
        createdAt: true
      }
    });

    const dayLabels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      dayLabels.push(d.toISOString().slice(0, 10));
    }

    const retentionByDay = dayLabels.map((day) => ({
      day,
      atRiskUsers: inactiveUsers.filter((user) => {
        const userDay = new Date(user.lastLoginAt || user.createdAt).toISOString().slice(0, 10);
        return userDay === day;
      }).length
    }));

    return res.json({
      success: true,
      workplace: {
        totalUsers,
        activeUsers,
        disabledUsers,
        suspendedUsers,
        recentUsers,
        inactiveUsers,
        retentionByDay
      }
    });
  } catch (err) {
    console.error('Ops workplace error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// OPS_MODERATOR user login monitor (web-app users only, excludes all admin/staff roles)
app.get('/api/admin/ops/active-users-logins', authMiddleware, requireRoles(['SYSTEM_OWNER', 'OPS_MODERATOR']), async (req, res) => {
  try {
    const q = String(req.query?.q || '').trim();
    const status = String(req.query?.status || 'all').toLowerCase(); // all | suspended | unsuspended

    const where = {
      role: 'USER',
      isActive: true
    };

    if (q) {
      where.OR = [
        { username: { contains: q } },
        { email: { contains: q } }
      ];
    }

    if (status === 'suspended') {
      where.isSuspended = true;
    } else if (status === 'unsuspended') {
      where.isSuspended = false;
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ lastLoginAt: 'desc' }, { createdAt: 'desc' }],
      take: 250,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        isSuspended: true,
        lastLoginAt: true,
        createdAt: true,
      }
    });

    const [allActiveWebUsers, suspendedActiveWebUsers] = await Promise.all([
      prisma.user.count({ where: { role: 'USER', isActive: true } }),
      prisma.user.count({ where: { role: 'USER', isActive: true, isSuspended: true } })
    ]);

    return res.json({
      success: true,
      count: users.length,
      users,
      summary: {
        allActiveWebUsers,
        suspendedActiveWebUsers,
        unsuspendedActiveWebUsers: Math.max(0, allActiveWebUsers - suspendedActiveWebUsers)
      }
    });
  } catch (err) {
    console.error('Ops active users login monitor error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.patch('/api/admin/ops/users/:userId/suspension', authMiddleware, requireRoles(['SYSTEM_OWNER', 'OPS_MODERATOR']), async (req, res) => {
  try {
    const targetUserId = Number(req.params.userId);
    const shouldSuspend = Boolean(req.body?.suspended);

    if (!Number.isFinite(targetUserId)) {
      return res.status(400).json({ success: false, error: 'Invalid user id' });
    }

    if (targetUserId === req.user.userId) {
      return res.status(400).json({ success: false, error: 'You cannot suspend your own account' });
    }

    const target = assertNotSovereignTarget(await getUserByIdForProtection(targetUserId));

    // OPS_MODERATOR can only take suspension actions on regular web-app users.
    if (String(req.user.role || '').toUpperCase() === 'OPS_MODERATOR' && String(target.role || '').toUpperCase() !== 'USER') {
      return res.status(403).json({
        success: false,
        error: 'OPS_MODERATOR can only suspend regular web-app users.'
      });
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { isSuspended: shouldSuspend },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        isSuspended: true,
        lastLoginAt: true
      }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: shouldSuspend ? 'OPS_SUSPEND_USER' : 'OPS_UNSUSPEND_USER',
      target: updated.email,
      details: shouldSuspend
        ? `Ops suspended ${updated.username}`
        : `Ops unsuspended ${updated.username}`
    });

    return res.json({
      success: true,
      message: shouldSuspend
        ? `${updated.username} has been suspended.`
        : `${updated.username} has been unsuspended.`,
      user: updated
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('Ops suspension error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/admin/ops/home-media', authMiddleware, requireRoles(['SYSTEM_OWNER', 'OPS_MODERATOR']), async (req, res) => {
  try {
    const { fileName, mimeType, dataUrl, title } = req.body || {};

    const mediaType = inferMediaTypeFromMime(mimeType);
    if (mediaType === 'unknown') {
      return res.status(400).json({ success: false, error: 'Unsupported media type. Use image/* or video/*.' });
    }

    const dataUrlMatch = String(dataUrl || '').match(/^data:([a-zA-Z0-9/+.-]+);base64,([\s\S]+)$/);
    if (!dataUrlMatch) {
      return res.status(400).json({ success: false, error: 'Invalid upload payload.' });
    }

    const base64Payload = dataUrlMatch[2] || '';
    const buffer = Buffer.from(base64Payload, 'base64');

    if (!buffer.length) {
      return res.status(400).json({ success: false, error: 'Uploaded file is empty.' });
    }

    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'File is too large. Max upload size is 8MB.' });
    }

    const timestampPrefix = Date.now();
    const safeOriginalName = sanitizeUploadFileName(fileName || 'homepage-media');
    const savedFileName = `${timestampPrefix}-${safeOriginalName}`;
    const absolutePath = path.join(homeMediaPath, savedFileName);

    fs.writeFileSync(absolutePath, buffer);

    const existingItems = loadHomeMediaItems();
    const nextItem = {
      id: crypto.randomUUID(),
      title: String(title || '').trim().slice(0, 120) || 'Homepage media',
      type: mediaType,
      mimeType: String(mimeType || '').toLowerCase(),
      fileName: savedFileName,
      url: `/home-media/${savedFileName}`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user?.email || `user-${req.user?.userId || 'unknown'}`
    };

    const updatedItems = [nextItem, ...existingItems].slice(0, 30);
    saveHomeMediaItems(updatedItems);

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'OPS_UPLOAD_HOMEPAGE_MEDIA',
      target: savedFileName,
      details: `${mediaType.toUpperCase()} uploaded for homepage display`
    });

    return res.status(201).json({
      success: true,
      message: 'Homepage media uploaded successfully.',
      item: nextItem,
      items: updatedItems
    });
  } catch (err) {
    console.error('Ops homepage media upload error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.delete('/api/admin/ops/home-media/:id', authMiddleware, requireRoles(['SYSTEM_OWNER', 'OPS_MODERATOR']), async (req, res) => {
  try {
    const mediaId = String(req.params.id || '').trim();
    if (!mediaId) {
      return res.status(400).json({ success: false, error: 'Media id is required.' });
    }

    const existingItems = loadHomeMediaItems();
    const targetItem = existingItems.find((item) => String(item?.id || '') === mediaId);

    if (!targetItem) {
      return res.status(404).json({ success: false, error: 'Media item not found.' });
    }

    const safeFileName = sanitizeUploadFileName(targetItem.fileName || '');
    const filePath = safeFileName ? path.join(homeMediaPath, safeFileName) : null;

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const updatedItems = existingItems.filter((item) => String(item?.id || '') !== mediaId);
    saveHomeMediaItems(updatedItems);

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'OPS_REMOVE_HOMEPAGE_MEDIA',
      target: targetItem.fileName || mediaId,
      details: `${String(targetItem.type || 'media').toUpperCase()} removed from homepage display`
    });

    return res.json({
      success: true,
      message: 'Homepage media removed successfully.',
      removedId: mediaId,
      items: updatedItems
    });
  } catch (err) {
    console.error('Ops homepage media remove error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/admin/ops/home-media/:id/restore', authMiddleware, requireRoles(['SYSTEM_OWNER', 'OPS_MODERATOR']), async (req, res) => {
  return res.status(410).json({
    success: false,
    error: 'Restore is no longer supported. Media removal is permanent.'
  });
});

app.get('/api/admin/socialmedia/high-score-kit', authMiddleware, requireRoles(['SYSTEM_OWNER', 'SOCIAL_MEDIA_CONTROLLER']), async (req, res) => {
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weeklyBackups = await prisma.backup.findMany({
      where: { timestamp: { gte: weekStart }, quizzes: { not: null } },
      select: {
        userId: true,
        quizzes: true,
        user: { select: { id: true, username: true, email: true } }
      },
      orderBy: { timestamp: 'desc' },
      take: 400
    });

    const board = new Map();
    weeklyBackups.forEach((backup) => {
      const key = backup.userId || backup.user?.id;
      if (!key) return;

      const scoreBucket = summarizeQuestionsFromBackup(backup.quizzes);
      const existing = board.get(key) || {
        userId: key,
        username: backup.user?.username || `user-${key}`,
        email: backup.user?.email || 'unknown@learnlite.app',
        scores: [],
        attempts: 0
      };

      existing.scores.push(...scoreBucket.scores);
      existing.attempts += 1;
      board.set(key, existing);
    });

    const leaderboard = Array.from(board.values())
      .map((item) => {
        const average = item.scores.length
          ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
          : 0;
        return {
          userId: item.userId,
          username: item.username,
          email: item.email,
          averageScore: Math.round(average),
          attempts: item.attempts
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore || b.attempts - a.attempts)
      .slice(0, 5)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    const whatsappLines = [
      '🔥 Learn Lite Weekly Top Performers 🔥',
      ...leaderboard.map((entry) => `#${entry.rank} ${entry.username} - ${entry.averageScore}% (${entry.attempts} attempts)`),
      '',
      'Join the learning wave on Learn Lite. Keep pushing! 🚀 #LearnLite #TopScorers'
    ];

    return res.json({
      success: true,
      kit: {
        generatedAt: new Date().toISOString(),
        leaderboard,
        whatsappTemplate: whatsappLines.join('\n')
      }
    });
  } catch (err) {
    console.error('High score kit error:', err);
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

    const target = assertNotSovereignTarget(await getUserByEmailForProtection(normalizedEmail));

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

    const target = assertNotSovereignTarget(await getUserByEmailForProtection(normalizedEmail));

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

    const target = assertNotSovereignTarget(await getUserByEmailForProtection(normalizedEmail));

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
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('Set active error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/root/mission-control', authMiddleware, isRootMiddleware, async (req, res) => {
  try {
    const [paymentAgg, activeUsers, systemErrors, events, pendingDisbursements] = await prisma.$transaction([
      prisma.payment.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.staffActivity.count({ where: { action: { contains: 'ERROR' } } }),
      prisma.staffActivity.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.proposedDisbursement.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    return res.json({
      success: true,
      kpis: {
        totalRevenue: Number(paymentAgg._sum.amount || 0),
        activeUsers,
        systemErrors,
        successfulPayments: Number(paymentAgg._count._all || 0)
      },
      recommendedActions: pendingDisbursements,
      events: events.map((item) => ({
        id: item.id,
        action: item.action,
        actorEmail: item.actorEmail,
        target: item.target,
        details: item.details,
        createdAt: item.createdAt,
        affectedRoute: mapActivityRoute(item)
      }))
    });
  } catch (err) {
    console.error('Mission Control fetch error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/root/proposed-disbursements/:proposalId/approve', authMiddleware, isRootMiddleware, async (req, res) => {
  try {
    const proposalId = Number(req.params.proposalId);
    if (!Number.isFinite(proposalId)) {
      return res.status(400).json({ success: false, error: 'Invalid proposalId' });
    }

    const proposal = await prisma.proposedDisbursement.findUnique({ where: { id: proposalId } });
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }

    if (proposal.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Only pending proposals can be approved' });
    }

    const executionReference = `EXEC-${Date.now()}-${proposal.id}`;
    const approved = await prisma.proposedDisbursement.update({
      where: { id: proposal.id },
      data: {
        status: 'APPROVED',
        approvedById: req.user.userId,
        approvedByEmail: req.user.email,
        approvedAt: new Date(),
        executionReference
      }
    });

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'ROOT_APPROVED_DISBURSEMENT',
      target: `proposal#${proposal.id}`,
      details: `Approved ${proposal.requestedAmount} for ${proposal.destinationDepartment}`
    });

    return res.json({ success: true, proposal: approved, executed: true });
  } catch (err) {
    console.error('Approve disbursement proposal error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ========================================
// ROOT SOVEREIGNTY ENDPOINTS
// ========================================

app.get('/api/root/god-view', authMiddleware, isRootMiddleware, async (req, res) => {
  try {
    const [financial, attendance, academic] = await prisma.$transaction([
      prisma.payment.aggregate({ _count: { _all: true }, _sum: { amount: true, fuelAdded: true } }),
      prisma.user.groupBy({ by: ['isActive', 'isSuspended'], _count: { _all: true } }),
      prisma.questionBank.aggregate({ _count: { _all: true }, _avg: { failRate: true } })
    ]);

    const [groupCount, classSectionCount, activeLast24h] = await prisma.$transaction([
      prisma.group.count(),
      prisma.classSection.count(),
      prisma.user.count({ where: { lastLoginAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    ]);

    return res.json({
      success: true,
      report: {
        generatedAt: new Date().toISOString(),
        financial: {
          transactionCount: financial._count._all,
          grossAmountKobo: financial._sum.amount || 0,
          fuelDistributed: financial._sum.fuelAdded || 0
        },
        attendance: { activeLast24h, byStatus: attendance },
        academic: {
          questionBankCount: academic._count._all,
          avgFailRate: academic._avg.failRate || 0,
          groups: groupCount,
          classSections: classSectionCount
        }
      }
    });
  } catch (err) {
    console.error('Root god-view error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/root/audit/sensitive', authMiddleware, isRootMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const skip = (page - 1) * limit;
    const sensitiveActions = ['ASSIGN_ROLE', 'ROOT_ROLE_CHANGE', 'GRADE_OVERRIDE', 'ROOT_KILL_SWITCH', 'ROOT_GLOBAL_SETTINGS'];

    const [total, logs] = await prisma.$transaction([
      prisma.staffActivity.count({ where: { action: { in: sensitiveActions } } }),
      prisma.staffActivity.findMany({
        where: { action: { in: sensitiveActions } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    return res.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (err) {
    console.error('Root sensitive audit error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.put('/api/root/settings/overrides', authMiddleware, isRootMiddleware, async (req, res) => {
  try {
    const maintenanceMode = req.body?.maintenanceMode;
    const registrationOpen = req.body?.registrationOpen;

    const state = await prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, role: true, email: true }
      });

      if (!actor) throw new Error('Actor not found');

      const current = await getRootGlobalSettings();
      const nextState = {
        maintenanceMode: typeof maintenanceMode === 'boolean' ? maintenanceMode : current.maintenanceMode,
        registrationOpen: typeof registrationOpen === 'boolean' ? registrationOpen : current.registrationOpen,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.id
      };

      await tx.staffActivity.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          actorEmail: actor.email,
          action: 'ROOT_GLOBAL_SETTINGS',
          target: 'SYSTEM',
          details: JSON.stringify(nextState)
        }
      });

      return nextState;
    });

    return res.json({ success: true, state });
  } catch (err) {
    console.error('Root global override error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/root/kill-switch', authMiddleware, isRootMiddleware, async (req, res) => {
  try {
    const targetUserId = Number(req.body?.targetUserId);
    const reason = String(req.body?.reason || 'Security action');
    if (!Number.isFinite(targetUserId)) {
      return res.status(400).json({ success: false, error: 'targetUserId is required' });
    }

    if (targetUserId === req.user.userId) {
      return res.status(400).json({ success: false, error: 'Root cannot deactivate themselves' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, role: true, email: true }
      });
      if (!actor) throw new Error('Actor not found');

      const updateResult = await tx.user.updateMany({
        where: {
          id: targetUserId,
          role: { notIn: ROOT_EQUIVALENT_ROLES }
        },
        data: {
          isActive: false,
          isSuspended: true
        }
      });

      if (updateResult.count === 0) {
        throw new Error('Target not found or target is protected root account');
      }

      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, email: true, role: true }
      });

      await tx.staffActivity.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          actorEmail: actor.email,
          action: 'ROOT_KILL_SWITCH',
          target: target?.email || `USER:${targetUserId}`,
          details: JSON.stringify({ reason, revokedAt: new Date().toISOString() })
        }
      });

      return { target };
    });

    return res.json({ success: true, tokenRevoked: true, ...result });
  } catch (err) {
    console.error('Root kill-switch error:', err);
    return res.status(400).json({ success: false, error: err.message || 'Kill switch failed' });
  }
});

app.post('/api/root/role-escalator', authMiddleware, isRootMiddleware, async (req, res) => {
  try {
    const targetUserId = Number(req.body?.targetUserId);
    const newRole = String(req.body?.newRole || '').toUpperCase();
    const reason = String(req.body?.reason || 'Hierarchy update');

    if (!Number.isFinite(targetUserId) || !newRole) {
      return res.status(400).json({ success: false, error: 'targetUserId and newRole are required' });
    }

    if (targetUserId === req.user.userId) {
      return res.status(400).json({ success: false, error: 'Root cannot edit their own role' });
    }

    const user = await prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, role: true, email: true }
      });
      if (!actor) throw new Error('Actor not found');

      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true }
      });
      assertNotSovereignTarget(target);

      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: { role: newRole },
        select: { id: true, username: true, email: true, role: true }
      });

      await tx.staffActivity.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          actorEmail: actor.email,
          action: 'ROOT_ROLE_CHANGE',
          target: updated.email,
          details: JSON.stringify({ newRole, reason })
        }
      });

      return updated;
    });

    return res.json({ success: true, user });
  } catch (err) {
    console.error('Root role escalator error:', err);
    return res.status(400).json({ success: false, error: err.message || 'Role escalator failed' });
  }
});

app.post('/api/root/database-snapshot', authMiddleware, isRootMiddleware, async (req, res) => {
  try {
    if (!DATABASE_URL) {
      return res.status(400).json({ success: false, error: 'DATABASE_URL is not configured' });
    }

    if (!DATABASE_URL.startsWith('file:')) {
      return res.status(400).json({
        success: false,
        error: 'Database snapshot endpoint only supports SQLite file databases'
      });
    }

    const dbPath = path.resolve(__dirname, DATABASE_URL.replace('file:', ''));
    const snapshotsDir = path.resolve(path.dirname(dbPath), 'snapshots');
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(snapshotsDir, `dev-snapshot-${stamp}.db`);
    fs.copyFileSync(dbPath, snapshotPath);

    await logStaffActivity({
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'ROOT_DATABASE_SNAPSHOT',
      target: snapshotPath,
      details: 'Manual Prisma DB snapshot completed'
    });

    return res.json({ success: true, snapshotPath });
  } catch (err) {
    console.error('Root database snapshot error:', err);
    return res.status(500).json({ success: false, error: 'Snapshot failed' });
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
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
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

app.get('/', (req, res) => {
  res.json({ message: 'Learn Lite API is running' });
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

async function bootstrap() {
  try {
    await seedManagedAdminAccounts(prisma, {
      logger: console,
      showPasswords: NODE_ENV !== 'production'
    });
  } catch (error) {
    console.error('Managed admin seeding failed on startup:', error);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Learn Lite Backend Running`);
    console.log(`📍 Host: 0.0.0.0 (localhost + 127.0.0.1)`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`🔐 CORS Origin: ${FRONTEND_ORIGIN}`);
    console.log(`🗄️  Database: ${DATABASE_URL || 'not configured'}`);
    console.log(`🌐 API: http://localhost:${PORT} | http://127.0.0.1:${PORT}\n`);

    startWeeklyFinancialReportCron(prisma);
  });
}

bootstrap();

module.exports = app;
