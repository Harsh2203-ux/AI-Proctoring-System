"""
AI Service Main Application
============================
Provides AI inference endpoints consumed by the backend proctoring pipeline.
DEMO_MODE=true returns synthetic but realistic data labelled demo:true.
DEMO_MODE=false uses real AI models.
"""
import base64
import logging
from fastapi import FastAPI
from app.config import ai_settings
from app.providers.factory import get_providers

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Proctoring Service",
    description="AI inference service for the proctoring system",
    version="1.0.0",
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "demo_mode": ai_settings.DEMO_MODE,
        "mode_label": "DEMO" if ai_settings.DEMO_MODE else "REAL AI",
    }


@app.post("/ai/face/encode")
async def encode_face(payload: dict):
    """Encode a reference face image for identity verification."""
    providers = get_providers()
    image_b64 = payload.get("image_b64", "")
    if not image_b64:
        return {"success": False, "error": "No image provided"}
    image_bytes = base64.b64decode(image_b64)
    result = await providers["face_verification"].encode_face(image_bytes)
    return result


@app.post("/ai/face/verify")
async def verify_face(payload: dict):
    """Verify a face against a stored encoding."""
    providers = get_providers()
    image_b64 = payload.get("image_b64", "")
    stored_encoding = payload.get("stored_encoding", [])
    if not image_b64:
        return {"is_match": False, "confidence": 0.0, "error": "No image"}
    image_bytes = base64.b64decode(image_b64)
    result = await providers["face_verification"].verify_face(image_bytes, stored_encoding)
    return result


@app.post("/ai/frame/analyse")
async def analyse_frame(payload: dict):
    """
    Comprehensive frame analysis: face detection, identity verification,
    head pose, gaze, and object detection in one call.
    """
    providers = get_providers()
    image_b64 = payload.get("image_b64", "")
    face_encoding = payload.get("face_encoding", [])

    if not image_b64:
        return {"error": "No image data", "face_count": 0}

    image_bytes = base64.b64decode(image_b64)

    # Run all analyses
    face_result = await providers["face_detection"].detect_faces(image_bytes)
    face_count = face_result.get("face_count", 0)

    identity_result = {}
    if face_count == 1 and face_encoding:
        identity_result = await providers["face_verification"].verify_face(image_bytes, face_encoding)

    pose_result = {}
    gaze_result = {}
    if face_count >= 1:
        pose_result = await providers["head_pose"].estimate_pose(image_bytes)
        gaze_result = await providers["gaze"].estimate_gaze(image_bytes)

    object_result = await providers["object_detection"].detect_objects(image_bytes)

    is_demo = face_result.get("demo", False)

    return {
        "face_count": face_count,
        "faces": face_result.get("faces", []),
        "identity": identity_result,
        "pose": pose_result,
        "gaze": gaze_result,
        "objects": object_result.get("objects", []),
        "demo": is_demo,
    }


@app.post("/ai/audio/analyse")
async def analyse_audio(payload: dict):
    """
    Comprehensive audio analysis: transcription, keyword detection, speaker analysis.
    """
    providers = get_providers()
    audio_b64 = payload.get("audio_b64", "")
    config = payload.get("config", {})

    if not audio_b64:
        return {"transcript": "", "speaker_count": 1, "suspicious_speech": False, "demo": True}

    audio_bytes = base64.b64decode(audio_b64)

    # Transcribe
    transcription = await providers["speech_to_text"].transcribe(audio_bytes)
    transcript = transcription.get("transcript", "")

    # Keyword analysis
    suspicious_keywords = config.get("suspicious_keywords", [])
    matched_keywords = []
    if transcript and suspicious_keywords:
        t_lower = transcript.lower()
        matched_keywords = [kw for kw in suspicious_keywords if kw.lower() in t_lower]

    suspicious_speech = len(matched_keywords) > 0

    # Speaker analysis
    speaker_result = await providers["speaker_analysis"].analyse(audio_bytes, transcript)

    is_demo = transcription.get("demo", False)

    return {
        "transcript": transcript,
        "speech_confidence": transcription.get("confidence", 0.0),
        "language": transcription.get("language", "en"),
        "suspicious_speech": suspicious_speech,
        "matched_keywords": matched_keywords,
        "speaker_count": speaker_result.get("speaker_count", 1),
        "background_conversation": speaker_result.get("background_conversation", False),
        "demo": is_demo,
    }
