from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import date, timedelta
from typing import Optional, List
from ..database import get_db
from ..models.campaign import Campaign
from ..utils.dependencies import get_current_user
from ..models.user import User
from ..schemas.campaign import CampaignResponse

router = APIRouter()

@router.get("/")
def get_campaigns(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    campaign_name: Optional[str] = Query(None),
    meta_account_id: Optional[str] = Query(None, description="Meta広告アカウントIDでフィルタリング"),
    limit: int = Query(100, le=1000),
    offset: int = Query(0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get campaign data with filters"""
    query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    # Apply filters
    if start_date:
        query = query.filter(Campaign.date >= start_date)
    if end_date:
        query = query.filter(Campaign.date <= end_date)
    if campaign_name:
        query = query.filter(Campaign.campaign_name.ilike(f"%{campaign_name}%"))
    if meta_account_id:
        query = query.filter(Campaign.meta_account_id == meta_account_id)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    campaigns = query.order_by(desc(Campaign.date)).limit(limit).offset(offset).all()
    
    return {
        "total": total,
        "data": campaigns
    }

@router.get("/summary")
def get_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    meta_account_id: Optional[str] = Query(None, description="Meta広告アカウントIDでフィルタリング"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get aggregated summary metrics"""
    query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    # Apply meta_account_id filter if provided
    if meta_account_id:
        query = query.filter(Campaign.meta_account_id == meta_account_id)
    
    # Default to last 30 days if no dates provided
    if not start_date:
        start_date = date.today() - timedelta(days=30)
    if not end_date:
        end_date = date.today()
    
    query = query.filter(
        Campaign.date >= start_date,
        Campaign.date <= end_date
    )
    
    # Aggregate metrics
    result = query.with_entities(
        func.sum(Campaign.impressions).label('total_impressions'),
        func.sum(Campaign.clicks).label('total_clicks'),
        func.sum(Campaign.cost).label('total_cost'),
        func.sum(Campaign.conversions).label('total_conversions'),
        func.sum(Campaign.conversion_value).label('total_conversion_value')
    ).first()
    
    total_impressions = int(result.total_impressions or 0)
    total_clicks = int(result.total_clicks or 0)
    total_cost = float(result.total_cost or 0)
    total_conversions = int(result.total_conversions or 0)
    total_conversion_value = float(result.total_conversion_value or 0)
    
    # Calculate averages
    avg_ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
    avg_cpc = (total_cost / total_clicks) if total_clicks > 0 else 0
    avg_cpm = (total_cost / total_impressions * 1000) if total_impressions > 0 else 0
    avg_cpa = (total_cost / total_conversions) if total_conversions > 0 else 0
    avg_cvr = (total_conversions / total_clicks * 100) if total_clicks > 0 else 0
    avg_roas = (total_conversion_value / total_cost * 100) if total_cost > 0 else 0
    
    return {
        "period": {
            "start_date": str(start_date),
            "end_date": str(end_date)
        },
        "totals": {
            "impressions": total_impressions,
            "clicks": total_clicks,
            "cost": round(total_cost, 2),
            "conversions": total_conversions,
            "conversion_value": round(total_conversion_value, 2)
        },
        "averages": {
            "ctr": round(avg_ctr, 2),
            "cpc": round(avg_cpc, 2),
            "cpm": round(avg_cpm, 2),
            "cpa": round(avg_cpa, 2),
            "cvr": round(avg_cvr, 2),
            "roas": round(avg_roas, 2)
        }
    }

@router.get("/trends")
def get_trends(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    group_by: str = Query("day", regex="^(day|week|month)$"),
    meta_account_id: Optional[str] = Query(None, description="Meta広告アカウントIDでフィルタリング"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get time series trends"""
    query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    # Apply meta_account_id filter if provided
    if meta_account_id:
        query = query.filter(Campaign.meta_account_id == meta_account_id)
    
    if not start_date:
        start_date = date.today() - timedelta(days=30)
    if not end_date:
        end_date = date.today()
    
    query = query.filter(
        Campaign.date >= start_date,
        Campaign.date <= end_date
    )
    
    # Group by date
    trends = query.with_entities(
        Campaign.date,
        func.sum(Campaign.impressions).label('impressions'),
        func.sum(Campaign.clicks).label('clicks'),
        func.sum(Campaign.cost).label('cost'),
        func.sum(Campaign.conversions).label('conversions')
    ).group_by(Campaign.date).order_by(Campaign.date).all()
    
    return {
        "data": [
            {
                "date": str(t.date),
                "impressions": int(t.impressions or 0),
                "clicks": int(t.clicks or 0),
                "cost": float(t.cost or 0),
                "conversions": int(t.conversions or 0)
            }
            for t in trends
        ]
    }

@router.get("/by-campaign")
def get_by_campaign(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(10, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get metrics grouped by campaign"""
    query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    if not start_date:
        start_date = date.today() - timedelta(days=30)
    if not end_date:
        end_date = date.today()
    
    query = query.filter(
        Campaign.date >= start_date,
        Campaign.date <= end_date
    )
    
    campaigns = query.with_entities(
        Campaign.campaign_name,
        func.sum(Campaign.impressions).label('impressions'),
        func.sum(Campaign.clicks).label('clicks'),
        func.sum(Campaign.cost).label('cost'),
        func.sum(Campaign.conversions).label('conversions'),
        func.sum(Campaign.conversion_value).label('conversion_value')
    ).group_by(Campaign.campaign_name).all()
    
    # Calculate metrics for each campaign
    result = []
    for c in campaigns:
        impressions = int(c.impressions or 0)
        clicks = int(c.clicks or 0)
        cost = float(c.cost or 0)
        conversions = int(c.conversions or 0)
        conversion_value = float(c.conversion_value or 0)
        
        ctr = (clicks / impressions * 100) if impressions > 0 else 0
        cpc = (cost / clicks) if clicks > 0 else 0
        cpa = (cost / conversions) if conversions > 0 else 0
        cvr = (conversions / clicks * 100) if clicks > 0 else 0
        roas = (conversion_value / cost * 100) if cost > 0 else 0
        
        result.append({
            "campaign_name": c.campaign_name,
            "impressions": impressions,
            "clicks": clicks,
            "cost": round(cost, 2),
            "conversions": conversions,
            "conversion_value": round(conversion_value, 2),
            "ctr": round(ctr, 2),
            "cpc": round(cpc, 2),
            "cpa": round(cpa, 2),
            "cvr": round(cvr, 2),
            "roas": round(roas, 2)
        })
    
    # Sort by ROAS descending
    result.sort(key=lambda x: x['roas'], reverse=True)
    
    return {
        "data": result[:limit]
    }

@router.get("/top-performers")
def get_top_performers(
    metric: str = Query("roas", regex="^(roas|ctr|cvr)$"),
    limit: int = Query(5, le=10),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get top performing campaigns by specified metric"""
    # Get last 30 days
    start_date = date.today() - timedelta(days=30)
    
    query = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        Campaign.date >= start_date
    )
    
    campaigns = query.with_entities(
        Campaign.campaign_name,
        func.sum(Campaign.impressions).label('impressions'),
        func.sum(Campaign.clicks).label('clicks'),
        func.sum(Campaign.cost).label('cost'),
        func.sum(Campaign.conversions).label('conversions'),
        func.sum(Campaign.conversion_value).label('conversion_value')
    ).group_by(Campaign.campaign_name).all()
    
    # Calculate and sort
    result = []
    for c in campaigns:
        impressions = int(c.impressions or 0)
        clicks = int(c.clicks or 0)
        cost = float(c.cost or 0)
        conversions = int(c.conversions or 0)
        conversion_value = float(c.conversion_value or 0)
        
        if metric == "roas":
            value = (conversion_value / cost * 100) if cost > 0 else 0
        elif metric == "ctr":
            value = (clicks / impressions * 100) if impressions > 0 else 0
        elif metric == "cvr":
            value = (conversions / clicks * 100) if clicks > 0 else 0
        else:
            value = 0
        
        result.append({
            "campaign_name": c.campaign_name,
            "metric_value": round(value, 2),
            "conversions": conversions,
            "cost": round(cost, 2)
        })
    
    result.sort(key=lambda x: x['metric_value'], reverse=True)
    
    return {
        "metric": metric,
        "data": result[:limit]
    }

@router.get("/bottom-performers")
def get_bottom_performers(
    metric: str = Query("roas", regex="^(roas|ctr|cvr)$"),
    limit: int = Query(5, le=10),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get bottom performing campaigns"""
    # Get last 30 days
    start_date = date.today() - timedelta(days=30)
    
    query = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        Campaign.date >= start_date
    )
    
    campaigns = query.with_entities(
        Campaign.campaign_name,
        func.sum(Campaign.impressions).label('impressions'),
        func.sum(Campaign.clicks).label('clicks'),
        func.sum(Campaign.cost).label('cost'),
        func.sum(Campaign.conversions).label('conversions'),
        func.sum(Campaign.conversion_value).label('conversion_value')
    ).group_by(Campaign.campaign_name).all()
    
    # Calculate and sort
    result = []
    for c in campaigns:
        impressions = int(c.impressions or 0)
        clicks = int(c.clicks or 0)
        cost = float(c.cost or 0)
        conversions = int(c.conversions or 0)
        conversion_value = float(c.conversion_value or 0)
        
        if metric == "roas":
            value = (conversion_value / cost * 100) if cost > 0 else 0
        elif metric == "ctr":
            value = (clicks / impressions * 100) if impressions > 0 else 0
        elif metric == "cvr":
            value = (conversions / clicks * 100) if clicks > 0 else 0
        else:
            value = 0
        
        result.append({
            "campaign_name": c.campaign_name,
            "metric_value": round(value, 2),
            "conversions": conversions,
            "cost": round(cost, 2)
        })
    
    result.sort(key=lambda x: x['metric_value'])
    
    return {
        "metric": metric,
        "data": result[:limit]
    }
