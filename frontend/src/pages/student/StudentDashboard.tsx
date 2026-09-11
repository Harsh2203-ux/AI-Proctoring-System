import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Camera, CheckCircle2, AlertCircle, Shield, Clock, PlayCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

export const StudentDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [exams, setExams] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const [examsRes, profileRes] = await Promise.all([
          api.get('/api/exams'),
          api.get('/api/students/profile'),
        ]);
        setExams(examsRes.data);
        setProfile(profileRes.data);
      } catch (e) {
        console.error('[StudentDashboard] load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
              Welcome, {user?.full_name}
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Student Examination Portal</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" />
            <button
              onClick={() => navigate('/student/enrol-face')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground-2)' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--foreground)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--foreground-2)')}
            >
              <Camera className="w-4 h-4" />
              Face Enrolment
            </button>
            <button
              onClick={() => { useAuthStore.getState().logout(); navigate('/login'); }}
              className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--foreground)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--muted)')}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Face Enrolment Banner */}
        {profile && !profile.is_face_enrolled && (
          <div
            className="mb-6 flex items-center gap-3 rounded-lg p-4"
            style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--warning-text)' }} />
            <div>
              <p className="font-medium" style={{ color: 'var(--warning-text)' }}>Face Enrolment Required</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>You must enrol your face before starting an exam.</p>
            </div>
            <button
              onClick={() => navigate('/student/enrol-face')}
              className="ml-auto px-4 py-1.5 text-white text-sm rounded-lg"
              style={{ background: '#d97706' }}
            >
              Enrol Now
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Available Exams', value: exams.length, icon: BookOpen, colorClass: 'text-blue-400' },
            {
              label: 'Face Enrolled',
              value: profile?.is_face_enrolled ? 'YES' : 'NO',
              icon: Shield,
              colorClass: profile?.is_face_enrolled ? 'text-green-400' : 'text-red-400',
            },
            { label: 'Status', value: 'Active', icon: CheckCircle2, colorClass: 'text-green-400' },
          ].map((stat, i) => (
            <div
              key={i}
              className="rounded-xl p-5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3">
                <stat.icon className={`w-8 h-8 ${stat.colorClass}`} />
                <div>
                  <div className={`text-2xl font-bold ${stat.colorClass}`}>{stat.value}</div>
                  <div className="text-sm" style={{ color: 'var(--muted)' }}>{stat.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Exams list */}
        <div className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Available Examinations</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center" style={{ color: 'var(--muted)' }}>Loading exams...</div>
          ) : exams.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--muted)' }}>No exams available.</div>
          ) : (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {exams.map((exam, idx) => (
                <div
                  key={(exam.id || exam._id) as string}
                  className="p-4 flex items-center justify-between transition-colors"
                  style={{
                    borderTop: idx > 0 ? '1px solid var(--border)' : undefined,
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--overlay)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                >
                  <div>
                    <h3 className="font-medium" style={{ color: 'var(--foreground)' }}>{exam.title}</h3>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{exam.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{exam.duration_minutes} minutes
                      </span>
                      <span className={`font-medium ${exam.status === 'active' ? 'text-green-400' : ''}`}
                        style={exam.status !== 'active' ? { color: 'var(--muted)' } : {}}>
                        {exam.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {exam.status === 'active' && (
                    <button
                      onClick={() => navigate(`/student/exam/${(exam.id || exam._id) as string}/ready`)}
                      disabled={!profile?.is_face_enrolled}
                      className="flex items-center gap-2 px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-opacity"
                      style={{ background: 'var(--primary)' }}
                      onMouseEnter={(e) => { if (profile?.is_face_enrolled) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                    >
                      <PlayCircle className="w-4 h-4" />
                      Start Exam
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
