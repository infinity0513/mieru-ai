from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from ..database import Base

class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    analysis_period_start = Column(DateTime, nullable=False)
    analysis_period_end = Column(DateTime, nullable=False)
    campaign_name = Column(String(255), nullable=True)  # None for overall, campaign name for campaign-specific
    overall_rating = Column(Integer)
    overall_comment = Column(String)
    issues = Column(JSON)
    recommendations = Column(JSON)
    action_plan = Column(JSON)
    raw_data = Column(JSON)
    status = Column(String(20), default="processing")  # processing, completed, error
    error_message = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

