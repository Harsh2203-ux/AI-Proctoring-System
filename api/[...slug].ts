/**
 * api/[...slug].ts
 *
 * Single Vercel Serverless Function that handles ALL /api/* routes.
 * Collapses the previous 32 individual function files into 1, staying within
 * the Hobby plan's 12-function limit.
 *
 * Routing is done by matching the slug array (path segments after /api/) and
 * the HTTP method.  Dynamic path parameters (e.g. :examId) are extracted from
 * the slug and injected into req.query so that the handler logic below works
 * identically to the original per-file handlers.
 *
 * No application logic has changed — this is a pure structural consolidation.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// ── shared db / lib ──────────────────────────────────────────────────────────
import { query, queryOne } from './db/client';
import { ensureDb } from './db/init';
import {
  requireAuth, requireAdmin, requireStudent,
  createAccessToken, createRefreshToken, decodeToken,
} from './_lib/auth';
import { hashPassword, verifyPassword, validatePassword } from './_lib/password';
import { analyseFrameDemo, analyseAudioDemo } from './_lib/demoAi';
import { generateReport } from './_lib/report';

// ── env ──────────────────────────────────────────────────────────────────────
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10');

// ── tiny router ───────────────────────────────────────────────────────────────
type Handler = (req: VercelRequest, res: VercelResponse, params: Record<string, string>) => Promise<void>;

interface Route {
  segments: Array<string | null>; // null = wildcard / dynamic segment
  paramNames: string[];           // names for the dynamic segments, in order
  handler: Handler;
}

const routes: Route[] = [];

function addRoute(pattern: string, handler: Handler) {
  const parts = pattern.split('/').filter(Boolean);
  const paramNames: string[] = [];
  const segments = parts.map(p => {
    if (p.startsWith(':')) { paramNames.push(p.slice(1)); return null; }
    return p;
  });
  routes.push({ segments, paramNames, handler });
}

function matchRoute(slug: string[]): { handler: Handler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.segments.length !== slug.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    let dynIdx = 0;
    for (let i = 0; i < route.segments.length; i++) {
      if (route.segments[i] === null) {
        params[route.paramNames[dynIdx++]] = slug[i];
      } else if (route.segments[i] !== slug[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler: route.handler, params };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/health ───────────────────────────────────────────────────────────
addRoute('health', async (_req, res, _p) => {
  let dbOk = false;
  let initError: string | null = null;
  try {
    await ensureDb();
    await queryOne('SELECT 1 as ok');
    dbOk = true;
  } catch (err) {
    dbOk = false;
    initError = err instanceof Error ? err.message : String(err);
  }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    db:     dbOk ? 'connected' : 'unavailable',
    ...(initError ? { error: initError } : {}),
    timestamp: new Date().toISOString(),
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
addRoute('auth/login', async (req, res, _p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const { email, password } = req.body || {};
  if (!email || !password) return void res.status(400).json({ detail: 'Email and password are required' });
  try {
    await ensureDb();
    const user = await queryOne<{
      id: string; email: string; password_hash: string; role: string; is_active: boolean;
    }>('SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!user) return void res.status(401).json({ detail: 'Invalid email or password' });
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return void res.status(401).json({ detail: 'Invalid email or password' });
    if (!user.is_active) return void res.status(403).json({ detail: 'Account is inactive' });
    let full_name = user.email;
    if (user.role === 'student') {
      const p = await queryOne<{ full_name: string }>('SELECT full_name FROM student_profiles WHERE user_id = $1', [user.id]);
      if (p) full_name = p.full_name;
    } else if (user.role === 'admin') {
      const p = await queryOne<{ full_name: string }>('SELECT full_name FROM admin_profiles WHERE user_id = $1', [user.id]);
      if (p) full_name = p.full_name;
    }
    const tokenData = { sub: user.id, email: user.email, role: user.role as 'student' | 'admin' };
    const access_token  = createAccessToken(tokenData);
    const refresh_token = createRefreshToken(tokenData);
    console.log(`[login] ${user.email} (${user.role})`);
    res.status(200).json({ access_token, refresh_token, token_type: 'bearer',
      user: { id: user.id, email: user.email, role: user.role, full_name } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[login] Error for ${email}: ${msg}`);
    res.status(500).json({ detail: 'Login failed due to a server error' });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
addRoute('auth/refresh', async (req, res, _p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const { refresh_token } = req.body || {};
  if (!refresh_token) return void res.status(400).json({ detail: 'Refresh token required' });
  const payload = decodeToken(refresh_token);
  if (!payload || payload.type !== 'refresh') return void res.status(401).json({ detail: 'Invalid refresh token' });
  const access_token = createAccessToken({ sub: payload.sub, email: payload.email, role: payload.role });
  res.status(200).json({ access_token, token_type: 'bearer' });
});

// ── POST /api/auth/register/student ──────────────────────────────────────────
addRoute('auth/register/student', async (req, res, _p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const { full_name, email, student_id, password, confirm_password } = req.body || {};
  if (!full_name?.trim() || full_name.trim().length < 2)
    return void res.status(400).json({ detail: 'Full name must be at least 2 characters' });
  if (!student_id?.trim()) return void res.status(400).json({ detail: 'Student ID is required' });
  if (!email) return void res.status(400).json({ detail: 'Email is required' });
  const pwErr = validatePassword(password || '', confirm_password || '');
  if (pwErr) return void res.status(400).json({ detail: pwErr });
  try {
    await ensureDb();
    const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) return void res.status(400).json({ detail: 'Email already registered' });
    const existingProfile = await queryOne<{ id: string }>('SELECT id FROM student_profiles WHERE student_id = $1', [student_id.trim()]);
    if (existingProfile) return void res.status(400).json({ detail: 'Student ID already registered' });
    const password_hash = await hashPassword(password);
    const [user] = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, 'student', true) RETURNING id`,
      [email.toLowerCase(), password_hash]
    );
    await query(`INSERT INTO student_profiles (user_id, full_name, student_id) VALUES ($1, $2, $3)`,
      [user.id, full_name.trim(), student_id.trim()]);
    console.log(`[student-register] New student registered: ${email.toLowerCase()}`);
    res.status(201).json({ message: 'Registration successful', user_id: user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[student-register] Error: ${msg}`);
    res.status(500).json({ detail: 'Registration failed due to a server error' });
  }
});

// ── POST /api/auth/register/admin ─────────────────────────────────────────────
addRoute('auth/register/admin', async (req, res, _p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const { full_name, email, admin_id, password, confirm_password, registration_code } = req.body || {};
  const expectedCode = process.env.ADMIN_REGISTRATION_CODE || '';
  if (!expectedCode) {
    console.error('[admin-register] ADMIN_REGISTRATION_CODE env var is not set');
    return void res.status(500).json({ detail: 'Admin registration is not configured on this server' });
  }
  if (!registration_code || !timingSafeEqual(String(registration_code).trim(), expectedCode.trim()))
    return void res.status(403).json({ detail: 'Invalid administrator registration code' });
  if (!full_name?.trim() || full_name.trim().length < 2)
    return void res.status(400).json({ detail: 'Full name must be at least 2 characters' });
  if (!admin_id?.trim()) return void res.status(400).json({ detail: 'Administrator ID is required' });
  if (!email) return void res.status(400).json({ detail: 'Email is required' });
  const pwErr = validatePassword(password || '', confirm_password || '');
  if (pwErr) return void res.status(400).json({ detail: pwErr });
  try {
    await ensureDb();
    const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) return void res.status(400).json({ detail: 'Email already registered' });
    const existingProfile = await queryOne<{ id: string }>('SELECT id FROM admin_profiles WHERE admin_id = $1', [admin_id.trim()]);
    if (existingProfile) return void res.status(400).json({ detail: 'Administrator ID already registered' });
    const password_hash = await hashPassword(password);
    const [user] = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, 'admin', true) RETURNING id`,
      [email.toLowerCase(), password_hash]
    );
    await query(`INSERT INTO admin_profiles (user_id, full_name, admin_id) VALUES ($1, $2, $3)`,
      [user.id, full_name.trim(), admin_id.trim()]);
    console.log(`[admin-register] New admin registered: ${email.toLowerCase()}`);
    res.status(201).json({ message: 'Administrator account created successfully', user_id: user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin-register] Error: ${msg}`);
    res.status(500).json({ detail: 'Registration failed due to a server error' });
  }
});

// ── GET|POST /api/exams ───────────────────────────────────────────────────────
const DEFAULT_PROCTORING_CONFIG = {
  face_absent_threshold_frames: 3,
  face_absent_warning_seconds: 30,
  multiple_faces_threshold_frames: 2,
  head_pose_yaw_threshold_degrees: 30.0,
  head_pose_pitch_threshold_degrees: 20.0,
  head_pose_violation_frames: 5,
  gaze_away_threshold_frames: 4,
  object_detection_confidence_threshold: 0.6,
  identity_mismatch_confidence_threshold: 0.7,
  warnings_before_disqualification: 3,
  critical_violation_immediate_disqualification: true,
  suspicious_keywords: ['answer', 'help me', 'what is', 'tell me', 'solution', 'give me', 'cheat', 'copy', 'solve this'],
};

addRoute('exams', async (req, res, _p) => {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method === 'GET') {
    let rows;
    if (user.role === 'admin') {
      rows = await query(
        `SELECT id, title, description, created_by, duration_minutes, start_time, end_time,
                allowed_students, status, proctoring_config, created_at, updated_at
         FROM exams ORDER BY created_at DESC`
      );
    } else {
      rows = await query(
        `SELECT id, title, description, created_by, duration_minutes, start_time, end_time,
                allowed_students, status, proctoring_config, created_at, updated_at
         FROM exams WHERE status IN ('active','scheduled') ORDER BY created_at DESC`
      );
    }
    return void res.status(200).json(rows.map(r => ({ ...r, _id: (r as Record<string, unknown>).id })));
  }
  if (req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { title, description = '', duration_minutes = 60, start_time, end_time, proctoring_config } = req.body || {};
    if (!title?.trim()) return void res.status(400).json({ detail: 'Title is required' });
    const config = { ...DEFAULT_PROCTORING_CONFIG, ...(proctoring_config || {}) };
    const [exam] = await query<{ id: string }>(
      `INSERT INTO exams (title, description, created_by, duration_minutes, start_time, end_time, proctoring_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [title.trim(), description, admin.sub, duration_minutes, start_time || null, end_time || null, JSON.stringify(config)]
    );
    return void res.status(201).json({ id: exam.id, message: 'Exam created' });
  }
  res.status(405).json({ detail: 'Method not allowed' });
});

// ── GET|PUT|DELETE /api/exams/:examId ─────────────────────────────────────────
addRoute('exams/:examId', async (req, res, p) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const examId = p.examId;
  if (req.method === 'GET') {
    const exam = await queryOne(
      `SELECT id, title, description, created_by, duration_minutes, start_time, end_time,
              allowed_students, status, proctoring_config, created_at, updated_at
       FROM exams WHERE id = $1`, [examId]
    );
    if (!exam) return void res.status(404).json({ detail: 'Exam not found' });
    return void res.status(200).json({ ...exam, _id: (exam as Record<string, unknown>).id });
  }
  if (req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const updates: string[] = []; const params: unknown[] = []; let idx = 1;
    const body = req.body || {};
    if (body.title !== undefined)             { updates.push(`title = $${idx++}`);              params.push(body.title); }
    if (body.description !== undefined)       { updates.push(`description = $${idx++}`);         params.push(body.description); }
    if (body.duration_minutes !== undefined)  { updates.push(`duration_minutes = $${idx++}`);    params.push(body.duration_minutes); }
    if (body.start_time !== undefined)        { updates.push(`start_time = $${idx++}`);          params.push(body.start_time); }
    if (body.end_time !== undefined)          { updates.push(`end_time = $${idx++}`);            params.push(body.end_time); }
    if (body.proctoring_config !== undefined) { updates.push(`proctoring_config = $${idx++}`);   params.push(JSON.stringify(body.proctoring_config)); }
    if (body.allowed_students !== undefined)  { updates.push(`allowed_students = $${idx++}`);    params.push(body.allowed_students); }
    if (!updates.length) return void res.status(400).json({ detail: 'No fields to update' });
    updates.push(`updated_at = NOW()`);
    params.push(examId);
    const result = await query(`UPDATE exams SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`, params);
    if (!result.length) return void res.status(404).json({ detail: 'Exam not found' });
    return void res.status(200).json({ message: 'Exam updated' });
  }
  if (req.method === 'DELETE') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const exam = await queryOne<{ status: string }>('SELECT status FROM exams WHERE id = $1', [examId]);
    if (!exam) return void res.status(404).json({ detail: 'Exam not found' });
    if (exam.status !== 'draft') return void res.status(400).json({ detail: 'Only draft exams can be deleted' });
    await query('DELETE FROM exams WHERE id = $1', [examId]);
    return void res.status(200).json({ message: 'Exam deleted' });
  }
  res.status(405).json({ detail: 'Method not allowed' });
});

// ── POST /api/exams/:examId/publish ───────────────────────────────────────────
addRoute('exams/:examId/publish', async (req, res, p) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const result = await query(
    `UPDATE exams SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING id`, [p.examId]
  );
  if (!result.length) return void res.status(404).json({ detail: 'Exam not found' });
  res.status(200).json({ message: 'Exam published' });
});

// ── GET|POST /api/exams/:examId/questions ─────────────────────────────────────
addRoute('exams/:examId/questions', async (req, res, p) => {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method === 'GET') {
    const rows = await query(
      `SELECT id, exam_id, "order", question_type, text, options, marks, created_at
       FROM questions WHERE exam_id = $1 ORDER BY "order" ASC`, [p.examId]
    );
    return void res.status(200).json(rows.map(q => ({ ...q, _id: (q as Record<string, unknown>).id })));
  }
  if (req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { question_type = 'mcq', text, options, correct_answer, marks = 1, order } = req.body || {};
    if (!text?.trim()) return void res.status(400).json({ detail: 'Question text is required' });
    const [cnt] = await query<{ count: string }>('SELECT COUNT(*) as count FROM questions WHERE exam_id = $1', [p.examId]);
    const questionOrder = order ?? (parseInt(cnt?.count || '0') + 1);
    const [q] = await query<{ id: string }>(
      `INSERT INTO questions (exam_id, "order", question_type, text, options, correct_answer, marks)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [p.examId, questionOrder, question_type, text.trim(),
       options ? JSON.stringify(options) : null, correct_answer || null, marks]
    );
    return void res.status(201).json({ id: q.id, message: 'Question added' });
  }
  res.status(405).json({ detail: 'Method not allowed' });
});

// ── PUT|DELETE /api/exams/:examId/questions/:questionId ───────────────────────
addRoute('exams/:examId/questions/:questionId', async (req, res, p) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (req.method === 'PUT') {
    const { question_type, text, options, correct_answer, marks, order } = req.body || {};
    const updates: string[] = []; const params: unknown[] = []; let idx = 1;
    if (question_type !== undefined) { updates.push(`question_type = $${idx++}`); params.push(question_type); }
    if (text !== undefined)          { updates.push(`text = $${idx++}`);           params.push(text); }
    if (options !== undefined)       { updates.push(`options = $${idx++}`);        params.push(options ? JSON.stringify(options) : null); }
    if (correct_answer !== undefined){ updates.push(`correct_answer = $${idx++}`); params.push(correct_answer); }
    if (marks !== undefined)         { updates.push(`marks = $${idx++}`);          params.push(marks); }
    if (order !== undefined)         { updates.push(`"order" = $${idx++}`);        params.push(order); }
    if (!updates.length) return void res.status(400).json({ detail: 'Nothing to update' });
    params.push(p.questionId);
    const result = await query(
      `UPDATE questions SET ${updates.join(', ')} WHERE id = $${idx} AND exam_id = $${idx + 1} RETURNING id`,
      [...params, p.examId]
    );
    if (!result.length) return void res.status(404).json({ detail: 'Question not found' });
    return void res.status(200).json({ message: 'Question updated' });
  }
  if (req.method === 'DELETE') {
    await query('DELETE FROM questions WHERE id = $1 AND exam_id = $2', [p.questionId, p.examId]);
    return void res.status(200).json({ message: 'Question deleted' });
  }
  res.status(405).json({ detail: 'Method not allowed' });
});

// ── POST /api/exams/:examId/students ──────────────────────────────────────────
addRoute('exams/:examId/students', async (req, res, p) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const studentIds: string[] = req.body;
  if (!Array.isArray(studentIds)) return void res.status(400).json({ detail: 'Expected array of student IDs' });
  await query(
    `UPDATE exams SET allowed_students = ARRAY(SELECT DISTINCT unnest(allowed_students || $1::text[])), updated_at = NOW() WHERE id = $2`,
    [studentIds, p.examId]
  );
  res.status(200).json({ message: `Assigned ${studentIds.length} students` });
});

// ── DELETE /api/exams/:examId/students/:uid ───────────────────────────────────
addRoute('exams/:examId/students/:uid', async (req, res, p) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'DELETE') return void res.status(405).json({ detail: 'Method not allowed' });
  await query(
    `UPDATE exams SET allowed_students = ARRAY_REMOVE(allowed_students, $1), updated_at = NOW() WHERE id = $2`,
    [p.uid, p.examId]
  );
  res.status(200).json({ message: 'Student removed' });
});

// ── POST /api/attempts ────────────────────────────────────────────────────────
addRoute('attempts', async (req, res, _p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const student = requireStudent(req, res);
  if (!student) return;
  const { exam_id } = req.body || {};
  if (!exam_id) return void res.status(400).json({ detail: 'exam_id required' });
  const exam = await queryOne<{
    id: string; status: string; allowed_students: string[]; duration_minutes: number;
    proctoring_config: Record<string, unknown>;
  }>(`SELECT id, status, allowed_students, duration_minutes, proctoring_config FROM exams WHERE id = $1`, [exam_id]);
  if (!exam) return void res.status(404).json({ detail: 'Exam not found' });
  if (exam.status !== 'active') return void res.status(400).json({ detail: 'Exam is not active' });
  const allowed = exam.allowed_students || [];
  if (allowed.length > 0 && !allowed.includes(student.sub))
    return void res.status(403).json({ detail: 'You are not assigned to this exam' });
  const existing = await queryOne<{ id: string; started_at: string }>(
    `SELECT id, started_at FROM exam_attempts WHERE exam_id = $1 AND student_id = $2 AND status = 'in_progress'`,
    [exam_id, student.sub]
  );
  if (existing) {
    const session = await queryOne<{ id: string }>('SELECT id FROM proctoring_sessions WHERE attempt_id = $1', [existing.id]);
    const elapsed = Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000);
    const remaining = Math.max(0, exam.duration_minutes * 60 - elapsed);
    return void res.status(200).json({ attempt_id: existing.id, session_id: session?.id || null, time_remaining_seconds: remaining, resumed: true });
  }
  const finished = await queryOne<{ status: string }>(
    `SELECT status FROM exam_attempts WHERE exam_id = $1 AND student_id = $2 AND status IN ('submitted','disqualified')`,
    [exam_id, student.sub]
  );
  if (finished) return void res.status(400).json({ detail: `Attempt already ${finished.status}` });
  const [attempt] = await query<{ id: string }>(
    `INSERT INTO exam_attempts (exam_id, student_id, status, time_remaining_seconds) VALUES ($1, $2, 'in_progress', $3) RETURNING id`,
    [exam_id, student.sub, exam.duration_minutes * 60]
  );
  const profile = await queryOne<{ face_encoding: unknown }>('SELECT face_encoding FROM student_profiles WHERE user_id = $1', [student.sub]);
  const [session] = await query<{ id: string }>(
    `INSERT INTO proctoring_sessions (attempt_id, student_id, exam_id, face_encoding, demo_mode, vstate) VALUES ($1, $2, $3, $4, $5, '{}') RETURNING id`,
    [attempt.id, student.sub, exam_id, JSON.stringify(profile?.face_encoding || null), DEMO_MODE]
  );
  res.status(201).json({ attempt_id: attempt.id, session_id: session.id, time_remaining_seconds: exam.duration_minutes * 60, resumed: false });
});

// ── GET /api/attempts/:attemptId ─────────────────────────────────────────────
addRoute('attempts/:attemptId', async (req, res, p) => {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const attempt = await queryOne<{
    id: string; exam_id: string; student_id: string; status: string;
    started_at: string; submitted_at: string | null; time_remaining_seconds: number;
  }>(`SELECT id, exam_id, student_id, status, started_at, submitted_at, time_remaining_seconds FROM exam_attempts WHERE id = $1`, [p.attemptId]);
  if (!attempt) return void res.status(404).json({ detail: 'Attempt not found' });
  if (user.role !== 'admin' && attempt.student_id !== user.sub) return void res.status(403).json({ detail: 'Access denied' });
  if (attempt.status === 'in_progress') {
    const exam = await queryOne<{ duration_minutes: number }>('SELECT duration_minutes FROM exams WHERE id = $1', [attempt.exam_id]);
    const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
    const remaining = Math.max(0, (exam?.duration_minutes || 60) * 60 - elapsed);
    (attempt as Record<string, unknown>).time_remaining_seconds = remaining;
    if (remaining === 0) {
      await query(`UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW() WHERE id = $1`, [p.attemptId]);
      await query(`UPDATE proctoring_sessions SET status = 'ended', ended_at = NOW() WHERE attempt_id = $1`, [p.attemptId]);
      (attempt as Record<string, unknown>).status = 'submitted';
    }
  }
  res.status(200).json({ ...attempt, _id: attempt.id });
});

// ── GET|PUT /api/attempts/:attemptId/answers ──────────────────────────────────
addRoute('attempts/:attemptId/answers', async (req, res, p) => {
  if (req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    const attempt = await queryOne<{ student_id: string }>('SELECT student_id FROM exam_attempts WHERE id = $1', [p.attemptId]);
    if (!attempt) return void res.status(404).json({ detail: 'Attempt not found' });
    if (user.role !== 'admin' && attempt.student_id !== user.sub) return void res.status(403).json({ detail: 'Access denied' });
    const answers = await query(`SELECT id, attempt_id, question_id, response, saved_at, is_final FROM answers WHERE attempt_id = $1`, [p.attemptId]);
    return void res.status(200).json(answers.map(a => ({ ...a, _id: (a as Record<string, unknown>).id })));
  }
  if (req.method === 'PUT') {
    const student = requireStudent(req, res);
    if (!student) return;
    const attempt = await queryOne<{ student_id: string; status: string }>('SELECT student_id, status FROM exam_attempts WHERE id = $1', [p.attemptId]);
    if (!attempt) return void res.status(404).json({ detail: 'Attempt not found' });
    if (attempt.student_id !== student.sub) return void res.status(403).json({ detail: 'Access denied' });
    if (attempt.status !== 'in_progress') return void res.status(400).json({ detail: `Attempt is ${attempt.status}, cannot save answers` });
    const answers: Array<{ question_id: string; response: string }> = req.body;
    if (!Array.isArray(answers)) return void res.status(400).json({ detail: 'Expected array of answers' });
    for (const ans of answers) {
      await query(
        `INSERT INTO answers (attempt_id, question_id, response) VALUES ($1, $2, $3)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET response = EXCLUDED.response, saved_at = NOW(), is_final = FALSE`,
        [p.attemptId, ans.question_id, ans.response || '']
      );
    }
    return void res.status(200).json({ message: `Saved ${answers.length} answers` });
  }
  res.status(405).json({ detail: 'Method not allowed' });
});

// ── POST /api/attempts/:attemptId/submit ──────────────────────────────────────
addRoute('attempts/:attemptId/submit', async (req, res, p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const student = requireStudent(req, res);
  if (!student) return;
  const attempt = await queryOne<{ student_id: string; status: string }>('SELECT student_id, status FROM exam_attempts WHERE id = $1', [p.attemptId]);
  if (!attempt) return void res.status(404).json({ detail: 'Attempt not found' });
  if (attempt.student_id !== student.sub) return void res.status(403).json({ detail: 'Access denied' });
  if (attempt.status !== 'in_progress') return void res.status(400).json({ detail: `Attempt already ${attempt.status}` });
  await query(`UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW() WHERE id = $1`, [p.attemptId]);
  await query(`UPDATE answers SET is_final = TRUE WHERE attempt_id = $1`, [p.attemptId]);
  await query(`UPDATE proctoring_sessions SET status = 'ended', ended_at = NOW() WHERE attempt_id = $1`, [p.attemptId]);
  const session = await queryOne<{ id: string }>('SELECT id FROM proctoring_sessions WHERE attempt_id = $1', [p.attemptId]);
  if (session) generateReport(session.id).catch(console.error);
  res.status(200).json({ message: 'Exam submitted successfully' });
});

// ── GET /api/students/profile ─────────────────────────────────────────────────
addRoute('students/profile', async (req, res, _p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const user = requireAuth(req, res);
  if (!user) return;
  const profile = await queryOne(
    `SELECT sp.id, sp.user_id, sp.full_name, sp.student_id, sp.is_face_enrolled, sp.enrolled_at, sp.created_at
     FROM student_profiles sp WHERE sp.user_id = $1`, [user.sub]
  );
  if (!profile) return void res.status(404).json({ detail: 'Profile not found' });
  res.status(200).json({ ...profile, _id: (profile as Record<string, unknown>).id });
});

// ── POST /api/students/enrol-face ─────────────────────────────────────────────
addRoute('students/enrol-face', async (req, res, _p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const student = requireStudent(req, res);
  if (!student) return;
  let imageB64: string | null = null;
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('multipart/form-data')) {
    imageB64 = await parseMultipartImageB64(req);
  } else if (contentType.includes('application/json')) {
    imageB64 = req.body?.image_b64 || null;
  }
  if (!imageB64) return void res.status(400).json({ detail: 'No image provided. Send multipart/form-data with a file field.' });
  const b64Data = imageB64.includes(',') ? imageB64.split(',')[1] : imageB64;
  const bytes = Buffer.from(b64Data, 'base64');
  if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024)
    return void res.status(400).json({ detail: `File too large (max ${MAX_UPLOAD_MB}MB)` });
  const encoding = generateDemoEncoding(b64Data);
  await query(
    `UPDATE student_profiles SET face_encoding = $1, face_image_b64 = $2, is_face_enrolled = TRUE, enrolled_at = NOW() WHERE user_id = $3`,
    [JSON.stringify(encoding), b64Data.substring(0, 50000), student.sub]
  );
  res.status(200).json({ success: true, message: 'Face enrolled (DEMO MODE — simulated encoding)', demo: true });
});

// ── POST /api/proctoring/events ───────────────────────────────────────────────
addRoute('proctoring/events', async (req, res, _p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const student = requireStudent(req, res);
  if (!student) return;
  const { session_id, type, data } = req.body || {};
  if (!session_id) return void res.status(400).json({ detail: 'session_id required' });
  const session = await queryOne<{
    id: string; student_id: string; exam_id: string; status: string;
    warning_count: number; is_disqualified: boolean; face_encoding: unknown;
    demo_mode: boolean; vstate: Record<string, unknown>;
  }>(
    `SELECT id, student_id, exam_id, status, warning_count, is_disqualified, face_encoding, demo_mode, vstate
     FROM proctoring_sessions WHERE id = $1`, [session_id]
  );
  if (!session) return void res.status(404).json({ detail: 'Session not found' });
  if (session.student_id !== student.sub) return void res.status(403).json({ detail: 'Forbidden' });
  if (session.is_disqualified) return void res.status(200).json({ disqualified: true, message: 'Session already terminated' });
  const exam = await queryOne<{ proctoring_config: Record<string, unknown> }>('SELECT proctoring_config FROM exams WHERE id = $1', [session.exam_id]);
  const config: Record<string, unknown> = exam?.proctoring_config || {};
  const sessionData: { warning_count: number; is_disqualified: boolean; config: Record<string, unknown> } = {
    warning_count: session.warning_count, is_disqualified: session.is_disqualified, config,
  };
  const isDemo = DEMO_MODE || session.demo_mode;
  const results: unknown[] = [];

  if (type === 'frame') {
    const aiResult = analyseFrameDemo(data || '');
    const vstate = (session.vstate || {}) as Record<string, number>;
    vstate.face_absent_frames    = aiResult.face_count === 0 ? (vstate.face_absent_frames || 0) + 1 : 0;
    vstate.multiple_faces_frames = aiResult.face_count > 1  ? (vstate.multiple_faces_frames || 0) + 1 : 0;
    vstate.pose_frames = (aiResult.pose.yaw > 30 || aiResult.pose.pitch > 20) ? (vstate.pose_frames || 0) + 1 : 0;
    vstate.gaze_frames = aiResult.gaze.looking_away ? (vstate.gaze_frames || 0) + 1 : 0;
    await query(`UPDATE proctoring_sessions SET vstate = $1 WHERE id = $2`, [JSON.stringify(vstate), session_id]);
    const events: Array<{ type: string; confidence: number; meta: Record<string, unknown> }> = [];
    if (vstate.face_absent_frames    >= ((config.face_absent_threshold_frames    as number) || 3)) events.push({ type: 'face_absent',        confidence: 1.0,  meta: { face_count: aiResult.face_count } });
    if (vstate.multiple_faces_frames >= ((config.multiple_faces_threshold_frames as number) || 2)) {
      events.push({ type: 'multiple_faces',    confidence: 0.9,  meta: { face_count: aiResult.face_count } });
      events.push({ type: 'additional_person', confidence: 0.85, meta: {} });
    }
    if (!aiResult.identity.is_match && aiResult.identity.confidence >= ((config.identity_mismatch_confidence_threshold as number) || 0.7))
      events.push({ type: 'identity_mismatch', confidence: aiResult.identity.confidence, meta: {} });
    if (vstate.pose_frames >= ((config.head_pose_violation_frames as number) || 5))
      events.push({ type: 'head_pose_violation', confidence: 0.8, meta: aiResult.pose });
    if (vstate.gaze_frames >= ((config.gaze_away_threshold_frames as number) || 4))
      events.push({ type: 'gaze_violation', confidence: aiResult.gaze.confidence, meta: {} });
    for (const evt of events) {
      if (sessionData.is_disqualified) break;
      const r = await processProctoringEvent(session_id, student.sub, session.exam_id, evt.type, evt.confidence, evt.meta, sessionData, isDemo);
      if (r.disqualified) sessionData.is_disqualified = true;
      results.push(r);
    }
    if (aiResult.identity.is_match && aiResult.identity.confidence >= 0.6)
      await query(`UPDATE proctoring_sessions SET identity_verified = TRUE, identity_confidence = $1 WHERE id = $2`, [aiResult.identity.confidence, session_id]);
    const last = results[results.length - 1] as Record<string, unknown> | undefined;
    return void res.status(200).json({
      face_count: aiResult.face_count, identity: aiResult.identity, pose: aiResult.pose,
      gaze: aiResult.gaze, objects: [],
      warning: last?.warning || null, disqualified: sessionData.is_disqualified,
      disqualification_message: last?.disqualification_message, demo: isDemo,
    });
  }

  if (type === 'audio') {
    const aiResult = analyseAudioDemo(data || '');
    const events: Array<{ type: string; confidence: number; meta: Record<string, unknown> }> = [];
    if (aiResult.suspicious_speech && aiResult.matched_keywords.length > 0)
      events.push({ type: 'suspicious_speech',      confidence: 0.75, meta: { keywords: aiResult.matched_keywords } });
    if (aiResult.speaker_count > 1)
      events.push({ type: 'multiple_speakers',       confidence: 0.85, meta: { speaker_count: aiResult.speaker_count } });
    if (aiResult.background_conversation)
      events.push({ type: 'background_conversation', confidence: 0.75, meta: {} });
    for (const evt of events) {
      if (sessionData.is_disqualified) break;
      const r = await processProctoringEvent(session_id, student.sub, session.exam_id, evt.type, evt.confidence, evt.meta, sessionData, isDemo);
      if (r.disqualified) sessionData.is_disqualified = true;
      results.push(r);
    }
    const last = results[results.length - 1] as Record<string, unknown> | undefined;
    return void res.status(200).json({
      transcript: aiResult.transcript, speaker_count: aiResult.speaker_count,
      warning: last?.warning || null, disqualified: sessionData.is_disqualified, demo: isDemo,
    });
  }
  res.status(400).json({ detail: 'Unknown event type' });
});

// ── POST /api/proctoring/heartbeat ────────────────────────────────────────────
addRoute('proctoring/heartbeat', async (req, res, _p) => {
  if (req.method !== 'POST') return void res.status(405).json({ detail: 'Method not allowed' });
  const student = requireStudent(req, res);
  if (!student) return;
  const { session_id } = req.body || {};
  if (!session_id) return void res.status(400).json({ detail: 'session_id required' });
  const session = await queryOne<{
    id: string; student_id: string; status: string;
    warning_count: number; is_disqualified: boolean; disqualification_reason: string | null; demo_mode: boolean;
  }>(
    `SELECT id, student_id, status, warning_count, is_disqualified, disqualification_reason, demo_mode
     FROM proctoring_sessions WHERE id = $1`, [session_id]
  );
  if (!session) return void res.status(404).json({ detail: 'Session not found' });
  if (session.student_id !== student.sub) return void res.status(403).json({ detail: 'Forbidden' });
  res.status(200).json({
    session_id, status: session.status, warning_count: session.warning_count,
    is_disqualified: session.is_disqualified, disqualification_reason: session.disqualification_reason,
    demo_mode: session.demo_mode, timestamp: new Date().toISOString(),
  });
});

// ── GET /api/proctoring/session/:sessionId ────────────────────────────────────
addRoute('proctoring/session/:sessionId', async (req, res, p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const user = requireAuth(req, res);
  if (!user) return;
  const session = await queryOne(
    `SELECT id, status, warning_count, is_disqualified, disqualification_reason, demo_mode, started_at, ended_at
     FROM proctoring_sessions WHERE id = $1`, [p.sessionId]
  );
  if (!session) return void res.status(404).json({ detail: 'Session not found' });
  res.status(200).json({ ...session, _id: (session as Record<string, unknown>).id });
});

// ── GET /api/admin/dashboard/stats ───────────────────────────────────────────
addRoute('admin/dashboard/stats', async (req, res, _p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [
    totalExams, activeExams, totalStudents, activeSessions,
    violationsToday, disqToday, totalViolations, totalReports, pendingReviews,
  ] = await Promise.all([
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM exams'),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM exams WHERE status = 'active'`),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM users WHERE role = 'student'`),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM proctoring_sessions WHERE status = 'active'`),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM violations WHERE created_at >= $1`, [today.toISOString()]),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM disqualifications WHERE disqualified_at >= $1`, [today.toISOString()]),
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM violations'),
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM proctoring_reports'),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM violations WHERE status = 'open' AND severity IN ('high','critical')`),
  ]);
  res.status(200).json({
    total_exams:              parseInt(totalExams?.count || '0'),
    active_exams:             parseInt(activeExams?.count || '0'),
    total_students:           parseInt(totalStudents?.count || '0'),
    active_sessions:          parseInt(activeSessions?.count || '0'),
    violations_today:         parseInt(violationsToday?.count || '0'),
    disqualifications_today:  parseInt(disqToday?.count || '0'),
    total_violations:         parseInt(totalViolations?.count || '0'),
    total_reports:            parseInt(totalReports?.count || '0'),
    pending_reviews:          parseInt(pendingReviews?.count || '0'),
  });
});

// ── GET /api/admin/dashboard/violations-chart ─────────────────────────────────
addRoute('admin/dashboard/violations-chart', async (req, res, _p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const days = parseInt(req.query.days as string) || 7;
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(); dayStart.setDate(dayStart.getDate() - i); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const [row] = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM violations WHERE created_at >= $1 AND created_at < $2`,
      [dayStart.toISOString(), dayEnd.toISOString()]
    );
    result.push({ date: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`, count: parseInt(row?.count || '0') });
  }
  res.status(200).json(result);
});

// ── GET /api/admin/sessions ───────────────────────────────────────────────────
addRoute('admin/sessions', async (req, res, _p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const skip   = parseInt(req.query.skip  as string) || 0;
  const limit  = parseInt(req.query.limit as string) || 50;
  const status = req.query.status as string | undefined;
  const params: unknown[] = [];
  let sql = `
    SELECT ps.id, ps.attempt_id, ps.student_id, ps.exam_id, ps.status,
           ps.warning_count, ps.is_disqualified, ps.demo_mode, ps.started_at, ps.ended_at,
           sp.full_name AS student_name, sp.student_id AS student_student_id, e.title AS exam_title
    FROM proctoring_sessions ps
    LEFT JOIN student_profiles sp ON sp.user_id = ps.student_id
    LEFT JOIN exams e ON e.id = ps.exam_id
  `;
  if (status) { sql += ` WHERE ps.status = $1`; params.push(status); }
  sql += ` ORDER BY ps.started_at DESC OFFSET $${params.length + 1} LIMIT $${params.length + 2}`;
  params.push(skip, limit);
  const rows = await query(sql, params);
  res.status(200).json(rows.map(s => ({ ...s, _id: (s as Record<string, unknown>).id })));
});

// ── GET /api/admin/sessions/:sessionId ───────────────────────────────────────
addRoute('admin/sessions/:sessionId', async (req, res, p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const session = await queryOne(
    `SELECT ps.id, ps.attempt_id, ps.student_id, ps.exam_id, ps.status,
            ps.warning_count, ps.is_disqualified, ps.disqualification_reason, ps.demo_mode,
            ps.started_at, ps.ended_at,
            sp.full_name AS student_name, sp.student_id AS student_student_id,
            u.email AS student_email,
            e.title AS exam_title, e.duration_minutes AS exam_duration_minutes
     FROM proctoring_sessions ps
     LEFT JOIN student_profiles sp ON sp.user_id = ps.student_id
     LEFT JOIN users u ON u.id = ps.student_id
     LEFT JOIN exams e ON e.id = ps.exam_id
     WHERE ps.id = $1`, [p.sessionId]
  );
  if (!session) return void res.status(404).json({ detail: 'Session not found' });
  const violations = await query(
    `SELECT v.id, v.violation_type, v.severity, v.confidence, v.status,
            v.warning_number, v.is_demo, v.metadata, v.created_at, sp.full_name AS student_name
     FROM violations v
     LEFT JOIN student_profiles sp ON sp.user_id = v.student_id
     WHERE v.session_id = $1 ORDER BY v.created_at DESC`, [p.sessionId]
  );
  const [eventRow] = await query<{ count: string }>('SELECT COUNT(*) as count FROM proctoring_events WHERE session_id = $1', [p.sessionId]);
  const s = session as Record<string, unknown>;
  let duration_seconds: number | null = null;
  if (s.started_at && s.ended_at)
    duration_seconds = Math.floor((new Date(s.ended_at as string).getTime() - new Date(s.started_at as string).getTime()) / 1000);
  res.status(200).json({
    ...session, _id: s.id,
    violations: violations.map(v => ({ ...v, _id: (v as Record<string, unknown>).id })),
    event_count: parseInt(eventRow?.count || '0'),
    duration_seconds,
  });
});

// ── GET /api/admin/students ───────────────────────────────────────────────────
addRoute('admin/students', async (req, res, _p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const skip  = parseInt(req.query.skip  as string) || 0;
  const limit = parseInt(req.query.limit as string) || 50;
  const students = await query(
    `SELECT u.id, u.email, u.role, u.is_active, u.created_at,
            sp.full_name, sp.student_id, sp.is_face_enrolled, sp.enrolled_at
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.role = 'student'
     ORDER BY u.created_at DESC OFFSET $1 LIMIT $2`, [skip, limit]
  );
  res.status(200).json(students.map(s => ({
    ...s, _id: (s as Record<string, unknown>).id,
    profile: {
      full_name:       (s as Record<string, unknown>).full_name,
      student_id:      (s as Record<string, unknown>).student_id,
      is_face_enrolled:(s as Record<string, unknown>).is_face_enrolled,
    },
  })));
});

// ── GET /api/admin/students/:studentId ───────────────────────────────────────
addRoute('admin/students/:studentId', async (req, res, p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const student = await queryOne(
    `SELECT u.id, u.email, u.role, u.is_active, u.created_at, sp.full_name, sp.student_id, sp.is_face_enrolled, sp.enrolled_at
     FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1`, [p.studentId]
  );
  if (!student) return void res.status(404).json({ detail: 'Student not found' });
  res.status(200).json({
    ...student, _id: (student as Record<string, unknown>).id,
    profile: {
      full_name:       (student as Record<string, unknown>).full_name,
      student_id:      (student as Record<string, unknown>).student_id,
      is_face_enrolled:(student as Record<string, unknown>).is_face_enrolled,
    },
  });
});

// ── GET /api/admin/violations ─────────────────────────────────────────────────
addRoute('admin/violations', async (req, res, _p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const skip       = parseInt(req.query.skip       as string) || 0;
  const limit      = parseInt(req.query.limit      as string) || 50;
  const severity   = req.query.severity   as string | undefined;
  const status     = req.query.status     as string | undefined;
  const exam_id    = req.query.exam_id    as string | undefined;
  const student_id = req.query.student_id as string | undefined;
  const conds: string[] = []; const params: unknown[] = []; let idx = 1;
  if (severity)   { conds.push(`v.severity = $${idx++}`);   params.push(severity); }
  if (status)     { conds.push(`v.status = $${idx++}`);     params.push(status); }
  if (exam_id)    { conds.push(`v.exam_id = $${idx++}`);    params.push(exam_id); }
  if (student_id) { conds.push(`v.student_id = $${idx++}`); params.push(student_id); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await query(
    `SELECT v.id, v.session_id, v.student_id, v.exam_id, v.violation_type, v.severity,
            v.confidence, v.status, v.warning_number, v.is_demo, v.metadata, v.created_at,
            sp.full_name AS student_name
     FROM violations v
     LEFT JOIN student_profiles sp ON sp.user_id = v.student_id
     ${where} ORDER BY v.created_at DESC OFFSET $${idx} LIMIT $${idx + 1}`,
    [...params, skip, limit]
  );
  const [totalRow] = await query<{ count: string }>(`SELECT COUNT(*) as count FROM violations v ${where}`, params);
  res.status(200).json({
    violations: rows.map(v => ({ ...v, _id: (v as Record<string, unknown>).id })),
    total: parseInt(totalRow?.count || '0'),
  });
});

// ── PUT /api/admin/violations/:violationId/review ─────────────────────────────
addRoute('admin/violations/:violationId/review', async (req, res, p) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'PUT') return void res.status(405).json({ detail: 'Method not allowed' });
  const { status = 'reviewed', review_notes = '' } = req.body || {};
  const result = await query(
    `UPDATE violations SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4 RETURNING id`,
    [status, review_notes, admin.sub, p.violationId]
  );
  if (!result.length) return void res.status(404).json({ detail: 'Violation not found' });
  res.status(200).json({ message: 'Violation reviewed' });
});

// ── GET /api/admin/reports ────────────────────────────────────────────────────
addRoute('admin/reports', async (req, res, _p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const skip  = parseInt(req.query.skip  as string) || 0;
  const limit = parseInt(req.query.limit as string) || 50;
  const rows = await query(
    `SELECT pr.id, pr.session_id, pr.student_id, pr.exam_id,
            pr.risk_score, pr.risk_level, pr.warning_count,
            pr.disqualification_status, pr.submission_status,
            pr.violation_summary, pr.generated_at,
            sp.full_name AS student_name, e.title AS exam_title
     FROM proctoring_reports pr
     LEFT JOIN student_profiles sp ON sp.user_id = pr.student_id
     LEFT JOIN exams e ON e.id = pr.exam_id
     ORDER BY pr.generated_at DESC OFFSET $1 LIMIT $2`, [skip, limit]
  );
  res.status(200).json(rows.map(r => ({ ...r, _id: (r as Record<string, unknown>).id })));
});

// ── GET /api/admin/reports/:sessionId ─────────────────────────────────────────
addRoute('admin/reports/:sessionId', async (req, res, p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  let report = await queryOne(
    `SELECT pr.*, sp.full_name AS student_name, e.title AS exam_title
     FROM proctoring_reports pr
     LEFT JOIN student_profiles sp ON sp.user_id = pr.student_id
     LEFT JOIN exams e ON e.id = pr.exam_id
     WHERE pr.session_id = $1`, [p.sessionId]
  );
  if (!report) {
    const generated = await generateReport(p.sessionId);
    if (!generated) return void res.status(404).json({ detail: 'Report not found' });
    report = generated;
  }
  res.status(200).json({ ...report, _id: (report as Record<string, unknown>).id });
});

// ── GET /api/admin/disqualifications ──────────────────────────────────────────
addRoute('admin/disqualifications', async (req, res, _p) => {
  if (req.method !== 'GET') return void res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const skip  = parseInt(req.query.skip  as string) || 0;
  const limit = parseInt(req.query.limit as string) || 50;
  const rows = await query(
    `SELECT d.id, d.session_id, d.student_id, d.exam_id, d.reason,
            d.disqualified_at, d.review_status,
            sp.full_name AS student_name, e.title AS exam_title
     FROM disqualifications d
     LEFT JOIN student_profiles sp ON sp.user_id = d.student_id
     LEFT JOIN exams e ON e.id = d.exam_id
     ORDER BY d.disqualified_at DESC OFFSET $1 LIMIT $2`, [skip, limit]
  );
  res.status(200).json(rows.map(d => ({ ...d, _id: (d as Record<string, unknown>).id })));
});

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

const SEVERITY_MAP: Record<string, string> = {
  face_absent: 'medium', multiple_faces: 'high', identity_mismatch: 'critical',
  head_pose_violation: 'low', gaze_violation: 'low', object_detected: 'high',
  additional_person: 'high', suspicious_speech: 'medium',
  multiple_speakers: 'high', background_conversation: 'medium',
};
const WARNING_TRIGGERS = new Set([
  'face_absent', 'multiple_faces', 'object_detected', 'additional_person',
  'suspicious_speech', 'multiple_speakers', 'background_conversation',
]);
const VIOLATION_MESSAGES: Record<string, string> = {
  face_absent: 'Your face is not visible. Please ensure your face is clearly visible.',
  multiple_faces: 'Multiple faces detected. This is not allowed during the examination.',
  identity_mismatch: 'Identity verification failed. Your face does not match the enrolled photo.',
  head_pose_violation: 'Please keep your head facing forward.',
  gaze_violation: 'Please keep your eyes on the screen.',
  object_detected: 'Prohibited object detected. Please remove it immediately.',
  additional_person: 'An additional person has been detected.',
  suspicious_speech: 'Suspicious speech or keywords detected.',
  multiple_speakers: 'Multiple speakers detected.',
  background_conversation: 'Background conversation detected.',
};

async function processProctoringEvent(
  sessionId: string, studentId: string, examId: string,
  eventType: string, confidence: number, metadata: Record<string, unknown>,
  sessionData: { warning_count: number; is_disqualified: boolean; config: Record<string, unknown> },
  isDemo: boolean,
): Promise<{ warning: unknown; disqualified: boolean; disqualification_message?: string }> {
  const severity        = SEVERITY_MAP[eventType] || 'low';
  const triggersWarning = WARNING_TRIGGERS.has(eventType);
  const warningsBefore  = (sessionData.config.warnings_before_disqualification as number) || 3;
  const immediateDisq   = (sessionData.config.critical_violation_immediate_disqualification as boolean) !== false;
  const cutoff = new Date(Date.now() - 30000).toISOString();
  const existing = await queryOne(
    `SELECT id FROM violations WHERE session_id = $1 AND violation_type = $2 AND created_at >= $3`,
    [sessionId, eventType, cutoff]
  );
  if (existing && !['identity_mismatch', 'object_detected'].includes(eventType))
    return { warning: null, disqualified: false };
  const [evt] = await query<{ id: string }>(
    `INSERT INTO proctoring_events (session_id, student_id, event_type, raw_payload, confidence, is_demo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [sessionId, studentId, eventType, JSON.stringify(metadata), confidence, isDemo]
  );
  const warningNumber: number | null = triggersWarning ? sessionData.warning_count + 1 : null;
  await query(
    `INSERT INTO violations (session_id, student_id, exam_id, event_id, violation_type, severity,
      confidence, warning_number, is_demo, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [sessionId, studentId, examId, evt.id, eventType, severity, confidence, warningNumber, isDemo, JSON.stringify(metadata)]
  );
  if (severity === 'critical' && immediateDisq) {
    await disqualifySession(sessionId, studentId, examId, eventType);
    return { warning: null, disqualified: true, disqualification_message: `You have been disqualified: ${VIOLATION_MESSAGES[eventType]}` };
  }
  let warning = null; let disqualified = false; let disqualification_message: string | undefined;
  if (triggersWarning) {
    const newCount = sessionData.warning_count + 1;
    const msg = `Warning ${newCount}/${warningsBefore}: ${VIOLATION_MESSAGES[eventType] || 'Suspicious activity'}`;
    await query(`UPDATE proctoring_sessions SET warning_count = $1 WHERE id = $2`, [newCount, sessionId]);
    sessionData.warning_count = newCount;
    warning = { number: newCount, message: msg, max_warnings: warningsBefore };
    if (newCount >= warningsBefore) {
      await disqualifySession(sessionId, studentId, examId, `Exceeded ${warningsBefore} warnings`);
      disqualified = true;
      disqualification_message = `You have been automatically disqualified after ${warningsBefore} warnings.`;
    }
  }
  return { warning, disqualified, disqualification_message };
}

async function disqualifySession(sessionId: string, studentId: string, examId: string, reason: string) {
  await query(
    `UPDATE proctoring_sessions SET is_disqualified = TRUE, disqualification_reason = $1, status = 'ended', ended_at = NOW() WHERE id = $2`,
    [reason, sessionId]
  );
  const session = await queryOne<{ attempt_id: string }>('SELECT attempt_id FROM proctoring_sessions WHERE id = $1', [sessionId]);
  if (session) await query(`UPDATE exam_attempts SET status = 'disqualified', submitted_at = NOW() WHERE id = $1`, [session.attempt_id]);
  await query(
    `INSERT INTO disqualifications (session_id, student_id, exam_id, reason) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [sessionId, studentId, examId, reason]
  );
  generateReport(sessionId).catch(console.error);
}

function generateDemoEncoding(b64: string): number[] {
  const seed = b64.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i % 7 + 1), 0);
  return Array.from({ length: 128 }, (_, i) => {
    const x = Math.sin(seed + i * 127.1) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  });
}

async function parseMultipartImageB64(req: VercelRequest): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw  = Buffer.concat(chunks);
        const body = raw.toString('binary');
        const boundary = (req.headers['content-type'] || '').split('boundary=')[1];
        if (!boundary) { resolve(null); return; }
        const parts = body.split(`--${boundary}`);
        for (const part of parts) {
          if (part.includes('Content-Disposition') && part.includes('filename=')) {
            const headerEnd = part.indexOf('\r\n\r\n');
            if (headerEnd === -1) continue;
            const fileData = part.slice(headerEnd + 4, part.lastIndexOf('\r\n'));
            resolve(Buffer.from(fileData, 'binary').toString('base64'));
            return;
          }
        }
        resolve(null);
      } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const dummy = b.padEnd(a.length, '\0');
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(dummy));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawSlug = req.query.slug;
  const slug: string[] = Array.isArray(rawSlug) ? rawSlug : rawSlug ? [rawSlug] : [];

  const match = matchRoute(slug);
  if (!match) {
    return res.status(404).json({ detail: `API route not found: /api/${slug.join('/')}` });
  }

  for (const [k, v] of Object.entries(match.params)) {
    (req.query as Record<string, string>)[k] = v;
  }

  try {
    await match.handler(req, res, match.params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/${slug.join('/')}] Unhandled error: ${msg}`);
    if (!res.headersSent) {
      res.status(500).json({ detail: 'Internal server error' });
    }
  }
}

export const config = {
  api: {
    bodyParser: {
      // sizeLimit must be a static string — Vercel's static-config parser
      // cannot evaluate TemplateLiterals or runtime expressions.
      // The runtime size check inside the enrol-face handler (bytes.length)
      // enforces the actual MAX_UPLOAD_SIZE_MB env var independently.
      sizeLimit: '10mb',
    },
  },
};
