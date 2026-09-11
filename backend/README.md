# ⚠️ LEGACY — Local Development Only

This directory contains the original **FastAPI + MongoDB** backend.

It is **NOT used in the Vercel deployment**.

The production system uses:
- `api/` — Vercel serverless functions (Node.js/TypeScript)
- PostgreSQL (Neon or Vercel Postgres) instead of MongoDB

## Running locally (legacy)

```bash
# Requires: Python 3.9+, MongoDB running on localhost:27017
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## AI service (legacy)

```bash
cd ai
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## Vercel deployment

Use the `api/` directory. See the root `README.md` for full deployment instructions.
