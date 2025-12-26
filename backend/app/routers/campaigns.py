from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, and_, case, text
from datetime import date, timedelta
from typing import Optional, List
from ..database import get_db
from ..models.campaign import Campaign
from ..utils.dependencies import get_current_user
from ..models.user import User
from ..schemas.campaign import CampaignResponse

router = APIRouter()

@router.get("/debug/ads")
def debug_ads(
    meta_account_id: Optional[str] = Query(None, description="Meta広告アカウントIDでフィルタリング"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    デバッグ用: 広告レベルのデータが取得されているか確認
    """
    base_query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    if meta_account_id:
        base_query = base_query.filter(Campaign.meta_account_id == meta_account_id)
    
    # 統計情報（meta_account_idフィルタを適用）
    campaign_level_count = base_query.filter(
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).count()
    
    adset_level_count = base_query.filter(
        Campaign.ad_set_name != '',
        Campaign.ad_set_name.isnot(None),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).count()
    
    ad_level_count = base_query.filter(
        Campaign.ad_name != '',
        Campaign.ad_name.isnot(None)
    ).count()
    
    # 広告レベルのデータのみを取得（ad_nameが存在する）
    ads_query = base_query.filter(
        Campaign.ad_name != '',
        Campaign.ad_name.isnot(None)
    )
    
    total_ads = ads_query.count()
    ads = ads_query.order_by(desc(Campaign.date)).limit(20).all()
    
    # 広告セットレベルのサンプルデータも取得
    adsets_query = base_query.filter(
        Campaign.ad_set_name != '',
        Campaign.ad_set_name.isnot(None),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    )
    adsets = adsets_query.order_by(desc(Campaign.date)).limit(10).all()
    
    return {
        "summary": {
            "campaign_level_count": campaign_level_count,
            "adset_level_count": adset_level_count,
            "ad_level_count": ad_level_count,
            "total_ads_found": total_ads,
            "meta_account_id": meta_account_id or "all"
        },
        "sample_ads": [
            {
                "id": str(ad.id),
                "campaign_name": ad.campaign_name,
                "ad_set_name": ad.ad_set_name or '',
                "ad_name": ad.ad_name or '',
                "date": str(ad.date),
                "meta_account_id": ad.meta_account_id or 'N/A',
                "impressions": ad.impressions,
                "clicks": ad.clicks,
                "cost": float(ad.cost),
                "conversions": ad.conversions,
                "conversion_value": float(ad.conversion_value)
            }
            for ad in ads
        ],
        "sample_adsets": [
            {
                "id": str(adset.id),
                "campaign_name": adset.campaign_name,
                "ad_set_name": adset.ad_set_name or '',
                "ad_name": adset.ad_name or '',
                "date": str(adset.date),
                "meta_account_id": adset.meta_account_id or 'N/A',
                "impressions": adset.impressions,
                "clicks": adset.clicks,
                "cost": float(adset.cost)
            }
            for adset in adsets
        ]
    }

@router.get("/debug/clicks")
def debug_clicks(
    campaign_name: str = Query(..., description="キャンペーン名（部分一致可）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    デバッグ用: 指定されたキャンペーンのclicksとlink_clicksの値を確認
    """
    # SQLクエリで直接確認
    query = text("""
        SELECT 
            id,
            campaign_name,
            ad_set_name,
            ad_name,
            date,
            meta_account_id,
            impressions,
            clicks,
            link_clicks,
            cost,
            conversions,
            conversion_value,
            reach,
            engagements,
            landing_page_views,
            created_at
        FROM campaigns
        WHERE user_id = :user_id
          AND (campaign_name LIKE :campaign_name_pattern1 OR campaign_name LIKE :campaign_name_pattern2)
        ORDER BY date DESC, created_at DESC
        LIMIT 50
    """)
    
    result = db.execute(
        query,
        {
            "user_id": str(current_user.id),
            "campaign_name_pattern1": f"%{campaign_name}%",
            "campaign_name_pattern2": f"%{campaign_name.replace('１', '1')}%"
        }
    )
    rows = result.fetchall()
    
    if len(rows) == 0:
        return {
            "message": "データが見つかりませんでした",
            "campaign_name": campaign_name,
            "records": []
        }
    
    records = []
    total_clicks = 0
    total_link_clicks = 0
    total_impressions = 0
    campaign_level_count = 0
    adset_level_count = 0
    
    for row in rows:
        ad_set_name = row[2] or ''
        is_campaign_level = (not ad_set_name or ad_set_name == '')
        
        if is_campaign_level:
            campaign_level_count += 1
            total_clicks += row[7] or 0
            total_link_clicks += row[8] or 0
            total_impressions += row[6] or 0
        else:
            adset_level_count += 1
        
        records.append({
            "id": str(row[0]),
            "campaign_name": row[1],
            "ad_set_name": row[2] or '',
            "ad_name": row[3] or '',
            "date": str(row[4]),
            "meta_account_id": row[5] or 'N/A',
            "level": "campaign-level" if is_campaign_level else "adset-level",
            "impressions": row[6] or 0,
            "clicks": row[7] or 0,
            "link_clicks": row[8] or 0,
            "cost": float(row[9] or 0),
            "conversions": row[10] or 0,
            "conversion_value": float(row[11] or 0),
            "reach": row[12] or 0,
            "engagements": row[13] or 0,
            "landing_page_views": row[14] or 0,
            "created_at": str(row[15]) if row[15] else None
        })
    
    return {
        "campaign_name": campaign_name,
        "total_records": len(rows),
        "campaign_level_count": campaign_level_count,
        "adset_level_count": adset_level_count,
        "summary": {
            "total_impressions": total_impressions,
            "total_clicks": total_clicks,
            "total_link_clicks": total_link_clicks,
            "difference": total_clicks - total_link_clicks
        },
        "records": records
    }

@router.get("/")
def get_campaigns(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    campaign_name: Optional[str] = Query(None),
    meta_account_id: Optional[str] = Query(None, description="Meta広告アカウントIDでフィルタリング"),
    level: Optional[str] = Query(None, description="データレベル: 'campaign', 'adset', 'ad'"),
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
    
    # Filter by level (ad_set_nameとad_nameの有無で判定)
    if level:
        if level == 'campaign':
            query = query.filter(
                or_(
                    Campaign.ad_set_name == '',
                    Campaign.ad_set_name.is_(None)
                )
            ).filter(
                or_(
                    Campaign.ad_name == '',
                    Campaign.ad_name.is_(None)
                )
            )
        elif level == 'adset':
            query = query.filter(
                Campaign.ad_set_name != '',
                Campaign.ad_set_name.isnot(None)
            ).filter(
                or_(
                    Campaign.ad_name == '',
                    Campaign.ad_name.is_(None)
                )
            )
        elif level == 'ad':
            query = query.filter(
                Campaign.ad_name != '',
                Campaign.ad_name.isnot(None)
            )
    
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
    
    # Aggregate metrics（16項目すべてを取得）
    result = query.with_entities(
        func.sum(Campaign.impressions).label('total_impressions'),
        func.sum(Campaign.clicks).label('total_clicks'),  # inline_link_clicksを使用
        func.sum(Campaign.cost).label('total_cost'),
        func.sum(Campaign.conversions).label('total_conversions'),
        func.sum(Campaign.conversion_value).label('total_conversion_value'),
        func.sum(Campaign.reach).label('total_reach'),
        func.sum(Campaign.engagements).label('total_engagements'),
        func.sum(Campaign.landing_page_views).label('total_landing_page_views'),
        func.sum(Campaign.link_clicks).label('total_link_clicks')
    ).first()
    
    total_impressions = int(result.total_impressions or 0)
    total_clicks = int(result.total_clicks or 0)  # inline_link_clicks
    total_cost = float(result.total_cost or 0)
    total_conversions = int(result.total_conversions or 0)
    total_conversion_value = float(result.total_conversion_value or 0)
    total_reach = int(result.total_reach or 0)
    total_engagements = int(result.total_engagements or 0)
    total_landing_page_views = int(result.total_landing_page_views or 0)
    total_link_clicks = int(result.total_link_clicks or 0)
    
    # デバッグログ: 集計結果を検証
    print(f"[Summary] Aggregated metrics for period {start_date} to {end_date}:")
    print(f"  Total impressions: {total_impressions}")
    print(f"  Total clicks (inline_link_clicks): {total_clicks}")
    print(f"  Total cost: {total_cost}")
    print(f"  Total conversions: {total_conversions}")
    print(f"  Total conversion_value: {total_conversion_value}")
    print(f"  Total reach: {total_reach}")
    print(f"  Total engagements: {total_engagements}")
    print(f"  Total landing_page_views: {total_landing_page_views}")
    print(f"  Total link_clicks: {total_link_clicks}")
    
    # データレベルの統計を確認
    level_stats_query = query.with_entities(
        func.sum(case((or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)), 1), else_=0)).label('campaign_level'),
        func.sum(case((and_(Campaign.ad_set_name != '', Campaign.ad_set_name.isnot(None), or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))), 1), else_=0)).label('adset_level'),
        func.sum(case((and_(Campaign.ad_name != '', Campaign.ad_name.isnot(None)), 1), else_=0)).label('ad_level')
    ).first()
    print(f"  Data level breakdown: campaign={level_stats_query.campaign_level or 0}, adset={level_stats_query.adset_level or 0}, ad={level_stats_query.ad_level or 0}")
    
    # Calculate averages（Meta広告マネージャの定義に合わせる）
    # CTR = (clicks / impressions) * 100（clicksはinline_link_clicks）
    avg_ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
    # CPC = cost / clicks
    avg_cpc = (total_cost / total_clicks) if total_clicks > 0 else 0
    # CPM = (cost / impressions) * 1000
    avg_cpm = (total_cost / total_impressions * 1000) if total_impressions > 0 else 0
    # CPA = cost / conversions
    avg_cpa = (total_cost / total_conversions) if total_conversions > 0 else 0
    # CVR = (conversions / clicks) * 100
    avg_cvr = (total_conversions / total_clicks * 100) if total_clicks > 0 else 0
    # ROAS = conversion_value / cost（比率、パーセンテージではない）
    avg_roas = (total_conversion_value / total_cost) if total_cost > 0 else 0
    # Frequency = impressions / reach
    avg_frequency = (total_impressions / total_reach) if total_reach > 0 else 0
    # Engagement Rate = (engagements / impressions) * 100
    avg_engagement_rate = (total_engagements / total_impressions * 100) if total_impressions > 0 else 0
    
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
            "conversion_value": round(total_conversion_value, 2),
            "reach": total_reach,
            "engagements": total_engagements,
            "landing_page_views": total_landing_page_views,
            "link_clicks": total_link_clicks
        },
        "averages": {
            "ctr": round(avg_ctr, 2),
            "cpc": round(avg_cpc, 2),
            "cpm": round(avg_cpm, 2),
            "cpa": round(avg_cpa, 2),
            "cvr": round(avg_cvr, 2),
            "roas": round(avg_roas, 2),
            "frequency": round(avg_frequency, 2),
            "engagement_rate": round(avg_engagement_rate, 2)
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
    
    # データの重複排除: キャンペーンレベルのみを使用
    query = query.filter(
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        )
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
        
        # CTR = (clicks / impressions) * 100
        ctr = (clicks / impressions * 100) if impressions > 0 else 0
        # CPC = cost / clicks
        cpc = (cost / clicks) if clicks > 0 else 0
        # CPA = cost / conversions
        cpa = (cost / conversions) if conversions > 0 else 0
        # CVR = (conversions / clicks) * 100
        cvr = (conversions / clicks * 100) if clicks > 0 else 0
        # ROAS = conversion_value / cost（比率、パーセンテージではない）
        roas = (conversion_value / cost) if cost > 0 else 0
        
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
    
    # データの重複排除: キャンペーンレベルのみを使用
    query = query.filter(
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        )
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
    
    # データの重複排除: キャンペーンレベルのみを使用
    query = query.filter(
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        )
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
