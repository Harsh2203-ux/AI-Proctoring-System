"""Evidence Service - save screenshots and audio clips, link to violations."""
import os
import base64
import aiofiles
from datetime import datetime
from app.db.connection import get_db
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


async def save_screenshot(
    session_id: str,
    student_id: str,
    exam_id: str,
    image_b64: str,
    violation_id: str = None,
    metadata: dict = None,
) -> str:
    """Save a screenshot and create evidence record. Returns file path."""
    db = get_db()

    evidence_dir = os.path.join(
        settings.EVIDENCE_STORAGE_PATH, exam_id, student_id, "screenshots"
    )
    os.makedirs(evidence_dir, exist_ok=True)

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    fname = f"{violation_id or 'event'}_{ts}.jpg"
    fpath = os.path.join(evidence_dir, fname)

    try:
        # Strip data URL prefix if present
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        img_bytes = base64.b64decode(image_b64)
        async with aiofiles.open(fpath, "wb") as f:
            await f.write(img_bytes)
        file_size = len(img_bytes)
    except Exception as e:
        logger.error(f"Failed to save screenshot: {e}")
        return None

    evidence_doc = {
        "violation_id": violation_id,
        "session_id": session_id,
        "evidence_type": "screenshot",
        "file_path": fpath,
        "file_size_bytes": file_size,
        "timestamp": datetime.utcnow(),
        "metadata": metadata or {},
        "is_demo": (metadata or {}).get("demo", False),
    }
    result = await db.evidence.insert_one(evidence_doc)
    logger.debug(f"Screenshot saved: {fpath}")
    return str(result.inserted_id)


async def save_audio(
    session_id: str,
    student_id: str,
    exam_id: str,
    audio_b64: str,
    violation_id: str = None,
    metadata: dict = None,
) -> str:
    """Save an audio clip and create evidence record. Returns evidence ID."""
    db = get_db()

    evidence_dir = os.path.join(
        settings.EVIDENCE_STORAGE_PATH, exam_id, student_id, "audio"
    )
    os.makedirs(evidence_dir, exist_ok=True)

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    fname = f"{violation_id or 'audio'}_{ts}.wav"
    fpath = os.path.join(evidence_dir, fname)

    try:
        if "," in audio_b64:
            audio_b64 = audio_b64.split(",", 1)[1]
        audio_bytes = base64.b64decode(audio_b64)
        async with aiofiles.open(fpath, "wb") as f:
            await f.write(audio_bytes)
        file_size = len(audio_bytes)
    except Exception as e:
        logger.error(f"Failed to save audio: {e}")
        return None

    evidence_doc = {
        "violation_id": violation_id,
        "session_id": session_id,
        "evidence_type": "audio_clip",
        "file_path": fpath,
        "file_size_bytes": file_size,
        "timestamp": datetime.utcnow(),
        "metadata": metadata or {},
        "is_demo": (metadata or {}).get("demo", False),
    }
    result = await db.evidence.insert_one(evidence_doc)
    logger.debug(f"Audio saved: {fpath}")
    return str(result.inserted_id)
