#!/usr/bin/env python3
"""
最新のMeta API同期時のログを確認するスクリプト
データベースから最新の更新日時を確認
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
    
    # 最新の更新日時を確認
    latest_campaign = db.query(Campaign).filter(
        Campaign.campaign_name == campaign_name,
        or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
        or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
    ).order_by(desc(Campaign.created_at)).first()
    
    if latest_campaign:
        print('=' * 80)
        print(f'「{campaign_name}」の最新データ')
        print('=' * 80)
        print(f'最新のレコード作成日時: {latest_campaign.created_at}')
        print(f'日付: {latest_campaign.date}')
        print(f'Meta Account ID: {latest_campaign.meta_account_id}')
        print(f'\n保存されている値:')
        print(f'  period_unique_reach_all: {latest_campaign.period_unique_reach_all or 0:,}')
        print(f'  period_unique_reach (後方互換): {latest_campaign.period_unique_reach or 0:,}')
        print(f'  period_unique_reach_30days: {latest_campaign.period_unique_reach_30days or 0:,}')
        print(f'  period_unique_reach_7days: {latest_campaign.period_unique_reach_7days or 0:,}')
        print(f'  日次リーチ (reach): {latest_campaign.reach or 0:,}')
        
        # 全レコードの更新状況を確認
        all_campaigns = db.query(Campaign).filter(
            Campaign.campaign_name == campaign_name,
            or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
            or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
        ).order_by(desc(Campaign.created_at)).all()
        
        print(f'\n全レコードの作成日時:')
        for i, c in enumerate(all_campaigns, 1):
            print(f'  [{i}] {c.date}: created_at={c.created_at}, period_unique_reach_all={c.period_unique_reach_all or 0:,}')
    else:
        print('データが見つかりませんでした。')

if __name__ == '__main__':
    main()

