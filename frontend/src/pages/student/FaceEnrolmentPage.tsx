import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import {
  Camera, CheckCircle2, AlertCircle, Upload, ArrowLeft,
  RefreshCw, Wifi, WifiOff, Loader2,
} from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

type CameraState = 'loading' | 'ready' | 'denied' | 'error';

export const FaceEnrolmentPage: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const [cameraState, setCameraState] = useState<CameraState>('loading');
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);
  const navigate = useNavigate();

  // Check if the AI / backend enrollment is reachable
  useEffect(() => {
    const check = async () => {
      try {
        await api.get('/health');
        setAiOnline(true);
      } catch {
        setAiOnline(false);
      }
    };
    check();
  }, []);

  const handleUserMedia = useCallback(() => {
    setCameraState('ready');
  }, []);

  const handleUserMediaError = useCallback((err: string | DOMException) => {
    const msg = typeof err === 'string' ? err : err.name;
    if (msg === 'NotAllowedError' || msg === 'PermissionDeniedError') {
      setCameraState('denied');
    } else {
      setCameraState('error');
    }
  }, []);

  const capture = useCallback(() => {
    const img = webcamRef.current?.getScreenshot();
    if (img) {
      setCapturedImage(img);
      setEnrollError('');
    }
  }, []);

  const retake = () => {
    setCapturedImage(null);
    setEnrollError('');
  };

  const handleEnrol = async () => {
    if (!capturedImage) return;
    setEnrolling(true);
    setEnrollError('');

    try {
      // Convert base64 data-URL to Blob
      const fetchRes = await fetch(capturedImage);
      const blob = await fetchRes.blob();

      const formData = new FormData();
      formData.append('file', blob, 'face.jpg');

      const response = await api.post('/api/students/enrol-face', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.demo) {
        toast.success('Face enrolled (DEMO MODE — simulated encoding)');
      } else {
        toast.success('Face enrolled successfully!');
      }
      setEnrolled(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail || '';
      if (detail.includes('AI service unavailable') || detail.includes('connection')) {
        setEnrollError(
          'The AI service is currently unavailable. Make sure the AI service is running on port 8001, then try again.'
        );
      } else if (detail.includes('No face detected') || detail.includes('Face encoding failed')) {
        setEnrollError(
          'No face was detected in the image. Ensure good lighting, look directly at the camera, and try again.'
        );
      } else if (detail) {
        setEnrollError(detail);
      } else {
        setEnrollError('Enrolment failed. Please check your connection and try again.');
      }
    } finally {
      setEnrolling(false);
    }
  };

  // ── camera unavailable states ───────────────────────────────────────────────
  const renderCameraError = () => {
    if (cameraState === 'denied') {
      return (
        <div className="rounded-xl p-6 text-center"
          style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--danger-text)' }} />
          <p className="font-semibold mb-1" style={{ color: 'var(--danger-text)' }}>Camera Access Denied</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Please allow camera access in your browser settings and reload the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mx-auto"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            <RefreshCw className="w-4 h-4" /> Reload Page
          </button>
        </div>
      );
    }
    if (cameraState === 'error') {
      return (
        <div className="rounded-xl p-6 text-center"
          style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}>
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--warning-text)' }} />
          <p className="font-semibold mb-1" style={{ color: 'var(--warning-text)' }}>Camera Unavailable</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Could not access your camera. Ensure it is connected and not in use by another application.
          </p>
        </div>
      );
    }
    return null;
  };

  // ── success screen ─────────────────────────────────────────────────────────
  if (enrolled) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-lg">
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>Enrolment Complete</h2>
            <p className="mb-6 text-sm" style={{ color: 'var(--muted)' }}>
              Your face has been successfully registered for identity verification.
            </p>
            <button
              onClick={() => navigate('/student/dashboard')}
              className="px-6 py-2.5 text-white rounded-lg font-medium text-sm"
              style={{ background: 'var(--primary)' }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── main enrolment screen ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/student/dashboard')}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--muted)' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--foreground)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--muted)')}
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Face Enrolment</h1>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Register your face for identity verification</p>
            </div>
          </div>
          <ThemeToggle size="sm" />
        </div>

        {/* AI service status badge */}
        {aiOnline === false && (
          <div className="mb-4 flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm"
            style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)' }}>
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Backend unreachable.</strong> Make sure the backend (port 8000) and AI service (port 8001) are running.
            </span>
          </div>
        )}
        {aiOnline === true && (
          <div className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-text)' }}>
            <Wifi className="w-3.5 h-3.5" />
            <span>Services online — ready to enrol</span>
          </div>
        )}

        <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* Instructions */}
          <div className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'var(--primary-bg)', border: '1px solid var(--primary-border)' }}>
            <p className="font-medium mb-1" style={{ color: 'var(--primary-text)' }}>Instructions</p>
            <ul className="list-disc list-inside space-y-1 text-sm" style={{ color: 'var(--muted)' }}>
              <li>Ensure good lighting on your face</li>
              <li>Look directly at the camera</li>
              <li>Only one face should be visible</li>
            </ul>
          </div>

          {/* Error banner */}
          {enrollError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm"
              style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)' }}>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{enrollError}</span>
            </div>
          )}

          {/* Camera error states */}
          {(cameraState === 'denied' || cameraState === 'error') && renderCameraError()}

          {/* Camera loading placeholder */}
          {cameraState === 'loading' && !capturedImage && (
            <div className="rounded-xl flex items-center justify-center h-48 mb-4"
              style={{ background: 'var(--overlay)', border: '1px solid var(--border)' }}>
              <div className="flex flex-col items-center gap-2" style={{ color: 'var(--muted)' }}>
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Starting camera…</span>
              </div>
            </div>
          )}

          {/* Webcam view */}
          {!capturedImage && cameraState !== 'denied' && cameraState !== 'error' ? (
            <div className="space-y-4">
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  border: '1px solid var(--border)',
                  display: cameraState === 'loading' ? 'none' : 'block',
                }}
              >
                <Webcam
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.92}
                  className="w-full"
                  mirrored
                  videoConstraints={{ facingMode: 'user', width: 480, height: 360 }}
                  onUserMedia={handleUserMedia}
                  onUserMediaError={handleUserMediaError}
                />
              </div>
              {cameraState === 'ready' && (
                <button
                  onClick={capture}
                  className="w-full flex items-center justify-center gap-2 py-3 text-white rounded-lg font-medium text-sm"
                  style={{ background: 'var(--primary)' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                >
                  <Camera className="w-5 h-5" />
                  Capture Photo
                </button>
              )}
            </div>
          ) : capturedImage ? (
            /* Preview + enrol */
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <img src={capturedImage} alt="Captured face" className="w-full" />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={retake}
                  disabled={enrolling}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--overlay)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                >
                  Retake
                </button>
                <button
                  onClick={handleEnrol}
                  disabled={enrolling || aiOnline === false}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#16a34a' }}
                  onMouseEnter={(e) => { if (!enrolling && aiOnline !== false) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                >
                  {enrolling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Enrol Face
                    </>
                  )}
                </button>
              </div>
              {aiOnline === false && (
                <p className="text-xs text-center" style={{ color: 'var(--danger-text)' }}>
                  Cannot enrol — backend is unreachable. Start the backend and AI service first.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
