from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "change-this-secret"

    # JWT
    JWT_SECRET: str = "change-this-jwt-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MongoDB
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "proctoring_db"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # AI Service
    AI_SERVICE_URL: str = "http://localhost:8001"
    DEMO_MODE: bool = True

    # Evidence
    EVIDENCE_STORAGE_PATH: str = "./evidence"
    MAX_UPLOAD_SIZE_MB: int = 10

    # Seed data
    ADMIN_EMAIL: str = "admin@demo.com"
    ADMIN_PASSWORD: str = "Admin@1234"
    STUDENT_EMAIL: str = "student@demo.com"
    STUDENT_PASSWORD: str = "Student@1234"

    # Admin registration protection — required when creating a new admin account.
    # Set this to a long random string in production. Never expose in frontend code.
    # Generate with: python3 -c "import secrets; print(secrets.token_hex(24))"
    ADMIN_REGISTRATION_CODE: str = "CHANGE-THIS-ADMIN-CODE"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        # Accept .env from project root (when backend is run as a subdirectory)
        # or from the current directory (when run standalone / inside container).
        env_file = (".env", "../.env")
        extra = "ignore"


settings = Settings()
