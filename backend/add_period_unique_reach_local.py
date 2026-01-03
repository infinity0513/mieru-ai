#!/usr/bin/env python3
"""
ローカル環境のデータベースにperiod_unique_reachカラムを追加するスクリプト
"""
import sys
import os

# スクリプトのディレクトリをパスに追加
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

# 環境変数の設定（必要に応じて）
os.chdir(script_dir)

try:
    from app.database import engine
    from sqlalchemy import text
except ImportError as e:
    print(f"❌ インポートエラー: {e}")
    print(f"現在のディレクトリ: {os.getcwd()}")
    print(f"Pythonパス: {sys.path}")
    sys.exit(1)

def add_period_unique_reach_column():
    """period_unique_reachカラムを追加"""
    print("\n[1/3] データベース接続を確認中...")
    try:
        with engine.connect() as conn:
            print("[1/3] ✅ データベース接続成功")
            
            print("\n[2/3] カラムの存在確認中...")
            # カラムが既に存在するか確認
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'campaigns' AND column_name = 'period_unique_reach';
            """)
            result = conn.execute(check_query)
            if result.fetchone():
                print("[2/3] ✅ period_unique_reachカラムは既に存在します")
                return True
            
            print("[2/3] ⚠️ period_unique_reachカラムは存在しません。追加します...")
            
            print("\n[3/3] カラムを追加中...")
            # カラムを追加
            alter_query = text("""
                ALTER TABLE campaigns 
                ADD COLUMN period_unique_reach INTEGER DEFAULT 0;
            """)
            conn.execute(alter_query)
            conn.commit()
            print("[3/3] ✅ period_unique_reachカラムを追加しました")
            
            # 追加後の確認
            print("\n[確認] カラム追加後の確認中...")
            result = conn.execute(check_query)
            if result.fetchone():
                print("[確認] ✅ カラムが正常に追加されました")
            else:
                print("[確認] ⚠️ カラムが追加されていない可能性があります")
            
            return True
    except Exception as e:
        print(f"\n❌ エラーが発生しました: {e}")
        import traceback
        print(f"\n詳細なエラー情報:")
        traceback.print_exc()
        try:
            conn.rollback()
        except:
            pass
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("データベースマイグレーション: period_unique_reachカラム追加（ローカル）")
    print("=" * 50)
    
    if add_period_unique_reach_column():
        print("\n✅ マイグレーション完了")
    else:
        print("\n❌ マイグレーション失敗")
        sys.exit(1)


ローカル環境のデータベースにperiod_unique_reachカラムを追加するスクリプト
"""
import sys
import os

# スクリプトのディレクトリをパスに追加
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

# 環境変数の設定（必要に応じて）
os.chdir(script_dir)

try:
    from app.database import engine
    from sqlalchemy import text
except ImportError as e:
    print(f"❌ インポートエラー: {e}")
    print(f"現在のディレクトリ: {os.getcwd()}")
    print(f"Pythonパス: {sys.path}")
    sys.exit(1)

def add_period_unique_reach_column():
    """period_unique_reachカラムを追加"""
    print("\n[1/3] データベース接続を確認中...")
    try:
        with engine.connect() as conn:
            print("[1/3] ✅ データベース接続成功")
            
            print("\n[2/3] カラムの存在確認中...")
            # カラムが既に存在するか確認
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'campaigns' AND column_name = 'period_unique_reach';
            """)
            result = conn.execute(check_query)
            if result.fetchone():
                print("[2/3] ✅ period_unique_reachカラムは既に存在します")
                return True
            
            print("[2/3] ⚠️ period_unique_reachカラムは存在しません。追加します...")
            
            print("\n[3/3] カラムを追加中...")
            # カラムを追加
            alter_query = text("""
                ALTER TABLE campaigns 
                ADD COLUMN period_unique_reach INTEGER DEFAULT 0;
            """)
            conn.execute(alter_query)
            conn.commit()
            print("[3/3] ✅ period_unique_reachカラムを追加しました")
            
            # 追加後の確認
            print("\n[確認] カラム追加後の確認中...")
            result = conn.execute(check_query)
            if result.fetchone():
                print("[確認] ✅ カラムが正常に追加されました")
            else:
                print("[確認] ⚠️ カラムが追加されていない可能性があります")
            
            return True
    except Exception as e:
        print(f"\n❌ エラーが発生しました: {e}")
        import traceback
        print(f"\n詳細なエラー情報:")
        traceback.print_exc()
        try:
            conn.rollback()
        except:
            pass
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("データベースマイグレーション: period_unique_reachカラム追加（ローカル）")
    print("=" * 50)
    
    if add_period_unique_reach_column():
        print("\n✅ マイグレーション完了")
    else:
        print("\n❌ マイグレーション失敗")
        sys.exit(1)


ローカル環境のデータベースにperiod_unique_reachカラムを追加するスクリプト
"""
import sys
import os

# スクリプトのディレクトリをパスに追加
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

# 環境変数の設定（必要に応じて）
os.chdir(script_dir)

try:
    from app.database import engine
    from sqlalchemy import text
except ImportError as e:
    print(f"❌ インポートエラー: {e}")
    print(f"現在のディレクトリ: {os.getcwd()}")
    print(f"Pythonパス: {sys.path}")
    sys.exit(1)

def add_period_unique_reach_column():
    """period_unique_reachカラムを追加"""
    print("\n[1/3] データベース接続を確認中...")
    try:
        with engine.connect() as conn:
            print("[1/3] ✅ データベース接続成功")
            
            print("\n[2/3] カラムの存在確認中...")
            # カラムが既に存在するか確認
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'campaigns' AND column_name = 'period_unique_reach';
            """)
            result = conn.execute(check_query)
            if result.fetchone():
                print("[2/3] ✅ period_unique_reachカラムは既に存在します")
                return True
            
            print("[2/3] ⚠️ period_unique_reachカラムは存在しません。追加します...")
            
            print("\n[3/3] カラムを追加中...")
            # カラムを追加
            alter_query = text("""
                ALTER TABLE campaigns 
                ADD COLUMN period_unique_reach INTEGER DEFAULT 0;
            """)
            conn.execute(alter_query)
            conn.commit()
            print("[3/3] ✅ period_unique_reachカラムを追加しました")
            
            # 追加後の確認
            print("\n[確認] カラム追加後の確認中...")
            result = conn.execute(check_query)
            if result.fetchone():
                print("[確認] ✅ カラムが正常に追加されました")
            else:
                print("[確認] ⚠️ カラムが追加されていない可能性があります")
            
            return True
    except Exception as e:
        print(f"\n❌ エラーが発生しました: {e}")
        import traceback
        print(f"\n詳細なエラー情報:")
        traceback.print_exc()
        try:
            conn.rollback()
        except:
            pass
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("データベースマイグレーション: period_unique_reachカラム追加（ローカル）")
    print("=" * 50)
    
    if add_period_unique_reach_column():
        print("\n✅ マイグレーション完了")
    else:
        print("\n❌ マイグレーション失敗")
        sys.exit(1)


ローカル環境のデータベースにperiod_unique_reachカラムを追加するスクリプト
"""
import sys
import os

# スクリプトのディレクトリをパスに追加
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

# 環境変数の設定（必要に応じて）
os.chdir(script_dir)

try:
    from app.database import engine
    from sqlalchemy import text
except ImportError as e:
    print(f"❌ インポートエラー: {e}")
    print(f"現在のディレクトリ: {os.getcwd()}")
    print(f"Pythonパス: {sys.path}")
    sys.exit(1)

def add_period_unique_reach_column():
    """period_unique_reachカラムを追加"""
    print("\n[1/3] データベース接続を確認中...")
    try:
        with engine.connect() as conn:
            print("[1/3] ✅ データベース接続成功")
            
            print("\n[2/3] カラムの存在確認中...")
            # カラムが既に存在するか確認
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'campaigns' AND column_name = 'period_unique_reach';
            """)
            result = conn.execute(check_query)
            if result.fetchone():
                print("[2/3] ✅ period_unique_reachカラムは既に存在します")
                return True
            
            print("[2/3] ⚠️ period_unique_reachカラムは存在しません。追加します...")
            
            print("\n[3/3] カラムを追加中...")
            # カラムを追加
            alter_query = text("""
                ALTER TABLE campaigns 
                ADD COLUMN period_unique_reach INTEGER DEFAULT 0;
            """)
            conn.execute(alter_query)
            conn.commit()
            print("[3/3] ✅ period_unique_reachカラムを追加しました")
            
            # 追加後の確認
            print("\n[確認] カラム追加後の確認中...")
            result = conn.execute(check_query)
            if result.fetchone():
                print("[確認] ✅ カラムが正常に追加されました")
            else:
                print("[確認] ⚠️ カラムが追加されていない可能性があります")
            
            return True
    except Exception as e:
        print(f"\n❌ エラーが発生しました: {e}")
        import traceback
        print(f"\n詳細なエラー情報:")
        traceback.print_exc()
        try:
            conn.rollback()
        except:
            pass
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("データベースマイグレーション: period_unique_reachカラム追加（ローカル）")
    print("=" * 50)
    
    if add_period_unique_reach_column():
        print("\n✅ マイグレーション完了")
    else:
        print("\n❌ マイグレーション失敗")
        sys.exit(1)

