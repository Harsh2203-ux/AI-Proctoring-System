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

// Handle 401 — clear this tab's session and redirect to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('session_access_token');
      sessionStorage.removeItem('session_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export { api };
export default api;
