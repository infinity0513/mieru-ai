#!/usr/bin/env python3
"""
削除が失敗した原因を分析するスクリプト
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.campaign import Campaign
from sqlalchemy import func, or_

def analyze_deletion_issue():
    """削除が失敗した原因を分析"""
    db = SessionLocal()
    
    try:
        print("=" * 80)
        print("🔍 削除が失敗した原因の分析")
        print("=" * 80)
        print()
        
        # 全ユーザーのデータを確認
        from sqlalchemy import case
        
        user_stats = db.query(
            Campaign.user_id,
            func.count(Campaign.id).label('count'),
            func.sum(case((Campaign.meta_account_id.isnot(None) & (Campaign.meta_account_id != ''), 1), else_=0)).label('meta_count'),
            func.sum(case((or_(Campaign.meta_account_id.is_(None), Campaign.meta_account_id == ''), 1), else_=0)).label('csv_count')
        ).group_by(Campaign.user_id).all()
        
        print("📊 ユーザー別のデータ統計:")
        for stat in user_stats:
            print(f"   ユーザーID {stat.user_id}:")
            print(f"     総数: {stat.count:,}件")
            print(f"     Meta API: {stat.meta_count or 0:,}件")
            print(f"     CSV: {stat.csv_count or 0:,}件")
        
        print()
        print("=" * 80)
        print("🔍 考えられる原因")
        print("=" * 80)
        print()
        
        print("1. delete-allエンドポイントが呼ばれていなかった可能性")
        print("   - エンドポイントのURLが間違っていた")
        print("   - 認証トークンが無効だった")
        print("   - リクエストが失敗していた")
        print()
        
        print("2. delete-allが実行されたが、エラーが発生してロールバックされた可能性")
        print("   - データベースのトランザクションエラー")
        print("   - 外部キー制約エラー")
        print("   - 例外が発生してrollback()が実行された")
        print()
        
        print("3. delete-allが実行されたが、その後sync-allが実行されてデータが再取得された可能性")
        print("   - delete-all実行後、すぐにsync-allが実行された")
        print("   - sync-allは削除後にMeta APIからデータを再取得する")
        print("   - これが最も可能性が高い原因")
        print()
        
        print("4. ユーザーIDの不一致")
        print("   - 異なるユーザーのデータが残っていた")
        print("   - 削除処理が別のユーザーのデータを対象にしていた")
        print()
        
        print("5. 削除処理のフィルタ条件の問題")
        print("   - delete-allは全レベルのデータを削除するが、")
        print("   - sync-allはキャンペーンレベルのみを削除する")
        print("   - 広告セットレベルや広告レベルのデータが残っていた可能性")
        print()
        
        # データレベルの統計
        print("=" * 80)
        print("📊 データレベルの統計（全ユーザー）")
        print("=" * 80)
        
        # キャンペーンレベル
        campaign_level = db.query(Campaign).filter(
            or_(Campaign.ad_set_name == '', Campaign.ad_set_name.is_(None)),
            or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
        ).count()
        
        # 広告セットレベル
        adset_level = db.query(Campaign).filter(
            Campaign.ad_set_name.isnot(None),
            Campaign.ad_set_name != '',
            or_(Campaign.ad_name == '', Campaign.ad_name.is_(None))
        ).count()
        
        # 広告レベル
        ad_level = db.query(Campaign).filter(
            Campaign.ad_name.isnot(None),
            Campaign.ad_name != ''
        ).count()
        
        print(f"   キャンペーンレベル: {campaign_level:,}件")
        print(f"   広告セットレベル: {adset_level:,}件")
        print(f"   広告レベル: {ad_level:,}件")
        print(f"   合計: {campaign_level + adset_level + ad_level:,}件")
        
    finally:
        db.close()

if __name__ == "__main__":
    analyze_deletion_issue()

