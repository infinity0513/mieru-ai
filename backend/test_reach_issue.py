#!/usr/bin/env python3
"""
リーチ数が全てのキャンペーンで同じになる問題の調査
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

db = SessionLocal()

print("=" * 80)
print("リーチ数が全てのキャンペーンで同じになる問題の調査")
print("=" * 80)

# 全キャンペーンのリーチ数を確認
query = db.query(
    Campaign.campaign_name,
    func.sum(Campaign.reach).label('total_reach'),
    func.count(Campaign.id).label('count')
).filter(
    Campaign.meta_account_id == 'act_343589077304936'
).group_by(
    Campaign.campaign_name
).order_by(Campaign.campaign_name)

results = query.all()

print(f"\n【各キャンペーンのリーチ数（DB合算）】")
print(f"総キャンペーン数: {len(results)}")
print()

for result in results:
    campaign_name = result.campaign_name
    total_reach = int(result.total_reach or 0)
    count = result.count
    print(f"  キャンペーン: {campaign_name}")
    print(f"    リーチ数合計（DB）: {total_reach:,}人")
    print(f"    レコード数: {count}件")
    print()

print("\n【問題の可能性】")
print("1. campaign_nameが指定されていない場合、Meta APIからリーチ数を取得できない")
print("2. その場合、DBの合算値（全キャンペーンの合計）が使われる")
print("3. 結果として、全てのキャンペーンで同じ値が表示される")

print("\n" + "=" * 80)

db.close()


