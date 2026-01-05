#!/usr/bin/env python3
"""
「ハイブリッドマーケティング」の7日間と30日間のリーチデータを確認するスクリプト
"""
import sys
import os

# プロジェクトルートをパスに追加
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from app.database import get_db
from app.models.campaign import Campaign
from sqlalchemy import func, distinct, or_

def main():
    db = next(get_db())
    
    campaign_name = "ハイブリッドマーケティング"
    
    # キャンペーンレベルのデータのみを取得（ad_set_nameとad_nameが空）
    campaigns = db.query(Campaign).filter(
        Campaign.campaign_name == campaign_name,
        or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
        or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
    ).order_by(Campaign.date.desc()).all()
    
    print('=' * 80)
    print(f'「{campaign_name}」のリーチデータ')
    print('=' * 80)
    print(f'総レコード数: {len(campaigns)}件')
    print()
    
    if len(campaigns) == 0:
        print('データが見つかりませんでした。')
        return
    
    # 最新のレコードを表示
    print('最新のレコード（最新日付順）:')
    print('-' * 80)
    for i, c in enumerate(campaigns[:10], 1):  # 最新10件を表示
        print(f'\n[{i}] 日付: {c.date}')
        print(f'    Meta Account ID: {c.meta_account_id}')
        print(f'    日次リーチ (reach): {c.reach or 0:,}')
        print(f'    期間ユニークリーチ (period_unique_reach): {c.period_unique_reach or 0:,}')
        print(f'    7日間ユニークリーチ (period_unique_reach_7days): {c.period_unique_reach_7days or 0:,}')
        print(f'    30日間ユニークリーチ (period_unique_reach_30days): {c.period_unique_reach_30days or 0:,}')
        print(f'    全期間ユニークリーチ (period_unique_reach_all): {c.period_unique_reach_all or 0:,}')
        print(f'    インプレッション: {c.impressions or 0:,}')
        print(f'    クリック: {c.clicks or 0:,}')
        print(f'    費用: ¥{float(c.cost or 0):,.2f}')
    
    # 7日間と30日間のデータを集計
    print('\n' + '=' * 80)
    print('7日間と30日間のリーチデータ（最新日付のレコードから）')
    print('=' * 80)
    
    if campaigns:
        latest = campaigns[0]  # 最新のレコード
        print(f'\n最新日付: {latest.date}')
        print(f'Meta Account ID: {latest.meta_account_id}')
        print(f'\n7日間のユニークリーチ: {latest.period_unique_reach_7days or 0:,}')
        print(f'30日間のユニークリーチ: {latest.period_unique_reach_30days or 0:,}')
        print(f'全期間のユニークリーチ: {latest.period_unique_reach_all or 0:,}')
        print(f'期間ユニークリーチ（後方互換）: {latest.period_unique_reach or 0:,}')
    
    # 全レコードの7日間と30日間のデータを確認
    print('\n' + '=' * 80)
    print('全レコードの7日間と30日間のリーチデータ')
    print('=' * 80)
    
    for i, c in enumerate(campaigns, 1):
        print(f'\n[{i}] 日付: {c.date}')
        print(f'    7日間ユニークリーチ: {c.period_unique_reach_7days or 0:,}')
        print(f'    30日間ユニークリーチ: {c.period_unique_reach_30days or 0:,}')
        print(f'    全期間ユニークリーチ: {c.period_unique_reach_all or 0:,}')

if __name__ == '__main__':
    main()

