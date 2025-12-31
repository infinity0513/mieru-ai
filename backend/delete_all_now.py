#!/usr/bin/env python3
"""
全データを削除するスクリプト（SQLAlchemyを使用）
"""

import os
import sys

# パスを追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.campaign import Campaign

print("=" * 80)
print("🗑️  全データを削除")
print("=" * 80)
print()

try:
    db = SessionLocal()
    
    # 削除前のデータ数を確認
    count_before = db.query(Campaign).count()
    print(f"📊 削除前のレコード数: {count_before:,}件")
    
    if count_before == 0:
        print("\n✅ 削除するデータがありませんでした")
        db.close()
        sys.exit(0)
    
    # 全データを削除
    print("\n🗑️  全データを削除中...")
    deleted_count = db.query(Campaign).delete()
    
    # コミット
    db.commit()
    
    print(f"✅ {deleted_count:,}件のデータを削除しました")
    
    # 削除後のデータ数を確認
    count_after = db.query(Campaign).count()
    print(f"📊 削除後のレコード数: {count_after:,}件")
    
    if count_after == 0:
        print("\n" + "=" * 80)
        print("✅ 全データの削除が完了しました！")
        print("💡 フロントエンドのページをリロード（F5）してください")
        print("=" * 80)
    else:
        print(f"\n⚠️  まだ {count_after:,}件のデータが残っています")
    
    db.close()
    
except Exception as e:
    print(f"❌ エラー: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

