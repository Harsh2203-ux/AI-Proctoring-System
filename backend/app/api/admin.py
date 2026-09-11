"""Admin API - dashboard, monitoring, violations, evidence, reports."""
from fastapi import APIRouter, HTTPException, Depends, Response
from app.core.dependencies import require_admin, get_current_user
from app.db.connection import get_db
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional
import io
import os
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


def to_str_id(doc):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


# ---- Dashboard Stats ----

@router.get("/dashboard/stats")
async def dashboard_stats(current_user=Depends(require_admin)):
    db = get_db()
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total_exams = await db.exams.count_documents({})
    active_exams = await db.exams.count_documents({"status": "active"})
    total_students = await db.users.count_documents({"role": "student"})
    active_sessions = await db.proctoring_sessions.count_documents({"status": "active"})
    violations_today = await db.violations.count_documents({"timestamp": {"$gte": today}})
    disqualifications_today = await db.disqualifications.count_documents({"disqualified_at": {"$gte": today}})
    total_violations = await db.violations.count_documents({})
    total_reports = await db.proctoring_reports.count_documents({})
    pending_reviews = await db.violations.count_documents({"status": "open", "severity": {"$in": ["high", "critical"]}})

    return {
        "total_exams": total_exams,
        "active_exams": active_exams,
        "total_students": total_students,
        "active_sessions": active_sessions,
        "violations_today": violations_today,
        "disqualifications_today": disqualifications_today,
        "total_violations": total_violations,
        "total_reports": total_reports,
        "pending_reviews": pending_reviews,
    }


@router.get("/dashboard/violations-chart")
async def violations_chart(days: int = 7, current_user=Depends(require_admin)):
    """Return violation counts per day for the last N days."""
    db = get_db()
    result = []
    for i in range(days - 1, -1, -1):
        day_start = (datetime.utcnow() - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = await db.violations.count_documents({"timestamp": {"$gte": day_start, "$lt": day_end}})
        result.append({"date": day_start.strftime("%m/%d"), "count": count})
    return result


# ---- Students ----

@router.get("/students")
async def list_students(skip: int = 0, limit: int = 50, current_user=Depends(require_admin)):
    db = get_db()
    students = []
    async for user in db.users.find({"role": "student"}).skip(skip).limit(limit).sort("created_at", -1):
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        profile = await db.student_profiles.find_one({"user_id": str(user["_id"])})
        if profile:
            profile["_id"] = str(profile["_id"])
            user["profile"] = profile
        students.append(user)
    return students


@router.get("/students/{student_id}")
async def get_student(student_id: str, current_user=Depends(require_admin)):
    db = get_db()
    try:
        user = await db.users.find_one({"_id": ObjectId(student_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Student not found")
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")
    user["_id"] = str(user["_id"])
    user.pop("password_hash", None)
    profile = await db.student_profiles.find_one({"user_id": student_id})
    if profile:
        profile["_id"] = str(profile["_id"])
        user["profile"] = profile
    return user


@router.delete("/students/{student_id}/face")
async def reset_face(student_id: str, current_user=Depends(require_admin)):
    db = get_db()
    await db.student_profiles.update_one(
        {"user_id": student_id},
        {"$set": {"face_encoding": None, "face_image_path": None, "is_face_enrolled": False, "enrolled_at": None}}
    )
    return {"message": "Face enrolment reset"}


# ---- Sessions ----

@router.get("/sessions")
async def list_sessions(status: Optional[str] = None, skip: int = 0, limit: int = 50, current_user=Depends(require_admin)):
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    sessions = []
    async for s in db.proctoring_sessions.find(query).skip(skip).limit(limit).sort("started_at", -1):
        s["_id"] = str(s["_id"])
        # Add student name
        profile = await db.student_profiles.find_one({"user_id": s["student_id"]})
        s["student_name"] = profile.get("full_name", "Unknown") if profile else "Unknown"
        s["student_student_id"] = profile.get("student_id", "") if profile else ""
        # Add exam title
        try:
            exam = await db.exams.find_one({"_id": ObjectId(s["exam_id"])})
            s["exam_title"] = exam.get("title", "Unknown") if exam else "Unknown"
        except Exception:
            s["exam_title"] = "Unknown"
        sessions.append(s)
    return sessions


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, current_user=Depends(require_admin)):
    db = get_db()
    try:
        session = await db.proctoring_sessions.find_one({"_id": ObjectId(session_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session["_id"] = str(session["_id"])

    # Enrich with student info
    profile = await db.student_profiles.find_one({"user_id": session["student_id"]})
    user = await db.users.find_one({"_id": ObjectId(session["student_id"])}) if session.get("student_id") else None
    session["student_name"] = profile.get("full_name", "Unknown") if profile else "Unknown"
    session["student_student_id"] = profile.get("student_id", "") if profile else ""
    session["student_email"] = user.get("email", "") if user else ""

    # Enrich with exam info
    try:
        exam = await db.exams.find_one({"_id": ObjectId(session["exam_id"])})
        session["exam_title"] = exam.get("title", "Unknown") if exam else "Unknown"
        session["exam_duration_minutes"] = exam.get("duration_minutes", 0) if exam else 0
    except Exception:
        session["exam_title"] = "Unknown"
        session["exam_duration_minutes"] = 0

    # Get violations
    violations = []
    async for v in db.violations.find({"session_id": session_id}).sort("timestamp", -1):
        v["_id"] = str(v["_id"])
        # Attach student name to each violation
        v["student_name"] = session["student_name"]
        violations.append(v)
    session["violations"] = violations

    # Get events count
    session["event_count"] = await db.proctoring_events.count_documents({"session_id": session_id})

    # Compute duration seconds if both timestamps present
    if session.get("started_at") and session.get("ended_at"):
        try:
            delta = session["ended_at"] - session["started_at"]
            session["duration_seconds"] = int(delta.total_seconds())
        except Exception:
            session["duration_seconds"] = None
    else:
        session["duration_seconds"] = None

    logger.info(f"Session detail fetched: {session_id} by admin {current_user.get('email')}")
    return session


# ---- Violations ----

@router.get("/violations")
async def list_violations(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    exam_id: Optional[str] = None,
    student_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user=Depends(require_admin),
):
    db = get_db()
    query = {}
    if severity:
        query["severity"] = severity
    if status:
        query["status"] = status
    if exam_id:
        query["exam_id"] = exam_id
    if student_id:
        query["student_id"] = student_id

    violations = []
    async for v in db.violations.find(query).skip(skip).limit(limit).sort("timestamp", -1):
        v["_id"] = str(v["_id"])
        profile = await db.student_profiles.find_one({"user_id": v["student_id"]})
        v["student_name"] = profile.get("full_name", "Unknown") if profile else "Unknown"
        violations.append(v)

    total = await db.violations.count_documents(query)
    return {"violations": violations, "total": total}


@router.get("/violations/{violation_id}")
async def get_violation(violation_id: str, current_user=Depends(require_admin)):
    db = get_db()
    try:
        v = await db.violations.find_one({"_id": ObjectId(violation_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Violation not found")
    if not v:
        raise HTTPException(status_code=404, detail="Violation not found")
    v["_id"] = str(v["_id"])

    # Get evidence
    evidence = []
    async for ev in db.evidence.find({"violation_id": violation_id}):
        ev["_id"] = str(ev["_id"])
        ev.pop("file_path", None)
        evidence.append(ev)
    v["evidence"] = evidence
    return v


@router.put("/violations/{violation_id}/review")
async def review_violation(violation_id: str, payload: dict, current_user=Depends(require_admin)):
    db = get_db()
    updates = {
        "status": payload.get("status", "reviewed"),
        "review_notes": payload.get("review_notes", ""),
        "reviewed_by": str(current_user["_id"]),
        "reviewed_at": datetime.utcnow(),
    }
    result = await db.violations.update_one({"_id": ObjectId(violation_id)}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Violation not found")
    return {"message": "Violation reviewed"}


# ---- Evidence ----

@router.get("/violations/{violation_id}/evidence")
async def get_evidence_for_violation(violation_id: str, current_user=Depends(require_admin)):
    db = get_db()
    evidence = []
    async for ev in db.evidence.find({"violation_id": violation_id}):
        ev["_id"] = str(ev["_id"])
        evidence.append(ev)
    return evidence


@router.get("/evidence/{evidence_id}/file")
async def get_evidence_file(evidence_id: str, current_user=Depends(require_admin)):
    db = get_db()
    try:
        ev = await db.evidence.find_one({"_id": ObjectId(evidence_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Evidence not found")
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")

    fpath = ev.get("file_path")
    if not fpath or not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Evidence file not found")

    with open(fpath, "rb") as f:
        content = f.read()

    media_type = "image/jpeg" if ev["evidence_type"] == "screenshot" else "audio/wav"
    return Response(content=content, media_type=media_type)


# ---- Disqualifications ----

@router.get("/disqualifications")
async def list_disqualifications(skip: int = 0, limit: int = 50, current_user=Depends(require_admin)):
    db = get_db()
    disqs = []
    async for d in db.disqualifications.find({}).skip(skip).limit(limit).sort("disqualified_at", -1):
        d["_id"] = str(d["_id"])
        profile = await db.student_profiles.find_one({"user_id": d["student_id"]})
        d["student_name"] = profile.get("full_name", "Unknown") if profile else "Unknown"
        try:
            exam = await db.exams.find_one({"_id": ObjectId(d["exam_id"])})
            d["exam_title"] = exam.get("title", "Unknown") if exam else "Unknown"
        except Exception:
            d["exam_title"] = "Unknown"
        disqs.append(d)
    return disqs


@router.put("/disqualifications/{disq_id}/review")
async def review_disqualification(disq_id: str, payload: dict, current_user=Depends(require_admin)):
    db = get_db()
    await db.disqualifications.update_one(
        {"_id": ObjectId(disq_id)},
        {"$set": {
            "review_status": payload.get("review_status", "upheld"),
            "reviewed_by": str(current_user["_id"]),
        }}
    )
    return {"message": "Disqualification reviewed"}


# ---- Attempts (admin view) ----

@router.get("/attempts")
async def list_attempts(exam_id: Optional[str] = None, skip: int = 0, limit: int = 50, current_user=Depends(require_admin)):
    db = get_db()
    query = {}
    if exam_id:
        query["exam_id"] = exam_id
    attempts = []
    async for a in db.exam_attempts.find(query).skip(skip).limit(limit).sort("started_at", -1):
        a["_id"] = str(a["_id"])
        profile = await db.student_profiles.find_one({"user_id": a["student_id"]})
        a["student_name"] = profile.get("full_name", "Unknown") if profile else "Unknown"
        attempts.append(a)
    return attempts


# ---- Reports ----

@router.get("/reports")
async def list_reports(skip: int = 0, limit: int = 50, current_user=Depends(require_admin)):
    db = get_db()
    reports = []
    async for r in db.proctoring_reports.find({}).skip(skip).limit(limit).sort("generated_at", -1):
        r["_id"] = str(r["_id"])
        r.pop("full_timeline", None)  # omit from list view
        r.pop("violations", None)
        reports.append(r)
    return reports


@router.get("/reports/{session_id}")
async def get_report(session_id: str, current_user=Depends(require_admin)):
    db = get_db()
    report = await db.proctoring_reports.find_one({"session_id": session_id})
    if not report:
        # Try to generate it
        from app.services.report_service import generate_report
        report = await generate_report(session_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
    else:
        report["_id"] = str(report["_id"])
    return report


@router.get("/reports/{session_id}/pdf")
async def get_report_pdf(session_id: str, current_user=Depends(require_admin)):
    """Legacy endpoint — delegates to /download for backward compatibility."""
    return await get_report_download(session_id, current_user)


@router.get("/reports/{session_id}/download")
async def get_report_download(session_id: str, current_user=Depends(require_admin)):
    """Generate and stream a proctoring report PDF entirely in-memory."""
    db = get_db()

    # Fetch or generate the report document
    report = await db.proctoring_reports.find_one({"session_id": session_id})
    if not report:
        from app.services.report_service import generate_report
        report = await generate_report(session_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

    # Normalise _id
    if "_id" in report:
        report["_id"] = str(report["_id"])

    # Generate PDF bytes in-memory using reportlab
    try:
        pdf_bytes = _build_pdf_bytes(report, session_id)
    except Exception as exc:
        logger.error(f"In-memory PDF generation failed for session {session_id}: {exc}")
        raise HTTPException(status_code=500, detail="PDF generation failed")

    safe_id = session_id.replace("/", "_").replace("\\", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="report_{safe_id}.pdf"',
            "Cache-Control": "no-store",
        },
    )


def _build_pdf_bytes(report: dict, session_id: str) -> bytes:
    """Build a PDF from *report* entirely in-memory and return the raw bytes."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.enums import TA_CENTER
    from datetime import datetime

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=18, spaceAfter=6)
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=13, spaceBefore=12, spaceAfter=4)
    normal = styles["Normal"]

    story.append(Paragraph("AI Proctoring System — Examination Report", title_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 0.3 * cm))

    # Student info
    story.append(Paragraph("Student Information", h2_style))
    si = report.get("student_info") or {}
    story.append(Paragraph(f"<b>Name:</b> {si.get('full_name') or report.get('student_name') or 'N/A'}", normal))
    story.append(Paragraph(f"<b>Student ID:</b> {si.get('student_id') or 'N/A'}", normal))
    story.append(Paragraph(f"<b>Email:</b> {si.get('email') or report.get('student_email') or 'N/A'}", normal))
    story.append(Spacer(1, 0.2 * cm))

    # Exam info
    story.append(Paragraph("Examination Information", h2_style))
    ei = report.get("exam_info") or {}
    story.append(Paragraph(f"<b>Exam:</b> {ei.get('title') or report.get('exam_title') or 'N/A'}", normal))
    story.append(Paragraph(f"<b>Duration:</b> {ei.get('duration_minutes') or report.get('duration_minutes') or 0} minutes", normal))
    story.append(Paragraph(f"<b>Session ID:</b> {session_id}", normal))
    story.append(Spacer(1, 0.2 * cm))

    # Risk / summary
    story.append(Paragraph("Proctoring Summary", h2_style))
    risk_score = report.get("risk_score") or 0
    risk_level = str(report.get("risk_level") or "low").upper()
    identity = report.get("identity_result") or {}
    vs = report.get("violation_summary") or {}
    total_violations = vs.get("total") or (len(report.get("violations") or []))

    gen_at = report.get("generated_at")
    if isinstance(gen_at, datetime):
        gen_str = gen_at.strftime("%Y-%m-%d %H:%M UTC")
    else:
        gen_str = str(gen_at or datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))

    summary_data = [
        ["Metric", "Value"],
        ["Generated At", gen_str],
        ["Identity Verified", "YES" if identity.get("verified") else "NO"],
        ["Identity Confidence", f"{float(identity.get('confidence') or 0) * 100:.1f}%"],
        ["Total Violations", str(total_violations)],
        ["Warnings Issued", str(report.get("warning_count") or 0)],
        ["Disqualified", "YES" if report.get("disqualification_status") else "NO"],
        ["Risk Score", f"{risk_score}/100"],
        ["Risk Level", risk_level],
        ["Submission Status", str(report.get("submission_status") or "N/A").upper()],
    ]

    t = Table(summary_data, colWidths=[8 * cm, 8 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A5F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0F4F8")]),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.3 * cm))

    # Violations table
    violations = report.get("violations") or []
    if violations:
        story.append(Paragraph("Violations Detected", h2_style))
        vdata = [["#", "Type", "Severity", "Confidence", "Timestamp"]]
        for i, v in enumerate(violations[:30], 1):
            ts = v.get("timestamp") or v.get("created_at") or ""
            if hasattr(ts, "strftime"):
                ts = ts.strftime("%H:%M:%S")
            elif isinstance(ts, str) and "T" in ts:
                ts = ts.split("T")[1][:8]
            vdata.append([
                str(i),
                str(v.get("violation_type") or "").replace("_", " ").title(),
                str(v.get("severity") or "").upper(),
                f"{float(v.get('confidence') or 0) * 100:.0f}%",
                str(ts),
            ])
        vt = Table(vdata, colWidths=[1 * cm, 5 * cm, 3 * cm, 3 * cm, 4 * cm])
        vt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#EFF6FF")]),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(vt)
        story.append(Spacer(1, 0.3 * cm))

    # Footer
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    story.append(Paragraph(
        f"Generated by AI Proctoring System on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        ParagraphStyle("footer", parent=normal, fontSize=8, textColor=colors.grey, alignment=TA_CENTER),
    ))

    doc.build(story)
    return buf.getvalue()


# ---- Admin user management ----

@router.get("/me")
async def admin_me(current_user=Depends(require_admin)):
    current_user["_id"] = str(current_user["_id"])
    current_user.pop("password_hash", None)
    return current_user
