from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timedelta
import uuid
from ..database import Base

class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    used = Column(String(10), default="false", nullable=False)  # "true" or "false"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    @staticmethod
    def generate_token() -> str:
        """Generate a secure random token"""
        return str(uuid.uuid4())
    
    @staticmethod
    def get_expiration_time(hours: int = 72) -> datetime:
        """Get expiration time (default 72 hours = 3 days)"""
        return datetime.utcnow() + timedelta(hours=hours)
    
    def is_valid(self) -> bool:
        """Check if token is valid (not expired and not used)"""
        return (
            self.used == "false" and
            self.expires_at > datetime.utcnow()
        )

