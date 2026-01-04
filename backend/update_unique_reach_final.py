#!/usr/bin/env python3
"""
全キャンペーンのperiod_unique_reachをMeta APIから取得して更新するスクリプト
実行方法: cd backend && source venv/bin/activate && python3 update_unique_reach_final.py
"""
import sys
import os
import asyncio
import httpx
import json

# .envファイルを読み込む
def load_env_file():
    """Load environment variables from .env file"""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")

load_env_file()

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ DATABASE_URL が設定されていません")
    sys.exit(1)

# Meta APIアクセストークン
META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN")
if not META_ACCESS_TOKEN:
    print("❌ META_ACCESS_TOKEN が設定されていません")
    sys.exit(1)

# SQLAlchemyのセットアップ
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Campaignモデルの簡易版（必要な部分のみ）
from sqlalchemy import Column, Integer, String, Date, Float, Boolean, BigInteger

class Campaign(Base):
    __tablename__ = "campaigns"
    
    id = Column(Integer, primary_key=True, index=True)
    campaign_name = Column(String, index=True)
    campaign_id = Column(String, index=True)
    date = Column(Date, index=True)
    reach = Column(Integer, default=0)
    period_unique_reach = Column(Integer, default=0)

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
                "access_token": META_ACCESS_TOKEN,
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
                        print(f"     レスポンス: {data}")
                        error_count += 1
                        
            except httpx.HTTPStatusError as e:
                print(f"  ❌ HTTPエラー: {e.response.status_code}")
                try:
                    error_data = e.response.json()
                    print(f"     エラー詳細: {error_data}")
                except:
                    print(f"     レスポンス: {e.response.text[:200]}")
                error_count += 1
            except Exception as e:
                print(f"  ❌ エラー: {type(e).__name__}: {e}")
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
    print("\n[1/2] 環境変数とデータベース接続を確認中...")
    print(f"  DATABASE_URL: {DATABASE_URL[:30]}...")
    print(f"  META_ACCESS_TOKEN: {'設定済み' if META_ACCESS_TOKEN else '未設定'}")
    print("\n[2/2] Meta APIからユニークリーチを取得します...\n")
    
    asyncio.run(update_period_unique_reach())
