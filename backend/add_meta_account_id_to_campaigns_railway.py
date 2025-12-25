"""
Railway PostgreSQLデータベースのCampaignテーブルにmeta_account_idカラムを追加するマイグレーションスクリプト
"""
import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# 環境変数からデータベースURLを取得
database_url = os.environ.get('DATABASE_URL')

if not database_url:
    print("エラー: DATABASE_URL環境変数が設定されていません。")
    print("Railwayの環境変数からDATABASE_URLを取得してください。")
    exit(1)

print(f"データベースに接続中...")

try:
    # PostgreSQLデータベースに接続
    conn = psycopg2.connect(database_url)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()
    
    # 既にカラムが存在するか確認
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'campaigns' AND column_name = 'meta_account_id'
    """)
    
    if cursor.fetchone():
        print("meta_account_idカラムは既に存在します。")
    else:
        print("meta_account_idカラムを追加します...")
        # カラムを追加
        cursor.execute("ALTER TABLE campaigns ADD COLUMN meta_account_id VARCHAR(255)")
        print("meta_account_idカラムを追加しました。")
    
    # 確認
    cursor.execute("""
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = 'campaigns'
        ORDER BY ordinal_position
    """)
    columns = cursor.fetchall()
    print("\n現在のcampaignsテーブルの構造:")
    for col in columns:
        if col[2]:  # character_maximum_lengthがある場合
            print(f"  - {col[0]} ({col[1]}({col[2]}))")
        else:
            print(f"  - {col[0]} ({col[1]})")
    
    cursor.close()
    conn.close()
    
except psycopg2.Error as e:
    print(f"データベースエラーが発生しました: {str(e)}")
    exit(1)
except Exception as e:
    print(f"エラーが発生しました: {str(e)}")
    exit(1)

print("\nマイグレーション完了。")

