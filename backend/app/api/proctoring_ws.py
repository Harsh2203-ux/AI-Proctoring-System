"""WebSocket endpoint for real-time proctoring."""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core.security import decode_token
from app.db.connection import get_db
from app.services.proctoring_pipeline import process_frame, process_audio
from app.services.violation_state_tracker import violation_state_tracker
from bson import ObjectId
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter(tags=["proctoring"])


@router.websocket("/ws/proctoring/{session_id}")
async def proctoring_websocket(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time exam proctoring."""
    # Authenticate
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = payload.get("sub")
    await websocket.accept()

    db = get_db()

    # Get session
    try:
        session = await db.proctoring_sessions.find_one({"_id": ObjectId(session_id)})
    except Exception:
        await websocket.send_json({"type": "error", "message": "Invalid session"})
        await websocket.close()
        return

    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    if str(session["student_id"]) != user_id:
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close(code=4003)
        return

    student_id = session["student_id"]
    exam_id = session["exam_id"]

    # Load exam config
    exam = await db.exams.find_one({"_id": ObjectId(exam_id)})
    config = exam.get("proctoring_config", {}) if exam else {}

    # Load face encoding
    profile = await db.student_profiles.find_one({"user_id": student_id})
    face_encoding = profile.get("face_encoding") if profile else None

    # Current session state (mutable cache to avoid DB reads on every frame)
    session_data = {
        "warning_count": session.get("warning_count", 0),
        "is_disqualified": session.get("is_disqualified", False),
    }

    # Send connected confirmation
    await websocket.send_json({
        "type": "connected",
        "session_id": session_id,
        "demo_mode": session.get("demo_mode", True),
        "message": "Proctoring session connected",
    })

    logger.info(f"WebSocket connected for session {session_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue

            # Check if session was disqualified externally
            if session_data.get("is_disqualified"):
                await websocket.send_json({
                    "type": "disqualified",
                    "message": "Your session has been terminated.",
                })
                break

            msg_type = message.get("type")

            if msg_type == "frame":
                image_b64 = message.get("data", "")
                result = await process_frame(
                    session_id, student_id, exam_id,
                    image_b64, face_encoding or [],
                    config, session_data,
                )
                # Update session_data cache
                if result.get("warning"):
                    session_data["warning_count"] = result["warning"]["number"]
                if result.get("disqualified"):
                    session_data["is_disqualified"] = True

                await websocket.send_json({
                    "type": "proctoring_result",
                    "face_count": result.get("face_count", 0),
                    "identity": result.get("identity", {}),
                    "pose": result.get("pose", {}),
                    "gaze": result.get("gaze", {}),
                    "objects": result.get("objects", []),
                    "violations": result.get("violations", []),
                    "warning": result.get("warning"),
                    "disqualified": result.get("disqualified", False),
                    "disqualification_message": result.get("disqualification_message"),
                    "demo": result.get("demo", False),
                    "timestamp": datetime.utcnow().isoformat(),
                })

                if result.get("disqualified"):
                    break

            elif msg_type == "audio":
                audio_b64 = message.get("data", "")
                result = await process_audio(
                    session_id, student_id, exam_id,
                    audio_b64, config, session_data,
                )
                if result.get("warning"):
                    session_data["warning_count"] = result["warning"]["number"]
                if result.get("disqualified"):
                    session_data["is_disqualified"] = True

                await websocket.send_json({
                    "type": "audio_result",
                    "transcript": result.get("transcript", ""),
                    "speaker_count": result.get("speaker_count", 1),
                    "violations": result.get("violations", []),
                    "warning": result.get("warning"),
                    "disqualified": result.get("disqualified", False),
                    "demo": result.get("demo", False),
                    "timestamp": datetime.utcnow().isoformat(),
                })

                if result.get("disqualified"):
                    break

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat()})

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        violation_state_tracker.clear(session_id)
        # End session if still active
        await db.proctoring_sessions.update_one(
            {"_id": ObjectId(session_id), "status": "active"},
            {"$set": {"status": "ended", "ended_at": datetime.utcnow()}}
        )
