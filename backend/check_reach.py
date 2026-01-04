import sys
sys.path.insert(0, '/Users/waka/Desktop/システム開発/meta-ad-analyzer-ai-online/backend')

from app.db.session import SessionLocal
from app.models.campaign import Campaign
from sqlalchemy import func

db = SessionLocal()

# 全キャンペーンの period_unique_reach を確認
print("=== 各キャンペーンの period_unique_reach ===\n")

campaigns = db.query(
    Campaign.campaign_name,
    func.sum(Campaign.reach).label('total_reach'),
    func.sum(Campaign.period_unique_reach).label('total_period_unique_reach'),
    func.count(Campaign.id).label('record_count')
).filter(
    Campaign.campaign_name.isnot(None)
).group_by(
    Campaign.campaign_name
).all()

for c in campaigns:
    print(f"キャンペーン: {c.campaign_name}")
    print(f"  日次reach合計: {c.total_reach:,}")
    print(f"  period_unique_reach合計: {c.total_period_unique_reach:,}")
    print(f"  レコード数: {c.record_count}")
    print()

db.close()
