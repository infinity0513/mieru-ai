#!/usr/bin/env python3
"""
コンバージョン数の内訳を確認するスクリプト
1,194件がどのように計算されているかを詳細に表示
"""

import os
import sys

# .envファイルから環境変数を読み込む
def load_env_file():
    """Load environment variables from .env file"""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")

load_env_file()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in .env file")
    sys.exit(1)

# データベース接続（psycopg2を使用）
import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor(cursor_factory=RealDictCursor)

try:
    # データを持つユーザーを取得
    cur.execute("""
        SELECT DISTINCT u.id, u.email, COUNT(c.id) as campaign_count
        FROM users u
        INNER JOIN campaigns c ON u.id = c.user_id
        GROUP BY u.id, u.email
        ORDER BY campaign_count DESC
        LIMIT 1
    """)
    user = cur.fetchone()
    if not user:
        # データがない場合は最初のユーザーを使用
        cur.execute("SELECT id, email FROM users LIMIT 1")
        user = cur.fetchone()
        if not user:
            print("ERROR: No users found")
            sys.exit(1)
    
    user_id = user['id']
    user_email = user['email']
    campaign_count = user.get('campaign_count', 0)
    print(f"User: {user_email} (ID: {user_id})")
    if campaign_count:
        print(f"Campaign records: {campaign_count}")
    print("=" * 80)
    
    # 全キャンペーンデータを取得
    cur.execute("""
        SELECT 
            c.campaign_name,
            c.ad_set_name,
            c.ad_name,
            c.date,
            c.conversions,
            c.conversion_value,
            c.clicks,
            c.cost,
            c.impressions,
            c.meta_account_id,
            u.file_name as upload_file_name
        FROM campaigns c
        LEFT JOIN uploads u ON c.upload_id = u.id
        WHERE c.user_id = %s
        ORDER BY c.date DESC, c.campaign_name, c.ad_set_name, c.ad_name
    """, (user_id,))
    
    rows = cur.fetchall()
    
    if not rows:
        print("No campaign data found")
        sys.exit(0)
    
    print(f"\nTotal records: {len(rows)}")
    print("=" * 80)
    
    # コンバージョン数の合計を計算
    total_conversions = 0
    total_conversion_value = 0
    total_clicks = 0
    total_cost = 0
    
    # キャンペーン別、日付別に集計
    campaign_stats = {}
    date_stats = {}
    
    print("\n【詳細データ（conversions > 0 のレコードのみ）】")
    print("-" * 80)
    
    for row in rows:
        campaign_name = row['campaign_name'] or ""
        ad_set_name = row['ad_set_name'] or ""
        ad_name = row['ad_name'] or ""
        date = row['date']
        conversions = row['conversions'] or 0
        conversion_value = row['conversion_value'] or 0
        clicks = row['clicks'] or 0
        cost = row['cost'] or 0
        impressions = row['impressions'] or 0
        meta_account_id = row['meta_account_id']
        upload_file_name = row['upload_file_name'] or ""
        
        total_conversions += conversions
        total_conversion_value += conversion_value
        total_clicks += clicks
        total_cost += cost
        
        # キャンペーン別集計
        if campaign_name not in campaign_stats:
            campaign_stats[campaign_name] = {
                'conversions': 0,
                'conversion_value': 0,
                'clicks': 0,
                'cost': 0,
                'records': 0
            }
        campaign_stats[campaign_name]['conversions'] += conversions
        campaign_stats[campaign_name]['conversion_value'] += conversion_value
        campaign_stats[campaign_name]['clicks'] += clicks
        campaign_stats[campaign_name]['cost'] += cost
        campaign_stats[campaign_name]['records'] += 1
        
        # 日付別集計
        date_str = str(date)
        if date_str not in date_stats:
            date_stats[date_str] = {
                'conversions': 0,
                'conversion_value': 0,
                'clicks': 0,
                'cost': 0,
                'records': 0
            }
        date_stats[date_str]['conversions'] += conversions
        date_stats[date_str]['conversion_value'] += conversion_value
        date_stats[date_str]['clicks'] += clicks
        date_stats[date_str]['cost'] += cost
        date_stats[date_str]['records'] += 1
        
        # conversions > 0 のレコードのみ表示
        if conversions > 0:
            level = "Campaign" if not ad_set_name else ("Ad Set" if not ad_name else "Ad")
            data_source = "Meta API" if meta_account_id else ("CSV: " + upload_file_name)
            print(f"Date: {date} | {level} | Campaign: {campaign_name} | Ad Set: {ad_set_name} | Ad: {ad_name}")
            print(f"  Conversions: {conversions} | Value: {conversion_value} | Clicks: {clicks} | Cost: {cost} | Source: {data_source}")
            print()
    
    print("=" * 80)
    print("\n【合計値】")
    print(f"Total Conversions: {total_conversions:,}")
    print(f"Total Conversion Value: {total_conversion_value:,.2f}")
    print(f"Total Clicks: {total_clicks:,}")
    print(f"Total Cost: {total_cost:,.2f}")
    
    print("\n" + "=" * 80)
    print("\n【キャンペーン別集計（conversions > 0 のみ）】")
    print("-" * 80)
    for campaign_name, stats in sorted(campaign_stats.items()):
        if stats['conversions'] > 0:
            print(f"Campaign: {campaign_name}")
            print(f"  Conversions: {stats['conversions']:,} | Value: {stats['conversion_value']:,.2f} | Clicks: {stats['clicks']:,} | Cost: {stats['cost']:,.2f} | Records: {stats['records']}")
    
    print("\n" + "=" * 80)
    print("\n【日付別集計（conversions > 0 のみ）】")
    print("-" * 80)
    for date_str, stats in sorted(date_stats.items()):
        if stats['conversions'] > 0:
            print(f"Date: {date_str}")
            print(f"  Conversions: {stats['conversions']:,} | Value: {stats['conversion_value']:,.2f} | Clicks: {stats['clicks']:,} | Cost: {stats['cost']:,.2f} | Records: {stats['records']}")
    
    print("\n" + "=" * 80)
    print("\n【データソース別集計】")
    print("-" * 80)
    
    # Meta API vs CSV
    cur.execute("""
        SELECT 
            COUNT(*) as count,
            SUM(conversions) as total_conversions,
            SUM(conversion_value) as total_value
        FROM campaigns
        WHERE user_id = %s AND meta_account_id IS NOT NULL
    """, (user_id,))
    
    meta_result = cur.fetchone()
    
    cur.execute("""
        SELECT 
            COUNT(*) as count,
            SUM(conversions) as total_conversions,
            SUM(conversion_value) as total_value
        FROM campaigns
        WHERE user_id = %s AND meta_account_id IS NULL
    """, (user_id,))
    
    csv_result = cur.fetchone()
    
    print(f"Meta API Data:")
    print(f"  Records: {meta_result['count'] or 0:,}")
    print(f"  Total Conversions: {meta_result['total_conversions'] or 0:,}")
    print(f"  Total Value: {meta_result['total_value'] or 0:,.2f}")
    
    print(f"\nCSV Data:")
    print(f"  Records: {csv_result['count'] or 0:,}")
    print(f"  Total Conversions: {csv_result['total_conversions'] or 0:,}")
    print(f"  Total Value: {csv_result['total_value'] or 0:,.2f}")
    
    print("\n" + "=" * 80)
    print("\n【レベルの集計】")
    print("-" * 80)
    
    # Campaign level
    cur.execute("""
        SELECT 
            COUNT(*) as count,
            SUM(conversions) as total_conversions
        FROM campaigns
        WHERE user_id = %s 
        AND ad_set_name IS NULL 
        AND ad_name IS NULL
    """, (user_id,))
    
    campaign_level = cur.fetchone()
    
    # Ad Set level
    cur.execute("""
        SELECT 
            COUNT(*) as count,
            SUM(conversions) as total_conversions
        FROM campaigns
        WHERE user_id = %s 
        AND ad_set_name IS NOT NULL 
        AND ad_name IS NULL
    """, (user_id,))
    
    adset_level = cur.fetchone()
    
    # Ad level
    cur.execute("""
        SELECT 
            COUNT(*) as count,
            SUM(conversions) as total_conversions
        FROM campaigns
        WHERE user_id = %s 
        AND ad_name IS NOT NULL
    """, (user_id,))
    
    ad_level = cur.fetchone()
    
    print(f"Campaign Level:")
    print(f"  Records: {campaign_level['count'] or 0:,}")
    print(f"  Total Conversions: {campaign_level['total_conversions'] or 0:,}")
    
    print(f"\nAd Set Level:")
    print(f"  Records: {adset_level['count'] or 0:,}")
    print(f"  Total Conversions: {adset_level['total_conversions'] or 0:,}")
    
    print(f"\nAd Level:")
    print(f"  Records: {ad_level['count'] or 0:,}")
    print(f"  Total Conversions: {ad_level['total_conversions'] or 0:,}")
    
    print("\n" + "=" * 80)
    print(f"\n最終的な合計コンバージョン数: {total_conversions:,}")
    if total_conversions == 1194:
        print("✓ 1,194件と一致しました")
    else:
        print(f"⚠ 1,194件と一致しません（差: {abs(total_conversions - 1194)}件）")

finally:
    cur.close()
    conn.close()

