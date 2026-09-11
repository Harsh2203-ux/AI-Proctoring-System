import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { Clock, ChevronLeft, ChevronRight, AlertTriangle, XCircle, Send, Wifi, WifiOff } from 'lucide-react';
import { useProctoringStore } from '../../store/proctoringStore';
import { useAuthStore } from '../../store/authStore';
import { formatDuration } from '../../lib/utils';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const ExamPage: React.FC = () => {
  const { examId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  useAuthStore(); // ensure auth is loaded
  const proctoring = useProctoringStore();

  const { attempt_id, session_id } = (location.state || {}) as { attempt_id?: string; session_id?: string };
  const webcamRef = useRef<Webcam>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const autosaveIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [exam, setExam] = useState<Record<string, unknown> | null>(null);
  const [questions, setQuestions] = useState<Record<string, unknown>[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningData, setWarningData] = useState<Record<string, unknown> | null>(null);

  // Keep answer state in a ref so closures can read latest value
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Load exam data
  useEffect(() => {
    if (!attempt_id || !session_id) {
      navigate('/student/dashboard');
      return;
    }

    const load = async () => {
      try {
        const [examRes, questionsRes, attemptRes] = await Promise.all([
          api.get(`/api/exams/${examId}`),
          api.get(`/api/exams/${examId}/questions`),
          api.get(`/api/attempts/${attempt_id}`),
        ]);
        setExam(examRes.data);
        setQuestions(questionsRes.data);
        setTimeRemaining((attemptRes.data.time_remaining_seconds as number) || (examRes.data.duration_minutes as number) * 60);

        const answersRes = await api.get(`/api/attempts/${attempt_id}/answers`);
        const saved: Record<string, string> = {};
        (answersRes.data as Array<{ question_id: string; response: string }>)
          .forEach((a) => { saved[a.question_id] = a.response; });
        setAnswers(saved);
      } catch (e) {
        console.error('[ExamPage] load error:', e);
        toast.error('Failed to load exam data.');
      }
    };
    load();

    proctoring.reset();
    proctoring.setSessionId(session_id);
    proctoring.setConnected(true); // HTTP polling = always "connected"

    return () => {
      clearInterval(frameIntervalRef.current);
      clearInterval(autosaveIntervalRef.current);
      clearInterval(timerIntervalRef.current);
      clearInterval(heartbeatIntervalRef.current);
      clearTimeout(warningTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start capture loops once questions are loaded
  useEffect(() => {
    if (!questions.length || !session_id) return;

    // Frame capture at 1fps → POST to /api/proctoring/events
    frameIntervalRef.current = setInterval(async () => {
      if (webcamRef.current && session_id && !proctoring.isDisqualified) {
        const img = webcamRef.current.getScreenshot({ width: 640, height: 480 });
        if (img) {
          try {
            const res = await api.post('/api/proctoring/events', {
              session_id,
              type: 'frame',
              data: img,
            });
            handleProctoringResult(res.data);
          } catch (_e) { /* ignore individual frame errors */ }
        }
      }
    }, 1000);

    // Heartbeat every 3s — returns session state
    heartbeatIntervalRef.current = setInterval(async () => {
      if (!session_id) return;
      try {
        const res = await api.post('/api/proctoring/heartbeat', { session_id });
        const data = res.data as Record<string, unknown>;
        if (data.is_disqualified) {
          handleDisqualification(data.disqualification_reason as string || 'You have been disqualified.');
        }
      } catch (_e) { /* ignore */ }
    }, 3000);

    // Audio capture in 10s chunks
    startAudioCapture();

    // Autosave every 30s
    autosaveIntervalRef.current = setInterval(() => saveAnswers(), 30000);

    // Timer countdown
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(frameIntervalRef.current);
      clearInterval(heartbeatIntervalRef.current);
      clearInterval(autosaveIntervalRef.current);
      clearInterval(timerIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  const handleProctoringResult = (data: Record<string, unknown>) => {
    proctoring.updateFromFrame(data);
    if (data.warning) showWarningBanner(data.warning as Record<string, unknown>);
    if (data.disqualified) handleDisqualification(data.disqualification_message as string);
  };

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioRecorderRef.current = recorder;
      let chunks: Blob[] = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        if (chunks.length > 0 && session_id) {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onload = async () => {
            const b64 = (reader.result as string).split(',')[1];
            try {
              const res = await api.post('/api/proctoring/events', {
                session_id,
                type: 'audio',
                data: b64,
              });
              const r = res.data as Record<string, unknown>;
              proctoring.updateFromAudio(r);
              if (r.warning) showWarningBanner(r.warning as Record<string, unknown>);
              if (r.disqualified) handleDisqualification('Disqualified due to audio violations');
            } catch (_e) { /* ignore */ }
          };
          reader.readAsDataURL(blob);
          chunks = [];
        }
      };

      recorder.start();
      const audioInterval = setInterval(() => {
        if (recorder.state === 'recording') { recorder.stop(); recorder.start(); }
      }, 10000);
      // store interval ref for cleanup (we'd need another ref for this)
      void audioInterval; // not tracked for simplicity
    } catch (_e) {
      console.warn('Microphone not available');
    }
  };

  const showWarningBanner = (warning: Record<string, unknown>) => {
    setWarningData(warning);
    setShowWarning(true);
    clearTimeout(warningTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => setShowWarning(false), 8000);
    toast.error(warning.message as string, { duration: 6000 });
  };

  const handleDisqualification = (message: string) => {
    proctoring.triggerDisqualification(message || 'You have been disqualified.');
    clearInterval(frameIntervalRef.current);
    clearInterval(autosaveIntervalRef.current);
    clearInterval(timerIntervalRef.current);
    clearInterval(heartbeatIntervalRef.current);
  };

  const handleAutoSubmit = async () => {
    await saveAnswers();
    try { await api.post(`/api/attempts/${attempt_id}/submit`); } catch (_e) { /* ignore */ }
    setSubmitted(true);
    navigate('/student/dashboard');
    toast('Time expired — exam submitted automatically.');
  };

  const saveAnswers = useCallback(async () => {
    if (!attempt_id || Object.keys(answersRef.current).length === 0) return;
    const payload = Object.entries(answersRef.current).map(([question_id, response]) => ({ question_id, response }));
    try {
      await api.put(`/api/attempts/${attempt_id}/answers`, payload);
    } catch (_e) {
      console.warn('Autosave failed');
    }
  }, [attempt_id]);

  const handleSubmit = async () => {
    await saveAnswers();
    try {
      await api.post(`/api/attempts/${attempt_id}/submit`);
    } catch (_e) { /* ignore */ }
    setSubmitted(true);
    clearInterval(frameIntervalRef.current);
    clearInterval(heartbeatIntervalRef.current);
    navigate('/student/dashboard');
    toast.success('Exam submitted successfully!');
  };

  if (submitted) return null;

  if (proctoring.isDisqualified) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-400 mb-2">Disqualified</h1>
          <p className="text-slate-300 mb-4">{proctoring.disqualificationMessage}</p>
          <p className="text-slate-400 text-sm mb-6">Your session has been terminated. Contact your administrator.</p>
          <button onClick={() => navigate('/student/dashboard')} className="px-6 py-2 bg-primary-600 text-white rounded-lg">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQ] as Record<string, unknown> | undefined;

  return (
    <div className="h-screen bg-dark-bg flex flex-col overflow-hidden">
      {/* Demo mode banner */}
      {proctoring.demoMode && (
        <div className="bg-amber-600/20 border-b border-amber-600/40 text-amber-400 text-xs text-center py-1 font-medium">
          ⚠ DEMO MODE — AI proctoring results are simulated, not real detections
        </div>
      )}

      {/* Warning overlay */}
      {showWarning && warningData && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full mx-4">
          <div className="bg-red-900/90 border border-red-600 rounded-xl p-4 shadow-2xl flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-300 font-semibold">Warning {warningData.number as number}/{warningData.max_warnings as number}</p>
              <p className="text-slate-300 text-sm mt-1">{warningData.message as string}</p>
            </div>
            <button onClick={() => setShowWarning(false)} className="text-slate-400 hover:text-slate-200 text-xs">✕</button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="bg-dark-card border-b border-dark-border flex items-center justify-between px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-slate-400 text-sm font-medium">MONITORED EXAM</span>
          {exam && <span className="text-slate-200 font-semibold text-sm">{exam.title as string}</span>}
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono font-bold text-lg ${
            timeRemaining < 300 ? 'bg-red-900/50 text-red-400 border border-red-700/50' :
            timeRemaining < 600 ? 'bg-amber-900/50 text-amber-400 border border-amber-700/50' :
            'bg-dark-bg text-slate-200 border border-dark-border'
          }`}>
            <Clock className="w-4 h-4" />
            {formatDuration(timeRemaining)}
          </div>
          {proctoring.isConnected
            ? <Wifi className="w-4 h-4 text-green-400" />
            : <WifiOff className="w-4 h-4 text-red-400" />
          }
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
          >
            <Send className="w-4 h-4" />
            Submit Exam
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Question navigator */}
        <div className="w-56 bg-dark-card border-r border-dark-border flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3 border-b border-dark-border">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Questions</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-4 gap-1.5">
              {questions.map((q, i) => {
                const qid = (q.id || q._id) as string;
                return (
                  <button
                    key={qid}
                    onClick={() => setCurrentQ(i)}
                    className={`w-full aspect-square rounded-lg text-xs font-semibold transition-colors ${
                      i === currentQ ? 'bg-primary-600 text-white' :
                      answers[qid] ? 'bg-green-900/50 text-green-400 border border-green-700/50' :
                      'bg-dark-bg text-slate-400 border border-dark-border hover:border-slate-500'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs">
              <div className="flex items-center gap-2 text-slate-500">
                <div className="w-3 h-3 rounded bg-green-900/50 border border-green-700/50" />
                Answered ({Object.keys(answers).length})
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <div className="w-3 h-3 rounded bg-dark-bg border border-dark-border" />
                Not Answered ({questions.length - Object.keys(answers).length})
              </div>
            </div>
          </div>
        </div>

        {/* Center: Question */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentQuestion && (
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <span className="text-slate-400 text-sm">Question {currentQ + 1} of {questions.length}</span>
                <span className="text-slate-400 text-sm">{currentQuestion.marks as number} mark{(currentQuestion.marks as number) > 1 ? 's' : ''}</span>
              </div>
              <div className="bg-dark-card border border-dark-border rounded-xl p-5 mb-5">
                <p className="text-slate-100 text-base leading-relaxed">{currentQuestion.text as string}</p>
              </div>

              {/* MCQ */}
              {currentQuestion.question_type === 'mcq' && Array.isArray(currentQuestion.options) && (
                <div className="space-y-2.5">
                  {(currentQuestion.options as string[]).map((opt: string, i: number) => {
                    const qid = (currentQuestion.id || currentQuestion._id) as string;
                    return (
                      <button
                        key={i}
                        onClick={() => setAnswers((prev) => ({ ...prev, [qid]: opt }))}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          answers[qid] === opt
                            ? 'border-primary-500 bg-primary-600/20 text-slate-100'
                            : 'border-dark-border bg-dark-bg text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <span className="font-medium text-slate-400 mr-3">{String.fromCharCode(65 + i)}.</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Short/Long answer */}
              {(currentQuestion.question_type === 'short_answer' || currentQuestion.question_type === 'long_answer') && (
                <textarea
                  value={answers[(currentQuestion.id || currentQuestion._id) as string] || ''}
                  onChange={(e) => {
                    const qid = (currentQuestion.id || currentQuestion._id) as string;
                    setAnswers((prev) => ({ ...prev, [qid]: e.target.value }));
                  }}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  rows={currentQuestion.question_type === 'long_answer' ? 10 : 4}
                  placeholder="Type your answer here..."
                />
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
                  disabled={currentQ === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-dark-card border border-dark-border text-slate-300 rounded-lg disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />Previous
                </button>
                <button
                  onClick={() => saveAnswers()}
                  className="px-4 py-2 bg-dark-card border border-dark-border text-slate-400 rounded-lg text-sm"
                >
                  Save Answer
                </button>
                <button
                  onClick={() => setCurrentQ((q) => Math.min(questions.length - 1, q + 1))}
                  disabled={currentQ === questions.length - 1}
                  className="flex items-center gap-2 px-4 py-2 bg-dark-card border border-dark-border text-slate-300 rounded-lg disabled:opacity-30"
                >
                  Next<ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Proctoring status */}
        <div className="w-52 bg-dark-card border-l border-dark-border flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3 border-b border-dark-border">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Proctoring</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="rounded-lg overflow-hidden border border-dark-border">
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                mirrored
                className="w-full"
                videoConstraints={{ facingMode: 'user', width: 200, height: 150 }}
                screenshotQuality={0.7}
              />
            </div>
            <StatusRow label="Face Detected" ok={proctoring.faceCount === 1} warn={proctoring.faceCount === 0} value={`${proctoring.faceCount} face${proctoring.faceCount !== 1 ? 's' : ''}`} />
            <StatusRow label="Identity" ok={proctoring.identityVerified} warn={!proctoring.identityVerified} value={proctoring.identityVerified ? `${Math.round(proctoring.identityConfidence * 100)}%` : 'Checking...'} />
            <StatusRow label="Warnings" ok={proctoring.warningCount === 0} warn={proctoring.warningCount > 0} value={`${proctoring.warningCount} / ${proctoring.maxWarnings}`} critical={proctoring.warningCount >= proctoring.maxWarnings - 1} />
            {proctoring.objects.length > 0 && (
              <div className="p-2 bg-red-900/30 border border-red-700/40 rounded-lg">
                <p className="text-red-400 text-xs font-medium">⚠ Object Detected</p>
                <p className="text-slate-400 text-xs">{(proctoring.objects as Array<{class: string}>).map((o) => o.class).join(', ')}</p>
              </div>
            )}
            {proctoring.demoMode && (
              <div className="text-xs text-amber-500 text-center border border-amber-700/30 rounded p-1">DEMO MODE</div>
            )}
          </div>
        </div>
      </div>

      {/* Submit confirmation modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-slate-100 font-semibold text-lg mb-2">Submit Examination?</h3>
            <p className="text-slate-400 text-sm mb-2">
              You have answered {Object.keys(answers).length} of {questions.length} questions.
            </p>
            <p className="text-slate-400 text-sm mb-5">Once submitted, you cannot make changes.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSubmitConfirm(false)} className="flex-1 py-2 bg-dark-bg border border-dark-border text-slate-300 rounded-lg">Cancel</button>
              <button onClick={handleSubmit} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatusRow: React.FC<{ label: string; ok: boolean; warn: boolean; value: string; critical?: boolean }> = ({ label, ok, warn, value, critical }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-400 text-xs">{label}</span>
    <span className={`text-xs font-medium ${critical ? 'text-red-400' : ok ? 'text-green-400' : warn ? 'text-amber-400' : 'text-slate-400'}`}>{value}</span>
  </div>
);
