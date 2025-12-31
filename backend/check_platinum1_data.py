#!/usr/bin/env python3
"""
Platinum1キャンペーンのデータを確認するスクリプト
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.database import get_db_url
from app.models.campaign import Campaign
from decimal import Decimal

def check_platinum1_data():
    """Platinum1キャンペーンのデータを確認"""
    db_url = get_db_url()
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        # Platinum1キャンペーンのデータを取得（キャンペーンレベルのみ）
        rows = db.query(Campaign).filter(
            Campaign.campaign_name.like('%Platinum1%')
        ).filter(
            Campaign.ad_set_name.in_(['', None]),
            Campaign.ad_name.in_(['', None])
        ).order_by(Campaign.date, Campaign.created_at).all()
        
        print(f"\n=== Platinum1キャンペーンのデータ ({len(rows)}件) ===\n")
        
        if len(rows) == 0:
            print("データが見つかりませんでした。")
            return
        
        # 日付別に集計
        from collections import defaultdict
        by_date = defaultdict(list)
        for campaign in rows:
            by_date[str(campaign.date)].append(campaign)
        
        print(f"=== 日付別データ ===\n")
        for date_str in sorted(by_date.keys()):
            date_rows = by_date[date_str]
            print(f"日付: {date_str} ({len(date_rows)}件)")
            for idx, campaign in enumerate(date_rows, 1):
                print(f"  レコード {idx}:")
                print(f"    ID: {campaign.id}")
                print(f"    Meta Account ID: {campaign.meta_account_id or 'N/A'}")
                print(f"    impressions: {campaign.impressions or 0}")
                print(f"    clicks: {campaign.clicks or 0}")
                print(f"    link_clicks: {campaign.link_clicks or 0}")
                print(f"    cost: {float(campaign.cost or 0)}")
                print(f"    conversions: {campaign.conversions or 0}")
                print(f"    conversion_value: {float(campaign.conversion_value or 0)}")
                print(f"    created_at: {campaign.created_at}")
            print()
        
        # 集計
        total_impressions = 0
        total_clicks = 0
        total_link_clicks = 0
        total_cost = 0
        total_conversions = 0
        total_conversion_value = 0
        total_reach = 0
        total_engagements = 0
        total_landing_page_views = 0
        
        # アセット別に集計
        by_account = {}
        
        for idx, campaign in enumerate(rows, 1):
            meta_account_id = campaign.meta_account_id or 'N/A'
            
            if meta_account_id not in by_account:
                by_account[meta_account_id] = {
                    'impressions': 0,
                    'clicks': 0,
                    'link_clicks': 0,
                    'cost': 0,
                    'conversions': 0,
                    'conversion_value': 0,
                    'reach': 0,
                    'engagements': 0,
                    'landing_page_views': 0,
                    'count': 0
                }
            
            by_account[meta_account_id]['impressions'] += campaign.impressions or 0
            by_account[meta_account_id]['clicks'] += campaign.clicks or 0
            by_account[meta_account_id]['link_clicks'] += campaign.link_clicks or 0
            by_account[meta_account_id]['cost'] += float(campaign.cost or 0)
            by_account[meta_account_id]['conversions'] += campaign.conversions or 0
            by_account[meta_account_id]['conversion_value'] += float(campaign.conversion_value or 0)
            by_account[meta_account_id]['reach'] += campaign.reach or 0
            by_account[meta_account_id]['engagements'] += campaign.engagements or 0
            by_account[meta_account_id]['landing_page_views'] += campaign.landing_page_views or 0
            by_account[meta_account_id]['count'] += 1
            
            total_impressions += campaign.impressions or 0
            total_clicks += campaign.clicks or 0
            total_link_clicks += campaign.link_clicks or 0
            total_cost += float(campaign.cost or 0)
            total_conversions += campaign.conversions or 0
            total_conversion_value += float(campaign.conversion_value or 0)
            total_reach += campaign.reach or 0
            total_engagements += campaign.engagements or 0
            total_landing_page_views += campaign.landing_page_views or 0
            
            if idx <= 5:  # 最初の5件を表示
                print(f"レコード {idx}:")
                print(f"  日付: {campaign.date}")
                print(f"  Meta Account ID: {meta_account_id}")
                print(f"  impressions: {campaign.impressions or 0}")
                print(f"  clicks: {campaign.clicks or 0}")
                print(f"  link_clicks: {campaign.link_clicks or 0}")
                print(f"  cost: {float(campaign.cost or 0)}")
                print(f"  conversions: {campaign.conversions or 0}")
                print(f"  conversion_value: {float(campaign.conversion_value or 0)}")
                print(f"  reach: {campaign.reach or 0}")
                print()
        
        print(f"\n=== 全体集計 ===\n")
        print(f"総レコード数: {len(rows)}")
        print(f"インプレッション: {total_impressions:,}")
        print(f"クリック数: {total_clicks}")
        print(f"リンククリック数: {total_link_clicks}")
        print(f"費用: ¥{total_cost:,.2f}")
        print(f"コンバージョン: {total_conversions}")
        print(f"コンバージョン価値: ¥{total_conversion_value:,.2f}")
        print(f"リーチ数: {total_reach:,}")
        print(f"エンゲージメント数: {total_engagements}")
        print(f"LPビュー数: {total_landing_page_views}")
        
        print(f"\n=== アセット別集計 ===\n")
        for account_id, data in by_account.items():
            print(f"Meta Account ID: {account_id}")
            print(f"  レコード数: {data['count']}")
            print(f"  インプレッション: {data['impressions']:,}")
            print(f"  クリック数: {data['clicks']}")
            print(f"  リンククリック数: {data['link_clicks']}")
            print(f"  費用: ¥{data['cost']:,.2f}")
            print(f"  コンバージョン: {data['conversions']}")
            print(f"  コンバージョン価値: ¥{data['conversion_value']:,.2f}")
            print(f"  リーチ数: {data['reach']:,}")
            print()
        
        # 重複チェック（同じ日付、同じmeta_account_idのデータ）
        print(f"\n=== 重複チェック ===\n")
        from collections import defaultdict
        duplicates = defaultdict(list)
        for campaign in rows:
            key = f"{campaign.date}_{campaign.meta_account_id or ''}"
            duplicates[key].append(campaign)
        
        duplicate_count = 0
        for key, campaigns in duplicates.items():
            if len(campaigns) > 1:
                duplicate_count += len(campaigns) - 1
                print(f"重複: {key} ({len(campaigns)}件)")
                for c in campaigns:
                    print(f"  ID: {c.id}, impressions: {c.impressions}, clicks: {c.clicks}, cost: {float(c.cost or 0)}")
        
        if duplicate_count == 0:
            print("重複は見つかりませんでした。")
        else:
            print(f"\n重複レコード数: {duplicate_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_platinum1_data()

