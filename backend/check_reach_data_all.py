#!/usr/bin/env python3
"""
データベースに保存されている各キャンペーンのリーチ数を確認するスクリプト
"""
import sys
import os

# プロジェクトルートをパスに追加
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from app.database import get_db
from app.models.campaign import Campaign
from sqlalchemy import func, distinct, or_
from collections import defaultdict

def main():
    db = next(get_db())
    
    # キャンペーンレベルのデータのみを取得（ad_set_nameとad_nameが空）
    campaigns = db.query(Campaign).filter(
        or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
        or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
    ).order_by(Campaign.campaign_name, Campaign.date.desc()).all()
    
    # キャンペーンごとに最新の日付のデータを取得
    campaign_data = {}
    for c in campaigns:
        key = c.campaign_name
        if key not in campaign_data:
            campaign_data[key] = {
                'campaign_name': c.campaign_name,
                'meta_account_id': c.meta_account_id,
                'date': str(c.date),
                'reach': c.reach or 0,
                'period_unique_reach': c.period_unique_reach or 0,
                'impressions': c.impressions or 0,
                'clicks': c.clicks or 0,
                'cost': float(c.cost or 0)
            }
        else:
            # より新しい日付のデータがあれば更新
            if c.date > campaign_data[key]['date']:
                campaign_data[key].update({
                    'date': str(c.date),
                    'reach': c.reach or 0,
                    'period_unique_reach': c.period_unique_reach or 0,
                    'impressions': c.impressions or 0,
                    'clicks': c.clicks or 0,
                    'cost': float(c.cost or 0)
                })
    
    print('=' * 80)
    print('データベースに保存されている各キャンペーンのリーチ数')
    print('=' * 80)
    print(f'総キャンペーン数: {len(campaign_data)}')
    print()
    
    for campaign_name, data in sorted(campaign_data.items()):
        print(f'キャンペーン名: {campaign_name}')
        print(f'  Meta Account ID: {data["meta_account_id"]}')
        print(f'  最新日付: {data["date"]}')
        print(f'  日次リーチ (reach): {data["reach"]:,}')
        print(f'  期間ユニークリーチ (period_unique_reach): {data["period_unique_reach"]:,}')
        print(f'  インプレッション: {data["impressions"]:,}')
        print(f'  クリック: {data["clicks"]:,}')
        print(f'  費用: ¥{data["cost"]:,.2f}')
        print()
    
    # 各キャンペーンの全期間データも確認
    print('=' * 80)
    print('各キャンペーンの全期間データ（日付別）')
    print('=' * 80)
    for campaign_name in sorted(campaign_data.keys()):
        campaign_records = db.query(Campaign).filter(
            Campaign.campaign_name == campaign_name,
            or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
            or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
        ).order_by(Campaign.date).all()
        
        print(f'\nキャンペーン名: {campaign_name}')
        print(f'  レコード数: {len(campaign_records)}件')
        for record in campaign_records:
            print(f'    {record.date}: reach={record.reach or 0:,}, period_unique_reach={record.period_unique_reach or 0:,}, impressions={record.impressions or 0:,}')

if __name__ == '__main__':
    main()

