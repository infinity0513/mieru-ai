"""
データソースを特定するためのデバッグエンドポイント
Meta APIから取得したデータとCSVアップロードしたデータを区別する
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import Optional
from ..database import get_db
from ..models.campaign import Campaign, Upload
from ..utils.dependencies import get_current_user
from ..models.user import User

router = APIRouter()

@router.get("/data-source-analysis")
def analyze_data_source(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    データソースを分析: Meta APIから取得したデータとCSVアップロードしたデータを区別
    """
    # 1. 全データの統計
    total_records = db.query(Campaign).filter(
        Campaign.user_id == current_user.id
    ).count()
    
    # 2. Meta APIから取得したデータ（meta_account_idが設定されている）
    meta_api_records = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        Campaign.meta_account_id.isnot(None),
        Campaign.meta_account_id != ''
    ).count()
    
    # 3. CSVアップロードしたデータ（meta_account_idがNULLまたは空）
    csv_records = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        or_(
            Campaign.meta_account_id.is_(None),
            Campaign.meta_account_id == ''
        )
    ).count()
    
    # 4. Uploadレコードからデータソースを確認
    uploads = db.query(Upload).filter(
        Upload.user_id == current_user.id
    ).order_by(Upload.created_at.desc()).all()
    
    upload_analysis = []
    for upload in uploads:
        # このUploadに関連するCampaignレコード数
        campaign_count = db.query(Campaign).filter(
            Campaign.upload_id == upload.id
        ).count()
        
        # このUploadに関連するCampaignレコードのmeta_account_idの有無
        with_meta_account = db.query(Campaign).filter(
            Campaign.upload_id == upload.id,
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        ).count()
        
        upload_analysis.append({
            "upload_id": str(upload.id),
            "file_name": upload.file_name,
            "status": upload.status,
            "row_count": upload.row_count,
            "created_at": str(upload.created_at),
            "start_date": str(upload.start_date) if upload.start_date else None,
            "end_date": str(upload.end_date) if upload.end_date else None,
            "campaign_count": campaign_count,
            "with_meta_account_id": with_meta_account,
            "without_meta_account_id": campaign_count - with_meta_account,
            "data_source": "Meta API" if upload.file_name == "Meta API Sync" else "CSV Upload"
        })
    
    # 5. キャンペーンレベルのデータのみを分析
    campaign_level_total = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).count()
    
    campaign_level_meta_api = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        Campaign.meta_account_id.isnot(None),
        Campaign.meta_account_id != '',
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).count()
    
    campaign_level_csv = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        or_(
            Campaign.meta_account_id.is_(None),
            Campaign.meta_account_id == ''
        ),
        or_(
            Campaign.ad_set_name == '',
            Campaign.ad_set_name.is_(None)
        ),
        or_(
            Campaign.ad_name == '',
            Campaign.ad_name.is_(None)
        )
    ).count()
    
    # 6. 各meta_account_idごとのデータ数
    meta_account_stats = db.query(
        Campaign.meta_account_id,
        func.count().label('count')
    ).filter(
        Campaign.user_id == current_user.id,
        Campaign.meta_account_id.isnot(None),
        Campaign.meta_account_id != ''
    ).group_by(Campaign.meta_account_id).all()
    
    # 7. サンプルデータ（最初の10件）
    sample_meta_api = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        Campaign.meta_account_id.isnot(None),
        Campaign.meta_account_id != ''
    ).order_by(Campaign.created_at.desc()).limit(10).all()
    
    sample_csv = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        or_(
            Campaign.meta_account_id.is_(None),
            Campaign.meta_account_id == ''
        )
    ).order_by(Campaign.created_at.desc()).limit(10).all()
    
    return {
        "summary": {
            "total_records": total_records,
            "meta_api_records": meta_api_records,
            "csv_records": csv_records,
            "campaign_level_total": campaign_level_total,
            "campaign_level_meta_api": campaign_level_meta_api,
            "campaign_level_csv": campaign_level_csv
        },
        "upload_analysis": upload_analysis,
        "meta_account_stats": [
            {
                "meta_account_id": stat.meta_account_id,
                "count": stat.count
            }
            for stat in meta_account_stats
        ],
        "sample_meta_api": [
            {
                "id": str(c.id),
                "upload_id": str(c.upload_id),
                "meta_account_id": c.meta_account_id,
                "campaign_name": c.campaign_name,
                "date": str(c.date),
                "ad_set_name": c.ad_set_name,
                "ad_name": c.ad_name,
                "created_at": str(c.created_at),
                "impressions": c.impressions,
                "clicks": c.clicks,
                "cost": float(c.cost) if c.cost else 0
            }
            for c in sample_meta_api
        ],
        "sample_csv": [
            {
                "id": str(c.id),
                "upload_id": str(c.upload_id),
                "meta_account_id": c.meta_account_id,
                "campaign_name": c.campaign_name,
                "date": str(c.date),
                "ad_set_name": c.ad_set_name,
                "ad_name": c.ad_name,
                "created_at": str(c.created_at),
                "impressions": c.impressions,
                "clicks": c.clicks,
                "cost": float(c.cost) if c.cost else 0
            }
            for c in sample_csv
        ]
    }

