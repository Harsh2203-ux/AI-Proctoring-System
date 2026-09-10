"""
Proctoring Pipeline - orchestrates AI calls and emits results.
"""
import httpx
import logging
from app.core.config import settings
from app.services.violation_state_tracker import violation_state_tracker
from app.services.violation_engine import process_violation_event
from app.services.evidence_service import save_screenshot, save_audio
from app.db.connection import get_db
from bson import ObjectId

logger = logging.getLogger(__name__)

AI_TIMEOUT = 15  # seconds


async def process_frame(
    session_id: str,
    student_id: str,
    exam_id: str,
    image_b64: str,
    face_encoding: list,
    config: dict,
    session_data: dict,
) -> dict:
    """Send frame to AI service, evaluate violations, return result dict."""
    db = get_db()

    if not image_b64:
        return {"error": "No image data"}

    try:
        async with httpx.AsyncClient(timeout=AI_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/ai/frame/analyse",
                json={
                    "image_b64": image_b64,
                    "face_encoding": face_encoding,
                    "config": config,
                },
            )
            ai_result = resp.json() if resp.status_code == 200 else {}
    except Exception as e:
        logger.warning(f"AI service call failed: {e}")
        ai_result = {"error": str(e), "face_count": 1, "demo": True}

    # Evaluate persistence thresholds
    events = violation_state_tracker.evaluate_frame(session_id, ai_result, config)

    violations = []
    new_warning = None
    disqualified = False
    disq_message = None

    for event in events:
        # Save screenshot for high/critical violations
        frame_path = None
        severity_for_event = {
            "face_absent": "medium",
            "multiple_faces": "high",
            "identity_mismatch": "critical",
            "object_detected": "high",
            "additional_person": "high",
        }.get(event["event_type"], "low")

        if severity_for_event in ("high", "critical") and image_b64:
            ev_id_placeholder = f"{session_id}_{event['event_type']}"
            try:
                await save_screenshot(
                    session_id, student_id, exam_id, image_b64,
                    violation_id=ev_id_placeholder,
                    metadata={"event_type": event["event_type"], "demo": event.get("demo", False)},
                )
            except Exception as e:
                logger.warning(f"Screenshot save failed: {e}")

        result = await process_violation_event(
            session_id, student_id, exam_id, event, session_data, config
        )

        if result.get("skipped"):
            continue

        violations.append(result)
        if result.get("warning"):
            new_warning = result["warning"]
        if result.get("disqualified"):
            disqualified = True
            disq_message = result.get("disqualification_message")

    # Update identity verification status
    identity = ai_result.get("identity", {})
    if identity and identity.get("is_match") and identity.get("confidence", 0) >= 0.6:
        await db.proctoring_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"identity_verified": True, "identity_confidence": identity.get("confidence", 0)}}
        )

    return {
        "face_count": ai_result.get("face_count", 0),
        "identity": ai_result.get("identity", {}),
        "pose": ai_result.get("pose", {}),
        "gaze": ai_result.get("gaze", {}),
        "objects": ai_result.get("objects", []),
        "events": events,
        "violations": violations,
        "warning": new_warning,
        "disqualified": disqualified,
        "disqualification_message": disq_message,
        "demo": ai_result.get("demo", False),
    }


async def process_audio(
    session_id: str,
    student_id: str,
    exam_id: str,
    audio_b64: str,
    config: dict,
    session_data: dict,
) -> dict:
    """Send audio to AI service, evaluate violations, return result dict."""
    if not audio_b64:
        return {"error": "No audio data"}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/ai/audio/analyse",
                json={"audio_b64": audio_b64, "config": config},
            )
            ai_result = resp.json() if resp.status_code == 200 else {}
    except Exception as e:
        logger.warning(f"AI audio call failed: {e}")
        ai_result = {"demo": True}

    events = violation_state_tracker.evaluate_audio(session_id, ai_result, config)

    violations = []
    new_warning = None
    disqualified = False

    for event in events:
        # Save audio for speech violations
        if event["event_type"] in ("suspicious_speech", "multiple_speakers", "background_conversation") and audio_b64:
            try:
                await save_audio(
                    session_id, student_id, exam_id, audio_b64,
                    metadata={"event_type": event["event_type"], "demo": event.get("demo", False)},
                )
            except Exception as e:
                logger.warning(f"Audio save failed: {e}")

        result = await process_violation_event(
            session_id, student_id, exam_id, event, session_data, config
        )
        if result.get("skipped"):
            continue
        violations.append(result)
        if result.get("warning"):
            new_warning = result["warning"]
        if result.get("disqualified"):
            disqualified = True

    return {
        "transcript": ai_result.get("transcript", ""),
        "speaker_count": ai_result.get("speaker_count", 1),
        "suspicious_speech": ai_result.get("suspicious_speech", False),
        "events": events,
        "violations": violations,
        "warning": new_warning,
        "disqualified": disqualified,
        "demo": ai_result.get("demo", False),
    }
