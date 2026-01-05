#!/usr/bin/env python3
"""
Meta APIから取得した値とデータベースに保存されている値を比較するスクリプト
実際のMeta APIを呼び出すのではなく、データベースの値を確認
"""
import sys
import os

# プロジェクトルートをパスに追加
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from app.database import get_db
from app.models.campaign import Campaign
from sqlalchemy import func, distinct, or_, desc

def main():
    db = next(get_db())
    
    campaign_name = "ハイブリッドマーケティング"
    
    # 最新のレコードを取得
    latest_campaign = db.query(Campaign).filter(
        Campaign.campaign_name == campaign_name,
        or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
        or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
    ).order_by(desc(Campaign.date)).first()
    
    print('=' * 80)
    print(f'「{campaign_name}」のMeta APIレスポンス確認')
    print('=' * 80)
    
    if not latest_campaign:
        print('データが見つかりませんでした。')
        return
    
    print(f'\n最新レコード:')
    print(f'  日付: {latest_campaign.date}')
    print(f'  作成日時: {latest_campaign.created_at}')
    print(f'  Meta Account ID: {latest_campaign.meta_account_id}')
    
    print(f'\nデータベースに保存されている値:')
    print(f'  period_unique_reach_all: {latest_campaign.period_unique_reach_all or 0:,}')
    print(f'  period_unique_reach (後方互換): {latest_campaign.period_unique_reach or 0:,}')
    print(f'  period_unique_reach_30days: {latest_campaign.period_unique_reach_30days or 0:,}')
    print(f'  period_unique_reach_7days: {latest_campaign.period_unique_reach_7days or 0:,}')
    print(f'  日次リーチ (reach): {latest_campaign.reach or 0:,}')
    
    print(f'\n期待値:')
    print(f'  period_unique_reach_all: 1,157 (ユーザーが言う正確な値)')
    print(f'  実際の値: {latest_campaign.period_unique_reach_all or 0:,}')
    print(f'  差分: {(latest_campaign.period_unique_reach_all or 0) - 1157:,} ({(latest_campaign.period_unique_reach_all or 0) - 1157})')
    
    print(f'\n確認事項:')
    print(f'  1. バックエンドのコンソール出力に以下のデバッグログが出力されているか確認:')
    print(f'     - [Meta API] 🔍 DEBUG: Time range for \'all\' period:')
    print(f'     - [Meta API] 🔍 DEBUG: Request URL for ハイブリッドマーケティング (all):')
    print(f'     - [Meta API] 🔍 DEBUG: Full response data for ハイブリッドマーケティング (all):')
    print(f'  2. Meta APIから実際に返ってきた値（Raw insight_data）を確認')
    print(f'  3. time_rangeが正しく計算されているか確認')

if __name__ == '__main__':
    main()

