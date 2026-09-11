import React, { useEffect, useState, useCallback } from 'react';
import { Camera, CheckCircle2, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';

export const StudentsPage: React.FC = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.get('/api/admin/students');
      setStudents(r.data);
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || 'Failed to load students';
      setError(msg);
      console.error('[StudentsPage] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Students</h1>
          {error && (
            <button
              onClick={load}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600"
            >
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
                {['Student', 'Email', 'Student ID', 'Face Enrolled', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-400 text-xs font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading students…
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
                    Unable to load students. Check the error above and retry.
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    No students registered yet.
                  </td>
                </tr>
              ) : students.map((s: any) => (
                <tr key={s.id || s._id} className="hover:bg-slate-800/20">
                  <td className="px-4 py-3">
                    <div className="text-slate-100 font-medium">{s.profile?.full_name || s.full_name || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{s.email}</td>
                  <td className="px-4 py-3 text-slate-400 text-sm font-mono">{s.profile?.student_id || s.student_id || '—'}</td>
                  <td className="px-4 py-3">
                    {s.profile?.is_face_enrolled
                      ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Enrolled</span>
                      : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3.5 h-3.5" />Not Enrolled</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${s.is_active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
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
