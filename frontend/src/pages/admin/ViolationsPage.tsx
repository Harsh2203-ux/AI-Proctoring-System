import React, { useEffect, useState, useCallback } from 'react';
import { Eye, Filter, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';
import { Badge } from '../../components/ui/Badge';
import { severityBadgeVariant, formatDate } from '../../lib/utils';
import toast from 'react-hot-toast';

export const ViolationsPage: React.FC = () => {
  const [data, setData] = useState<{ violations: any[]; total: number }>({ violations: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [selectedV, setSelectedV] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (severityFilter) params.set('severity', severityFilter);
      params.set('limit', '100');
      const res = await api.get(`/api/admin/violations?${params}`);
      setData(res.data);
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || 'Failed to load violations';
      setError(msg);
      console.error('[ViolationsPage] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [severityFilter]);

  useEffect(() => { load(); }, [load]);

  const reviewViolation = async (status: string) => {
    setReviewing(true);
    try {
      await api.put(`/api/admin/violations/${selectedV.id || selectedV._id}/review`, { status, review_notes: reviewNotes });
      toast.success('Violation reviewed');
      setSelectedV(null);
      load();
    } catch (e) {
      toast.error('Review failed');
    } finally {
      setReviewing(false);
    }
  };

  const violationLabel = (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Violations ({data.total})</h1>
          <div className="flex items-center gap-2">
            {error && (
              <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            )}
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              className="bg-dark-card border border-dark-border rounded-lg px-3 py-1.5 text-slate-300 text-sm"
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
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
                {['Student', 'Type', 'Severity', 'Confidence', 'Time', 'Status', 'Demo', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading violations…
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-500">Unable to load violations. Check the error above and retry.</td></tr>
              ) : data.violations.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">No violations found. Violations are recorded during proctored exams.</td></tr>
              ) : data.violations.map((v: any) => (
                <tr key={v.id || v._id} className="hover:bg-slate-800/20">
                  <td className="px-4 py-3 text-slate-300 text-sm">{v.student_name}</td>
                  <td className="px-4 py-3 text-slate-200 text-sm">{violationLabel(v.violation_type)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={severityBadgeVariant(v.severity)}>{v.severity.toUpperCase()}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{Math.round(v.confidence * 100)}%</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(v.timestamp)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${v.status === 'open' ? 'text-amber-400' : v.status === 'dismissed' ? 'text-slate-500' : 'text-green-400'}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {v.is_demo && <span className="text-xs text-amber-500 border border-amber-700/40 rounded px-1">DEMO</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setSelectedV(v); setReviewNotes(v.review_notes || ''); }} className="p-1.5 text-slate-400 hover:text-blue-400">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Violation detail modal */}
      {selectedV && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-slate-100 font-semibold text-lg mb-1">Violation Review</h2>
            <p className="text-slate-400 text-sm mb-4">{violationLabel(selectedV.violation_type)}</p>

            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Student</span><span className="text-slate-200">{selectedV.student_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Severity</span><Badge variant={severityBadgeVariant(selectedV.severity)}>{selectedV.severity}</Badge></div>
              <div className="flex justify-between"><span className="text-slate-400">Confidence</span><span className="text-slate-200">{Math.round(selectedV.confidence * 100)}%</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Time</span><span className="text-slate-200 text-xs">{formatDate(selectedV.timestamp)}</span></div>
              {selectedV.is_demo && (
                <div className="p-2 bg-amber-900/20 border border-amber-700/40 rounded text-amber-400 text-xs">
                  ⚠ DEMO MODE — This is a simulated violation
                </div>
              )}
              {selectedV.metadata && Object.keys(selectedV.metadata).length > 0 && (
                <div className="p-3 bg-dark-bg rounded border border-dark-border">
                  <p className="text-slate-400 text-xs font-medium mb-1">Raw Data</p>
                  <pre className="text-slate-300 text-xs overflow-auto">{JSON.stringify(selectedV.metadata, null, 2)}</pre>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-slate-400 text-sm">Review Notes</label>
              <textarea
                className="w-full mt-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-slate-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={3}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Add review notes..."
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setSelectedV(null)} className="flex-1 py-2 bg-dark-bg border border-dark-border text-slate-300 rounded-lg text-sm">Cancel</button>
              <button onClick={() => reviewViolation('dismissed')} disabled={reviewing} className="flex-1 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm">Dismiss</button>
              <button onClick={() => reviewViolation('reviewed')} disabled={reviewing} className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium">Mark Reviewed</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
