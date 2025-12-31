#!/usr/bin/env python3
"""
バックグラウンドタスクの実行状況を確認するスクリプト
データベースから最近のデータ取得記録を確認
"""
import os
import sys

# 仮想環境のパスを追加
venv_path = os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.14', 'site-packages')
if os.path.exists(venv_path):
    sys.path.insert(0, venv_path)

from dotenv import load_dotenv
load_dotenv()

from datetime import datetime, timedelta
from sqlalchemy import create_engine, func, distinct
from sqlalchemy.orm import sessionmaker
from app.models.user import User
from app.models.campaign import Campaign, Upload

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL not found in .env")
    sys.exit(1)

# データベース接続
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

try:
    print("=" * 80)
    print("バックグラウンドタスクの実行状況確認")
    print("=" * 80)
    print()
    
    # 1. 最近のUploadレコード（Meta API同期）を確認
    print("1. 最近のMeta API同期記録（Uploadレコード）:")
    print("-" * 80)
    recent_uploads = db.query(Upload).filter(
        Upload.file_name == "Meta API Sync"
    ).order_by(Upload.created_at.desc()).limit(10).all()
    
    if not recent_uploads:
        print("  ⚠️ Meta API同期の記録が見つかりませんでした。")
        print("  バックグラウンドタスクが実行されていない可能性があります。")
    else:
        print(f"  最近の同期記録: {len(recent_uploads)}件")
        for upload in recent_uploads:
            print(f"  - Upload ID: {upload.id}")
            print(f"    作成日時: {upload.created_at}")
            print(f"    ステータス: {upload.status}")
            print(f"    データ件数: {upload.row_count}件")
            if upload.start_date and upload.end_date:
                print(f"    日付範囲: {upload.start_date} ～ {upload.end_date}")
                days = (upload.end_date - upload.start_date).days + 1
                print(f"    日数: {days}日")
            print()
    
    print()
    print("=" * 80)
    print("2. 各アセットのデータ取得状況:")
    print("-" * 80)
    
    users_with_meta = db.query(User).filter(
        User.meta_account_id.isnot(None),
        User.meta_access_token.isnot(None)
    ).all()
    
    for user in users_with_meta:
        print(f"\nユーザー: {user.email} (ID: {user.id})")
        print(f"Meta Account ID: {user.meta_account_id}")
        print()
        
        # データベースに保存されているアセット（meta_account_id）一覧
        accounts_in_db = db.query(
            Campaign.meta_account_id,
            func.count(Campaign.id).label('count'),
            func.min(Campaign.date).label('min_date'),
            func.max(Campaign.date).label('max_date'),
            func.count(distinct(Campaign.date)).label('unique_dates')
        ).filter(
            Campaign.user_id == user.id,
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        ).group_by(Campaign.meta_account_id).all()
        
        if not accounts_in_db:
            print("  ⚠️ データベースにアセットデータが見つかりませんでした。")
            print("  バックグラウンドタスクが実行されていないか、エラーが発生した可能性があります。")
        else:
            print(f"  データベースに保存されているアセット数: {len(accounts_in_db)}")
            for idx, account in enumerate(accounts_in_db, 1):
                print(f"  [{idx}] アセットID: {account.meta_account_id}")
                print(f"      データ件数: {account.count:,}件")
                print(f"      日付範囲: {account.min_date} ～ {account.max_date}")
                print(f"      ユニークな日付数: {account.unique_dates}日")
                
                # 日数範囲を計算
                if account.min_date and account.max_date:
                    days = (account.max_date - account.min_date).days + 1
                    print(f"      日数範囲: {days}日")
                    
                    # 全期間（37ヶ月 = 1095日）と比較
                    if days < 100:
                        print(f"      ⚠️ 警告: データが{days}日分しかありません。全期間（37ヶ月 = 1095日）のデータが取得されていない可能性があります。")
                    elif days >= 1000:
                        print(f"      ✓ 全期間のデータが取得されている可能性があります。")
                print()
    
    print()
    print("=" * 80)
    print("3. 最近のデータ取得記録（過去24時間）:")
    print("-" * 80)
    
    twenty_four_hours_ago = datetime.now() - timedelta(hours=24)
    
    for user in users_with_meta:
        print(f"\nユーザー: {user.email}")
        
        # 過去24時間に取得されたデータ
        recent_campaigns = db.query(Campaign).filter(
            Campaign.user_id == user.id,
            Campaign.meta_account_id.isnot(None),
            Campaign.created_at >= twenty_four_hours_ago
        ).order_by(Campaign.created_at.desc()).limit(20).all()
        
        if not recent_campaigns:
            print("  ⚠️ 過去24時間にデータ取得記録がありません。")
            print("  バックグラウンドタスクが実行されていない可能性があります。")
        else:
            print(f"  過去24時間のデータ取得記録: {len(recent_campaigns)}件")
            for campaign in recent_campaigns[:5]:  # 最新5件のみ表示
                print(f"    - 日付: {campaign.date}, アセットID: {campaign.meta_account_id}, "
                      f"キャンペーン: {campaign.campaign_name}, 作成日時: {campaign.created_at}")
    
    print()
    print("=" * 80)
    print("確認完了")
    print("=" * 80)
    print()
    print("【確認ポイント】")
    print("1. Uploadレコード（Meta API同期）が存在するか")
    print("2. 各アセットのデータが全期間（37ヶ月 = 1095日）取得されているか")
    print("3. 最近のデータ取得記録があるか")
    print()
    print("【問題が確認された場合】")
    print("- バックエンドサーバーのログ（標準出力）を確認してください。")
    print("- 以下のログメッセージが出力されているか確認：")
    print("  - [Meta OAuth] Background sync: Task started")
    print("  - [Meta OAuth] Background sync: Accounts to sync: {len(accounts_for_background)}")
    print("  - [Meta OAuth] Background sync: Syncing account {idx + 1}/{len(accounts_for_background)}")
    print("  - [Meta API] Full period sync: {since} to {until} (max 1095 days / 37 months)")
    print("  - [Meta API] Saved {saved_count} campaign-level records")

except Exception as e:
    import traceback
    print(f"Error: {str(e)}")
    print(traceback.format_exc())
finally:
    db.close()

