import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from sessionStorage (per-tab — does NOT bleed across tabs)
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

export default api;
