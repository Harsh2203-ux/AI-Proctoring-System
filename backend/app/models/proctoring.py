from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime
from enum import Enum
from app.models.user import PyObjectId


class AttemptStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    DISQUALIFIED = "disqualified"


class SessionStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"


class ViolationSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ViolationStatus(str, Enum):
    OPEN = "open"
    REVIEWED = "reviewed"
    DISMISSED = "dismissed"


class EvidenceType(str, Enum):
    SCREENSHOT = "screenshot"
    AUDIO_CLIP = "audio_clip"


class EventType(str, Enum):
    FACE_ABSENT = "face_absent"
    MULTIPLE_FACES = "multiple_faces"
    IDENTITY_MISMATCH = "identity_mismatch"
    HEAD_POSE_VIOLATION = "head_pose_violation"
    GAZE_VIOLATION = "gaze_violation"
    OBJECT_DETECTED = "object_detected"
    ADDITIONAL_PERSON = "additional_person"
    SUSPICIOUS_SPEECH = "suspicious_speech"
    MULTIPLE_SPEAKERS = "multiple_speakers"
    BACKGROUND_CONVERSATION = "background_conversation"


class ExamAttempt(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    exam_id: str
    student_id: str
    status: AttemptStatus = AttemptStatus.IN_PROGRESS
    started_at: datetime = Field(default_factory=datetime.utcnow)
    submitted_at: Optional[datetime] = None
    time_remaining_seconds: Optional[int] = None
    final_score: Optional[float] = None

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class Answer(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    attempt_id: str
    question_id: str
    response: str = ""
    saved_at: datetime = Field(default_factory=datetime.utcnow)
    is_final: bool = False

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class ProctoringSession(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    attempt_id: str
    student_id: str
    exam_id: str
    identity_verified: bool = False
    identity_confidence: float = 0.0
    status: SessionStatus = SessionStatus.ACTIVE
    warning_count: int = 0
    is_disqualified: bool = False
    disqualification_reason: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    demo_mode: bool = False

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class ProctoringEvent(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    session_id: str
    student_id: str
    event_type: str
    raw_payload: Dict[str, Any] = {}
    confidence: float = 0.0
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    frame_path: Optional[str] = None
    is_demo: bool = False

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class Violation(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    session_id: str
    student_id: str
    exam_id: str
    event_id: Optional[str] = None
    violation_type: str
    severity: ViolationSeverity
    confidence: float = 0.0
    duration_seconds: float = 0.0
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    warning_number: Optional[int] = None
    status: ViolationStatus = ViolationStatus.OPEN
    review_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    is_demo: bool = False

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class Evidence(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    violation_id: Optional[str] = None
    session_id: str
    evidence_type: EvidenceType
    file_path: str
    file_size_bytes: int = 0
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = {}
    is_demo: bool = False

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class Warning(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    session_id: str
    violation_id: Optional[str] = None
    warning_number: int
    message: str
    issued_at: datetime = Field(default_factory=datetime.utcnow)
    acknowledged_at: Optional[datetime] = None

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class Disqualification(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    session_id: str
    student_id: str
    exam_id: str
    reason: str
    trigger_violation_id: Optional[str] = None
    disqualified_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_by: Optional[str] = None
    review_status: str = "pending"  # pending, upheld, overturned

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class ProctoringReport(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    session_id: str
    attempt_id: str
    student_id: str
    exam_id: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    identity_result: Dict[str, Any] = {}
    violation_summary: Dict[str, Any] = {}
    warning_count: int = 0
    disqualification_status: bool = False
    submission_status: str = "not_submitted"
    risk_score: float = 0.0
    risk_level: str = "low"
    full_timeline: List[Dict[str, Any]] = []
    pdf_path: Optional[str] = None

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}
