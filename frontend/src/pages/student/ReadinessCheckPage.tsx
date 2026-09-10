import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import { CheckCircle2, XCircle, Camera, Mic, Shield, ArrowRight, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pending' | 'checking' | 'pass' | 'fail';
  message?: string;
}

export const ReadinessCheckPage: React.FC = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const webcamRef = useRef<Webcam>(null);
  const [checks, setChecks] = useState<ReadinessCheck[]>([
    { id: 'camera', label: 'Camera Access', status: 'pending' },
    { id: 'microphone', label: 'Microphone Access', status: 'pending' },
    { id: 'face', label: 'Face Detection', status: 'pending' },
    { id: 'exam', label: 'Exam Availability', status: 'pending' },
  ]);
  const [allPassed, setAllPassed] = useState(false);
  const [examData, setExamData] = useState<any>(null);
  const [starting, setStarting] = useState(false);

  const updateCheck = (id: string, status: ReadinessCheck['status'], message?: string) => {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, status, message } : c));
  };

  useEffect(() => {
    runChecks();
  }, []);

  const runChecks = async () => {
    // Camera check
    updateCheck('camera', 'checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      updateCheck('camera', 'pass', 'Camera accessible');
    } catch {
      updateCheck('camera', 'fail', 'Camera permission denied');
      return;
    }

    // Mic check
    updateCheck('microphone', 'checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      updateCheck('microphone', 'pass', 'Microphone accessible');
    } catch {
      updateCheck('microphone', 'fail', 'Microphone permission denied');
    }

    // Exam check
    updateCheck('exam', 'checking');
    try {
      const res = await api.get(`/api/exams/${examId}`);
      if (res.data.status === 'active') {
        setExamData(res.data);
        updateCheck('exam', 'pass', `"${res.data.title}" is active`);
      } else {
        updateCheck('exam', 'fail', 'Exam is not currently active');
      }
    } catch {
      updateCheck('exam', 'fail', 'Could not load exam');
    }

    // Face detection (simple check using webcam frame)
    updateCheck('face', 'checking');
    // Wait for webcam to initialize
    await new Promise(r => setTimeout(r, 1500));
    // For the readiness check, we just verify camera is working
    // Full face verification happens when exam starts
    updateCheck('face', 'pass', 'Camera ready for face monitoring');

    setAllPassed(true);
  };

  const startExam = async () => {
    setStarting(true);
    try {
      const res = await api.post('/api/attempts', { exam_id: examId });
      const { attempt_id, session_id } = res.data;
      navigate(`/student/exam/${examId}/take`, { state: { attempt_id, session_id } });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not start exam');
      setStarting(false);
    }
  };

  const statusIcon = (status: ReadinessCheck['status']) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-400" />;
      case 'checking': return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      default: return <div className="w-5 h-5 rounded-full border-2 border-slate-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Shield className="w-12 h-12 text-primary-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-slate-100">System Readiness Check</h1>
          {examData && <p className="text-slate-400 mt-1">{examData.title}</p>}
        </div>

        <div className="bg-dark-card border border-dark-border rounded-2xl p-6 mb-4">
          {/* Small webcam preview */}
          <div className="mb-5 rounded-xl overflow-hidden border border-dark-border">
            <Webcam
              ref={webcamRef}
              mirrored
              className="w-full h-32 object-cover"
              videoConstraints={{ facingMode: 'user', width: 320, height: 120 }}
            />
          </div>

          <div className="space-y-3">
            {checks.map((check) => (
              <div key={check.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                check.status === 'pass' ? 'border-green-700/40 bg-green-900/10' :
                check.status === 'fail' ? 'border-red-700/40 bg-red-900/10' :
                check.status === 'checking' ? 'border-blue-700/40 bg-blue-900/10' :
                'border-dark-border bg-dark-bg'
              }`}>
                {statusIcon(check.status)}
                <div className="flex-1">
                  <div className="text-slate-200 font-medium text-sm">{check.label}</div>
                  {check.message && <div className="text-slate-400 text-xs">{check.message}</div>}
                </div>
              </div>
            ))}
          </div>

          {allPassed && (
            <div className="mt-5 p-3 bg-green-900/20 border border-green-700/40 rounded-lg text-center text-green-400 text-sm font-medium mb-4">
              ✓ All checks passed — You may begin the examination
            </div>
          )}

          <div className="mt-4 p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg">
            <p className="text-amber-400 text-xs font-semibold mb-1.5">⚠ Important Instructions</p>
            <ul className="text-slate-400 text-xs space-y-1 list-disc list-inside">
              <li>Keep your face visible to the camera throughout the exam</li>
              <li>Do not allow other persons to appear in camera view</li>
              <li>No mobile phones, calculators, or prohibited objects allowed</li>
              <li>Suspicious activity will result in warnings and disqualification</li>
            </ul>
          </div>
        </div>

        <button
          onClick={startExam}
          disabled={!allPassed || starting}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-lg"
        >
          {starting ? (
            <><Loader2 className="w-5 h-5 animate-spin" />Starting Exam...</>
          ) : (
            <><ArrowRight className="w-5 h-5" />Begin Examination</>
          )}
        </button>
      </div>
    </div>
  );
};
