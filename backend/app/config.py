from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    # Environment
    ENVIRONMENT: str = "development"  # development, staging, production
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/meta_ad_analyzer"
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # OpenAI
    OPENAI_API_KEY: str = ""
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # AWS S3
    S3_ENDPOINT_URL: Optional[str] = None
    S3_ACCESS_KEY_ID: str = "minioadmin"
    S3_SECRET_ACCESS_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "meta-ad-analyzer"
    S3_REGION: str = "us-east-1"
    
    # CORS (comma-separated string, will be split)
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:3001"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS string into list"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60  # 本番環境用
    RATE_LIMIT_PER_MINUTE_DEV: int = 3  # 開発環境用（4回目でログインできなくなる）
    
    # Sentry (Error Tracking)
    SENTRY_DSN: Optional[str] = None
    
    # Email (Optional)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FROM_EMAIL: Optional[str] = None
    
    # Resend (Email Service)
    RESEND_API_KEY: Optional[str] = None
    RESEND_FROM_EMAIL: Optional[str] = None  # 例: "noreply@yourdomain.com"
    RESEND_FROM_NAME: Optional[str] = None  # 例: "MIERU AI"
    FRONTEND_URL: Optional[str] = "http://localhost:3000"  # パスワードリセットリンク用
    
    # 2FA Skip List (comma-separated emails that can skip 2FA)
    SKIP_2FA_EMAILS: str = "gi06220622@gmail.com"  # メール無料枠節約のため
    
    @property
    def skip_2fa_emails_list(self) -> List[str]:
        """Parse SKIP_2FA_EMAILS string into list"""
        return [email.strip().lower() for email in self.SKIP_2FA_EMAILS.split(",") if email.strip()]
    
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"
    
    @property
    def rate_limit_calls(self) -> int:
        """環境に応じたレート制限値を返す"""
        return self.RATE_LIMIT_PER_MINUTE if self.is_production else self.RATE_LIMIT_PER_MINUTE_DEV
    
    class Config:
        env_file = ".env"

settings = Settings()
