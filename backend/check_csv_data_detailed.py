#!/usr/bin/env python3
"""
CSVデータの残存状況をより詳細に確認するスクリプト
データレベル、重複、リーチ数の詳細を確認
"""

import sys
import os
from pathlib import Path

# プロジェクトルートをパスに追加
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# venvのパスを追加（複数のPythonバージョンに対応）
import glob
venv_lib_path = project_root / "venv" / "lib"
if venv_lib_path.exists():
    python_dirs = glob.glob(str(venv_lib_path / "python*"))
    if python_dirs:
        site_packages = Path(python_dirs[0]) / "site-packages"
        if site_packages.exists():
            sys.path.insert(0, str(site_packages))

try:
    from dotenv import load_dotenv
except ImportError:
    print("⚠️  dotenvモジュールが見つかりません。.envファイルの読み込みをスキップします。")
    load_dotenv = lambda x: None

from app.database import SessionLocal
from app.models.campaign import Campaign, Upload
from sqlalchemy import func, or_, and_, case
from datetime import datetime

# .envファイルを読み込む
env_path = project_root / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    print("⚠️  .envファイルが見つかりません")

def check_csv_data_detailed():
    """CSVデータの残存状況をより詳細に確認"""
    db = SessionLocal()
    
    try:
        print("=" * 80)
        print("📊 CSVデータ残存状況の詳細確認（拡張版）")
        print("=" * 80)
        
        # 1. 全データの詳細統計
        total_count = db.query(Campaign).count()
        print(f"\n【全データ統計】")
        print(f"  総レコード数: {total_count:,}件")
        
        # データレベルの分布
        level_stats = db.query(
            func.sum(case((or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)), 1), else_=0)).label('campaign_level'),
            func.sum(case((and_(Campaign.ad_set_name != '', Campaign.ad_set_name.isnot(None), or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))), 1), else_=0)).label('adset_level'),
            func.sum(case((and_(Campaign.ad_name != '', Campaign.ad_name.isnot(None)), 1), else_=0)).label('ad_level')
        ).first()
        
        print(f"  キャンペーンレベル: {int(level_stats.campaign_level or 0):,}件")
        print(f"  広告セットレベル: {int(level_stats.adset_level or 0):,}件")
        print(f"  広告レベル: {int(level_stats.ad_level or 0):,}件")
        
        # 2. meta_account_idの分布を詳細に確認
        print(f"\n【meta_account_idの分布】")
        
        # NULLの件数
        null_count = db.query(Campaign).filter(Campaign.meta_account_id.is_(None)).count()
        print(f"  NULL: {null_count:,}件")
        
        # 空文字列の件数
        empty_count = db.query(Campaign).filter(Campaign.meta_account_id == '').count()
        print(f"  空文字列: {empty_count:,}件")
        
        # NULLまたは空文字列の合計
        csv_count = db.query(Campaign).filter(
            or_(
                Campaign.meta_account_id.is_(None),
                Campaign.meta_account_id == ''
            )
        ).count()
        print(f"  NULLまたは空文字列（CSVデータ）: {csv_count:,}件")
        
        # 設定されているmeta_account_idの一覧
        meta_account_ids = db.query(
            Campaign.meta_account_id,
            func.count(Campaign.id).label('count')
        ).filter(
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        ).group_by(Campaign.meta_account_id).all()
        
        print(f"  設定されているmeta_account_id: {len(meta_account_ids)}件")
        for acc_id, count in meta_account_ids:
            print(f"    - {acc_id}: {count:,}件")
        
        # 3. CSVデータの詳細確認（NULLまたは空文字列）
        if csv_count > 0:
            print(f"\n【CSVデータの詳細（NULLまたは空文字列）】")
            
            csv_query = db.query(Campaign).filter(
                or_(
                    Campaign.meta_account_id.is_(None),
                    Campaign.meta_account_id == ''
                )
            )
            
            # サンプルデータ（最初の20件）
            print(f"\n  【サンプルデータ（最初の20件）】")
            sample_csv = csv_query.order_by(Campaign.date.desc(), Campaign.created_at.desc()).limit(20).all()
            for i, record in enumerate(sample_csv, 1):
                print(f"    {i}. ID: {record.id}")
                print(f"       キャンペーン名: {record.campaign_name}")
                print(f"       日付: {record.date}")
                print(f"       広告セット名: {record.ad_set_name or '(なし)'}")
                print(f"       広告名: {record.ad_name or '(なし)'}")
                print(f"       リーチ数: {record.reach or 0:,}")
                print(f"       インプレッション数: {record.impressions or 0:,}")
                print(f"       費用: {float(record.cost or 0):,.2f}")
                print(f"       meta_account_id: {repr(record.meta_account_id)}")
                print(f"       upload_id: {record.upload_id or '(なし)'}")
                print(f"       created_at: {record.created_at}")
                print()
        else:
            print(f"\n【CSVデータの詳細】")
            print(f"  ✅ CSVデータ（meta_account_idがNULLまたは空文字列）は0件です")
        
        # 4. すべてのレコードのmeta_account_idを確認（サンプル）
        print(f"\n【全レコードのmeta_account_id確認（サンプル20件）】")
        all_records = db.query(Campaign).order_by(Campaign.date.desc(), Campaign.created_at.desc()).limit(20).all()
        for i, record in enumerate(all_records, 1):
            meta_id = record.meta_account_id
            meta_id_repr = repr(meta_id) if meta_id is None else (f"'{meta_id}'" if meta_id else "''")
            print(f"  {i}. ID: {record.id}, キャンペーン: {record.campaign_name}, 日付: {record.date}, meta_account_id: {meta_id_repr}")
        
        # 5. リーチ数の詳細比較
        print(f"\n【リーチ数の詳細比較】")
        
        # 全データのリーチ数
        total_reach = db.query(func.sum(Campaign.reach)).scalar() or 0
        print(f"  全データのリーチ数合計: {int(total_reach):,}")
        
        # Meta APIデータのリーチ数
        meta_api_reach = db.query(func.sum(Campaign.reach)).filter(
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        ).scalar() or 0
        print(f"  Meta APIデータのリーチ数合計: {int(meta_api_reach):,}")
        
        # CSVデータのリーチ数
        csv_reach = db.query(func.sum(Campaign.reach)).filter(
            or_(
                Campaign.meta_account_id.is_(None),
                Campaign.meta_account_id == ''
            )
        ).scalar() or 0
        print(f"  CSVデータのリーチ数合計: {int(csv_reach):,}")
        
        # データレベル別のリーチ数
        campaign_level_reach = db.query(func.sum(Campaign.reach)).filter(
            or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
            or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
        ).scalar() or 0
        print(f"  キャンペーンレベルのリーチ数合計: {int(campaign_level_reach):,}")
        
        adset_level_reach = db.query(func.sum(Campaign.reach)).filter(
            Campaign.ad_set_name != '',
            Campaign.ad_set_name.isnot(None),
            or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
        ).scalar() or 0
        print(f"  広告セットレベルのリーチ数合計: {int(adset_level_reach):,}")
        
        ad_level_reach = db.query(func.sum(Campaign.reach)).filter(
            Campaign.ad_name != '',
            Campaign.ad_name.isnot(None)
        ).scalar() or 0
        print(f"  広告レベルのリーチ数合計: {int(ad_level_reach):,}")
        
        # 6. 重複チェック（より詳細に）
        print(f"\n【重複チェック（詳細）】")
        
        # 同じキャンペーン名、日付、meta_account_idの組み合わせ
        duplicate_keys = db.query(
            Campaign.campaign_name,
            Campaign.date,
            Campaign.meta_account_id,
            func.count(Campaign.id).label('count')
        ).group_by(
            Campaign.campaign_name,
            Campaign.date,
            Campaign.meta_account_id
        ).having(func.count(Campaign.id) > 1).all()
        
        if duplicate_keys:
            print(f"  ⚠️  重複の可能性があるデータ: {len(duplicate_keys)}件")
            for dup in duplicate_keys[:10]:
                print(f"    - キャンペーン: {dup.campaign_name}, 日付: {dup.date}, meta_account_id: {repr(dup.meta_account_id)}, 件数: {dup.count}")
        else:
            print(f"  ✅ 重複の可能性があるデータは見つかりませんでした")
        
        # 同じキャンペーン名、日付、ad_set_name、ad_nameの組み合わせ（meta_account_idを除く）
        duplicate_without_meta = db.query(
            Campaign.campaign_name,
            Campaign.date,
            Campaign.ad_set_name,
            Campaign.ad_name,
            func.count(Campaign.id).label('count')
        ).group_by(
            Campaign.campaign_name,
            Campaign.date,
            Campaign.ad_set_name,
            Campaign.ad_name
        ).having(func.count(Campaign.id) > 1).all()
        
        if duplicate_without_meta:
            print(f"\n  ⚠️  meta_account_idを除いた重複の可能性があるデータ: {len(duplicate_without_meta)}件")
            for dup in duplicate_without_meta[:10]:
                print(f"    - キャンペーン: {dup.campaign_name}, 日付: {dup.date}, 広告セット: {dup.ad_set_name or '(なし)'}, 広告: {dup.ad_name or '(なし)'}, 件数: {dup.count}")
        else:
            print(f"  ✅ meta_account_idを除いた重複の可能性があるデータは見つかりませんでした")
        
        # 7. Uploadレコードの確認
        print(f"\n【Uploadレコードの確認】")
        uploads = db.query(Upload).order_by(Upload.created_at.desc()).limit(10).all()
        if uploads:
            print(f"  Uploadレコード数: {len(uploads)}件（最新10件を表示）")
            for upload in uploads:
                upload_campaign_count = db.query(Campaign).filter(Campaign.upload_id == upload.id).count()
                print(f"    - Upload ID: {upload.id}")
                print(f"      ファイル名: {upload.file_name}")
                print(f"      ステータス: {upload.status}")
                print(f"      作成日時: {upload.created_at}")
                print(f"      関連Campaignレコード数: {upload_campaign_count}件")
                print()
        else:
            print(f"  Uploadレコードは見つかりませんでした")
        
        print("\n" + "=" * 80)
        print("詳細確認完了")
        print("=" * 80)
        
    except Exception as e:
        print(f"❌ エラーが発生しました: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_csv_data_detailed()


