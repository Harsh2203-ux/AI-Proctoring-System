"""Seed the database with demo data."""
import asyncio
from datetime import datetime, timedelta
from app.db.connection import connect_db, get_db
from app.core.security import hash_password, verify_password
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


async def seed():
    # connect_db() is already called by lifespan before seed(); just get the DB handle.
    db = get_db()

    logger.info("Seeding database...")

    # ---- Admin user ----
    existing_admin = await db.users.find_one({"email": settings.ADMIN_EMAIL})
    if not existing_admin:
        admin_doc = {
            "email": settings.ADMIN_EMAIL,
            "password_hash": hash_password(settings.ADMIN_PASSWORD),
            "role": "admin",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        admin_result = await db.users.insert_one(admin_doc)
        admin_id = str(admin_result.inserted_id)
        logger.info(f"Admin created: {settings.ADMIN_EMAIL}")
    else:
        admin_id = str(existing_admin["_id"])
        # Update password hash in case seed password changed
        new_hash = hash_password(settings.ADMIN_PASSWORD)
        await db.users.update_one(
            {"_id": existing_admin["_id"]},
            {"$set": {"password_hash": new_hash, "is_active": True, "updated_at": datetime.utcnow()}},
        )
        logger.info(f"Admin already exists — password hash refreshed: {settings.ADMIN_EMAIL}")

    # Ensure admin profile exists
    existing_admin_profile = await db.admin_profiles.find_one({"user_id": admin_id})
    if not existing_admin_profile:
        await db.admin_profiles.insert_one({
            "user_id": admin_id,
            "full_name": "Demo Admin",
            "admin_id": "ADM2024001",
            "created_at": datetime.utcnow(),
        })
        logger.info("Admin profile created")

    # ---- Student user ----
    existing_student = await db.users.find_one({"email": settings.STUDENT_EMAIL})
    if not existing_student:
        student_doc = {
            "email": settings.STUDENT_EMAIL,
            "password_hash": hash_password(settings.STUDENT_PASSWORD),
            "role": "student",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        student_result = await db.users.insert_one(student_doc)
        student_id = str(student_result.inserted_id)

        await db.student_profiles.insert_one({
            "user_id": student_id,
            "full_name": "Demo Student",
            "student_id": "STU2024001",
            "face_encoding": None,
            "face_image_path": None,
            "is_face_enrolled": False,
            "enrolled_at": None,
            "created_at": datetime.utcnow(),
        })
        logger.info(f"Student created: {settings.STUDENT_EMAIL}")
    else:
        student_id = str(existing_student["_id"])
        # Update password hash in case seed password changed
        new_hash = hash_password(settings.STUDENT_PASSWORD)
        await db.users.update_one(
            {"_id": existing_student["_id"]},
            {"$set": {"password_hash": new_hash, "is_active": True, "updated_at": datetime.utcnow()}},
        )
        logger.info(f"Student already exists — password hash refreshed: {settings.STUDENT_EMAIL}")

    # Ensure student profile exists
    existing_student_profile = await db.student_profiles.find_one({"user_id": student_id})
    if not existing_student_profile:
        await db.student_profiles.insert_one({
            "user_id": student_id,
            "full_name": "Demo Student",
            "student_id": "STU2024001",
            "face_encoding": None,
            "face_image_path": None,
            "is_face_enrolled": False,
            "enrolled_at": None,
            "created_at": datetime.utcnow(),
        })
        logger.info("Student profile created")

    # ---- Sample Exam ----
    existing_exam = await db.exams.find_one({"title": "Data Structures & Algorithms — Midterm"})
    if not existing_exam:
        exam_doc = {
            "title": "Data Structures & Algorithms — Midterm",
            "description": "This is a 60-minute midterm examination covering arrays, linked lists, trees, and sorting algorithms.",
            "created_by": admin_id,
            "duration_minutes": 60,
            "start_time": datetime.utcnow() - timedelta(hours=1),
            "end_time": datetime.utcnow() + timedelta(days=30),
            "allowed_students": [],   # Empty = open to all students
            "status": "active",
            "proctoring_config": {
                "face_absent_threshold_frames": 3,
                "face_absent_warning_seconds": 30,
                "multiple_faces_threshold_frames": 2,
                "head_pose_yaw_threshold_degrees": 30.0,
                "head_pose_pitch_threshold_degrees": 20.0,
                "head_pose_violation_frames": 5,
                "gaze_away_threshold_frames": 4,
                "object_detection_confidence_threshold": 0.6,
                "identity_mismatch_confidence_threshold": 0.7,
                "warnings_before_disqualification": 3,
                "critical_violation_immediate_disqualification": True,
                "suspicious_keywords": ["answer", "help me", "tell me", "solution", "give me"],
            },
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        exam_result = await db.exams.insert_one(exam_doc)
        exam_id = str(exam_result.inserted_id)

        # Questions
        questions = [
            {
                "exam_id": exam_id,
                "order": 1,
                "question_type": "mcq",
                "text": "What is the time complexity of searching an element in a balanced binary search tree?",
                "options": ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
                "correct_answer": "O(log n)",
                "marks": 2,
                "created_at": datetime.utcnow(),
            },
            {
                "exam_id": exam_id,
                "order": 2,
                "question_type": "mcq",
                "text": "Which data structure uses LIFO (Last In, First Out) order?",
                "options": ["Queue", "Linked List", "Stack", "Heap"],
                "correct_answer": "Stack",
                "marks": 2,
                "created_at": datetime.utcnow(),
            },
            {
                "exam_id": exam_id,
                "order": 3,
                "question_type": "mcq",
                "text": "What is the worst-case time complexity of QuickSort?",
                "options": ["O(n log n)", "O(n²)", "O(n)", "O(log n)"],
                "correct_answer": "O(n²)",
                "marks": 2,
                "created_at": datetime.utcnow(),
            },
            {
                "exam_id": exam_id,
                "order": 4,
                "question_type": "mcq",
                "text": "In a min-heap, which element is always at the root?",
                "options": ["Maximum element", "Median element", "Minimum element", "Last inserted element"],
                "correct_answer": "Minimum element",
                "marks": 2,
                "created_at": datetime.utcnow(),
            },
            {
                "exam_id": exam_id,
                "order": 5,
                "question_type": "short_answer",
                "text": "Explain the difference between a stack and a queue. Give one real-world example of each.",
                "options": None,
                "correct_answer": "Stack: LIFO - e.g. browser history/undo. Queue: FIFO - e.g. print queue.",
                "marks": 5,
                "created_at": datetime.utcnow(),
            },
            {
                "exam_id": exam_id,
                "order": 6,
                "question_type": "mcq",
                "text": "Which sorting algorithm has the best average-case performance?",
                "options": ["Bubble Sort", "Selection Sort", "Merge Sort", "Insertion Sort"],
                "correct_answer": "Merge Sort",
                "marks": 2,
                "created_at": datetime.utcnow(),
            },
            {
                "exam_id": exam_id,
                "order": 7,
                "question_type": "mcq",
                "text": "What does DFS stand for in graph traversal?",
                "options": ["Data First Search", "Depth First Search", "Direct File System", "Depth File Sort"],
                "correct_answer": "Depth First Search",
                "marks": 2,
                "created_at": datetime.utcnow(),
            },
            {
                "exam_id": exam_id,
                "order": 8,
                "question_type": "long_answer",
                "text": "Write the algorithm for binary search. Explain its time complexity and when it can be applied.",
                "options": None,
                "correct_answer": "Binary search works on sorted arrays by repeatedly dividing the search space in half. Time complexity: O(log n). Requires sorted input.",
                "marks": 10,
                "created_at": datetime.utcnow(),
            },
        ]
        await db.questions.insert_many(questions)
        logger.info(f"Sample exam created with {len(questions)} questions")
    else:
        exam_id = str(existing_exam["_id"])
        # Ensure allowed_students is always [] (open) for the demo exam
        # so the demo student can always take it without manual assignment.
        await db.exams.update_one(
            {"_id": existing_exam["_id"]},
            {"$set": {"allowed_students": [], "status": "active", "updated_at": datetime.utcnow()}}
        )
        logger.info("Sample exam already exists — reset to open access (allowed_students=[])")

    logger.info("Database seeding complete!")
    logger.info(f"  Admin:   {settings.ADMIN_EMAIL} / {settings.ADMIN_PASSWORD}")
    logger.info(f"  Student: {settings.STUDENT_EMAIL} / {settings.STUDENT_PASSWORD}")


async def _seed_standalone():
    await connect_db()
    await seed()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_seed_standalone())
