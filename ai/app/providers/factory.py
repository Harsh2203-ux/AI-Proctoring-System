"""
Provider factory - selects real or demo providers based on DEMO_MODE.
"""
from app.config import ai_settings
import logging

logger = logging.getLogger(__name__)

_providers = None


def get_providers():
    global _providers
    if _providers is not None:
        return _providers

    if ai_settings.DEMO_MODE:
        logger.info("Loading DEMO MODE AI providers")
        from app.providers.demo import (
            DemoFaceDetectionProvider,
            DemoFaceVerificationProvider,
            DemoHeadPoseProvider,
            DemoGazeProvider,
            DemoObjectDetectionProvider,
            DemoSpeechToTextProvider,
            DemoSpeakerAnalysisProvider,
        )
        _providers = {
            "face_detection": DemoFaceDetectionProvider(),
            "face_verification": DemoFaceVerificationProvider(),
            "head_pose": DemoHeadPoseProvider(),
            "gaze": DemoGazeProvider(),
            "object_detection": DemoObjectDetectionProvider(),
            "speech_to_text": DemoSpeechToTextProvider(),
            "speaker_analysis": DemoSpeakerAnalysisProvider(),
        }
    else:
        logger.info("Loading REAL AI providers")
        from app.providers.real import (
            RealFaceDetectionProvider,
            RealFaceVerificationProvider,
            RealHeadPoseProvider,
            RealGazeProvider,
            RealObjectDetectionProvider,
            RealSpeechToTextProvider,
            RealSpeakerAnalysisProvider,
        )
        _providers = {
            "face_detection": RealFaceDetectionProvider(),
            "face_verification": RealFaceVerificationProvider(),
            "head_pose": RealHeadPoseProvider(),
            "gaze": RealGazeProvider(),
            "object_detection": RealObjectDetectionProvider(ai_settings.YOLO_MODEL_PATH),
            "speech_to_text": RealSpeechToTextProvider(ai_settings.WHISPER_MODEL_SIZE),
            "speaker_analysis": RealSpeakerAnalysisProvider(),
        }

    return _providers
