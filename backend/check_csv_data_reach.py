#!/usr/bin/env python3
"""
CSVデータの残存状況を詳細に確認するスクリプト
リーチ数も含めて確認
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
from sqlalchemy import func, or_, and_
from datetime import datetime

# .envファイルを読み込む
env_path = project_root / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    print("⚠️  .envファイルが見つかりません")

def check_csv_data():
    """CSVデータの残存状況を詳細に確認"""
    db = SessionLocal()
    
    try:
        print("=" * 80)
        print("📊 CSVデータ残存状況の詳細確認")
        print("=" * 80)
        
        # 1. 全データの統計
        total_count = db.query(Campaign).count()
        print(f"\n【全データ統計】")
        print(f"  総レコード数: {total_count:,}件")
        
        # 2. Meta APIデータ（meta_account_idが設定されている）
        meta_api_query = db.query(Campaign).filter(
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        )
        meta_api_count = meta_api_query.count()
        print(f"\n【Meta APIデータ】")
        print(f"  レコード数: {meta_api_count:,}件")
        
        # 3. CSVデータ（meta_account_idがNULLまたは空）
        csv_query = db.query(Campaign).filter(
            or_(
                Campaign.meta_account_id.is_(None),
                Campaign.meta_account_id == ''
            )
        )
        csv_count = csv_query.count()
        print(f"\n【CSVアップロードデータ】")
        print(f"  レコード数: {csv_count:,}件")
        
        if csv_count > 0:
            print(f"  ⚠️  CSVデータが{csv_count:,}件残っています！")
            
            # CSVデータの詳細統計
            csv_stats = csv_query.with_entities(
                func.count(Campaign.id).label('count'),
                func.min(Campaign.date).label('min_date'),
                func.max(Campaign.date).label('max_date'),
                func.sum(Campaign.reach).label('total_reach'),
                func.sum(Campaign.impressions).label('total_impressions'),
                func.sum(Campaign.clicks).label('total_clicks'),
                func.sum(Campaign.cost).label('total_cost'),
                func.count(func.distinct(Campaign.campaign_name)).label('unique_campaigns'),
                func.count(func.distinct(Campaign.date)).label('unique_dates')
            ).first()
            
            print(f"\n  【CSVデータの詳細統計】")
            print(f"    件数: {csv_stats.count:,}件")
            print(f"    日付範囲: {csv_stats.min_date} ～ {csv_stats.max_date}")
            print(f"    ユニークなキャンペーン数: {csv_stats.unique_campaigns}件")
            print(f"    ユニークな日付数: {csv_stats.unique_dates}日")
            print(f"    リーチ数合計: {int(csv_stats.total_reach or 0):,}")
            print(f"    インプレッション数合計: {int(csv_stats.total_impressions or 0):,}")
            print(f"    クリック数合計: {int(csv_stats.total_clicks or 0):,}")
            print(f"    費用合計: {float(csv_stats.total_cost or 0):,.2f}")
            
            # データレベルの分布
            campaign_level_count = csv_query.filter(
                or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
                or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
            ).count()
            
            adset_level_count = csv_query.filter(
                Campaign.ad_set_name != '',
                Campaign.ad_set_name.isnot(None),
                or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
            ).count()
            
            ad_level_count = csv_query.filter(
                Campaign.ad_name != '',
                Campaign.ad_name.isnot(None)
            ).count()
            
            print(f"\n  【データレベルの分布】")
            print(f"    キャンペーンレベル: {campaign_level_count:,}件")
            print(f"    広告セットレベル: {adset_level_count:,}件")
            print(f"    広告レベル: {ad_level_count:,}件")
            
            # キャンペーン別のCSVデータ
            print(f"\n  【キャンペーン別CSVデータ（上位10件）】")
            campaign_csv_stats = csv_query.with_entities(
                Campaign.campaign_name,
                func.count(Campaign.id).label('count'),
                func.sum(Campaign.reach).label('total_reach'),
                func.min(Campaign.date).label('min_date'),
                func.max(Campaign.date).label('max_date')
            ).group_by(Campaign.campaign_name).order_by(func.count(Campaign.id).desc()).limit(10).all()
            
            for stat in campaign_csv_stats:
                print(f"    - {stat.campaign_name}:")
                print(f"      件数: {stat.count}件, リーチ数: {int(stat.total_reach or 0):,}, 日付範囲: {stat.min_date} ～ {stat.max_date}")
            
            # 日付別のCSVデータ
            print(f"\n  【日付別CSVデータ（上位10日）】")
            date_csv_stats = csv_query.with_entities(
                Campaign.date,
                func.count(Campaign.id).label('count'),
                func.sum(Campaign.reach).label('total_reach')
            ).group_by(Campaign.date).order_by(func.count(Campaign.id).desc()).limit(10).all()
            
            for stat in date_csv_stats:
                print(f"    - {stat.date}: {stat.count}件, リーチ数: {int(stat.total_reach or 0):,}")
            
            # サンプルデータ（最初の10件）
            print(f"\n  【CSVデータのサンプル（最初の10件）】")
            sample_csv = csv_query.order_by(Campaign.date.desc(), Campaign.created_at.desc()).limit(10).all()
            for i, record in enumerate(sample_csv, 1):
                print(f"    {i}. ID: {record.id}")
                print(f"       キャンペーン名: {record.campaign_name}")
                print(f"       日付: {record.date}")
                print(f"       広告セット名: {record.ad_set_name or '(なし)'}")
                print(f"       広告名: {record.ad_name or '(なし)'}")
                print(f"       リーチ数: {record.reach or 0:,}")
                print(f"       インプレッション数: {record.impressions or 0:,}")
                print(f"       費用: {float(record.cost or 0):,.2f}")
                print(f"       meta_account_id: {record.meta_account_id or '(NULL)'}")
                print(f"       created_at: {record.created_at}")
                print()
            
            # Uploadレコードとの関連確認
            upload_ids = db.query(func.distinct(Campaign.upload_id)).filter(
                or_(
                    Campaign.meta_account_id.is_(None),
                    Campaign.meta_account_id == ''
                ),
                Campaign.upload_id.isnot(None)
            ).all()
            
            if upload_ids:
                upload_ids_list = [uid[0] for uid in upload_ids if uid[0]]
                if upload_ids_list:
                    uploads = db.query(Upload).filter(Upload.id.in_(upload_ids_list)).all()
                    print(f"\n  【関連するUploadレコード】")
                    for upload in uploads:
                        upload_count = csv_query.filter(Campaign.upload_id == upload.id).count()
                        print(f"    - Upload ID: {upload.id}")
                        print(f"      ファイル名: {upload.file_name}")
                        print(f"      ステータス: {upload.status}")
                        print(f"      作成日時: {upload.created_at}")
                        print(f"      関連Campaignレコード数: {upload_count}件")
                        print()
        else:
            print(f"  ✅ CSVデータは残っていません")
        
        # 4. リーチ数の比較
        print(f"\n【リーチ数の比較】")
        
        # 全データのリーチ数
        total_reach = db.query(func.sum(Campaign.reach)).scalar() or 0
        print(f"  全データのリーチ数合計: {int(total_reach):,}")
        
        # Meta APIデータのリーチ数
        meta_api_reach = meta_api_query.with_entities(func.sum(Campaign.reach)).scalar() or 0
        print(f"  Meta APIデータのリーチ数合計: {int(meta_api_reach):,}")
        
        # CSVデータのリーチ数
        csv_reach = csv_query.with_entities(func.sum(Campaign.reach)).scalar() or 0
        print(f"  CSVデータのリーチ数合計: {int(csv_reach):,}")
        
        # キャンペーンレベルのみのリーチ数（重複排除）
        campaign_level_reach = db.query(func.sum(Campaign.reach)).filter(
            or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
            or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
        ).scalar() or 0
        print(f"  キャンペーンレベルのリーチ数合計: {int(campaign_level_reach):,}")
        
        # 5. 重複の可能性があるデータ
        print(f"\n【重複の可能性があるデータ】")
        
        # 同じキャンペーン名、日付、meta_account_idの組み合わせで複数レコードがある場合
        duplicate_query = db.query(
            Campaign.campaign_name,
            Campaign.date,
            Campaign.meta_account_id,
            func.count(Campaign.id).label('count')
        ).group_by(
            Campaign.campaign_name,
            Campaign.date,
            Campaign.meta_account_id
        ).having(func.count(Campaign.id) > 1).limit(10)
        
        duplicates = duplicate_query.all()
        if duplicates:
            print(f"  ⚠️  重複の可能性があるデータ: {len(duplicates)}件")
            for dup in duplicates:
                print(f"    - キャンペーン: {dup.campaign_name}, 日付: {dup.date}, meta_account_id: {dup.meta_account_id or '(NULL)'}, 件数: {dup.count}")
        else:
            print(f"  ✅ 重複の可能性があるデータは見つかりませんでした")
        
        # CSVデータとMeta APIデータで同じキャンペーン名・日付の組み合わせがあるか
        if csv_count > 0 and meta_api_count > 0:
            print(f"\n【CSVデータとMeta APIデータの重複チェック】")
            
            # CSVデータのキャンペーン名・日付の組み合わせ
            csv_combinations = csv_query.with_entities(
                Campaign.campaign_name,
                Campaign.date
            ).distinct().all()
            
            # Meta APIデータのキャンペーン名・日付の組み合わせ
            meta_api_combinations = meta_api_query.with_entities(
                Campaign.campaign_name,
                Campaign.date
            ).distinct().all()
            
            csv_set = set((c.campaign_name, c.date) for c in csv_combinations)
            meta_api_set = set((c.campaign_name, c.date) for c in meta_api_combinations)
            
            overlap = csv_set & meta_api_set
            if overlap:
                print(f"  ⚠️  CSVデータとMeta APIデータで重複している組み合わせ: {len(overlap)}件")
                for combo in list(overlap)[:10]:
                    print(f"    - キャンペーン: {combo[0]}, 日付: {combo[1]}")
            else:
                print(f"  ✅ CSVデータとMeta APIデータの重複は見つかりませんでした")
        
        print("\n" + "=" * 80)
        print("確認完了")
        print("=" * 80)
        
    except Exception as e:
        print(f"❌ エラーが発生しました: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_csv_data()

