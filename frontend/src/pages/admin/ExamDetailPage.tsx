import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Users, Globe, Lock } from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';
import toast from 'react-hot-toast';

export const ExamDetailPage: React.FC = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [qForm, setQForm] = useState({
    question_type: 'mcq', text: '', options: ['', '', '', ''], correct_answer: '', marks: 1,
  });

  const load = async () => {
    try {
      const [examRes, qRes, studRes] = await Promise.all([
        api.get(`/api/exams/${examId}`),
        api.get(`/api/exams/${examId}/questions`),
        api.get('/api/admin/students'),
      ]);
      setExam(examRes.data);
      setQuestions(qRes.data);
      setAllStudents(studRes.data);
    } catch (e: any) {
      console.error('[ExamDetailPage] load error:', e);
      toast.error(e.response?.data?.detail || 'Failed to load exam');
    }
  };

  useEffect(() => { load(); }, []);

  const addQuestion = async () => {
    try {
      const payload: any = { ...qForm };
      if (qForm.question_type === 'mcq') {
        payload.options = qForm.options.filter((o: string) => o.trim());
      } else {
        payload.options = null;
      }
      await api.post(`/api/exams/${examId}/questions`, payload);
      toast.success('Question added');
      setShowAddQuestion(false);
      setQForm({ question_type: 'mcq', text: '', options: ['', '', '', ''], correct_answer: '', marks: 1 });
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to add question');
    }
  };

  const deleteQuestion = async (qid: string) => {
    try {
      await api.delete(`/api/exams/${examId}/questions/${qid}`);
      toast.success('Question deleted');
      load();
    } catch (e: any) {
      toast.error('Failed to delete question');
    }
  };

  const assignStudent = async (uid: string) => {
    try {
      await api.post(`/api/exams/${examId}/students`, [uid]);
      toast.success('Student assigned — exam is now restricted to assigned students');
      load();
    } catch (e: any) {
      toast.error('Failed to assign student');
    }
  };

  const removeStudent = async (uid: string) => {
    try {
      await api.delete(`/api/exams/${examId}/students/${uid}`);
      toast.success('Student removed');
      load();
    } catch (e: any) {
      toast.error('Failed to remove student');
    }
  };

  const assignAllStudents = async () => {
    try {
      const allIds = allStudents.map((s: any) => s._id);
      if (allIds.length === 0) { toast.error('No students to assign'); return; }
      await api.post(`/api/exams/${examId}/students`, allIds);
      toast.success(`Assigned ${allIds.length} students`);
      load();
    } catch (e: any) {
      toast.error('Failed to assign all students');
    }
  };

  const makeOpenAccess = async () => {
    // Clear allowed_students → open to ALL active students
    try {
      await api.put(`/api/exams/${examId}`, { allowed_students: [] });
      toast.success('Exam is now open to all active students');
      load();
    } catch (e: any) {
      toast.error('Failed to update access mode');
    }
  };

  if (!exam) return <AdminLayout><div className="p-6 text-slate-400">Loading exam…</div></AdminLayout>;

  const assignedIds: string[] = exam.allowed_students || [];
  const isOpenAccess = assignedIds.length === 0;
  const unassigned = allStudents.filter(s => !assignedIds.includes(s._id));
  const assigned = allStudents.filter(s => assignedIds.includes(s._id));

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl">
        <button onClick={() => navigate('/admin/exams')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-4 text-sm">
          <ArrowLeft className="w-4 h-4" />Back to Exams
        </button>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{exam.title}</h1>
            <p className="text-slate-400 text-sm">
              {exam.description} · {exam.duration_minutes} min · Status:{' '}
              <span className={exam.status === 'active' ? 'text-green-400' : 'text-slate-400'}>{exam.status}</span>
            </p>
          </div>
        </div>

        {/* Access mode banner */}
        <div className={`mb-6 flex items-start gap-3 rounded-xl p-4 ${isOpenAccess
          ? 'bg-green-900/20 border border-green-700/40'
          : 'bg-blue-900/20 border border-blue-700/40'}`}
        >
          {isOpenAccess
            ? <Globe className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            : <Lock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          }
          <div className="flex-1">
            <p className={`font-medium text-sm ${isOpenAccess ? 'text-green-400' : 'text-blue-400'}`}>
              {isOpenAccess ? 'Open Access — All active students can take this exam' : `Restricted — Only ${assignedIds.length} assigned student(s) can take this exam`}
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              {isOpenAccess
                ? 'To restrict access, add students from the panel on the right. Once any student is assigned, only those students can begin the exam.'
                : 'Remove all assigned students to make this exam open to everyone again.'
              }
            </p>
          </div>
          {!isOpenAccess && (
            <button
              onClick={makeOpenAccess}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-900/40 border border-green-700/40 text-green-400 hover:bg-green-900/60 flex-shrink-0"
            >
              Make Open
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Questions */}
          <div className="lg:col-span-2">
            <div className="bg-dark-card border border-dark-border rounded-xl">
              <div className="flex items-center justify-between p-4 border-b border-dark-border">
                <h2 className="text-slate-100 font-semibold">Questions ({questions.length})</h2>
                <button
                  onClick={() => setShowAddQuestion(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm"
                >
                  <Plus className="w-3.5 h-3.5" />Add
                </button>
              </div>
              <div className="divide-y divide-dark-border">
                {questions.map((q, i) => (
                  <div key={q._id} className="p-4 flex items-start gap-3">
                    <span className="text-slate-500 text-sm font-mono w-6 flex-shrink-0">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="text-slate-200 text-sm">{q.text}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs text-slate-500">{q.question_type}</span>
                        <span className="text-xs text-slate-500">{q.marks} mark(s)</span>
                      </div>
                    </div>
                    <button onClick={() => deleteQuestion(q._id)} className="text-slate-500 hover:text-red-400 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {questions.length === 0 && (
                  <div className="p-6 text-center text-slate-400 text-sm">No questions yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* Students */}
          <div>
            <div className="bg-dark-card border border-dark-border rounded-xl">
              <div className="p-4 border-b border-dark-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-slate-100 font-semibold text-sm">
                    {isOpenAccess ? 'Access Control' : `Assigned (${assignedIds.length})`}
                  </h2>
                  {unassigned.length > 0 && (
                    <button
                      onClick={assignAllStudents}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary-600/30 border border-primary-600/40 text-primary-400 hover:bg-primary-600/50"
                      title="Assign all students — exam becomes restricted"
                    >
                      <Users className="w-3 h-3" />All
                    </button>
                  )}
                </div>
              </div>

              {isOpenAccess ? (
                <div className="p-4 text-xs text-slate-400">
                  <p className="mb-3">Currently <span className="text-green-400 font-medium">open to all {allStudents.length} student(s)</span>.</p>
                  <p className="mb-3">Add specific students below to restrict access:</p>
                  <select
                    className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1.5 text-slate-300 text-sm"
                    onChange={e => e.target.value && assignStudent(e.target.value)}
                    value=""
                  >
                    <option value="">Add student to restrict…</option>
                    {allStudents.map(s => (
                      <option key={s._id} value={s._id}>{s.profile?.full_name || s.email}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-dark-border max-h-64 overflow-y-auto">
                    {assigned.map(s => (
                      <div key={s._id} className="flex items-center justify-between px-4 py-2.5">
                        <div>
                          <div className="text-slate-200 text-sm">{s.profile?.full_name || s.email}</div>
                          <div className="text-slate-500 text-xs">{s.profile?.student_id}</div>
                        </div>
                        <button onClick={() => removeStudent(s._id)} className="text-slate-500 hover:text-red-400 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {unassigned.length > 0 && (
                    <div className="p-3 border-t border-dark-border">
                      <p className="text-slate-400 text-xs mb-2">Add student:</p>
                      <select
                        className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1.5 text-slate-300 text-sm"
                        onChange={e => e.target.value && assignStudent(e.target.value)}
                        value=""
                      >
                        <option value="">Select student…</option>
                        {unassigned.map(s => (
                          <option key={s._id} value={s._id}>{s.profile?.full_name || s.email}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Add question modal */}
        {showAddQuestion && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
            <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-slate-100 font-semibold text-lg mb-4">Add Question</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-slate-400 text-sm">Type</label>
                  <select
                    className="w-full mt-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-slate-100"
                    value={qForm.question_type}
                    onChange={e => setQForm({ ...qForm, question_type: e.target.value })}
                  >
                    <option value="mcq">Multiple Choice</option>
                    <option value="short_answer">Short Answer</option>
                    <option value="long_answer">Long Answer</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-sm">Question Text</label>
                  <textarea
                    className="w-full mt-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                    rows={3}
                    value={qForm.text}
                    onChange={e => setQForm({ ...qForm, text: e.target.value })}
                  />
                </div>
                {qForm.question_type === 'mcq' && (
                  <div>
                    <label className="text-slate-400 text-sm">Options</label>
                    {qForm.options.map((opt, i) => (
                      <input
                        key={i}
                        className="w-full mt-1.5 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        value={opt}
                        onChange={e => {
                          const opts = [...qForm.options];
                          opts[i] = e.target.value;
                          setQForm({ ...qForm, options: opts });
                        }}
                      />
                    ))}
                  </div>
                )}
                <div>
                  <label className="text-slate-400 text-sm">Correct Answer</label>
                  <input
                    className="w-full mt-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={qForm.correct_answer}
                    onChange={e => setQForm({ ...qForm, correct_answer: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-sm">Marks</label>
                  <input
                    type="number"
                    className="w-full mt-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={qForm.marks}
                    min={1}
                    onChange={e => setQForm({ ...qForm, marks: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowAddQuestion(false)}
                  className="flex-1 py-2 bg-dark-bg border border-dark-border text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={addQuestion}
                  className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
                >
                  Add Question
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
