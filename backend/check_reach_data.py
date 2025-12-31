#!/usr/bin/env python3
"""
リーチ数の原因調査スクリプト
Platinum1キャンペーンの実際のデータベースの値を確認
"""

import sys
import os
from pathlib import Path

# プロジェクトルートをパスに追加
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# venvのパスを追加
venv_path = project_root / "venv" / "lib" / "python3.14" / "site-packages"
if venv_path.exists():
    sys.path.insert(0, str(venv_path))

from dotenv import load_dotenv
load_dotenv(project_root / ".env")

from app.database import SessionLocal
from app.models.campaign import Campaign
from sqlalchemy import func
from datetime import datetime

db = SessionLocal()

print("=" * 80)
print("リーチ数の原因調査: Platinum1キャンペーン")
print("=" * 80)

# Platinum1キャンペーンのデータを取得
campaign_name = "Platinum1"
query = db.query(Campaign).filter(
    Campaign.campaign_name == campaign_name
).order_by(Campaign.date)

records = query.all()

print(f"\n【データベースの実際のデータ】")
print(f"総レコード数: {len(records)}件")
print(f"\n日別データ:")

total_reach_sum = 0
total_impressions_sum = 0
total_clicks_sum = 0

for record in records:
    date_str = record.date.strftime('%Y-%m-%d')
    reach = record.reach or 0
    impressions = record.impressions or 0
    clicks = record.clicks or 0
    meta_account_id = record.meta_account_id or 'N/A'
    ad_set_name = record.ad_set_name or '(empty)'
    ad_name = record.ad_name or '(empty)'
    
    total_reach_sum += reach
    total_impressions_sum += impressions
    total_clicks_sum += clicks
    
    print(f"  日付: {date_str}")
    print(f"    リーチ数: {reach:,}人")
    print(f"    インプレッション: {impressions:,}")
    print(f"    クリック数: {clicks:,}")
    print(f"    アカウントID: {meta_account_id}")
    print(f"    広告セット名: {ad_set_name}")
    print(f"    広告名: {ad_name}")
    print()

print(f"\n【合計値（単純合算）】")
print(f"  リーチ数合計: {total_reach_sum:,}人")
print(f"  インプレッション合計: {total_impressions_sum:,}")
print(f"  クリック数合計: {total_clicks_sum:,}")

# バックエンドの集計方法を再現
print(f"\n【バックエンドの集計方法（func.sum）】")
result = db.query(
    func.sum(Campaign.reach).label('total_reach'),
    func.sum(Campaign.impressions).label('total_impressions'),
    func.sum(Campaign.clicks).label('total_clicks')
).filter(
    Campaign.campaign_name == campaign_name
).first()

backend_reach = int(result.total_reach or 0)
backend_impressions = int(result.total_impressions or 0)
backend_clicks = int(result.total_clicks or 0)

print(f"  func.sum(reach): {backend_reach:,}人")
print(f"  func.sum(impressions): {backend_impressions:,}")
print(f"  func.sum(clicks): {backend_clicks:,}")

# キャンペーンレベルのみのデータを確認
print(f"\n【キャンペーンレベルのみのデータ】")
campaign_level_query = db.query(Campaign).filter(
    Campaign.campaign_name == campaign_name
).filter(
    (Campaign.ad_set_name == '') | (Campaign.ad_set_name.is_(None))
).filter(
    (Campaign.ad_name == '') | (Campaign.ad_name.is_(None))
).order_by(Campaign.date)

campaign_level_records = campaign_level_query.all()

print(f"キャンペーンレベルのレコード数: {len(campaign_level_records)}件")

campaign_level_reach_sum = 0
for record in campaign_level_records:
    date_str = record.date.strftime('%Y-%m-%d')
    reach = record.reach or 0
    campaign_level_reach_sum += reach
    print(f"  {date_str}: {reach:,}人")

print(f"キャンペーンレベルのリーチ数合計: {campaign_level_reach_sum:,}人")

# 広告セット/広告レベルのデータがあるか確認
print(f"\n【広告セット/広告レベルのデータ】")
adset_ad_level_query = db.query(Campaign).filter(
    Campaign.campaign_name == campaign_name
).filter(
    ~((Campaign.ad_set_name == '') | (Campaign.ad_set_name.is_(None))) |
    ~((Campaign.ad_name == '') | (Campaign.ad_name.is_(None)))
)

adset_ad_level_records = adset_ad_level_query.all()
print(f"広告セット/広告レベルのレコード数: {len(adset_ad_level_records)}件")

if len(adset_ad_level_records) > 0:
    adset_ad_reach_sum = 0
    for record in adset_ad_level_records:
        date_str = record.date.strftime('%Y-%m-%d')
        reach = record.reach or 0
        ad_set_name = record.ad_set_name or '(empty)'
        ad_name = record.ad_name or '(empty)'
        adset_ad_reach_sum += reach
        print(f"  {date_str} - 広告セット: {ad_set_name}, 広告: {ad_name}, リーチ: {reach:,}人")
    
    print(f"広告セット/広告レベルのリーチ数合計: {adset_ad_reach_sum:,}人")

# Meta APIから取得したデータの構造を確認
print(f"\n【Meta APIのデータ取得方法】")
print(f"  time_increment=1 で日別データを取得")
print(f"  各日のreach値は、その日のユニークリーチ数")
print(f"  複数日を合算すると、重複ユーザーがカウントされる可能性がある")

print(f"\n【原因の推測】")
print(f"  1. Meta APIから time_increment=1 で日別データを取得")
print(f"  2. 各日のreach値は、その日のユニークリーチ数（例: 2025-02-08の26,612人）")
print(f"  3. バックエンドで func.sum() で合算（26,612 + 17,954 = 44,566人）")
print(f"  4. しかし、同じユーザーが2日間広告を見た場合、2回カウントされる")
print(f"  5. Meta広告管理画面は期間全体のユニークリーチ数（42,086人）を表示")
print(f"  6. 差: 44,566 - 42,086 = 2,480人（重複ユーザー）")

print(f"\n【確認事項】")
print(f"  - Meta APIの time_increment=1 で取得したreachは、その日のユニークリーチ数")
print(f"  - 期間全体のユニークリーチ数を取得するには、time_increment=all または time_increment なしが必要")
print(f"  - 現在の実装では、日別データを合算しているため、重複が発生している")

print("\n" + "=" * 80)

db.close()


