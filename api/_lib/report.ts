import { query, queryOne } from '../db/client';

interface ViolationRow {
  violation_type: string;
  severity: string;
  created_at: string;
  confidence: number;
  is_demo: boolean;
}

/**
 * Generate a proctoring report for a session.
 * Called after exam submission or disqualification.
 */
export async function generateReport(sessionId: string): Promise<Record<string, unknown> | null> {
  const session = await queryOne<{
    id: string; attempt_id: string; student_id: string; exam_id: string;
    warning_count: number; is_disqualified: boolean; demo_mode: boolean;
  }>(
    'SELECT id, attempt_id, student_id, exam_id, warning_count, is_disqualified, demo_mode FROM proctoring_sessions WHERE id = $1',
    [sessionId]
  );
  if (!session) return null;

  const violations = await query<ViolationRow>(
    `SELECT violation_type, severity, created_at, confidence, is_demo
     FROM violations WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );

  const attempt = await queryOne<{ status: string }>(
    'SELECT status FROM exam_attempts WHERE id = $1', [session.attempt_id]
  );

  // Build violation summary
  const summary: Record<string, number> = {};
  const timeline: unknown[] = [];
  for (const v of violations) {
    summary[v.violation_type] = (summary[v.violation_type] || 0) + 1;
    timeline.push({ type: v.violation_type, severity: v.severity, at: v.created_at, confidence: v.confidence });
  }

  const totalViolations = violations.length;
  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const highCount = violations.filter(v => v.severity === 'high').length;

  // Risk score: weighted
  const riskScore = Math.min(100, criticalCount * 40 + highCount * 20 + session.warning_count * 15 + totalViolations * 5);
  const riskLevel = riskScore >= 80 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

  const reportData = {
    session_id: sessionId,
    attempt_id: session.attempt_id,
    student_id: session.student_id,
    exam_id: session.exam_id,
    risk_score: riskScore,
    risk_level: riskLevel,
    violation_summary: JSON.stringify(summary),
    warning_count: session.warning_count,
    disqualification_status: session.is_disqualified,
    submission_status: attempt?.status || 'not_submitted',
    identity_result: JSON.stringify({}),
    full_timeline: JSON.stringify(timeline),
  };

  // Upsert report
  await query(
    `INSERT INTO proctoring_reports
       (session_id, attempt_id, student_id, exam_id, risk_score, risk_level,
        violation_summary, warning_count, disqualification_status, submission_status,
        identity_result, full_timeline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (session_id) DO UPDATE SET
       risk_score = EXCLUDED.risk_score,
       risk_level = EXCLUDED.risk_level,
       violation_summary = EXCLUDED.violation_summary,
       warning_count = EXCLUDED.warning_count,
       disqualification_status = EXCLUDED.disqualification_status,
       submission_status = EXCLUDED.submission_status,
       full_timeline = EXCLUDED.full_timeline,
       generated_at = NOW()`,
    [
      reportData.session_id, reportData.attempt_id, reportData.student_id, reportData.exam_id,
      reportData.risk_score, reportData.risk_level, reportData.violation_summary,
      reportData.warning_count, reportData.disqualification_status, reportData.submission_status,
      reportData.identity_result, reportData.full_timeline,
    ]
  );

  return reportData;
}
