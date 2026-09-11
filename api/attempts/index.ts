import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../db/client';
import { requireStudent } from '../_lib/auth';

const DEMO_MODE = process.env.DEMO_MODE !== 'false';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const student = requireStudent(req, res);
  if (!student) return;

  const { exam_id } = req.body || {};
  if (!exam_id) return res.status(400).json({ detail: 'exam_id required' });

  const exam = await queryOne<{
    id: string; status: string; allowed_students: string[]; duration_minutes: number;
    proctoring_config: Record<string, unknown>;
  }>(
    `SELECT id, status, allowed_students, duration_minutes, proctoring_config FROM exams WHERE id = $1`,
    [exam_id]
  );
  if (!exam) return res.status(404).json({ detail: 'Exam not found' });
  if (exam.status !== 'active') return res.status(400).json({ detail: 'Exam is not active' });

  const allowed = exam.allowed_students || [];
  if (allowed.length > 0 && !allowed.includes(student.sub)) {
    return res.status(403).json({ detail: 'You are not assigned to this exam' });
  }

  // Check for existing in-progress attempt
  const existing = await queryOne<{
    id: string; started_at: string;
  }>(
    `SELECT id, started_at FROM exam_attempts
     WHERE exam_id = $1 AND student_id = $2 AND status = 'in_progress'`,
    [exam_id, student.sub]
  );

  if (existing) {
    const session = await queryOne<{ id: string }>(
      'SELECT id FROM proctoring_sessions WHERE attempt_id = $1', [existing.id]
    );
    const elapsed = Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000);
    const remaining = Math.max(0, exam.duration_minutes * 60 - elapsed);
    return res.status(200).json({
      attempt_id: existing.id,
      session_id: session?.id || null,
      time_remaining_seconds: remaining,
      resumed: true,
    });
  }

  // Check for finished attempt
  const finished = await queryOne<{ status: string }>(
    `SELECT status FROM exam_attempts
     WHERE exam_id = $1 AND student_id = $2 AND status IN ('submitted','disqualified')`,
    [exam_id, student.sub]
  );
  if (finished) return res.status(400).json({ detail: `Attempt already ${finished.status}` });

  // Create attempt
  const [attempt] = await query<{ id: string }>(
    `INSERT INTO exam_attempts (exam_id, student_id, status, time_remaining_seconds)
     VALUES ($1, $2, 'in_progress', $3) RETURNING id`,
    [exam_id, student.sub, exam.duration_minutes * 60]
  );

  // Load student face encoding
  const profile = await queryOne<{ face_encoding: unknown }>(
    'SELECT face_encoding FROM student_profiles WHERE user_id = $1', [student.sub]
  );

  // Create proctoring session
  const [session] = await query<{ id: string }>(
    `INSERT INTO proctoring_sessions
       (attempt_id, student_id, exam_id, face_encoding, demo_mode, vstate)
     VALUES ($1, $2, $3, $4, $5, '{}') RETURNING id`,
    [attempt.id, student.sub, exam_id, JSON.stringify(profile?.face_encoding || null), DEMO_MODE]
  );

  return res.status(201).json({
    attempt_id: attempt.id,
    session_id: session.id,
    time_remaining_seconds: exam.duration_minutes * 60,
    resumed: false,
  });
}
