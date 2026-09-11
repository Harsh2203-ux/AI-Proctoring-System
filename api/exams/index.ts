import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../db/client';
import { requireAuth, requireAdmin } from '../_lib/auth';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  // GET /api/exams — list exams
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
    return res.status(200).json(rows.map(serializeExam));
  }

  // POST /api/exams — create exam (admin only)
  if (req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { title, description = '', duration_minutes = 60, start_time, end_time, proctoring_config } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ detail: 'Title is required' });

    const config = { ...DEFAULT_PROCTORING_CONFIG, ...(proctoring_config || {}) };

    const [exam] = await query<{ id: string }>(
      `INSERT INTO exams (title, description, created_by, duration_minutes, start_time, end_time, proctoring_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [title.trim(), description, admin.sub, duration_minutes, start_time || null, end_time || null, JSON.stringify(config)]
    );

    return res.status(201).json({ id: exam.id, message: 'Exam created' });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}

function serializeExam(row: Record<string, unknown>) {
  return {
    ...row,
    _id: row.id,  // frontend uses _id for navigation
  };
}
