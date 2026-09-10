from pydantic_settings import BaseSettings


class AISettings(BaseSettings):
    DEMO_MODE: bool = True
    WHISPER_MODEL_SIZE: str = "base"
    YOLO_MODEL_PATH: str = ""
    PYANNOTE_AUTH_TOKEN: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


ai_settings = AISettings()
