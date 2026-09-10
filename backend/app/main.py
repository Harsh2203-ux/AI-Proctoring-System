import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.db.connection import connect_db, close_db
from app.db.indexes import create_indexes
from app.db.seed import seed

from app.api.auth import router as auth_router
from app.api.students import router as students_router
from app.api.exams import router as exams_router
from app.api.attempts import router as attempts_router
from app.api.admin import router as admin_router
from app.api.proctoring_ws import router as proctoring_ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI Proctoring System Backend...")
    await connect_db()
    await create_indexes()
    await seed()

    # Ensure evidence directory exists
    os.makedirs(settings.EVIDENCE_STORAGE_PATH, exist_ok=True)

    logger.info(f"Demo Mode: {settings.DEMO_MODE}")
    logger.info("Backend ready.")
    yield
    await close_db()
    logger.info("Backend shutdown complete.")


app = FastAPI(
    title="AI Proctoring System API",
    description="AI-Powered Secure Online Examination & Proctoring System",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(students_router)
app.include_router(exams_router)
app.include_router(attempts_router)
app.include_router(admin_router)
app.include_router(proctoring_ws_router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "demo_mode": settings.DEMO_MODE,
        "version": "1.0.0",
    }
