import axios from 'axios';

// Use relative /api path — works on Vercel (same-origin) and locally with vite proxy
const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from sessionStorage (per-tab isolation)
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('session_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear this tab's session and redirect to login.
// IMPORTANT: Do NOT redirect when already on /login (or /register).
// Redirecting on the login page itself would cause a page reload that
// discards the error state, making failed login attempts appear to silently
// reset the form with no error message displayed to the user.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const isAuthPage =
        window.location.pathname === '/login' ||
        window.location.pathname === '/register';
      if (!isAuthPage) {
        sessionStorage.removeItem('session_access_token');
        sessionStorage.removeItem('session_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export { api };
export default api;
