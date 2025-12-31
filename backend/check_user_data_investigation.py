#!/usr/bin/env python3
"""
ユーザーのデータ取得状況を調査
- データベースにデータが存在するか
- ユーザーIDとデータの関連付けが正しいか
- Meta APIの同期が完了しているか
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
print("ユーザーのデータ取得状況を調査")
print("=" * 80)
print()

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 全ユーザー数を確認
    cur.execute("SELECT COUNT(*) as count FROM users")
    user_count = cur.fetchone()['count']
    print(f"【全ユーザー数】: {user_count}人")
    print()
    
    # ユーザー一覧を取得
    cur.execute("""
        SELECT 
            id,
            email,
            meta_account_id,
            created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 10
    """)
    users = cur.fetchall()
    
    if users:
        print("【ユーザー一覧（最新10件）】")
        for user in users:
            print(f"  ユーザーID: {user['id']}")
            print(f"  メール: {user['email']}")
            print(f"  MetaアカウントID: {user['meta_account_id']}")
            print(f"  作成日時: {user['created_at']}")
            print()
    
    # 全データ数を確認
    cur.execute("SELECT COUNT(*) as count FROM campaigns")
    total_campaigns = cur.fetchone()['count']
    print(f"【全キャンペーンデータ数】: {total_campaigns:,}件")
    print()
    
    # ユーザー別のデータ数を確認
    cur.execute("""
        SELECT 
            user_id,
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT date) as unique_dates_count,
            COUNT(DISTINCT meta_account_id) as unique_accounts_count
        FROM campaigns
        GROUP BY user_id
        ORDER BY count DESC
    """)
    user_data = cur.fetchall()
    
    if user_data:
        print("【ユーザー別データ数】")
        for data in user_data:
            print(f"  ユーザーID: {data['user_id']}")
            print(f"    データ件数: {data['count']:,}件")
            print(f"    最小日付: {data['min_date']}")
            print(f"    最大日付: {data['max_date']}")
            print(f"    ユニークな日付数: {data['unique_dates_count']}日")
            print(f"    ユニークなアカウント数: {data['unique_accounts_count']}件")
            print()
    else:
        print("【ユーザー別データ数】: データなし")
        print()
    
    # Meta APIデータの状況を確認
    cur.execute("""
        SELECT 
            user_id,
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT meta_account_id) as unique_accounts_count
        FROM campaigns
        WHERE meta_account_id IS NOT NULL AND meta_account_id != ''
        GROUP BY user_id
        ORDER BY count DESC
    """)
    meta_data = cur.fetchall()
    
    if meta_data:
        print("【Meta APIデータ（ユーザー別）】")
        for data in meta_data:
            print(f"  ユーザーID: {data['user_id']}")
            print(f"    データ件数: {data['count']:,}件")
            print(f"    最小日付: {data['min_date']}")
            print(f"    最大日付: {data['max_date']}")
            print(f"    ユニークなアカウント数: {data['unique_accounts_count']}件")
            print()
    else:
        print("【Meta APIデータ】: データなし")
        print()
    
    # アカウント別のデータ数を確認
    cur.execute("""
        SELECT 
            meta_account_id,
            COUNT(*) as count,
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT date) as unique_dates_count
        FROM campaigns
        WHERE meta_account_id IS NOT NULL AND meta_account_id != ''
        GROUP BY meta_account_id
        ORDER BY count DESC
    """)
    account_data = cur.fetchall()
    
    if account_data:
        print("【アカウント別データ数】")
        for data in account_data:
            print(f"  アカウントID: {data['meta_account_id']}")
            print(f"    データ件数: {data['count']:,}件")
            print(f"    最小日付: {data['min_date']}")
            print(f"    最大日付: {data['max_date']}")
            print(f"    ユニークな日付数: {data['unique_dates_count']}日")
            print()
    else:
        print("【アカウント別データ数】: データなし")
        print()
    
    # 最新のデータを確認
    cur.execute("""
        SELECT 
            id,
            user_id,
            campaign_name,
            date,
            meta_account_id,
            impressions,
            clicks,
            cost
        FROM campaigns
        ORDER BY date DESC, created_at DESC
        LIMIT 10
    """)
    latest_data = cur.fetchall()
    
    if latest_data:
        print("【最新のデータ（最新10件）】")
        for data in latest_data:
            print(f"  ID: {data['id']}")
            print(f"  ユーザーID: {data['user_id']}")
            print(f"  キャンペーン名: {data['campaign_name']}")
            print(f"  日付: {data['date']}")
            print(f"  MetaアカウントID: {data['meta_account_id']}")
            print(f"  インプレッション: {data['impressions']}")
            print(f"  クリック: {data['clicks']}")
            print(f"  コスト: {data['cost']}")
            print()
    else:
        print("【最新のデータ】: データなし")
        print()
    
    # 特定のメールアドレス（gi06220622@gmail.com）のユーザーIDを確認
    cur.execute("""
        SELECT 
            id,
            email,
            meta_account_id
        FROM users
        WHERE email = 'gi06220622@gmail.com'
    """)
    target_user = cur.fetchone()
    
    if target_user:
        print(f"【対象ユーザー（gi06220622@gmail.com）】")
        print(f"  ユーザーID: {target_user['id']}")
        print(f"  メール: {target_user['email']}")
        print(f"  MetaアカウントID: {target_user['meta_account_id']}")
        print()
        
        # このユーザーのデータ数を確認
        cur.execute("""
            SELECT 
                COUNT(*) as count,
                MIN(date) as min_date,
                MAX(date) as max_date,
                COUNT(DISTINCT date) as unique_dates_count,
                COUNT(DISTINCT meta_account_id) as unique_accounts_count
            FROM campaigns
            WHERE user_id = %s
        """, (target_user['id'],))
        user_campaign_data = cur.fetchone()
        
        if user_campaign_data:
            print(f"【このユーザーのデータ】")
            print(f"  データ件数: {user_campaign_data['count']:,}件")
            print(f"  最小日付: {user_campaign_data['min_date']}")
            print(f"  最大日付: {user_campaign_data['max_date']}")
            print(f"  ユニークな日付数: {user_campaign_data['unique_dates_count']}日")
            print(f"  ユニークなアカウント数: {user_campaign_data['unique_accounts_count']}件")
            print()
            
            # Meta APIデータのみ
            cur.execute("""
                SELECT 
                    COUNT(*) as count,
                    MIN(date) as min_date,
                    MAX(date) as max_date,
                    COUNT(DISTINCT meta_account_id) as unique_accounts_count
                FROM campaigns
                WHERE user_id = %s
                  AND meta_account_id IS NOT NULL 
                  AND meta_account_id != ''
            """, (target_user['id'],))
            user_meta_data = cur.fetchone()
            
            if user_meta_data:
                print(f"【このユーザーのMeta APIデータ】")
                print(f"  データ件数: {user_meta_data['count']:,}件")
                print(f"  最小日付: {user_meta_data['min_date']}")
                print(f"  最大日付: {user_meta_data['max_date']}")
                print(f"  ユニークなアカウント数: {user_meta_data['unique_accounts_count']}件")
                print()
            else:
                print(f"【このユーザーのMeta APIデータ】: データなし")
                print()
        else:
            print(f"【このユーザーのデータ】: データなし")
            print()
    else:
        print("【対象ユーザー（gi06220622@gmail.com）】: 見つかりませんでした")
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


