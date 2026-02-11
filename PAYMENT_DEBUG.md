# Payment Debugging Guide

## Issue: 400 Error When Clicking "Buy Fuel"

### Step 1: Check Backend Console Logs
When you click "Buy Fuel", watch your **backend terminal** for these messages:

```
💳 Payment initialization for user: 1
```

**What to look for:**
- ✅ If you see this message, the request reached the backend
- ❌ If you don't see it, check if the backend is actually running and CORS is enabled

### Step 2: Check Paystack Configuration Status
You should see one of these at startup:

```
🔐 Paystack Public Key: ✓ Configured
🔐 Paystack Secret Key: ✓ Configured
```

**If they show "✗ Not configured":**
1. Open `server/.env`
2. Add your Paystack keys from https://dashboard.paystack.com/#/settings/developer
3. Restart the backend with `npm start`

### Step 3: Check Frontend Network Tab
Open DevTools → Network tab → Click "Buy Fuel"

Look for the request to `http://localhost:4000/api/payments/initialize`

**Response Body Examples:**

#### ✅ Success (200):
```json
{
  "success": true,
  "publicKey": "pk_test_...",
  "email": "user@example.com",
  "amount": 50000,
  "fuelAmount": 100,
  "reference": "ref_1_1707...",
  "configStatus": {
    "publicKeyConfigured": true,
    "secretKeyConfigured": true
  }
}
```

#### ❌ PAYSTACK_PUBLIC_KEY Missing (500):
```json
{
  "success": false,
  "error": "Payment service not configured",
  "details": "PAYSTACK_PUBLIC_KEY is missing from environment variables",
  "configStatus": {
    "publicKeyConfigured": false,
    "secretKeyConfigured": false
  }
}
```

#### ❌ User Not Found (404):
```json
{
  "success": false,
  "error": "User not found",
  "details": "No user found with ID 999"
}
```

#### ❌ User Has No Email (400):
```json
{
  "success": false,
  "error": "User email is required for payment",
  "details": "Your account does not have an associated email address"
}
```

### Step 4: Check Frontend Console
Open DevTools → Console tab

You should see logs like:
```javascript
📤 Sending payment initialization request...
✓ Payment initialized: {
  publicKey: "pk_test_...",
  email: "user@example.com",
  amount: 50000,
  reference: "ref_1_..."
}
```

Or error logs:
```javascript
❌ Payment initialization error: Error: Request failed with status code 500
```

### Step 5: Backend Logs for Verification
When completing a payment, you should see:
```
🔄 Payment verification initiated for user: 1
✓ Verifying reference: ref_1_170707...
✅ Payment verified! User john_doe now has 100 fuel
```

## Common Issues & Solutions

### Issue: PAYSTACK_PUBLIC_KEY Missing
**Error:** `success: false, error: "Payment service not configured"`
**Solution:**
```bash
# 1. Copy the example file
cp server/.env.example server/.env

# 2. Add your Paystack keys:
# Get them from: https://dashboard.paystack.com/#/settings/developer
PAYSTACK_PUBLIC_KEY=pk_test_your_key_here
PAYSTACK_SECRET_KEY=sk_test_your_key_here

# 3. Restart the backend
npm start
```

### Issue: User's Email is Null
**Error:** `error: "User email is required for payment"`
**Solution:**
You need to sign up with a valid email address or update your profile

### Issue: CORS Error
**Error:** Browser shows CORS error in console
**Solution:**
1. Auto-handled by the backend config
2. Verify `FRONTEND_ORIGIN=http://localhost:5173` in `.env`
3. Restart backend

### Issue: Request Hangs
**Solution:**
1. Check if backend is running: `npm start` in server directory
2. Verify port is 4000: `PORT=4000`
3. Check firewall isn't blocking port 4000

## Testing Payment Flow

1. **Sign up** with a valid email
2. **Go to Video Generator** page
3. **Check fuel display** (should show 0 initially)
4. **Click "Buy Fuel"** and check console logs
5. **Watch for errors** in both frontend and backend console
6. **Verify payment** initialization details in Network tab

## Debug Mode: Enable Verbose Logging

In `server/index.js`, the payment routes already have detailed logging:
- 💳 Payment initialization
- 🔄 Payment verification
- ✅ Success
- ❌ Errors with details

Just watch your backend console!
