# Learn Lite - Full Stack Application

A modern full-stack learning platform built with:
- **Frontend:** React 19 + Vite + React Router
- **Backend:** Express.js + Prisma ORM + SQLite/PostgreSQL
- **Authentication:** JWT Bearer tokens

## Project Structure

```
learn-lite/
│
├── src/                      # React Frontend
│   ├── pages/               # Login, Signup, Home, etc.
│   ├── components/          # Reusable React components
│   ├── context/             # AppContext with theme & state
│   ├── services/            # API client (Axios with interceptors)
│   ├── styles/              # Global CSS (dark/light mode)
│   ├── assets/              # Images, fonts, etc.
│   └── main.jsx             # Entry point
│
├── public/                   # Static files
│
├── server/                   # Express Backend (NEW UNIFIED LOCATION)
│   ├── index.js             # Main server file
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   └── migrations/      # DB migrations
│   ├── .env                 # Environment configuration
│   ├── package.json         # Backend dependencies
│   ├── dev.db               # SQLite database
│   └── README.md            # Server-specific docs
│
├── package.json             # Frontend dependencies
├── vite.config.js          # Vite configuration
├── eslint.config.js        # Linting rules
├── index.html              # HTML entry point
└── README.md               # This file
```

## Quick Start (All-In-One)

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### 1️⃣ Install Frontend Dependencies

```powershell
cd "c:\Users\USER\learn lite\learn-lite"
npm install
```

Expected packages:
- react@19.2.0
- react-dom
- react-router-dom
- axios
- @vitejs/plugin-react
- vite

### 2️⃣ Install Backend Dependencies

```powershell
cd "c:\Users\USER\learn lite\learn-lite\server"
npm install
```

Expected packages:
- express@5.1.0
- @prisma/client@5.6.0
- bcryptjs
- jsonwebtoken
- cors
- helmet
- dotenv
- And more (see server/package.json)

### 3️⃣ Initialize Database

```powershell
cd "c:\Users\USER\learn lite\learn-lite\server"
npx prisma migrate dev --name init
```

This creates:
- SQLite database at `learn-lite/server/dev.db`
- All database tables based on schema.prisma
- Prisma client in node_modules

### 4️⃣ Start Backend Server

In PowerShell Terminal 1:
```powershell
cd "c:\Users\USER\learn lite\learn-lite\server"
npm start
```

Expected output:
```
✅ Learn Lite Backend Running
📍 Port: 4000
🌍 Environment: development
🔐 CORS Origin: http://localhost:5173
🗄️  Database: file:./dev.db
🌐 API: http://localhost:4000
```

### 5️⃣ Start Frontend Development Server

In PowerShell Terminal 2:
```powershell
cd "c:\Users\USER\learn lite\learn-lite"
npm run dev
```

Expected output:
```
VITE v5.x.x ready in XX ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

—

## Full Setup Script (Copy & Paste)

Run this step-by-step in PowerShell:

```powershell
# ========================================
# BACKEND SETUP
# ========================================

# Navigate to server
cd "c:\Users\USER\learn lite\learn-lite\server"

# Install backend dependencies
Write-Host "📦 Installing backend dependencies..."
npm install

# Initialize Prisma database
Write-Host "🗄️  Initializing database..."
npx prisma migrate dev --name init

# ========================================
# FRONTEND SETUP
# ========================================

# Navigate to frontend
cd "c:\Users\USER\learn lite\learn-lite"

# Install frontend dependencies (if not done)
Write-Host "📦 Installing frontend dependencies..."
npm install

# ========================================
# READY TO RUN
# ========================================

Write-Host ""
Write-Host "✅ Setup Complete!"
Write-Host ""
Write-Host "📌 Next Steps:"
Write-Host "  Terminal 1 (Backend):"
Write-Host "    cd 'c:\Users\USER\learn lite\learn-lite\server'"
Write-Host "    npm start"
Write-Host ""
Write-Host "  Terminal 2 (Frontend):"
Write-Host "    cd 'c:\Users\USER\learn lite\learn-lite'"
Write-Host "    npm run dev"
Write-Host ""
Write-Host "🌐 Access:"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Backend:  http://localhost:4000"
Write-Host "  API Docs: http://localhost:4000/api/health"
```

—

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```powershell
cd "c:\Users\USER\learn lite\learn-lite\server"
npm start
```

**Terminal 2 - Frontend:**
```powershell
cd "c:\Users\USER\learn lite\learn-lite"
npm run dev
```

Then open: http://localhost:5173

### Testing the Flow

1. Open http://localhost:5173
2. Click **"Sign Up"**
3. Fill in:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `password123`
4. Click **"Create Account"**
5. You should be logged in and redirected to home page
6. Check browser DevTools → Application → LocalStorage → `learn_lite_token` (should have JWT)

—

## Environment Configuration

### Frontend Environment
Located in: `learn-lite/vite.config.js`
- API Base URL: `http://localhost:4000`
- Token Storage: `localStorage` key: `learn_lite_token`

### Backend Environment
Located in: `learn-lite/server/.env`
```
PORT=4000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=file:./dev.db
JWT_SECRET=your-secret-key
```

Change these values for production.

—

## Common Tasks

### View Database
```powershell
cd "c:\Users\USER\learn lite\learn-lite\server"
npx prisma studio
```
Opens http://localhost:5555

### Reset Database
```powershell
cd "c:\Users\USER\learn lite\learn-lite\server"
npx prisma migrate reset
```

### Create Database Migration
```powershell
cd "c:\Users\USER\learn lite\learn-lite\server"
npx prisma migrate dev --name add_new_feature
```

### View Logs
- **Frontend logs:** DevTools Console (F12)
- **Backend logs:** Terminal running `npm start`

—

## Troubleshooting

### ❌ "Port 4000 already in use"
```powershell
Get-Process node | Stop-Process -Force
npm start  # Try again
```

### ❌ "Network Error" on Signup
1. Check backend is running (should see ✅ message)
2. Check `FRONTEND_ORIGIN` in `.env` is `http://localhost:5173`
3. Check Prisma database is initialized
4. Check no firewall blocking port 4000

### ❌ "Cannot find module '@prisma/client'"
```powershell
cd "c:\Users\USER\learn lite\learn-lite\server"
npm install
npx prisma generate
```

### ❌ "JWT_SECRET must be provided in production"
Make sure `.env` file exists with `JWT_SECRET=your-secret`

—

## API Documentation

### Base URL
`http://localhost:4000`

### Authentication Endpoints
```
POST /api/auth/signup
  Body: { username, email, password }
  Returns: { token, user }

POST /api/auth/login
  Body: { email, password }
  Returns: { token, user }

POST /api/auth/verify
  Headers: Authorization: Bearer <token>
  Returns: { user }
```

### Protected Endpoints (Require Bearer Token)
```
GET /api/profile
  Headers: Authorization: Bearer <token>
  Returns: { user }

PUT /api/profile
  Headers: Authorization: Bearer <token>
  Body: { email?, username?, password? }
  Returns: { user }
```

### Health Check
```
GET /api/health
  Returns: { status, environment, timestamp }
```

—

## File Paths Reference

| File | Location |
|------|----------|
| Frontend App | `learn-lite/src/App.jsx` |
| API Client | `learn-lite/src/services/api.js` |
| Global Styles | `learn-lite/src/styles/global.css` |
| Auth Context | `learn-lite/src/context/AppContext.jsx` |
| Backend Server | `learn-lite/server/index.js` |
| Database Schema | `learn-lite/server/prisma/schema.prisma` |
| Backend Config | `learn-lite/server/.env` |
| Database File | `learn-lite/server/dev.db` |

—

## Next Steps

After getting the app running:

1. **Customize Theme**
   - Edit `learn-lite/src/styles/global.css`
   - CSS variables: `--bg`, `--card`, `--accent`, etc.

2. **Add More Features**
   - Create new routes in `learn-lite/server/index.js`
   - Create new pages in `learn-lite/src/pages/`
   - Update `learn-lite/src/services/api.js` with new endpoints

3. **Deploy to Production**
   - Change `NODE_ENV=production` in `.env`
   - Set `FRONTEND_ORIGIN` to actual domain
   - Use PostgreSQL instead of SQLite
   - Set secure `JWT_SECRET`
   - Deploy backend (Vercel, Heroku, AWS, etc.)
   - Deploy frontend (Vercel, Netlify, etc.)

—

## Support Files

- **Backend README:** `learn-lite/server/README.md`
- **Frontend Config:** `learn-lite/vite.config.js`
- **Prisma Docs:** https://www.prisma.io/docs
- **Express Docs:** https://expressjs.com
- **React Docs:** https://react.dev
- **Vite Docs:** https://vitejs.dev

Enjoy building with Learn Lite! 🚀
