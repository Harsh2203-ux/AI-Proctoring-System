# AI-Powered Secure Online Examination & Proctoring System

A full-stack AI proctoring platform for online examinations.  
Real-time face monitoring, violation detection, warning system, and detailed reporting.

---

## Architecture

```
┌─────────────────┐     HTTP/WS      ┌─────────────────┐     HTTP      ┌─────────────────┐
│   Frontend      │ ◄──────────────► │   Backend       │ ◄──────────► │   AI Service    │
│   React/Vite    │                  │   FastAPI       │               │   FastAPI       │
│   Port 5173     │                  │   Port 8000     │               │   Port 8001     │
└─────────────────┘                  └────────┬────────┘               └─────────────────┘
                                              │
                                         Motor (async)
                                              │
                                     ┌────────▼────────┐
                                     │    MongoDB       │
                                     │   Port 27017     │
                                     └─────────────────┘
```

---

## Prerequisites

- Python 3.9+
- Node.js 18+
- MongoDB 6+ running on `localhost:27017`
- macOS/Linux (Windows via WSL)

---

## Quick Start

### 1. Start MongoDB

MongoDB must be running on `localhost:27017`.

```bash
# macOS (Homebrew)
brew services start mongodb-community

# or run directly
mongod --dbpath /data/db
```

Verify: `mongosh` → `db.runCommand({ping: 1})` should return `{ ok: 1 }`

---

### 2. Environment Configuration

The root `.env` file is pre-configured for local development. Key settings:

```bash
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=proctoring_db
AI_SERVICE_URL=http://localhost:8001
DEMO_MODE=true
EVIDENCE_STORAGE_PATH=./evidence

# Demo seed credentials (auto-created on first start)
ADMIN_EMAIL=admin@demo.com
ADMIN_PASSWORD=Admin@1234
STUDENT_EMAIL=student@demo.com
STUDENT_PASSWORD=Student@1234
```

---

### 3. Start the AI Service

```bash
cd ai
source venv/bin/activate   # or: python -m venv venv && source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Verify: `curl http://localhost:8001/health`  
Expected: `{"status":"ok","demo_mode":true,"mode_label":"DEMO"}`

---

### 4. Start the Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

On first start, the backend automatically:
- Creates all MongoDB indexes (including unique constraints)
- Creates admin and student demo accounts (or refreshes password hashes if they already exist)
- Creates admin and student profiles
- Seeds a sample exam with 8 questions

Verify: `curl http://localhost:8000/health`  
Expected: `{"status":"ok","demo_mode":true,"version":"1.0.0"}`

---

### 5. Start the Frontend

```bash
cd frontend
npm install   # (node_modules already present)
npm run dev
```

Open: http://localhost:5173

---

## Demo Accounts

These accounts are created automatically on first backend start and their password hashes are refreshed on every restart.

| Role    | Email              | Password      | Notes                        |
|---------|-------------------|---------------|------------------------------|
| Admin   | admin@demo.com    | Admin@1234    | Access to admin dashboard    |
| Student | student@demo.com  | Student@1234  | Access to student dashboard  |

Click the **Admin** or **Student** tile on the Login page to auto-fill credentials.

---

## Authentication Architecture

### Login Flow

1. User submits email + password to `POST /api/auth/login`
2. Backend looks up user by email (case-insensitive), verifies bcrypt hash
3. Backend returns JWT access token + refresh token
4. **Role is determined entirely server-side** from the database record
5. Frontend stores token in `localStorage` and routes to the role-appropriate dashboard

### Student Registration

```
POST /api/auth/register/student
{
  "full_name": "Jane Smith",
  "email": "jane@university.edu",
  "student_id": "STU2024001",
  "password": "MyP@ssword1",
  "confirm_password": "MyP@ssword1"
}
```

**Validation:**
- Full name: at least 2 characters
- Email: valid format, must be unique
- Student ID: required, must be unique
- Password: min 8 chars, must include uppercase, lowercase, digit, and special character (`@$!%*?&^#_-`)
- Passwords must match

### Administrator Registration

```
POST /api/auth/register/admin
{
  "full_name": "Dr. John Doe",
  "email": "admin@institution.edu",
  "admin_id": "ADM2024001",
  "password": "Admin@Pass1",
  "confirm_password": "Admin@Pass1"
}
```

### Authorization

All protected routes use `Authorization: Bearer <token>` JWT headers.  
Role-based access control is enforced server-side:

- `require_admin` dependency: returns HTTP 403 if the authenticated user is not an admin
- `require_student` dependency: returns HTTP 403 if the authenticated user is not a student
- Client-side role selection (if any) only affects UX — **never authorization**

---

## Registration Flow (UI)

```
/register
  ↓
Choose account type
  ├── Student Account  →  Student form (Full Name, Email, Student ID, Password, Confirm)
  └── Administrator    →  Admin form   (Full Name, Email, Admin ID, Password, Confirm)
  ↓
Successful creation
  ↓
Redirect to /login
```

---

## Application Flow

### Student Workflow
1. Log in at http://localhost:5173
2. Go to **Face Enrolment** → capture webcam photo
3. Return to dashboard → click **Start Exam** on the active exam
4. **Readiness Check** verifies camera, mic, and exam status
5. **Exam Interface**: answer questions while being monitored
6. Proctoring sidebar shows live face count, identity, and warnings
7. Submit exam when done

### Admin Workflow
1. Log in as admin → redirected to **Dashboard**
2. View **Active Sessions** to see live exam sessions
3. Check **Violations** for flagged events
4. Review **Reports** for detailed proctoring analysis
5. Manage **Exams** to create/edit/publish exams

---

## DEMO MODE

When `DEMO_MODE=true`:

- AI analyses return **realistic synthetic data** — clearly labelled `demo: true`
- No real models are downloaded or loaded
- Simulated detections occur at realistic rates:
  - Face absent: ~5% of frames
  - Multiple faces: ~3% of frames  
  - Prohibited objects: ~4% of frames
  - Suspicious speech: varies by transcript
  - Multiple speakers: ~5% of audio chunks
- All violations, warnings, and reports function exactly as in real mode
- The **exam UI shows a "DEMO MODE" banner** — students/admins can distinguish simulated from real

---

## Real AI Mode

Set `DEMO_MODE=false` in `.env` and install full dependencies:

```bash
cd ai
pip install -r requirements-full.txt
```

Required for real AI mode:
```
WHISPER_MODEL_SIZE=base          # tiny/base/small/medium/large
YOLO_MODEL_PATH=                 # empty = auto-download yolov8n.pt
PYANNOTE_AUTH_TOKEN=hf_...       # HuggingFace token for pyannote
```

Real AI providers:
- **Face detection/verification**: OpenCV + face_recognition (dlib)
- **Head pose + gaze**: OpenCV solvePnP + landmark estimation
- **Object detection**: YOLOv8 (ultralytics)
- **Speech-to-text**: OpenAI Whisper
- **Speaker analysis**: pyannote.audio

All providers are modular — see [`ai/app/providers/`](ai/app/providers/).

---

## Docker

```bash
# Full stack with Docker Compose
docker-compose up --build
```

Services: `mongo`, `ai-service` (port 8001), `backend` (port 8000), `frontend` (port 3000).

---

## API Endpoints

### Authentication
- `POST /api/auth/login` — login → JWT tokens
- `POST /api/auth/register/student` — register new student account
- `POST /api/auth/register/admin` — register new admin account
- `POST /api/auth/register` — legacy student registration (kept for compatibility)
- `POST /api/auth/refresh` — refresh access token

### Student
- `GET /api/students/profile` — get student profile
- `POST /api/students/enrol-face` — enrol face (multipart)

### Exams
- `GET /api/exams` — list available exams
- `GET /api/exams/{id}` — get exam details
- `GET /api/exams/{id}/questions` — get questions
- `POST /api/exams` (admin) — create exam
- `POST /api/exams/{id}/publish` (admin) — publish exam
- `POST /api/exams/{id}/students` (admin) — assign students

### Attempts
- `POST /api/attempts` — start attempt
- `GET /api/attempts/{id}` — get attempt
- `PUT /api/attempts/{id}/answers` — save answers
- `POST /api/attempts/{id}/submit` — submit exam

### Proctoring (WebSocket)
- `WS /ws/proctoring/{session_id}?token=...` — real-time proctoring

### Admin
- `GET /api/admin/dashboard/stats` — dashboard statistics
- `GET /api/admin/sessions` — all sessions
- `GET /api/admin/violations` — all violations
- `GET /api/admin/reports/{session_id}` — proctoring report
- `GET /api/admin/reports/{session_id}/pdf` — PDF report download

---

## Database Collections

| Collection           | Purpose                                  |
|---------------------|------------------------------------------|
| `users`             | User accounts (admin/student)            |
| `student_profiles`  | Student profiles + face encoding         |
| `admin_profiles`    | Admin profiles + admin ID                |
| `exams`             | Exam definitions + proctoring config     |
| `questions`         | Exam questions                           |
| `exam_attempts`     | Student exam attempts                    |
| `answers`           | Student answers per question             |
| `proctoring_sessions` | Per-session proctoring state           |
| `proctoring_events` | Raw AI detection events                  |
| `violations`        | Confirmed violations                     |
| `warnings`          | Issued warnings                          |
| `evidence`          | Screenshot/audio evidence metadata       |
| `disqualifications` | Disqualification records                 |
| `proctoring_reports`| Final proctoring reports                 |

### Unique Indexes
- `users.email` — no duplicate email addresses
- `student_profiles.student_id` — no duplicate student IDs
- `admin_profiles.admin_id` — no duplicate admin IDs

---

## Environment Variables Reference

| Variable                   | Default                     | Description                                    |
|---------------------------|----------------------------|------------------------------------------------|
| `MONGO_URI`               | `mongodb://localhost:27017` | MongoDB connection string                      |
| `MONGO_DB_NAME`           | `proctoring_db`             | Database name                                  |
| `JWT_SECRET`              | `change-this-jwt-secret`    | **Change this in production**                  |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `60`             | Access token lifetime                          |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS`   | `7`              | Refresh token lifetime                         |
| `CORS_ORIGINS`            | `http://localhost:5173,...` | Allowed frontend origins                       |
| `ADMIN_EMAIL`             | `admin@demo.com`            | Demo admin email                               |
| `ADMIN_PASSWORD`          | `Admin@1234`                | Demo admin password                            |
| `STUDENT_EMAIL`           | `student@demo.com`          | Demo student email                             |
| `STUDENT_PASSWORD`        | `Student@1234`              | Demo student password                          |
| `DEMO_MODE`               | `true`                      | Use simulated AI responses                     |
| `AI_SERVICE_URL`          | `http://localhost:8001`     | AI service URL                                 |
| `EVIDENCE_STORAGE_PATH`   | `./evidence`                | Where to store proctoring evidence files       |

---

## Troubleshooting

### Backend won't start
- Check MongoDB is running: `lsof -i :27017`
- Check `.env` has `MONGO_URI=mongodb://localhost:27017` (not `mongo:27017`)
- Check `EVIDENCE_STORAGE_PATH=./evidence` (not `/app/evidence`)

### Login fails
- The backend automatically refreshes password hashes on every restart — if you changed `ADMIN_PASSWORD` in `.env`, restart the backend
- Test via curl: `curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@demo.com","password":"Admin@1234"}'`

### "Attempt already submitted" on test
```python
from pymongo import MongoClient
db = MongoClient('mongodb://localhost:27017')['proctoring_db']
db.exam_attempts.update_many({}, {'$set': {'status': 'in_progress', 'submitted_at': None}})
```

### bcrypt passlib error
The project uses `bcrypt` directly (bypasses passlib) due to bcrypt 5.x API change.  
See [`security.py`](backend/app/core/security.py).

### AI service not reachable
Check `AI_SERVICE_URL=http://localhost:8001` in `.env` (not `ai-service:8001`)

### Frontend build warning (chunk size)
The ~760KB JS bundle warning is expected — no functionality is affected.

---

## Testing

```bash
# Test auth endpoints directly
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin@1234"}'

# Build frontend (zero TypeScript errors expected)
cd frontend && npm run build

# Backend Python checks
cd backend && source venv/bin/activate
python -m py_compile app/api/auth.py app/models/user.py app/core/config.py app/db/seed.py
```

---

## Requirement Audit

See [`docs/REQUIREMENT-AUDIT.md`](docs/REQUIREMENT-AUDIT.md) for the full requirement compliance audit.

**Summary: 14/15 requirements COMPLETE, 1 PARTIAL (evidence storage — functional but filesystem-only)**
