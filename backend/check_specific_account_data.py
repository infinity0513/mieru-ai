#!/usr/bin/env python3
"""
特定のアカウントID（854731910864400）のデータ取得状況を調査
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
print("アカウントID 854731910864400 のデータ取得状況を調査")
print("=" * 80)
print()

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    target_account_id = '854731910864400'
    
    # このアカウントIDのデータ数を確認
    cur.execute("""
        SELECT 
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT date) as unique_dates_count,
            COUNT(DISTINCT user_id) as unique_users_count,
            COUNT(DISTINCT campaign_name) as unique_campaigns_count
        FROM campaigns
        WHERE meta_account_id = %s
    """, (target_account_id,))
    account_data = cur.fetchone()
    
    if account_data and account_data['count'] > 0:
        print(f"【アカウントID {target_account_id} のデータ】")
        print(f"  データ件数: {account_data['count']:,}件")
        print(f"  最小日付: {account_data['min_date']}")
        print(f"  最大日付: {account_data['max_date']}")
        print(f"  ユニークな日付数: {account_data['unique_dates_count']}日")
        print(f"  ユニークなユーザー数: {account_data['unique_users_count']}人")
        print(f"  ユニークなキャンペーン数: {account_data['unique_campaigns_count']}件")
        print()
    else:
        print(f"【アカウントID {target_account_id} のデータ】: データなし")
        print()
    
    # ユーザー別のデータ数を確認
    cur.execute("""
        SELECT 
            user_id,
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT date) as unique_dates_count
        FROM campaigns
        WHERE meta_account_id = %s
        GROUP BY user_id
        ORDER BY count DESC
    """, (target_account_id,))
    user_data = cur.fetchall()
    
    if user_data:
        print(f"【アカウントID {target_account_id} のユーザー別データ】")
        for data in user_data:
            print(f"  ユーザーID: {data['user_id']}")
            print(f"    データ件数: {data['count']:,}件")
            print(f"    最小日付: {data['min_date']}")
            print(f"    最大日付: {data['max_date']}")
            print(f"    ユニークな日付数: {data['unique_dates_count']}日")
            print()
    else:
        print(f"【アカウントID {target_account_id} のユーザー別データ】: データなし")
        print()
    
    # 日付別のデータ数を確認（最初の10日と最後の10日）
    cur.execute("""
        SELECT 
            date,
            COUNT(*) as count
        FROM campaigns
        WHERE meta_account_id = %s
        GROUP BY date
        ORDER BY date
        LIMIT 10
    """, (target_account_id,))
    first_dates = cur.fetchall()
    
    if first_dates:
        print(f"【アカウントID {target_account_id} の最初の10日間のデータ件数】")
        for d in first_dates:
            print(f"  {d['date']}: {d['count']:,}件")
        print()
    
    cur.execute("""
        SELECT 
            date,
            COUNT(*) as count
        FROM campaigns
        WHERE meta_account_id = %s
        GROUP BY date
        ORDER BY date DESC
        LIMIT 10
    """, (target_account_id,))
    last_dates = cur.fetchall()
    
    if last_dates:
        print(f"【アカウントID {target_account_id} の最後の10日間のデータ件数】")
        for d in reversed(last_dates):
            print(f"  {d['date']}: {d['count']:,}件")
        print()
    
    # キャンペーン別のデータ数を確認
    cur.execute("""
        SELECT 
            campaign_name,
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date
        FROM campaigns
        WHERE meta_account_id = %s
        GROUP BY campaign_name
        ORDER BY count DESC
        LIMIT 20
    """, (target_account_id,))
    campaign_data = cur.fetchall()
    
    if campaign_data:
        print(f"【アカウントID {target_account_id} のキャンペーン別データ（上位20件）】")
        for data in campaign_data:
            print(f"  キャンペーン名: {data['campaign_name']}")
            print(f"    データ件数: {data['count']:,}件")
            print(f"    最小日付: {data['min_date']}")
            print(f"    最大日付: {data['max_date']}")
            print()
    else:
        print(f"【アカウントID {target_account_id} のキャンペーン別データ】: データなし")
        print()
    
    # 全アカウントIDの一覧を確認
    cur.execute("""
        SELECT 
            meta_account_id,
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT user_id) as unique_users_count
        FROM campaigns
        WHERE meta_account_id IS NOT NULL AND meta_account_id != ''
        GROUP BY meta_account_id
        ORDER BY count DESC
    """)
    all_accounts = cur.fetchall()
    
    if all_accounts:
        print("【全アカウントIDの一覧】")
        for account in all_accounts:
            print(f"  アカウントID: {account['meta_account_id']}")
            print(f"    データ件数: {account['count']:,}件")
            print(f"    最小日付: {account['min_date']}")
            print(f"    最大日付: {account['max_date']}")
            print(f"    ユニークなユーザー数: {account['unique_users_count']}人")
            if account['meta_account_id'] == target_account_id:
                print(f"    ← これが調査対象のアカウントID")
            print()
    else:
        print("【全アカウントIDの一覧】: データなし")
        print()
    
    # ユーザー gi06220622@gmail.com のデータで、このアカウントIDが含まれているか確認
    cur.execute("""
        SELECT 
            u.id as user_id,
            u.email,
            u.meta_account_id as user_meta_account_id,
            COUNT(c.id) as campaign_count,
            MIN(c.date) as min_date,
            MAX(c.date) as max_date
        FROM users u
        LEFT JOIN campaigns c ON c.user_id = u.id
        WHERE u.email = 'gi06220622@gmail.com'
        GROUP BY u.id, u.email, u.meta_account_id
    """)
    user_info = cur.fetchone()
    
    if user_info:
        print("【ユーザー gi06220622@gmail.com の情報】")
        print(f"  ユーザーID: {user_info['user_id']}")
        print(f"  メール: {user_info['email']}")
        print(f"  ユーザーのMetaアカウントID: {user_info['user_meta_account_id']}")
        print(f"  全データ件数: {user_info['campaign_count']:,}件")
        print(f"  最小日付: {user_info['min_date']}")
        print(f"  最大日付: {user_info['max_date']}")
        print()
        
        # このユーザーが持つアカウントIDの一覧
        cur.execute("""
            SELECT 
                meta_account_id,
                COUNT(*) as count,
                MIN(date) as min_date,
                MAX(date) as max_date
            FROM campaigns
            WHERE user_id = %s
              AND meta_account_id IS NOT NULL 
              AND meta_account_id != ''
            GROUP BY meta_account_id
            ORDER BY count DESC
        """, (user_info['user_id'],))
        user_accounts = cur.fetchall()
        
        if user_accounts:
            print("【このユーザーが持つアカウントIDの一覧】")
            for account in user_accounts:
                print(f"  アカウントID: {account['meta_account_id']}")
                print(f"    データ件数: {account['count']:,}件")
                print(f"    最小日付: {account['min_date']}")
                print(f"    最大日付: {account['max_date']}")
                if account['meta_account_id'] == target_account_id:
                    print(f"    ← これが調査対象のアカウントID")
                print()
        else:
            print("【このユーザーが持つアカウントIDの一覧】: データなし")
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


