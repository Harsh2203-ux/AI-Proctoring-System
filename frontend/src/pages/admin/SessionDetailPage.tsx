import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, AlertCircle, User, BookOpen, Clock,
  Shield, AlertTriangle, CheckCircle2, XCircle, Eye, Activity,
} from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';
import { Badge } from '../../components/ui/Badge';
import { severityBadgeVariant, formatDate } from '../../lib/utils';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function violationLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── stat card ─────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  accent?: string;
}> = ({ label, value, icon, accent = 'text-slate-300' }) => (
  <div className="bg-dark-bg border border-dark-border rounded-xl p-4 flex items-center gap-3">
    <div className="text-slate-500">{icon}</div>
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`font-semibold mt-0.5 ${accent}`}>{value}</div>
    </div>
  </div>
);

// ── info row ──────────────────────────────────────────────────────────────────
const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between py-2.5 border-b border-dark-border/60 last:border-0">
    <span className="text-slate-400 text-sm w-40 flex-shrink-0">{label}</span>
    <span className="text-slate-200 text-sm text-right flex-1">{value ?? '—'}</span>
  </div>
);

// ── main component ────────────────────────────────────────────────────────────
export const SessionDetailPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!sessionId) {
      setError('No session ID in URL');
      setLoading(false);
      return;
    }
    setError('');
    try {
      const res = await api.get(`/api/admin/sessions/${sessionId}`);
      setSession(res.data);
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 404) {
        setError('Session not found. It may have been deleted or the ID is incorrect.');
      } else if (status === 403 || status === 401) {
        setError('Admin access required to view session details.');
      } else {
        setError(e.response?.data?.detail || e.message || 'Unable to load session details.');
      }
      console.error('[SessionDetailPage] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // ── loading ──
  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8 flex items-center justify-center gap-3 text-slate-400">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading session details…
        </div>
      </AdminLayout>
    );
  }

  // ── error ──
  if (error) {
    return (
      <AdminLayout>
        <div className="p-6 max-w-2xl">
          <button
            onClick={() => navigate('/admin/sessions')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-6 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Sessions
          </button>
          <div className="rounded-xl p-6 bg-red-950/30 border border-red-800/50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-400 mb-1">Unable to load session</p>
                <p className="text-slate-400 text-sm">{error}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => navigate('/admin/sessions')}
                className="px-4 py-2 text-sm rounded-lg bg-dark-bg border border-dark-border text-slate-300 hover:bg-slate-800"
              >
                ← Back to Sessions
              </button>
              <button
                onClick={() => { setLoading(true); load(); }}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!session) return null;

  const violations: any[] = session.violations || [];
  const statusColor =
    session.is_disqualified ? 'text-red-400' :
    session.status === 'active' ? 'text-green-400' :
    'text-slate-400';
  const statusLabel =
    session.is_disqualified ? '🚫 Disqualified' :
    session.status === 'active' ? '● Active' :
    session.status ?? '—';

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl">
        {/* Back button */}
        <button
          onClick={() => navigate('/admin/sessions')}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-5 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Sessions
        </button>

        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              Proctoring Session
              <span className={`text-sm font-medium px-2 py-0.5 rounded ${statusColor} bg-current/10`}>
                {statusLabel}
              </span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {session.student_name} · {session.exam_title}
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); load(); }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Warnings"
            value={session.warning_count ?? 0}
            icon={<AlertTriangle className="w-5 h-5" />}
            accent={session.warning_count > 0 ? 'text-amber-400' : 'text-slate-300'}
          />
          <StatCard
            label="Violations"
            value={violations.length}
            icon={<XCircle className="w-5 h-5" />}
            accent={violations.length > 0 ? 'text-red-400' : 'text-slate-300'}
          />
          <StatCard
            label="Duration"
            value={formatDuration(session.duration_seconds)}
            icon={<Clock className="w-5 h-5" />}
          />
          <StatCard
            label="Events"
            value={session.event_count ?? 0}
            icon={<Activity className="w-5 h-5" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Student info */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-5">
            <h2 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" /> Student
            </h2>
            <div>
              <InfoRow label="Full Name" value={session.student_name} />
              <InfoRow label="Email" value={session.student_email || '—'} />
              <InfoRow label="Student ID" value={<span className="font-mono">{session.student_student_id || '—'}</span>} />
              <InfoRow label="User ID" value={<span className="font-mono text-xs text-slate-500">{session.student_id}</span>} />
            </div>
          </div>

          {/* Exam info */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-5">
            <h2 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" /> Examination
            </h2>
            <div>
              <InfoRow label="Title" value={session.exam_title} />
              <InfoRow label="Duration" value={session.exam_duration_minutes ? `${session.exam_duration_minutes} minutes` : '—'} />
              <InfoRow label="Exam ID" value={<span className="font-mono text-xs text-slate-500">{session.exam_id}</span>} />
            </div>
          </div>
        </div>

        {/* Session details */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" /> Session Details
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
            <div>
              <InfoRow label="Session ID" value={<span className="font-mono text-xs text-slate-500">{session.id || session._id}</span>} />
              <InfoRow label="Status" value={<span className={`font-medium ${statusColor}`}>{statusLabel}</span>} />
              <InfoRow label="Started" value={formatDate(session.started_at)} />
              <InfoRow label="Ended" value={session.ended_at ? formatDate(session.ended_at) : <span className="text-green-400">Still active</span>} />
              <InfoRow label="Duration" value={formatDuration(session.duration_seconds)} />
            </div>
            <div>
              <InfoRow label="Warnings" value={<span className={session.warning_count > 0 ? 'text-amber-400 font-semibold' : ''}>{session.warning_count ?? 0}</span>} />
              <InfoRow label="Disqualified" value={
                session.is_disqualified
                  ? <span className="text-red-400 font-medium">Yes — {session.disqualification_reason || 'No reason given'}</span>
                  : <span className="text-green-400">No</span>
              } />
              <InfoRow label="Identity Verified" value={
                session.identity_verified
                  ? <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Verified ({Math.round((session.identity_confidence ?? 0) * 100)}%)</span>
                  : <span className="text-slate-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Not verified</span>
              } />
              <InfoRow label="Demo Mode" value={session.demo_mode ? <span className="text-amber-400 text-xs border border-amber-700/40 rounded px-1">DEMO</span> : 'No'} />
              <InfoRow label="Event Count" value={session.event_count ?? 0} />
            </div>
          </div>
        </div>

        {/* Violations */}
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-border">
            <h2 className="font-semibold text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Violations ({violations.length})
            </h2>
          </div>
          {violations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No violations recorded for this session.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-dark-bg border-b border-dark-border">
                  <tr>
                    {['Type', 'Severity', 'Confidence', 'Time', 'Status', 'Demo'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-slate-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {violations.map((v: any) => (
                    <tr key={v.id || v._id} className="hover:bg-slate-800/20">
                      <td className="px-4 py-3 text-slate-200 text-sm">{violationLabel(v.violation_type || v.type || 'Unknown')}</td>
                      <td className="px-4 py-3">
                        <Badge variant={severityBadgeVariant(v.severity)}>{(v.severity ?? '?').toUpperCase()}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-sm">{v.confidence != null ? `${Math.round(v.confidence * 100)}%` : '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(v.created_at || v.timestamp)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${
                          v.status === 'open' ? 'text-amber-400' :
                          v.status === 'dismissed' ? 'text-slate-500' :
                          'text-green-400'
                        }`}>{v.status ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {v.is_demo && (
                          <span className="text-xs text-amber-500 border border-amber-700/40 rounded px-1">DEMO</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
