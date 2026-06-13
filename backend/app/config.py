from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "AttendAI"
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-this-secret-key"

    # Database
    DATABASE_URL: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Cloudflare R2
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "attendai-media"
    R2_PUBLIC_URL: str = ""

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Face Recognition
    FACE_RECOGNITION_THRESHOLD: float = 0.35
    FACE_MODEL_NAME: str = "buffalo_l"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000,https://attend-ai-kvl7.vercel.app"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
