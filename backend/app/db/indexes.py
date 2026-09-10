from app.db.connection import get_db
import logging

logger = logging.getLogger(__name__)


async def create_indexes():
    db = get_db()

    # users
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")

    # student_profiles
    await db.student_profiles.create_index("user_id", unique=True)
    await db.student_profiles.create_index("student_id", unique=True)

    # admin_profiles
    await db.admin_profiles.create_index("user_id", unique=True)
    await db.admin_profiles.create_index("admin_id", unique=True)

    # exams
    await db.exams.create_index("status")
    await db.exams.create_index("created_by")

    # questions
    await db.questions.create_index("exam_id")
    await db.questions.create_index([("exam_id", 1), ("order", 1)])

    # exam_attempts
    await db.exam_attempts.create_index([("exam_id", 1), ("student_id", 1)], unique=True)
    await db.exam_attempts.create_index("status")

    # answers
    await db.answers.create_index("attempt_id")
    await db.answers.create_index([("attempt_id", 1), ("question_id", 1)], unique=True)

    # proctoring_sessions
    await db.proctoring_sessions.create_index("attempt_id", unique=True)
    await db.proctoring_sessions.create_index("student_id")
    await db.proctoring_sessions.create_index("status")

    # proctoring_events
    await db.proctoring_events.create_index("session_id")
    await db.proctoring_events.create_index("event_type")
    await db.proctoring_events.create_index("timestamp")

    # violations
    await db.violations.create_index("session_id")
    await db.violations.create_index("severity")
    await db.violations.create_index("status")

    # evidence
    await db.evidence.create_index("violation_id")
    await db.evidence.create_index("session_id")

    # warnings
    await db.warnings.create_index("session_id")

    # disqualifications
    await db.disqualifications.create_index("session_id", unique=True)
    await db.disqualifications.create_index("student_id")

    # proctoring_reports
    await db.proctoring_reports.create_index("session_id", unique=True)
    await db.proctoring_reports.create_index("student_id")

    logger.info("Database indexes created successfully")
