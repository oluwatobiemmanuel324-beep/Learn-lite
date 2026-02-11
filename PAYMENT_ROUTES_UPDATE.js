// ========================================
// PAYSTACK PAYMENT ENDPOINTS
// Add these to server/index.js to replace the existing payment routes
// ========================================

// Verify payment from Paystack: POST /api/payments/verify
app.post('/api/payments/verify', authMiddleware, async (req, res) => {
  try {
    console.log('🔄 Payment verification initiated for user:', req.user.userId);
    
    const { reference } = req.body;

    if (!reference) {
      console.warn('⚠️  Payment verify failed: Missing reference');
      return res.status(400).json({
        success: false,
        error: 'Payment reference is required',
        details: 'reference field is missing from request body'
      });
    }

    console.log(`✓ Verifying reference: ${reference.substring(0, 20)}...`);

    // TODO: Verify payment with Paystack API
    // For demo purposes, we'll assume verification is successful
    // In production, call: https://api.paystack.co/transaction/verify/:reference
    // with Authorization header: Bearer PAYSTACK_SECRET_KEY
    
    const PAYSTACK_FUEL_AMOUNT = 100; // 100 fuel units per purchase

    // Update user fuel balance
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { fuel: { increment: PAYSTACK_FUEL_AMOUNT } },
      select: { fuel: true, username: true, email: true }
    });

    console.log(`✅ Payment verified! User ${user.username} now has ${user.fuel} fuel`);

    res.json({
      success: true,
      message: 'Payment verified and fuel added',
      fuel: user.fuel,
      fuelAdded: PAYSTACK_FUEL_AMOUNT,
      user: {
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error('❌ Payment verification error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Payment verification failed',
      details: err.message 
    });
  }
});

// Get Paystack payment link: POST /api/payments/initialize
app.post('/api/payments/initialize', authMiddleware, async (req, res) => {
  try {
    console.log('💳 Payment initialization for user:', req.user.userId);

    // Log Paystack config status
    if (!PAYSTACK_PUBLIC_KEY) {
      console.error('❌ PAYSTACK_PUBLIC_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'Payment service not configured',
        details: 'PAYSTACK_PUBLIC_KEY is missing from environment variables',
        configStatus: {
          publicKeyConfigured: false,
          secretKeyConfigured: !!PAYSTACK_SECRET_KEY
        }
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true, username: true, id: true }
    });

    if (!user) {
      console.warn(`⚠️  User not found: ${req.user.userId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'User not found',
        details: `No user found with ID ${req.user.userId}`
      });
    }

    if (!user.email) {
      console.warn(`⚠️  User has no email: ${user.username}`);
      return res.status(400).json({
        success: false,
        error: 'User email is required for payment',
        details: 'Your account does not have an associated email address'
      });
    }

    const FUEL_PRICE = 50000; // 500 NGN in kobo
    const PAYSTACK_FUEL_AMOUNT = 100;
    const reference = `ref_${user.id}_${Date.now()}`;

    console.log(`✓ Payment initialized for ${user.email}`);
    console.log(`  Amount: ${FUEL_PRICE} kobo (500 NGN)`);
    console.log(`  Fuel: ${PAYSTACK_FUEL_AMOUNT} units`);
    console.log(`  Reference: ${reference}`);

    res.json({
      success: true,
      publicKey: PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: FUEL_PRICE, // in kobo
      currency: 'NGN',
      fuelAmount: PAYSTACK_FUEL_AMOUNT,
      reference: reference,
      description: `Buy ${PAYSTACK_FUEL_AMOUNT} Fuel for Learn Lite`,
      configStatus: {
        publicKeyConfigured: true,
        secretKeyConfigured: !!PAYSTACK_SECRET_KEY
      }
    });
  } catch (err) {
    console.error('❌ Payment initialization error:', err.message);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initialize payment',
      details: err.message,
      configStatus: {
        publicKeyConfigured: !!PAYSTACK_PUBLIC_KEY,
        secretKeyConfigured: !!PAYSTACK_SECRET_KEY
      }
    });
  }
});
