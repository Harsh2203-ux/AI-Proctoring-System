"""
DEMO MODE Providers
===================
These providers return realistic synthetic data for demonstration purposes.
All results include "demo": true — they must never be presented as real AI detections.

The demo simulation uses deterministic randomness seeded by timestamp bucket
so results are plausible but not completely random.
"""
import random
import time
import math
from app.providers.base import (
    FaceDetectionProvider, FaceVerificationProvider,
    HeadPoseProvider, GazeProvider, ObjectDetectionProvider,
    SpeechToTextProvider, SpeakerAnalysisProvider,
)

PROHIBITED_OBJECTS = [
    "mobile_phone", "calculator", "headphones", "smartwatch"
]

DEMO_TRANSCRIPTS = [
    "Let me think about this problem carefully.",
    "The answer to question three should be...",
    "I need to review my notes on binary trees.",
    "Can you help me with this?",
    "What is the correct answer here?",
    "I'm not sure about this one.",
    "Let me calculate this step by step.",
]


def _demo_rand(seed_offset: int = 0) -> random.Random:
    """Returns a seeded random generator based on 10-second time bucket."""
    bucket = int(time.time() / 10) + seed_offset
    return random.Random(bucket)


class DemoFaceDetectionProvider(FaceDetectionProvider):
    """Simulates face detection. Mostly returns 1 face, occasionally 0 or 2."""

    async def detect_faces(self, image_bytes: bytes) -> dict:
        r = _demo_rand()
        roll = r.random()
        if roll < 0.05:
            face_count = 0
        elif roll < 0.08:
            face_count = 2
        else:
            face_count = 1

        faces = []
        for _ in range(face_count):
            faces.append({
                "bbox": [r.randint(100, 400), r.randint(50, 200), r.randint(400, 700), r.randint(300, 500)],
                "confidence": round(r.uniform(0.88, 0.99), 2),
            })
        return {"face_count": face_count, "faces": faces, "demo": True}


class DemoFaceVerificationProvider(FaceVerificationProvider):
    """Simulates face encoding and verification."""

    async def encode_face(self, image_bytes: bytes) -> dict:
        r = _demo_rand(seed_offset=1)
        # Generate a plausible 128-dim unit vector
        encoding = [round(r.gauss(0, 0.1), 4) for _ in range(128)]
        norm = math.sqrt(sum(x ** 2 for x in encoding)) or 1.0
        encoding = [round(x / norm, 4) for x in encoding]
        return {"success": True, "encoding": encoding, "face_count": 1, "demo": True}

    async def verify_face(self, image_bytes: bytes, stored_encoding: list) -> dict:
        r = _demo_rand(seed_offset=2)
        # Mostly matches, occasionally doesn't
        if r.random() < 0.04:
            return {"is_match": False, "confidence": round(r.uniform(0.72, 0.88), 2), "demo": True}
        return {"is_match": True, "confidence": round(r.uniform(0.82, 0.97), 2), "demo": True}


class DemoHeadPoseProvider(HeadPoseProvider):
    """Simulates head pose estimation."""

    async def estimate_pose(self, image_bytes: bytes) -> dict:
        r = _demo_rand(seed_offset=3)
        roll = r.random()
        if roll < 0.06:
            # Significant yaw (looking away)
            yaw = round(r.uniform(35, 55), 1)
            pitch = round(r.uniform(-10, 10), 1)
        elif roll < 0.10:
            # Looking down
            yaw = round(r.uniform(-10, 10), 1)
            pitch = round(r.uniform(25, 40), 1)
        else:
            yaw = round(r.gauss(0, 8), 1)
            pitch = round(r.gauss(0, 5), 1)
        roll_angle = round(r.gauss(0, 3), 1)
        return {"yaw": yaw, "pitch": pitch, "roll": roll_angle, "demo": True}


class DemoGazeProvider(GazeProvider):
    """Simulates eye gaze estimation."""

    async def estimate_gaze(self, image_bytes: bytes) -> dict:
        r = _demo_rand(seed_offset=4)
        looking_away = r.random() < 0.07
        return {
            "looking_away": looking_away,
            "gaze_x": round(r.uniform(-0.3, 0.3), 2),
            "gaze_y": round(r.uniform(-0.2, 0.2), 2),
            "confidence": round(r.uniform(0.75, 0.95), 2),
            "demo": True,
        }


class DemoObjectDetectionProvider(ObjectDetectionProvider):
    """Simulates prohibited object detection."""

    async def detect_objects(self, image_bytes: bytes) -> dict:
        r = _demo_rand(seed_offset=5)
        objects = []
        if r.random() < 0.04:
            obj_class = r.choice(PROHIBITED_OBJECTS)
            objects.append({
                "class": obj_class,
                "confidence": round(r.uniform(0.62, 0.91), 2),
                "bbox": [r.randint(50, 300), r.randint(50, 300), r.randint(300, 600), r.randint(300, 500)],
            })
        return {"objects": objects, "demo": True}


class DemoSpeechToTextProvider(SpeechToTextProvider):
    """Simulates speech-to-text transcription."""

    async def transcribe(self, audio_bytes: bytes) -> dict:
        r = _demo_rand(seed_offset=6)
        transcript = r.choice(DEMO_TRANSCRIPTS)
        return {
            "transcript": transcript,
            "confidence": round(r.uniform(0.80, 0.97), 2),
            "language": "en",
            "demo": True,
        }


class DemoSpeakerAnalysisProvider(SpeakerAnalysisProvider):
    """Simulates speaker diarisation."""

    async def analyse(self, audio_bytes: bytes, transcript: str = "") -> dict:
        r = _demo_rand(seed_offset=7)
        roll = r.random()
        speaker_count = 2 if roll < 0.05 else 1
        background = roll < 0.08
        return {
            "speaker_count": speaker_count,
            "background_conversation": background,
            "demo": True,
        }
