from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
import uuid

class CampaignResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    upload_id: Optional[uuid.UUID]
    meta_account_id: Optional[str] = None
    date: date
    campaign_name: str
    ad_set_name: Optional[str]
    ad_name: Optional[str]
    impressions: int
    clicks: int
    cost: float
    conversions: int
    conversion_value: float
    reach: Optional[int] = 0
    engagements: Optional[int] = 0
    link_clicks: Optional[int] = 0
    landing_page_views: Optional[int] = 0
    ctr: Optional[float]
    cpc: Optional[float]
    cpm: Optional[float]
    cpa: Optional[float]
    cvr: Optional[float]
    roas: Optional[float]
    created_at: datetime
    
    class Config:
        from_attributes = True
