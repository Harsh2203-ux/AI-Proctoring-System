import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';
import { formatDate } from '../../lib/utils';

export const DisqualificationsPage: React.FC = () => {
  const [disqs, setDisqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get('/api/admin/disqualifications');
      setDisqs(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Failed to load disqualifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Disqualifications</h1>
          {error && (
            <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          )}
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
                {['Student', 'Exam', 'Reason', 'Disqualified At', 'Review Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">Loading disqualifications…</td></tr>
              ) : error ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-500">Unable to load. Retry above.</td></tr>
              ) : disqs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No disqualifications yet.</td></tr>
              ) : disqs.map((d: any) => (
                <tr key={d.id || d._id} className="hover:bg-slate-800/20">
                  <td className="px-4 py-3 text-slate-200 text-sm">{d.student_name}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{d.exam_title}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{d.reason}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(d.disqualified_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${d.review_status === 'pending' ? 'text-amber-400' : d.review_status === 'upheld' ? 'text-red-400' : 'text-green-400'}`}>
                      {d.review_status.toUpperCase()}
                    </span>
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
