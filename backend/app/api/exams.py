from fastapi import APIRouter, HTTPException, Depends
from app.core.dependencies import get_current_user, require_admin
from app.db.connection import get_db
from app.models.exam import Exam, ExamCreate, ExamUpdate, ExamStatus, ProctoringConfig, Question, QuestionCreate, QuestionOut
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exams", tags=["exams"])


def exam_doc_to_dict(doc):
    doc["_id"] = str(doc["_id"])
    if "created_by" in doc:
        doc["created_by"] = str(doc["created_by"])
    return doc


def question_doc_to_dict(doc, include_answer=False):
    doc["_id"] = str(doc["_id"])
    if not include_answer:
        doc.pop("correct_answer", None)
    return doc


@router.post("", status_code=201)
async def create_exam(data: ExamCreate, current_user=Depends(require_admin)):
    db = get_db()
    doc = {
        "title": data.title,
        "description": data.description,
        "created_by": str(current_user["_id"]),
        "duration_minutes": data.duration_minutes,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "allowed_students": [],
        "status": ExamStatus.DRAFT.value,
        "proctoring_config": (data.proctoring_config or ProctoringConfig()).model_dump(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.exams.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "Exam created"}


@router.get("")
async def list_exams(current_user=Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])
    role = current_user.get("role")

    if role == "admin":
        cursor = db.exams.find({}).sort("created_at", -1)
    else:
        # Students see ALL active/scheduled exams — assignment is tracked separately
        # but does not gate visibility. This ensures students can see published exams
        # immediately without needing the admin to individually assign them.
        cursor = db.exams.find({
            "status": {"$in": ["active", "scheduled"]}
        }).sort("created_at", -1)

    exams = []
    async for doc in cursor:
        exams.append(exam_doc_to_dict(doc))
    return exams


@router.get("/{exam_id}")
async def get_exam(exam_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    try:
        doc = await db.exams.find_one({"_id": ObjectId(exam_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Exam not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam_doc_to_dict(doc)


@router.put("/{exam_id}")
async def update_exam(exam_id: str, data: ExamUpdate, current_user=Depends(require_admin)):
    db = get_db()
    # Use model_dump with exclude_unset so we only update fields that were explicitly sent.
    # This correctly handles allowed_students=[] (clear the list) vs not sent (leave unchanged).
    updates = data.model_dump(exclude_unset=True)
    updates["updated_at"] = datetime.utcnow()
    result = await db.exams.update_one({"_id": ObjectId(exam_id)}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Exam not found")
    return {"message": "Exam updated"}


@router.post("/{exam_id}/publish")
async def publish_exam(exam_id: str, current_user=Depends(require_admin)):
    db = get_db()
    result = await db.exams.update_one(
        {"_id": ObjectId(exam_id)},
        {"$set": {"status": ExamStatus.ACTIVE.value, "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Exam not found")
    return {"message": "Exam published"}


@router.delete("/{exam_id}")
async def delete_exam(exam_id: str, current_user=Depends(require_admin)):
    db = get_db()
    exam = await db.exams.find_one({"_id": ObjectId(exam_id)})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("status") not in ["draft"]:
        raise HTTPException(status_code=400, detail="Only draft exams can be deleted")
    await db.exams.delete_one({"_id": ObjectId(exam_id)})
    await db.questions.delete_many({"exam_id": exam_id})
    return {"message": "Exam deleted"}


@router.post("/{exam_id}/students")
async def assign_students(exam_id: str, student_ids: List[str], current_user=Depends(require_admin)):
    db = get_db()
    result = await db.exams.update_one(
        {"_id": ObjectId(exam_id)},
        {"$addToSet": {"allowed_students": {"$each": student_ids}}, "$set": {"updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Exam not found")
    return {"message": f"Assigned {len(student_ids)} students"}


@router.delete("/{exam_id}/students/{user_id}")
async def remove_student(exam_id: str, user_id: str, current_user=Depends(require_admin)):
    db = get_db()
    await db.exams.update_one(
        {"_id": ObjectId(exam_id)},
        {"$pull": {"allowed_students": user_id}}
    )
    return {"message": "Student removed"}


# --- Questions ---
@router.post("/{exam_id}/questions", status_code=201)
async def add_question(exam_id: str, data: QuestionCreate, current_user=Depends(require_admin)):
    db = get_db()
    # Get next order
    count = await db.questions.count_documents({"exam_id": exam_id})
    doc = {
        "exam_id": exam_id,
        "order": data.order if data.order is not None else count + 1,
        "question_type": data.question_type.value,
        "text": data.text,
        "options": data.options,
        "correct_answer": data.correct_answer,
        "marks": data.marks,
        "created_at": datetime.utcnow(),
    }
    result = await db.questions.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "Question added"}


@router.get("/{exam_id}/questions")
async def list_questions(exam_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    is_admin = current_user.get("role") == "admin"
    cursor = db.questions.find({"exam_id": exam_id}).sort("order", 1)
    questions = []
    async for doc in cursor:
        questions.append(question_doc_to_dict(doc, include_answer=is_admin))
    return questions


@router.put("/{exam_id}/questions/{question_id}")
async def update_question(exam_id: str, question_id: str, data: QuestionCreate, current_user=Depends(require_admin)):
    db = get_db()
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if "question_type" in updates:
        updates["question_type"] = updates["question_type"].value if hasattr(updates["question_type"], "value") else updates["question_type"]
    result = await db.questions.update_one({"_id": ObjectId(question_id)}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question updated"}


@router.delete("/{exam_id}/questions/{question_id}")
async def delete_question(exam_id: str, question_id: str, current_user=Depends(require_admin)):
    db = get_db()
    await db.questions.delete_one({"_id": ObjectId(question_id)})
    return {"message": "Question deleted"}
