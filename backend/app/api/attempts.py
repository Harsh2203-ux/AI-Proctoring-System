from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Response
from fastapi.responses import JSONResponse
from app.core.dependencies import get_current_user, require_student, require_admin
from app.db.connection import get_db
from app.models.proctoring import AttemptStatus
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/attempts", tags=["attempts"])


@router.post("", status_code=201)
async def start_attempt(payload: dict, current_user=Depends(require_student)):
    db = get_db()
    exam_id = payload.get("exam_id")
    if not exam_id:
        raise HTTPException(status_code=400, detail="exam_id required")

    user_id = str(current_user["_id"])

    # Check exam exists and student is allowed
    try:
        exam = await db.exams.find_one({"_id": ObjectId(exam_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Exam not found")
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("status") != "active":
        raise HTTPException(status_code=400, detail="Exam is not active")

    # Assignment check:
    # - If allowed_students is empty → the exam is open to ALL active students.
    # - If allowed_students has entries → only those specific student IDs may attempt.
    # This "whitelist" design is consistent with the UI where all active exams
    # appear on the student dashboard (empty list = unrestricted access).
    allowed = exam.get("allowed_students", [])
    logger.info(
        f"Attempt start: user_id={user_id} exam_id={exam_id} "
        f"exam_title={exam.get('title')} allowed_students={allowed} "
        f"restricted={len(allowed) > 0}"
    )
    if allowed and user_id not in allowed:
        logger.warning(
            f"REJECTED: student {user_id} not in allowed_students {allowed} for exam {exam_id}"
        )
        raise HTTPException(status_code=403, detail="You are not assigned to this exam")

    # Check no existing active attempt
    existing = await db.exam_attempts.find_one({
        "exam_id": exam_id,
        "student_id": user_id,
        "status": {"$in": ["in_progress"]}
    })
    if existing:
        # Return existing attempt
        attempt_id = str(existing["_id"])
        session = await db.proctoring_sessions.find_one({"attempt_id": attempt_id})
        session_id = str(session["_id"]) if session else None
        # Compute remaining time
        elapsed = (datetime.utcnow() - existing["started_at"]).total_seconds()
        duration_secs = exam.get("duration_minutes", 60) * 60
        remaining = max(0, duration_secs - elapsed)
        return JSONResponse(status_code=200, content={
            "attempt_id": attempt_id,
            "session_id": session_id,
            "time_remaining_seconds": int(remaining),
            "resumed": True,
        })

    # Check already submitted/disqualified
    finished = await db.exam_attempts.find_one({
        "exam_id": exam_id,
        "student_id": user_id,
        "status": {"$in": ["submitted", "disqualified"]},
    })
    if finished:
        raise HTTPException(status_code=400, detail=f"Attempt already {finished['status']}")

    # Create attempt
    attempt_doc = {
        "exam_id": exam_id,
        "student_id": user_id,
        "status": AttemptStatus.IN_PROGRESS.value,
        "started_at": datetime.utcnow(),
        "submitted_at": None,
        "time_remaining_seconds": exam.get("duration_minutes", 60) * 60,
        "final_score": None,
    }
    result = await db.exam_attempts.insert_one(attempt_doc)
    attempt_id = str(result.inserted_id)

    # Create proctoring session
    from app.core.config import settings
    session_doc = {
        "attempt_id": attempt_id,
        "student_id": user_id,
        "exam_id": exam_id,
        "identity_verified": False,
        "identity_confidence": 0.0,
        "status": "active",
        "warning_count": 0,
        "is_disqualified": False,
        "disqualification_reason": None,
        "started_at": datetime.utcnow(),
        "ended_at": None,
        "demo_mode": settings.DEMO_MODE,
    }
    session_result = await db.proctoring_sessions.insert_one(session_doc)
    session_id = str(session_result.inserted_id)

    logger.info(f"Started attempt {attempt_id} for student {user_id} on exam {exam_id}")
    return {
        "attempt_id": attempt_id,
        "session_id": session_id,
        "time_remaining_seconds": attempt_doc["time_remaining_seconds"],
        "resumed": False,
    }


@router.get("/{attempt_id}")
async def get_attempt(attempt_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    try:
        attempt = await db.exam_attempts.find_one({"_id": ObjectId(attempt_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    user_id = str(current_user["_id"])
    if current_user.get("role") != "admin" and attempt["student_id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    attempt["_id"] = str(attempt["_id"])
    # Recompute time remaining
    if attempt["status"] == "in_progress":
        exam = await db.exams.find_one({"_id": ObjectId(attempt["exam_id"])})
        elapsed = (datetime.utcnow() - attempt["started_at"]).total_seconds()
        duration_secs = exam.get("duration_minutes", 60) * 60
        remaining = max(0, duration_secs - int(elapsed))
        attempt["time_remaining_seconds"] = remaining
        if remaining == 0:
            # Auto-submit
            await _submit_attempt(attempt_id, db)
            attempt["status"] = "submitted"
    return attempt


@router.put("/{attempt_id}/answers")
async def save_answers(attempt_id: str, answers: List[dict], current_user=Depends(require_student)):
    db = get_db()
    user_id = str(current_user["_id"])
    attempt = await db.exam_attempts.find_one({"_id": ObjectId(attempt_id), "student_id": user_id})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt["status"] != "in_progress":
        raise HTTPException(status_code=400, detail=f"Attempt is {attempt['status']}, cannot save answers")

    for ans in answers:
        question_id = ans.get("question_id")
        response = ans.get("response", "")
        await db.answers.update_one(
            {"attempt_id": attempt_id, "question_id": question_id},
            {"$set": {"response": response, "saved_at": datetime.utcnow(), "is_final": False}},
            upsert=True,
        )
    return {"message": f"Saved {len(answers)} answers"}


@router.get("/{attempt_id}/answers")
async def get_answers(attempt_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])
    attempt = await db.exam_attempts.find_one({"_id": ObjectId(attempt_id)})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if current_user.get("role") != "admin" and attempt["student_id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    cursor = db.answers.find({"attempt_id": attempt_id})
    answers = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        answers.append(doc)
    return answers


@router.post("/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, background_tasks: BackgroundTasks, current_user=Depends(require_student)):
    db = get_db()
    user_id = str(current_user["_id"])
    attempt = await db.exam_attempts.find_one({"_id": ObjectId(attempt_id), "student_id": user_id})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt["status"] != "in_progress":
        raise HTTPException(status_code=400, detail=f"Attempt already {attempt['status']}")

    await _submit_attempt(attempt_id, db)

    # Trigger report generation
    session = await db.proctoring_sessions.find_one({"attempt_id": attempt_id})
    if session:
        from app.services.report_service import generate_report
        background_tasks.add_task(generate_report, str(session["_id"]))

    return {"message": "Exam submitted successfully"}


async def _submit_attempt(attempt_id: str, db):
    await db.exam_attempts.update_one(
        {"_id": ObjectId(attempt_id)},
        {"$set": {"status": AttemptStatus.SUBMITTED.value, "submitted_at": datetime.utcnow()}},
    )
    await db.proctoring_sessions.update_one(
        {"attempt_id": attempt_id},
        {"$set": {"status": "ended", "ended_at": datetime.utcnow()}},
    )
    # Finalize answers
    await db.answers.update_many(
        {"attempt_id": attempt_id},
        {"$set": {"is_final": True}},
    )
    logger.info(f"Attempt {attempt_id} submitted")
