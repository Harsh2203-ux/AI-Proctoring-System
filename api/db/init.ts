/**
 * Database self-initialisation — safe to call on every cold-start.
 * Creates all tables (IF NOT EXISTS) and upserts the two demo accounts.
 *
 * Exported as `ensureDb()` — call once at the top of any API handler that
 * needs the database to be ready.  A module-level promise prevents running
 * the migration more than once per serverless process lifetime.
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

let _initPromise: Promise<void> | null = null;

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','admin')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  student_id       TEXT NOT NULL UNIQUE,
  face_encoding    JSONB,
  face_image_b64   TEXT,
  is_face_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_profiles (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  admin_id   TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  created_by         UUID NOT NULL REFERENCES users(id),
  duration_minutes   INT NOT NULL DEFAULT 60,
  start_time         TIMESTAMPTZ,
  end_time           TIMESTAMPTZ,
  allowed_students   TEXT[] NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','completed')),
  proctoring_config  JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id        UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  "order"        INT NOT NULL DEFAULT 1,
  question_type  TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','short_answer','long_answer')),
  text           TEXT NOT NULL,
  options        JSONB,
  correct_answer TEXT,
  marks          INT NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS answers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id  UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  response    TEXT NOT NULL DEFAULT '',
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_final    BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(attempt_id, question_id)
);

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
  face_encoding           JSONB,
  demo_mode               BOOLEAN NOT NULL DEFAULT TRUE,
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                TIMESTAMPTZ,
  vstate                  JSONB NOT NULL DEFAULT '{}'
);

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

CREATE TABLE IF NOT EXISTS proctoring_reports (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id              UUID NOT NULL REFERENCES proctoring_sessions(id),
  attempt_id              UUID NOT NULL REFERENCES exam_attempts(id),
  student_id              UUID NOT NULL REFERENCES users(id),
  exam_id                 UUID NOT NULL REFERENCES exams(id),
  risk_score              NUMERIC NOT NULL DEFAULT 0,
  risk_level              TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  violation_summary       JSONB NOT NULL DEFAULT '{}',
  warning_count           INT NOT NULL DEFAULT 0,
  disqualification_status BOOLEAN NOT NULL DEFAULT FALSE,
  submission_status       TEXT NOT NULL DEFAULT 'not_submitted',
  identity_result         JSONB NOT NULL DEFAULT '{}',
  full_timeline           JSONB NOT NULL DEFAULT '[]',
  generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id)
);

CREATE TABLE IF NOT EXISTS evidence (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  violation_id   UUID REFERENCES violations(id),
  session_id     UUID NOT NULL REFERENCES proctoring_sessions(id),
  evidence_type  TEXT NOT NULL CHECK (evidence_type IN ('screenshot','audio_clip')),
  file_data_b64  TEXT,
  file_size      INT NOT NULL DEFAULT 0,
  is_demo        BOOLEAN NOT NULL DEFAULT TRUE,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
`;

async function runInit(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Without DATABASE_URL nothing will work — throw so ensureDb() rejects
    // and the handler returns a clear 500 rather than a misleading 401.
    throw new Error('[db/init] DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    // 1. Apply schema (all CREATE … IF NOT EXISTS — fully idempotent)
    await client.query(SCHEMA);
    console.log('[db/init] Schema applied');

    // 2. Upsert demo admin
    // FIX: DO UPDATE must also refresh password_hash so the stored hash always
    // matches the current ADMIN_PASSWORD env var.  Without this, if the row
    // already existed (e.g. from a previous deployment or a different hashing
    // library), the new hash is computed but then silently discarded, causing
    // verifyPassword() to always return false → 401 "Login failed".
    const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@demo.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';
    const adminHash = await bcrypt.hash(adminPassword, 12);

    const { rows: [admin] } = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, 'admin', TRUE)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             is_active     = TRUE,
             updated_at    = NOW()
       RETURNING id`,
      [adminEmail.toLowerCase(), adminHash]
    );
    await client.query(
      `INSERT INTO admin_profiles (user_id, full_name, admin_id)
       VALUES ($1, 'Demo Admin', 'ADMIN001')
       ON CONFLICT (user_id) DO NOTHING`,
      [admin.id]
    );
    console.log(`[db/init] Demo admin ready: ${adminEmail}`);

    // 3. Upsert demo student (same fix applied)
    const studentEmail    = process.env.STUDENT_EMAIL    || 'student@demo.com';
    const studentPassword = process.env.STUDENT_PASSWORD || 'Student@1234';
    const studentHash = await bcrypt.hash(studentPassword, 12);

    const { rows: [student] } = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, 'student', TRUE)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             is_active     = TRUE,
             updated_at    = NOW()
       RETURNING id`,
      [studentEmail.toLowerCase(), studentHash]
    );
    await client.query(
      `INSERT INTO student_profiles (user_id, full_name, student_id)
       VALUES ($1, 'Demo Student', 'STU001')
       ON CONFLICT (user_id) DO NOTHING`,
      [student.id]
    );
    console.log(`[db/init] Demo student ready: ${studentEmail}`);

    // 4. Seed a demo exam owned by the admin (idempotent via title uniqueness check)
    const { rows: [existingExam] } = await client.query<{ id: string }>(
      `SELECT id FROM exams WHERE title = 'Demo Examination' AND created_by = $1 LIMIT 1`,
      [admin.id]
    );
    if (!existingExam) {
      const { rows: [exam] } = await client.query<{ id: string }>(
        `INSERT INTO exams (title, description, created_by, duration_minutes, status, proctoring_config)
         VALUES (
           'Demo Examination',
           'A sample exam to demonstrate the proctoring system.',
           $1, 30, 'active',
           '{"warnings_before_disqualification":3,"critical_violation_immediate_disqualification":true}'
         ) RETURNING id`,
        [admin.id]
      );
      await client.query(
        `INSERT INTO questions (exam_id, "order", question_type, text, options, correct_answer, marks)
         VALUES
           ($1, 1, 'mcq', 'What does HTML stand for?',
            '["Hyper Text Markup Language","High Text Machine Language","Hyperlinks and Text Markup Language","None of the above"]',
            'Hyper Text Markup Language', 1),
           ($1, 2, 'mcq', 'Which of the following is a JavaScript framework?',
            '["Django","React","Laravel","Flask"]',
            'React', 1),
           ($1, 3, 'short_answer', 'Briefly explain what an API is.', NULL,
            'A set of protocols and tools for building software applications.', 2)`,
        [exam.id]
      );
      console.log(`[db/init] Demo exam created: ${exam.id}`);
    }

    console.log('[db/init] Initialisation complete');
  } catch (err) {
    // Rethrow — let ensureDb() reject so the calling handler can surface a
    // proper 500 error.  The previous swallowed-error pattern caused login to
    // proceed against an uninitialised DB, producing a confusing SQL error
    // that the frontend displayed as "Login failed. Please try again."
    console.error('[db/init] Error during initialisation:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Call at the top of any handler that requires the database.
 * Runs the full schema migration + demo-seed exactly once per process lifetime.
 * On failure the promise is cleared so the next request retries, rather than
 * permanently caching a failed initialisation.
 */
export function ensureDb(): Promise<void> {
  if (!_initPromise) {
    _initPromise = runInit().catch((err) => {
      // Clear the cached promise so subsequent requests retry init
      // instead of immediately resolving against a broken database state.
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}
