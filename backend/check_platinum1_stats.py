#!/usr/bin/env python3
"""
Platinum1キャンペーンの16項目の全期間データを取得するスクリプト
SQLiteを直接使用
"""
import sqlite3
import os
from datetime import datetime

# データベースファイルのパス
DB_PATH = "./meta_ad_analyzer.db"

def get_platinum1_stats():
    if not os.path.exists(DB_PATH):
        print(f"データベースファイルが見つかりません: {DB_PATH}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        print("=" * 80)
        print("Platinum1キャンペーンの16項目 - 全期間データ（サーバー側データベース）")
        print("=" * 80)
        print()
        
        # Platinum1キャンペーンのキャンペーンレベルのデータを取得
        campaign_name = "Platinum1"
        query = """
            SELECT 
                date,
                impressions,
                reach,
                clicks,
                link_clicks,
                cost,
                conversions,
                conversion_value,
                engagements,
                landing_page_views,
                meta_account_id
            FROM campaigns
            WHERE campaign_name = ?
            AND (ad_set_name IS NULL OR ad_set_name = '')
            AND (ad_name IS NULL OR ad_name = '')
            ORDER BY date
        """
        
        cursor.execute(query, (campaign_name,))
        records = cursor.fetchall()
        
        print(f"取得レコード数: {len(records)}")
        print()
        
        if len(records) == 0:
            print("データが見つかりませんでした。")
            return
        
        # 日付範囲を確認
        dates = sorted(set([r['date'] for r in records]))
        print(f"日付範囲: {dates[0]} ～ {dates[-1]}")
        print(f"日付数: {len(dates)}")
        print()
        
        # 16項目を集計
        total_impressions = sum(r['impressions'] or 0 for r in records)
        total_reach = sum(r['reach'] or 0 for r in records)
        total_clicks = sum(r['clicks'] or 0 for r in records)
        total_link_clicks = sum(r['link_clicks'] or 0 for r in records)
        total_cost = sum(float(r['cost'] or 0) for r in records)
        total_conversions = sum(r['conversions'] or 0 for r in records)
        total_conversion_value = sum(float(r['conversion_value'] or 0) for r in records)
        total_engagements = sum(r['engagements'] or 0 for r in records)
        total_landing_page_views = sum(r['landing_page_views'] or 0 for r in records)
        
        # フリークエンシー（impressions / reachで計算）
        avg_frequency = (total_impressions / total_reach) if total_reach > 0 else 0
        
        # 計算指標
        ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
        cpc = (total_cost / total_clicks) if total_clicks > 0 else 0
        cpa = (total_cost / total_conversions) if total_conversions > 0 else 0
        cpm = (total_cost / total_impressions * 1000) if total_impressions > 0 else 0
        cvr = (total_conversions / total_clicks * 100) if total_clicks > 0 else 0
        roas = (total_conversion_value / total_cost * 100) if total_cost > 0 else 0
        engagement_rate = (total_engagements / total_impressions * 100) if total_impressions > 0 else 0
        
        print("=" * 80)
        print("16項目の集計結果（全期間）")
        print("=" * 80)
        print()
        print("【基本指標】")
        print(f"1.  インプレッション: {total_impressions:,}")
        print(f"2.  リーチ: {total_reach:,}")
        print(f"3.  フリークエンシー: {avg_frequency:.2f}")
        print(f"4.  クリック数: {total_clicks:,}")
        print(f"5.  リンククリック数: {total_link_clicks:,}")
        print(f"6.  費用: ¥{total_cost:,.2f}")
        print(f"7.  コンバージョン数: {total_conversions:,}")
        print(f"8.  コンバージョン価値: ¥{total_conversion_value:,.2f}")
        print(f"9.  エンゲージメント数: {total_engagements:,}")
        print(f"10. LPビュー数: {total_landing_page_views:,}")
        print()
        print("【計算指標】")
        print(f"11. CTR (クリック率): {ctr:.2f}%")
        print(f"12. CPC (クリック単価): ¥{cpc:.2f}")
        print(f"13. CPM (インプレッション単価): ¥{cpm:.2f}")
        print(f"14. CVR (コンバージョン率): {cvr:.2f}%")
        print(f"15. CPA (獲得単価): ¥{cpa:.2f}")
        print(f"16. ROAS (費用対効果): {roas:.2f}%")
        print(f"17. エンゲージメント率: {engagement_rate:.2f}%")
        print()
        print("=" * 80)
        print("日付別データ")
        print("=" * 80)
        for d in dates:
            day_records = [r for r in records if r['date'] == d]
            day_impressions = sum(r['impressions'] or 0 for r in day_records)
            day_reach = sum(r['reach'] or 0 for r in day_records)
            day_clicks = sum(r['clicks'] or 0 for r in day_records)
            day_cost = sum(float(r['cost'] or 0) for r in day_records)
            day_conversions = sum(r['conversions'] or 0 for r in day_records)
            print(f"{d}: インプレッション={day_impressions:,}, リーチ={day_reach:,}, クリック={day_clicks:,}, 費用=¥{day_cost:,.2f}, コンバージョン={day_conversions:,}")
        
        # 重複チェック
        print()
        print("=" * 80)
        print("重複チェック")
        print("=" * 80)
        from collections import defaultdict
        date_map = defaultdict(list)
        for r in records:
            key = (r['date'], r['meta_account_id'] or '')
            date_map[key].append(r)
        
        duplicates = {k: v for k, v in date_map.items() if len(v) > 1}
        if duplicates:
            print(f"⚠️ 重複レコード検出: {len(duplicates)}件")
            for (d, meta_id), recs in list(duplicates.items())[:5]:
                print(f"  日付: {d}, MetaアカウントID: {meta_id or '(なし)'}, レコード数: {len(recs)}")
                for i, rec in enumerate(recs, 1):
                    print(f"    [{i}] インプレッション: {rec['impressions'] or 0}, リーチ: {rec['reach'] or 0}, 費用: ¥{float(rec['cost'] or 0):,.2f}")
        else:
            print("重複レコードは見つかりませんでした。")
        
    except Exception as e:
        print(f"エラーが発生しました: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    get_platinum1_stats()
