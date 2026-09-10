# AI-Powered Secure Online Examination & Proctoring System — Implementation Plan

## Top-Level Overview

**Goal:** Build a production-quality, AI-powered online examination monitoring and proctoring system that authenticates students, continuously monitors examination sessions via camera and microphone, detects suspicious activities, manages violations with evidence, and produces detailed proctoring reports for administrators.

**Scope:** Greenfield project. Every file is to be created from scratch.

**Approach:** Layered monorepo under `AI-Proctoring-System/` with three independently runnable services (frontend, backend, ai-service) orchestrated via Docker Compose. A modular AI provider pattern allows real models and a clearly labelled Demo Mode to coexist.

**Non-Goals:**
- Project 2 or Project 3 of the hackathon
- Native mobile applications
- Third-party proctoring SaaS integration (Honorlock, ProctorU, etc.)
- Live video streaming to the administrator during an exam (screenshots/events only)

---

## Architecture Overview

```
Browser (React + TypeScript + Vite + Tailwind)
    │  WebSocket (proctoring events)
    │  REST (auth, exam, evidence)
    ▼
FastAPI Backend (Python)
    │  Internal HTTP
    ▼
AI Service (Python FastAPI)          MongoDB
    │  (face, pose, gaze,            (all persistent data)
    │   objects, speech, speaker)
    ▼
AI Models / Demo Mode provider
```

### Processing Split

| Concern | Where |
|---|---|
| Camera frame capture | Browser (MediaDevices API) |
| Audio capture | Browser (MediaRecorder API) |
| Frame pre-resize (720p → 480p) | Browser (Canvas API) |
| Frame transmission | WebSocket or periodic POST to backend |
| AI inference (face, pose, gaze, objects) | AI Service (Python) |
| Speech-to-text | AI Service (Whisper / Demo) |
| Speaker diarisation | AI Service (pyannote / Demo) |
| Violation rule evaluation | Backend |
| Warning / disqualification logic | Backend |
| Evidence storage | Backend → local volume / S3-compatible |
| Proctoring report generation | Backend |
| Admin dashboard data | Backend REST |

---

## Sub-Tasks

---

### Sub-Task 1 — Repository Scaffold & Infrastructure

**Intent:** Create the monorepo skeleton, Docker Compose configuration, and environment variable templates. This must be done first so every subsequent sub-task has a place to land and can run in isolation.

**Expected Outcomes:**
- `AI-Proctoring-System/` directory tree exists with `frontend/`, `backend/`, `ai/`, `tests/`, `docs/` subdirectories.
- `docker-compose.yml` can bring up MongoDB, backend, AI service, and frontend containers.
- `.env.example` documents every required environment variable.
- `README.md` explains how to start the project locally with and without Docker.
- `AGENTS.md` documents the agent/AI conventions for this codebase.

**Todo List:**
1. Create top-level directory structure.
2. Write `docker-compose.yml` with services: `mongo`, `backend`, `ai-service`, `frontend`.
3. Write `.env.example` covering: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRY`, `AI_SERVICE_URL`, `DEMO_MODE`, `CORS_ORIGINS`, `EVIDENCE_STORAGE_PATH`, `MAX_UPLOAD_SIZE_MB`.
4. Write `README.md` with local dev instructions, Docker instructions, and environment variable reference.
5. Write `AGENTS.md` describing the AI provider interface contract and Demo Mode toggle.

**Relevant Context:** Workspace is empty. No existing conventions to inherit.

**Status:** [ ] pending

---

### Sub-Task 2 — Database Schema Design (MongoDB)

**Intent:** Define all MongoDB collections, their schemas, indexes, and lifecycle rules. Getting this right early prevents costly migrations later.

**Expected Outcomes:**
- A `docs/database-schema.md` document describing every collection.
- Pydantic models in `backend/app/models/` that match the schema.
- Index definitions ready for the backend startup routine.

**Collections and Key Fields:**

#### `users`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `email` | string | unique index |
| `password_hash` | string | bcrypt |
| `role` | enum: `student`, `admin` | index |
| `is_active` | bool | |
| `created_at` | datetime | |
| `updated_at` | datetime | |

#### `student_profiles`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `user_id` | ObjectId | ref users, unique |
| `full_name` | string | |
| `student_id` | string | unique |
| `face_encoding` | array[float] | 128-dim FaceNet/dlib vector |
| `face_image_path` | string | stored at enrolment |
| `enrolled_at` | datetime | |

#### `exams`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `title` | string | |
| `description` | string | |
| `created_by` | ObjectId | ref users (admin) |
| `duration_minutes` | int | |
| `start_time` | datetime | scheduled window open |
| `end_time` | datetime | scheduled window close |
| `allowed_students` | array[ObjectId] | ref users |
| `status` | enum: `draft`, `scheduled`, `active`, `completed` | |
| `proctoring_config` | object | thresholds, severity weights |
| `created_at` | datetime | |

#### `questions`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `exam_id` | ObjectId | ref exams, index |
| `order` | int | |
| `type` | enum: `mcq`, `short_answer`, `long_answer` | |
| `text` | string | |
| `options` | array[string] | MCQ only |
| `correct_answer` | string | hidden from student API |
| `marks` | int | |

#### `exam_attempts`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `exam_id` | ObjectId | ref exams |
| `student_id` | ObjectId | ref users |
| `status` | enum: `not_started`, `in_progress`, `submitted`, `disqualified` | |
| `started_at` | datetime | |
| `submitted_at` | datetime | |
| `time_remaining_seconds` | int | updated on autosave |
| `final_score` | float | nullable until graded |
| compound index: `(exam_id, student_id)` unique | | |

#### `answers`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `attempt_id` | ObjectId | ref exam_attempts, index |
| `question_id` | ObjectId | ref questions |
| `response` | string | |
| `saved_at` | datetime | |
| `is_final` | bool | false until submission |

#### `proctoring_sessions`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `attempt_id` | ObjectId | ref exam_attempts, unique |
| `student_id` | ObjectId | ref users |
| `exam_id` | ObjectId | ref exams |
| `identity_verified` | bool | |
| `identity_confidence` | float | |
| `status` | enum: `active`, `paused`, `ended` | |
| `warning_count` | int | default 0 |
| `is_disqualified` | bool | default false |
| `disqualification_reason` | string | nullable |
| `started_at` | datetime | |
| `ended_at` | datetime | |

#### `proctoring_events`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `session_id` | ObjectId | ref proctoring_sessions, index |
| `student_id` | ObjectId | |
| `event_type` | enum (see below) | index |
| `raw_payload` | object | raw AI output |
| `confidence` | float | |
| `timestamp` | datetime | index |
| `frame_path` | string | nullable screenshot |

Event types: `face_absent`, `multiple_faces`, `identity_mismatch`, `head_pose_violation`, `gaze_violation`, `object_detected`, `additional_person`, `suspicious_speech`, `multiple_speakers`, `background_conversation`.

#### `violations`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `session_id` | ObjectId | ref proctoring_sessions, index |
| `student_id` | ObjectId | |
| `exam_id` | ObjectId | |
| `event_id` | ObjectId | ref proctoring_events |
| `violation_type` | string | |
| `severity` | enum: `low`, `medium`, `high`, `critical` | index |
| `confidence` | float | |
| `duration_seconds` | float | how long the condition persisted |
| `timestamp` | datetime | |
| `warning_number` | int | which warning this triggered |
| `status` | enum: `open`, `reviewed`, `dismissed` | index |
| `review_notes` | string | admin notes |
| `reviewed_by` | ObjectId | |

#### `evidence`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `violation_id` | ObjectId | ref violations, index |
| `session_id` | ObjectId | |
| `evidence_type` | enum: `screenshot`, `audio_clip` | |
| `file_path` | string | server-side path |
| `file_size_bytes` | int | |
| `timestamp` | datetime | |
| `metadata` | object | e.g. frame number, duration |

#### `warnings`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `session_id` | ObjectId | ref proctoring_sessions, index |
| `violation_id` | ObjectId | |
| `warning_number` | int | 1-based |
| `message` | string | shown to student |
| `issued_at` | datetime | |
| `acknowledged_at` | datetime | nullable |

#### `disqualifications`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `session_id` | ObjectId | unique |
| `student_id` | ObjectId | |
| `exam_id` | ObjectId | |
| `reason` | string | |
| `trigger_violation_id` | ObjectId | |
| `disqualified_at` | datetime | |
| `reviewed_by` | ObjectId | nullable |
| `review_status` | enum: `pending`, `upheld`, `overturned` | |

#### `proctoring_reports`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `session_id` | ObjectId | unique |
| `attempt_id` | ObjectId | |
| `student_id` | ObjectId | |
| `exam_id` | ObjectId | |
| `generated_at` | datetime | |
| `identity_result` | object | verified, confidence |
| `violation_summary` | object | counts by type and severity |
| `warning_count` | int | |
| `disqualification_status` | bool | |
| `submission_status` | string | |
| `risk_score` | float | 0–100 |
| `risk_level` | enum: `low`, `medium`, `high`, `critical` | |
| `full_timeline` | array[object] | events + violations ordered by time |
| `pdf_path` | string | generated PDF path |

**Todo List:**
1. Create `docs/database-schema.md` with the full schema above.
2. Create `backend/app/models/` directory with one Pydantic file per collection.
3. Create `backend/app/db/indexes.py` with all index definitions to be applied at startup.
4. Validate relationships and lifecycle (e.g. on attempt disqualification cascade to session).

**Relevant Context:** MongoDB via Motor (async). PyMongo index syntax.

**Status:** [ ] pending

---

### Sub-Task 3 — Backend Foundation (FastAPI + Auth)

**Intent:** Stand up the FastAPI application shell, database connection, JWT authentication, and RBAC middleware. This is the backbone every other backend sub-task builds on.

**Expected Outcomes:**
- `POST /api/auth/register` and `POST /api/auth/login` return JWT tokens.
- JWT middleware protects all non-public routes.
- Role dependency (`require_admin`, `require_student`) reusable throughout.
- Password hashed with bcrypt.
- Health check endpoint at `GET /health`.
- CORS configured from environment variable.
- Rate limiting on `/api/auth/login` (5 req/min per IP).

**Todo List:**
1. Scaffold `backend/` with `pyproject.toml` / `requirements.txt`, `app/main.py`, `app/config.py`.
2. Implement Motor async MongoDB connection in `app/db/connection.py`.
3. Implement index application on startup in `app/db/indexes.py`.
4. Implement `app/core/security.py`: password hashing (bcrypt), JWT sign/verify.
5. Implement `app/api/auth.py`: register, login, refresh token.
6. Implement `app/core/dependencies.py`: `get_current_user`, `require_admin`, `require_student`.
7. Wire CORS middleware, rate limiting (slowapi), and global error handlers in `main.py`.
8. Write `backend/Dockerfile`.

**Relevant Context:** `python-jose` for JWT, `passlib[bcrypt]`, `motor`, `fastapi`, `slowapi`.

**Status:** [ ] pending

---

### Sub-Task 4 — Examination & Question Management API

**Intent:** Implement all CRUD operations for exams and questions, student assignment, and exam lifecycle state machine.

**Expected Outcomes:**
- Admins can create, edit, publish, and close exams.
- Admins can add/edit/delete questions with correct answers.
- Students can list exams they are assigned to and fetch exam content (without correct answers).
- Exam status transitions enforced: `draft → scheduled → active → completed`.

**API Endpoints:**

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/api/exams` | Create exam | Admin |
| GET | `/api/exams` | List exams (admin: all; student: assigned) | Both |
| GET | `/api/exams/{id}` | Get exam detail | Both |
| PUT | `/api/exams/{id}` | Update exam | Admin |
| DELETE | `/api/exams/{id}` | Delete draft exam | Admin |
| POST | `/api/exams/{id}/publish` | Set status active | Admin |
| POST | `/api/exams/{id}/questions` | Add question | Admin |
| GET | `/api/exams/{id}/questions` | List questions | Both |
| PUT | `/api/exams/{id}/questions/{qid}` | Edit question | Admin |
| DELETE | `/api/exams/{id}/questions/{qid}` | Delete question | Admin |
| POST | `/api/exams/{id}/students` | Assign students | Admin |
| DELETE | `/api/exams/{id}/students/{uid}` | Remove student | Admin |

**Todo List:**
1. Implement `app/api/exams.py` with all exam endpoints.
2. Implement `app/api/questions.py` with all question endpoints.
3. Enforce correct-answer field is stripped before returning to students.
4. Add input validation (Pydantic) for all request bodies.
5. Add unit tests in `tests/backend/test_exams.py`.

**Status:** [ ] pending

---

### Sub-Task 5 — Examination Attempt & Answer API

**Intent:** Enable students to start an attempt, navigate questions, autosave answers, and submit. Enforce single-attempt-per-student, timer, and disqualification guard.

**Expected Outcomes:**
- Student can start an attempt (creates `exam_attempts` + `proctoring_sessions` record).
- Answers autosave every 30 seconds from the frontend.
- Timer state stored server-side (prevents client-side manipulation).
- Final submission locks answers and sets status to `submitted`.
- Disqualified attempt blocks further answer saves.

**API Endpoints:**

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/api/attempts` | Start attempt | Student |
| GET | `/api/attempts/{id}` | Get attempt state + timer | Student |
| PUT | `/api/attempts/{id}/answers` | Autosave answers (batch) | Student |
| POST | `/api/attempts/{id}/submit` | Final submission | Student |
| GET | `/api/attempts/{id}/answers` | Get saved answers | Student |
| GET | `/api/admin/attempts` | List all attempts | Admin |
| GET | `/api/admin/attempts/{id}` | Get attempt detail | Admin |

**Todo List:**
1. Implement `app/api/attempts.py`.
2. Implement server-side timer: store `started_at`, compute `time_remaining_seconds` on each request, auto-submit when timer reaches zero.
3. Validate student is assigned to exam and has no existing active/submitted attempt.
4. On start, also create a `proctoring_sessions` record and return its ID to the frontend.
5. On submit, finalize proctoring session and trigger report generation (async background task).
6. Add unit tests in `tests/backend/test_attempts.py`.

**Status:** [ ] pending

---

### Sub-Task 6 — AI Service Foundation & Provider Pattern

**Intent:** Build the AI service as a separate FastAPI application that can swap real models for Demo Mode. This is the most architecturally critical sub-task.

**Expected Outcomes:**
- AI service exposes a well-defined REST API consumed only by the backend.
- Each AI capability has an abstract provider interface.
- Real providers use actual libraries; Demo providers return plausible synthetic data clearly labelled with `"demo": true`.
- A single `DEMO_MODE=true/false` environment variable controls which providers are loaded.
- No AI inference code lives in the backend.

**Provider Interfaces:**

```
FaceDetectionProvider
  detect_faces(frame: bytes) → FaceDetectionResult

FaceVerificationProvider
  verify_identity(frame: bytes, stored_encoding: list[float]) → VerificationResult
  encode_face(frame: bytes) → list[float]

HeadPoseProvider
  estimate_pose(frame: bytes) → HeadPoseResult  # yaw, pitch, roll

GazeProvider
  estimate_gaze(frame: bytes) → GazeResult  # gaze_x, gaze_y, looking_away

ObjectDetectionProvider
  detect_objects(frame: bytes) → list[DetectedObject]  # class, confidence, bbox

SpeechToTextProvider
  transcribe(audio: bytes) → TranscriptionResult  # text, language, confidence

SpeakerAnalysisProvider
  analyse(audio: bytes) → SpeakerAnalysisResult  # speaker_count, is_background_conversation
```

**Real Provider Implementations:**
- `FaceDetectionProvider` → `face_recognition` / `mediapipe`
- `FaceVerificationProvider` → `face_recognition` (128-dim encoding + cosine distance)
- `HeadPoseProvider` → `mediapipe` FaceMesh + solvePnP
- `GazeProvider` → `mediapipe` iris landmarks
- `ObjectDetectionProvider` → `ultralytics YOLOv8n` (nano model for speed)
- `SpeechToTextProvider` → `openai-whisper` (tiny/base model)
- `SpeakerAnalysisProvider` → `pyannote.audio` speaker diarisation

**Demo Provider Behaviour:**
- Return realistic-looking synthetic data tagged `"demo": true`.
- Simulate violations with a configurable probability to enable UI demonstration.
- Never claim demo results are real.

**AI Service Endpoints:**

| Method | Route | Purpose |
|---|---|---|
| POST | `/ai/face/detect` | Detect faces in frame |
| POST | `/ai/face/verify` | Verify identity |
| POST | `/ai/face/encode` | Encode face at enrolment |
| POST | `/ai/pose/estimate` | Head pose estimation |
| POST | `/ai/gaze/estimate` | Eye gaze estimation |
| POST | `/ai/objects/detect` | Prohibited object detection |
| POST | `/ai/speech/transcribe` | Speech-to-text |
| POST | `/ai/speech/analyse-speakers` | Speaker count + background detection |
| GET | `/ai/health` | Service health + mode (real/demo) |

**Todo List:**
1. Scaffold `ai/` service with `pyproject.toml`, `app/main.py`, `app/config.py`.
2. Define all abstract provider interfaces in `ai/app/providers/base.py`.
3. Implement real providers in `ai/app/providers/real/`.
4. Implement demo providers in `ai/app/providers/demo/`.
5. Implement provider factory in `ai/app/providers/factory.py` reading `DEMO_MODE`.
6. Implement all AI service endpoints in `ai/app/api/`.
7. Write `ai/Dockerfile`.
8. Add integration tests in `tests/ai/test_providers.py`.

**Status:** [ ] pending

---

### Sub-Task 7 — Proctoring Session & Real-Time Monitoring Backend

**Intent:** Implement the backend proctoring pipeline: receive frames/audio from the frontend, call the AI service, emit results back via WebSocket, and persist proctoring events.

**Expected Outcomes:**
- WebSocket endpoint at `/ws/proctoring/{session_id}` maintains the live monitoring channel.
- Backend accepts base64-encoded frames at ~1 fps and audio clips every 10 seconds.
- Backend calls AI service for each frame/audio chunk in order.
- Proctoring events are persisted to MongoDB.
- Results are sent back to the browser in real-time.
- Rate of AI calls is configurable (default: 1 frame/sec for visual, 10s chunks for audio).

**Persistence Duration Thresholds (configurable):**
- Face absent: flag after 3 consecutive absent frames
- Multiple faces: flag after 2 consecutive frames
- Head pose violation: flag after yaw > 30° or pitch > 20° for 5 consecutive frames
- Gaze violation: flag after looking away for 4 consecutive frames
- Object detected: flag immediately on first confident detection (>0.6)
- Identity mismatch: flag on first detection (>0.7 confidence)

**Todo List:**
1. Implement `app/api/proctoring_ws.py` WebSocket endpoint.
2. Implement `app/services/proctoring_pipeline.py`: orchestrate AI service calls for each received frame.
3. Implement persistence duration tracking in `app/services/violation_state_tracker.py` (in-memory per session, reset between frames).
4. Persist proctoring events to `proctoring_events` collection.
5. After each event, call the Violation Engine (Sub-Task 8).
6. Return structured JSON messages back through the WebSocket to the browser.

**Status:** [ ] pending

---

### Sub-Task 8 — Violation Engine & Warning/Disqualification Logic

**Intent:** Centralised rule engine that converts raw proctoring events into violations, issues warnings, and executes automatic disqualification.

**Expected Outcomes:**
- Each proctoring event is evaluated against configured rules.
- Violations are created in MongoDB with severity, confidence, and duration.
- Warnings are created and sent to the student through the WebSocket.
- After a configurable number of warnings (default: 3), the session is automatically disqualified.
- Critical violations (e.g. identity mismatch confirmed) trigger immediate disqualification.
- All thresholds are stored in the exam's `proctoring_config` and can be overridden per exam.

**Default Severity Map:**

| Event Type | Severity | Triggers Warning | Triggers Immediate Disqualification |
|---|---|---|---|
| face_absent (>30s) | medium | yes | no |
| multiple_faces | high | yes | no |
| identity_mismatch | critical | no | yes |
| head_pose_violation | low | no (accumulate 3) | no |
| gaze_violation | low | no (accumulate 3) | no |
| object_detected (phone/calc/headphones) | high | yes | no |
| additional_person | high | yes | no |
| suspicious_speech | medium | yes | no |
| multiple_speakers | high | yes | no |

**Todo List:**
1. Implement `app/services/violation_engine.py`.
2. Load exam's `proctoring_config` at session start and cache in memory.
3. Implement severity evaluation, warning counter, and disqualification trigger.
4. Write violations and warnings to MongoDB.
5. Emit warning payload through WebSocket to the student.
6. On disqualification: update `exam_attempts.status`, `proctoring_sessions.is_disqualified`, create `disqualifications` record, send disqualification message via WebSocket.
7. Add unit tests in `tests/backend/test_violation_engine.py`.

**Status:** [ ] pending

---

### Sub-Task 9 — Evidence Collection & Storage

**Intent:** Capture, store, and link screenshot and audio evidence to violations.

**Expected Outcomes:**
- Screenshots attached to every high/critical violation.
- Audio clips attached to speech violations.
- Evidence files stored on a server-side volume with organised path structure.
- Evidence records in MongoDB link back to violations.
- Admin API allows fetching evidence files (authenticated, admin only).
- Max file size enforced (configurable, default 5 MB per file).

**Storage Path Convention:**
```
evidence/
  {exam_id}/
    {student_id}/
      screenshots/
        {violation_id}_{timestamp}.jpg
      audio/
        {violation_id}_{timestamp}.wav
```

**Todo List:**
1. Implement `app/services/evidence_service.py`: save file, create `evidence` record.
2. Accept screenshot (base64 JPEG) and audio (base64 WAV) from the WebSocket message.
3. Enforce file size limits.
4. Implement `GET /api/admin/evidence/{id}` returning the file as a secured download.
5. Implement `GET /api/admin/violations/{id}/evidence` listing evidence for a violation.
6. Add tests in `tests/backend/test_evidence.py`.

**Status:** [ ] pending

---

### Sub-Task 10 — Proctoring Report Generation

**Intent:** Generate a detailed PDF + JSON proctoring report after exam submission or disqualification.

**Expected Outcomes:**
- Report triggered automatically as a FastAPI background task on attempt completion.
- Report contains all fields described in the database schema.
- Risk score calculated from: violation counts, severity weights, warning count, disqualification status.
- PDF generated with `reportlab` or `weasyprint`.
- `GET /api/admin/reports/{session_id}` returns JSON report.
- `GET /api/admin/reports/{session_id}/pdf` streams the PDF.

**Risk Score Formula:**
```
risk_score = min(100,
  (critical_count × 30) +
  (high_count × 15) +
  (medium_count × 8) +
  (low_count × 3) +
  (warning_count × 5) +
  (disqualified × 20)
)
```

**Todo List:**
1. Implement `app/services/report_service.py`.
2. Aggregate all proctoring events, violations, warnings, evidence for the session.
3. Compute risk score and risk level.
4. Build full timeline (events + violations sorted by timestamp).
5. Generate PDF report.
6. Save `proctoring_reports` record to MongoDB.
7. Implement admin report endpoints.
8. Add tests in `tests/backend/test_reports.py`.

**Status:** [ ] pending

---

### Sub-Task 11 — Admin API (Dashboard, Monitoring, User & Student Management)

**Intent:** Provide all administrator-facing REST endpoints for the dashboard, live monitoring, student management, and violation review.

**Expected Outcomes:**
- Admin dashboard stats endpoint returns counts of active exams, active sessions, total violations today, disqualifications today.
- Admin can list and search students.
- Admin can see all active proctoring sessions.
- Admin can list, filter, and review violations (update status and review notes).
- Admin can view evidence for any violation.
- Admin can list all reports.

**API Endpoints:**

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/dashboard/stats` | Dashboard summary counts |
| GET | `/api/admin/students` | List all students |
| POST | `/api/admin/students` | Create student account |
| GET | `/api/admin/students/{id}` | Student detail |
| PUT | `/api/admin/students/{id}` | Update student |
| GET | `/api/admin/sessions` | List all proctoring sessions |
| GET | `/api/admin/sessions/{id}` | Session detail with events |
| GET | `/api/admin/violations` | List violations (filterable) |
| GET | `/api/admin/violations/{id}` | Violation detail |
| PUT | `/api/admin/violations/{id}/review` | Update review status + notes |
| GET | `/api/admin/disqualifications` | List disqualifications |
| PUT | `/api/admin/disqualifications/{id}/review` | Uphold or overturn |
| GET | `/api/admin/reports` | List all reports |
| GET | `/api/admin/reports/{session_id}` | Full JSON report |
| GET | `/api/admin/reports/{session_id}/pdf` | PDF download |

**Todo List:**
1. Implement `app/api/admin.py` with all admin endpoints.
2. Add filtering/pagination to list endpoints (page, limit, status, exam_id, student_id).
3. Add admin tests in `tests/backend/test_admin.py`.

**Status:** [ ] pending

---

### Sub-Task 12 — Student Enrolment & Facial Encoding

**Intent:** Allow students to register, provide a reference face photograph, and have their face encoding stored for identity verification during the exam.

**Expected Outcomes:**
- Student registration flow: create user → create student profile.
- Face enrolment endpoint accepts an image and stores the 128-dim encoding.
- Re-enrolment allowed before exam starts.
- Admin can view and reset a student's face enrolment.

**API Endpoints:**

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create student account |
| POST | `/api/students/enrol-face` | Upload face image for encoding |
| GET | `/api/students/profile` | Get own student profile |
| GET | `/api/admin/students/{id}/face-status` | Check enrolment status |
| DELETE | `/api/admin/students/{id}/face` | Reset face enrolment |

**Todo List:**
1. Implement face enrolment endpoint calling AI service `/ai/face/encode`.
2. Store encoding in `student_profiles.face_encoding`.
3. Store reference image at `evidence/enrollments/{student_id}.jpg`.
4. Validate exactly one face in enrolment image.
5. Add tests in `tests/backend/test_enrolment.py`.

**Status:** [ ] pending

---

### Sub-Task 13 — Frontend Foundation (React + Vite + Tailwind)

**Intent:** Scaffold the React frontend, configure routing, global state, API client, and design system baseline.

**Expected Outcomes:**
- Vite + React + TypeScript project created under `frontend/`.
- Tailwind CSS configured with a professional colour palette (dark sidebar, clean cards).
- React Router v6 with public and protected routes.
- Axios API client configured with JWT interceptor (attach token, handle 401 refresh).
- Zustand store for: auth state, current exam attempt state, proctoring status.
- WebSocket client wrapper for the proctoring channel.
- Toast notification system.
- Loading, error, and empty state shared components.
- `frontend/Dockerfile`.

**Design System Tokens:**
- Primary: `#2563EB` (blue-600)
- Danger: `#DC2626` (red-600)
- Warning: `#D97706` (amber-600)
- Success: `#16A34A` (green-600)
- Background: `#0F172A` (dark slate)
- Card: `#1E293B`
- Border: `#334155`

**Todo List:**
1. Run `npm create vite@latest frontend -- --template react-ts` equivalent setup in `frontend/`.
2. Install and configure: `tailwindcss`, `react-router-dom`, `axios`, `zustand`, `react-query`, `react-hot-toast`, `lucide-react`.
3. Create `src/lib/api.ts` Axios client with interceptors.
4. Create `src/lib/ws.ts` WebSocket client.
5. Create `src/store/` for auth, attempt, proctoring stores.
6. Create shared UI components: `Button`, `Card`, `Badge`, `Modal`, `Spinner`, `Alert`, `Table`, `EmptyState`.
7. Configure React Router with `ProtectedRoute` and `AdminRoute` wrappers.
8. Write `frontend/Dockerfile`.

**Status:** [ ] pending

---

### Sub-Task 14 — Student Authentication & Face Verification UI

**Intent:** Build the student login page, face enrolment page, and the pre-exam system readiness check and facial verification flow.

**Expected Outcomes:**
- Login page with email + password, professional styling.
- Face enrolment page: webcam preview, capture button, upload, confirmation.
- Pre-exam readiness checklist: camera permission, microphone permission, face detected, identity verified.
- Identity verified result shown with confidence score.
- Cannot start exam until all readiness checks pass.

**Todo List:**
1. Implement `src/pages/LoginPage.tsx`.
2. Implement `src/pages/student/FaceEnrolmentPage.tsx` with webcam capture via `react-webcam`.
3. Implement `src/pages/student/ReadinessCheckPage.tsx` with step-by-step checklist.
4. Implement `src/components/proctoring/FaceVerificationPanel.tsx`.
5. Connect to `/api/students/enrol-face` and `/api/attempts` (start attempt).

**Status:** [ ] pending

---

### Sub-Task 15 — Examination Interface (Student)

**Intent:** Build the full examination-taking interface with question navigation, answer saving, timer, and proctoring status overlay.

**Expected Outcomes:**
- Full-screen exam layout: left sidebar (question navigator), centre (question + answer), right panel (timer + proctoring status).
- Questions display with MCQ radio buttons or text area for written answers.
- Autosave answers every 30 seconds with visual confirmation.
- Countdown timer synced to server state.
- Proctoring status panel shows: face detected (green/red), identity OK, warning count.
- Warning notification banner appears on each new warning.
- Disqualification screen shown on disqualification message.
- Confirmation dialog before final submission.
- Post-submission confirmation page.

**Todo List:**
1. Implement `src/pages/student/ExamPage.tsx`.
2. Implement `src/components/exam/QuestionNavigator.tsx`.
3. Implement `src/components/exam/QuestionView.tsx` (MCQ + text variants).
4. Implement `src/components/exam/ExamTimer.tsx`.
5. Implement `src/components/proctoring/ProctoringStatusPanel.tsx`.
6. Implement `src/components/proctoring/WarningBanner.tsx`.
7. Implement `src/components/proctoring/DisqualificationOverlay.tsx`.
8. Wire autosave to API every 30 seconds.
9. Wire server timer sync on page load / reconnect.

**Status:** [ ] pending

---

### Sub-Task 16 — Proctoring Client (Camera + Microphone)

**Intent:** Implement the browser-side proctoring client that captures camera frames and audio, sends them to the backend via WebSocket, and handles incoming violation/warning messages.

**Expected Outcomes:**
- Camera access via `MediaDevices.getUserMedia`.
- Frame captured from `<video>` element via Canvas at 1 fps.
- Frame compressed to JPEG (quality 0.7) and sent as base64 over WebSocket.
- Audio captured in 10-second chunks via `MediaRecorder`.
- Audio chunks sent as base64 WAV over WebSocket.
- Incoming WebSocket messages processed: proctoring status updates, warning triggers, disqualification trigger.
- Camera/microphone failure handled gracefully with clear error message (exam paused).

**Todo List:**
1. Implement `src/hooks/useProctoringCamera.ts`: camera init, frame capture loop, cleanup.
2. Implement `src/hooks/useProctoringAudio.ts`: microphone init, MediaRecorder, 10s chunk dispatch.
3. Implement `src/hooks/useProctoringWebSocket.ts`: WebSocket lifecycle, send frame/audio, receive events.
4. Wire all three hooks into `ExamPage.tsx`.
5. Implement `src/components/proctoring/CameraPreview.tsx` (small, live preview in corner).

**Status:** [ ] pending

---

### Sub-Task 17 — Administrator Dashboard & Monitoring UI

**Intent:** Build the full administrator interface: dashboard, exam management, student management, active session monitoring, violation review, evidence viewer, and report viewer.

**Expected Outcomes:**
- Sidebar navigation between: Dashboard, Exams, Students, Active Sessions, Violations, Disqualifications, Reports, Settings.
- Dashboard shows live stat cards and today's violation chart.
- Exam management CRUD with question editor.
- Student management with enrolment status.
- Active Sessions table showing live sessions with warning counts.
- Violations table with filters by exam, severity, status.
- Violation detail modal: event data, evidence screenshots/audio, review form.
- Reports list with PDF download link.

**Todo List:**
1. Implement `src/pages/admin/AdminLayout.tsx` with sidebar.
2. Implement `src/pages/admin/DashboardPage.tsx` with stat cards and chart (`recharts`).
3. Implement `src/pages/admin/ExamsPage.tsx` and `src/pages/admin/ExamEditorPage.tsx`.
4. Implement `src/pages/admin/StudentsPage.tsx`.
5. Implement `src/pages/admin/ActiveSessionsPage.tsx`.
6. Implement `src/pages/admin/ViolationsPage.tsx`.
7. Implement `src/components/admin/ViolationDetailModal.tsx` with evidence viewer.
8. Implement `src/pages/admin/ReportsPage.tsx`.
9. Implement `src/pages/admin/SettingsPage.tsx` (proctoring config thresholds).

**Status:** [ ] pending

---

### Sub-Task 18 — Testing Suite

**Intent:** Implement the tests described in the requirements, covering unit, integration, and end-to-end scenarios.

**Expected Outcomes:**
- Backend unit tests pass for auth, exams, attempts, violation engine, evidence, reports.
- AI service provider tests pass for real and demo modes.
- End-to-end test script documents the full workflow:
  Login → Verification → Start Exam → Monitoring → Violation → Warning → Evidence → Submission → Report.
- Test coverage report generated.

**Test Files:**
```
tests/
  backend/
    test_auth.py
    test_exams.py
    test_attempts.py
    test_violation_engine.py
    test_evidence.py
    test_reports.py
    test_admin.py
    test_enrolment.py
  ai/
    test_providers.py
    test_demo_providers.py
  e2e/
    test_full_workflow.py
```

**Todo List:**
1. Write pytest fixtures in `tests/conftest.py` (async motor client, test DB, auth tokens).
2. Write backend unit tests for all modules.
3. Write AI provider tests (with real models mocked where hardware is unavailable).
4. Write end-to-end workflow test using `httpx.AsyncClient`.
5. Configure `pytest.ini` and coverage reporting.

**Status:** [ ] pending

---

### Sub-Task 19 — Documentation

**Intent:** Ensure the project is well-documented for the hackathon submission and future maintainers.

**Expected Outcomes:**
- `README.md` includes: project overview, quick start, environment variables, architecture diagram reference, API summary, Demo Mode instructions.
- `docs/architecture.md` describes the full system architecture.
- `docs/database-schema.md` (from Sub-Task 2).
- `docs/api-reference.md` documents all API endpoints.
- `docs/ai-pipeline.md` describes the AI processing pipeline and provider pattern.
- `AGENTS.md` documents AI agent conventions.

**Todo List:**
1. Update `README.md` with complete setup instructions.
2. Write `docs/architecture.md`.
3. Write `docs/api-reference.md`.
4. Write `docs/ai-pipeline.md`.
5. Update `AGENTS.md`.

**Status:** [ ] pending

---

## AI Proctoring Pipeline Detail

### Visual Pipeline

```
[Browser]
  Camera (getUserMedia)
    ↓
  Canvas frame capture @ 1 fps
    ↓
  JPEG compress (quality 0.7, 480p)
    ↓
  Base64 encode
    ↓
  WebSocket send {type: "frame", data: "...", timestamp: "..."}

[Backend - proctoring_pipeline.py]
  Receive frame
    ↓
  POST /ai/face/detect → face_count, face_positions
    ↓
  If face_count == 0 → face_absent event
  If face_count > 1 → multiple_faces event, additional_person event
    ↓
  POST /ai/face/verify (if face_count == 1) → identity confidence
    ↓
  POST /ai/pose/estimate → yaw, pitch, roll
    ↓
  POST /ai/gaze/estimate → gaze vector, looking_away
    ↓
  POST /ai/objects/detect → detected objects with confidence
    ↓
  violation_state_tracker.evaluate(events)
    ↓
  [Violation Engine] → violations, warnings, disqualification
    ↓
  [Evidence Service] → save screenshot if high/critical violation
    ↓
  WebSocket response {proctoring_status, violations, warnings}
```

### Audio Pipeline

```
[Browser]
  Microphone (getUserMedia)
    ↓
  MediaRecorder (10s chunks)
    ↓
  Base64 WAV encode
    ↓
  WebSocket send {type: "audio", data: "...", timestamp: "..."}

[Backend - proctoring_pipeline.py]
  Receive audio chunk
    ↓
  POST /ai/speech/transcribe → transcript, confidence
    ↓
  Keyword analysis (suspicious word list) → suspicious_speech event
    ↓
  POST /ai/speech/analyse-speakers → speaker_count, background_conversation
    ↓
  If speaker_count > 1 → multiple_speakers event
  If background_conversation → background_conversation event
    ↓
  [Violation Engine] → violations, warnings
    ↓
  [Evidence Service] → save audio clip if medium+ violation
    ↓
  WebSocket response
```

---

## Violation Configuration Schema

```json
{
  "proctoring_config": {
    "face_absent_threshold_frames": 3,
    "face_absent_warning_seconds": 30,
    "multiple_faces_threshold_frames": 2,
    "head_pose_yaw_threshold_degrees": 30,
    "head_pose_pitch_threshold_degrees": 20,
    "head_pose_violation_frames": 5,
    "gaze_away_threshold_frames": 4,
    "object_detection_confidence_threshold": 0.6,
    "identity_mismatch_confidence_threshold": 0.7,
    "warnings_before_disqualification": 3,
    "critical_violation_immediate_disqualification": true,
    "severity_weights": {
      "critical": 30,
      "high": 15,
      "medium": 8,
      "low": 3
    },
    "suspicious_keywords": ["answer", "help me", "what is", "tell me", "solution"]
  }
}
```

---

## Project Directory Structure

```
AI-Proctoring-System/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   ├── exam/
│   │   │   ├── proctoring/
│   │   │   └── ui/
│   │   ├── hooks/
│   │   │   ├── useProctoringCamera.ts
│   │   │   ├── useProctoringAudio.ts
│   │   │   └── useProctoringWebSocket.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── ws.ts
│   │   ├── pages/
│   │   │   ├── student/
│   │   │   └── admin/
│   │   ├── store/
│   │   └── types/
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── Dockerfile
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── exams.py
│   │   │   ├── questions.py
│   │   │   ├── attempts.py
│   │   │   ├── proctoring_ws.py
│   │   │   └── admin.py
│   │   ├── core/
│   │   │   ├── security.py
│   │   │   ├── dependencies.py
│   │   │   └── config.py
│   │   ├── db/
│   │   │   ├── connection.py
│   │   │   └── indexes.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── exam.py
│   │   │   ├── attempt.py
│   │   │   ├── proctoring.py
│   │   │   └── report.py
│   │   ├── services/
│   │   │   ├── proctoring_pipeline.py
│   │   │   ├── violation_state_tracker.py
│   │   │   ├── violation_engine.py
│   │   │   ├── evidence_service.py
│   │   │   └── report_service.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── ai/
│   ├── app/
│   │   ├── api/
│   │   │   ├── face.py
│   │   │   ├── pose.py
│   │   │   ├── gaze.py
│   │   │   ├── objects.py
│   │   │   └── speech.py
│   │   ├── providers/
│   │   │   ├── base.py
│   │   │   ├── factory.py
│   │   │   ├── real/
│   │   │   │   ├── face_detection.py
│   │   │   │   ├── face_verification.py
│   │   │   │   ├── head_pose.py
│   │   │   │   ├── gaze.py
│   │   │   │   ├── object_detection.py
│   │   │   │   ├── speech_to_text.py
│   │   │   │   └── speaker_analysis.py
│   │   │   └── demo/
│   │   │       ├── face_detection.py
│   │   │       ├── face_verification.py
│   │   │       ├── head_pose.py
│   │   │       ├── gaze.py
│   │   │       ├── object_detection.py
│   │   │       ├── speech_to_text.py
│   │   │       └── speaker_analysis.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── tests/
│   ├── backend/
│   ├── ai/
│   ├── e2e/
│   └── conftest.py
├── docs/
│   ├── architecture.md
│   ├── database-schema.md
│   ├── api-reference.md
│   └── ai-pipeline.md
├── .env.example
├── docker-compose.yml
├── README.md
└── AGENTS.md
```

---

## Security Plan

| Concern | Implementation |
|---|---|
| Password storage | bcrypt via `passlib` |
| JWT tokens | HS256, 24h access token, 7d refresh token, stored in httpOnly cookie |
| RBAC | FastAPI `Depends` with `require_admin` / `require_student` |
| Input validation | Pydantic v2 strict models on all request bodies |
| File uploads | Max 5 MB, MIME-type whitelist (image/jpeg, audio/wav), stored outside web root |
| Evidence access | Admin-only, served through authenticated API endpoint (not static URL) |
| CORS | Explicit origin list from `CORS_ORIGINS` env var |
| Rate limiting | 5 req/min on `/api/auth/login` per IP (slowapi) |
| Audit logging | All admin actions logged with user ID and timestamp |
| Secrets | All credentials in environment variables, never hardcoded |
| Camera/microphone | Browser `getUserMedia` with explicit user permission dialog |
| Hidden recording | Not implemented — recording only active during an acknowledged exam session |

---

## Requirement Traceability Matrix

| Requirement | Feature | Technical Implementation | Module | Priority |
|---|---|---|---|---|
| Student login and facial identity verification | Auth + Face Verification | JWT auth + face_recognition encoding + cosine distance verification | backend/auth, ai/face_verification | P0 |
| Continuous monitoring of the student's face | Live face detection | WebSocket frame pipeline @ 1 fps → face detection AI provider | backend/proctoring_ws, ai/face_detection | P0 |
| Detection of absence or multiple faces | Face count check | Face detection result face_count == 0 or > 1 → violation events | backend/proctoring_pipeline, violation_engine | P0 |
| Head movement and eye-gaze analysis | Head pose + gaze | MediaPipe FaceMesh solvePnP for pose; iris landmarks for gaze | ai/head_pose, ai/gaze | P0 |
| Detection of prohibited objects (phone, calculator, headphones, smartwatch) | Object detection | YOLOv8n inference on each frame, class filter for prohibited items | ai/object_detection | P0 |
| Detection of an additional person | Additional person detection | Face count > 1 event flagged as additional_person violation | backend/violation_engine | P0 |
| Speech-to-text and suspicious speech/keyword analysis | Audio transcription + keyword match | Whisper transcription + configurable keyword list match | ai/speech_to_text, backend/proctoring_pipeline | P0 |
| Detection of multiple speakers and background conversations | Speaker diarisation | pyannote.audio speaker count + background detection | ai/speaker_analysis | P0 |
| Automated warning generation | Warning engine | Configurable severity thresholds → warnings table + WebSocket push | backend/violation_engine | P0 |
| Automatic disqualification after repeated violations | Disqualification logic | Warning counter reaches threshold → disqualifications record + WebSocket event | backend/violation_engine | P0 |
| Screenshot/audio evidence collection with timestamps | Evidence service | Frame bytes saved as JPEG + audio chunks saved as WAV, linked to violation | backend/evidence_service | P0 |
| Examination management and submission | Exam CRUD + attempt lifecycle | Admin exam CRUD API + student attempt API with server-side timer | backend/exams, backend/attempts | P0 |
| Administrator dashboard for monitoring and reviewing violations | Admin UI + API | Admin REST endpoints + React admin dashboard with violation review modal | backend/admin, frontend/admin | P0 |
| Generation of detailed proctoring reports | Report service + PDF | Background task aggregating all session data + reportlab PDF | backend/report_service | P0 |
| Facial verification (from problem statement) | Face identity check | face_recognition 128-dim encoding stored at enrolment, verified at exam start | backend/enrolment, ai/face_verification | P0 |
| Continuous face detection (from problem statement) | Live monitoring | 1 fps frame pipeline | backend/proctoring_ws | P0 |
| Head-pose tracking (from problem statement) | Head pose analysis | MediaPipe + solvePnP yaw/pitch/roll | ai/head_pose | P0 |
| Eye-gaze tracking (from problem statement) | Gaze analysis | MediaPipe iris landmark gaze direction | ai/gaze | P0 |
| Prohibited-object detection (from problem statement) | Object detection | YOLOv8n | ai/object_detection | P0 |
| Speech-to-text analysis (from problem statement) | Audio transcription | Whisper | ai/speech_to_text | P0 |
| Multiple-speaker detection (from problem statement) | Speaker analysis | pyannote.audio | ai/speaker_analysis | P0 |
| Violation management (from problem statement) | Violation engine | Centralised rule engine with configurable thresholds | backend/violation_engine | P0 |
| Evidence collection (from problem statement) | Evidence service | Screenshot + audio evidence linked to violations | backend/evidence_service | P0 |
| Examination reporting (from problem statement) | Report service | Full proctoring report with risk score | backend/report_service | P0 |

---

## Demo Mode Specification

- Controlled by `DEMO_MODE=true` environment variable on the AI service.
- All demo provider responses include `"demo": true` in the payload.
- Backend propagates demo flag to the frontend.
- Frontend displays a persistent "⚠ DEMO MODE — AI results are simulated" banner.
- Demo providers simulate violations at a configurable rate (default: ~10% of frames trigger a random violation).
- Demo mode never silently passes as real AI results anywhere in the stack.
- Real providers are loaded by default (`DEMO_MODE=false`).
