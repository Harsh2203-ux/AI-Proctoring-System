from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from app.core.dependencies import get_current_user, require_student
from app.db.connection import get_db
from app.core.config import settings
from bson import ObjectId
from datetime import datetime
import httpx
import base64
import os
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/profile")
async def get_profile(current_user=Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])
    profile = await db.student_profiles.find_one({"user_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile["_id"] = str(profile["_id"])
    return profile


@router.post("/enrol-face")
async def enrol_face(
    file: UploadFile = File(...),
    current_user=Depends(require_student),
):
    db = get_db()
    user_id = str(current_user["_id"])

    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg"]:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG images allowed")

    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large (max {settings.MAX_UPLOAD_SIZE_MB}MB)")

    # Call AI service for face encoding
    image_b64 = base64.b64encode(contents).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/ai/face/encode",
                json={"image_b64": image_b64},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Face encoding failed: " + resp.text)
            ai_result = resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"AI service unavailable: {str(e)}")

    if not ai_result.get("success"):
        raise HTTPException(status_code=400, detail=ai_result.get("error", "No face detected in image"))

    # Save reference image
    evidence_path = settings.EVIDENCE_STORAGE_PATH
    enrol_dir = os.path.join(evidence_path, "enrollments")
    os.makedirs(enrol_dir, exist_ok=True)
    img_path = os.path.join(enrol_dir, f"{user_id}.jpg")
    with open(img_path, "wb") as f:
        f.write(contents)

    # Update profile
    await db.student_profiles.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "face_encoding": ai_result["encoding"],
                "face_image_path": img_path,
                "is_face_enrolled": True,
                "enrolled_at": datetime.utcnow(),
            }
        },
    )
    return {
        "success": True,
        "message": "Face enrolled successfully",
        "demo": ai_result.get("demo", False),
    }
