from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from ..database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    plan = Column(String(20), default="FREE")  # FREE, STANDARD, PRO
    email_verified = Column(String(10), default="false", nullable=False)  # "true" or "false"
    # organization = Column(String(255))  # Commented out - column doesn't exist in DB
    # Meta API settings
    meta_account_id = Column(String(255), nullable=True)  # Meta広告アカウントID (例: act_123456789)
    meta_access_token = Column(String(500), nullable=True)  # Metaアクセストークン（暗号化推奨）
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
