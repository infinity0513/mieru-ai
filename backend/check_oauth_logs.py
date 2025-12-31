#!/usr/bin/env python3
"""
OAuth認証時のログを確認するスクリプト
データベースから最近のOAuth認証記録とアカウント情報を確認
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
from app.models.campaign import Campaign

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL not found in environment variables")
    sys.exit(1)

# データベース接続
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

try:
    print("=" * 80)
    print("OAuth認証時のログ確認")
    print("=" * 80)
    print()
    
    # 1. 最近のOAuth認証記録（ユーザーのmeta_account_idとmeta_access_tokenが設定されているユーザー）
    print("1. Meta OAuth認証済みユーザー一覧:")
    print("-" * 80)
    users_with_meta = db.query(User).filter(
        User.meta_account_id.isnot(None),
        User.meta_access_token.isnot(None)
    ).all()
    
    if not users_with_meta:
        print("  OAuth認証済みユーザーが見つかりませんでした。")
    else:
        for user in users_with_meta:
            print(f"  ユーザーID: {user.id}")
            print(f"  メールアドレス: {user.email}")
            print(f"  Meta Account ID: {user.meta_account_id}")
            print(f"  Access Token設定: {'あり' if user.meta_access_token else 'なし'}")
            print(f"  作成日時: {user.created_at}")
            print(f"  更新日時: {user.updated_at}")
            print()
    
    print()
    print("=" * 80)
    print("2. 各ユーザーのアセット（Meta Account）別データ取得状況:")
    print("-" * 80)
    
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
                print()
    
    print()
    print("=" * 80)
    print("3. 最近のデータ取得状況（過去7日間）:")
    print("-" * 80)
    
    seven_days_ago = datetime.now() - timedelta(days=7)
    
    for user in users_with_meta:
        print(f"\nユーザー: {user.email}")
        
        # 過去7日間に取得されたデータ
        recent_campaigns = db.query(Campaign).filter(
            Campaign.user_id == user.id,
            Campaign.meta_account_id.isnot(None),
            Campaign.upload_id.isnot(None)
        ).order_by(Campaign.created_at.desc()).limit(10).all()
        
        if not recent_campaigns:
            print("  ⚠️ 最近のデータ取得記録が見つかりませんでした。")
        else:
            print(f"  最近のデータ取得記録（最新10件）:")
            for campaign in recent_campaigns:
                print(f"    - 日付: {campaign.date}, アセットID: {campaign.meta_account_id}, "
                      f"キャンペーン: {campaign.campaign_name}, 作成日時: {campaign.created_at}")
    
    print()
    print("=" * 80)
    print("4. アセット別のデータ件数サマリー:")
    print("-" * 80)
    
    for user in users_with_meta:
        print(f"\nユーザー: {user.email}")
        
        # アセット別のデータ件数
        account_stats = db.query(
            Campaign.meta_account_id,
            func.count(Campaign.id).label('total_count'),
            func.count(distinct(Campaign.campaign_name)).label('campaign_count'),
            func.min(Campaign.date).label('min_date'),
            func.max(Campaign.date).label('max_date')
        ).filter(
            Campaign.user_id == user.id,
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        ).group_by(Campaign.meta_account_id).all()
        
        if not account_stats:
            print("  ⚠️ アセットデータが見つかりませんでした。")
        else:
            print(f"  アセット数: {len(account_stats)}")
            for stat in account_stats:
                print(f"  - アセットID: {stat.meta_account_id}")
                print(f"    総データ件数: {stat.total_count:,}件")
                print(f"    キャンペーン数: {stat.campaign_count}件")
                print(f"    日付範囲: {stat.min_date} ～ {stat.max_date}")
                print()
    
    print()
    print("=" * 80)
    print("確認完了")
    print("=" * 80)
    print()
    print("【確認ポイント】")
    print("1. OAuth認証済みユーザーが存在するか")
    print("2. データベースに保存されているアセット数が、実際のMeta広告アカウント数と一致しているか")
    print("3. 各アセットのデータが正しく取得されているか（日付範囲、データ件数）")
    print("4. 最近のデータ取得記録があるか")
    print()
    print("【注意】")
    print("- バックエンドサーバーのログ（標準出力）も確認してください。")
    print("- ログには以下のメッセージが出力されるはずです：")
    print("  - [Meta OAuth] ===== ACCOUNTS RETRIEVED =====")
    print("  - [Meta OAuth] Found {len(accounts)} ad account(s)")
    print("  - [Meta OAuth] Background sync: Accounts to sync: {len(accounts_for_background)}")
    print("  - [Meta OAuth] Background sync: Syncing account {idx + 1}/{len(accounts_for_background)}")

except Exception as e:
    import traceback
    print(f"Error: {str(e)}")
    print(traceback.format_exc())
finally:
    db.close()

