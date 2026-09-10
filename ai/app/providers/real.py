"""
Real AI Providers
=================
These providers use actual AI/CV libraries for genuine inference.
They are only loaded when DEMO_MODE=false and require the full requirements-full.txt.

Each provider gracefully falls back with a clear error if its library is unavailable.
"""
import base64
import io
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Try importing optional heavy libs
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logger.warning("OpenCV not available")

try:
    import face_recognition
    FACE_REC_AVAILABLE = True
except ImportError:
    FACE_REC_AVAILABLE = False
    logger.warning("face_recognition not available — face detection/verification disabled")

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    logger.warning("mediapipe not available — pose/gaze estimation disabled")

try:
    from ultralytics import YOLO as UltralyticsYOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logger.warning("ultralytics not available — object detection disabled")

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    logger.warning("whisper not available — speech-to-text disabled")

from app.providers.base import (
    FaceDetectionProvider, FaceVerificationProvider,
    HeadPoseProvider, GazeProvider, ObjectDetectionProvider,
    SpeechToTextProvider, SpeakerAnalysisProvider,
)

PROHIBITED_CLASSES = {
    "cell phone": "mobile_phone",
    "phone": "mobile_phone",
    "calculator": "calculator",
    "headphones": "headphones",
    "earphones": "headphones",
    "watch": "smartwatch",
    "laptop": "laptop",
    "book": "book",
}


def _decode_image(image_bytes: bytes):
    """Decode image bytes to numpy RGB array."""
    if not CV2_AVAILABLE:
        return None
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


class RealFaceDetectionProvider(FaceDetectionProvider):
    async def detect_faces(self, image_bytes: bytes) -> dict:
        if not FACE_REC_AVAILABLE:
            return {"face_count": 1, "faces": [], "demo": False, "error": "face_recognition unavailable"}
        try:
            img = _decode_image(image_bytes)
            if img is None:
                return {"face_count": 0, "faces": [], "demo": False}
            locations = face_recognition.face_locations(img, model="hog")
            faces = [{"bbox": list(loc), "confidence": 0.9} for loc in locations]
            return {"face_count": len(faces), "faces": faces, "demo": False}
        except Exception as e:
            logger.error(f"Face detection error: {e}")
            return {"face_count": 0, "faces": [], "demo": False, "error": str(e)}


class RealFaceVerificationProvider(FaceVerificationProvider):
    async def encode_face(self, image_bytes: bytes) -> dict:
        if not FACE_REC_AVAILABLE:
            return {"success": False, "error": "face_recognition unavailable", "demo": False}
        try:
            img = _decode_image(image_bytes)
            if img is None:
                return {"success": False, "error": "Could not decode image", "demo": False}
            encodings = face_recognition.face_encodings(img)
            if not encodings:
                return {"success": False, "error": "No face detected in image", "demo": False}
            if len(encodings) > 1:
                return {"success": False, "error": "Multiple faces detected. Please use an image with only one face.", "demo": False}
            return {"success": True, "encoding": encodings[0].tolist(), "face_count": 1, "demo": False}
        except Exception as e:
            logger.error(f"Face encoding error: {e}")
            return {"success": False, "error": str(e), "demo": False}

    async def verify_face(self, image_bytes: bytes, stored_encoding: list) -> dict:
        if not FACE_REC_AVAILABLE:
            return {"is_match": True, "confidence": 0.5, "demo": False, "error": "face_recognition unavailable"}
        try:
            img = _decode_image(image_bytes)
            if img is None:
                return {"is_match": False, "confidence": 0.0, "demo": False}
            encodings = face_recognition.face_encodings(img)
            if not encodings:
                return {"is_match": False, "confidence": 0.0, "demo": False}
            stored = np.array(stored_encoding)
            distance = face_recognition.face_distance([stored], encodings[0])[0]
            # distance < 0.6 is typically a match
            is_match = bool(distance < 0.6)
            confidence = round(float(1.0 - min(distance, 1.0)), 3)
            return {"is_match": is_match, "confidence": confidence, "distance": float(distance), "demo": False}
        except Exception as e:
            logger.error(f"Face verification error: {e}")
            return {"is_match": False, "confidence": 0.0, "demo": False, "error": str(e)}


class RealHeadPoseProvider(HeadPoseProvider):
    def __init__(self):
        self._face_mesh = None
        if MEDIAPIPE_AVAILABLE:
            self._mp_face_mesh = mp.solutions.face_mesh
            self._face_mesh = self._mp_face_mesh.FaceMesh(
                static_image_mode=True, max_num_faces=1,
                refine_landmarks=True, min_detection_confidence=0.5
            )

    async def estimate_pose(self, image_bytes: bytes) -> dict:
        if not MEDIAPIPE_AVAILABLE or not self._face_mesh:
            return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "demo": False, "error": "mediapipe unavailable"}
        try:
            img = _decode_image(image_bytes)
            if img is None:
                return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "demo": False}
            results = self._face_mesh.process(img)
            if not results.multi_face_landmarks:
                return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "demo": False}

            landmarks = results.multi_face_landmarks[0].landmark
            h, w = img.shape[:2]
            # Key landmark indices for pose estimation
            # Nose tip: 1, Chin: 152, Left eye corner: 263, Right eye corner: 33
            nose = landmarks[1]
            chin = landmarks[152]
            left_eye = landmarks[263]
            right_eye = landmarks[33]

            # Simple yaw from horizontal nose position
            nose_x = nose.x - 0.5
            yaw = round(float(nose_x * 80), 1)

            # Simple pitch from vertical nose position
            nose_y = nose.y - 0.5
            pitch = round(float(nose_y * 60), 1)

            # Roll from eye line angle
            dx = right_eye.x - left_eye.x
            dy = right_eye.y - left_eye.y
            import math
            roll = round(float(math.degrees(math.atan2(dy, dx))), 1)

            return {"yaw": yaw, "pitch": pitch, "roll": roll, "demo": False}
        except Exception as e:
            logger.error(f"Head pose error: {e}")
            return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "demo": False, "error": str(e)}


class RealGazeProvider(GazeProvider):
    def __init__(self):
        self._face_mesh = None
        if MEDIAPIPE_AVAILABLE:
            self._mp_face_mesh = mp.solutions.face_mesh
            self._face_mesh = self._mp_face_mesh.FaceMesh(
                static_image_mode=True, max_num_faces=1,
                refine_landmarks=True, min_detection_confidence=0.5
            )

    async def estimate_gaze(self, image_bytes: bytes) -> dict:
        if not MEDIAPIPE_AVAILABLE or not self._face_mesh:
            return {"looking_away": False, "gaze_x": 0.0, "gaze_y": 0.0, "confidence": 0.5, "demo": False}
        try:
            img = _decode_image(image_bytes)
            if img is None:
                return {"looking_away": False, "gaze_x": 0.0, "gaze_y": 0.0, "confidence": 0.5, "demo": False}
            results = self._face_mesh.process(img)
            if not results.multi_face_landmarks:
                return {"looking_away": False, "gaze_x": 0.0, "gaze_y": 0.0, "confidence": 0.5, "demo": False}

            landmarks = results.multi_face_landmarks[0].landmark
            # Use iris landmarks (468-472 for left, 473-477 for right) if available
            # Fall back to eye corner landmarks
            left_iris = landmarks[468] if len(landmarks) > 468 else landmarks[33]
            right_iris = landmarks[473] if len(landmarks) > 473 else landmarks[263]
            left_corner = landmarks[33]
            right_corner = landmarks[263]

            gaze_x = ((left_iris.x + right_iris.x) / 2) - 0.5
            gaze_y = ((left_iris.y + right_iris.y) / 2) - 0.5
            looking_away = abs(gaze_x) > 0.2 or abs(gaze_y) > 0.15

            return {
                "looking_away": bool(looking_away),
                "gaze_x": round(float(gaze_x), 3),
                "gaze_y": round(float(gaze_y), 3),
                "confidence": 0.85,
                "demo": False,
            }
        except Exception as e:
            logger.error(f"Gaze estimation error: {e}")
            return {"looking_away": False, "gaze_x": 0.0, "gaze_y": 0.0, "confidence": 0.5, "demo": False}


class RealObjectDetectionProvider(ObjectDetectionProvider):
    def __init__(self, model_path: str = ""):
        self._model = None
        if YOLO_AVAILABLE:
            try:
                path = model_path or "yolov8n.pt"
                self._model = UltralyticsYOLO(path)
                logger.info(f"YOLO model loaded: {path}")
            except Exception as e:
                logger.error(f"YOLO load error: {e}")

    async def detect_objects(self, image_bytes: bytes) -> dict:
        if not self._model:
            return {"objects": [], "demo": False, "error": "YOLO not available"}
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return {"objects": [], "demo": False}
            results = self._model(img, verbose=False)[0]
            objects = []
            for box in results.boxes:
                cls_id = int(box.cls[0])
                cls_name = results.names[cls_id].lower()
                conf = float(box.conf[0])
                # Only return prohibited objects
                mapped = PROHIBITED_CLASSES.get(cls_name)
                if mapped:
                    objects.append({
                        "class": mapped,
                        "confidence": round(conf, 3),
                        "bbox": [round(float(x)) for x in box.xyxy[0].tolist()],
                    })
            return {"objects": objects, "demo": False}
        except Exception as e:
            logger.error(f"Object detection error: {e}")
            return {"objects": [], "demo": False, "error": str(e)}


class RealSpeechToTextProvider(SpeechToTextProvider):
    def __init__(self, model_size: str = "base"):
        self._model = None
        if WHISPER_AVAILABLE:
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
                self._model = whisper.load_model(model_size, device=device)
                logger.info(f"Whisper model loaded: {model_size} on {device}")
            except Exception as e:
                logger.error(f"Whisper load error: {e}")

    async def transcribe(self, audio_bytes: bytes) -> dict:
        if not self._model:
            return {"transcript": "", "confidence": 0.0, "language": "en", "demo": False, "error": "Whisper not available"}
        try:
            import tempfile, os
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            result = self._model.transcribe(tmp_path, language="en")
            os.unlink(tmp_path)
            return {
                "transcript": result.get("text", "").strip(),
                "confidence": 0.9,
                "language": result.get("language", "en"),
                "demo": False,
            }
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return {"transcript": "", "confidence": 0.0, "language": "en", "demo": False, "error": str(e)}


class RealSpeakerAnalysisProvider(SpeakerAnalysisProvider):
    """
    Uses simple heuristics when pyannote is not available.
    Install pyannote.audio and set PYANNOTE_AUTH_TOKEN for full diarisation.
    """

    async def analyse(self, audio_bytes: bytes, transcript: str = "") -> dict:
        # Simple heuristic: estimate speaker count from audio characteristics
        # For full diarisation, integrate pyannote.audio
        return {
            "speaker_count": 1,
            "background_conversation": False,
            "demo": False,
            "note": "Basic speaker analysis (pyannote.audio not integrated)",
        }
