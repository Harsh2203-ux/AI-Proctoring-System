import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';
import { formatDate } from '../../lib/utils';

export const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    // Don't show spinner on auto-refresh, only on first load
    setError('');
    try {
      const res = await api.get('/api/admin/sessions');
      setSessions(res.data);
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || 'Failed to load sessions';
      setError(msg);
      console.error('[SessionsPage] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Proctoring Sessions</h1>
          <div className="flex items-center gap-3">
            {error ? (
              <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            ) : (
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />Auto-refreshes every 15s
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm bg-red-950/50 border border-red-800/60 text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-dark-border bg-dark-bg">
              <tr>
                {['Student', 'Exam', 'Started', 'Warnings', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading sessions…
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">Unable to load sessions. Check the error above and retry.</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">No sessions found. Sessions appear here when students start exams.</td></tr>
              ) : sessions.map((s: any) => (
                <tr key={s.id || s._id} className="hover:bg-slate-800/20">
                  <td className="px-4 py-3">
                    <div className="text-slate-100 text-sm font-medium">{s.student_name}</div>
                    <div className="text-slate-500 text-xs">{s.student_student_id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{s.exam_title}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(s.started_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold text-sm ${s.warning_count > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {s.warning_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      s.is_disqualified ? 'bg-red-900/50 text-red-400' :
                      s.status === 'active' ? 'bg-green-900/50 text-green-400' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {s.is_disqualified ? '🚫 Disqualified' : s.status === 'active' ? '● Active' : s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/admin/sessions/${s.id || s._id}`)} className="p-1.5 text-slate-400 hover:text-blue-400 rounded">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};
