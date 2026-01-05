#!/usr/bin/env python3
"""
データベースに期間別のperiod_unique_reachカラムを追加するスクリプト
- period_unique_reach_7days: 7日間のユニークリーチ数
- period_unique_reach_30days: 30日間のユニークリーチ数
- period_unique_reach_all: 全期間のユニークリーチ数
"""
import sys
import os

# プロジェクトルートをパスに追加
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from app.database import engine
from sqlalchemy import text

def add_period_unique_reach_columns():
    """期間別のperiod_unique_reachカラムを追加"""
    print("\n[1/4] データベース接続を確認中...")
    try:
        with engine.connect() as conn:
            print("[1/4] ✅ データベース接続成功")
            
            # トランザクション開始
            trans = conn.begin()
            
            try:
                # カラムの存在確認と追加
                columns_to_add = [
                    ("period_unique_reach_7days", "7日間のユニークリーチ数"),
                    ("period_unique_reach_30days", "30日間のユニークリーチ数"),
                    ("period_unique_reach_all", "全期間のユニークリーチ数")
                ]
                
                for col_name, col_description in columns_to_add:
                    print(f"\n[2/4] {col_name}カラムの確認中...")
                    # カラムが既に存在するか確認
                    check_query = text(f"""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'campaigns' AND column_name = :col_name;
                    """)
                    result = conn.execute(check_query, {"col_name": col_name})
                    if result.fetchone():
                        print(f"[2/4] ✅ {col_name}カラムは既に存在します")
                    else:
                        print(f"[2/4] ⚠️ {col_name}カラムは存在しません。追加します...")
                        
                        print(f"\n[3/4] {col_name}カラムを追加中...")
                        # カラムを追加
                        alter_query = text(f"""
                            ALTER TABLE campaigns 
                            ADD COLUMN {col_name} INTEGER DEFAULT 0;
                        """)
                        conn.execute(alter_query)
                        print(f"[3/4] ✅ {col_name}カラムを追加しました")
                
                # 既存のperiod_unique_reachカラムの値をperiod_unique_reach_allにコピー
                print(f"\n[4/4] 既存データの移行中...")
                update_query = text("""
                    UPDATE campaigns 
                    SET period_unique_reach_all = period_unique_reach 
                    WHERE period_unique_reach_all = 0 AND period_unique_reach > 0;
                """)
                result = conn.execute(update_query)
                updated_count = result.rowcount
                print(f"[4/4] ✅ {updated_count}件のレコードを更新しました")
                
                # コミット
                trans.commit()
                print("\n✅ マイグレーション完了")
                return True
                
            except Exception as e:
                trans.rollback()
                raise e
                
    except Exception as e:
        print(f"\n❌ エラーが発生しました: {e}")
        import traceback
        print(f"\n詳細なエラー情報:")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=" * 80)
    print("データベースマイグレーション: 期間別period_unique_reachカラム追加")
    print("=" * 80)
    
    if add_period_unique_reach_columns():
        print("\n✅ マイグレーション完了")
    else:
        print("\n❌ マイグレーション失敗")
        sys.exit(1)

