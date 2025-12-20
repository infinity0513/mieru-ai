#!/usr/bin/env python3
"""
データベースの状態を確認し、必要なカラムを追加するスクリプト
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

def check_columns():
    """既存のカラムを確認"""
    inspector = inspect(engine)
    try:
        columns = [col['name'] for col in inspector.get_columns('campaigns')]
        print("📊 現在のcampaignsテーブルのカラム:")
        for col in columns:
            print(f"  - {col}")
        
        required_columns = ['reach', 'engagements', 'link_clicks', 'landing_page_views']
        missing_columns = [col for col in required_columns if col not in columns]
        
        if missing_columns:
            print(f"\n⚠️  不足しているカラム: {', '.join(missing_columns)}")
            return missing_columns
        else:
            print("\n✅ すべてのカラムが存在します")
            return []
    except Exception as e:
        print(f"❌ エラー: {e}")
        return None

def add_columns(missing_columns):
    """不足しているカラムを追加"""
    if not missing_columns:
        return
    
    print("\n🔧 カラムを追加します...")
    
    with engine.connect() as conn:
        for col in missing_columns:
            try:
                if col == 'reach':
                    conn.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0"))
                elif col == 'engagements':
                    conn.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS engagements INTEGER DEFAULT 0"))
                elif col == 'link_clicks':
                    conn.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0"))
                elif col == 'landing_page_views':
                    conn.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS landing_page_views INTEGER DEFAULT 0"))
                conn.commit()
                print(f"  ✅ {col} を追加しました")
            except Exception as e:
                print(f"  ❌ {col} の追加に失敗: {e}")
                conn.rollback()

if __name__ == "__main__":
    print("=" * 50)
    print("データベースマイグレーション: 追加指標カラム")
    print("=" * 50)
    
    missing = check_columns()
    
    if missing is None:
        print("\n❌ データベース接続エラー")
        sys.exit(1)
    
    if missing:
        # 自動的に実行（非対話モード）
        import sys
        auto_mode = '--auto' in sys.argv or '--yes' in sys.argv or '-y' in sys.argv
        
        if not auto_mode:
            response = input(f"\n{len(missing)}個のカラムを追加しますか？ (y/n): ")
            should_add = response.lower() == 'y'
        else:
            should_add = True
            print(f"\n自動モード: {len(missing)}個のカラムを追加します...")
        
        if should_add:
            add_columns(missing)
            print("\n✅ マイグレーション完了")
            print("\n再度確認します...")
            check_columns()
        else:
            print("\n❌ マイグレーションをキャンセルしました")
    else:
        print("\n✅ マイグレーションは不要です")




データベースの状態を確認し、必要なカラムを追加するスクリプト
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

def check_columns():
    """既存のカラムを確認"""
    inspector = inspect(engine)
    try:
        columns = [col['name'] for col in inspector.get_columns('campaigns')]
        print("📊 現在のcampaignsテーブルのカラム:")
        for col in columns:
            print(f"  - {col}")
        
        required_columns = ['reach', 'engagements', 'link_clicks', 'landing_page_views']
        missing_columns = [col for col in required_columns if col not in columns]
        
        if missing_columns:
            print(f"\n⚠️  不足しているカラム: {', '.join(missing_columns)}")
            return missing_columns
        else:
            print("\n✅ すべてのカラムが存在します")
            return []
    except Exception as e:
        print(f"❌ エラー: {e}")
        return None

def add_columns(missing_columns):
    """不足しているカラムを追加"""
    if not missing_columns:
        return
    
    print("\n🔧 カラムを追加します...")
    
    with engine.connect() as conn:
        for col in missing_columns:
            try:
                if col == 'reach':
                    conn.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0"))
                elif col == 'engagements':
                    conn.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS engagements INTEGER DEFAULT 0"))
                elif col == 'link_clicks':
                    conn.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0"))
                elif col == 'landing_page_views':
                    conn.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS landing_page_views INTEGER DEFAULT 0"))
                conn.commit()
                print(f"  ✅ {col} を追加しました")
            except Exception as e:
                print(f"  ❌ {col} の追加に失敗: {e}")
                conn.rollback()

if __name__ == "__main__":
    print("=" * 50)
    print("データベースマイグレーション: 追加指標カラム")
    print("=" * 50)
    
    missing = check_columns()
    
    if missing is None:
        print("\n❌ データベース接続エラー")
        sys.exit(1)
    
    if missing:
        # 自動的に実行（非対話モード）
        import sys
        auto_mode = '--auto' in sys.argv or '--yes' in sys.argv or '-y' in sys.argv
        
        if not auto_mode:
            response = input(f"\n{len(missing)}個のカラムを追加しますか？ (y/n): ")
            should_add = response.lower() == 'y'
        else:
            should_add = True
            print(f"\n自動モード: {len(missing)}個のカラムを追加します...")
        
        if should_add:
            add_columns(missing)
            print("\n✅ マイグレーション完了")
            print("\n再度確認します...")
            check_columns()
        else:
            print("\n❌ マイグレーションをキャンセルしました")
    else:
        print("\n✅ マイグレーションは不要です")
