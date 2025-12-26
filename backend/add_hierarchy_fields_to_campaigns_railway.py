#!/usr/bin/env python3
"""
Railway PostgreSQLデータベースに階層構造フィールドを追加するマイグレーションスクリプト
- campaign_id: Meta APIのキャンペーンID
- adset_id: Meta APIの広告セットID
- ad_id: Meta APIの広告ID
- level: 'campaign', 'adset', 'ad' のいずれか
"""

import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

# 環境変数を読み込む
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("エラー: DATABASE_URL環境変数が設定されていません")
    sys.exit(1)

print("データベースに接続中...")
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()

try:
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('campaigns')]
    
    print(f"現在のcampaignsテーブルのカラム: {columns}")
    
    # campaign_idカラムを追加
    if 'campaign_id' not in columns:
        print("campaign_idカラムを追加します...")
        session.execute(text("ALTER TABLE campaigns ADD COLUMN campaign_id VARCHAR(255)"))
        session.commit()
        print("campaign_idカラムを追加しました")
    else:
        print("campaign_idカラムは既に存在します")
    
    # adset_idカラムを追加
    if 'adset_id' not in columns:
        print("adset_idカラムを追加します...")
        session.execute(text("ALTER TABLE campaigns ADD COLUMN adset_id VARCHAR(255)"))
        session.commit()
        print("adset_idカラムを追加しました")
    else:
        print("adset_idカラムは既に存在します")
    
    # ad_idカラムを追加
    if 'ad_id' not in columns:
        print("ad_idカラムを追加します...")
        session.execute(text("ALTER TABLE campaigns ADD COLUMN ad_id VARCHAR(255)"))
        session.commit()
        print("ad_idカラムを追加しました")
    else:
        print("ad_idカラムは既に存在します")
    
    # levelカラムを追加
    if 'level' not in columns:
        print("levelカラムを追加します...")
        session.execute(text("ALTER TABLE campaigns ADD COLUMN level VARCHAR(20)"))
        session.commit()
        print("levelカラムを追加しました")
    else:
        print("levelカラムは既に存在します")
    
    # 更新後のカラム一覧を確認
    inspector = inspect(engine)
    updated_columns = [col['name'] for col in inspector.get_columns('campaigns')]
    print(f"\n更新後のcampaignsテーブルのカラム: {updated_columns}")
    
    print("\nマイグレーション完了。")
    
except Exception as e:
    print(f"エラーが発生しました: {str(e)}")
    session.rollback()
    sys.exit(1)
finally:
    session.close()

