-- ============================================================
-- AI Proctoring System — PostgreSQL Schema
-- Run once against a fresh database (Neon / Vercel Postgres)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','admin')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Student Profiles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_profiles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  student_id       TEXT NOT NULL UNIQUE,
  face_encoding    JSONB,            -- stored as JSON array of floats
  face_image_b64   TEXT,             -- base64-encoded JPEG (small size, for serverless)
  is_face_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Admin Profiles ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_profiles (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  admin_id   TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Exams ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  created_by         UUID NOT NULL REFERENCES users(id),
  duration_minutes   INT NOT NULL DEFAULT 60,
  start_time         TIMESTAMPTZ,
  end_time           TIMESTAMPTZ,
  allowed_students   TEXT[] NOT NULL DEFAULT '{}',  -- array of user_id strings (empty = open)
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','completed')),
  proctoring_config  JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Questions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id        UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  "order"        INT NOT NULL DEFAULT 1,
  question_type  TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','short_answer','long_answer')),
  text           TEXT NOT NULL,
  options        JSONB,              -- array of option strings, null for open-ended
  correct_answer TEXT,
  marks          INT NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Exam Attempts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_attempts (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id                 UUID NOT NULL REFERENCES exams(id),
  student_id              UUID NOT NULL REFERENCES users(id),
  status                  TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started','in_progress','submitted','disqualified')),
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at            TIMESTAMPTZ,
  time_remaining_seconds  INT,
  final_score             NUMERIC
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_active
  ON exam_attempts(exam_id, student_id)
  WHERE status = 'in_progress';

-- ── Answers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS answers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id  UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  response    TEXT NOT NULL DEFAULT '',
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_final    BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(attempt_id, question_id)
);

-- ── Proctoring Sessions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS proctoring_sessions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id              UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  student_id              UUID NOT NULL REFERENCES users(id),
  exam_id                 UUID NOT NULL REFERENCES exams(id),
  identity_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  identity_confidence     NUMERIC NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  warning_count           INT NOT NULL DEFAULT 0,
  is_disqualified         BOOLEAN NOT NULL DEFAULT FALSE,
  disqualification_reason TEXT,
  face_encoding           JSONB,   -- snapshot of enrolled encoding at session start
  demo_mode               BOOLEAN NOT NULL DEFAULT TRUE,
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                TIMESTAMPTZ,
  -- in-memory violation state (persisted so serverless functions share state)
  vstate                  JSONB NOT NULL DEFAULT '{}'
);

-- ── Proctoring Events ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proctoring_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES users(id),
  event_type  TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  confidence  NUMERIC NOT NULL DEFAULT 0,
  is_demo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Violations ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS violations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id     UUID NOT NULL REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES users(id),
  exam_id        UUID NOT NULL REFERENCES exams(id),
  event_id       UUID REFERENCES proctoring_events(id),
  violation_type TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  confidence     NUMERIC NOT NULL DEFAULT 0,
  duration_secs  NUMERIC NOT NULL DEFAULT 0,
  warning_number INT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  review_notes   TEXT,
  reviewed_by    UUID REFERENCES users(id),
  reviewed_at    TIMESTAMPTZ,
  is_demo        BOOLEAN NOT NULL DEFAULT TRUE,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Disqualifications ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disqualifications (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id           UUID NOT NULL REFERENCES proctoring_sessions(id),
  student_id           UUID NOT NULL REFERENCES users(id),
  exam_id              UUID NOT NULL REFERENCES exams(id),
  reason               TEXT NOT NULL,
  trigger_violation_id UUID REFERENCES violations(id),
  disqualified_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by          UUID REFERENCES users(id),
  review_status        TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','upheld','overturned'))
);

-- ── Proctoring Reports ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS proctoring_reports (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id            UUID NOT NULL REFERENCES proctoring_sessions(id),
  attempt_id            UUID NOT NULL REFERENCES exam_attempts(id),
  student_id            UUID NOT NULL REFERENCES users(id),
  exam_id               UUID NOT NULL REFERENCES exams(id),
  risk_score            NUMERIC NOT NULL DEFAULT 0,
  risk_level            TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  violation_summary     JSONB NOT NULL DEFAULT '{}',
  warning_count         INT NOT NULL DEFAULT 0,
  disqualification_status BOOLEAN NOT NULL DEFAULT FALSE,
  submission_status     TEXT NOT NULL DEFAULT 'not_submitted',
  identity_result       JSONB NOT NULL DEFAULT '{}',
  full_timeline         JSONB NOT NULL DEFAULT '[]',
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id)
);

-- ── Evidence ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  violation_id   UUID REFERENCES violations(id),
  session_id     UUID NOT NULL REFERENCES proctoring_sessions(id),
  evidence_type  TEXT NOT NULL CHECK (evidence_type IN ('screenshot','audio_clip')),
  file_data_b64  TEXT,               -- base64-encoded file bytes (serverless-friendly)
  file_size      INT NOT NULL DEFAULT 0,
  is_demo        BOOLEAN NOT NULL DEFAULT TRUE,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id  ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_exams_status              ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_created_by          ON exams(created_by);
CREATE INDEX IF NOT EXISTS idx_questions_exam_id         ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student          ON exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exam             ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_answers_attempt           ON answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_sessions_student          ON proctoring_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_attempt          ON proctoring_sessions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_violations_session        ON violations(session_id);
CREATE INDEX IF NOT EXISTS idx_violations_student        ON violations(student_id);
CREATE INDEX IF NOT EXISTS idx_violations_created        ON violations(created_at);
CREATE INDEX IF NOT EXISTS idx_events_session            ON proctoring_events(session_id);
CREATE INDEX IF NOT EXISTS idx_disq_session              ON disqualifications(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_session           ON proctoring_reports(session_id);
