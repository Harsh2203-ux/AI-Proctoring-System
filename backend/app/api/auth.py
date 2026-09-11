import re
import secrets as _secrets
from fastapi import APIRouter, HTTPException, status, Request
from pydantic import BaseModel, EmailStr
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.core.config import settings
from app.db.connection import get_db
from app.models.user import UserCreate, UserOut, UserRole, StudentProfile, StudentRegisterRequest, AdminRegisterRequest
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# Minimum password requirements
_PASSWORD_RE = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#_\-])[A-Za-z\d@$!%*?&^#_\-]{8,}$')


def _validate_password(password: str, confirm_password: str) -> None:
    """Raise HTTPException if password is invalid or doesn't match confirmation."""
    if password != confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if not _PASSWORD_RE.match(password):
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least 8 characters and include "
                "uppercase, lowercase, a digit, and a special character (@$!%*?&^#_-)"
            ),
        )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/register/student", status_code=201)
async def register_student(data: StudentRegisterRequest):
    """Register a new student account."""
    db = get_db()

    # Password validation
    _validate_password(data.password, data.confirm_password)

    # Full name validation
    if not data.full_name.strip() or len(data.full_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Full name must be at least 2 characters")

    # Student ID validation
    if not data.student_id.strip():
        raise HTTPException(status_code=400, detail="Student ID is required")

    # Email uniqueness
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Student ID uniqueness
    existing_profile = await db.student_profiles.find_one({"student_id": data.student_id.strip()})
    if existing_profile:
        raise HTTPException(status_code=400, detail="Student ID already registered")

    user_doc = {
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "role": "student",
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    profile_doc = {
        "user_id": user_id,
        "full_name": data.full_name.strip(),
        "student_id": data.student_id.strip(),
        "face_encoding": None,
        "face_image_path": None,
        "is_face_enrolled": False,
        "enrolled_at": None,
        "created_at": datetime.utcnow(),
    }
    await db.student_profiles.insert_one(profile_doc)

    logger.info(f"New student registered: {data.email}")
    return {"message": "Registration successful", "user_id": user_id}


@router.post("/register/admin", status_code=201)
async def register_admin(data: AdminRegisterRequest):
    """Register a new admin account.

    Requires a valid ADMIN_REGISTRATION_CODE to prevent public admin sign-ups.
    """
    db = get_db()

    # Validate admin registration code FIRST — before any DB lookups
    expected_code = settings.ADMIN_REGISTRATION_CODE
    if not expected_code or not _secrets.compare_digest(data.registration_code.strip(), expected_code.strip()):
        raise HTTPException(status_code=403, detail="Invalid administrator registration code")

    # Password validation
    _validate_password(data.password, data.confirm_password)

    # Full name validation
    if not data.full_name.strip() or len(data.full_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Full name must be at least 2 characters")

    # Admin ID validation
    if not data.admin_id.strip():
        raise HTTPException(status_code=400, detail="Administrator ID is required")

    # Email uniqueness
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Admin ID uniqueness
    existing_profile = await db.admin_profiles.find_one({"admin_id": data.admin_id.strip()})
    if existing_profile:
        raise HTTPException(status_code=400, detail="Administrator ID already registered")

    user_doc = {
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "role": "admin",
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    profile_doc = {
        "user_id": user_id,
        "full_name": data.full_name.strip(),
        "admin_id": data.admin_id.strip(),
        "created_at": datetime.utcnow(),
    }
    await db.admin_profiles.insert_one(profile_doc)

    logger.info(f"New admin registered: {data.email}")
    return {"message": "Administrator account created successfully", "user_id": user_id}


# Keep legacy /register endpoint for backward compatibility (student only)
@router.post("/register", status_code=201)
async def register_legacy(data: UserCreate):
    """Legacy registration endpoint — creates student accounts only."""
    db = get_db()
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    student_id = data.student_id or f"STU{int(datetime.utcnow().timestamp())}"

    if data.role == UserRole.STUDENT:
        existing_profile = await db.student_profiles.find_one({"student_id": student_id})
        if existing_profile:
            raise HTTPException(status_code=400, detail="Student ID already registered")

    user_doc = {
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "role": UserRole.STUDENT.value,  # always student via this legacy endpoint
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    if data.role == UserRole.STUDENT:
        profile_doc = {
            "user_id": user_id,
            "full_name": data.full_name,
            "student_id": student_id,
            "face_encoding": None,
            "face_image_path": None,
            "is_face_enrolled": False,
            "enrolled_at": None,
            "created_at": datetime.utcnow(),
        }
        await db.student_profiles.insert_one(profile_doc)

    logger.info(f"New user registered (legacy): {data.email} ({data.role})")
    return {"message": "Registration successful", "user_id": user_id}


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request):
    db = get_db()
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is inactive")

    user_id = str(user["_id"])
    token_data = {"sub": user_id, "email": user["email"], "role": user["role"]}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Get profile name based on role
    full_name = user.get("full_name", user["email"])
    if user["role"] == "student":
        profile = await db.student_profiles.find_one({"user_id": user_id})
        if profile:
            full_name = profile.get("full_name", full_name)
    elif user["role"] == "admin":
        profile = await db.admin_profiles.find_one({"user_id": user_id})
        if profile:
            full_name = profile.get("full_name", full_name)

    logger.info(f"User logged in: {data.email} ({user['role']})")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": user["email"],
            "role": user["role"],
            "full_name": full_name,
        },
    }


@router.post("/refresh")
async def refresh_token(payload: dict):
    token = payload.get("refresh_token")
    if not token:
        raise HTTPException(status_code=400, detail="Refresh token required")
    data = decode_token(token)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    new_access = create_access_token({"sub": data["sub"], "email": data["email"], "role": data["role"]})
    return {"access_token": new_access, "token_type": "bearer"}
