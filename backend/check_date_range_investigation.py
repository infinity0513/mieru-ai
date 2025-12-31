#!/usr/bin/env python3
"""
ダッシュボードに表示されているデータとデータベースに取得されているデータの日付範囲を調査
"""
import os
import sys

# 仮想環境のパスを追加
venv_path = os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.14', 'site-packages')
if os.path.exists(venv_path):
    sys.path.insert(0, venv_path)

from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in .env")
    sys.exit(1)

print("=" * 80)
print("データベースに保存されているデータの日付範囲を調査")
print("=" * 80)
print()

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from datetime import datetime, timedelta
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 全データの日付範囲
    cur.execute("""
        SELECT 
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(*) as total_count,
            COUNT(DISTINCT date) as unique_dates_count
        FROM campaigns
    """)
    result = cur.fetchone()
    
    if result:
        min_date = result['min_date']
        max_date = result['max_date']
        total_count = result['total_count']
        unique_dates_count = result['unique_dates_count']
        
        print("【全データ】")
        print(f"  最小日付: {min_date}")
        print(f"  最大日付: {max_date}")
        print(f"  総レコード数: {total_count:,}件")
        print(f"  ユニークな日付数: {unique_dates_count}日")
        
        if min_date and max_date:
            days_diff = (max_date - min_date).days + 1
            print(f"  日数範囲: {days_diff}日")
        print()
    
    # Meta APIデータの日付範囲
    cur.execute("""
        SELECT 
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(*) as count,
            COUNT(DISTINCT date) as unique_dates_count
        FROM campaigns
        WHERE meta_account_id IS NOT NULL AND meta_account_id != ''
    """)
    meta_result = cur.fetchone()
    
    if meta_result and meta_result['count'] > 0:
        print("【Meta APIデータ】")
        print(f"  最小日付: {meta_result['min_date']}")
        print(f"  最大日付: {meta_result['max_date']}")
        print(f"  総レコード数: {meta_result['count']:,}件")
        print(f"  ユニークな日付数: {meta_result['unique_dates_count']}日")
        if meta_result['min_date'] and meta_result['max_date']:
            days_diff = (meta_result['max_date'] - meta_result['min_date']).days + 1
            print(f"  日数範囲: {days_diff}日")
        print()
    
    # CSVデータの日付範囲
    cur.execute("""
        SELECT 
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(*) as count,
            COUNT(DISTINCT date) as unique_dates_count
        FROM campaigns
        WHERE meta_account_id IS NULL OR meta_account_id = ''
    """)
    csv_result = cur.fetchone()
    
    if csv_result and csv_result['count'] > 0:
        print("【CSVデータ】")
        print(f"  最小日付: {csv_result['min_date']}")
        print(f"  最大日付: {csv_result['max_date']}")
        print(f"  総レコード数: {csv_result['count']:,}件")
        print(f"  ユニークな日付数: {csv_result['unique_dates_count']}日")
        if csv_result['min_date'] and csv_result['max_date']:
            days_diff = (csv_result['max_date'] - csv_result['min_date']).days + 1
            print(f"  日数範囲: {days_diff}日")
        print()
    
    # アカウント別の日付範囲
    cur.execute("""
        SELECT 
            meta_account_id,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(*) as count,
            COUNT(DISTINCT date) as unique_dates_count
        FROM campaigns
        WHERE meta_account_id IS NOT NULL AND meta_account_id != ''
        GROUP BY meta_account_id
        ORDER BY meta_account_id
    """)
    accounts = cur.fetchall()
    
    if accounts:
        print("【アカウント別データ】")
        for account in accounts:
            print(f"  アカウントID: {account['meta_account_id']}")
            print(f"    最小日付: {account['min_date']}")
            print(f"    最大日付: {account['max_date']}")
            print(f"    総レコード数: {account['count']:,}件")
            print(f"    ユニークな日付数: {account['unique_dates_count']}日")
            if account['min_date'] and account['max_date']:
                days_diff = (account['max_date'] - account['min_date']).days + 1
                print(f"    日数範囲: {days_diff}日")
            print()
    
    # 今日から何日前までのデータがあるか
    today = datetime.now().date()
    if max_date:
        days_from_today = (today - max_date).days
        print(f"【最新データ】")
        print(f"  最新データの日付: {max_date}")
        print(f"  今日から: {days_from_today}日前")
        print()
    
    # 37ヶ月（1095日）前の日付との比較
    days_37_months = 1095
    date_37_months_ago = today - timedelta(days=days_37_months)
    print(f"【全期間取得の確認】")
    print(f"  37ヶ月前の日付: {date_37_months_ago}")
    if min_date:
        days_from_37_months = (min_date - date_37_months_ago).days
        print(f"  最小日付が37ヶ月前より: {days_from_37_months}日{'前' if days_from_37_months < 0 else '後'}")
        is_full_period = days_from_37_months <= 0
        print(f"  全期間取得済み: {'はい' if is_full_period else 'いいえ'}")
    print()
    
    # 日付ごとのレコード数を確認（最初の10日と最後の10日）
    cur.execute("""
        SELECT 
            date,
            COUNT(*) as count
        FROM campaigns
        GROUP BY date
        ORDER BY date
        LIMIT 10
    """)
    first_dates = cur.fetchall()
    
    if first_dates:
        print("【最初の10日間のデータ件数】")
        for d in first_dates:
            print(f"  {d['date']}: {d['count']:,}件")
        print()
    
    cur.execute("""
        SELECT 
            date,
            COUNT(*) as count
        FROM campaigns
        GROUP BY date
        ORDER BY date DESC
        LIMIT 10
    """)
    last_dates = cur.fetchall()
    
    if last_dates:
        print("【最後の10日間のデータ件数】")
        for d in reversed(last_dates):
            print(f"  {d['date']}: {d['count']:,}件")
        print()
    
    print("=" * 80)
    print("調査完了")
    print("=" * 80)
    
except Exception as e:
    import traceback
    print(f"エラーが発生しました: {str(e)}")
    print(traceback.format_exc())
finally:
    if 'cur' in locals():
        cur.close()
    if 'conn' in locals():
        conn.close()


