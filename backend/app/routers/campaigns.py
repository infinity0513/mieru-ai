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
import httpx
import json

router = APIRouter()

@router.get("/data/")
async def get_campaign_data(
    campaign_name: str = Query(..., description="キャンペーン名"),
    start_date: str = Query(..., description="開始日 (YYYY-MM-DD)"),
    end_date: str = Query(..., description="終了日 (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    シンプルなキャンペーンデータ取得API
    指定されたキャンペーンと期間のデータを取得し、16項目の指標を返す
    """
    # 日付をdateオブジェクトに変換
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="日付形式が正しくありません。YYYY-MM-DD形式で指定してください。")
    
    # シンプルなクエリ: 指定されたキャンペーンと期間のデータを取得（キャンペーンレベルのみ）
    records = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        Campaign.campaign_name == campaign_name,
        Campaign.date >= start,
        Campaign.date <= end,
        # キャンペーンレベルのみ（ad_set_nameとad_nameがNULL）
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).all()
    
    # 合計を計算
    total_impressions = sum(r.impressions or 0 for r in records)
    total_reach = sum(r.reach or 0 for r in records)
    total_clicks = sum(r.clicks or 0 for r in records)
    total_spend = sum(float(r.cost or 0) for r in records)
    total_conversions = sum(r.conversions or 0 for r in records)
    total_conversion_value = sum(float(r.conversion_value or 0) for r in records)
    total_engagements = sum(r.engagements or 0 for r in records)
    total_landing_page_views = sum(r.landing_page_views or 0 for r in records)
    
    # 平均フリークエンシー
    frequencies = [r.frequency or 0 for r in records if r.frequency]
    avg_frequency = sum(frequencies) / len(frequencies) if frequencies else 0
    
    # 計算指標
    ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
    cpc = (total_spend / total_clicks) if total_clicks > 0 else 0
    cpa = (total_spend / total_conversions) if total_conversions > 0 else 0
    cpm = (total_spend / total_impressions * 1000) if total_impressions > 0 else 0
    cvr = (total_conversions / total_clicks * 100) if total_clicks > 0 else 0
    roas = (total_conversion_value / total_spend) if total_spend > 0 else 0
    engagement_rate = (total_engagements / total_impressions * 100) if total_impressions > 0 else 0
    
    return {
        "campaign_name": campaign_name,
        "start_date": start_date,
        "end_date": end_date,
        "impressions": total_impressions,
        "reach": total_reach,
        "frequency": round(avg_frequency, 2),
        "clicks": total_clicks,
        "ctr": round(ctr, 2),
        "cpc": round(cpc, 2),
        "spend": round(total_spend, 2),
        "cpm": round(cpm, 2),
        "conversions": total_conversions,
        "cvr": round(cvr, 2),
        "cpa": round(cpa, 2),
        "conversion_value": round(total_conversion_value, 2),
        "roas": round(roas, 2),
        "engagements": total_engagements,
        "engagement_rate": round(engagement_rate, 2),
        "landing_page_views": total_landing_page_views
    }

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

@router.get("/debug/count-by-level")
def debug_count_by_level(
    meta_account_id: Optional[str] = Query(None, description="Meta広告アカウントIDでフィルタリング"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    デバッグ用: キャンペーン、広告セット、広告のユニークな件数を取得
    """
    base_query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    if meta_account_id:
        base_query = base_query.filter(Campaign.meta_account_id == meta_account_id)
    
    # ユニークなキャンペーン名の件数
    unique_campaigns = base_query.filter(
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).with_entities(Campaign.campaign_name).distinct().all()
    
    # ユニークな広告セット名の件数
    unique_adsets = base_query.filter(
        Campaign.ad_set_name != '',
        Campaign.ad_set_name.isnot(None),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).with_entities(Campaign.campaign_name, Campaign.ad_set_name).distinct().all()
    
    # ユニークな広告名の件数
    unique_ads = base_query.filter(
        Campaign.ad_name != '',
        Campaign.ad_name.isnot(None)
    ).with_entities(Campaign.campaign_name, Campaign.ad_set_name, Campaign.ad_name).distinct().all()
    
    return {
        "meta_account_id": meta_account_id or "all",
        "counts": {
            "campaigns": len(unique_campaigns),
            "adsets": len(unique_adsets),
            "ads": len(unique_ads)
        },
        "campaign_names": [c[0] for c in unique_campaigns],
        "adset_names": [f"{a[0]} > {a[1]}" for a in unique_adsets],
        "ad_names": [f"{a[0]} > {a[1]} > {a[2]}" for a in unique_ads]
    }

@router.get("/debug/campaign-adsets-count")
def debug_campaign_adsets_count(
    meta_account_id: Optional[str] = Query(None, description="Meta広告アカウントIDでフィルタリング"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    デバッグ用: 各キャンペーンごとの広告セット数を取得
    """
    base_query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    if meta_account_id:
        base_query = base_query.filter(Campaign.meta_account_id == meta_account_id)
    
    # ユニークなキャンペーン名を取得（キャンペーンレベルのみ）
    unique_campaigns = base_query.filter(
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).with_entities(Campaign.campaign_name).distinct().all()
    
    result = []
    for campaign_tuple in unique_campaigns:
        campaign_name = campaign_tuple[0]
        
        # このキャンペーンの広告セット数を取得
        # 広告セットレベル: ad_set_nameはあるが、ad_nameは空
        adset_count = base_query.filter(
            Campaign.campaign_name == campaign_name,
            Campaign.ad_set_name != '',
            Campaign.ad_set_name.isnot(None),
            or_(
                Campaign.ad_name == '',
                Campaign.ad_name.is_(None)
            )
        ).with_entities(Campaign.ad_set_name).distinct().count()
        
        # このキャンペーンの広告数を取得
        ad_count = base_query.filter(
            Campaign.campaign_name == campaign_name,
            Campaign.ad_name != '',
            Campaign.ad_name.isnot(None)
        ).with_entities(Campaign.ad_set_name, Campaign.ad_name).distinct().count()
        
        result.append({
            "campaign_name": campaign_name,
            "adset_count": adset_count,
            "ad_count": ad_count
        })
    
    return {
        "meta_account_id": meta_account_id or "all",
        "campaigns": result
    }

@router.get("/debug/campaign-hierarchy")
def debug_campaign_hierarchy(
    campaign_name: Optional[str] = Query(None, description="キャンペーン名でフィルタリング（部分一致）"),
    meta_account_id: Optional[str] = Query(None, description="Meta広告アカウントIDでフィルタリング"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    デバッグ用: 特定のキャンペーンの階層データ（キャンペーン、広告セット、広告）を確認
    """
    base_query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    if meta_account_id:
        base_query = base_query.filter(Campaign.meta_account_id == meta_account_id)
    
    if campaign_name:
        base_query = base_query.filter(Campaign.campaign_name.like(f'%{campaign_name}%'))
    
    # キャンペーンレベルのデータ
    campaign_level = base_query.filter(
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).all()
    
    # 広告セットレベルのデータ
    adset_level = base_query.filter(
        Campaign.ad_set_name != '',
        Campaign.ad_set_name.isnot(None),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).all()
    
    # 広告レベルのデータ
    ad_level = base_query.filter(
        Campaign.ad_name != '',
        Campaign.ad_name.isnot(None)
    ).all()
    
    # ユニークなキャンペーン名、広告セット名、広告名を取得
    unique_campaigns_query = db.query(Campaign.campaign_name).filter(
        Campaign.user_id == current_user.id
    )
    if meta_account_id:
        unique_campaigns_query = unique_campaigns_query.filter(Campaign.meta_account_id == meta_account_id)
    if campaign_name:
        unique_campaigns_query = unique_campaigns_query.filter(Campaign.campaign_name.like(f'%{campaign_name}%'))
    unique_campaigns = unique_campaigns_query.distinct().all()
    
    unique_adsets_query = db.query(Campaign.ad_set_name).filter(
        Campaign.user_id == current_user.id,
        Campaign.ad_set_name != '',
        Campaign.ad_set_name.isnot(None)
    )
    if meta_account_id:
        unique_adsets_query = unique_adsets_query.filter(Campaign.meta_account_id == meta_account_id)
    if campaign_name:
        unique_adsets_query = unique_adsets_query.filter(Campaign.campaign_name.like(f'%{campaign_name}%'))
    unique_adsets = unique_adsets_query.distinct().all()
    
    unique_ads_query = db.query(Campaign.ad_name).filter(
        Campaign.user_id == current_user.id,
        Campaign.ad_name != '',
        Campaign.ad_name.isnot(None)
    )
    if meta_account_id:
        unique_ads_query = unique_ads_query.filter(Campaign.meta_account_id == meta_account_id)
    if campaign_name:
        unique_ads_query = unique_ads_query.filter(Campaign.campaign_name.like(f'%{campaign_name}%'))
    unique_ads = unique_ads_query.distinct().all()
    
    # サンプルデータ（最初の5件）
    sample_campaign = [{
        "id": str(c.id),
        "campaign_name": c.campaign_name,
        "ad_set_name": c.ad_set_name or "",
        "ad_name": c.ad_name or "",
        "date": str(c.date),
        "meta_account_id": c.meta_account_id
    } for c in campaign_level[:5]]
    
    sample_adset = [{
        "id": str(c.id),
        "campaign_name": c.campaign_name,
        "ad_set_name": c.ad_set_name or "",
        "ad_name": c.ad_name or "",
        "date": str(c.date),
        "meta_account_id": c.meta_account_id
    } for c in adset_level[:5]]
    
    sample_ad = [{
        "id": str(c.id),
        "campaign_name": c.campaign_name,
        "ad_set_name": c.ad_set_name or "",
        "ad_name": c.ad_name or "",
        "date": str(c.date),
        "meta_account_id": c.meta_account_id
    } for c in ad_level[:5]]
    
    return {
        "summary": {
            "campaign_level_count": len(campaign_level),
            "adset_level_count": len(adset_level),
            "ad_level_count": len(ad_level),
            "total": len(campaign_level) + len(adset_level) + len(ad_level)
        },
        "unique_names": {
            "campaigns": [c[0] for c in unique_campaigns],
            "adsets": [a[0] for a in unique_adsets if a[0]],
            "ads": [a[0] for a in unique_ads if a[0]]
        },
        "samples": {
            "campaign_level": sample_campaign,
            "adset_level": sample_adset,
            "ad_level": sample_ad
        },
        "filters": {
            "campaign_name": campaign_name,
            "meta_account_id": meta_account_id
        }
    }

@router.get("/debug/data-source")
def debug_data_source(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    詳細パフォーマンス分析に表示されているデータのソースを特定
    """
    # キャンペーンレベルのデータのみを取得（詳細パフォーマンス分析で使用されるデータ）
    campaign_level_query = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    )
    
    # Meta APIデータ（meta_account_idが設定されている）
    meta_api_data = campaign_level_query.filter(
        Campaign.meta_account_id.isnot(None),
        Campaign.meta_account_id != ''
    ).all()
    
    # CSVアップロードデータ（meta_account_idがNULLまたは空）
    csv_data = campaign_level_query.filter(
        or_(
            Campaign.meta_account_id.is_(None),
            Campaign.meta_account_id == ''
        )
    ).all()
    
    # Uploadレコードを取得してfile_nameを確認
    upload_ids = list(set([c.upload_id for c in meta_api_data + csv_data if c.upload_id]))
    uploads_map = {}
    if upload_ids:
        uploads = db.query(Upload).filter(Upload.id.in_(upload_ids)).all()
        uploads_map = {str(u.id): u.file_name for u in uploads}
    
    # Meta APIデータの統計
    meta_api_stats = {
        "count": len(meta_api_data),
        "meta_account_ids": list(set([c.meta_account_id for c in meta_api_data if c.meta_account_id])),
        "upload_file_names": list(set([uploads_map.get(str(c.upload_id), None) for c in meta_api_data if c.upload_id])),
        "sample": [
            {
                "id": str(c.id),
                "campaign_name": c.campaign_name,
                "date": str(c.date),
                "meta_account_id": c.meta_account_id,
                "upload_file_name": uploads_map.get(str(c.upload_id), None),
                "impressions": c.impressions,
                "clicks": c.clicks,
                "cost": float(c.cost) if c.cost else 0
            }
            for c in meta_api_data[:5]
        ]
    }
    
    # CSVデータの統計
    csv_stats = {
        "count": len(csv_data),
        "upload_file_names": list(set([uploads_map.get(str(c.upload_id), None) for c in csv_data if c.upload_id])),
        "sample": [
            {
                "id": str(c.id),
                "campaign_name": c.campaign_name,
                "date": str(c.date),
                "meta_account_id": c.meta_account_id,
                "upload_file_name": uploads_map.get(str(c.upload_id), None),
                "impressions": c.impressions,
                "clicks": c.clicks,
                "cost": float(c.cost) if c.cost else 0
            }
            for c in csv_data[:5]
        ]
    }
    
    # 結論
    if meta_api_stats["count"] > 0 and csv_stats["count"] > 0:
        data_source = "混在（Meta APIデータとCSVアップロードデータの両方）"
    elif meta_api_stats["count"] > 0:
        data_source = "Meta APIから取得したデータ"
    elif csv_stats["count"] > 0:
        data_source = "CSVアップロードしたデータ"
    else:
        data_source = "データなし"
    
    return {
        "data_source": data_source,
        "total_campaign_level_records": len(meta_api_data) + len(csv_data),
        "meta_api_data": meta_api_stats,
        "csv_data": csv_stats
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
    
    # ユニークな日付数を取得
    unique_dates_count = db.query(func.count(func.distinct(Campaign.date))).filter(
        Campaign.user_id == current_user.id
    ).scalar() or 0
    
    # Apply pagination
    campaigns = query.order_by(desc(Campaign.date)).limit(limit).offset(offset).all()
    
    return {
        "total": total,
        "unique_dates_count": unique_dates_count,
        "data": campaigns
    }

@router.get("/date-range/")
def get_date_range(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """データベースに保存されているデータの日付範囲を確認"""
    try:
        from datetime import datetime, timedelta
        
        # 全データの日付範囲
        min_date = db.query(func.min(Campaign.date)).filter(
            Campaign.user_id == current_user.id
        ).scalar()
        max_date = db.query(func.max(Campaign.date)).filter(
            Campaign.user_id == current_user.id
        ).scalar()
        total_count = db.query(Campaign).filter(
            Campaign.user_id == current_user.id
        ).count()
        
        result = {
            "all_data": {
                "min_date": str(min_date) if min_date else None,
                "max_date": str(max_date) if max_date else None,
                "total_count": total_count,
                "days": (max_date - min_date).days + 1 if min_date and max_date else 0
            }
        }
        
        # Meta APIデータの日付範囲
        meta_data = db.query(
            func.min(Campaign.date).label('min_date'),
            func.max(Campaign.date).label('max_date'),
            func.count(Campaign.id).label('count')
        ).filter(
            Campaign.user_id == current_user.id,
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        ).first()
        
        if meta_data and meta_data.count > 0:
            result["meta_api_data"] = {
                "min_date": str(meta_data.min_date),
                "max_date": str(meta_data.max_date),
                "count": meta_data.count,
                "days": (meta_data.max_date - meta_data.min_date).days + 1
            }
        
        # CSVデータの日付範囲
        csv_data = db.query(
            func.min(Campaign.date).label('min_date'),
            func.max(Campaign.date).label('max_date'),
            func.count(Campaign.id).label('count')
        ).filter(
            Campaign.user_id == current_user.id,
            or_(
                Campaign.meta_account_id.is_(None),
                Campaign.meta_account_id == ''
            )
        ).first()
        
        if csv_data and csv_data.count > 0:
            result["csv_data"] = {
                "min_date": str(csv_data.min_date),
                "max_date": str(csv_data.max_date),
                "count": csv_data.count,
                "days": (csv_data.max_date - csv_data.min_date).days + 1
            }
        
        # アカウント別の日付範囲
        accounts = db.query(
            Campaign.meta_account_id,
            func.min(Campaign.date).label('min_date'),
            func.max(Campaign.date).label('max_date'),
            func.count(Campaign.id).label('count')
        ).filter(
            Campaign.user_id == current_user.id,
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        ).group_by(Campaign.meta_account_id).all()
        
        if accounts:
            result["accounts"] = []
            for account in accounts:
                result["accounts"].append({
                    "meta_account_id": account.meta_account_id,
                    "min_date": str(account.min_date),
                    "max_date": str(account.max_date),
                    "count": account.count,
                    "days": (account.max_date - account.min_date).days + 1
                })
        
        # 今日から何日前までのデータがあるか
        today = datetime.now().date()
        if max_date:
            days_from_today = (today - max_date).days
            result["days_from_today"] = days_from_today
        
        # 37ヶ月（1095日）前の日付との比較
        days_37_months = 1095
        date_37_months_ago = today - timedelta(days=days_37_months)
        result["date_37_months_ago"] = str(date_37_months_ago)
        if min_date:
            days_from_37_months = (min_date - date_37_months_ago).days
            result["days_from_37_months"] = days_from_37_months
            result["is_full_period"] = days_from_37_months <= 0
        
        # ユニークな日付数を確認
        unique_dates_count = db.query(func.count(func.distinct(Campaign.date))).filter(
            Campaign.user_id == current_user.id
        ).scalar()
        result["unique_dates_count"] = unique_dates_count
        
        return result
    except Exception as e:
        import traceback
        print(f"[Date Range] Error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"日付範囲取得エラー: {str(e)}")

@router.get("/summary/")
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

@router.get("/trends/")
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

@router.get("/debug/raw-meta-data")
async def get_raw_meta_data(
    meta_account_id: str = Query(..., description="Meta広告アカウントID"),
    campaign_name: Optional[str] = Query(None, description="キャンペーン名（部分一致）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    デバッグ用: Meta APIから直接取得した生データを返す（データベースを経由しない）
    """
    if not current_user.meta_access_token:
        raise HTTPException(status_code=400, detail="Meta APIアクセストークンが設定されていません")
    
    access_token = current_user.meta_access_token
    
    try:
        async with httpx.AsyncClient() as client:
            result = {
                "meta_account_id": meta_account_id,
                "campaigns": [],
                "total_campaigns": 0,
                "total_adsets": 0,
                "total_ads": 0
            }
            
            # キャンペーン一覧を取得
            campaigns_url = f"https://graph.facebook.com/v24.0/{meta_account_id}/campaigns"
            campaigns_params = {
                "access_token": access_token,
                "fields": "id,name,status,objective,created_time,updated_time",
                "limit": 100
            }
            
            all_campaigns = []
            page_count = 0
            while True:
                page_count += 1
                campaigns_response = await client.get(campaigns_url, params=campaigns_params)
                campaigns_response.raise_for_status()
                campaigns_data = campaigns_response.json()
                
                page_campaigns = campaigns_data.get('data', [])
                
                # キャンペーン名でフィルタリング（指定されている場合）
                if campaign_name:
                    page_campaigns = [c for c in page_campaigns if campaign_name.lower() in c.get('name', '').lower()]
                
                all_campaigns.extend(page_campaigns)
                
                paging = campaigns_data.get('paging', {})
                next_url = paging.get('next')
                if not next_url:
                    break
                campaigns_url = next_url
                campaigns_params = {}
            
            result["total_campaigns"] = len(all_campaigns)
            
            # 各キャンペーンの広告セットと広告を取得
            for campaign in all_campaigns:
                campaign_id = campaign['id']
                campaign_name_val = campaign.get('name', 'Unknown')
                
                campaign_data = {
                    "id": campaign_id,
                    "name": campaign_name_val,
                    "status": campaign.get('status', 'Unknown'),
                    "adsets": [],
                    "total_adsets": 0,
                    "total_ads": 0
                }
                
                # 広告セットを取得
                adsets_url = f"https://graph.facebook.com/v24.0/{campaign_id}/adsets"
                adsets_params = {
                    "access_token": access_token,
                    "fields": "id,name,campaign_id,status,effective_status",
                    "limit": 100
                }
                
                all_adsets = []
                while True:
                    adsets_response = await client.get(adsets_url, params=adsets_params)
                    adsets_response.raise_for_status()
                    adsets_data = adsets_response.json()
                    
                    page_adsets = adsets_data.get('data', [])
                    all_adsets.extend(page_adsets)
                    
                    paging = adsets_data.get('paging', {})
                    next_url = paging.get('next')
                    if not next_url:
                        break
                    adsets_url = next_url
                    adsets_params = {}
                
                campaign_data["total_adsets"] = len(all_adsets)
                result["total_adsets"] += len(all_adsets)
                
                # 各広告セットの広告を取得
                for adset in all_adsets:
                    adset_id = adset['id']
                    adset_name = adset.get('name', 'Unknown')
                    
                    adset_data = {
                        "id": adset_id,
                        "name": adset_name,
                        "status": adset.get('status', 'Unknown'),
                        "effective_status": adset.get('effective_status', 'Unknown'),
                        "ads": [],
                        "total_ads": 0
                    }
                    
                    # 広告を取得
                    ads_url = f"https://graph.facebook.com/v24.0/{adset_id}/ads"
                    ads_params = {
                        "access_token": access_token,
                        "fields": "id,name,adset_id,campaign_id,status,effective_status",
                        "limit": 100
                    }
                    
                    all_ads = []
                    while True:
                        ads_response = await client.get(ads_url, params=ads_params)
                        ads_response.raise_for_status()
                        ads_data = ads_response.json()
                        
                        page_ads = ads_data.get('data', [])
                        all_ads.extend(page_ads)
                        
                        paging = ads_data.get('paging', {})
                        next_url = paging.get('next')
                        if not next_url:
                            break
                        ads_url = next_url
                        ads_params = {}
                    
                    adset_data["total_ads"] = len(all_ads)
                    adset_data["ads"] = all_ads[:10]  # 最初の10件のみ返す
                    campaign_data["total_ads"] += len(all_ads)
                    result["total_ads"] += len(all_ads)
                    
                    campaign_data["adsets"].append(adset_data)
                
                result["campaigns"].append(campaign_data)
            
            return result
            
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Meta API error: {e.response.text[:500]}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching raw Meta data: {str(e)}"
        )
