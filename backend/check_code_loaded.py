#!/usr/bin/env python3
"""
実際にロードされているコードを確認するスクリプト
"""
import sys
import os

# 仮想環境のパスを追加
venv_path = os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.14', 'site-packages')
if os.path.exists(venv_path):
    sys.path.insert(0, venv_path)

# プロジェクトのパスを追加
sys.path.insert(0, os.path.dirname(__file__))

try:
    # モジュールをインポート
    from app.routers import meta_api
    import inspect
    
    # sync_meta_data_to_campaigns関数のソースコードを取得
    source = inspect.getsource(meta_api.sync_meta_data_to_campaigns)
    
    # time_incrementが含まれているか確認
    has_time_increment = 'time_increment' in source
    has_time_increment_1 = 'time_increment = "1"' in source or 'time_increment="1"' in source
    
    print("=" * 80)
    print("コードのロード状況確認")
    print("=" * 80)
    print()
    print(f"time_incrementが含まれている: {has_time_increment}")
    print(f"time_increment = \"1\"が含まれている: {has_time_increment_1}")
    print()
    
    # 該当部分を抽出
    lines = source.split('\n')
    for i, line in enumerate(lines):
        if 'time_increment' in line:
            start = max(0, i - 2)
            end = min(len(lines), i + 3)
            print(f"行 {i+1} 付近:")
            for j in range(start, end):
                marker = ">>> " if j == i else "    "
                print(f"{marker}{j+1}: {lines[j]}")
            print()
    
    if not has_time_increment_1:
        print("⚠️ 警告: time_increment = \"1\"が見つかりませんでした。")
        print("モジュールが再ロードされていない可能性があります。")
        print("バックエンドサーバーを再起動してください。")
    else:
        print("✓ time_increment = \"1\"が確認できました。")
    
except Exception as e:
    import traceback
    print(f"エラー: {str(e)}")
    print(traceback.format_exc())


