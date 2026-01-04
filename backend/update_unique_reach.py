#!/usr/bin/env python3
import os
import sys
import asyncio
import httpx
import json
from datetime import datetime

# カレントディレクトリをPYTHONPATHに追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.campaign import Campaign
from app.core.config import settings
from sqlalchemy import func

async def update_period_unique_reach():
    db = SessionLocal()
    
    try:
        # キャンペーンごとにcampaign_idと日付範囲を取得
        campaigns = db.query(
            Campaign.campaign_name,
            Campaign.campaign_id,
            func.min(Campaign.date).label('start_date'),
            func.max(Campaign.date).label('end_date')
        ).filter(
            Campaign.campaign_name.isnot(None),
            Campaign.campaign_id.isnot(None)
        ).group_by(
            Campaign.campaign_name,
            Campaign.campaign_id
        ).all()
        
        print(f"\n{'='*80}")
        print(f"Meta APIから全キャンペーンのユニークリーチを取得します")
        print(f"{'='*80}\n")
        print(f"対象キャンペーン数: {len(campaigns)}\n")
        
        success_count = 0
        error_count = 0
        
        for i, camp in enumerate(campaigns, 1):
            campaign_name = camp.campaign_name
            campaign_id = camp.campaign_id
            start_date = camp.start_date.strftime("%Y-%m-%d")
            end_date = camp.end_date.strftime("%Y-%m-%d")
            
            print(f"[{i}/{len(campaigns)}] {campaign_name}")
            print(f"  Campaign ID: {campaign_id}")
            print(f"  期間: {start_date} ~ {end_date}")
            
            # Meta Graph APIを呼び出し
            url = f"https://graph.facebook.com/v18.0/{campaign_id}/insights"
            params = {
                "access_token": settings.META_ACCESS_TOKEN,
                "fields": "reach",
                "time_range": json.dumps({
                    "since": start_date,
                    "until": end_date
                })
            }
            
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(url, params=params, timeout=30.0)
                    response.raise_for_status()
                    data = response.json()
                    
                    if "data" in data and len(data["data"]) > 0:
                        unique_reach = data["data"][0].get("reach", 0)
                        print(f"  ✅ Meta API unique reach: {unique_reach:,}人")
                        
                        # データベースを更新
                        updated = db.query(Campaign).filter(
                            Campaign.campaign_name == campaign_name,
                            Campaign.campaign_id == campaign_id
                        ).update({
                            "period_unique_reach": unique_reach
                        }, synchronize_session=False)
                        
                        db.commit()
                        print(f"  ✅ {updated}件のレコードを更新しました")
                        success_count += 1
                    else:
                        print(f"  ⚠️ Meta APIからデータが返されませんでした")
                        error_count += 1
                        
            except httpx.HTTPStatusError as e:
                print(f"  ❌ HTTPエラー: {e.response.status_code}")
                error_count += 1
            except Exception as e:
                print(f"  ❌ エラー: {e}")
                error_count += 1
            
            print()
        
        print(f"{'='*80}")
        print(f"✅ 更新完了")
        print(f"  成功: {success_count}キャンペーン")
        print(f"  失敗: {error_count}キャンペーン")
        print(f"{'='*80}\n")
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(update_period_unique_reach())
