# Learn Lite Backend Server

Express.js + Prisma ORM backend for Learn Lite full-stack application.

## Project Structure

```
learn-lite/
├── src/                    # React frontend (Vite)
├── public/                 # Static assets
├── package.json            # Frontend dependencies
├── vite.config.js          # Vite configuration
│
└── server/                 # Express backend (NEW)
    ├── node_modules/       # Backend dependencies
    ├── prisma/
    │   ├── schema.prisma   # Database schema
    │   └── migrations/     # Database migrations
    ├── dev.db              # SQLite database (local development)
    ├── index.js            # Main server file
    ├── .env                # Environment configuration
    ├── .gitignore          # Git ignores for server
    └── package.json        # Backend dependencies
```

## Quick Start

### 1. Install Dependencies

```powershell
cd c:\Users\USER\learn lite\learn-lite\server
npm install
```

### 2. Initialize Database

```powershell
npx prisma migrate dev --name init
```

This will:
- Create the SQLite database at `learn-lite/server/dev.db`
- Run all migrations
- Generate the Prisma client

### 3. Start the Server

```powershell
npm start
```

You should see:
```
✅ Learn Lite Backend Running
📍 Port: 4000
🌍 Environment: development
🔐 CORS Origin: http://localhost:5173
🗄️  Database: file:./dev.db
🌐 API: http://localhost:4000
```

—

## Complete Setup Commands

Run these commands in PowerShell:

```powershell
# Navigate to server folder
cd "c:\Users\USER\learn lite\learn-lite\server"

# Install dependencies
npm install

# Initialize Prisma database
npx prisma migrate dev --name init

# Start the server
npm start
```

Server will run on: **http://localhost:4000**

—

## Running Both Frontend & Backend

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

Frontend will be at: **http://localhost:5173**
Backend API: **http://localhost:4000**

—

## Environment Configuration

Edit `.env` to change:
- `PORT` - Server port (default: 4000)
- `NODE_ENV` - development or production
- `FRONTEND_ORIGIN` - Frontend URL for CORS
- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - Secret key for JWT tokens

—

## Available Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Sign in with email/password
- `POST /api/auth/verify` - Verify JWT token validity

### Profile (Protected)
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile

### Health
- `GET /api/health` - Server status check

—

## Database Operations

### View Database
```powershell
npx prisma studio
```
Opens web GUI at http://localhost:5555

### Create New Migration
```powershell
npx prisma migrate dev --name migration_name
```

### Reset Database (dev only!)
```powershell
npx prisma migrate reset
```

—

## Troubleshooting

**Port 4000 already in use:**
```powershell
# Kill existing Node process
Get-Process node | Stop-Process -Force

# Or use different port
$env:PORT=4001
npm start
```

**Database locked error:**
```powershell
# Delete the database and migrate again
Remove-Item dev.db -Force
npx prisma migrate dev --name init
```

**JWT_SECRET missing warning:**
Check that `.env` file exists in `learn-lite/server/` with `JWT_SECRET` set.

—

## Security Notes

⚠️ **For Production:**
- Set `JWT_SECRET` to a secure random value
- Use PostgreSQL instead of SQLite
- Set `NODE_ENV=production`
- Configure proper `FRONTEND_ORIGIN` whitelist
- Use HTTPS instead of HTTP
- Store `.env` securely (never commit to git)

