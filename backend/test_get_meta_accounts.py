#!/usr/bin/env python3
"""
get_meta_accountsエンドポイントの動作確認スクリプト
"""
import os
import sys

# 仮想環境のパスを追加
venv_path = os.path.join(os.path.dirname(__file__), '..', 'venv', 'lib', 'python3.14', 'site-packages')
if os.path.exists(venv_path):
    sys.path.insert(0, venv_path)
elif os.path.exists(os.path.join(os.path.dirname(__file__), '..', 'venv', 'lib', 'python3.13', 'site-packages')):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'venv', 'lib', 'python3.13', 'site-packages'))
elif os.path.exists(os.path.join(os.path.dirname(__file__), '..', 'venv', 'lib', 'python3.12', 'site-packages')):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'venv', 'lib', 'python3.12', 'site-packages'))
elif os.path.exists(os.path.join(os.path.dirname(__file__), '..', 'venv', 'lib', 'python3.11', 'site-packages')):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'venv', 'lib', 'python3.11', 'site-packages'))

# .envファイルからDATABASE_URLを読み込む
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # dotenvがない場合は環境変数から直接読み込む
    pass

import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in .env")
    sys.exit(1)

print("=" * 80)
print("get_meta_accountsエンドポイントの動作確認")
print("=" * 80)
print()

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 1. ユーザーIDを取得（最初のユーザー）
    cur.execute("SELECT id, email, meta_account_id, meta_access_token IS NOT NULL as has_token FROM users LIMIT 1")
    user = cur.fetchone()
    
    if not user:
        print("ERROR: ユーザーが見つかりません")
        sys.exit(1)
    
    print(f"ユーザー情報:")
    print(f"  ID: {user['id']}")
    print(f"  Email: {user['email']}")
    print(f"  meta_account_id: {user['meta_account_id']}")
    print(f"  meta_access_token: {'あり' if user['has_token'] else 'なし'}")
    print()
    
    user_id = user['id']
    
    # 2. Campaignテーブルからユニークなmeta_account_idを取得
    cur.execute("""
        SELECT DISTINCT meta_account_id
        FROM campaigns
        WHERE user_id = %s
        AND meta_account_id IS NOT NULL
    """, (user_id,))
    
    accounts = cur.fetchall()
    print(f"Campaignテーブルから取得したmeta_account_id:")
    print(f"  件数: {len(accounts)}")
    for idx, acc in enumerate(accounts, 1):
        print(f"  {idx}. {acc['meta_account_id']}")
    print()
    
    # 3. 各アカウントの統計情報を取得
    if accounts:
        account_ids = [acc['meta_account_id'] for acc in accounts if acc['meta_account_id']]
        print(f"アカウントIDリスト: {account_ids}")
        print()
        
        result = []
        for account_id in account_ids:
            # データ件数（全レベル合計）
            cur.execute("""
                SELECT COUNT(*) as count
                FROM campaigns
                WHERE user_id = %s AND meta_account_id = %s
            """, (user_id, account_id))
            total_count = cur.fetchone()['count']
            
            # ユニークなキャンペーン数
            cur.execute("""
                SELECT COUNT(DISTINCT campaign_name) as count
                FROM campaigns
                WHERE user_id = %s
                AND meta_account_id = %s
                AND (ad_set_name = '' OR ad_set_name IS NULL)
                AND (ad_name = '' OR ad_name IS NULL)
            """, (user_id, account_id))
            unique_campaigns = cur.fetchone()['count']
            
            # 最新のデータ日付
            cur.execute("""
                SELECT MAX(date) as latest_date
                FROM campaigns
                WHERE user_id = %s AND meta_account_id = %s
            """, (user_id, account_id))
            latest_date_result = cur.fetchone()
            latest_date = latest_date_result['latest_date'] if latest_date_result['latest_date'] else None
            
            result.append({
                "account_id": account_id,
                "data_count": total_count,
                "campaign_count": unique_campaigns,
                "latest_date": str(latest_date) if latest_date else None
            })
            
            print(f"アカウント: {account_id}")
            print(f"  データ件数: {total_count}")
            print(f"  キャンペーン数: {unique_campaigns}")
            print(f"  最新日付: {latest_date}")
            print()
        
        print(f"最終的なレスポンス形式:")
        print(f"  accounts: {len(result)}件")
        for idx, acc in enumerate(result, 1):
            print(f"    {idx}. account_id={acc['account_id']}, data_count={acc['data_count']}, campaign_count={acc['campaign_count']}, latest_date={acc['latest_date']}")
    else:
        print("⚠️ アカウントが見つかりませんでした")
        print("  原因の可能性:")
        print("    1. Campaignテーブルにデータが存在しない")
        print("    2. meta_account_idがNULLのデータのみ存在する")
        print("    3. user_idが一致するデータが存在しない")
        
        # デバッグ情報
        cur.execute("""
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN meta_account_id IS NOT NULL THEN 1 END) as with_meta_id,
                   COUNT(CASE WHEN meta_account_id IS NULL THEN 1 END) as without_meta_id
            FROM campaigns
            WHERE user_id = %s
        """, (user_id,))
        stats = cur.fetchone()
        print()
        print(f"デバッグ情報:")
        print(f"  全データ件数: {stats['total']}")
        print(f"  meta_account_idあり: {stats['with_meta_id']}")
        print(f"  meta_account_idなし: {stats['without_meta_id']}")
    
    print()
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

