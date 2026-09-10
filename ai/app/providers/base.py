"""
Abstract base classes for all AI providers.
These interfaces decouple the API layer from the implementation (real vs demo).
"""
from abc import ABC, abstractmethod
from typing import Optional


class FaceDetectionProvider(ABC):
    @abstractmethod
    async def detect_faces(self, image_bytes: bytes) -> dict:
        """Returns: {face_count, faces: [{bbox, confidence}], demo}"""
        ...


class FaceVerificationProvider(ABC):
    @abstractmethod
    async def encode_face(self, image_bytes: bytes) -> dict:
        """Returns: {success, encoding: list[float], demo, error?}"""
        ...

    @abstractmethod
    async def verify_face(self, image_bytes: bytes, stored_encoding: list) -> dict:
        """Returns: {is_match, confidence, demo}"""
        ...


class HeadPoseProvider(ABC):
    @abstractmethod
    async def estimate_pose(self, image_bytes: bytes) -> dict:
        """Returns: {yaw, pitch, roll, demo}"""
        ...


class GazeProvider(ABC):
    @abstractmethod
    async def estimate_gaze(self, image_bytes: bytes) -> dict:
        """Returns: {looking_away, gaze_x, gaze_y, confidence, demo}"""
        ...


class ObjectDetectionProvider(ABC):
    @abstractmethod
    async def detect_objects(self, image_bytes: bytes) -> dict:
        """Returns: {objects: [{class, confidence, bbox}], demo}"""
        ...


class SpeechToTextProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_bytes: bytes) -> dict:
        """Returns: {transcript, confidence, language, demo}"""
        ...


class SpeakerAnalysisProvider(ABC):
    @abstractmethod
    async def analyse(self, audio_bytes: bytes, transcript: str = "") -> dict:
        """Returns: {speaker_count, background_conversation, demo}"""
        ...
