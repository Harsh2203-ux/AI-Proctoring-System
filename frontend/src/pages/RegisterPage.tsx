import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Shield, GraduationCap, UserCog, CheckCircle2, ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useThemeStore } from '../store/themeStore';

// ── types ─────────────────────────────────────────────────────────────────────
type Step = 'choose' | 'student' | 'admin' | 'success';

/* ─────────────────────────────────────────────────────────────────────────────
   PAGE SHELL — defined OUTSIDE RegisterPage so it never remounts on state
   change. This is the root cause fix for the Admin ID focus bug: if Wrapper
   is defined inside the component body, every state update (typing) creates
   a new component type, forcing React to unmount+remount the DOM tree and
   re-trigger autoFocus on the first input.
───────────────────────────────────────────────────────────────────────────── */
const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useThemeStore();
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: 'var(--bg-deep)' }}
    >
      {/* subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--border-2) 1px, transparent 1px), linear-gradient(90deg, var(--border-2) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: theme === 'dark' ? 0.4 : 0.6,
        }}
      />
      {/* radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, var(--cyan-glow) 0%, transparent 65%)' }}
      />
      {/* theme toggle — top-right */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle size="sm" />
      </div>
      <div className="relative w-full max-w-md" style={{ animation: 'fadeInUp 0.4s ease both' }}>
        {children}
      </div>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ── Field component ───────────────────────────────────────────────────────────
// Each field gets a unique htmlFor / id pair passed in from the caller.
interface FieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  autoFocus?: boolean;
  showToggle?: boolean;
  show?: boolean;
  onToggle?: () => void;
  name?: string;
  autoComplete?: string;
}

const Field: React.FC<FieldProps> = ({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  hint,
  autoFocus,
  showToggle,
  show,
  onToggle,
  name,
  autoComplete,
}) => (
  <div>
    <label
      htmlFor={id}
      className="block text-xs font-medium mb-2 uppercase tracking-wider"
      style={{ color: 'var(--muted)' }}
    >
      {label}
    </label>
    <div className="relative">
      <input
        id={id}
        name={name || id}
        type={showToggle ? (show ? 'text' : 'password') : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        className={'w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors' + (showToggle ? ' pr-10' : '')}
        style={{
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          color: 'var(--foreground)',
        }}
        onFocus={(e) => (e.target.style.borderColor = 'var(--input-focus)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--input-border)')}
      />
      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: 'var(--muted)' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--foreground)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--muted)')}
          aria-label={show ? 'Hide' : 'Show'}
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
    {hint && <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>{hint}</p>}
  </div>
);

// ── role card ─────────────────────────────────────────────────────────────────
interface RoleCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
  onClick: () => void;
}

const RoleCard: React.FC<RoleCardProps> = ({ icon, title, description, accentColor, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left rounded-xl p-5 transition-colors duration-200 group"
    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = accentColor)}
    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}
  >
    <div className="flex items-start gap-4">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}40` }}
      >
        <span style={{ color: accentColor }}>{icon}</span>
      </div>
      <div>
        <p className="font-semibold text-sm mb-1" style={{ color: 'var(--foreground)' }}>{title}</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{description}</p>
      </div>
      <ArrowLeft
        className="w-4 h-4 ml-auto flex-shrink-0 mt-1 rotate-180 transition-colors"
        style={{ color: 'var(--muted)' }}
      />
    </div>
  </button>
);

// ── submit button ─────────────────────────────────────────────────────────────
const SubmitBtn: React.FC<{ loading: boolean; label: string }> = ({ loading, label }) => (
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
    {loading ? (
      <span className="flex items-center justify-center gap-2">
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Creating account...
      </span>
    ) : label}
  </button>
);

// ── error banner ──────────────────────────────────────────────────────────────
const ErrorBanner: React.FC<{ msg: string }> = ({ msg }) => (
  <div
    className="mb-5 flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm"
    style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)' }}
  >
    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
    <span>{msg}</span>
  </div>
);

// ── back button ───────────────────────────────────────────────────────────────
const BackBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
    style={{
      background: 'var(--overlay)',
      border: '1px solid var(--border)',
      color: 'var(--muted)',
    }}
    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--foreground)')}
    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--muted)')}
    aria-label="Back"
  >
    <ArrowLeft className="w-4 h-4" />
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export const RegisterPage: React.FC = () => {
  const [step, setStep] = useState<Step>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // ── student form state ──────────────────────────────────────────────────
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sStudentId, setSStudentId] = useState('');
  const [sPass, setSPass] = useState('');
  const [sConfirm, setSConfirm] = useState('');
  const [showSPass, setShowSPass] = useState(false);
  const [showSConfirm, setShowSConfirm] = useState(false);

  // ── admin form state ────────────────────────────────────────────────────
  const [aName, setAName] = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aAdminId, setAAdminId] = useState('');
  const [aPass, setAPass] = useState('');
  const [aConfirm, setAConfirm] = useState('');
  const [showAPass, setShowAPass] = useState(false);
  const [showAConfirm, setShowAConfirm] = useState(false);

  const clearError = () => setError('');

  // ── handlers ───────────────────────────────────────────────────────────
  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (sPass !== sConfirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/api/auth/register/student', {
        full_name: sName, email: sEmail, student_id: sStudentId,
        password: sPass, confirm_password: sConfirm,
      });
      // Clear sensitive fields immediately on success — never keep passwords in state
      setSPass(''); setSConfirm('');
      setStep('success');
      toast.success('Student account created! You can now sign in.');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (aPass !== aConfirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/api/auth/register/admin', {
        full_name: aName, email: aEmail, admin_id: aAdminId,
        password: aPass, confirm_password: aConfirm,
      });
      // Clear sensitive fields immediately on success
      setAPass(''); setAConfirm('');
      setStep('success');
      toast.success('Administrator account created! You can now sign in.');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── sign-in link ────────────────────────────────────────────────────────
  const SignInLink = () => (
    <p className="text-center text-sm mt-5" style={{ color: 'var(--muted)' }}>
      Already have an account?{' '}
      <Link
        to="/login"
        className="font-medium transition-colors"
        style={{ color: 'var(--cyan)' }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.8')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
      >
        Sign In
      </Link>
    </p>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: choose role
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'choose') {
    return (
      <PageShell>
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--primary-bg)', border: '1px solid var(--primary-border)' }}
          >
            <Shield className="w-4 h-4" style={{ color: 'var(--primary-text)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Create Account</h1>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Choose your account type to get started</p>
          </div>
        </div>

        <div className="space-y-3">
          <RoleCard
            icon={<GraduationCap className="w-5 h-5" />}
            title="Student Account"
            description="Take secure examinations and track your examination activity and proctoring reports."
            accentColor="#8b5cf6"
            onClick={() => { setStep('student'); clearError(); }}
          />
          <RoleCard
            icon={<UserCog className="w-5 h-5" />}
            title="Administrator Account"
            description="Manage examinations, candidates, proctoring sessions and review reports."
            accentColor="#06b6d4"
            onClick={() => { setStep('admin'); clearError(); }}
          />
        </div>

        <p className="text-center text-sm mt-8" style={{ color: 'var(--muted)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium transition-colors" style={{ color: 'var(--cyan)' }}>
            Sign In
          </Link>
        </p>
      </PageShell>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: success
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <PageShell>
        <div className="text-center py-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
            style={{ background: 'var(--primary-bg)', border: '1px solid var(--primary-border)' }}
          >
            <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--primary-text)' }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>Account Created</h2>
          <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>
            Your account has been created successfully. You can now sign in.
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="px-8 py-3 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--cyan) 0%, var(--primary) 100%)' }}
          >
            Go to Sign In
          </button>
        </div>
      </PageShell>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: student form
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'student') {
    return (
      <PageShell>
        {/* header row */}
        <div className="flex items-center gap-3 mb-6">
          <BackBtn onClick={() => { setStep('choose'); clearError(); }} />
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)' }}
            >
              <GraduationCap className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>Student Registration</h2>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Create your student account</p>
            </div>
          </div>
        </div>

        {error && <ErrorBanner msg={error} />}

        <form onSubmit={handleStudentSubmit} className="space-y-4" noValidate>
          <Field
            id="student-full-name"
            name="fullName"
            label="Full Name"
            value={sName}
            onChange={setSName}
            placeholder="Jane Smith"
            required
            autoFocus
            hint="At least 2 characters"
            autoComplete="name"
          />
          <Field
            id="student-email"
            name="email"
            label="Email Address"
            type="email"
            value={sEmail}
            onChange={setSEmail}
            placeholder="jane@university.edu"
            required
            autoComplete="email"
          />
          <Field
            id="student-id"
            name="studentId"
            label="Student ID"
            value={sStudentId}
            onChange={setSStudentId}
            placeholder="e.g. STU2024001"
            required
            hint="Must be unique — your institution-issued student number"
            autoComplete="off"
          />
          <Field
            id="student-password"
            name="password"
            label="Password"
            value={sPass}
            onChange={setSPass}
            required
            showToggle
            show={showSPass}
            onToggle={() => setShowSPass((v) => !v)}
            placeholder="Min 8 chars, upper, lower, digit, special"
            hint="e.g. MyP@ssw0rd — uppercase, lowercase, digit, special character"
            autoComplete="new-password"
          />
          <Field
            id="student-confirm-password"
            name="confirmPassword"
            label="Confirm Password"
            value={sConfirm}
            onChange={setSConfirm}
            required
            showToggle
            show={showSConfirm}
            onToggle={() => setShowSConfirm((v) => !v)}
            placeholder="Re-enter password"
            autoComplete="new-password"
          />
          <div className="pt-1">
            <SubmitBtn loading={loading} label="Create Student Account" />
          </div>
        </form>

        <SignInLink />
      </PageShell>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: admin form
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <PageShell>
      {/* header row */}
      <div className="flex items-center gap-3 mb-6">
        <BackBtn onClick={() => { setStep('choose'); clearError(); }} />
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.35)' }}
          >
            <UserCog className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>Administrator Registration</h2>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Create your administrator account</p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner msg={error} />}

      <form onSubmit={handleAdminSubmit} className="space-y-4" noValidate>
        <Field
          id="admin-full-name"
          name="fullName"
          label="Full Name"
          value={aName}
          onChange={setAName}
          placeholder="Dr. John Doe"
          required
          autoFocus
          hint="At least 2 characters"
          autoComplete="name"
        />
        <Field
          id="admin-email"
          name="email"
          label="Email Address"
          type="email"
          value={aEmail}
          onChange={setAEmail}
          placeholder="admin@institution.edu"
          required
          autoComplete="email"
        />
        <Field
          id="admin-id"
          name="adminId"
          label="Administrator / Employee ID"
          value={aAdminId}
          onChange={setAAdminId}
          placeholder="e.g. ADM2024001"
          required
          hint="Must be unique — your institution-issued admin identifier"
          autoComplete="off"
        />
        <Field
          id="admin-password"
          name="password"
          label="Password"
          value={aPass}
          onChange={setAPass}
          required
          showToggle
          show={showAPass}
          onToggle={() => setShowAPass((v) => !v)}
          placeholder="Min 8 chars, upper, lower, digit, special"
          hint="Must include uppercase, lowercase, digit, and special character"
          autoComplete="new-password"
        />
        <Field
          id="admin-confirm-password"
          name="confirmPassword"
          label="Confirm Password"
          value={aConfirm}
          onChange={setAConfirm}
          required
          showToggle
          show={showAConfirm}
          onToggle={() => setShowAConfirm((v) => !v)}
          placeholder="Re-enter password"
          autoComplete="new-password"
        />

        <div className="pt-1">
          <SubmitBtn loading={loading} label="Create Administrator Account" />
        </div>
      </form>

      <SignInLink />
    </PageShell>
  );
};
