import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';
import toast from 'react-hot-toast';

export const ExamsPage: React.FC = () => {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', duration_minutes: 60 });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/exams');
      setExams(res.data);
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || 'Failed to load exams';
      setError(msg);
      console.error('[ExamsPage] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createExam = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setCreating(true);
    try {
      await api.post('/api/exams', form);
      toast.success('Exam created');
      setShowCreate(false);
      setForm({ title: '', description: '', duration_minutes: 60 });
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to create exam');
    } finally {
      setCreating(false);
    }
  };

  const publishExam = async (id: string) => {
    try {
      await api.post(`/api/exams/${id}/publish`);
      toast.success('Exam published — students can now see it');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to publish exam');
    }
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Delete this exam?')) return;
    try {
      await api.delete(`/api/exams/${id}`);
      toast.success('Exam deleted');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to delete exam');
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Examinations</h1>
          <div className="flex items-center gap-2">
            {error && (
              <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            )}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" />New Exam
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm bg-red-950/50 border border-red-800/60 text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mb-3 px-1 text-xs text-slate-500">
          Tip: After creating an exam, click <strong className="text-slate-400">Publish</strong> to make it active, then assign students via the exam detail page.
        </div>

        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-dark-border bg-dark-bg">
              <tr>
                {['Title', 'Duration', 'Students', 'Status', 'Actions'].map(h => (
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
                      Loading exams…
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-500">Unable to load exams. Check the error above and retry.</td></tr>
              ) : exams.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No exams yet. Create your first exam above.</td></tr>
              ) : exams.map(exam => (
                <tr key={exam._id} className="hover:bg-slate-800/20">
                  <td className="px-4 py-3">
                    <div className="text-slate-100 font-medium">{exam.title}</div>
                    <div className="text-slate-500 text-xs">{exam.description?.slice(0, 60)}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{exam.duration_minutes} min</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{exam.allowed_students?.length || 0}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      exam.status === 'active' ? 'bg-green-900/50 text-green-400' :
                      exam.status === 'draft' ? 'bg-slate-700 text-slate-300' :
                      'bg-blue-900/50 text-blue-400'
                    }`}>{exam.status.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/admin/exams/${exam._id}`)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 rounded"
                        title="View / manage"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {exam.status === 'draft' && (
                        <>
                          <button
                            onClick={() => publishExam(exam._id)}
                            className="px-2 py-1 text-xs bg-green-900/40 text-green-400 border border-green-700/40 rounded hover:bg-green-900/60"
                          >
                            Publish
                          </button>
                          <button
                            onClick={() => deleteExam(exam._id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
            <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-slate-100 font-semibold text-lg mb-4">Create Examination</h2>
              <div className="space-y-3">
                <input
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Exam title *"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  autoFocus
                />
                <textarea
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder="Description (optional)"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
                <div>
                  <label className="text-slate-400 text-sm">Duration (minutes)</label>
                  <input
                    type="number"
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 mt-1"
                    value={form.duration_minutes}
                    onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                    min={5}
                    max={300}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setShowCreate(false); setForm({ title: '', description: '', duration_minutes: 60 }); }}
                  className="flex-1 py-2 bg-dark-bg border border-dark-border text-slate-300 rounded-lg"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={createExam}
                  disabled={creating}
                  className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg font-medium"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
