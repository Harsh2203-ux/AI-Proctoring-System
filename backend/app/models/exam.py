from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum
from app.models.user import PyObjectId


class ExamStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"


class QuestionType(str, Enum):
    MCQ = "mcq"
    SHORT_ANSWER = "short_answer"
    LONG_ANSWER = "long_answer"


class ProctoringConfig(BaseModel):
    face_absent_threshold_frames: int = 3
    face_absent_warning_seconds: int = 30
    multiple_faces_threshold_frames: int = 2
    head_pose_yaw_threshold_degrees: float = 30.0
    head_pose_pitch_threshold_degrees: float = 20.0
    head_pose_violation_frames: int = 5
    gaze_away_threshold_frames: int = 4
    object_detection_confidence_threshold: float = 0.6
    identity_mismatch_confidence_threshold: float = 0.7
    warnings_before_disqualification: int = 3
    critical_violation_immediate_disqualification: bool = True
    suspicious_keywords: List[str] = [
        "answer", "help me", "what is", "tell me", "solution",
        "give me", "cheat", "copy", "solve this"
    ]


class Exam(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    title: str
    description: str = ""
    created_by: str
    duration_minutes: int = 60
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    allowed_students: List[str] = []
    status: ExamStatus = ExamStatus.DRAFT
    proctoring_config: ProctoringConfig = Field(default_factory=ProctoringConfig)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class ExamCreate(BaseModel):
    title: str
    description: str = ""
    duration_minutes: int = 60
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    proctoring_config: Optional[ProctoringConfig] = None


class ExamUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    proctoring_config: Optional[ProctoringConfig] = None
    allowed_students: Optional[List[str]] = None  # None = no change; [] = open to all


class Question(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    exam_id: str
    order: int
    question_type: QuestionType = QuestionType.MCQ
    text: str
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    marks: int = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class QuestionCreate(BaseModel):
    question_type: QuestionType = QuestionType.MCQ
    text: str
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    marks: int = 1
    order: Optional[int] = None


class QuestionOut(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    exam_id: str
    order: int
    question_type: QuestionType
    text: str
    options: Optional[List[str]] = None
    marks: int = 1

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}
