#!/usr/bin/env python3
"""
Meta APIから取得した全期間のユニークリーチ値が正しいか確認するスクリプト
実際のMeta APIを呼び出して確認（実際には呼び出さず、ログを確認）
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
    
    # キャンペーンレベルのデータのみを取得
    campaigns = db.query(Campaign).filter(
        Campaign.campaign_name == campaign_name,
        or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
        or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
    ).order_by(Campaign.date.desc()).all()
    
    print('=' * 80)
    print(f'「{campaign_name}」の全期間ユニークリーチ値の確認')
    print('=' * 80)
    
    if len(campaigns) == 0:
        print('データが見つかりませんでした。')
        return
    
    # 最新のレコードを表示
    latest = campaigns[0]
    print(f'\n最新日付: {latest.date}')
    print(f'Meta Account ID: {latest.meta_account_id}')
    print(f'\n保存されている値:')
    print(f'  period_unique_reach_all: {latest.period_unique_reach_all or 0:,}')
    print(f'  period_unique_reach (後方互換): {latest.period_unique_reach or 0:,}')
    print(f'  period_unique_reach_30days: {latest.period_unique_reach_30days or 0:,}')
    print(f'  period_unique_reach_7days: {latest.period_unique_reach_7days or 0:,}')
    
    # 日次リーチの合計を計算（全期間）
    total_daily_reach = sum(c.reach or 0 for c in campaigns)
    print(f'\n日次リーチの合計（全期間）: {total_daily_reach:,}')
    
    # ユーザーが言う正確な値
    expected_value = 1157
    actual_value = latest.period_unique_reach_all or 0
    difference = actual_value - expected_value
    
    print(f'\n期待値: {expected_value:,}')
    print(f'実際の値: {actual_value:,}')
    print(f'差分: {difference:,} ({difference/expected_value*100:.2f}%)')
    
    if actual_value != expected_value:
        print(f'\n⚠️ 値が一致しません。Meta APIから取得した値が間違っている可能性があります。')
        print(f'   または、time_rangeの計算に問題がある可能性があります。')
    else:
        print(f'\n✅ 値が一致しています。')

if __name__ == '__main__':
    main()

