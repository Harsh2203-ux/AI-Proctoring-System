import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In local Vercel dev (vercel dev), the API functions run on port 3000
    // alongside the frontend. Use `vercel dev` for local development which
    // serves everything together. The proxy below is a fallback for plain
    // `vite dev` usage against the old FastAPI backend.
    proxy: {
      '/api': {
        // In local dev: FastAPI backend runs on port 8000.
        // In production (Vercel): /api is handled by serverless functions — no proxy needed.
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
