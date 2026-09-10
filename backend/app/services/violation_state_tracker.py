"""
Violation State Tracker
Tracks consecutive frames/conditions to apply persistence thresholds before generating violations.
"""
from typing import Dict, Any
from dataclasses import dataclass, field
import time


@dataclass
class StateTracker:
    face_absent_frames: int = 0
    multiple_faces_frames: int = 0
    head_pose_violation_frames: int = 0
    gaze_violation_frames: int = 0
    last_face_absent_time: float = 0.0
    last_identity_mismatch_confidence: float = 0.0


class ViolationStateTracker:
    """Per-session in-memory state for persistence thresholds."""

    def __init__(self):
        self._sessions: Dict[str, StateTracker] = {}

    def get(self, session_id: str) -> StateTracker:
        if session_id not in self._sessions:
            self._sessions[session_id] = StateTracker()
        return self._sessions[session_id]

    def clear(self, session_id: str):
        self._sessions.pop(session_id, None)

    def evaluate_frame(self, session_id: str, ai_result: Dict[str, Any], config: Dict[str, Any]) -> list:
        """
        Evaluate an AI frame result against persistence thresholds.
        Returns list of confirmed violation event dicts.
        """
        state = self.get(session_id)
        events = []
        is_demo = ai_result.get("demo", False)

        face_count = ai_result.get("face_count", 0)
        identity = ai_result.get("identity", {})
        pose = ai_result.get("pose", {})
        gaze = ai_result.get("gaze", {})
        objects = ai_result.get("objects", [])

        # -- Face absent --
        if face_count == 0:
            state.face_absent_frames += 1
            if state.face_absent_frames == 1:
                state.last_face_absent_time = time.time()
            threshold = config.get("face_absent_threshold_frames", 3)
            if state.face_absent_frames >= threshold:
                events.append({
                    "event_type": "face_absent",
                    "confidence": 1.0,
                    "duration_seconds": round(time.time() - state.last_face_absent_time, 1),
                    "demo": is_demo,
                })
        else:
            state.face_absent_frames = 0

        # -- Multiple faces --
        if face_count > 1:
            state.multiple_faces_frames += 1
            threshold = config.get("multiple_faces_threshold_frames", 2)
            if state.multiple_faces_frames >= threshold:
                events.append({
                    "event_type": "multiple_faces",
                    "confidence": 0.9,
                    "duration_seconds": 0.0,
                    "face_count": face_count,
                    "demo": is_demo,
                })
                events.append({
                    "event_type": "additional_person",
                    "confidence": 0.85,
                    "duration_seconds": 0.0,
                    "demo": is_demo,
                })
        else:
            state.multiple_faces_frames = 0

        # -- Identity mismatch (only if single face) --
        if face_count == 1 and identity:
            conf = identity.get("confidence", 1.0)
            is_match = identity.get("is_match", True)
            threshold = config.get("identity_mismatch_confidence_threshold", 0.7)
            if not is_match and conf >= threshold:
                events.append({
                    "event_type": "identity_mismatch",
                    "confidence": conf,
                    "duration_seconds": 0.0,
                    "demo": is_demo,
                })

        # -- Head pose --
        if pose and face_count >= 1:
            yaw = abs(pose.get("yaw", 0))
            pitch = abs(pose.get("pitch", 0))
            yaw_thresh = config.get("head_pose_yaw_threshold_degrees", 30)
            pitch_thresh = config.get("head_pose_pitch_threshold_degrees", 20)
            violation_frames = config.get("head_pose_violation_frames", 5)
            if yaw > yaw_thresh or pitch > pitch_thresh:
                state.head_pose_violation_frames += 1
                if state.head_pose_violation_frames >= violation_frames:
                    events.append({
                        "event_type": "head_pose_violation",
                        "confidence": min(1.0, (max(yaw, pitch) / 60)),
                        "duration_seconds": state.head_pose_violation_frames,
                        "yaw": yaw,
                        "pitch": pitch,
                        "demo": is_demo,
                    })
            else:
                state.head_pose_violation_frames = 0

        # -- Gaze --
        if gaze and face_count >= 1:
            looking_away = gaze.get("looking_away", False)
            gaze_thresh = config.get("gaze_away_threshold_frames", 4)
            if looking_away:
                state.gaze_violation_frames += 1
                if state.gaze_violation_frames >= gaze_thresh:
                    events.append({
                        "event_type": "gaze_violation",
                        "confidence": gaze.get("confidence", 0.7),
                        "duration_seconds": state.gaze_violation_frames,
                        "demo": is_demo,
                    })
            else:
                state.gaze_violation_frames = 0

        # -- Objects --
        obj_conf_thresh = config.get("object_detection_confidence_threshold", 0.6)
        for obj in objects:
            if obj.get("confidence", 0) >= obj_conf_thresh:
                events.append({
                    "event_type": "object_detected",
                    "confidence": obj["confidence"],
                    "duration_seconds": 0.0,
                    "object_class": obj.get("class", "unknown"),
                    "demo": is_demo,
                })

        return events

    def evaluate_audio(self, session_id: str, ai_result: Dict[str, Any], config: Dict[str, Any]) -> list:
        """Evaluate audio AI result and return violation events."""
        events = []
        is_demo = ai_result.get("demo", False)

        # Suspicious speech
        suspicious = ai_result.get("suspicious_speech", False)
        matched_keywords = ai_result.get("matched_keywords", [])
        if suspicious and matched_keywords:
            events.append({
                "event_type": "suspicious_speech",
                "confidence": ai_result.get("speech_confidence", 0.75),
                "duration_seconds": 0.0,
                "keywords": matched_keywords,
                "transcript": ai_result.get("transcript", ""),
                "demo": is_demo,
            })

        # Multiple speakers
        speaker_count = ai_result.get("speaker_count", 1)
        if speaker_count > 1:
            events.append({
                "event_type": "multiple_speakers",
                "confidence": 0.85,
                "duration_seconds": 0.0,
                "speaker_count": speaker_count,
                "demo": is_demo,
            })

        # Background conversation
        background = ai_result.get("background_conversation", False)
        if background:
            events.append({
                "event_type": "background_conversation",
                "confidence": 0.75,
                "duration_seconds": 0.0,
                "demo": is_demo,
            })

        return events


# Global singleton
violation_state_tracker = ViolationStateTracker()
