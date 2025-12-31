#!/usr/bin/env python3
"""
現在のデータベースに保存されているデータのソースを確認
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.campaign import Campaign, Upload
from sqlalchemy import or_, func

def check_data_source():
    """データソースを確認"""
    db = SessionLocal()
    
    try:
        # 全ユーザーのデータを確認（テスト用）
        # 実際にはユーザーIDでフィルタリングする必要があるが、まずは全体を確認
        
        # キャンペーンレベルのデータのみを取得
        campaign_level_query = db.query(Campaign).filter(
            or_(
                Campaign.ad_set_name == '',
                Campaign.ad_set_name.is_(None)
            ),
            or_(
                Campaign.ad_name == '',
                Campaign.ad_name.is_(None)
            )
        )
        
        total_count = campaign_level_query.count()
        print(f"📊 キャンペーンレベルデータ総数: {total_count:,}件")
        
        # Meta APIデータ（meta_account_idが設定されている）
        meta_api_data = campaign_level_query.filter(
            Campaign.meta_account_id.isnot(None),
            Campaign.meta_account_id != ''
        ).all()
        
        # CSVアップロードデータ（meta_account_idがNULLまたは空）
        csv_data = campaign_level_query.filter(
            or_(
                Campaign.meta_account_id.is_(None),
                Campaign.meta_account_id == ''
            )
        ).all()
        
        print(f"\n🔵 Meta APIデータ: {len(meta_api_data):,}件")
        if meta_api_data:
            meta_account_ids = list(set([c.meta_account_id for c in meta_api_data if c.meta_account_id]))
            print(f"   MetaアカウントID: {', '.join(meta_account_ids[:5])}{'...' if len(meta_account_ids) > 5 else ''}")
            
            # Uploadレコードを確認
            upload_ids = list(set([c.upload_id for c in meta_api_data if c.upload_id]))
            if upload_ids:
                uploads = db.query(Upload).filter(Upload.id.in_(upload_ids)).all()
                file_names = list(set([u.file_name for u in uploads if u.file_name]))
                print(f"   アップロードファイル名: {', '.join(file_names[:5])}{'...' if len(file_names) > 5 else ''}")
            
            # サンプルデータ
            print(f"\n   サンプルデータ（最初の3件）:")
            for i, c in enumerate(meta_api_data[:3], 1):
                upload = db.query(Upload).filter(Upload.id == c.upload_id).first() if c.upload_id else None
                print(f"   {i}. {c.campaign_name} ({c.date})")
                print(f"      meta_account_id: {c.meta_account_id}")
                print(f"      upload_file_name: {upload.file_name if upload else '(なし)'}")
                print(f"      user_id: {c.user_id}")
        
        print(f"\n📄 CSVアップロードデータ: {len(csv_data):,}件")
        if csv_data:
            # Uploadレコードを確認
            upload_ids = list(set([c.upload_id for c in csv_data if c.upload_id]))
            if upload_ids:
                uploads = db.query(Upload).filter(Upload.id.in_(upload_ids)).all()
                file_names = list(set([u.file_name for u in uploads if u.file_name]))
                print(f"   アップロードファイル名: {', '.join(file_names[:5])}{'...' if len(file_names) > 5 else ''}")
            
            # サンプルデータ
            print(f"\n   サンプルデータ（最初の3件）:")
            for i, c in enumerate(csv_data[:3], 1):
                upload = db.query(Upload).filter(Upload.id == c.upload_id).first() if c.upload_id else None
                print(f"   {i}. {c.campaign_name} ({c.date})")
                print(f"      meta_account_id: {c.meta_account_id or '(なし)'}")
                print(f"      upload_file_name: {upload.file_name if upload else '(なし)'}")
                print(f"      user_id: {c.user_id}")
        
        # 結論
        print("\n" + "=" * 80)
        if len(meta_api_data) > 0 and len(csv_data) > 0:
            print("✅ データソース: 混在（Meta APIデータとCSVアップロードデータの両方）")
        elif len(meta_api_data) > 0:
            print("✅ データソース: Meta APIから取得したデータ")
        elif len(csv_data) > 0:
            print("✅ データソース: CSVアップロードしたデータ")
        else:
            print("✅ データソース: データなし")
        print("=" * 80)
        
        # ユーザー別の統計
        print("\n📊 ユーザー別統計:")
        user_stats = db.query(
            Campaign.user_id,
            func.count(Campaign.id).label('count'),
            func.sum(func.case((Campaign.meta_account_id.isnot(None) & (Campaign.meta_account_id != ''), 1), else_=0)).label('meta_count'),
            func.sum(func.case((or_(Campaign.meta_account_id.is_(None), Campaign.meta_account_id == ''), 1), else_=0)).label('csv_count')
        ).filter(
            or_(
                Campaign.ad_set_name == '',
                Campaign.ad_set_name.is_(None)
            ),
            or_(
                Campaign.ad_name == '',
                Campaign.ad_name.is_(None)
            )
        ).group_by(Campaign.user_id).all()
        
        for stat in user_stats:
            print(f"   ユーザーID {stat.user_id}:")
            print(f"     総数: {stat.count:,}件")
            print(f"     Meta API: {stat.meta_count or 0:,}件")
            print(f"     CSV: {stat.csv_count or 0:,}件")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_data_source()
