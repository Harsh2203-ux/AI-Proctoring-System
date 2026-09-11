import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../db/client';
import { requireStudent } from '../_lib/auth';
import { analyseFrameDemo, analyseAudioDemo } from '../_lib/demoAi';
import { generateReport } from '../_lib/report';

const DEMO_MODE = process.env.DEMO_MODE !== 'false';

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

async function processEvent(
  sessionId: string, studentId: string, examId: string,
  eventType: string, confidence: number, metadata: Record<string, unknown>,
  sessionData: { warning_count: number; is_disqualified: boolean; config: Record<string, unknown> },
  isDemo: boolean,
): Promise<{ warning: unknown; disqualified: boolean; disqualification_message?: string }> {
  const severity = SEVERITY_MAP[eventType] || 'low';
  const triggersWarning = WARNING_TRIGGERS.has(eventType);
  const warningsBefore = (sessionData.config.warnings_before_disqualification as number) || 3;
  const immediateDisq = (sessionData.config.critical_violation_immediate_disqualification as boolean) !== false;

  // Dedup: skip if same type recorded in last 30s
  const cutoff = new Date(Date.now() - 30000).toISOString();
  const existing = await queryOne(
    `SELECT id FROM violations WHERE session_id = $1 AND violation_type = $2 AND created_at >= $3`,
    [sessionId, eventType, cutoff]
  );
  if (existing && !['identity_mismatch', 'object_detected'].includes(eventType)) {
    return { warning: null, disqualified: false };
  }

  // Insert proctoring event
  const [evt] = await query<{ id: string }>(
    `INSERT INTO proctoring_events (session_id, student_id, event_type, raw_payload, confidence, is_demo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [sessionId, studentId, eventType, JSON.stringify(metadata), confidence, isDemo]
  );

  let warningNumber: number | null = null;
  if (triggersWarning) warningNumber = sessionData.warning_count + 1;

  await query(
    `INSERT INTO violations (session_id, student_id, exam_id, event_id, violation_type, severity,
      confidence, warning_number, is_demo, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [sessionId, studentId, examId, evt.id, eventType, severity, confidence, warningNumber, isDemo, JSON.stringify(metadata)]
  );

  // Immediate disqualification for critical
  if (severity === 'critical' && immediateDisq) {
    await disqualify(sessionId, studentId, examId, eventType);
    return {
      warning: null, disqualified: true,
      disqualification_message: `You have been disqualified: ${VIOLATION_MESSAGES[eventType]}`,
    };
  }

  let warning = null;
  let disqualified = false;
  let disqualification_message: string | undefined;

  if (triggersWarning) {
    const newCount = sessionData.warning_count + 1;
    const msg = `⚠️ Warning ${newCount}/${warningsBefore}: ${VIOLATION_MESSAGES[eventType] || 'Suspicious activity'}`;
    await query(
      `UPDATE proctoring_sessions SET warning_count = $1 WHERE id = $2`,
      [newCount, sessionId]
    );
    sessionData.warning_count = newCount;
    warning = { number: newCount, message: msg, max_warnings: warningsBefore };

    if (newCount >= warningsBefore) {
      await disqualify(sessionId, studentId, examId, `Exceeded ${warningsBefore} warnings`);
      disqualified = true;
      disqualification_message = `You have been automatically disqualified after ${warningsBefore} warnings.`;
    }
  }

  return { warning, disqualified, disqualification_message };
}

async function disqualify(sessionId: string, studentId: string, examId: string, reason: string) {
  await query(
    `UPDATE proctoring_sessions SET is_disqualified = TRUE, disqualification_reason = $1,
     status = 'ended', ended_at = NOW() WHERE id = $2`,
    [reason, sessionId]
  );
  const session = await queryOne<{ attempt_id: string }>(
    'SELECT attempt_id FROM proctoring_sessions WHERE id = $1', [sessionId]
  );
  if (session) {
    await query(
      `UPDATE exam_attempts SET status = 'disqualified', submitted_at = NOW() WHERE id = $1`,
      [session.attempt_id]
    );
  }
  // Create disqualification record (avoid duplicate)
  await query(
    `INSERT INTO disqualifications (session_id, student_id, exam_id, reason)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [sessionId, studentId, examId, reason]
  );
  generateReport(sessionId).catch(console.error);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const student = requireStudent(req, res);
  if (!student) return;

  const { method } = req;

  // POST /api/proctoring/events — submit a frame or audio event
  if (method === 'POST') {
    const { session_id, type, data } = req.body || {};
    if (!session_id) return res.status(400).json({ detail: 'session_id required' });

    const session = await queryOne<{
      id: string; student_id: string; exam_id: string; status: string;
      warning_count: number; is_disqualified: boolean; face_encoding: unknown;
      demo_mode: boolean; vstate: Record<string, unknown>;
    }>(
      `SELECT id, student_id, exam_id, status, warning_count, is_disqualified,
              face_encoding, demo_mode, vstate FROM proctoring_sessions WHERE id = $1`,
      [session_id]
    );
    if (!session) return res.status(404).json({ detail: 'Session not found' });
    if (session.student_id !== student.sub) return res.status(403).json({ detail: 'Forbidden' });
    if (session.is_disqualified) {
      return res.status(200).json({ disqualified: true, message: 'Session already terminated' });
    }

    const exam = await queryOne<{ proctoring_config: Record<string, unknown> }>(
      'SELECT proctoring_config FROM exams WHERE id = $1', [session.exam_id]
    );
    const config: Record<string, unknown> = exam?.proctoring_config || {};
    const sessionData: { warning_count: number; is_disqualified: boolean; config: Record<string, unknown> } = {
      warning_count: session.warning_count,
      is_disqualified: session.is_disqualified,
      config,
    };
    const isDemo = DEMO_MODE || session.demo_mode;

    const results: unknown[] = [];

    if (type === 'frame') {
      const aiResult = analyseFrameDemo(data || '');
      const vstate = (session.vstate || {}) as Record<string, number>;

      // Track state for persistence thresholds
      const faceCount = aiResult.face_count;
      vstate.face_absent_frames = faceCount === 0 ? (vstate.face_absent_frames || 0) + 1 : 0;
      vstate.multiple_faces_frames = faceCount > 1 ? (vstate.multiple_faces_frames || 0) + 1 : 0;
      vstate.pose_frames = (aiResult.pose.yaw > 30 || aiResult.pose.pitch > 20)
        ? (vstate.pose_frames || 0) + 1 : 0;
      vstate.gaze_frames = aiResult.gaze.looking_away ? (vstate.gaze_frames || 0) + 1 : 0;

      // Save updated vstate
      await query(
        `UPDATE proctoring_sessions SET vstate = $1 WHERE id = $2`,
        [JSON.stringify(vstate), session_id]
      );

      const events: Array<{ type: string; confidence: number; meta: Record<string, unknown> }> = [];
      if (vstate.face_absent_frames >= ((config.face_absent_threshold_frames as number) || 3)) {
        events.push({ type: 'face_absent', confidence: 1.0, meta: { face_count: faceCount } });
      }
      if (vstate.multiple_faces_frames >= ((config.multiple_faces_threshold_frames as number) || 2)) {
        events.push({ type: 'multiple_faces', confidence: 0.9, meta: { face_count: faceCount } });
        events.push({ type: 'additional_person', confidence: 0.85, meta: {} });
      }
      if (!aiResult.identity.is_match && aiResult.identity.confidence >= ((config.identity_mismatch_confidence_threshold as number) || 0.7)) {
        events.push({ type: 'identity_mismatch', confidence: aiResult.identity.confidence, meta: {} });
      }
      if (vstate.pose_frames >= ((config.head_pose_violation_frames as number) || 5)) {
        events.push({ type: 'head_pose_violation', confidence: 0.8, meta: aiResult.pose });
      }
      if (vstate.gaze_frames >= ((config.gaze_away_threshold_frames as number) || 4)) {
        events.push({ type: 'gaze_violation', confidence: aiResult.gaze.confidence, meta: {} });
      }

      for (const evt of events) {
        if (sessionData.is_disqualified) break;
        const r = await processEvent(session_id, student.sub, session.exam_id, evt.type, evt.confidence, evt.meta, sessionData, isDemo);
        if (r.disqualified) { sessionData.is_disqualified = true; }
        results.push(r);
      }

      // Update identity in session
      if (aiResult.identity.is_match && aiResult.identity.confidence >= 0.6) {
        await query(
          `UPDATE proctoring_sessions SET identity_verified = TRUE, identity_confidence = $1 WHERE id = $2`,
          [aiResult.identity.confidence, session_id]
        );
      }

      const lastResult = results[results.length - 1] as Record<string, unknown> | undefined;
      return res.status(200).json({
        face_count: faceCount,
        identity: aiResult.identity,
        pose: aiResult.pose,
        gaze: aiResult.gaze,
        objects: [],
        warning: lastResult?.warning || null,
        disqualified: sessionData.is_disqualified,
        disqualification_message: lastResult?.disqualification_message,
        demo: isDemo,
      });
    }

    if (type === 'audio') {
      const aiResult = analyseAudioDemo(data || '');
      const events: Array<{ type: string; confidence: number; meta: Record<string, unknown> }> = [];

      if (aiResult.suspicious_speech && aiResult.matched_keywords.length > 0) {
        events.push({ type: 'suspicious_speech', confidence: 0.75, meta: { keywords: aiResult.matched_keywords } });
      }
      if (aiResult.speaker_count > 1) {
        events.push({ type: 'multiple_speakers', confidence: 0.85, meta: { speaker_count: aiResult.speaker_count } });
      }
      if (aiResult.background_conversation) {
        events.push({ type: 'background_conversation', confidence: 0.75, meta: {} });
      }

      for (const evt of events) {
        if (sessionData.is_disqualified) break;
        const r = await processEvent(session_id, student.sub, session.exam_id, evt.type, evt.confidence, evt.meta, sessionData, isDemo);
        if (r.disqualified) sessionData.is_disqualified = true;
        results.push(r);
      }

      const lastResult = results[results.length - 1] as Record<string, unknown> | undefined;
      return res.status(200).json({
        transcript: aiResult.transcript,
        speaker_count: aiResult.speaker_count,
        warning: lastResult?.warning || null,
        disqualified: sessionData.is_disqualified,
        demo: isDemo,
      });
    }

    return res.status(400).json({ detail: 'Unknown event type' });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}
