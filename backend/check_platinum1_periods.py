import os
import sys
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL not found in environment variables")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    print("=" * 80)
    print("Platinum1 の期間別データ取得")
    print("=" * 80)
    
    # 1. 全期間の日別データ（指定期間：全期間日別取得）
    print("\n【1. 指定期間（全期間日別取得）】")
    result = conn.execute(text("""
        SELECT 
            date,
            reach,
            period_unique_reach,
            impressions,
            clicks,
            cost,
            conversions
        FROM campaigns
        WHERE campaign_name = 'Platinum1'
          AND (ad_set_name = '' OR ad_set_name IS NULL)
          AND (ad_name = '' OR ad_name IS NULL)
        ORDER BY date DESC
    """))
    
    all_period_rows = result.fetchall()
    print(f"レコード数: {len(all_period_rows)}件")
    if all_period_rows:
        print(f"日付範囲: {all_period_rows[-1][0]} ～ {all_period_rows[0][0]}")
        print("\n日別データ（最新10件）:")
        for row in all_period_rows[:10]:
            print(f"  {row[0]}: reach={row[1]}, period_unique_reach={row[2]}, impressions={row[3]}, clicks={row[4]}, cost={row[5]}, conversions={row[6]}")
        
        # 合計
        total_reach = sum(row[1] or 0 for row in all_period_rows)
        total_period_unique_reach = max(row[2] or 0 for row in all_period_rows) if any(row[2] for row in all_period_rows) else 0
        total_impressions = sum(row[3] or 0 for row in all_period_rows)
        total_clicks = sum(row[4] or 0 for row in all_period_rows)
        total_cost = sum(row[5] or 0 for row in all_period_rows)
        total_conversions = sum(row[6] or 0 for row in all_period_rows)
        print(f"\n合計:")
        print(f"  reach合計: {total_reach:,}")
        print(f"  period_unique_reach（最大値）: {total_period_unique_reach:,}")
        print(f"  impressions合計: {total_impressions:,}")
        print(f"  clicks合計: {total_clicks:,}")
        print(f"  cost合計: {total_cost:,}")
        print(f"  conversions合計: {total_conversions:,}")
    
    # 2. 7日間のデータ（昨日から7日前まで）
    print("\n【2. 7日間】")
    today = datetime.now().date()
    yesterday = today - timedelta(days=1)
    seven_days_ago = yesterday - timedelta(days=6)
    
    result = conn.execute(text("""
        SELECT 
            date,
            reach,
            period_unique_reach,
            impressions,
            clicks,
            cost,
            conversions
        FROM campaigns
        WHERE campaign_name = 'Platinum1'
          AND (ad_set_name = '' OR ad_set_name IS NULL)
          AND (ad_name = '' OR ad_name IS NULL)
          AND date >= :start_date
          AND date <= :end_date
        ORDER BY date DESC
    """), {"start_date": seven_days_ago, "end_date": yesterday})
    
    seven_days_rows = result.fetchall()
    print(f"期間: {seven_days_ago} ～ {yesterday}")
    print(f"レコード数: {len(seven_days_rows)}件")
    if seven_days_rows:
        print("\n日別データ:")
        for row in seven_days_rows:
            print(f"  {row[0]}: reach={row[1]}, period_unique_reach={row[2]}, impressions={row[3]}, clicks={row[4]}, cost={row[5]}, conversions={row[6]}")
        
        # 合計
        total_reach = sum(row[1] or 0 for row in seven_days_rows)
        total_period_unique_reach = max(row[2] or 0 for row in seven_days_rows) if any(row[2] for row in seven_days_rows) else 0
        total_impressions = sum(row[3] or 0 for row in seven_days_rows)
        total_clicks = sum(row[4] or 0 for row in seven_days_rows)
        total_cost = sum(row[5] or 0 for row in seven_days_rows)
        total_conversions = sum(row[6] or 0 for row in seven_days_rows)
        print(f"\n合計:")
        print(f"  reach合計: {total_reach:,}")
        print(f"  period_unique_reach（最大値）: {total_period_unique_reach:,}")
        print(f"  impressions合計: {total_impressions:,}")
        print(f"  clicks合計: {total_clicks:,}")
        print(f"  cost合計: {total_cost:,}")
        print(f"  conversions合計: {total_conversions:,}")
    
    # 3. 30日間のデータ（昨日から30日前まで）
    print("\n【3. 30日間】")
    thirty_days_ago = yesterday - timedelta(days=29)
    
    result = conn.execute(text("""
        SELECT 
            date,
            reach,
            period_unique_reach,
            impressions,
            clicks,
            cost,
            conversions
        FROM campaigns
        WHERE campaign_name = 'Platinum1'
          AND (ad_set_name = '' OR ad_set_name IS NULL)
          AND (ad_name = '' OR ad_name IS NULL)
          AND date >= :start_date
          AND date <= :end_date
        ORDER BY date DESC
    """), {"start_date": thirty_days_ago, "end_date": yesterday})
    
    thirty_days_rows = result.fetchall()
    print(f"期間: {thirty_days_ago} ～ {yesterday}")
    print(f"レコード数: {len(thirty_days_rows)}件")
    if thirty_days_rows:
        print("\n日別データ（最新10件）:")
        for row in thirty_days_rows[:10]:
            print(f"  {row[0]}: reach={row[1]}, period_unique_reach={row[2]}, impressions={row[3]}, clicks={row[4]}, cost={row[5]}, conversions={row[6]}")
        
        # 合計
        total_reach = sum(row[1] or 0 for row in thirty_days_rows)
        total_period_unique_reach = max(row[2] or 0 for row in thirty_days_rows) if any(row[2] for row in thirty_days_rows) else 0
        total_impressions = sum(row[3] or 0 for row in thirty_days_rows)
        total_clicks = sum(row[4] or 0 for row in thirty_days_rows)
        total_cost = sum(row[5] or 0 for row in thirty_days_rows)
        total_conversions = sum(row[6] or 0 for row in thirty_days_rows)
        print(f"\n合計:")
        print(f"  reach合計: {total_reach:,}")
        print(f"  period_unique_reach（最大値）: {total_period_unique_reach:,}")
        print(f"  impressions合計: {total_impressions:,}")
        print(f"  clicks合計: {total_clicks:,}")
        print(f"  cost合計: {total_cost:,}")
        print(f"  conversions合計: {total_conversions:,}")
    
    # 4. 全期間のデータ（全期間）
    print("\n【4. 全期間】")
    result = conn.execute(text("""
        SELECT 
            date,
            reach,
            period_unique_reach,
            impressions,
            clicks,
            cost,
            conversions
        FROM campaigns
        WHERE campaign_name = 'Platinum1'
          AND (ad_set_name = '' OR ad_set_name IS NULL)
          AND (ad_name = '' OR ad_name IS NULL)
        ORDER BY date DESC
    """))
    
    all_period_rows2 = result.fetchall()
    print(f"レコード数: {len(all_period_rows2)}件")
    if all_period_rows2:
        print(f"日付範囲: {all_period_rows2[-1][0]} ～ {all_period_rows2[0][0]}")
        print("\n日別データ（最新10件）:")
        for row in all_period_rows2[:10]:
            print(f"  {row[0]}: reach={row[1]}, period_unique_reach={row[2]}, impressions={row[3]}, clicks={row[4]}, cost={row[5]}, conversions={row[6]}")
        
        # 合計
        total_reach = sum(row[1] or 0 for row in all_period_rows2)
        total_period_unique_reach = max(row[2] or 0 for row in all_period_rows2) if any(row[2] for row in all_period_rows2) else 0
        total_impressions = sum(row[3] or 0 for row in all_period_rows2)
        total_clicks = sum(row[4] or 0 for row in all_period_rows2)
        total_cost = sum(row[5] or 0 for row in all_period_rows2)
        total_conversions = sum(row[6] or 0 for row in all_period_rows2)
        print(f"\n合計:")
        print(f"  reach合計: {total_reach:,}")
        print(f"  period_unique_reach（最大値）: {total_period_unique_reach:,}")
        print(f"  impressions合計: {total_impressions:,}")
        print(f"  clicks合計: {total_clicks:,}")
        print(f"  cost合計: {total_cost:,}")
        print(f"  conversions合計: {total_conversions:,}")
    
    print("\n" + "=" * 80)

