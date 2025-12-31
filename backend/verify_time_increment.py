#!/usr/bin/env python3
"""
time_incrementが正しく追加されているか確認するスクリプト
"""
import re

# ファイルを読み込む
with open('app/routers/meta_api.py', 'r') as f:
    content = f.read()

# time_incrementが含まれているか確認
has_time_increment_var = 'time_increment = "1"' in content or 'time_increment="1"' in content
has_time_increment_in_url = 'time_increment={time_increment}' in content or 'time_increment=' in content

print("=" * 80)
print("time_incrementの実装確認")
print("=" * 80)
print()
print(f"time_increment = \"1\" の変数定義: {has_time_increment_var}")
print(f"relative_urlにtime_incrementパラメータ: {has_time_increment_in_url}")
print()

# 該当行を抽出
lines = content.split('\n')
for i, line in enumerate(lines, 1):
    if 'time_increment' in line:
        start = max(0, i - 3)
        end = min(len(lines), i + 3)
        print(f"行 {i} 付近:")
        for j in range(start, end):
            marker = ">>> " if j == i - 1 else "    "
            print(f"{marker}{j+1:4d}: {lines[j]}")
        print()

if has_time_increment_var and has_time_increment_in_url:
    print("✓ time_incrementは正しく実装されています。")
    print()
    print("【次のステップ】")
    print("1. バックエンドサーバーを再起動してください:")
    print("   kill -9 $(lsof -ti:8000)")
    print("   cd backend && source venv/bin/activate && python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000")
    print()
    print("2. OAuth認証または /api/meta/sync-all を実行してください")
    print()
    print("3. バックエンドサーバーのログで以下を確認してください:")
    print("   - [Meta API] time_increment: 1")
    print("   - [Meta API] First 5 dates in batch: [...] (複数の異なる日付が表示される)")
else:
    print("⚠️ 警告: time_incrementが正しく実装されていません。")
    if not has_time_increment_var:
        print("   - time_increment = \"1\" の変数定義が見つかりません")
    if not has_time_increment_in_url:
        print("   - relative_urlにtime_incrementパラメータが見つかりません")


