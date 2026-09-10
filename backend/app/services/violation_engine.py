"""
Violation Engine
Converts proctoring events into violations, issues warnings, and handles disqualification.
"""
from app.db.connection import get_db
from app.models.proctoring import ViolationSeverity, EventType
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

SEVERITY_MAP = {
    "face_absent": ViolationSeverity.MEDIUM,
    "multiple_faces": ViolationSeverity.HIGH,
    "identity_mismatch": ViolationSeverity.CRITICAL,
    "head_pose_violation": ViolationSeverity.LOW,
    "gaze_violation": ViolationSeverity.LOW,
    "object_detected": ViolationSeverity.HIGH,
    "additional_person": ViolationSeverity.HIGH,
    "suspicious_speech": ViolationSeverity.MEDIUM,
    "multiple_speakers": ViolationSeverity.HIGH,
    "background_conversation": ViolationSeverity.MEDIUM,
}

WARNING_TRIGGERS = {
    "face_absent": True,
    "multiple_faces": True,
    "identity_mismatch": False,  # immediate disqualification
    "head_pose_violation": False,  # accumulate
    "gaze_violation": False,  # accumulate
    "object_detected": True,
    "additional_person": True,
    "suspicious_speech": True,
    "multiple_speakers": True,
    "background_conversation": True,
}

VIOLATION_MESSAGES = {
    "face_absent": "Your face is not visible. Please ensure your face is clearly visible to the camera.",
    "multiple_faces": "Multiple faces detected in your camera feed. This is not allowed during the examination.",
    "identity_mismatch": "Identity verification failed. Your face does not match the enrolled photo.",
    "head_pose_violation": "Please keep your head facing forward. Excessive head movement has been detected.",
    "gaze_violation": "Please keep your eyes on the screen. Eye gaze has been detected away from the screen.",
    "object_detected": "Prohibited object detected (phone/calculator/headphones/smartwatch). Please remove it immediately.",
    "additional_person": "An additional person has been detected in your examination area.",
    "suspicious_speech": "Suspicious speech or keywords detected in your examination environment.",
    "multiple_speakers": "Multiple speakers detected. Only you should be speaking during the examination.",
    "background_conversation": "Background conversation detected. Please ensure you are in a quiet environment.",
}


async def process_violation_event(
    session_id: str,
    student_id: str,
    exam_id: str,
    event: Dict[str, Any],
    session_data: Dict[str, Any],
    config: Dict[str, Any],
    frame_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process a single violation event.
    Returns a result dict with: violation_id, warning, disqualified, message
    """
    db = get_db()
    event_type = event["event_type"]
    confidence = event.get("confidence", 0.0)
    duration = event.get("duration_seconds", 0.0)
    is_demo = event.get("demo", False)

    # Store proctoring event
    event_doc = {
        "session_id": session_id,
        "student_id": student_id,
        "event_type": event_type,
        "raw_payload": event,
        "confidence": confidence,
        "timestamp": datetime.utcnow(),
        "frame_path": frame_path,
        "is_demo": is_demo,
    }
    event_result = await db.proctoring_events.insert_one(event_doc)
    event_id = str(event_result.inserted_id)

    severity = SEVERITY_MAP.get(event_type, ViolationSeverity.LOW)
    triggers_warning = WARNING_TRIGGERS.get(event_type, False)
    warnings_before_disq = config.get("warnings_before_disqualification", 3)
    immediate_disq = config.get("critical_violation_immediate_disqualification", True)

    # Check if this event type already has recent violation (dedup within 30s)
    recent_cutoff = datetime.utcnow()
    from datetime import timedelta
    recent_cutoff = recent_cutoff - timedelta(seconds=30)
    existing = await db.violations.find_one({
        "session_id": session_id,
        "violation_type": event_type,
        "timestamp": {"$gte": recent_cutoff},
    })
    if existing and event_type not in ["identity_mismatch", "object_detected"]:
        return {"violation_id": None, "warning": None, "disqualified": False, "skipped": True}

    # Create violation
    current_warning_count = session_data.get("warning_count", 0)
    warning_number = None

    if triggers_warning:
        warning_number = current_warning_count + 1

    violation_doc = {
        "session_id": session_id,
        "student_id": student_id,
        "exam_id": exam_id,
        "event_id": event_id,
        "violation_type": event_type,
        "severity": severity.value,
        "confidence": confidence,
        "duration_seconds": duration,
        "timestamp": datetime.utcnow(),
        "warning_number": warning_number,
        "status": "open",
        "review_notes": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "is_demo": is_demo,
        "metadata": {k: v for k, v in event.items() if k not in ["event_type", "confidence", "duration_seconds", "demo"]},
    }
    v_result = await db.violations.insert_one(violation_doc)
    violation_id = str(v_result.inserted_id)

    result = {
        "violation_id": violation_id,
        "event_id": event_id,
        "event_type": event_type,
        "severity": severity.value,
        "confidence": confidence,
        "warning": None,
        "disqualified": False,
        "demo": is_demo,
    }

    # Immediate disqualification for CRITICAL
    if severity == ViolationSeverity.CRITICAL and immediate_disq:
        disq_result = await _disqualify_student(session_id, student_id, exam_id, violation_id, event_type)
        result["disqualified"] = True
        result["disqualification_message"] = f"You have been disqualified: {VIOLATION_MESSAGES[event_type]}"
        return result

    # Issue warning
    if triggers_warning:
        new_warning_count = current_warning_count + 1
        warning_msg = f"⚠️ Warning {new_warning_count}/{warnings_before_disq}: {VIOLATION_MESSAGES.get(event_type, 'Suspicious activity detected.')}"

        warning_doc = {
            "session_id": session_id,
            "violation_id": violation_id,
            "warning_number": new_warning_count,
            "message": warning_msg,
            "issued_at": datetime.utcnow(),
            "acknowledged_at": None,
        }
        await db.warnings.insert_one(warning_doc)

        # Update session warning count
        await db.proctoring_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"warning_count": new_warning_count}}
        )
        session_data["warning_count"] = new_warning_count

        result["warning"] = {
            "number": new_warning_count,
            "message": warning_msg,
            "max_warnings": warnings_before_disq,
        }

        # Check if reached disqualification threshold
        if new_warning_count >= warnings_before_disq:
            await _disqualify_student(session_id, student_id, exam_id, violation_id, f"Exceeded {warnings_before_disq} warnings")
            result["disqualified"] = True
            result["disqualification_message"] = f"You have been automatically disqualified after {warnings_before_disq} warnings."

    return result


async def _disqualify_student(session_id: str, student_id: str, exam_id: str, violation_id: str, reason: str):
    db = get_db()

    # Update session
    await db.proctoring_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"is_disqualified": True, "disqualification_reason": reason, "status": "ended", "ended_at": datetime.utcnow()}}
    )

    # Get attempt_id
    session = await db.proctoring_sessions.find_one({"_id": ObjectId(session_id)})
    if session:
        attempt_id = session.get("attempt_id")
        await db.exam_attempts.update_one(
            {"_id": ObjectId(attempt_id)},
            {"$set": {"status": "disqualified", "submitted_at": datetime.utcnow()}}
        )

    # Create disqualification record
    existing_disq = await db.disqualifications.find_one({"session_id": session_id})
    if not existing_disq:
        await db.disqualifications.insert_one({
            "session_id": session_id,
            "student_id": student_id,
            "exam_id": exam_id,
            "reason": reason,
            "trigger_violation_id": violation_id,
            "disqualified_at": datetime.utcnow(),
            "reviewed_by": None,
            "review_status": "pending",
        })

    # Generate report
    from app.services.report_service import generate_report
    try:
        await generate_report(session_id)
    except Exception as e:
        logger.error(f"Report generation failed after disqualification: {e}")

    logger.warning(f"Student {student_id} disqualified from session {session_id}: {reason}")
