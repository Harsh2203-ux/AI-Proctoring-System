# AI-Powered Secure Online Examination & Proctoring System

Full-stack AI proctoring platform — React SPA + Vercel Serverless API + PostgreSQL (Neon).

---

## Production Architecture

```
              VERCEL
    ┌─────────────────────────┐
    │  React SPA (frontend/)  │  ← https://your-app.vercel.app/
    │                         │
    │  Serverless API (api/)  │  ← https://your-app.vercel.app/api/...
    └────────────┬────────────┘
                 │  SQL
         ┌───────▼────────┐
         │  PostgreSQL    │  ← Neon / Vercel Postgres
         │  (Neon.tech)   │
         └────────────────┘
```

No separate backend server. No MongoDB. No WebSocket server. No Render. No Railway.

---

## Quick Deploy to Vercel

### Step 1 — Create a PostgreSQL database (Neon — free tier)

1. Go to **https://neon.tech** and create a free account.
2. Create a new project (any name).
3. Copy the **connection string** — it looks like:
   ```
   postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 2 — Run database migration

```bash
# From the repository root
npm install
DATABASE_URL="postgres://..." npx ts-node api/db/migrate.ts
DATABASE_URL="postgres://..." npx ts-node api/db/seed.ts
```

This creates all tables and inserts demo accounts.

### Step 3 — Deploy to Vercel

```bash
# Commit and push to GitHub first
git add .
git commit -m "Vercel + PostgreSQL migration"
git push origin main
```

Then in Vercel:
1. **Import** your GitHub repository.
2. Vercel auto-detects `vercel.json` — no framework selection needed.
3. Add **Environment Variables** (see below).
4. Click **Deploy**.

### Step 4 — Set Environment Variables in Vercel

In Vercel → Project → Settings → Environment Variables, add:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@host/db?sslmode=require` | From Neon |
| `JWT_SECRET` | `<32+ random chars>` | `openssl rand -hex 32` |
| `DEMO_MODE` | `true` | Simulated AI proctoring |
| `MAX_UPLOAD_SIZE_MB` | `10` | Max face-enrol image size |
| `ADMIN_EMAIL` | `admin@demo.com` | Demo admin email |
| `ADMIN_PASSWORD` | `Admin@1234` | Demo admin password |
| `STUDENT_EMAIL` | `student@demo.com` | Demo student email |
| `STUDENT_PASSWORD` | `Student@1234` | Demo student password |
| `ADMIN_REGISTRATION_CODE` | `<random secret>` | Required to create admin accounts — `python3 -c "import secrets; print(secrets.token_hex(24))"` |

> **All variables are server-side only.** None are prefixed `VITE_` — they are never exposed to the browser.

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.com` | `Admin@1234` |
| Student | `student@demo.com` | `Student@1234` |

---

## Registration

### Student Registration

Open the app → **Create Account** → **Student Account**.

Required fields: Full Name, Email, Student ID, Password, Confirm Password.

### Administrator Registration

Open the app → **Create Account** → **Administrator Account**.

Required fields: Full Name, Email, Administrator / Employee ID, Password, Confirm Password, **Administrator Registration Code**.

The **Administrator Registration Code** is a server-side secret configured in the environment as `ADMIN_REGISTRATION_CODE`. Anyone attempting to create an admin account must supply this code; the backend validates it using `secrets.compare_digest` before processing the request. The code is **never** sent to or stored in the frontend.

To generate a secure code:
```bash
python3 -c "import secrets; print(secrets.token_hex(24))"
```

Set the result as `ADMIN_REGISTRATION_CODE` in your `.env` (local) or Vercel environment variables (production).

---

## Local Development (FastAPI backend)

The original FastAPI + MongoDB backend is the active local development server.

```bash
# Terminal 1 — Backend (FastAPI on port 8000)
cd backend
source venv/bin/activate
uvicorn app.main:app --port 8000 --reload

# Terminal 2 — Frontend (Vite on port 5173)
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
# /api/* requests are proxied to http://localhost:8000
```

Environment setup:
```bash
cp .env.example .env
# Edit .env: set ADMIN_REGISTRATION_CODE to a secure secret
```

Run integration tests:
```bash
cd backend
ADMIN_REGISTRATION_CODE="<your-code>" python3 test_auth_integration.py
```

### Vercel Local Dev (PostgreSQL backend)

Use `vercel dev` for full local development with the Vercel serverless API:

```bash
# Install Vercel CLI
npm i -g vercel

# Link project (first time)
vercel link

# Create local .env file
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, and ADMIN_REGISTRATION_CODE

# Start local dev server
vercel dev
# Opens at http://localhost:3000
```

---

## API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login → JWT tokens |
| POST | `/api/auth/register/student` | — | Register student |
| POST | `/api/auth/register/admin` | — | Register admin |
| POST | `/api/auth/refresh` | — | Refresh access token |
| GET | `/api/students/profile` | student | Get own profile |
| POST | `/api/students/enrol-face` | student | Enrol face (multipart) |
| GET | `/api/exams` | any | List exams |
| POST | `/api/exams` | admin | Create exam |
| GET | `/api/exams/:id` | any | Get exam |
| PUT | `/api/exams/:id` | admin | Update exam |
| POST | `/api/exams/:id/publish` | admin | Publish exam |
| DELETE | `/api/exams/:id` | admin | Delete exam |
| POST | `/api/exams/:id/students` | admin | Assign students |
| DELETE | `/api/exams/:id/students/:uid` | admin | Remove student |
| GET | `/api/exams/:id/questions` | any | List questions |
| POST | `/api/exams/:id/questions` | admin | Add question |
| PUT | `/api/exams/:id/questions/:qid` | admin | Update question |
| DELETE | `/api/exams/:id/questions/:qid` | admin | Delete question |
| POST | `/api/attempts` | student | Start attempt |
| GET | `/api/attempts/:id` | any | Get attempt |
| PUT | `/api/attempts/:id/answers` | student | Save answers |
| GET | `/api/attempts/:id/answers` | any | Get saved answers |
| POST | `/api/attempts/:id/submit` | student | Submit attempt |
| POST | `/api/proctoring/events` | student | Send frame/audio event |
| POST | `/api/proctoring/heartbeat` | student | Heartbeat + get state |
| GET | `/api/proctoring/session/:id` | admin/student | Get session state |
| GET | `/api/admin/dashboard/stats` | admin | Dashboard statistics |
| GET | `/api/admin/dashboard/violations-chart` | admin | Violations chart |
| GET | `/api/admin/students` | admin | List students |
| GET | `/api/admin/students/:id` | admin | Student detail |
| GET | `/api/admin/sessions` | admin | List proctoring sessions |
| GET | `/api/admin/sessions/:id` | admin | Session detail |
| GET | `/api/admin/violations` | admin | List violations |
| PUT | `/api/admin/violations/:id/review` | admin | Review violation |
| GET | `/api/admin/reports` | admin | List reports |
| GET | `/api/admin/reports/:id` | admin | Report detail |
| GET | `/api/admin/disqualifications` | admin | List disqualifications |
| GET | `/api/health` | — | Health check |

---

## PostgreSQL Schema

13 tables: `users`, `student_profiles`, `admin_profiles`, `exams`, `questions`,
`exam_attempts`, `answers`, `proctoring_sessions`, `proctoring_events`,
`violations`, `disqualifications`, `proctoring_reports`, `evidence`.

Full DDL: [`api/db/schema.sql`](api/db/schema.sql)

---

## Proctoring Architecture

The original WebSocket-based real-time proctoring has been replaced with
HTTP-based polling compatible with Vercel serverless:

| Old (WebSocket) | New (HTTP) |
|---|---|
| `ws://backend/ws/proctoring/:session` | `POST /api/proctoring/events` |
| Continuous frame stream | 1fps frame capture → batch POST |
| Server push of warnings/state | `POST /api/proctoring/heartbeat` every 3s |
| Python AI service (port 8001) | Demo AI logic runs inline in serverless function |

**Demo Mode** (`DEMO_MODE=true`): AI analysis returns realistic simulated results
with face detection, pose estimation, gaze analysis, and violation detection —
no real ML models required.

---

## Local FastAPI Backend

The original FastAPI + MongoDB backend lives in `backend/` and is the **active local development backend**. See [Local Development (FastAPI backend)](#local-development-fastapi-backend) above.

The `backend/` directory is not used by the Vercel production deployment — Vercel uses the `api/` serverless functions instead.

---

## Security Notes

- Passwords are bcrypt-hashed (cost 12)
- JWT access tokens expire in 60 minutes; refresh tokens expire in 7 days
- Role authorization enforced server-side on every protected endpoint
- Admin registration requires a server-side `ADMIN_REGISTRATION_CODE` validated with `secrets.compare_digest` — prevents public admin sign-ups
- No secrets exposed to frontend JavaScript (no `VITE_`-prefixed secrets)
- `DATABASE_URL`, `JWT_SECRET`, and `ADMIN_REGISTRATION_CODE` are server-side only
- Auth state uses `sessionStorage` (per-tab isolation) — each browser tab maintains its own independent session
