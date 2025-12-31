#!/usr/bin/env python3
"""
データベースに保存されているデータの日付範囲を確認するスクリプト
"""

import os
import sys

# 仮想環境のパスを追加
venv_path = os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.14', 'site-packages')
if os.path.exists(venv_path):
    sys.path.insert(0, venv_path)
elif os.path.exists(os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.13', 'site-packages')):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.13', 'site-packages'))
elif os.path.exists(os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.12', 'site-packages')):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.12', 'site-packages'))
elif os.path.exists(os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.11', 'site-packages')):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.11', 'site-packages'))

# .envファイルからDATABASE_URLを読み込む
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # dotenvがない場合は環境変数から直接読み込む
    pass

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # .envファイルを直接読み込む
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    DATABASE_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
                    break
    
    if not DATABASE_URL:
        DATABASE_URL = "postgresql://user:password@localhost:5432/meta_ad_analyzer"

print("=" * 80)
print("データベースに保存されているデータの日付範囲を確認")
print("=" * 80)
print()

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from datetime import datetime, timedelta
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 全データの日付範囲を取得
    cur.execute("""
        SELECT 
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(*) as total_count
        FROM campaigns
    """)
    result = cur.fetchone()
    
    if result:
        min_date = result['min_date']
        max_date = result['max_date']
        total_count = result['total_count']
        
        print(f"全データ:")
        print(f"  最小日付: {min_date}")
        print(f"  最大日付: {max_date}")
        print(f"  総レコード数: {total_count}")
        
        if min_date and max_date:
            days_diff = (max_date - min_date).days + 1
            print(f"  日数: {days_diff}日")
        print()
    
    # Meta APIデータ（meta_account_idが設定されている）の日付範囲
    cur.execute("""
        SELECT 
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(*) as count
        FROM campaigns
        WHERE meta_account_id IS NOT NULL AND meta_account_id != ''
    """)
    meta_result = cur.fetchone()
    
    if meta_result and meta_result['count'] > 0:
        print(f"Meta APIデータ（meta_account_idが設定されている）:")
        print(f"  最小日付: {meta_result['min_date']}")
        print(f"  最大日付: {meta_result['max_date']}")
        print(f"  レコード数: {meta_result['count']}")
        if meta_result['min_date'] and meta_result['max_date']:
            days_diff = (meta_result['max_date'] - meta_result['min_date']).days + 1
            print(f"  日数: {days_diff}日")
        print()
    
    # CSVデータ（meta_account_idがNULLまたは空）の日付範囲
    cur.execute("""
        SELECT 
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(*) as count
        FROM campaigns
        WHERE meta_account_id IS NULL OR meta_account_id = ''
    """)
    csv_result = cur.fetchone()
    
    if csv_result and csv_result['count'] > 0:
        print(f"CSVデータ（meta_account_idがNULLまたは空）:")
        print(f"  最小日付: {csv_result['min_date']}")
        print(f"  最大日付: {csv_result['max_date']}")
        print(f"  レコード数: {csv_result['count']}")
        if csv_result['min_date'] and csv_result['max_date']:
            days_diff = (csv_result['max_date'] - csv_result['min_date']).days + 1
            print(f"  日数: {days_diff}日")
        print()
    
    # アカウント別の日付範囲
    cur.execute("""
        SELECT 
            meta_account_id,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(*) as count
        FROM campaigns
        WHERE meta_account_id IS NOT NULL AND meta_account_id != ''
        GROUP BY meta_account_id
        ORDER BY meta_account_id
    """)
    accounts = cur.fetchall()
    
    if accounts:
        print(f"アカウント別の日付範囲:")
        for account in accounts:
            print(f"  アカウントID: {account['meta_account_id']}")
            print(f"    最小日付: {account['min_date']}")
            print(f"    最大日付: {account['max_date']}")
            print(f"    レコード数: {account['count']}")
            if account['min_date'] and account['max_date']:
                days_diff = (account['max_date'] - account['min_date']).days + 1
                print(f"    日数: {days_diff}日")
            print()
    
    # 今日から何日前までのデータがあるか
    today = datetime.now().date()
    if max_date:
        days_from_today = (today - max_date).days
        print(f"最新データから今日までの日数: {days_from_today}日")
        print(f"（最新データ: {max_date}, 今日: {today}）")
        print()
    
    # 37ヶ月（1095日）前の日付
    days_37_months = 1095
    date_37_months_ago = today - timedelta(days=days_37_months)
    print(f"37ヶ月前の日付: {date_37_months_ago}")
    if min_date:
        days_from_37_months = (min_date - date_37_months_ago).days
        print(f"最小日付から37ヶ月前までの日数差: {days_from_37_months}日")
        if days_from_37_months < 0:
            print(f"  ⚠️ 最小日付が37ヶ月前より新しい（{abs(days_from_37_months)}日分のデータが不足）")
        elif days_from_37_months > 0:
            print(f"  ✓ 最小日付が37ヶ月前より古い（{days_from_37_months}日分のデータが余分）")
        else:
            print(f"  ✓ 最小日付が37ヶ月前と一致")
    print()
    
    # ユニークな日付の数を確認
    cur.execute("""
        SELECT COUNT(DISTINCT date) as unique_dates
        FROM campaigns
    """)
    unique_dates_result = cur.fetchone()
    if unique_dates_result:
        print(f"ユニークな日付数: {unique_dates_result['unique_dates']}日")
        print()
    
except Exception as e:
    import traceback
    print(f"エラーが発生しました: {str(e)}")
    print(traceback.format_exc())
finally:
    if 'cur' in locals():
        cur.close()
    if 'conn' in locals():
        conn.close()
