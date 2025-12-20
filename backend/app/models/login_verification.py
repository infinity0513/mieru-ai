from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timedelta
import uuid
import random
from ..database import Base

class LoginVerificationCode(Base):
    __tablename__ = "login_verification_codes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    code = Column(String(6), nullable=False, index=True)  # 6桁の認証コード
    expires_at = Column(DateTime, nullable=False, index=True)
    used = Column(String(10), default="false", nullable=False)  # "true" or "false"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    @staticmethod
    def generate_code() -> str:
        """Generate a 6-digit verification code"""
        return ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    @staticmethod
    def get_expiration_time(minutes: int = 10) -> datetime:
        """Get expiration time (default 10 minutes)"""
        return datetime.utcnow() + timedelta(minutes=minutes)
    
    def is_valid(self) -> bool:
        """Check if code is valid (not expired and not used)"""
        return (
            self.used == "false" and
            self.expires_at > datetime.utcnow()
        )

