from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text
from typing import Optional
from datetime import datetime, timedelta
from ..models.user import User
from ..models.campaign import Campaign, Upload
from ..utils.dependencies import get_current_user
from ..database import get_db
from ..config import settings
import httpx
import urllib.parse
import secrets
import uuid
import json
from decimal import Decimal

router = APIRouter()

async def sync_meta_data_to_campaigns(user: User, access_token: str, account_id: str, db: Session, days: Optional[int] = None):
    """
    Meta APIからキャンペーンレベルのデータのみを取得してCampaignテーブルに保存（シンプル版）
    
    Args:
        user: ユーザーオブジェクト
        access_token: Meta APIアクセストークン
        account_id: Meta広告アカウントID
        db: データベースセッション
        days: 取得する日数（Noneの場合は37ヶ月、90の場合は3ヶ月など）
    """
    # ダミーのUploadレコードを作成（Meta API同期用）
    upload = Upload(
        user_id=user.id,
        file_name="Meta API Sync",
        status="completed",
        row_count=0
    )
    db.add(upload)
    db.flush()  # upload.idを取得するためにflush
    
    # JST（日本時間）で昨日を計算
    from datetime import timezone
    jst = timezone(timedelta(hours=9))  # JST = UTC+9
    current_jst = datetime.now(jst)
    today_jst = current_jst.date()
    yesterday = today_jst - timedelta(days=1)
    
    print(f"[Meta API] Current JST time: {current_jst.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[Meta API] Today (JST): {today_jst}")
    print(f"[Meta API] Yesterday (JST): {yesterday}")
    
    # 昨日までのデータを取得（未来の日付を指定すると400エラーになるため）
    until_dt = yesterday
    until = until_dt.strftime('%Y-%m-%d')
    
    # 取得期間の決定
    if days is None:
        # 全期間のデータを取得（Meta APIの最大範囲：過去37ヶ月間）
        # Meta APIの仕様:
        # - 基本的な最大取得期間: 37ヶ月（1,095日）
        # - Reach + Breakdown使用時: 13ヶ月（394日）のみ
        # - 現在の実装ではReachフィールドを使用しているが、Breakdownは使用していないため、37ヶ月が可能
        max_days_total = 1095  # 37ヶ月（1,095日）
        since_dt = until_dt - timedelta(days=max_days_total)
        since = since_dt.strftime('%Y-%m-%d')
        print(f"[Meta API] Full period sync: {since} to {until} (max {max_days_total} days / 37 months)")
        print(f"[Meta API] Date validation: since={since} (year={since_dt.year}), until={until} (year={until_dt.year})")
    else:
        # 指定された日数分のデータを取得（例: 90日 = 3ヶ月）
        since_dt = until_dt - timedelta(days=days)
        since = since_dt.strftime('%Y-%m-%d')
        print(f"[Meta API] Partial sync: {since} to {until} ({days} days)")
        print(f"[Meta API] Date validation: since={since} (year={since_dt.year}), until={until} (year={until_dt.year})")
        
        # 未来の日付が含まれている場合は警告
        if since_dt > today_jst or until_dt > today_jst:
            print(f"[Meta API] WARNING: Date range includes future dates! Today (JST): {today_jst}, Since: {since}, Until: {until}")
    
    try:
        async with httpx.AsyncClient() as client:
            all_insights = []
            all_campaigns = []
            
            # キャンペーン一覧を取得（ページネーション対応）
            print(f"[Meta API] Fetching campaigns from account: {account_id}")
            campaigns_url = f"https://graph.facebook.com/v24.0/{account_id}/campaigns"
            campaigns_params = {
                "access_token": access_token,
                "fields": "id,name,status,objective,created_time,updated_time",
                "limit": 100  # Meta APIの最大取得件数
            }
            
            # ページネーション処理（すべてのcampaignsを取得）
            campaigns_page_count = 0
            while True:
                campaigns_page_count += 1
                print(f"[Meta API] Fetching campaigns page {campaigns_page_count}...")
                campaigns_response = await client.get(campaigns_url, params=campaigns_params)
                campaigns_response.raise_for_status()
                campaigns_data = campaigns_response.json()
                
                # 取得したキャンペーンを追加
                page_campaigns = campaigns_data.get('data', [])
                all_campaigns.extend(page_campaigns)
                print(f"[Meta API] Retrieved {len(page_campaigns)} campaigns (total: {len(all_campaigns)})")
                
                # 次のページがあるかチェック
                paging = campaigns_data.get('paging', {})
                next_url = paging.get('next')
                
                if not next_url:
                    # 次のページがない場合は終了
                    print(f"[Meta API] No more campaign pages. Total campaigns retrieved: {len(all_campaigns)}")
                    break
                
                # 次のページのURLを設定（パラメータをクリア）
                campaigns_url = next_url
                campaigns_params = {}  # URLにパラメータが含まれているためクリア
            
            print(f"[Meta API] Total campaigns fetched: {len(all_campaigns)}")
            
            # キャンペーンIDからキャンペーン名へのマッピングを作成
            campaign_id_to_name_map = {}
            for campaign in all_campaigns:
                campaign_id = campaign['id']
                campaign_name = campaign.get('name', 'Unknown')
                campaign_id_to_name_map[campaign_id] = campaign_name
            
            print(f"[Meta API] Created campaign-id-to-name mapping: {len(campaign_id_to_name_map)} campaigns")
            
            # 各キャンペーンのInsightsを取得（キャンペーンレベルのみ）
            print(f"[Meta API] Processing {len(all_campaigns)} campaigns for campaign-level insights...")
            
            # 日付範囲の決定: days=Noneの場合は既に設定されたsince/untilを使用
            # daysが指定されている場合のみ、current_untilを再計算
            if days is None:
                # 全期間取得: 既に設定されたsince/untilを使用
                current_since = datetime.strptime(since, '%Y-%m-%d')
                current_until = datetime.strptime(until, '%Y-%m-%d')
                print(f"[Meta API] Full period sync: Using pre-calculated date range (days=None)")
            else:
                # 部分取得: 昨日までのデータを取得（JSTを使用して未来の日付を避ける）
                current_until = yesterday
                current_since = datetime.strptime(since, '%Y-%m-%d')
            
            # Meta APIの期間制限を確認
            # - Reachフィールドを使用しているが、Breakdownは使用していないため、37ヶ月（1,095日）が可能
            campaign_fields = "campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
            has_reach = "reach" in campaign_fields.lower()
            has_breakdowns = False  # 現在の実装ではbreakdownsパラメータを使用していない
            
            if has_reach and has_breakdowns:
                # Reach + Breakdownの場合は13ヶ月制限
                max_days_total = 394  # 13ヶ月
                print(f"[Meta API] Reach with breakdowns detected - limiting to 13 months ({max_days_total} days)")
            else:
                # それ以外は37ヶ月
                max_days_total = 1095  # 37ヶ月
                print(f"[Meta API] Standard limit - 37 months ({max_days_total} days)")
                print(f"[Meta API] Fields requested: {campaign_fields}")
                print(f"[Meta API] Has reach: {has_reach}, Has breakdowns: {has_breakdowns}")
            
            # 総期間を制限（37ヶ月または13ヶ月）
            # days=None（全期間取得）の場合は、既に正しく設定されているため制限不要
            # daysが指定されている場合のみ制限を適用
            if days is not None and (current_until - current_since).days > max_days_total:
                current_since = current_until - timedelta(days=max_days_total)
                print(f"[Meta API] Date range limited to {max_days_total} days: {current_since.strftime('%Y-%m-%d')} to {current_until.strftime('%Y-%m-%d')}")
            elif days is None:
                actual_days = (current_until - current_since).days
                print(f"[Meta API] Full period sync: Using full {actual_days} days range (days=None, since={since}, until={until})")
            
            # 日付範囲を文字列に変換
            start_date_str = current_since.strftime('%Y-%m-%d')
            end_date_str = current_until.strftime('%Y-%m-%d')
            actual_days = (current_until - current_since).days
            print(f"[Meta API] Final date range: {start_date_str} to {end_date_str} ({actual_days} days)")
            
            # バッチリクエストでキャンペーンレベルInsightsを取得（最大50件/バッチ）
            campaign_fields = "campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
            time_range_dict = {
                "since": start_date_str,
                "until": end_date_str
            }
            time_range_json = json.dumps(time_range_dict, separators=(',', ':'))  # スペースなしJSON
            # time_increment=1を追加して日次データを取得（重要：これがないと期間全体の集計データが1件だけ返される）
            time_increment = "1"
            
            # キャンペーンを50件ずつのバッチに分割
            batch_size = 50  # Meta APIのバッチリクエスト最大数
            for batch_start in range(0, len(all_campaigns), batch_size):
                batch_end = min(batch_start + batch_size, len(all_campaigns))
                batch_campaigns = all_campaigns[batch_start:batch_end]
                batch_num = (batch_start // batch_size) + 1
                total_batches = (len(all_campaigns) + batch_size - 1) // batch_size
                
                print(f"[Meta API] Processing campaign batch {batch_num}/{total_batches} ({len(batch_campaigns)} campaigns)")
                
                # バッチリクエストの作成
                batch_requests = []
                for campaign in batch_campaigns:
                    campaign_id = campaign.get('id')
                    # 相対URLを作成（access_tokenとtime_rangeを含む）
                    # time_increment=1を追加して日次データを取得（重要：これがないと期間全体の集計データが1件だけ返される）
                    # Meta APIのバッチリクエストでは、time_rangeはJSON文字列として渡す必要がある
                    # URLエンコードが必要だが、{}や:などの文字もエンコードする必要がある
                    # time_rangeは{"since":"2022-11-26","until":"2025-12-22"}の形式
                    time_range_encoded = urllib.parse.quote(time_range_json, safe='')
                    # time_incrementパラメータを追加（日次データを取得するために必須）
                    relative_url = f"{campaign_id}/insights?fields={campaign_fields}&time_range={time_range_encoded}&time_increment={time_increment}&limit=100"
                    
                    # デバッグログ（最初のバッチの最初のキャンペーンのみ）
                    if batch_start == 0 and len(batch_requests) == 0:
                        print(f"[Meta API] Sample relative_url for batch request: {relative_url}")
                        print(f"[Meta API] time_range_json: {time_range_json}")
                        print(f"[Meta API] time_range_encoded: {time_range_encoded}")
                        print(f"[Meta API] time_increment: {time_increment}")
                        print(f"[Meta API] Full URL would be: https://graph.facebook.com/v24.0/{relative_url}")
                    
                    batch_requests.append({
                        "method": "GET",
                        "relative_url": relative_url
                    })
                
                try:
                    # バッチリクエストを送信
                    batch_url = "https://graph.facebook.com/v24.0/"
                    batch_params = {
                        "access_token": access_token,
                        "batch": json.dumps(batch_requests, separators=(',', ':'))
                    }
                    
                    # デバッグ: バッチリクエストの内容を確認（最初のバッチのみ）
                    if batch_start == 0:
                        print(f"[Meta API] ===== Batch Request Debug (First Batch) =====")
                        print(f"[Meta API] Batch URL: {batch_url}")
                        print(f"[Meta API] Number of requests in batch: {len(batch_requests)}")
                        print(f"[Meta API] First request relative_url: {batch_requests[0].get('relative_url')}")
                        print(f"[Meta API] First request method: {batch_requests[0].get('method')}")
                        # リクエストURLを解析してパラメータを確認
                        first_relative_url = batch_requests[0].get('relative_url', '')
                        print(f"[Meta API] Parsed relative_url: {first_relative_url}")
                        # time_rangeとtime_incrementが含まれているか確認
                        if 'time_range=' in first_relative_url:
                            print(f"[Meta API] ✓ time_range parameter found in URL")
                        else:
                            print(f"[Meta API] ✗ ERROR: time_range parameter NOT found in URL!")
                        if 'time_increment=' in first_relative_url:
                            print(f"[Meta API] ✓ time_increment parameter found in URL")
                        else:
                            print(f"[Meta API] ✗ ERROR: time_increment parameter NOT found in URL!")
                        print(f"[Meta API] ==============================================")
                    
                    batch_response = await client.post(batch_url, params=batch_params)
                    batch_response.raise_for_status()
                    batch_data = batch_response.json()
                    
                    # デバッグ: バッチレスポンスの内容を確認（最初のバッチの最初のレスポンスのみ）
                    if batch_start == 0 and len(batch_data) > 0:
                        first_response = batch_data[0]
                        print(f"[Meta API] ===== Batch Response Debug (First Response) =====")
                        print(f"[Meta API] Response code: {first_response.get('code')}")
                        if first_response.get('code') == 200:
                            try:
                                first_body = json.loads(first_response.get('body', '{}'))
                                first_data = first_body.get('data', [])
                                print(f"[Meta API] Total insights in first response: {len(first_data)}")
                                if len(first_data) > 0:
                                    print(f"[Meta API] First insight date_start: {first_data[0].get('date_start')}")
                                    print(f"[Meta API] First insight campaign_name: {first_data[0].get('campaign_name')}")
                                    if len(first_data) > 1:
                                        print(f"[Meta API] Second insight date_start: {first_data[1].get('date_start')}")
                                        dates_in_first_batch = [d.get('date_start') for d in first_data[:10] if d.get('date_start')]
                                        unique_dates_in_batch = sorted(list(set(dates_in_first_batch)))
                                        print(f"[Meta API] First 10 dates in batch: {dates_in_first_batch}")
                                        print(f"[Meta API] Unique dates in first 10 insights: {unique_dates_in_batch}")
                                        print(f"[Meta API] Number of unique dates: {len(unique_dates_in_batch)}")
                                        if len(unique_dates_in_batch) == 1:
                                            print(f"[Meta API] ⚠️ WARNING: Only 1 unique date in first 10 insights!")
                                    else:
                                        print(f"[Meta API] ⚠️ WARNING: Only 1 insight returned!")
                                else:
                                    print(f"[Meta API] ⚠️ WARNING: No insights in response!")
                                    print(f"[Meta API] Response body: {first_response.get('body', '')[:500]}")
                            except Exception as e:
                                print(f"[Meta API] Error parsing first response: {str(e)}")
                                print(f"[Meta API] Response body: {first_response.get('body', '')[:500]}")
                        else:
                            print(f"[Meta API] ✗ ERROR: Response code is not 200!")
                            print(f"[Meta API] Response body: {first_response.get('body', '')[:500]}")
                        print(f"[Meta API] ================================================")
                    
                    # バッチレスポンスを処理
                    for idx, batch_item in enumerate(batch_data):
                        campaign = batch_campaigns[idx]
                        campaign_name = campaign.get('name', 'Unknown')
                        campaign_id = campaign.get('id')
                        
                        if batch_item.get('code') == 200:
                            try:
                                item_body = json.loads(batch_item.get('body', '{}'))
                                page_insights = item_body.get('data', [])
                                
                                if len(page_insights) > 0:
                                    all_insights.extend(page_insights)
                                    
                                    # サンプルデータをログ出力（最初のバッチの最初のキャンペーンのみ）
                                    if batch_start == 0 and idx == 0:
                                        sample = page_insights[0]
                                        print(f"[Meta API] Sample insight data for campaign {campaign_name}:")
                                        print(f"  date_start: {sample.get('date_start')}")
                                        print(f"  impressions: {sample.get('impressions')}")
                                        print(f"  clicks: {sample.get('clicks')}")
                                        print(f"  inline_link_clicks: {sample.get('inline_link_clicks')}")
                                        print(f"  spend: {sample.get('spend')}")
                                        print(f"  reach: {sample.get('reach')}")
                                        print(f"  frequency: {sample.get('frequency')}")
                                        print(f"  Total insights retrieved: {len(page_insights)}")
                                        # 日付のバリエーションを確認
                                        if len(page_insights) > 1:
                                            dates = [insight.get('date_start') for insight in page_insights[:10] if insight.get('date_start')]
                                            unique_dates = list(set(dates))
                                            print(f"  Sample dates (first 10 insights): {unique_dates}")
                                            print(f"  Unique dates count: {len(unique_dates)}")
                                    
                                    # ページネーション処理（pagingがある場合）
                                    paging = item_body.get('paging', {})
                                    page_count = 1
                                    while 'next' in paging:
                                        page_count += 1
                                        next_url = paging['next']
                                        # next_urlには既にaccess_tokenが含まれている可能性があるため、そのまま使用
                                        print(f"[Meta API] Fetching page {page_count} for {campaign_name}...")
                                        next_response = await client.get(next_url)
                                        next_response.raise_for_status()
                                        next_data = next_response.json()
                                        next_insights = next_data.get('data', [])
                                        all_insights.extend(next_insights)
                                        paging = next_data.get('paging', {})
                                        print(f"[Meta API] Retrieved {len(next_insights)} more insights for {campaign_name} (page {page_count}, total: {len(all_insights)})")
                                        # ページネーションのデバッグ（最初のキャンペーンのみ）
                                        if batch_start == 0 and idx == 0 and len(next_insights) > 0:
                                            next_dates = [d.get('date_start') for d in next_insights[:5] if d.get('date_start')]
                                            print(f"[Meta API] Sample dates from page {page_count}: {next_dates}")
                                    if page_count > 1:
                                        print(f"[Meta API] Completed pagination for {campaign_name}: {page_count} pages, {len([i for i in all_insights if i.get('campaign_name') == campaign_name])} total insights")
                                    
                                    if idx < 3 or (batch_start == 0 and idx == 0):
                                        print(f"  ✓ Success: Retrieved {len(page_insights)} insights for {campaign_name}")
                                else:
                                    if idx < 3:
                                        print(f"  ⚠ No insights data returned for {campaign_name}")
                            except json.JSONDecodeError as e:
                                print(f"[Meta API] Error parsing batch response for {campaign_name}: {str(e)}")
                                print(f"  Response body: {batch_item.get('body', '')[:200]}")
                        else:
                            error_body = batch_item.get('body', '{}')
                            try:
                                error_data = json.loads(error_body) if isinstance(error_body, str) else error_body
                                error_msg = error_data.get('error', {}).get('message', str(error_body))
                                print(f"[Meta API] Error fetching insights for {campaign_name} ({campaign_id}): {error_msg}")
                            except:
                                print(f"[Meta API] Error fetching insights for {campaign_name} ({campaign_id}): {error_body}")
                
                except Exception as e:
                    print(f"[Meta API] Error processing campaign batch {batch_num}: {str(e)}")
                    # バッチエラーが発生しても次のバッチの処理を続行
                    continue
            
            print(f"[Meta API] Campaign-level insights retrieved: {len(all_insights)}")
            
            # ===== 期間別のユニークリーチ数を取得（キャンペーンレベルのみ） =====
            # 7日間、30日間、全期間の3つの期間別のユニークリーチを取得
            print(f"[Meta API] Fetching period unique reach for campaign-level data (7days, 30days, all)...")
            campaign_period_reach_7days_map = {}  # キャンペーン名 -> 7日間のユニークリーチ数
            campaign_period_reach_30days_map = {}  # キャンペーン名 -> 30日間のユニークリーチ数
            campaign_period_reach_all_map = {}  # キャンペーン名 -> 全期間のユニークリーチ数
            
            # キャンペーンレベルのデータのみを対象（ad_set_nameとad_nameが空のデータ）
            campaign_level_campaigns = [c for c in all_campaigns]
            
            # 期間別のtime_rangeを計算
            # 昨日までの日付を使用
            yesterday_dt = until_dt
            yesterday_str = yesterday_dt.strftime('%Y-%m-%d')
            
            # 7日間: 昨日から6日前まで
            seven_days_ago_dt = yesterday_dt - timedelta(days=6)
            seven_days_ago_str = seven_days_ago_dt.strftime('%Y-%m-%d')
            time_range_7days_json = json.dumps({"since": seven_days_ago_str, "until": yesterday_str}, separators=(',', ':'))
            time_range_7days_encoded = urllib.parse.quote(time_range_7days_json, safe='')
            
            # 30日間: 昨日から29日前まで
            thirty_days_ago_dt = yesterday_dt - timedelta(days=29)
            thirty_days_ago_str = thirty_days_ago_dt.strftime('%Y-%m-%d')
            time_range_30days_json = json.dumps({"since": thirty_days_ago_str, "until": yesterday_str}, separators=(',', ':'))
            time_range_30days_encoded = urllib.parse.quote(time_range_30days_json, safe='')
            
            # 全期間: 既存のtime_rangeを使用
            # time_range_encodedは既に計算済み
            
            # time_rangeの情報をログ出力（全期間の場合）
            print(f"[Meta API] 🔍 DEBUG: Time range for 'all' period:")
            print(f"[Meta API]   time_range_dict: {time_range_dict}")
            print(f"[Meta API]   time_range_json: {time_range_json}")
            print(f"[Meta API]   time_range_encoded: {time_range_encoded}")
            print(f"[Meta API]   start_date_str: {start_date_str}")
            print(f"[Meta API]   end_date_str: {end_date_str}")
            
            # 期間別のマップとtime_rangeのペア
            period_configs = [
                ("7days", campaign_period_reach_7days_map, time_range_7days_encoded),
                ("30days", campaign_period_reach_30days_map, time_range_30days_encoded),
                ("all", campaign_period_reach_all_map, time_range_encoded)
            ]
            
            # 各期間についてユニークリーチを取得
            for period_name, period_map, period_time_range_encoded in period_configs:
                print(f"[Meta API] Fetching {period_name} unique reach for campaign-level data...")
                
                for batch_start in range(0, len(campaign_level_campaigns), batch_size):
                    batch_end = min(batch_start + batch_size, len(campaign_level_campaigns))
                    batch_campaigns = campaign_level_campaigns[batch_start:batch_end]
                    batch_num = (batch_start // batch_size) + 1
                    total_batches = (len(campaign_level_campaigns) + batch_size - 1) // batch_size
                    
                    print(f"[Meta API] Processing {period_name} unique reach batch {batch_num}/{total_batches} ({len(batch_campaigns)} campaigns)")
                    
                    batch_requests = []
                    for campaign in batch_campaigns:
                        campaign_id = campaign.get('id')
                        campaign_name_check = campaign.get('name', 'Unknown')
                        # 期間別のユニークリーチ数を取得（time_incrementなし）
                        period_reach_fields = "campaign_id,campaign_name,reach"
                        relative_url = f"{campaign_id}/insights?fields={period_reach_fields}&time_range={period_time_range_encoded}&level=campaign&limit=100"
                        
                        # 「ハイブリッドマーケティング」キャンペーンの場合、リクエストURLをログ出力
                        if 'ハイブリッドマーケティング' in campaign_name_check and period_name == 'all':
                            print(f"[Meta API] 🔍 DEBUG: Request URL for {campaign_name_check} ({period_name}):")
                            print(f"[Meta API]   Campaign ID: {campaign_id}")
                            print(f"[Meta API]   Time Range Encoded: {period_time_range_encoded}")
                            print(f"[Meta API]   Relative URL: {relative_url}")
                        
                        batch_requests.append({
                            "method": "GET",
                            "relative_url": relative_url
                        })
                    
                    try:
                        # バッチリクエストを送信
                        period_batch_params = {
                            "access_token": access_token,
                            "batch": json.dumps(batch_requests, separators=(',', ':'))
                        }
                        batch_response = await client.post(batch_url, params=period_batch_params)
                        batch_response.raise_for_status()
                        batch_data = batch_response.json()
                        
                        for idx, batch_item in enumerate(batch_data):
                            campaign = batch_campaigns[idx]
                            campaign_name = campaign.get('name', 'Unknown')
                            campaign_id = campaign.get('id')
                            
                            if batch_item.get('code') == 200:
                                try:
                                    item_body = json.loads(batch_item.get('body', '{}'))
                                    period_insights = item_body.get('data', [])
                                    
                                    if len(period_insights) > 0:
                                        # 期間全体のデータは1件のみ（time_incrementなしの場合）
                                        insight_data = period_insights[0]
                                        period_reach = safe_int(insight_data.get('reach'), 0)
                                        period_map[campaign_name] = period_reach
                                        print(f"[Meta API] {period_name} unique reach for {campaign_name}: {period_reach:,}")
                                        
                                        # 「ハイブリッドマーケティング」キャンペーンの場合、レスポンスの全データをログ出力
                                        if 'ハイブリッドマーケティング' in campaign_name and period_name == 'all':
                                            print(f"[Meta API] 🔍 DEBUG: Full response data for {campaign_name} ({period_name}):")
                                            print(f"[Meta API]   Raw insight_data: {json.dumps(insight_data, indent=2, ensure_ascii=False)}")
                                            print(f"[Meta API]   Reach value (raw): {insight_data.get('reach')}")
                                            print(f"[Meta API]   Reach value (parsed): {period_reach:,}")
                                            print(f"[Meta API]   Campaign ID: {insight_data.get('campaign_id')}")
                                            print(f"[Meta API]   Campaign Name: {insight_data.get('campaign_name')}")
                                            print(f"[Meta API]   All keys in insight_data: {list(insight_data.keys())}")
                                    else:
                                        print(f"[Meta API] ⚠️ No {period_name} reach data for {campaign_name}")
                                        # 「ハイブリッドマーケティング」キャンペーンの場合、レスポンス全体をログ出力
                                        if 'ハイブリッドマーケティング' in campaign_name and period_name == 'all':
                                            print(f"[Meta API] 🔍 DEBUG: Empty response for {campaign_name} ({period_name}):")
                                            print(f"[Meta API]   Response body: {json.dumps(item_body, indent=2, ensure_ascii=False)}")
                                except json.JSONDecodeError as e:
                                    print(f"[Meta API] Error parsing {period_name} reach response for {campaign_name}: {str(e)}")
                            else:
                                error_body = batch_item.get('body', '{}')
                                try:
                                    error_data = json.loads(error_body) if isinstance(error_body, str) else error_body
                                    error_msg = error_data.get('error', {}).get('message', str(error_body))
                                    print(f"[Meta API] Error fetching {period_name} reach for {campaign_name} ({campaign_id}): {error_msg}")
                                except:
                                    print(f"[Meta API] Error fetching {period_name} reach for {campaign_name} ({campaign_id}): {error_body}")
                    
                    except Exception as e:
                        print(f"[Meta API] Error processing {period_name} reach batch {batch_num}: {str(e)}")
                        continue
                
                print(f"[Meta API] {period_name} unique reach retrieved for {len(period_map)} campaigns")
            
            # 後方互換性のため、全期間の値をperiod_unique_reachにも設定
            campaign_period_reach_map = campaign_period_reach_all_map.copy()
            
            # ===== 広告セットレベルのinsights取得 =====
            print(f"[Meta API] Fetching adset-level insights for account {account_id}...")
            adset_fields = "campaign_id,campaign_name,adset_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
            all_adset_insights = []
            
            for batch_start in range(0, len(all_campaigns), batch_size):
                batch_end = min(batch_start + batch_size, len(all_campaigns))
                batch_campaigns = all_campaigns[batch_start:batch_end]
                batch_num = (batch_start // batch_size) + 1
                total_batches = (len(all_campaigns) + batch_size - 1) // batch_size
                
                print(f"[Meta API] Processing adset-level batch {batch_num}/{total_batches} ({len(batch_campaigns)} campaigns)")
                
                batch_requests = []
                for campaign in batch_campaigns:
                    campaign_id = campaign.get('id')
                    # 広告セットレベルのinsightsを取得
                    relative_url = f"{campaign_id}/insights?level=adset&fields={adset_fields}&time_range={time_range_encoded}&time_increment={time_increment}&limit=100"
                    batch_requests.append({
                        "method": "GET",
                        "relative_url": relative_url
                    })
                
                try:
                    batch_response = await client.post(batch_url, params=batch_params)
                    batch_response.raise_for_status()
                    batch_data = batch_response.json()
                    
                    for idx, batch_item in enumerate(batch_data):
                        campaign = batch_campaigns[idx]
                        campaign_name = campaign.get('name', 'Unknown')
                        campaign_id = campaign.get('id')
                        
                        if batch_item.get('code') == 200:
                            try:
                                item_body = json.loads(batch_item.get('body', '{}'))
                                page_insights = item_body.get('data', [])
                                
                                if len(page_insights) > 0:
                                    all_adset_insights.extend(page_insights)
                                    
                                    # ページネーション処理
                                    paging = item_body.get('paging', {})
                                    page_count = 1
                                    while 'next' in paging:
                                        page_count += 1
                                        next_url = paging['next']
                                        next_response = await client.get(next_url)
                                        next_response.raise_for_status()
                                        next_data = next_response.json()
                                        next_insights = next_data.get('data', [])
                                        all_adset_insights.extend(next_insights)
                                        paging = next_data.get('paging', {})
                                        print(f"[Meta API] Retrieved {len(next_insights)} more adset insights for {campaign_name} (page {page_count}, total: {len(all_adset_insights)})")
                            except json.JSONDecodeError as e:
                                print(f"[Meta API] Error parsing adset batch response for {campaign_name}: {str(e)}")
                        else:
                            error_body = batch_item.get('body', '{}')
                            try:
                                error_data = json.loads(error_body) if isinstance(error_body, str) else error_body
                                error_msg = error_data.get('error', {}).get('message', str(error_body))
                                print(f"[Meta API] Error fetching adset insights for {campaign_name} ({campaign_id}): {error_msg}")
                            except:
                                print(f"[Meta API] Error fetching adset insights for {campaign_name} ({campaign_id}): {error_body}")
                
                except Exception as e:
                    print(f"[Meta API] Error processing adset batch {batch_num}: {str(e)}")
                    continue
            
            print(f"[Meta API] Adset-level insights retrieved: {len(all_adset_insights)}")
            
            # ===== 広告レベルのinsights取得 =====
            print(f"[Meta API] Fetching ad-level insights for account {account_id}...")
            ad_fields = "campaign_id,campaign_name,adset_name,ad_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
            all_ad_insights = []
            
            for batch_start in range(0, len(all_campaigns), batch_size):
                batch_end = min(batch_start + batch_size, len(all_campaigns))
                batch_campaigns = all_campaigns[batch_start:batch_end]
                batch_num = (batch_start // batch_size) + 1
                total_batches = (len(all_campaigns) + batch_size - 1) // batch_size
                
                print(f"[Meta API] Processing ad-level batch {batch_num}/{total_batches} ({len(batch_campaigns)} campaigns)")
                
                batch_requests = []
                for campaign in batch_campaigns:
                    campaign_id = campaign.get('id')
                    # 広告レベルのinsightsを取得
                    relative_url = f"{campaign_id}/insights?level=ad&fields={ad_fields}&time_range={time_range_encoded}&time_increment={time_increment}&limit=100"
                    batch_requests.append({
                        "method": "GET",
                        "relative_url": relative_url
                    })
                
                try:
                    batch_response = await client.post(batch_url, params=batch_params)
                    batch_response.raise_for_status()
                    batch_data = batch_response.json()
                    
                    for idx, batch_item in enumerate(batch_data):
                        campaign = batch_campaigns[idx]
                        campaign_name = campaign.get('name', 'Unknown')
                        campaign_id = campaign.get('id')
                        
                        if batch_item.get('code') == 200:
                            try:
                                item_body = json.loads(batch_item.get('body', '{}'))
                                page_insights = item_body.get('data', [])
                                
                                if len(page_insights) > 0:
                                    all_ad_insights.extend(page_insights)
                                    
                                    # ページネーション処理
                                    paging = item_body.get('paging', {})
                                    page_count = 1
                                    while 'next' in paging:
                                        page_count += 1
                                        next_url = paging['next']
                                        next_response = await client.get(next_url)
                                        next_response.raise_for_status()
                                        next_data = next_response.json()
                                        next_insights = next_data.get('data', [])
                                        all_ad_insights.extend(next_insights)
                                        paging = next_data.get('paging', {})
                                        print(f"[Meta API] Retrieved {len(next_insights)} more ad insights for {campaign_name} (page {page_count}, total: {len(all_ad_insights)})")
                            except json.JSONDecodeError as e:
                                print(f"[Meta API] Error parsing ad batch response for {campaign_name}: {str(e)}")
                        else:
                            error_body = batch_item.get('body', '{}')
                            try:
                                error_data = json.loads(error_body) if isinstance(error_body, str) else error_body
                                error_msg = error_data.get('error', {}).get('message', str(error_body))
                                print(f"[Meta API] Error fetching ad insights for {campaign_name} ({campaign_id}): {error_msg}")
                            except:
                                print(f"[Meta API] Error fetching ad insights for {campaign_name} ({campaign_id}): {error_body}")
                
                except Exception as e:
                    print(f"[Meta API] Error processing ad batch {batch_num}: {str(e)}")
                    continue
            
            print(f"[Meta API] Ad-level insights retrieved: {len(all_ad_insights)}")
            
            # すべてのレベルのinsightsを統合
            all_insights = all_insights + all_adset_insights + all_ad_insights
            print(f"[Meta API] Total insights (all levels): {len(all_insights)} (campaign: {len(all_insights) - len(all_adset_insights) - len(all_ad_insights)}, adset: {len(all_adset_insights)}, ad: {len(all_ad_insights)})")
            
            # 数値の安全なパース関数（Noneや空文字列を0に変換）
            def safe_float(value, default=0.0):
                if value is None or value == '':
                    return default
                try:
                    return float(value)
                except (ValueError, TypeError):
                    return default
            
            def safe_int(value, default=0):
                if value is None or value == '':
                    return default
                try:
                    return int(float(value))  # float経由で変換（文字列の数値も対応）
                except (ValueError, TypeError):
                    return default
            
            # ===== 期間別のユニークリーチ数を取得（キャンペーンレベルのみ） =====
            # 7日間、30日間、全期間の3つの期間別のユニークリーチを取得
            print(f"[Meta API] Fetching period unique reach for campaign-level data (7days, 30days, all)...")
            campaign_period_reach_7days_map = {}  # キャンペーン名 -> 7日間のユニークリーチ数
            campaign_period_reach_30days_map = {}  # キャンペーン名 -> 30日間のユニークリーチ数
            campaign_period_reach_all_map = {}  # キャンペーン名 -> 全期間のユニークリーチ数
            
            # キャンペーンレベルのデータのみを対象（ad_set_nameとad_nameが空のデータ）
            # all_campaignsからキャンペーンIDと名前を取得
            campaign_level_campaigns = [c for c in all_campaigns]
            
            # 期間別のtime_rangeを計算
            # 昨日までの日付を使用
            yesterday_dt = until_dt
            yesterday_str = yesterday_dt.strftime('%Y-%m-%d')
            
            # 7日間: 昨日から6日前まで
            seven_days_ago_dt = yesterday_dt - timedelta(days=6)
            seven_days_ago_str = seven_days_ago_dt.strftime('%Y-%m-%d')
            time_range_7days_json = json.dumps({"since": seven_days_ago_str, "until": yesterday_str}, separators=(',', ':'))
            time_range_7days_encoded = urllib.parse.quote(time_range_7days_json, safe='')
            
            # 30日間: 昨日から29日前まで
            thirty_days_ago_dt = yesterday_dt - timedelta(days=29)
            thirty_days_ago_str = thirty_days_ago_dt.strftime('%Y-%m-%d')
            time_range_30days_json = json.dumps({"since": thirty_days_ago_str, "until": yesterday_str}, separators=(',', ':'))
            time_range_30days_encoded = urllib.parse.quote(time_range_30days_json, safe='')
            
            # 全期間: 既存のtime_rangeを使用
            time_range_encoded = urllib.parse.quote(time_range_json, safe='')
            
            # time_rangeの情報をログ出力（全期間の場合）
            print(f"[Meta API] 🔍 DEBUG: Time range for 'all' period (second location):")
            print(f"[Meta API]   time_range_dict: {time_range_dict}")
            print(f"[Meta API]   time_range_json: {time_range_json}")
            print(f"[Meta API]   time_range_encoded: {time_range_encoded}")
            print(f"[Meta API]   start_date_str: {start_date_str}")
            print(f"[Meta API]   end_date_str: {end_date_str}")
            
            # 期間別のマップとtime_rangeのペア
            period_configs = [
                ("7days", campaign_period_reach_7days_map, time_range_7days_encoded),
                ("30days", campaign_period_reach_30days_map, time_range_30days_encoded),
                ("all", campaign_period_reach_all_map, time_range_encoded)
            ]
            
            if len(campaign_level_campaigns) > 0:
                # 各期間についてユニークリーチを取得
                for period_name, period_map, period_time_range_encoded in period_configs:
                    print(f"[Meta API] Fetching {period_name} unique reach for campaign-level data...")
                    
                    # バッチ処理で期間別のユニークリーチ数を取得
                    batch_size = 50  # Meta APIのバッチリクエスト最大数
                    for batch_start in range(0, len(campaign_level_campaigns), batch_size):
                        batch_end = min(batch_start + batch_size, len(campaign_level_campaigns))
                        batch_campaigns = campaign_level_campaigns[batch_start:batch_end]
                        batch_num = (batch_start // batch_size) + 1
                        total_batches = (len(campaign_level_campaigns) + batch_size - 1) // batch_size
                        
                        print(f"[Meta API] Processing {period_name} unique reach batch {batch_num}/{total_batches} ({len(batch_campaigns)} campaigns)")
                        
                        batch_requests = []
                        for campaign in batch_campaigns:
                            campaign_id = campaign.get('id')
                            campaign_name = campaign.get('name', 'Unknown')
                            # 期間別のユニークリーチ数を取得（time_incrementなしで期間全体の集計データを取得）
                            period_reach_fields = "campaign_id,campaign_name,reach"
                            # time_incrementを指定しないことで、期間全体の集計データ（1件）を取得
                            relative_url = f"{campaign_id}/insights?fields={period_reach_fields}&time_range={period_time_range_encoded}&level=campaign&limit=100"
                            
                            # 「ハイブリッドマーケティング」キャンペーンの場合、リクエストURLをログ出力
                            if 'ハイブリッドマーケティング' in campaign_name and period_name == 'all':
                                print(f"[Meta API] 🔍 DEBUG: Request URL for '{campaign_name}' ({period_name}):")
                                print(f"[Meta API]   Campaign ID: {campaign_id}")
                                print(f"[Meta API]   Time Range Encoded: {period_time_range_encoded}")
                                print(f"[Meta API]   Relative URL: {relative_url}")
                            
                            batch_requests.append({
                                "method": "GET",
                                "relative_url": relative_url
                            })
                        
                        try:
                            batch_response = await client.post(batch_url, params={
                                "access_token": access_token,
                                "batch": json.dumps(batch_requests, separators=(',', ':'))
                            })
                            batch_response.raise_for_status()
                            batch_data = batch_response.json()
                            
                            for idx, batch_item in enumerate(batch_data):
                                campaign = batch_campaigns[idx]
                                campaign_name = campaign.get('name', 'Unknown')
                                
                                if batch_item.get('code') == 200:
                                    try:
                                        item_body = json.loads(batch_item.get('body', '{}'))
                                        period_insights = item_body.get('data', [])
                                        if period_insights:
                                            # time_incrementなしの場合、期間全体のデータは1件のみ
                                            insight_data = period_insights[0]
                                            
                                            # reachフィールドが既にユニークリーチを表している（time_incrementなしの場合）
                                            period_reach = safe_int(insight_data.get('reach', 0), 0)
                                            period_map[campaign_name] = period_reach
                                            print(f"[Meta API] {period_name} unique reach for '{campaign_name}': {period_reach:,}")
                                            
                                            # 「ハイブリッドマーケティング」キャンペーンの場合、レスポンスの全データをログ出力
                                            if 'ハイブリッドマーケティング' in campaign_name and period_name == 'all':
                                                print(f"[Meta API] 🔍 DEBUG: Full response data for '{campaign_name}' ({period_name}):")
                                                print(f"[Meta API]   Raw insight_data: {json.dumps(insight_data, indent=2, ensure_ascii=False)}")
                                                print(f"[Meta API]   Reach value (raw): {insight_data.get('reach')}")
                                                print(f"[Meta API]   Reach value (parsed): {period_reach:,}")
                                                print(f"[Meta API]   Campaign ID: {insight_data.get('campaign_id')}")
                                                print(f"[Meta API]   Campaign Name: {insight_data.get('campaign_name')}")
                                                print(f"[Meta API]   All keys in insight_data: {list(insight_data.keys())}")
                                        else:
                                            print(f"[Meta API] ⚠️ No {period_name} reach data for '{campaign_name}' (empty data array)")
                                            # 「ハイブリッドマーケティング」キャンペーンの場合、レスポンス全体をログ出力
                                            if 'ハイブリッドマーケティング' in campaign_name and period_name == 'all':
                                                print(f"[Meta API] 🔍 DEBUG: Empty response for '{campaign_name}' ({period_name}):")
                                                print(f"[Meta API]   Response body: {json.dumps(item_body, indent=2, ensure_ascii=False)}")
                                    except json.JSONDecodeError as e:
                                        print(f"[Meta API] Error parsing {period_name} reach response for {campaign_name}: {str(e)}")
                                        print(f"[Meta API] Response body: {batch_item.get('body', '{}')}")
                                else:
                                    error_body = batch_item.get('body', '{}')
                                    try:
                                        error_data = json.loads(error_body) if isinstance(error_body, str) else error_body
                                        error_msg = error_data.get('error', {}).get('message', str(error_body))
                                        print(f"[Meta API] Error fetching {period_name} reach for {campaign_name}: {error_msg}")
                                    except:
                                        print(f"[Meta API] Error fetching {period_name} reach for {campaign_name}: {error_body}")
                        except Exception as e:
                            print(f"[Meta API] Error processing {period_name} unique reach batch {batch_num}: {str(e)}")
                            import traceback
                            traceback.print_exc()
                            continue
                    
                    print(f"[Meta API] {period_name} unique reach map created: {len(period_map)} campaigns")
                
                # 後方互換性のため、全期間の値をperiod_unique_reachにも設定
                campaign_period_reach_map = campaign_period_reach_all_map.copy()
                print(f"[Meta API] Period unique reach map created: {len(campaign_period_reach_map)} campaigns")
                print(f"[Meta API] Sample period unique reach values: {dict(list(campaign_period_reach_map.items())[:5])}")
            else:
                print(f"[Meta API] No campaigns found, skipping period unique reach fetch")
                campaign_period_reach_map = {}
            
            # InsightsデータをCampaignテーブルに保存（キャンペーン/広告セット/広告レベル）
            # 既存データの削除は行わない（新規データのみ追加する方式に変更）
            # 過去の日付のデータは確定後は変更されないため、更新処理は不要
            # 新規データのみを追加する実装
            print(f"[Meta API] Starting data sync for account {account_id} (adding new data only, not deleting existing data)")
            
            saved_count = 0
            # 重複チェック用のセット（campaign_name, date, meta_account_idの組み合わせ）
            seen_records = set()
            
            # デバッグ: 取得したInsightsデータの日付バリエーションを確認
            if all_insights:
                all_dates = [insight.get('date_start') for insight in all_insights if insight.get('date_start')]
                unique_dates = sorted(list(set(all_dates)))
                print(f"[Meta API] ===== Insights Data Analysis ======")
                print(f"[Meta API] Total insights retrieved: {len(all_insights)}")
                print(f"[Meta API] Total unique dates: {len(unique_dates)}")
                if len(unique_dates) > 0:
                    print(f"[Meta API] Date range: {unique_dates[0]} to {unique_dates[-1]}")
                    print(f"[Meta API] First 10 unique dates: {unique_dates[:10]}")
                    print(f"[Meta API] Last 10 unique dates: {unique_dates[-10:]}")
                    # 各日付の件数を確認
                    date_counts = {}
                    for date in all_dates:
                        date_counts[date] = date_counts.get(date, 0) + 1
                    print(f"[Meta API] Date distribution (first 10 dates):")
                    for date in unique_dates[:10]:
                        print(f"  {date}: {date_counts.get(date, 0)} insights")
                if len(unique_dates) == 1:
                    print(f"[Meta API] ⚠️ WARNING: All insights have the same date! This indicates time_increment may not be working.")
                    print(f"[Meta API] Requested date range: {start_date_str} to {end_date_str}")
                    print(f"[Meta API] Actual date received: {unique_dates[0]}")
                print(f"[Meta API] =====================================")
            
            for insight in all_insights:
                try:
                    # 日付を取得
                    date_str = insight.get('date_start')
                    if not date_str:
                        print(f"[Meta API] WARNING: Skipping insight with no date_start: {insight}")
                        continue
                    campaign_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    
                    # データを取得（キャンペーン/広告セット/広告レベル）
                    campaign_name = insight.get('campaign_name', 'Unknown')
                    # ad_set_name と ad_name を Meta API のレスポンスから取得
                    ad_set_name = insight.get('adset_name')  # 広告セット名（あれば）
                    ad_name = insight.get('ad_name')          # 広告名（あれば）
                    
                    # 期間別のユニークリーチ数を取得（キャンペーンレベルのみ）
                    # マイグレーション実行前は、period_unique_reachのみを使用
                    period_unique_reach = 0
                    period_unique_reach_7days = 0
                    period_unique_reach_30days = 0
                    period_unique_reach_all = 0
                    
                    if (not ad_set_name or ad_set_name == '') and (not ad_name or ad_name == ''):
                        # 期間別のマップから取得（マイグレーション実行後に有効化）
                        try:
                            period_unique_reach_7days = campaign_period_reach_7days_map.get(campaign_name, 0)
                            period_unique_reach_30days = campaign_period_reach_30days_map.get(campaign_name, 0)
                            period_unique_reach_all = campaign_period_reach_all_map.get(campaign_name, 0)
                        except:
                            # マップが存在しない場合は、全期間のマップから取得
                            period_unique_reach_all = campaign_period_reach_map.get(campaign_name, 0)
                        
                        # 後方互換性のため、全期間の値をperiod_unique_reachにも設定
                        if period_unique_reach_all > 0:
                            period_unique_reach = period_unique_reach_all
                        else:
                            period_unique_reach = campaign_period_reach_map.get(campaign_name, 0)
                    
                    # デバッグログ（最初の数件のみ）
                    if saved_count < 3:
                        print(f"[Meta API] Processing insight: campaign={campaign_name}, date={campaign_date}")
                        print(f"  Raw data: spend={insight.get('spend')}, impressions={insight.get('impressions')}, clicks={insight.get('clicks')}, inline_link_clicks={insight.get('inline_link_clicks')}")
                    
                    spend = safe_float(insight.get('spend'), 0.0)
                    impressions = safe_int(insight.get('impressions'), 0)
                    all_clicks = safe_int(insight.get('clicks'), 0)
                    inline_link_clicks = safe_int(insight.get('inline_link_clicks'), 0)
                    reach = safe_int(insight.get('reach'), 0)
                    
                    # デバッグログ（最初の数件のみ）
                    if saved_count < 3:
                        print(f"  Parsed: spend={spend}, impressions={impressions}, clicks={all_clicks}, inline_link_clicks={inline_link_clicks}, reach={reach}")
                    
                    # クリック数はinline_link_clicksを使用
                    clicks = inline_link_clicks if inline_link_clicks > 0 else all_clicks
                    link_clicks = inline_link_clicks if inline_link_clicks > 0 else all_clicks
                    
                    # エンゲージメント関連のデータを取得
                    engagements = safe_int(insight.get('engagements'), 0)
                    if engagements == 0:
                        actions = insight.get('actions', [])
                        if actions:
                            for action in actions:
                                if action.get('action_type') == 'post_engagement':
                                    engagements += safe_int(action.get('value'), 0)
                    
                    # landing_page_viewsはactionsから抽出
                    landing_page_views = 0
                    actions = insight.get('actions', [])
                    if actions:
                        for action in actions:
                            if action.get('action_type') == 'landing_page_view':
                                landing_page_views += safe_int(action.get('value'), 0)
                    
                    frequency = safe_float(insight.get('frequency'), 0.0)
                    if frequency == 0 and reach > 0:
                        frequency = (impressions / reach) if reach > 0 else 0.0
                    
                    # conversionsとconversion_valueを取得
                    # キャンペーンごとに主要なコンバージョンタイプのみをカウント（すべてを合計しない）
                    # いずれか1つのコンバージョンタイプのみを使用
                    conversions_data = insight.get('conversions', [])
                    conversions = 0
                    conversion_value = 0.0
                    selected_conversion_type = "none"
                    
                    # デバッグログ（最初の数件のみ）
                    if saved_count < 3:
                        print(f"[Meta API] Conversions data for {campaign_name}: {conversions_data}")
                    
                    if conversions_data:
                        # 優先順位に基づいて、最初に見つかった主要なコンバージョンタイプのみをカウント
                        # 優先順位: 購入関連 > 登録関連 > リード関連 > その他
                        found_conversion = False
                        
                        # 1. 購入関連を優先（purchase, omni_purchase, offsite_conversion.fb_pixel_purchase, onsite_conversion.meta_purchase）
                        for conv in conversions_data:
                            if isinstance(conv, dict):
                                action_type = conv.get('action_type', '')
                                if (action_type in ['purchase', 'omni_purchase'] or
                                    action_type == 'offsite_conversion.fb_pixel_purchase' or
                                    action_type == 'onsite_conversion.meta_purchase' or
                                    action_type.startswith('offsite_conversion.fb_pixel_purchase') or
                                    action_type.startswith('onsite_conversion.meta_purchase')):
                                    value = conv.get('value', 0)
                                    try:
                                        conversions = int(value) if isinstance(value, (int, str)) else 0
                                        selected_conversion_type = action_type
                                        found_conversion = True
                                        if saved_count < 3:
                                            print(f"[Meta API] Selected conversion type (purchase): {action_type} = {conversions}")
                                        break
                                    except (ValueError, TypeError):
                                        pass
                        
                        # 2. 購入関連が見つからなかった場合、登録関連をチェック
                        if not found_conversion:
                            for conv in conversions_data:
                                if isinstance(conv, dict):
                                    action_type = conv.get('action_type', '')
                                    if (action_type == 'complete_registration' or
                                        action_type == 'offsite_conversion.fb_pixel_complete_registration' or
                                        action_type.startswith('offsite_conversion.fb_pixel_complete_registration')):
                                        value = conv.get('value', 0)
                                        try:
                                            conversions = int(value) if isinstance(value, (int, str)) else 0
                                            selected_conversion_type = action_type
                                            found_conversion = True
                                            if saved_count < 3:
                                                print(f"[Meta API] Selected conversion type (registration): {action_type} = {conversions}")
                                            break
                                        except (ValueError, TypeError):
                                            pass
                        
                        # 3. 登録関連も見つからなかった場合、リード関連をチェック
                        if not found_conversion:
                            for conv in conversions_data:
                                if isinstance(conv, dict):
                                    action_type = conv.get('action_type', '')
                                    if (action_type == 'lead' or
                                        action_type == 'offsite_conversion.fb_pixel_lead' or
                                        action_type.startswith('offsite_conversion.fb_pixel_lead')):
                                        value = conv.get('value', 0)
                                        try:
                                            conversions = int(value) if isinstance(value, (int, str)) else 0
                                            selected_conversion_type = action_type
                                            found_conversion = True
                                            if saved_count < 3:
                                                print(f"[Meta API] Selected conversion type (lead): {action_type} = {conversions}")
                                            break
                                        except (ValueError, TypeError):
                                            pass
                        
                        # 4. 上記のいずれも見つからなかった場合、最初のコンバージョンタイプを使用
                        if not found_conversion and conversions_data:
                            conv = conversions_data[0]
                            if isinstance(conv, dict):
                                action_type = conv.get('action_type', '')
                                value = conv.get('value', 0)
                                try:
                                    conversions = int(value) if isinstance(value, (int, str)) else 0
                                    selected_conversion_type = action_type
                                    if saved_count < 3:
                                        print(f"[Meta API] Selected conversion type (first available): {action_type} = {conversions}")
                                except (ValueError, TypeError):
                                    conversions = 0
                            else:
                                try:
                                    conversions = int(conv) if isinstance(conv, (int, str)) else 0
                                    selected_conversion_type = "unknown"
                                    if saved_count < 3:
                                        print(f"[Meta API] Selected conversion type (unknown format): {conversions}")
                                except (ValueError, TypeError):
                                    conversions = 0
                    
                    # フォールバック: actionsから取得（conversionsが0の場合のみ）
                    if conversions == 0:
                        actions = insight.get('actions', [])
                        # 同じ優先順位で検索
                        for action in actions:
                            if isinstance(action, dict):
                                action_type = action.get('action_type', '')
                                if (action_type in ['purchase', 'omni_purchase'] or
                                    action_type == 'offsite_conversion.fb_pixel_purchase' or
                                    action_type == 'onsite_conversion.meta_purchase'):
                                    value = action.get('value', 0)
                                    try:
                                        conversions = int(value) if isinstance(value, (int, str)) else 0
                                        selected_conversion_type = action_type
                                        break
                                    except (ValueError, TypeError):
                                        pass
                                elif (action_type == 'complete_registration' or
                                      action_type == 'offsite_conversion.fb_pixel_complete_registration'):
                                    value = action.get('value', 0)
                                    try:
                                        conversions = int(value) if isinstance(value, (int, str)) else 0
                                        selected_conversion_type = action_type
                                        break
                                    except (ValueError, TypeError):
                                        pass
                                elif (action_type == 'lead' or
                                      action_type == 'offsite_conversion.fb_pixel_lead'):
                                    value = action.get('value', 0)
                                    try:
                                        conversions = int(value) if isinstance(value, (int, str)) else 0
                                        selected_conversion_type = action_type
                                        break
                                    except (ValueError, TypeError):
                                        pass
                    
                    # conversion_valueを取得（action_valuesから）
                    # 購入関連のコンバージョンタイプのみを取得（合計しない）
                    action_values = insight.get('action_values', [])
                    conversion_value = 0.0
                    
                    if action_values:
                        # 購入関連のコンバージョン価値のみを取得（最初に見つかったもの）
                        for av in action_values:
                            if isinstance(av, dict):
                                av_type = av.get('action_type', '')
                                if (av_type in ['purchase', 'omni_purchase'] or
                                    av_type == 'offsite_conversion.fb_pixel_purchase' or
                                    av_type == 'onsite_conversion.meta_purchase' or
                                    av_type.startswith('offsite_conversion.fb_pixel_purchase') or
                                    av_type.startswith('onsite_conversion.meta_purchase')):
                                    value = av.get('value', 0)
                                    try:
                                        conversion_value = float(value) if isinstance(value, (int, float, str)) else 0.0
                                        break
                                    except (ValueError, TypeError):
                                        pass
                    
                    # フォールバック: actionsから取得（conversion_valueが0の場合のみ）
                    if conversion_value == 0:
                        actions = insight.get('actions', [])
                        for action in actions:
                            action_type = action.get('action_type', '')
                            if (action_type in ['purchase', 'omni_purchase'] or
                                action_type == 'offsite_conversion.fb_pixel_purchase' or
                                action_type == 'onsite_conversion.meta_purchase'):
                                value = action.get('value', 0)
                                try:
                                    conversion_value = float(value) if isinstance(value, (int, float, str)) else 0.0
                                    break
                                except (ValueError, TypeError):
                                    pass
                    
                    # メトリクスを計算
                    ctr = (clicks / impressions * 100) if impressions > 0 else 0
                    cpc = (spend / clicks) if clicks > 0 else 0
                    cpm = (spend / impressions * 1000) if impressions > 0 else 0
                    cpa = (spend / conversions) if conversions > 0 else 0
                    cvr = (conversions / clicks * 100) if clicks > 0 else 0
                    roas = (conversion_value / spend) if spend > 0 else 0
                    
                    # デバッグログ（最初の数件のみ）
                    if saved_count < 3:
                        print(f"  Final values: spend={spend}, impressions={impressions}, clicks={clicks}, conversions={conversions}, reach={reach}")
                        print(f"  Selected conversion type: {selected_conversion_type}")
                        if clicks > 0:
                            cvr = (conversions / clicks * 100)
                            print(f"  Conversion check: conversions={conversions}, clicks={clicks}, CVR={cvr:.2f}%")
                        else:
                            print(f"  Conversion check: conversions={conversions}, clicks={clicks} (no clicks)")
                    
                    # 重複チェック（同じcampaign_name, ad_set_name, ad_name, date, meta_account_idの組み合わせは1件のみ）
                    record_key = (campaign_name, ad_set_name, ad_name, campaign_date, account_id)
                    if record_key in seen_records:
                        print(f"[Meta API] WARNING: Duplicate record skipped: {campaign_name} / {ad_set_name} / {ad_name} on {campaign_date}")
                        continue
                    seen_records.add(record_key)
                    
                    # 既存データの確認（同じcampaign_name, ad_set_name, ad_name, date, meta_account_idの組み合わせ）
                    existing_campaign = db.query(Campaign).filter(
                        Campaign.user_id == user.id,
                        Campaign.meta_account_id == account_id,
                        Campaign.campaign_name == campaign_name,
                        Campaign.ad_set_name == ad_set_name,
                        Campaign.ad_name == ad_name,
                        Campaign.date == campaign_date
                    ).first()
                    
                    # 期間別のユニークリーチ数を取得（キャンペーンレベルのデータのみ）
                    # マイグレーション実行前は、period_unique_reachのみを使用
                    period_unique_reach = 0
                    period_unique_reach_7days = 0
                    period_unique_reach_30days = 0
                    period_unique_reach_all = 0
                    
                    if not ad_set_name and not ad_name:  # キャンペーンレベルのデータのみ
                        # 期間別のマップから取得（マイグレーション実行後に有効化）
                        try:
                            period_unique_reach_7days = campaign_period_reach_7days_map.get(campaign_name, 0)
                            period_unique_reach_30days = campaign_period_reach_30days_map.get(campaign_name, 0)
                            period_unique_reach_all = campaign_period_reach_all_map.get(campaign_name, 0)
                        except:
                            # マップが存在しない場合は、全期間のマップから取得
                            period_unique_reach_all = campaign_period_reach_map.get(campaign_name, 0)
                        
                        # 後方互換性のため、全期間の値をperiod_unique_reachにも設定
                        if period_unique_reach_all > 0:
                            period_unique_reach = period_unique_reach_all
                        else:
                            period_unique_reach = campaign_period_reach_map.get(campaign_name, 0)
                        
                        # フォールバック: 期間別の値が0の場合、日次のreachを使用（ただし、これは本来の動作ではない）
                        if period_unique_reach == 0 and reach > 0:
                            period_unique_reach = reach
                            print(f"[Meta API] Using daily reach as period_unique_reach (fallback) for '{campaign_name}': {period_unique_reach:,}")
                    
                    # 既存データがある場合の処理
                    if existing_campaign:
                        # キャンペーンレベルのデータで、期間別のperiod_unique_reachを更新（0でも更新）
                        if not ad_set_name and not ad_name:
                            # 期間別の値を更新
                            existing_campaign.period_unique_reach = period_unique_reach  # 後方互換性
                            
                            # 新しいカラムが存在する場合のみ更新（マイグレーション実行後に有効化）
                            try:
                                existing_campaign.period_unique_reach_7days = period_unique_reach_7days
                                existing_campaign.period_unique_reach_30days = period_unique_reach_30days
                                existing_campaign.period_unique_reach_all = period_unique_reach_all
                            except AttributeError:
                                # カラムが存在しない場合は無視（念のため）
                                pass
                            
                            db.commit()
                            print(f"[Meta API] Updated period_unique_reach for existing record: {campaign_name} on {campaign_date} -> 7days:{period_unique_reach_7days:,}, 30days:{period_unique_reach_30days:,}, all:{period_unique_reach_all:,}")
                        else:
                            print(f"[Meta API] Skipping existing record: {campaign_name} / {ad_set_name} / {ad_name} on {campaign_date}")
                        continue
                    
                    # 新規作成（既存データがない場合のみ）
                    campaign = Campaign(
                        user_id=user.id,
                        upload_id=upload.id,
                        meta_account_id=account_id,
                        date=campaign_date,
                        campaign_name=campaign_name,
                        ad_set_name=ad_set_name,  # 広告セット名（あれば）
                        ad_name=ad_name,  # 広告名（あれば）
                        cost=Decimal(str(spend)),
                        impressions=impressions,
                        clicks=clicks,
                        conversions=conversions,
                        conversion_value=Decimal(str(conversion_value)),
                        reach=reach,
                        period_unique_reach=period_unique_reach,  # 後方互換性（全期間の値）
                        engagements=engagements,
                        link_clicks=link_clicks,
                        landing_page_views=landing_page_views,
                        ctr=Decimal(str(round(ctr, 2))),
                        cpc=Decimal(str(round(cpc, 2))),
                        cpm=Decimal(str(round(cpm, 2))),
                        cpa=Decimal(str(round(cpa, 2))),
                        cvr=Decimal(str(round(cvr, 2))),
                        roas=Decimal(str(round(roas, 2)))
                    )
                    
                    # 新しいカラムが存在する場合のみ設定（マイグレーション実行後に有効化）
                    # マイグレーション実行後は、これらのカラムも設定される
                    try:
                        campaign.period_unique_reach_7days = period_unique_reach_7days
                        campaign.period_unique_reach_30days = period_unique_reach_30days
                        campaign.period_unique_reach_all = period_unique_reach_all
                    except AttributeError:
                        # カラムが存在しない場合は無視（念のため）
                        pass
                    
                    db.add(campaign)
                    saved_count += 1
                    
                    # デバッグログ（最初の数件のみ）
                    if saved_count <= 3:
                        print(f"  ✓ Saved campaign record #{saved_count}: {campaign_name} on {campaign_date}")
                except Exception as e:
                    print(f"[Meta API] Error processing insight: {str(e)}")
                    continue
            
            # Uploadレコードを更新
            upload.row_count = saved_count
            if all_insights:
                dates = [datetime.strptime(i.get('date_start', ''), '%Y-%m-%d').date() for i in all_insights if i.get('date_start')]
                if dates:
                    upload.start_date = min(dates)
                    upload.end_date = max(dates)
            
            db.commit()
            print(f"[Meta API] Saved {saved_count} campaign-level records")
    except Exception as e:
        db.rollback()
        raise

@router.get("/accounts/")
async def get_meta_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ユーザーが連携しているMeta広告アカウント（アセット）一覧を取得"""
    try:
        print(f"[Meta Accounts] Getting accounts for user: {current_user.id}")
        
        # Meta APIから全ての広告アカウント情報を取得（アクセストークンがある場合）
        account_names = {}
        all_account_ids_from_api = []
        if current_user.meta_access_token:
            try:
                print(f"[Meta Accounts] Fetching account names from Meta API...")
                async with httpx.AsyncClient() as client:
                    # すべての広告アカウント情報を取得（ページネーション対応）
                    accounts_url = "https://graph.facebook.com/v24.0/me/adaccounts"
                    accounts_params = {
                        "access_token": current_user.meta_access_token,
                        "fields": "account_id,id,name",
                        "limit": 100  # Meta APIの最大取得件数
                    }
                    
                    # ページネーション処理（すべてのアカウントを取得）
                    accounts_page_count = 0
                    while True:
                        accounts_page_count += 1
                        print(f"[Meta Accounts] Fetching accounts page {accounts_page_count}...")
                        accounts_response = await client.get(accounts_url, params=accounts_params)
                        accounts_response.raise_for_status()
                        accounts_data = accounts_response.json()
                        
                        if "data" in accounts_data:
                            for account in accounts_data["data"]:
                                # Meta APIのレスポンスでは、idとaccount_idの両方が存在する可能性がある
                                # idフィールドには act_ プレフィックスが含まれている可能性がある（例: act_343589077304936）
                                # account_idフィールドには act_ プレフィックスが含まれていない可能性がある（例: 343589077304936）
                                account_id_from_id = account.get("id")  # act_343589077304936 の形式
                                account_id_from_account_id = account.get("account_id")  # 343589077304936 の形式
                                
                                # account_idを決定（act_プレフィックスを削除した形式を使用）
                                if account_id_from_account_id:
                                    account_id = account_id_from_account_id
                                elif account_id_from_id:
                                    # idフィールドから act_ プレフィックスを削除
                                    account_id = account_id_from_id.replace("act_", "") if account_id_from_id.startswith("act_") else account_id_from_id
                                else:
                                    continue
                                
                                account_name = account.get("name")
                                if not account_name or account_name.strip() == "":
                                    account_name = account_id
                                print(f"[Meta Accounts] Account ID: {account_id}, Name: {account_name}")
                                # account_idとidの両方のキーで保存（どちらでも検索できるように）
                                account_names[account_id] = account_name
                                if account_id_from_id and account_id_from_id != account_id:
                                    account_names[account_id_from_id] = account_name
                                    # act_プレフィックスなしの形式も保存
                                    account_id_without_act = account_id_from_id.replace("act_", "") if account_id_from_id.startswith("act_") else account_id_from_id
                                    if account_id_without_act != account_id:
                                        account_names[account_id_without_act] = account_name
                                all_account_ids_from_api.append(account_id)
                        
                        print(f"[Meta Accounts] Retrieved {len(accounts_data.get('data', []))} accounts (total: {len(all_account_ids_from_api)})")
                        
                        # 次のページがあるかチェック
                        paging = accounts_data.get('paging', {})
                        next_url = paging.get('next')
                        
                        if not next_url:
                            # 次のページがない場合は終了
                            print(f"[Meta Accounts] No more account pages. Total accounts retrieved: {len(all_account_ids_from_api)}")
                            break
                        
                        # 次のページのURLを設定（パラメータをクリア）
                        accounts_url = next_url
                        accounts_params = {}
                    
                    print(f"[Meta Accounts] Fetched {len(account_names)} account names from Meta API")
                    print(f"[Meta Accounts] Account names dict: {account_names}")
                    print(f"[Meta Accounts] All account IDs from API: {all_account_ids_from_api}")
            except Exception as e:
                import traceback
                print(f"[Meta Accounts] Error fetching account names: {str(e)}")
                print(f"[Meta Accounts] Error details: {traceback.format_exc()}")
                # エラーが発生した場合、データベースから取得したアカウントIDを使用
        
        # Meta APIから取得したアカウントIDを使用（なければデータベースから取得）
        if all_account_ids_from_api:
            account_ids = all_account_ids_from_api
            print(f"[Meta Accounts] Using {len(account_ids)} account IDs from Meta API")
        else:
            # Meta APIから取得できなかった場合、データベースから取得
            accounts = db.query(Campaign.meta_account_id).filter(
                Campaign.user_id == current_user.id,
                Campaign.meta_account_id.isnot(None)
            ).distinct().all()
            account_ids = [acc[0] for acc in accounts if acc[0]]
            print(f"[Meta Accounts] Using {len(account_ids)} account IDs from database (fallback)")
            
            # データベースから取得したアカウントIDの場合でも、Meta APIからアカウント名を取得を試みる
            if account_ids and current_user.meta_access_token:
                # account_namesにデータがないアカウントIDのみ取得
                missing_names = [aid for aid in account_ids if aid not in account_names]
                if missing_names:
                    try:
                        print(f"[Meta Accounts] Attempting to fetch account names for {len(missing_names)} accounts from database")
                        async with httpx.AsyncClient() as client:
                            for account_id in missing_names:
                                try:
                                    # 個別にアカウント情報を取得
                                    account_url = f"https://graph.facebook.com/v24.0/{account_id}"
                                    account_params = {
                                        "access_token": current_user.meta_access_token,
                                        "fields": "account_id,id,name"
                                    }
                                    account_response = await client.get(account_url, params=account_params)
                                    account_response.raise_for_status()
                                    account_data = account_response.json()
                                    
                                    # エラーチェック
                                    if "error" in account_data:
                                        print(f"[Meta Accounts] Error from Meta API for {account_id}: {account_data.get('error')}")
                                        account_names[account_id] = account_id
                                        continue
                                    
                                    account_name = account_data.get("name")
                                    if account_name and account_name.strip():
                                        account_names[account_id] = account_name
                                        print(f"[Meta Accounts] Fetched name for {account_id}: {account_name}")
                                    else:
                                        account_names[account_id] = account_id
                                        print(f"[Meta Accounts] Name is empty for {account_id}, using account_id")
                                except Exception as e:
                                    print(f"[Meta Accounts] Error fetching name for {account_id}: {str(e)}")
                                    account_names[account_id] = account_id
                    except Exception as e:
                        print(f"[Meta Accounts] Error fetching account names from Meta API: {str(e)}")
                        # エラーが発生した場合、account_idをそのまま使用
                        for account_id in missing_names:
                            if account_id not in account_names:
                                account_names[account_id] = account_id
        
        # データベースに実際に保存されているmeta_account_idの形式を確認
        existing_account_ids = db.query(Campaign.meta_account_id).filter(
            Campaign.user_id == current_user.id,
            Campaign.meta_account_id.isnot(None)
        ).distinct().all()
        existing_account_ids_list = [acc[0] for acc in existing_account_ids if acc[0]]
        print(f"[Meta Accounts] Existing meta_account_ids in DB: {existing_account_ids_list}")
        
        # 各アカウントの統計情報を取得
        result = []
        for account_id in account_ids:
            try:
                # account_idの形式を確認（act_プレフィックスがあるかどうか）
                # Meta APIから取得したaccount_idは act_ プレフィックスなしの形式（例: 343589077304936）
                # データベースには act_343589077304936 の形式で保存されている
                # データベースの形式（act_付き）で検索する
                account_id_with_prefix = f"act_{account_id}" if not account_id.startswith("act_") else account_id
                account_id_without_prefix = account_id.replace("act_", "") if account_id.startswith("act_") else account_id
                
                print(f"[Meta Accounts] Searching for account_id: {account_id} (with prefix: {account_id_with_prefix}, without prefix: {account_id_without_prefix})")
                
                # データベースに実際に存在する形式を確認
                matching_ids = [aid for aid in existing_account_ids_list if account_id_with_prefix == aid or account_id_without_prefix == aid.replace("act_", "")]
                print(f"[Meta Accounts] Matching account_ids in DB: {matching_ids}")
                
                # 各アカウントのデータ件数を取得（全レベル合計）
                # データベースには act_ プレフィックス付きで保存されているので、それで検索
                total_count = db.query(Campaign).filter(
                    Campaign.user_id == current_user.id,
                    Campaign.meta_account_id == account_id_with_prefix
                ).count()
                
                print(f"[Meta Accounts] Query result for {account_id} (searching with {account_id_with_prefix}): total_count={total_count}")
                
                # ユニークなキャンペーン数を取得
                unique_campaigns = db.query(Campaign.campaign_name).filter(
                    Campaign.user_id == current_user.id,
                    Campaign.meta_account_id == account_id_with_prefix,
                    or_(
                        Campaign.ad_set_name == '',
                        Campaign.ad_set_name.is_(None)
                    ),
                    or_(
                        Campaign.ad_name == '',
                        Campaign.ad_name.is_(None)
                    )
                ).distinct().count()
                
                # 最新のデータ日付を取得
                latest_date = db.query(func.max(Campaign.date)).filter(
                    Campaign.user_id == current_user.id,
                    Campaign.meta_account_id == account_id_with_prefix
                ).scalar()
                
                # アカウント名を取得（Meta APIから取得できた場合はそれを使用、なければアカウントID）
                account_name = account_names.get(account_id)
                if not account_name or account_name.strip() == "":
                    # account_namesにデータがない場合、Meta APIから個別に取得を試みる
                    if current_user.meta_access_token:
                        try:
                            async with httpx.AsyncClient() as client:
                                account_url = f"https://graph.facebook.com/v24.0/{account_id}"
                                account_params = {
                                    "access_token": current_user.meta_access_token,
                                    "fields": "account_id,id,name"
                                }
                                account_response = await client.get(account_url, params=account_params)
                                account_response.raise_for_status()
                                account_data = account_response.json()
                                
                                if "error" not in account_data and "name" in account_data:
                                    account_name = account_data.get("name")
                                    if account_name and account_name.strip():
                                        account_names[account_id] = account_name
                                        print(f"[Meta Accounts] Fetched name for {account_id}: {account_name}")
                                    else:
                                        account_name = account_id
                                else:
                                    account_name = account_id
                        except Exception as e:
                            print(f"[Meta Accounts] Error fetching name for {account_id}: {str(e)}")
                            account_name = account_id
                    else:
                        account_name = account_id
                
                print(f"[Meta Accounts] For account_id {account_id}, final name: {account_name}")
                print(f"[Meta Accounts] Account {account_id} stats: data_count={total_count}, campaign_count={unique_campaigns}")
                
                # nameが空の場合はaccount_idを使用
                final_name = account_name if account_name and account_name.strip() else account_id
                
                account_result = {
                    "account_id": account_id,
                    "name": final_name,
                    "data_count": total_count,
                    "campaign_count": unique_campaigns,
                    "latest_date": str(latest_date) if latest_date else None
                }
                print(f"[Meta Accounts] Account result: {account_result}")
                result.append(account_result)
            except Exception as e:
                import traceback
                print(f"[Meta Accounts] Error processing account {account_id}: {str(e)}")
                print(f"[Meta Accounts] Error details: {traceback.format_exc()}")
                # エラーが発生したアカウントはスキップして続行
                continue
        
        print(f"[Meta Accounts] Returning {len(result)} accounts")
        return {
            "accounts": result,
            "total": len(result)
        }
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta Accounts] Unexpected error: {str(e)}")
        print(f"[Meta Accounts] Error type: {type(e).__name__}")
        print(f"[Meta Accounts] Error details: {error_details}")
        raise HTTPException(
            status_code=500,
            detail=f"アセット情報の取得に失敗しました: {str(e)}"
        )

@router.delete("/delete-all")
async def delete_all_meta_data(
    account_id: Optional[str] = Query(None, description="削除するMeta広告アカウントID（指定しない場合は全アカウント + CSVデータ）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    本番環境テスト用: ユーザーの全期間MetaデータとCSVデータを削除
    """
    try:
        print(f"[Meta Delete All] Starting deletion for user: {current_user.id}")
        
        total_deleted = 0
        
        if account_id:
            # 指定されたアカウントのMeta APIデータのみ削除（全レベル）
            delete_query = db.query(Campaign).filter(
                Campaign.user_id == current_user.id,
                Campaign.meta_account_id == account_id
            )
            print(f"[Meta Delete All] Filtering by account_id: {account_id} (Meta API data only)")
            count_before = delete_query.count()
            print(f"[Meta Delete All] Records to delete: {count_before}")
            
            if count_before > 0:
                deleted_count = delete_query.delete(synchronize_session=False)
                total_deleted += deleted_count
                print(f"[Meta Delete All] Deleted {deleted_count} Meta API records for account {account_id}")
        else:
            # 全データを削除（Meta APIデータ + CSVデータ、全レベル）
            # まず、削除前のレコード数を取得
            count_before = db.query(Campaign).filter(
                Campaign.user_id == current_user.id
            ).count()
            print(f"[Meta Delete All] Total records to delete: {count_before}")
            
            if count_before == 0:
                return {
                    "status": "success",
                    "message": "削除するデータがありませんでした",
                    "deleted_count": 0
                }
            
            # 全データを削除（Meta APIデータ + CSVデータ、全レベル）
            delete_query = db.query(Campaign).filter(
                Campaign.user_id == current_user.id
            )
            deleted_count = delete_query.delete(synchronize_session=False)
            total_deleted = deleted_count
            print(f"[Meta Delete All] Deleted {deleted_count} total records (Meta API + CSV, all levels)")
        
        # コミットして削除を確定
        db.commit()
        print(f"[Meta Delete All] Successfully committed deletion: {total_deleted} records")
        
        # 削除後のレコード数を確認
        count_after = db.query(Campaign).filter(
            Campaign.user_id == current_user.id
        ).count()
        print(f"[Meta Delete All] Records remaining after deletion: {count_after}")
        
        return {
            "status": "success",
            "message": f"{total_deleted}件のデータを削除しました（Meta APIデータ + CSVデータ、全レベル）",
            "deleted_count": total_deleted,
            "remaining_count": count_after
        }
    except Exception as e:
        db.rollback()
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta Delete All] Error: {str(e)}")
        print(f"[Meta Delete All] Error details: {error_details}")
        raise HTTPException(
            status_code=500,
            detail=f"データ削除エラー: {str(e)}"
        )

@router.post("/sync-all")
async def sync_all_meta_data(
    account_id: Optional[str] = Query(None, description="同期するMeta広告アカウントID（指定しない場合は全アカウント）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    本番環境テスト用: ユーザーの全期間Metaデータを再取得
    """
    try:
        print(f"[Meta Sync All] Starting full period sync for user: {current_user.id}")
        
        # ユーザーのMetaアカウント情報を確認
        if not current_user.meta_access_token:
            raise HTTPException(
                status_code=400,
                detail="Metaアクセストークンが設定されていません"
            )
        
        # アカウントIDのリストを取得
        if account_id:
            # 指定されたアカウントIDのみ
            account_ids = [account_id]
            print(f"[Meta Sync All] Syncing specific account: {account_id}")
        else:
            # 全アカウントを取得
            try:
                async with httpx.AsyncClient() as client:
                    accounts_url = "https://graph.facebook.com/v24.0/me/adaccounts"
                    accounts_params = {
                        "access_token": current_user.meta_access_token,
                        "fields": "id,name",
                        "limit": 100
                    }
                    
                    accounts_response = await client.get(accounts_url, params=accounts_params)
                    accounts_response.raise_for_status()
                    accounts_data = accounts_response.json()
                    
                    account_ids = [acc.get("id") for acc in accounts_data.get("data", [])]
                    print(f"[Meta Sync All] Found {len(account_ids)} accounts to sync")
            except Exception as e:
                import traceback
                print(f"[Meta Sync All] Error fetching accounts: {str(e)}")
                print(f"[Meta Sync All] Error details: {traceback.format_exc()}")
                raise HTTPException(
                    status_code=500,
                    detail=f"アカウント取得エラー: {str(e)}"
                )
        
        if not account_ids:
            raise HTTPException(
                status_code=400,
                detail="同期するアカウントが見つかりませんでした"
            )
        
        # 各アカウントの全期間データを取得
        # まず、全アカウントの全期間データを削除（sync_meta_data_to_campaigns内の削除処理は期間内のみのため）
        # CSVデータも含めて全データを削除（重複を防ぐため）
        print(f"[Meta Sync All] Deleting all existing data (including CSV data) for {len(account_ids)} account(s) before sync...")
        
        # 1. Meta APIデータ（meta_account_idが設定されている）を削除
        for acc_id in account_ids:
            try:
                # このアカウントの全期間データを削除（期間制限なし）
                delete_count = db.query(Campaign).filter(
                    Campaign.user_id == current_user.id,
                    Campaign.meta_account_id == acc_id,
                    Campaign.ad_set_name.is_(None),
                    Campaign.ad_name.is_(None)
                ).delete(synchronize_session=False)
                print(f"[Meta Sync All] Deleted {delete_count} Meta API records for account {acc_id}")
            except Exception as e:
                import traceback
                print(f"[Meta Sync All] Error deleting Meta API data for account {acc_id}: {str(e)}")
                print(f"[Meta Sync All] Error details: {traceback.format_exc()}")
        
        # 2. CSVアップロードデータ（meta_account_idがNULL）も削除（重複を防ぐため）
        try:
            csv_delete_count = db.query(Campaign).filter(
                Campaign.user_id == current_user.id,
                or_(
                    Campaign.meta_account_id.is_(None),
                    Campaign.meta_account_id == ''
                ),
                Campaign.ad_set_name.is_(None),
                Campaign.ad_name.is_(None)
            ).delete(synchronize_session=False)
            print(f"[Meta Sync All] Deleted {csv_delete_count} CSV upload records")
        except Exception as e:
            import traceback
            print(f"[Meta Sync All] Error deleting CSV data: {str(e)}")
            print(f"[Meta Sync All] Error details: {traceback.format_exc()}")
        
        # コミットして削除を確定
        db.commit()
        print(f"[Meta Sync All] Deletion completed (Meta API + CSV data), starting data sync...")
        
        total_synced = 0
        results = []
        
        for idx, acc_id in enumerate(account_ids):
            try:
                print(f"[Meta Sync All] Syncing account {idx + 1}/{len(account_ids)}: {acc_id}")
                await sync_meta_data_to_campaigns(
                    current_user,
                    current_user.meta_access_token,
                    acc_id,
                    db,
                    days=None  # 全期間（37ヶ月）
                )
                total_synced += 1
                results.append({
                    "account_id": acc_id,
                    "status": "success"
                })
                print(f"[Meta Sync All] Successfully synced account: {acc_id}")
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"[Meta Sync All] Error syncing account {acc_id}: {str(e)}")
                print(f"[Meta Sync All] Error details: {error_details}")
                results.append({
                    "account_id": acc_id,
                    "status": "error",
                    "error": str(e)
                })
                # 1つのアカウントでエラーが発生しても、他のアカウントの同期は続行
                continue
        
        return {
            "status": "success",
            "message": f"{total_synced}/{len(account_ids)}アカウントのデータを同期しました",
            "total_accounts": len(account_ids),
            "synced_accounts": total_synced,
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta Sync All] Unexpected error: {str(e)}")
        print(f"[Meta Sync All] Error details: {error_details}")
        raise HTTPException(
            status_code=500,
            detail=f"データ同期エラー: {str(e)}"
        )

@router.get("/insights")
async def get_meta_insights(
    since: Optional[str] = None,
    until: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ユーザーのMetaアカウント情報を使用してキャンペーンレベルのInsightsを取得（広告セット・広告レベルは取得しない）"""
    
    # ユーザーのMetaアカウント情報を確認
    if not current_user.meta_account_id or not current_user.meta_access_token:
        raise HTTPException(
            status_code=400,
            detail="Metaアカウント情報が設定されていません。設定画面でMetaアカウント情報を登録してください。"
        )
    
    # デフォルトの日付範囲（最近37ヶ月間、未来の日付を避ける）
    # JST（日本時間）で昨日を計算
    from datetime import timezone
    jst = timezone(timedelta(hours=9))  # JST = UTC+9
    today_jst = datetime.now(jst).date()
    yesterday = today_jst - timedelta(days=1)
    
    if not since:
        until_dt = yesterday
        since_dt = until_dt - timedelta(days=1095)  # 37ヶ月
        since = since_dt.strftime('%Y-%m-%d')
    if not until:
        until = yesterday.strftime('%Y-%m-%d')
    
    # Meta APIの期間制限を確認
    campaign_fields = "campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
    has_reach = "reach" in campaign_fields.lower()
    has_breakdowns = False  # 現在の実装ではbreakdownsパラメータを使用していない
    
    if has_reach and has_breakdowns:
        max_days = 394  # 13ヶ月
        print(f"[Meta API] /insights endpoint: Reach with breakdowns detected - limiting to 13 months")
    else:
        max_days = 1095  # 37ヶ月
        print(f"[Meta API] /insights endpoint: Standard limit - 37 months")
    
    # 期間を制限（37ヶ月または13ヶ月）
    try:
        until_dt = datetime.strptime(until, '%Y-%m-%d')
        since_dt = datetime.strptime(since, '%Y-%m-%d')
        
        if (until_dt - since_dt).days > max_days:
            since_dt = until_dt - timedelta(days=max_days)
            since = since_dt.strftime('%Y-%m-%d')
            print(f"[Meta API] Date range limited to {max_days} days: {since} to {until}")
    except Exception as e:
        print(f"[Meta API] Error parsing dates: {e}")
        # デフォルトで最近37ヶ月間（JST基準）
        until_dt = yesterday
        since_dt = until_dt - timedelta(days=1095)  # 37ヶ月
        since = since_dt.strftime('%Y-%m-%d')
        until = until_dt.strftime('%Y-%m-%d')
    
    # Meta Graph APIを呼び出し（キャンペーンレベルのみ）
    account_id = current_user.meta_account_id
    access_token = current_user.meta_access_token
    
    try:
        async with httpx.AsyncClient() as client:
            all_insights = []
            
            # キャンペーン一覧を取得
            campaigns_url = f"https://graph.facebook.com/v24.0/{account_id}/campaigns"
            campaigns_params = {
                "access_token": access_token,
                "fields": "id,name",
                "limit": 100
            }
            
            all_campaigns = []
            while True:
                campaigns_response = await client.get(campaigns_url, params=campaigns_params)
                campaigns_response.raise_for_status()
                campaigns_data = campaigns_response.json()
                page_campaigns = campaigns_data.get('data', [])
                all_campaigns.extend(page_campaigns)
                
                paging = campaigns_data.get('paging', {})
                next_url = paging.get('next')
                if not next_url:
                    break
                campaigns_url = next_url
                campaigns_params = {}
            
            # 各キャンペーンのInsightsを取得（キャンペーンレベルのみ）
            time_range_dict = {"since": since, "until": until}
            time_range_json = json.dumps(time_range_dict, separators=(',', ':'))
            
            for campaign in all_campaigns:
                campaign_id = campaign['id']
                insights_url = f"https://graph.facebook.com/v24.0/{campaign_id}/insights"
                insights_params = {
                    "access_token": access_token,
                    "fields": campaign_fields,
                    "time_range": time_range_json,
                    "level": "campaign",
                    "limit": 100
                }
                
                try:
                    insights_response = await client.get(insights_url, params=insights_params)
                    insights_response.raise_for_status()
                    insights_data = insights_response.json()
                    page_insights = insights_data.get('data', [])
                    all_insights.extend(page_insights)
                    
                    # ページネーション処理
                    paging = insights_data.get('paging', {})
                    while 'next' in paging:
                        next_url = paging['next']
                        next_response = await client.get(next_url)
                        next_response.raise_for_status()
                        next_data = next_response.json()
                        next_insights = next_data.get('data', [])
                        all_insights.extend(next_insights)
                        paging = next_data.get('paging', {})
                except Exception as e:
                    print(f"[Meta API] Error fetching insights for campaign {campaign_id}: {str(e)}")
                    continue
            
            return {
                "insights": all_insights,
                "total": len(all_insights),
                "period": {
                "since": since,
                    "until": until
                }
            }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Insights取得エラー: {str(e)}"
        )

@router.get("/oauth/authorize")
async def meta_oauth_authorize(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Meta OAuth認証を開始 - 認証URLを生成してリダイレクト"""
    if not settings.META_APP_ID:
        raise HTTPException(
            status_code=500,
            detail="Meta OAuthが設定されていません。管理者に連絡してください。"
        )

@router.get("/oauth/authorize")
async def meta_oauth_authorize(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Meta OAuth認証を開始 - 認証URLを生成してリダイレクト"""
    if not settings.META_APP_ID:
        raise HTTPException(
            status_code=500,
            detail="Meta OAuthが設定されていません。管理者に連絡してください。"
        )
    
    # リダイレクトURIを設定（デフォルト値を固定）
    redirect_uri = settings.META_REDIRECT_URI or "https://mieru-ai-production.up.railway.app/api/meta/oauth/callback"
    
    # フロントエンドURLをリクエストヘッダーから取得（X-Frontend-URL）またはOrigin/Refererから判定
    frontend_url_from_header = request.headers.get("X-Frontend-URL")
    origin = request.headers.get("origin") or request.headers.get("referer", "")
    
    # ローカル環境からのリクエストかどうかを判定
    is_local = (
        frontend_url_from_header and (
            "localhost" in frontend_url_from_header or 
            "127.0.0.1" in frontend_url_from_header
        )
    ) or (
        "localhost" in origin or 
        "127.0.0.1" in origin or
        "localhost:3000" in origin or
        "localhost:5173" in origin or
        origin.startswith("http://localhost") or
        origin.startswith("http://127.0.0.1")
    )
    
    if is_local:
        frontend_url_for_state = "http://localhost:3000"
    else:
        frontend_url_for_state = settings.FRONTEND_URL or "https://mieru.netlify.app"
    
    print(f"[Meta OAuth] Frontend URL from header (X-Frontend-URL): {frontend_url_from_header}")
    print(f"[Meta OAuth] Origin: {origin}")
    print(f"[Meta OAuth] Detected frontend URL for state: {frontend_url_for_state}")
    
    # ステートパラメータを生成（CSRF対策）
    state = secrets.token_urlsafe(32)
    # ステートにユーザーIDとフロントエンドURLを含める（簡易版）
    # フォーマット: {state}:{user_id}:{frontend_url}
    state_with_user = f"{state}:{current_user.id}:{urllib.parse.quote(frontend_url_for_state)}"
    
    # デバッグ: パラメータの値をログ出力
    print(f"[Meta OAuth] OAuth URL Parameters (authorize endpoint):")
    print(f"  - client_id: {settings.META_APP_ID}")
    print(f"  - redirect_uri (raw): {redirect_uri}")
    print(f"  - redirect_uri (encoded): {urllib.parse.quote(redirect_uri)}")
    print(f"  - scope: ads_read,ads_management,business_management")
    print(f"  - response_type: code")
    print(f"  - state (raw): {state_with_user}")
    print(f"  - state (encoded): {urllib.parse.quote(state_with_user)}")
    
    # Meta OAuth認証URLを生成
    oauth_url = (
        f"https://www.facebook.com/v24.0/dialog/oauth?"
        f"client_id={settings.META_APP_ID}&"
        f"redirect_uri={urllib.parse.quote(redirect_uri)}&"
        f"scope=ads_read,ads_management,business_management&"
        f"state={urllib.parse.quote(state_with_user)}&"
        f"response_type=code"
    )
    
    # デバッグ: 生成されたURL全体をログ出力
    print(f"[Meta OAuth] Generated OAuth URL (authorize endpoint): {oauth_url}")
    
    return RedirectResponse(url=oauth_url)

@router.get("/oauth/authorize-url/")
async def meta_oauth_authorize_url(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Meta OAuth認証URLを取得（JSON形式で返す）"""
    try:
        if not settings.META_APP_ID:
            raise HTTPException(
                status_code=500,
                detail="Meta OAuthが設定されていません。バックエンドの環境変数にMETA_APP_IDを設定してください。"
            )
        
        # リダイレクトURIを設定（デフォルト値を固定）
        redirect_uri = settings.META_REDIRECT_URI or "https://mieru-ai-production.up.railway.app/api/meta/oauth/callback"
        
        # フロントエンドURLをリクエストヘッダーから取得（X-Frontend-URL）またはOrigin/Refererから判定
        frontend_url_from_header = request.headers.get("X-Frontend-URL")
        origin = request.headers.get("origin") or request.headers.get("referer", "")
        
        # ローカル環境からのリクエストかどうかを判定
        is_local = (
            frontend_url_from_header and (
                "localhost" in frontend_url_from_header or 
                "127.0.0.1" in frontend_url_from_header
            )
        ) or (
            "localhost" in origin or 
            "127.0.0.1" in origin or
            "localhost:3000" in origin or
            "localhost:5173" in origin or
            origin.startswith("http://localhost") or
            origin.startswith("http://127.0.0.1")
        )
        
        if is_local:
            frontend_url_for_state = "http://localhost:3000"
        else:
            frontend_url_for_state = settings.FRONTEND_URL or "https://mieru.netlify.app"
        
        print(f"[Meta OAuth] Frontend URL from header (X-Frontend-URL): {frontend_url_from_header}")
        print(f"[Meta OAuth] Origin: {origin}")
        print(f"[Meta OAuth] Detected frontend URL for state: {frontend_url_for_state}")
        
        # ステートパラメータを生成（CSRF対策）
        state = secrets.token_urlsafe(32)
        # ステートにユーザーIDとフロントエンドURLを含める（簡易版）
        # フォーマット: {state}:{user_id}:{frontend_url}
        state_with_user = f"{state}:{current_user.id}:{urllib.parse.quote(frontend_url_for_state)}"
        
        # デバッグ: パラメータの値をログ出力
        print(f"[Meta OAuth] OAuth URL Parameters:")
        print(f"  - client_id: {settings.META_APP_ID}")
        print(f"  - redirect_uri (raw): {redirect_uri}")
        print(f"  - redirect_uri (encoded): {urllib.parse.quote(redirect_uri)}")
        print(f"  - scope: ads_read,ads_management,business_management")
        print(f"  - response_type: code")
        print(f"  - state (raw): {state_with_user}")
        print(f"  - state (encoded): {urllib.parse.quote(state_with_user)}")
        
        # Meta OAuth認証URLを生成
        oauth_url = (
            f"https://www.facebook.com/v24.0/dialog/oauth?"
            f"client_id={settings.META_APP_ID}&"
            f"redirect_uri={urllib.parse.quote(redirect_uri)}&"
            f"scope=ads_read,ads_management,business_management&"
            f"state={urllib.parse.quote(state_with_user)}&"
            f"response_type=code"
        )
        
        # デバッグ: 生成されたURL全体をログ出力
        print(f"[Meta OAuth] Generated OAuth URL: {oauth_url}")
        
        return {"oauth_url": oauth_url}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta OAuth] Error in authorize-url: {str(e)}")
        print(f"[Meta OAuth] Error details: {error_details}")
        raise HTTPException(
            status_code=500,
            detail=f"OAuth認証URLの生成に失敗しました: {str(e)}"
        )

@router.get("/oauth/callback/")
async def meta_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None, description="OAuth認証コード"),
    state: Optional[str] = Query(None, description="ステートパラメータ（CSRF対策）"),
    error: Optional[str] = Query(None, description="エラーメッセージ"),
    error_reason: Optional[str] = Query(None, description="エラー理由"),
    error_description: Optional[str] = Query(None, description="エラー詳細"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Meta OAuthコールバック - トークンを取得して保存"""
    # フロントエンドURLは後でstateパラメータから取得する（初期値として設定）
    frontend_url = settings.FRONTEND_URL or "https://mieru.netlify.app"
    
    # localhostの場合、https://をhttp://に強制的に変換するヘルパー関数
    def normalize_localhost_url(url: str) -> str:
        """localhostのURLを常にhttp://に変換（https://は許可しない）"""
        if not url:
            return url
        # localhostまたは127.0.0.1の場合、https://をhttp://に強制変換
        # より堅牢な変換: 正規表現ではなく、文字列の開始部分をチェック
        original_url = url
        if url.startswith('https://localhost') or url.startswith('https://127.0.0.1'):
            normalized = url.replace('https://', 'http://', 1)  # 最初の1回のみ置換
            print(f"[Meta OAuth] Normalized URL: {original_url} -> {normalized}")
            return normalized
        elif 'localhost' in url or '127.0.0.1' in url:
            # 念のため、URL内のどこかにhttps://localhostやhttps://127.0.0.1が含まれている場合も変換
            normalized = url.replace('https://localhost', 'http://localhost')
            normalized = normalized.replace('https://127.0.0.1', 'http://127.0.0.1')
            if normalized != url:
                print(f"[Meta OAuth] Normalized URL (fallback): {original_url} -> {normalized}")
            return normalized
        return url
    
    # エラーパラメータが存在する場合（認証拒否など）
    if error:
        error_message = error_description or error_reason or error
        error_url = f"{normalize_localhost_url(frontend_url)}/settings?meta_oauth=error&message={urllib.parse.quote(error_message)}"
        # 最終確認: error_urlがhttps://localhostを含んでいないことを確認
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    
    # codeとstateが必須
    if not code:
        error_url = f"{normalize_localhost_url(frontend_url)}/settings?meta_oauth=error&message={urllib.parse.quote('認証コードが取得できませんでした')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    
    if not state:
        error_url = f"{normalize_localhost_url(frontend_url)}/settings?meta_oauth=error&message={urllib.parse.quote('ステートパラメータが取得できませんでした')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    
    if not settings.META_APP_ID or not settings.META_APP_SECRET:
        error_url = f"{normalize_localhost_url(frontend_url)}/settings?meta_oauth=error&message={urllib.parse.quote('Meta OAuthが設定されていません')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    
    # デバッグ: コールバック時に受け取ったパラメータをログ出力
    print(f"[Meta OAuth] Callback received parameters:")
    print(f"  - code: {code[:20] + '...' if code and len(code) > 20 else code}")
    print(f"  - state (raw): {state}")
    print(f"  - state (length): {len(state) if state else 0}")
    
    # ステートパラメータをURLデコード（Metaがエンコードして返す可能性があるため）
    try:
        decoded_state = urllib.parse.unquote(state)
        print(f"  - state (decoded): {decoded_state}")
        state = decoded_state
    except Exception as e:
        print(f"  - state decode error: {str(e)}")
        # デコードに失敗した場合は元のstateを使用
    
    # ステートからユーザーIDとフロントエンドURLを取得
    try:
        print(f"[Meta OAuth] Parsing state: {state}")
        
        # stateパラメータのフォーマット: {state}:{user_id}:{frontend_url}
        # frontend_urlはURLエンコードされている可能性があるため、最初の2つのコロンで分割
        # 例: "abc123:user-id:http%3A//localhost%3A3000" -> ["abc123", "user-id", "http%3A//localhost%3A3000"]
        colon_count = state.count(':')
        print(f"  - state colon count: {colon_count}")
        
        if colon_count < 2:
            print(f"[Meta OAuth] ERROR: State has less than 2 colons: {colon_count}")
            normalized_url = normalize_localhost_url(frontend_url)
            error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote('無効なステートパラメータです')}"
            if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
                error_url = error_url.replace('https://localhost', 'http://localhost')
                error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
            return RedirectResponse(url=error_url, status_code=302)
        
        # 最初の2つのコロンの位置を探す
        first_colon = state.find(':')
        second_colon = state.find(':', first_colon + 1)
        
        if first_colon == -1 or second_colon == -1:
            print(f"[Meta OAuth] ERROR: Could not find 2 colons in state")
            normalized_url = normalize_localhost_url(frontend_url)
            error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote('無効なステートパラメータです')}"
            if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
                error_url = error_url.replace('https://localhost', 'http://localhost')
                error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
            return RedirectResponse(url=error_url, status_code=302)
        
        # 3つの部分に分割
        state_token = state[:first_colon]
        user_id_str = state[first_colon + 1:second_colon]
        frontend_url_encoded = state[second_colon + 1:]
        
        print(f"  - state_token: {state_token[:20]}...")
        print(f"  - user_id_str: {user_id_str}")
        print(f"  - frontend_url_encoded: {frontend_url_encoded}")
        
        # フロントエンドURLをデコード
        frontend_url_from_state = urllib.parse.unquote(frontend_url_encoded)
        print(f"  - frontend_url from state (decoded): {frontend_url_from_state}")
        
        # localhostの場合、https://をhttp://に強制的に変換（normalize_localhost_url関数を使用）
        frontend_url = normalize_localhost_url(frontend_url_from_state)
        if frontend_url != frontend_url_from_state:
            print(f"[Meta OAuth] Converted HTTPS to HTTP for localhost: {frontend_url_from_state} -> {frontend_url}")
        else:
            print(f"[Meta OAuth] Using frontend URL from state: {frontend_url}")
        
        # user_idはUUID形式なので、UUIDとして扱う
        try:
            user_id = uuid.UUID(user_id_str)
        except ValueError as uuid_error:
            print(f"  - UUID conversion error: {str(uuid_error)}")
            raise ValueError(f"Invalid UUID format: {user_id_str}")
        print(f"  - user_id (UUID): {user_id}")
    except ValueError as e:
        print(f"[Meta OAuth] ERROR: ValueError when parsing state: {str(e)}")
        print(f"  - state_parts: {state_parts if 'state_parts' in locals() else 'N/A'}")
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'無効なステートパラメータです: {str(e)}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    except IndexError as e:
        print(f"[Meta OAuth] ERROR: IndexError when parsing state: {str(e)}")
        print(f"  - state_parts: {state_parts if 'state_parts' in locals() else 'N/A'}")
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'無効なステートパラメータです: {str(e)}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    except Exception as e:
        print(f"[Meta OAuth] ERROR: Unexpected error when parsing state: {str(e)}")
        import traceback
        print(f"  - traceback: {traceback.format_exc()}")
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'無効なステートパラメータです: {str(e)}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    
    # ユーザーを取得
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    
    # リダイレクトURI（デフォルト値を固定）
    redirect_uri = settings.META_REDIRECT_URI or "https://mieru-ai-production.up.railway.app/api/meta/oauth/callback"
    
    try:
        # アクセストークンを取得
        async with httpx.AsyncClient() as client:
            token_url = "https://graph.facebook.com/v24.0/oauth/access_token"
            token_params = {
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "redirect_uri": redirect_uri,
                "code": code
            }
            
            token_response = await client.get(token_url, params=token_params)
            token_response.raise_for_status()
            token_data = token_response.json()
            
            if "error" in token_data:
                raise HTTPException(
                    status_code=400,
                    detail=f"トークン取得エラー: {token_data.get('error', {}).get('message', 'Unknown error')}"
                )
            
            access_token = token_data.get("access_token")
            if not access_token:
                raise HTTPException(status_code=400, detail="アクセストークンを取得できませんでした")
            
            # 長期トークンに変換（60日有効）
            exchange_url = "https://graph.facebook.com/v24.0/oauth/access_token"
            exchange_params = {
                "grant_type": "fb_exchange_token",
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "fb_exchange_token": access_token
            }
            
            exchange_response = await client.get(exchange_url, params=exchange_params)
            exchange_response.raise_for_status()
            exchange_data = exchange_response.json()
            
            long_lived_token = exchange_data.get("access_token", access_token)
            
            # 広告アカウントIDを取得（ページネーション対応）
            accounts_url = "https://graph.facebook.com/v24.0/me/adaccounts"
            accounts_params = {
                "access_token": long_lived_token,
                "fields": "account_id,id,name",
                "limit": 100  # Meta APIの最大取得件数
            }
            
            # ページネーション処理（すべてのアカウントを取得）
            accounts = []
            accounts_page_count = 0
            while True:
                accounts_page_count += 1
                print(f"[Meta OAuth] Fetching accounts page {accounts_page_count}...")
                accounts_response = await client.get(accounts_url, params=accounts_params)
                accounts_response.raise_for_status()
                accounts_data = accounts_response.json()
                
                if "error" in accounts_data:
                    raise HTTPException(
                        status_code=400,
                        detail=f"広告アカウント取得エラー: {accounts_data.get('error', {}).get('message', 'Unknown error')}"
                    )
                
                # 取得したアカウントを追加
                page_accounts = accounts_data.get("data", [])
                accounts.extend(page_accounts)
                print(f"[Meta OAuth] Retrieved {len(page_accounts)} accounts (total: {len(accounts)})")
                
                # 次のページがあるかチェック
                paging = accounts_data.get('paging', {})
                next_url = paging.get('next')
                
                if not next_url:
                    # 次のページがない場合は終了
                    print(f"[Meta OAuth] No more account pages. Total accounts retrieved: {len(accounts)}")
                    break
                
                # 次のページのURLを設定（パラメータをクリア）
                accounts_url = next_url
                accounts_params = {}  # URLにパラメータが含まれているためクリア
            
            if not accounts:
                raise HTTPException(
                    status_code=400,
                    detail="広告アカウントが見つかりませんでした。Meta広告アカウントを作成してください。"
                )
            
            # 取得されたアカウントのリストをログ出力
            print(f"[Meta OAuth] ===== ACCOUNTS RETRIEVED =====")
            for idx, account in enumerate(accounts):
                account_id_tmp = account.get("id")
                account_name_tmp = account.get("name", "Unknown")
                print(f"[Meta OAuth] Account {idx + 1}: {account_name_tmp} ({account_id_tmp})")
            print(f"[Meta OAuth] =============================")
            
            # すべての広告アカウントのデータを取得して保存
            # 最初のアカウントIDを保存（後方互換性のため）
            first_account = accounts[0]
            account_id = first_account.get("id")  # act_123456789形式
            account_name_first = first_account.get("name", "Unknown")
            
            print(f"[Meta OAuth] Selected first account: {account_name_first} ({account_id})")
            print(f"[Meta OAuth] This account ID will be saved to user.meta_account_id")
            
            # ユーザーのMetaアカウント設定を更新（最初のアカウントIDを保存）
            user.meta_account_id = account_id
            user.meta_access_token = long_lived_token
            db.commit()
            db.refresh(user)
            
            print(f"[Meta OAuth] User meta_account_id updated to: {user.meta_account_id}")
            
            # 全期間（37ヶ月）のデータをバックグラウンドで取得
            print(f"[Meta OAuth] Starting data sync for user {user.id}")
            print(f"[Meta OAuth] Found {len(accounts)} ad account(s)")
            print(f"[Meta OAuth] Starting background sync for full period (37 months)...")
            
            # アカウント情報をバックグラウンドタスクに渡すためにコピー
            accounts_for_background = [{"id": acc.get("id"), "name": acc.get("name", "Unknown")} for acc in accounts]
            user_id_for_background = user.id
            access_token_for_background = long_lived_token  # トークンも保存
            
            def sync_full_period_background_sync():
                """バックグラウンドで全期間のデータを取得（同期関数ラッパー）"""
                import asyncio
                from ..database import SessionLocal
                
                print(f"[Meta OAuth] Background sync: Task started")
                print(f"[Meta OAuth] Background sync: Accounts to sync: {len(accounts_for_background)}")
                
                # 新しいイベントループを作成（バックグラウンドタスク用）
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                
                async def sync_all_accounts_async():
                    """非同期で全アカウントのデータを取得"""
                    background_db = SessionLocal()
                    try:
                        # ユーザー情報を再取得
                        background_user = background_db.query(User).filter(User.id == user_id_for_background).first()
                        if not background_user:
                            print(f"[Meta OAuth] Background sync: ERROR - User not found (user_id: {user_id_for_background})")
                            return
                        
                        print(f"[Meta OAuth] Background sync: User found: {background_user.id}")
                        print(f"[Meta OAuth] Background sync: User meta_account_id: {background_user.meta_account_id}")
                        print(f"[Meta OAuth] Background sync: Starting full period sync for user {background_user.id}")
                        
                        # トークンを使用（保存されたトークンを使用）
                        access_token = access_token_for_background
                        if not access_token:
                            print(f"[Meta OAuth] Background sync: ERROR - No access token found")
                            return
                        
                        for idx, account in enumerate(accounts_for_background):
                            account_id_to_sync = account.get("id")
                            account_name = account.get("name", "Unknown")
                            print(f"[Meta OAuth] Background sync: Syncing account {idx + 1}/{len(accounts_for_background)} (full period): {account_name} ({account_id_to_sync})")
                            try:
                                await sync_meta_data_to_campaigns(background_user, access_token, account_id_to_sync, background_db, days=None)
                                print(f"[Meta OAuth] Background sync: Successfully synced full period for {account_name}")
                            except Exception as account_error:
                                import traceback
                                print(f"[Meta OAuth] Background sync: ERROR syncing full period for {account_name}: {str(account_error)}")
                                print(f"[Meta OAuth] Background sync: Error details: {traceback.format_exc()}")
                                continue
                        
                        print(f"[Meta OAuth] Background sync: Full period sync completed for user {background_user.id}")
                    except Exception as sync_error:
                        import traceback
                        print(f"[Meta OAuth] Background sync: CRITICAL ERROR: {str(sync_error)}")
                        print(f"[Meta OAuth] Background sync: Error details: {traceback.format_exc()}")
                    finally:
                        background_db.close()
                        print(f"[Meta OAuth] Background sync: Database connection closed")
                
                # 非同期関数を実行
                try:
                    # 新しいイベントループを作成して実行
                    new_loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(new_loop)
                    try:
                        new_loop.run_until_complete(sync_all_accounts_async())
                    finally:
                        new_loop.close()
                except Exception as e:
                    import traceback
                    print(f"[Meta OAuth] Background sync: ERROR executing async function: {str(e)}")
                    print(f"[Meta OAuth] Background sync: Error details: {traceback.format_exc()}")
                    # フォールバック: asyncio.runを使用（新しいイベントループを作成）
                    try:
                        asyncio.run(sync_all_accounts_async())
                    except Exception as e2:
                        import traceback
                        print(f"[Meta OAuth] Background sync: ERROR with asyncio.run: {str(e2)}")
                        print(f"[Meta OAuth] Background sync: Error details: {traceback.format_exc()}")
            
            # バックグラウンドタスクとして追加（同期関数として）
            background_tasks.add_task(sync_full_period_background_sync)
            print(f"[Meta OAuth] Background task added for full period sync")
            
            # localhostの場合、https://をhttp://に強制的に変換（normalize_localhost_url関数を使用）
            final_frontend_url = normalize_localhost_url(frontend_url)
            print(f"[Meta OAuth] ===== BEFORE REDIRECT URL GENERATION =====")
            print(f"[Meta OAuth] frontend_url (before conversion): {frontend_url}")
            print(f"[Meta OAuth] final_frontend_url (after conversion): {final_frontend_url}")
            if final_frontend_url != frontend_url:
                print(f"[Meta OAuth] Converted HTTPS to HTTP: {frontend_url} -> {final_frontend_url}")
            else:
                print(f"[Meta OAuth] No conversion needed")
            
            account_count = len(accounts)
            if account_count > 1:
                success_url = f"{final_frontend_url}/settings?meta_oauth=success&account_id={account_id}&account_count={account_count}"
            else:
                success_url = f"{final_frontend_url}/settings?meta_oauth=success&account_id={account_id}"
            
            print(f"[Meta OAuth] ===== FINAL REDIRECT URL =====")
            print(f"[Meta OAuth] Final frontend_url: {final_frontend_url}")
            print(f"[Meta OAuth] Success URL: {success_url}")
            print(f"[Meta OAuth] =============================")
            
            # 最終確認: success_urlがhttps://localhostを含んでいないことを確認
            if 'https://localhost' in success_url or 'https://127.0.0.1' in success_url:
                print(f"[Meta OAuth] ⚠️ WARNING: Success URL still contains https://localhost! Forcing conversion...")
                success_url = success_url.replace('https://localhost', 'http://localhost')
                success_url = success_url.replace('https://127.0.0.1', 'http://127.0.0.1')
                print(f"[Meta OAuth] Corrected Success URL: {success_url}")
            
            # 最終的なURLを再度確認
            print(f"[Meta OAuth] ===== FINAL URL CHECK =====")
            print(f"[Meta OAuth] Final success_url: {success_url}")
            print(f"[Meta OAuth] Contains https://localhost: {'https://localhost' in success_url}")
            print(f"[Meta OAuth] Contains http://localhost: {'http://localhost' in success_url}")
            print(f"[Meta OAuth] ==========================")
            
            # RedirectResponseを明示的に302ステータスコードで生成（デフォルトは307）
            redirect_response = RedirectResponse(url=success_url, status_code=302)
            
            # RedirectResponseのURLを再度確認（headers['location']から取得）
            print(f"[Meta OAuth] ===== REDIRECT RESPONSE CREATED =====")
            print(f"[Meta OAuth] RedirectResponse.status_code: {redirect_response.status_code}")
            print(f"[Meta OAuth] RedirectResponse.headers['location']: {redirect_response.headers.get('location', 'N/A')}")
            print(f"[Meta OAuth] =====================================")
            
            return redirect_response
            
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if hasattr(e.response, 'text') else str(e)
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'Meta APIエラー: {error_text}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    except HTTPException:
        # HTTPExceptionはそのまま再スロー（ただし、リダイレクトに変換する）
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta OAuth] Error in callback: {str(e)}")
        print(f"[Meta OAuth] Error details: {error_details}")
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'OAuth認証に失敗しました: {str(e)}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
            
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if hasattr(e.response, 'text') else str(e)
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'Meta APIエラー: {error_text}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    except HTTPException:
        # HTTPExceptionはそのまま再スロー（ただし、リダイレクトに変換する）
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta OAuth] Error in callback: {str(e)}")
        print(f"[Meta OAuth] Error details: {error_details}")
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'OAuth認証に失敗しました: {str(e)}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
            
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if hasattr(e.response, 'text') else str(e)
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'Meta APIエラー: {error_text}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    except HTTPException:
        # HTTPExceptionはそのまま再スロー（ただし、リダイレクトに変換する）
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta OAuth] Error in callback: {str(e)}")
        print(f"[Meta OAuth] Error details: {error_details}")
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'OAuth認証に失敗しました: {str(e)}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
            
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if hasattr(e.response, 'text') else str(e)
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'Meta APIエラー: {error_text}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)
    except HTTPException:
        # HTTPExceptionはそのまま再スロー（ただし、リダイレクトに変換する）
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta OAuth] Error in callback: {str(e)}")
        print(f"[Meta OAuth] Error details: {error_details}")
        normalized_url = normalize_localhost_url(frontend_url)
        error_url = f"{normalized_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'OAuth認証に失敗しました: {str(e)}')}"
        if 'https://localhost' in error_url or 'https://127.0.0.1' in error_url:
            error_url = error_url.replace('https://localhost', 'http://localhost')
            error_url = error_url.replace('https://127.0.0.1', 'http://127.0.0.1')
        return RedirectResponse(url=error_url, status_code=302)


@router.post("/update-unique-reach")
async def update_unique_reach(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    全キャンペーンのユニークリーチをMeta APIから取得してDBに保存
    """
    if not current_user.meta_access_token:
        raise HTTPException(
            status_code=400,
            detail="Metaアクセストークンが設定されていません。設定画面でMetaアカウント情報を登録してください。"
        )
    
    access_token = current_user.meta_access_token
    
    try:
        # 1. データベースから全キャンペーン情報を取得
        print("[Update Unique Reach] Fetching campaign information from database...")
        campaign_query = text("""
            SELECT 
                campaign_name,
                meta_account_id,
                MIN(date) as start_date,
                MAX(date) as end_date
            FROM campaigns
            WHERE campaign_name IS NOT NULL 
              AND campaign_name != ''
              AND meta_account_id IS NOT NULL
              AND meta_account_id != ''
            GROUP BY campaign_name, meta_account_id
            ORDER BY campaign_name, meta_account_id
        """)
        
        result = db.execute(campaign_query)
        campaign_rows = result.fetchall()
        
        print(f"[Update Unique Reach] Found {len(campaign_rows)} unique campaigns")
        
        if len(campaign_rows) == 0:
            return {
                "success_count": 0,
                "error_count": 0,
                "details": [],
                "message": "更新対象のキャンペーンが見つかりませんでした。"
            }
        
        success_count = 0
        error_count = 0
        details = []
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for row in campaign_rows:
                campaign_name = row[0]
                meta_account_id = row[1]
                start_date = row[2]
                end_date = row[3]
                
                print(f"[Update Unique Reach] Processing: {campaign_name} ({meta_account_id})")
                
                try:
                    # 2a) Meta Graph API でキャンペーンIDを検索
                    # meta_account_idから"act_"プレフィックスを削除（既に含まれている場合）
                    account_id = meta_account_id.replace("act_", "") if meta_account_id.startswith("act_") else meta_account_id
                    
                    campaigns_url = f"https://graph.facebook.com/v18.0/act_{account_id}/campaigns"
                    campaigns_params = {
                        "access_token": access_token,
                        "fields": "id,name",
                        "filtering": json.dumps([{"field": "name", "operator": "EQUAL", "value": campaign_name}]),
                        "limit": 100
                    }
                    
                    print(f"[Update Unique Reach] Searching for campaign: {campaign_name}")
                    campaigns_response = await client.get(campaigns_url, params=campaigns_params)
                    campaigns_response.raise_for_status()
                    campaigns_data = campaigns_response.json()
                    
                    campaign_list = campaigns_data.get('data', [])
                    
                    if len(campaign_list) == 0:
                        error_msg = f"Campaign '{campaign_name}' not found in Meta API"
                        print(f"[Update Unique Reach] ❌ {error_msg}")
                        error_count += 1
                        details.append({
                            "campaign_name": campaign_name,
                            "meta_account_id": meta_account_id,
                            "status": "error",
                            "error": error_msg
                        })
                        continue
                    
                    # 最初に見つかったキャンペーンIDを使用
                    campaign_id = campaign_list[0].get('id')
                    found_campaign_name = campaign_list[0].get('name', '')
                    
                    print(f"[Update Unique Reach] Found campaign_id: {campaign_id} (name: {found_campaign_name})")
                    
                    # 2b) 期間全体のユニークリーチを取得
                    insights_url = f"https://graph.facebook.com/v18.0/{campaign_id}/insights"
                    time_range_dict = {
                        "since": start_date.strftime("%Y-%m-%d"),
                        "until": end_date.strftime("%Y-%m-%d")
                    }
                    time_range_json = json.dumps(time_range_dict, separators=(',', ':'))
                    
                    insights_params = {
                        "access_token": access_token,
                        "fields": "reach",
                        "time_range": time_range_json
                        # time_incrementは指定しない（期間全体の集計値を取得）
                    }
                    
                    print(f"[Update Unique Reach] Fetching unique reach for period: {time_range_json}")
                    insights_response = await client.get(insights_url, params=insights_params)
                    insights_response.raise_for_status()
                    insights_data = insights_response.json()
                    
                    insights_list = insights_data.get('data', [])
                    
                    if len(insights_list) == 0:
                        error_msg = f"No insights data returned for campaign '{campaign_name}'"
                        print(f"[Update Unique Reach] ❌ {error_msg}")
                        error_count += 1
                        details.append({
                            "campaign_name": campaign_name,
                            "meta_account_id": meta_account_id,
                            "status": "error",
                            "error": error_msg
                        })
                        continue
                    
                    # time_incrementなしの場合、期間全体のデータは1件のみ
                    unique_reach = int(insights_list[0].get('reach', 0))
                    
                    print(f"[Update Unique Reach] Meta API unique reach: {unique_reach:,}")
                    
                    # 2c) 取得したユニークリーチをデータベースの period_unique_reach に更新
                    update_query = text("""
                        UPDATE campaigns 
                        SET period_unique_reach = :unique_reach 
                        WHERE campaign_name = :campaign_name 
                          AND meta_account_id = :meta_account_id
                    """)
                    
                    db.execute(update_query, {
                        "unique_reach": unique_reach,
                        "campaign_name": campaign_name,
                        "meta_account_id": meta_account_id
                    })
                    db.commit()
                    
                    # 更新されたレコード数を確認
                    count_query = text("""
                        SELECT COUNT(*) 
                        FROM campaigns 
                        WHERE campaign_name = :campaign_name 
                          AND meta_account_id = :meta_account_id
                    """)
                    count_result = db.execute(count_query, {
                        "campaign_name": campaign_name,
                        "meta_account_id": meta_account_id
                    })
                    updated_count = count_result.scalar()
                    
                    print(f"[Update Unique Reach] ✅ Updated {updated_count} records for '{campaign_name}': period_unique_reach = {unique_reach:,}")
                    
                    success_count += 1
                    details.append({
                        "campaign_name": campaign_name,
                        "meta_account_id": meta_account_id,
                        "status": "success",
                        "unique_reach": unique_reach,
                        "updated_records": updated_count
                    })
                    
                except httpx.HTTPStatusError as e:
                    error_msg = f"Meta API error: {e.response.status_code} - {e.response.text[:200]}"
                    print(f"[Update Unique Reach] ❌ {error_msg}")
                    error_count += 1
                    details.append({
                        "campaign_name": campaign_name,
                        "meta_account_id": meta_account_id,
                        "status": "error",
                        "error": error_msg
                    })
                    continue
                except Exception as e:
                    error_msg = f"Unexpected error: {str(e)}"
                    print(f"[Update Unique Reach] ❌ {error_msg}")
                    import traceback
                    print(f"[Update Unique Reach] Traceback: {traceback.format_exc()}")
                    error_count += 1
                    details.append({
                        "campaign_name": campaign_name,
                        "meta_account_id": meta_account_id,
                        "status": "error",
                        "error": error_msg
                    })
                    continue
        
        return {
            "success_count": success_count,
            "error_count": error_count,
            "total": success_count + error_count,
            "total_campaigns": len(campaign_rows),
            "details": details,
            "message": f"{success_count}/{len(campaign_rows)}キャンペーンのユニークリーチを更新しました。"
        }
        
    except Exception as e:
        db.rollback()
        import traceback
        error_details = traceback.format_exc()
        print(f"[Update Unique Reach] CRITICAL ERROR: {str(e)}")
        print(f"[Update Unique Reach] Traceback: {error_details}")
        raise HTTPException(
            status_code=500,
            detail=f"ユニークリーチ更新エラー: {str(e)}"
        )
