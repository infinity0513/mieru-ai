#!/usr/bin/env python3
"""
ローカル環境でデータベースの重複レコードを確認するスクリプト
"""
import sys
import os
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Add the parent directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

from app.database import SessionLocal
from app.models.campaign import Campaign
from app.models.user import User
from sqlalchemy import or_
from collections import defaultdict

def check_duplicates():
    db = SessionLocal()
    try:
        print("=" * 80)
        print("データベースの重複レコード確認")
        print("=" * 80)
        
        # ユーザーを取得（最初のユーザーを使用）
        user = db.query(User).first()
        if not user:
            print("ユーザーが見つかりません。")
            return
        
        print(f"\nユーザーID: {user.id}")
        print(f"メールアドレス: {user.email}")
        
        # キャンペーンレベルのデータのみを取得
        campaign_level_data = db.query(Campaign).filter(
            Campaign.user_id == user.id,
            or_(
                Campaign.ad_set_name == '',
                Campaign.ad_set_name.is_(None)
            ),
            or_(
                Campaign.ad_name == '',
                Campaign.ad_name.is_(None)
            )
        ).all()
        
        print(f"\nキャンペーンレベルの総レコード数: {len(campaign_level_data)}")
        
        # 重複チェック: (campaign_name, date, meta_account_id)の組み合わせ
        record_map = defaultdict(list)
        for record in campaign_level_data:
            key = (
                record.campaign_name,
                str(record.date),
                record.meta_account_id or ''
            )
            record_map[key].append(record)
        
        # 重複があるレコードを表示
        duplicates_found = False
        total_duplicate_records = 0
        
        for key, records in record_map.items():
            if len(records) > 1:
                duplicates_found = True
                total_duplicate_records += len(records)
                campaign_name, date_str, meta_account_id = key
                print(f"\n{'=' * 80}")
                print(f"重複発見: キャンペーン名={campaign_name}, 日付={date_str}, MetaアカウントID={meta_account_id}")
                print(f"重複数: {len(records)}件")
                
                total_impressions = 0
                total_reach = 0
                total_cost = 0.0
                
                for i, record in enumerate(records, 1):
                    impressions = record.impressions or 0
                    reach = record.reach or 0
                    cost = float(record.cost or 0)
                    
                    total_impressions += impressions
                    total_reach += reach
                    total_cost += cost
                    
                    print(f"\n  レコード {i}:")
                    print(f"    ID: {record.id}")
                    print(f"    インプレッション: {impressions:,}")
                    print(f"    リーチ: {reach:,}")
                    print(f"    費用: ¥{cost:,.2f}")
                    print(f"    クリック数: {record.clicks or 0}")
                    print(f"    コンバージョン: {record.conversions or 0}")
                    print(f"    created_at: {record.created_at}")
                
                print(f"\n  合計（重複を含む）:")
                print(f"    インプレッション: {total_impressions:,}")
                print(f"    リーチ: {total_reach:,}")
                print(f"    費用: ¥{total_cost:,.2f}")
                print(f"\n  正しい値（1件分）:")
                print(f"    インプレッション: {records[0].impressions or 0:,}")
                print(f"    リーチ: {records[0].reach or 0:,}")
                print(f"    費用: ¥{float(records[0].cost or 0):,.2f}")
                print(f"    倍率: {len(records)}倍")
        
        if not duplicates_found:
            print("\n重複レコードは見つかりませんでした。")
        else:
            print(f"\n{'=' * 80}")
            print(f"重複レコードの総数: {total_duplicate_records}件")
            print(f"重複している組み合わせ数: {sum(1 for records in record_map.values() if len(records) > 1)}")
        
        # キャンペーンごとの集計（重複を考慮）
        print(f"\n{'=' * 80}")
        print("キャンペーンごとの集計（重複を含む）")
        print(f"{'=' * 80}")
        
        campaign_totals = defaultdict(lambda: {
            'impressions': 0,
            'reach': 0,
            'cost': 0.0,
            'clicks': 0,
            'conversions': 0,
            'count': 0
        })
        
        for record in campaign_level_data:
            campaign_name = record.campaign_name
            campaign_totals[campaign_name]['impressions'] += record.impressions or 0
            campaign_totals[campaign_name]['reach'] += record.reach or 0
            campaign_totals[campaign_name]['cost'] += float(record.cost or 0)
            campaign_totals[campaign_name]['clicks'] += record.clicks or 0
            campaign_totals[campaign_name]['conversions'] += record.conversions or 0
            campaign_totals[campaign_name]['count'] += 1
        
        for campaign_name, totals in sorted(campaign_totals.items()):
            print(f"\nキャンペーン: {campaign_name}")
            print(f"  レコード数: {totals['count']}")
            print(f"  インプレッション: {totals['impressions']:,}")
            print(f"  リーチ: {totals['reach']:,}")
            print(f"  費用: ¥{totals['cost']:,.2f}")
            print(f"  クリック数: {totals['clicks']:,}")
            print(f"  コンバージョン: {totals['conversions']:,}")
        
    except Exception as e:
        print(f"エラーが発生しました: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_duplicates()

