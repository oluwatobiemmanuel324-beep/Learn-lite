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
const { PrismaClient } = require('@prisma/client');

// ========================================
// CONFIGURATION
// ========================================

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

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

app.use(express.json({ limit: '10mb', strict: false }));
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

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
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

// Signup: POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Username or email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword }
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
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

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
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
      select: { id: true, username: true, email: true, fuelBalance: true }
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found in database. Please sign up again.',
        code: 'USER_NOT_FOUND'
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
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    if (req.userFuel == null || req.userFuel <= 0) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient Fuel'
      });
    }

    // Deduct 1 fuel
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { fuelBalance: { decrement: 1 } },
      select: { fuelBalance: true }
    });

    // TODO: Integrate with HeyGen API or similar video generation service
    // For now, return a mock video URL
    const mockVideoUrl = `https://example.com/videos/generated-${Date.now()}.mp4`;

    res.json({
      success: true,
      message: 'Video generation started',
      videoUrl: mockVideoUrl,
      fuelRemaining: user.fuelBalance,
      prompt: prompt.substring(0, 100) // Echo back first 100 chars
    });
  } catch (err) {
    console.error('Video generation error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
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
// PROFILE ENDPOINTS (Protected)
// ========================================

app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, email: true, fuelBalance: true, createdAt: true }
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

  // Check if user email is admin email from request (fetch user to verify)
  next(); // Will verify in the route itself
}

// Get all users: GET /api/admin/users
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Verify user is admin
    const adminUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true }
    });

    if (!adminUser || adminUser.email !== 'oluwatobiemmanuel324@gmail.com') {
      return res.status(403).json({ 
        success: false, 
        error: 'Forbidden: Admin access required',
        email: adminUser?.email
      });
    }

    // Get all users
    const users = await prisma.user.findMany({
      select: { 
        id: true, 
        username: true, 
        email: true, 
        fuelBalance: true, 
        createdAt: true 
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

// Add fuel to user: POST /api/admin/users/:userId/add-fuel
app.post('/api/admin/users/:userId/add-fuel', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Verify user is admin
    const adminUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true }
    });

    if (!adminUser || adminUser.email !== 'oluwatobiemmanuel324@gmail.com') {
      return res.status(403).json({ 
        success: false, 
        error: 'Forbidden: Admin access required'
      });
    }

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

    console.log(`✅ Admin ${adminUser.email} added 50 fuel to user ${updatedUser.username}`);

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

app.listen(PORT, () => {
  console.log(`\n✅ Learn Lite Backend Running`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`🔐 CORS Origin: ${FRONTEND_ORIGIN}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL || 'file:./dev.db'}`);
  console.log(`🌐 API: http://localhost:${PORT}\n`);
});

module.exports = app;
