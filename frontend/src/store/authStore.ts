import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  role: 'student' | 'admin';
  full_name: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

// ── Per-tab storage using sessionStorage ──────────────────────────────────────
//
// localStorage is shared across ALL browser tabs for the same origin.
// When student logs in Tab 2, it overwrites admin's token in Tab 1.
//
// sessionStorage is isolated per tab — Tab 1 (admin) and Tab 2 (student)
// each maintain their own independent authentication state.
//
// This means:
//  - Admin login in Tab 1 never affects Tab 2's auth
//  - Student login in Tab 2 never overwrites Tab 1's admin token
//  - Logout in one tab only clears that tab's session
//
// Trade-off: opening a new tab from an existing session does NOT carry over
// authentication (user must log in again in the new tab). This is the correct
// and secure behaviour for a proctoring system.
//

const SESSION_USER_KEY = 'session_user';
const SESSION_TOKEN_KEY = 'session_access_token';

function readSession(): { user: User | null; token: string | null } {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    return {
      user: raw ? (JSON.parse(raw) as User) : null,
      token: token || null,
    };
  } catch {
    return { user: null, token: null };
  }
}

const initial = readSession();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial.user,
  token: initial.token,
  isAuthenticated: !!initial.token,

  login: (user, token) => {
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
