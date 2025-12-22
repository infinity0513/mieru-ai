#!/usr/bin/env python3
"""
ユーザーテーブルにMetaアカウント情報のカラムを追加するマイグレーションスクリプト
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

def add_meta_account_fields():
    """Metaアカウント情報のカラムを追加"""
    print("=" * 50)
    print("Metaアカウント情報カラムの追加")
    print("=" * 50)
    
    with engine.connect() as conn:
        try:
            # meta_account_idカラムを追加
            print("\n1. meta_account_idカラムを追加...")
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS meta_account_id VARCHAR(255)
            """))
            conn.commit()
            print("   ✅ meta_account_idカラムを追加しました")
            
            # meta_access_tokenカラムを追加
            print("\n2. meta_access_tokenカラムを追加...")
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS meta_access_token VARCHAR(500)
            """))
            conn.commit()
            print("   ✅ meta_access_tokenカラムを追加しました")
            
            print("\n" + "=" * 50)
            print("✅ マイグレーションが完了しました")
            print("=" * 50)
            
        except OperationalError as e:
            print(f"\n❌ エラー: {e}")
            conn.rollback()
            return False
        except Exception as e:
            print(f"\n❌ 予期しないエラー: {e}")
            conn.rollback()
            return False
    
    return True

if __name__ == "__main__":
    success = add_meta_account_fields()
    sys.exit(0 if success else 1)

