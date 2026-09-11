import React, { useEffect, useState, useCallback } from 'react';
import { Download, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';
import { formatDate } from '../../lib/utils';

export const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get('/api/admin/reports');
      setReports(r.data);
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || 'Failed to load reports';
      setError(msg);
      console.error('[ReportsPage] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const viewReport = async (sessionId: string) => {
    try {
      const res = await api.get(`/api/admin/reports/${sessionId}`);
      setSelected(res.data);
    } catch (e: any) {
      console.error('[ReportsPage] viewReport error:', e);
    }
  };

  const downloadPdf = async (sessionId: string) => {
    setDownloadError('');
    setDownloading(sessionId);
    try {
      const res = await api.get(`/api/admin/reports/${sessionId}/download`, {
        responseType: 'blob',
      });

      // Detect server-side error returned as JSON blob (e.g. 404 / 500)
      const rawCT = res.headers['content-type'];
      const contentType = Array.isArray(rawCT) ? rawCT.join(',') : String(rawCT ?? '');
      if (!contentType.includes('application/pdf')) {
        let detail = 'Server did not return a PDF.';
        try {
          const text = await (res.data as Blob).text();
          const json = JSON.parse(text);
          detail = json.detail || detail;
        } catch { /* ignore parse error */ }
        throw new Error(detail);
      }

      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${sessionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a short delay so the download has time to start
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: any) {
      const msg =
        e.response?.data instanceof Blob
          ? await e.response.data.text().then((t: string) => { try { return JSON.parse(t).detail; } catch { return t; } }).catch(() => e.message)
          : e.response?.data?.detail ?? e.message ?? 'Download failed';
      setDownloadError(String(msg));
      console.error('[ReportsPage] downloadPdf error:', e);
    } finally {
      setDownloading(null);
    }
  };

  const riskColor = (level: string) => ({
    low: 'text-green-400', medium: 'text-amber-400', high: 'text-orange-400', critical: 'text-red-400'
  } as any)[level] || 'text-slate-400';

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Proctoring Reports</h1>
          <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm bg-red-950/50 border border-red-800/60 text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {downloadError && (
          <div className="mb-4 flex items-start justify-between gap-2.5 rounded-lg px-4 py-3 text-sm bg-orange-950/50 border border-orange-800/60 text-orange-400">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Download failed: {downloadError}</span>
            </div>
            <button onClick={() => setDownloadError('')} className="ml-2 text-orange-400 hover:text-orange-200 flex-shrink-0">✕</button>
          </div>
        )}

        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-dark-border bg-dark-bg">
              <tr>
                {['Student', 'Exam', 'Risk', 'Violations', 'Warnings', 'Status', 'Generated', 'Actions'].map(h => (
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
                      Loading reports…
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-500">Unable to load reports. Check the error above and retry.</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">No reports available yet. Reports are generated when students complete exams.</td></tr>
              ) : reports.map((r: any) => (
                <tr key={r.id || r._id} className="hover:bg-slate-800/20">
                  <td className="px-4 py-3 text-slate-200 text-sm">{r.student_name || r.student_info?.full_name || r.student_id}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{r.exam_title || r.exam_info?.title || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold text-sm ${riskColor(r.risk_level)}`}>
                      {r.risk_score}/100 <span className="text-xs uppercase">({r.risk_level})</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{r.violation_summary?.total ?? 0}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{r.warning_count}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${r.disqualification_status ? 'text-red-400' : 'text-green-400'}`}>
                      {r.disqualification_status ? 'DISQUALIFIED' : r.submission_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(r.generated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => viewReport(r.session_id)} className="p-1.5 text-slate-400 hover:text-blue-400 rounded" title="View">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => downloadPdf(r.session_id)}
                        disabled={downloading === r.session_id}
                        className="p-1.5 text-slate-400 hover:text-green-400 rounded disabled:opacity-50 disabled:cursor-wait"
                        title="Download PDF"
                      >
                        {downloading === r.session_id
                          ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          : <Download className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-slate-100 font-semibold text-lg">Proctoring Report</h2>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Student</p>
                <p className="text-slate-100">{selected.student_info?.full_name}</p>
                <p className="text-slate-400 text-sm">{selected.student_info?.email}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Exam</p>
                <p className="text-slate-100">{selected.exam_info?.title}</p>
                <p className="text-slate-400 text-sm">{selected.exam_info?.duration_minutes} minutes</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-dark-bg rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold ${riskColor(selected.risk_level)}`}>{selected.risk_score}</div>
                <div className="text-slate-400 text-xs">Risk Score</div>
              </div>
              <div className="bg-dark-bg rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{selected.warning_count}</div>
                <div className="text-slate-400 text-xs">Warnings</div>
              </div>
              <div className="bg-dark-bg rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-slate-200">{selected.violation_summary?.total ?? 0}</div>
                <div className="text-slate-400 text-xs">Violations</div>
              </div>
            </div>

            {/* Timeline */}
            {selected.full_timeline && selected.full_timeline.length > 0 && (
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Event Timeline</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {selected.full_timeline.slice(0, 20).map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-dark-border/50">
                      <span className={`w-16 flex-shrink-0 font-medium ${item.type === 'warning' ? 'text-amber-400' : 'text-slate-400'}`}>
                        {item.type.toUpperCase()}
                      </span>
                      <span className="text-slate-300 flex-1">
                        {item.event_type?.replace(/_/g, ' ') || item.message}
                      </span>
                      <span className="text-slate-600">{item.timestamp?.split('T')[1]?.substring(0, 8)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setSelected(null)} className="flex-1 py-2 bg-dark-bg border border-dark-border text-slate-300 rounded-lg text-sm">Close</button>
              <button
                onClick={() => downloadPdf(selected.session_id)}
                disabled={downloading === selected.session_id}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 disabled:cursor-wait"
              >
                {downloading === selected.session_id
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Downloading…</>
                  : <><Download className="w-4 h-4" />Download PDF</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
