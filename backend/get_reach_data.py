#!/usr/bin/env python3
"""
データベースに保存されている各キャンペーンのリーチ数を確認するスクリプト
実行方法: cd backend && source venv/bin/activate && python3 get_reach_data.py
"""
import sys
import os
import traceback

# .envファイルを読み込む
def load_env_file():
    """Load environment variables from .env file"""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")

load_env_file()

try:
    from sqlalchemy import create_engine, text
    from dotenv import load_dotenv
except ImportError as e:
    print(f"❌ モジュールのインポートエラー: {e}")
    print("仮想環境をアクティベートしてください: source venv/bin/activate")
    sys.exit(1)

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL not found in environment variables")
    print("Please check your .env file")
    sys.exit(1)

print(f"[1/4] データベースURL: {DATABASE_URL[:20]}...")
print("[2/4] データベース接続中...")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        print("[2/4] ✅ データベース接続成功")
        
        # 全レコード数を確認
        print("[3/4] データを取得中...")
        result = conn.execute(text("""
            SELECT COUNT(*) as count 
            FROM campaigns
        """))
        total_count = result.fetchone()[0]
        print(f"[3/4] ✅ 全レコード数: {total_count}件")
        
        if total_count == 0:
            print("⚠️ データベースにレコードが存在しません。")
            sys.exit(0)
        
        # キャンペーンレベルのデータを取得（ad_set_nameとad_nameが空またはNULL）
        result = conn.execute(text("""
            SELECT 
                campaign_name,
                meta_account_id,
                date,
                reach,
                period_unique_reach,
                impressions,
                clicks,
                cost
            FROM campaigns
            WHERE (ad_set_name = '' OR ad_set_name IS NULL)
              AND (ad_name = '' OR ad_name IS NULL)
            ORDER BY campaign_name, date DESC
        """))
        
        rows = result.fetchall()
        print(f"[3/4] ✅ キャンペーンレベルのレコード数: {len(rows)}件")
        
        if len(rows) == 0:
            print("⚠️ キャンペーンレベルのデータが存在しません。")
            sys.exit(0)
        
        # キャンペーンごとに最新の日付のデータを取得
        campaign_data = {}
        for row in rows:
            campaign_name = row[0]
            if campaign_name not in campaign_data:
                campaign_data[campaign_name] = {
                    'campaign_name': campaign_name,
                    'meta_account_id': row[1],
                    'date': row[2],
                    'reach': row[3] or 0,
                    'period_unique_reach': row[4] or 0,
                    'impressions': row[5] or 0,
                    'clicks': row[6] or 0,
                    'cost': float(row[7] or 0)
                }
            else:
                # より新しい日付のデータがあれば更新
                if row[2] > campaign_data[campaign_name]['date']:
                    campaign_data[campaign_name].update({
                        'date': row[2],
                        'reach': row[3] or 0,
                        'period_unique_reach': row[4] or 0,
                        'impressions': row[5] or 0,
                        'clicks': row[6] or 0,
                        'cost': float(row[7] or 0)
                    })
        
        print("[4/4] ✅ データ集計完了")
        print()
        
        print('=' * 80)
        print('データベースに保存されている各キャンペーンのリーチ数（最新日付のデータ）')
        print('=' * 80)
        print(f'総キャンペーン数: {len(campaign_data)}')
        print()
        
        for campaign_name, data in sorted(campaign_data.items()):
            print(f'キャンペーン名: {campaign_name}')
            print(f'  Meta Account ID: {data["meta_account_id"]}')
            print(f'  最新日付: {data["date"]}')
            print(f'  日次リーチ (reach): {data["reach"]:,}')
            print(f'  期間ユニークリーチ (period_unique_reach): {data["period_unique_reach"]:,}')
            print(f'  インプレッション: {data["impressions"]:,}')
            print(f'  クリック: {data["clicks"]:,}')
            print(f'  費用: ¥{data["cost"]:,.2f}')
            print()
        
        # 各キャンペーンの全期間データも確認
        print('=' * 80)
        print('各キャンペーンの全期間データ（日付別）')
        print('=' * 80)
        for campaign_name in sorted(campaign_data.keys()):
            result = conn.execute(text("""
                SELECT 
                    date,
                    reach,
                    period_unique_reach,
                    impressions
                FROM campaigns
                WHERE campaign_name = :campaign_name
                  AND (ad_set_name = '' OR ad_set_name IS NULL)
                  AND (ad_name = '' OR ad_name IS NULL)
                ORDER BY date
            """), {"campaign_name": campaign_name})
            
            campaign_records = result.fetchall()
            
            print(f'\nキャンペーン名: {campaign_name}')
            print(f'  レコード数: {len(campaign_records)}件')
            for record in campaign_records:
                print(f'    {record[0]}: reach={record[1] or 0:,}, period_unique_reach={record[2] or 0:,}, impressions={record[3] or 0:,}')
        
        print()
        print('=' * 80)
        print('✅ 処理完了')
        print('=' * 80)
        
except Exception as e:
    print(f"❌ エラーが発生しました: {e}")
    traceback.print_exc()
    sys.exit(1)
