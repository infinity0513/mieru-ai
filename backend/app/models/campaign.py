from sqlalchemy import Column, String, Integer, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from ..database import Base

class Upload(Base):
    __tablename__ = "uploads"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer)
    file_url = Column(String(500))
    status = Column(String(20), default="processing")  # processing, completed, error
    error_message = Column(String)
    row_count = Column(Integer, default=0)
    start_date = Column(Date)
    end_date = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime)

class Campaign(Base):
    __tablename__ = "campaigns"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    upload_id = Column(UUID(as_uuid=True), ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meta_account_id = Column(String(255), nullable=True)  # Meta広告アカウントID (例: act_123456789)
    date = Column(Date, nullable=False)
    campaign_id = Column(String(255), nullable=True)  # Meta APIのキャンペーンID
    campaign_name = Column(String(255), nullable=False)
    adset_id = Column(String(255), nullable=True)  # Meta APIの広告セットID
    ad_set_name = Column(String(255), nullable=True)
    ad_id = Column(String(255), nullable=True)  # Meta APIの広告ID
    ad_name = Column(String(255), nullable=True)
    level = Column(String(20), nullable=True)  # 'campaign', 'adset', 'ad' のいずれか
    cost = Column(Numeric(10, 2), default=0)
    impressions = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    conversions = Column(Integer, default=0)
    conversion_value = Column(Numeric(10, 2), default=0)
    reach = Column(Integer, default=0)
    engagements = Column(Integer, default=0)
    link_clicks = Column(Integer, default=0)
    landing_page_views = Column(Integer, default=0)
    ctr = Column(Numeric(10, 2), default=0)
    cpc = Column(Numeric(10, 2), default=0)
    cpm = Column(Numeric(10, 2), default=0)
    cpa = Column(Numeric(10, 2), default=0)
    cvr = Column(Numeric(10, 2), default=0)
    roas = Column(Numeric(10, 2), default=0)
    created_at = Column(DateTime, default=datetime.utcnow)