"""Report generation service."""
from app.db.connection import get_db
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any
import logging
import os

logger = logging.getLogger(__name__)

SEVERITY_WEIGHTS = {"critical": 30, "high": 15, "medium": 8, "low": 3}


async def generate_report(session_id: str) -> Dict[str, Any]:
    """Generate a complete proctoring report for a session."""
    db = get_db()

    # Fetch session
    session = await db.proctoring_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        logger.error(f"Session {session_id} not found for report generation")
        return {}

    attempt_id = session["attempt_id"]
    student_id = session["student_id"]
    exam_id = session["exam_id"]

    # Fetch attempt
    attempt = await db.exam_attempts.find_one({"_id": ObjectId(attempt_id)})

    # Fetch student profile
    profile = await db.student_profiles.find_one({"user_id": student_id})
    user = await db.users.find_one({"_id": ObjectId(student_id)})

    # Fetch exam
    exam = await db.exams.find_one({"_id": ObjectId(exam_id)})

    # Fetch violations
    violations = []
    async for v in db.violations.find({"session_id": session_id}).sort("timestamp", 1):
        v["_id"] = str(v["_id"])
        violations.append(v)

    # Fetch events
    events = []
    async for e in db.proctoring_events.find({"session_id": session_id}).sort("timestamp", 1):
        e["_id"] = str(e["_id"])
        events.append(e)

    # Fetch warnings
    warnings = []
    async for w in db.warnings.find({"session_id": session_id}).sort("issued_at", 1):
        w["_id"] = str(w["_id"])
        warnings.append(w)

    # Fetch evidence
    evidence_list = []
    async for ev in db.evidence.find({"session_id": session_id}).sort("timestamp", 1):
        ev["_id"] = str(ev["_id"])
        ev.pop("file_path", None)  # don't expose file paths in report
        evidence_list.append(ev)

    # Violation summary
    violation_summary = {"total": len(violations), "by_severity": {}, "by_type": {}}
    for v in violations:
        sev = v.get("severity", "low")
        vtype = v.get("violation_type", "unknown")
        violation_summary["by_severity"][sev] = violation_summary["by_severity"].get(sev, 0) + 1
        violation_summary["by_type"][vtype] = violation_summary["by_type"].get(vtype, 0) + 1

    # Risk score
    risk_score = 0.0
    for v in violations:
        sev = v.get("severity", "low")
        risk_score += SEVERITY_WEIGHTS.get(sev, 3)
    warning_count = session.get("warning_count", 0)
    is_disqualified = session.get("is_disqualified", False)
    risk_score += warning_count * 5
    if is_disqualified:
        risk_score += 20
    risk_score = min(100.0, risk_score)

    if risk_score >= 70:
        risk_level = "critical"
    elif risk_score >= 50:
        risk_level = "high"
    elif risk_score >= 25:
        risk_level = "medium"
    else:
        risk_level = "low"

    # Build full timeline
    timeline = []
    for e in events:
        timeline.append({
            "type": "event",
            "event_type": e.get("event_type"),
            "timestamp": e.get("timestamp"),
            "confidence": e.get("confidence"),
            "demo": e.get("is_demo", False),
        })
    for w in warnings:
        timeline.append({
            "type": "warning",
            "warning_number": w.get("warning_number"),
            "message": w.get("message"),
            "timestamp": w.get("issued_at"),
        })
    # Sort timeline by timestamp
    def ts_key(x):
        t = x.get("timestamp")
        if isinstance(t, datetime):
            return t
        return datetime.min
    timeline.sort(key=ts_key)

    report_doc = {
        "session_id": session_id,
        "attempt_id": attempt_id,
        "student_id": student_id,
        "exam_id": exam_id,
        "generated_at": datetime.utcnow(),
        "student_info": {
            "email": user.get("email", "") if user else "",
            "full_name": profile.get("full_name", "") if profile else "",
            "student_id": profile.get("student_id", "") if profile else "",
        },
        "exam_info": {
            "title": exam.get("title", "") if exam else "",
            "duration_minutes": exam.get("duration_minutes", 0) if exam else 0,
        },
        "identity_result": {
            "verified": session.get("identity_verified", False),
            "confidence": session.get("identity_confidence", 0.0),
        },
        "violation_summary": violation_summary,
        "violations": violations,
        "warnings": warnings,
        "evidence": evidence_list,
        "warning_count": warning_count,
        "disqualification_status": is_disqualified,
        "disqualification_reason": session.get("disqualification_reason"),
        "submission_status": attempt.get("status", "unknown") if attempt else "unknown",
        "risk_score": round(risk_score, 1),
        "risk_level": risk_level,
        "full_timeline": [
            {**t, "timestamp": t["timestamp"].isoformat() if isinstance(t.get("timestamp"), datetime) else str(t.get("timestamp", ""))}
            for t in timeline
        ],
        "session_duration_minutes": round(
            ((session.get("ended_at") or datetime.utcnow()) - session["started_at"]).total_seconds() / 60, 1
        ) if session.get("started_at") else 0,
        "pdf_path": None,
    }

    # Upsert report
    await db.proctoring_reports.update_one(
        {"session_id": session_id},
        {"$set": report_doc},
        upsert=True,
    )

    # Generate PDF
    try:
        pdf_path = await generate_pdf_report(report_doc, session_id)
        await db.proctoring_reports.update_one(
            {"session_id": session_id},
            {"$set": {"pdf_path": pdf_path}}
        )
        report_doc["pdf_path"] = pdf_path
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")

    logger.info(f"Report generated for session {session_id}, risk={risk_level} ({risk_score})")
    return report_doc


async def generate_pdf_report(report: Dict[str, Any], session_id: str) -> str:
    """Generate PDF using reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

    from app.core.config import settings
    reports_dir = os.path.join(settings.EVIDENCE_STORAGE_PATH, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    pdf_path = os.path.join(reports_dir, f"report_{session_id}.pdf")

    doc = SimpleDocTemplate(pdf_path, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=18, spaceAfter=6)
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=13, spaceBefore=12, spaceAfter=4)
    normal = styles["Normal"]

    story.append(Paragraph("AI Proctoring System — Examination Report", title_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 0.3*cm))

    # Student info
    story.append(Paragraph("Student Information", h2_style))
    si = report.get("student_info", {})
    story.append(Paragraph(f"<b>Name:</b> {si.get('full_name', 'N/A')}", normal))
    story.append(Paragraph(f"<b>Student ID:</b> {si.get('student_id', 'N/A')}", normal))
    story.append(Paragraph(f"<b>Email:</b> {si.get('email', 'N/A')}", normal))
    story.append(Spacer(1, 0.2*cm))

    # Exam info
    story.append(Paragraph("Examination Information", h2_style))
    ei = report.get("exam_info", {})
    story.append(Paragraph(f"<b>Exam:</b> {ei.get('title', 'N/A')}", normal))
    story.append(Paragraph(f"<b>Duration:</b> {ei.get('duration_minutes', 0)} minutes", normal))
    story.append(Paragraph(f"<b>Session Duration:</b> {report.get('session_duration_minutes', 0)} minutes", normal))
    story.append(Spacer(1, 0.2*cm))

    # Summary
    story.append(Paragraph("Proctoring Summary", h2_style))
    risk_level = report.get("risk_level", "low").upper()
    risk_score = report.get("risk_score", 0)
    identity = report.get("identity_result", {})

    summary_data = [
        ["Metric", "Value"],
        ["Identity Verified", "YES" if identity.get("verified") else "NO"],
        ["Identity Confidence", f"{identity.get('confidence', 0)*100:.1f}%"],
        ["Total Violations", str(report.get("violation_summary", {}).get("total", 0))],
        ["Warnings Issued", str(report.get("warning_count", 0))],
        ["Disqualified", "YES" if report.get("disqualification_status") else "NO"],
        ["Risk Score", f"{risk_score}/100"],
        ["Risk Level", risk_level],
        ["Submission Status", report.get("submission_status", "N/A").upper()],
    ]

    t = Table(summary_data, colWidths=[8*cm, 8*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A5F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0F4F8")]),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.3*cm))

    # Violations table
    violations = report.get("violations", [])
    if violations:
        story.append(Paragraph("Violations Detected", h2_style))
        vdata = [["#", "Type", "Severity", "Confidence", "Timestamp"]]
        for i, v in enumerate(violations[:30], 1):
            ts = v.get("timestamp", "")
            if hasattr(ts, "strftime"):
                ts = ts.strftime("%H:%M:%S")
            elif isinstance(ts, str) and "T" in ts:
                ts = ts.split("T")[1][:8]
            vdata.append([
                str(i),
                v.get("violation_type", "").replace("_", " ").title(),
                v.get("severity", "").upper(),
                f"{v.get('confidence', 0)*100:.0f}%",
                str(ts),
            ])
        vt = Table(vdata, colWidths=[1*cm, 5*cm, 3*cm, 3*cm, 4*cm])
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
        story.append(Spacer(1, 0.3*cm))

    # Footer
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    story.append(Paragraph(
        f"Generated by AI Proctoring System on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        ParagraphStyle("footer", parent=normal, fontSize=8, textColor=colors.grey, alignment=TA_CENTER)
    ))

    doc.build(story)
    return pdf_path
