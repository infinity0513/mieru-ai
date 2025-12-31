#!/usr/bin/env python3
"""
854731910864400を含むアカウントIDのデータを調査
"""
import os
import sys

venv_path = os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.14', 'site-packages')
if os.path.exists(venv_path):
    sys.path.insert(0, venv_path)

from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in .env")
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 854731910864400を含むアカウントIDで検索
    cur.execute("""
        SELECT 
            meta_account_id,
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT date) as unique_dates_count
        FROM campaigns
        WHERE meta_account_id LIKE '%854731910864400%'
        GROUP BY meta_account_id
    """)
    results = cur.fetchall()
    
    print("=" * 80)
    print("854731910864400を含むアカウントIDのデータを調査")
    print("=" * 80)
    print()
    
    if results:
        print("【854731910864400を含むアカウントIDのデータ】")
        for r in results:
            print(f"  アカウントID: {r['meta_account_id']}")
            print(f"    データ件数: {r['count']:,}件")
            print(f"    最小日付: {r['min_date']}")
            print(f"    最大日付: {r['max_date']}")
            print(f"    ユニークな日付数: {r['unique_dates_count']}日")
            print()
    else:
        print("【854731910864400を含むアカウントIDのデータ】: データなし")
        print()
    
    # act_854731910864400 で直接検索
    cur.execute("""
        SELECT 
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT date) as unique_dates_count
        FROM campaigns
        WHERE meta_account_id = 'act_854731910864400'
    """)
    result = cur.fetchone()
    
    print("【act_854731910864400 のデータ】")
    if result and result['count'] > 0:
        print(f"  データ件数: {result['count']:,}件")
        print(f"  最小日付: {result['min_date']}")
        print(f"  最大日付: {result['max_date']}")
        print(f"  ユニークな日付数: {result['unique_dates_count']}日")
    else:
        print("  データなし")
    print()
    
    # 全アカウントIDの一覧（854731を含むもの）
    cur.execute("""
        SELECT 
            meta_account_id,
            COUNT(*) as count
        FROM campaigns
        WHERE meta_account_id IS NOT NULL 
          AND meta_account_id != ''
          AND meta_account_id LIKE '%854731%'
        GROUP BY meta_account_id
    """)
    all_854731 = cur.fetchall()
    
    if all_854731:
        print("【854731を含む全アカウントID】")
        for r in all_854731:
            print(f"  アカウントID: {r['meta_account_id']} ({r['count']:,}件)")
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


