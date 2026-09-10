import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Shield, Cpu, Activity, Lock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useThemeStore } from '../store/themeStore';

// ── animated scan line ────────────────────────────────────────────────────────
const ScanLine: React.FC = () => (
  <div
    className="pointer-events-none absolute left-0 right-0 h-px"
    style={{
      background: 'linear-gradient(to right, transparent, var(--cyan), transparent)',
      animation: 'scanDown 4s linear infinite',
    }}
  />
);

// ── face-scan SVG ─────────────────────────────────────────────────────────────
const FaceScanVisual: React.FC = () => (
  <svg viewBox="0 0 200 220" fill="none" className="w-full max-w-[220px]">
    <circle cx="100" cy="110" r="90" stroke="rgba(6,182,212,0.15)" strokeWidth="1" />
    <circle cx="100" cy="110" r="70" stroke="rgba(6,182,212,0.12)" strokeWidth="0.5" strokeDasharray="4 4" />
    <ellipse cx="100" cy="100" rx="36" ry="46" stroke="rgba(56,189,248,0.5)" strokeWidth="1.5" fill="rgba(6,182,212,0.04)" />
    <ellipse cx="87" cy="92" rx="5" ry="5" fill="rgba(56,189,248,0.6)" />
    <ellipse cx="113" cy="92" rx="5" ry="5" fill="rgba(56,189,248,0.6)" />
    <circle cx="87" cy="92" r="2" fill="rgba(6,182,212,1)" />
    <circle cx="113" cy="92" r="2" fill="rgba(6,182,212,1)" />
    <path d="M100 97 L96 108 Q100 111 104 108 Z" stroke="rgba(56,189,248,0.4)" strokeWidth="1" fill="none" />
    <path d="M90 116 Q100 122 110 116" stroke="rgba(56,189,248,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M64 64 L64 74 M64 64 L74 64" stroke="rgba(6,182,212,0.8)" strokeWidth="2" strokeLinecap="round" />
    <path d="M136 64 L136 74 M136 64 L126 64" stroke="rgba(6,182,212,0.8)" strokeWidth="2" strokeLinecap="round" />
    <path d="M64 156 L64 146 M64 156 L74 156" stroke="rgba(6,182,212,0.8)" strokeWidth="2" strokeLinecap="round" />
    <path d="M136 156 L136 146 M136 156 L126 156" stroke="rgba(6,182,212,0.8)" strokeWidth="2" strokeLinecap="round" />
    <line x1="64" y1="110" x2="136" y2="110" stroke="rgba(6,182,212,0.4)" strokeWidth="1" strokeDasharray="3 3" />
    <circle cx="64" cy="110" r="2" fill="rgba(6,182,212,0.8)" />
    <circle cx="136" cy="110" r="2" fill="rgba(6,182,212,0.8)" />
    <rect x="68" y="170" width="64" height="16" rx="3" fill="rgba(6,182,212,0.12)" stroke="rgba(6,182,212,0.3)" strokeWidth="0.5" />
    <text x="100" y="181" fill="rgba(56,189,248,0.9)" fontSize="7" textAnchor="middle" fontFamily="monospace">IDENTITY SCAN</text>
    <circle cx="40" cy="110" r="3" fill="rgba(6,182,212,0.5)" />
    <circle cx="160" cy="110" r="3" fill="rgba(6,182,212,0.5)" />
    <line x1="43" y1="110" x2="63" y2="110" stroke="rgba(6,182,212,0.3)" strokeWidth="0.5" />
    <line x1="137" y1="110" x2="157" y2="110" stroke="rgba(6,182,212,0.3)" strokeWidth="0.5" />
  </svg>
);

// ── stat badge ────────────────────────────────────────────────────────────────
const StatBadge: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div
    className="flex items-center gap-2 rounded-lg px-3 py-2"
    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
  >
    <span style={{ color: 'var(--cyan)' }}>{icon}</span>
    <div>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{value}</p>
    </div>
  </div>
);

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const { theme } = useThemeStore();
  const navigate = useNavigate();

  // keep tick for any future reactive element (unused currently but harmless)
  useEffect(() => { /* intentionally empty */ }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', { email, password });
      const { access_token, user } = res.data;
      login(user, access_token);
      toast.success(`Welcome back, ${user.full_name}!`);
      navigate(user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: 'admin' | 'student') => {
    setEmail(role === 'admin' ? 'admin@demo.com' : 'student@demo.com');
    setPassword(role === 'admin' ? 'Admin@1234' : 'Student@1234');
    setError('');
  };

  const isDark = theme === 'dark';

  return (
    <>
      <style>{`
        @keyframes scanDown {
          0%   { top: 0%; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.3; transform: translate(-50%,-50%) scale(1); }
          50%       { opacity: 0.6; transform: translate(-50%,-50%) scale(1.04); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .login-fade { animation: fadeInUp 0.5s ease both; }
        .cursor-blink::after {
          content: '|';
          animation: blink 1s step-end infinite;
          color: rgba(6,182,212,0.8);
        }
      `}</style>

      <div className="min-h-screen flex overflow-hidden" style={{ background: isDark ? '#060d1a' : 'var(--bg)' }}>

        {/* ── LEFT PANEL (dark always, it's the branding panel) ──────────────── */}
        <div
          className="hidden lg:flex lg:w-[52%] relative flex-col items-center justify-center p-12 overflow-hidden"
          style={{ background: '#060d1a' }}
        >
          {/* bg glow */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 60% 40%, rgba(6,182,212,0.08) 0%, transparent 65%)' }} />
          {/* grid */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(rgba(56,189,248,1) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
          {/* glow rings */}
          {[320, 500, 700].map((s, i) => (
            <div key={s} className="absolute rounded-full pointer-events-none" style={{
              width: s, height: s, left: '50%', top: '45%',
              transform: 'translate(-50%,-50%)',
              border: '1px solid rgba(6,182,212,0.15)',
              animation: `glowPulse ${3 + i}s ease-in-out ${i}s infinite`,
            }} />
          ))}
          {/* scan line */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <ScanLine />
          </div>

          {/* content */}
          <div className="relative z-10 flex flex-col items-center text-center max-w-md">
            <div className="mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.4)', boxShadow: '0 0 20px rgba(6,182,212,0.15)' }}>
                <Shield className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-xs font-semibold tracking-[0.25em] uppercase cursor-blink" style={{ color: 'rgba(6,182,212,0.9)' }}>
                PROCTORAI
              </span>
            </div>
            <div className="mb-8 opacity-90"><FaceScanVisual /></div>
            <h1 className="text-3xl font-bold text-white mb-3 leading-tight">
              AI Security<br />
              <span style={{ color: 'rgba(56,189,248,0.95)' }}>Command Center</span>
            </h1>
            <p className="text-sm text-slate-400 mb-8 leading-relaxed max-w-xs">
              Real-time computer-vision proctoring with multi-factor identity verification and anomaly detection.
            </p>
            <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
              <StatBadge icon={<Activity className="w-3.5 h-3.5" />} label="Status" value="Online" />
              <StatBadge icon={<Cpu className="w-3.5 h-3.5" />} label="AI Engine" value="Active" />
              <StatBadge icon={<Lock className="w-3.5 h-3.5" />} label="Security" value="AES-256" />
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────────── */}
        <div
          className="flex-1 flex flex-col items-center justify-center px-6 py-10 relative"
          style={{ background: isDark ? 'linear-gradient(160deg, #0d1525 0%, #0a1020 100%)' : 'var(--bg)' }}
        >
          {/* subtle glow (dark only) */}
          {isDark && (
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 30% 60%, rgba(6,182,212,0.04) 0%, transparent 60%)' }} />
          )}

          {/* theme toggle */}
          <div className="absolute top-4 right-4">
            <ThemeToggle size="sm" />
          </div>

          <div className="relative w-full max-w-sm login-fade">
            {/* mobile logo */}
            <div className="lg:hidden flex items-center gap-2 mb-8">
              <Shield className="w-6 h-6" style={{ color: 'var(--cyan)' }} />
              <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--cyan)' }}>ProctoAI</span>
            </div>

            {/* heading */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Sign In</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Enter your credentials to access your account</p>
            </div>

            {/* error */}
            {error && (
              <div className="mb-5 flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm"
                style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)' }}>
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* form — autoComplete="off" prevents browser from filling saved credentials on load */}
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  Email Address
                </label>
                <input
                  id="login-email"
                  name="login-email-field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  autoComplete="off"
                  className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--input-focus)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--input-border)')}
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="login-password-field"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    autoComplete="new-password"
                    className="w-full rounded-lg px-4 py-3 pr-10 text-sm outline-none transition-colors"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)' }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--input-focus)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--input-border)')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'var(--muted)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--foreground)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--muted)')}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                style={{
                  background: loading
                    ? 'var(--primary)'
                    : 'linear-gradient(135deg, var(--cyan) 0%, var(--primary) 100%)',
                  boxShadow: loading ? 'none' : '0 0 20px var(--cyan-glow)',
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Authenticating...
                    </>
                  ) : 'Sign In'}
                </span>
              </button>
            </form>

            {/* divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Demo Access</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            {/* demo tiles */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {(['admin', 'student'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => fillDemo(role)}
                  className="rounded-lg px-3 py-2.5 text-left transition-colors"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = role === 'admin' ? 'var(--cyan)' : '#8b5cf6')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: role === 'admin' ? 'var(--cyan)' : '#8b5cf6' }}>
                    {role === 'admin' ? 'Admin' : 'Student'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-2)' }}>
                    {role === 'admin' ? 'admin@demo.com' : 'student@demo.com'}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                    {role === 'admin' ? 'Admin@1234' : 'Student@1234'}
                  </p>
                </button>
              ))}
            </div>

            <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-medium transition-colors"
                style={{ color: 'var(--cyan)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.8')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
              >
                Create Account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
