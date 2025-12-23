#!/usr/bin/env python3
"""Test NaN handling in data_service.py"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import pandas as pd
from app.services.data_service import DataService

# テスト用CSVファイルを作成（NaN値を含む）
test_csv = """日付,キャンペーン名,広告セット名,広告名,インプレッション,クリック数,費用,コンバージョン数
2025-12-22,テストキャンペーン,テスト広告セット,テスト広告,1000,100,1000.5,10
2025-12-23,テストキャンペーン2,,,2000,200,2000.0,20
2025-12-24,テストキャンペーン3,テスト広告セット2,テスト広告2,nan,NaN,NaN,NaN"""

# CSVファイルを一時的に保存
with open('/tmp/test_nan.csv', 'w', encoding='utf-8-sig') as f:
    f.write(test_csv)

print("=" * 50)
print("NaN処理テスト")
print("=" * 50)

try:
    # CSVファイルをパース
    print("\n1. CSVファイルをパース...")
    df = DataService.parse_csv_file('/tmp/test_nan.csv')
    print(f"   成功: {len(df)}行のデータを読み込みました")
    print(f"   カラム: {list(df.columns)}")
    
    # データフレームの内容を表示
    print("\n2. データフレームの内容:")
    print(df.to_string())
    
    # NaN値のチェック
    print("\n3. NaN値のチェック:")
    for col in df.columns:
        nan_count = df[col].isna().sum()
        if nan_count > 0:
            print(f"   {col}: {nan_count}個のNaN値")
        else:
            print(f"   {col}: NaN値なし")
    
    # バリデーション
    print("\n4. データフレームのバリデーション...")
    is_valid, error_msg = DataService.validate_dataframe(df)
    if is_valid:
        print("   ✅ バリデーション成功")
    else:
        print(f"   ❌ バリデーション失敗: {error_msg}")
    
    # safe_intとsafe_floatのテスト
    print("\n5. safe_int/safe_float関数のテスト:")
    test_values = [None, '', 'nan', 'NaN', 'NaT', 0, 100, '100', '100.5', float('nan'), pd.NA]
    for val in test_values:
        try:
            int_result = DataService.safe_int(val, 0)
            float_result = DataService.safe_float(val, 0.0)
            print(f"   {repr(val):20} -> int: {int_result:6}, float: {float_result:8.2f}")
        except Exception as e:
            print(f"   {repr(val):20} -> エラー: {e}")
    
    print("\n" + "=" * 50)
    print("✅ すべてのテストが完了しました")
    print("=" * 50)
    
except Exception as e:
    print(f"\n❌ エラーが発生しました: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

