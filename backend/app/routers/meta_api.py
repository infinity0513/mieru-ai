from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, timedelta
from ..models.user import User
from ..models.campaign import Campaign, Upload
from ..utils.dependencies import get_current_user
from ..utils.plan_limits import get_max_adset_limit
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
    Meta APIからデータを取得してCampaignテーブルに保存
    
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
    
    # 昨日までのデータを取得（未来の日付を指定すると400エラーになるため）
    until = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # 取得期間の決定
    if days is None:
        # 全期間のデータを取得（Meta APIの最大範囲：過去37ヶ月間）
        # Meta APIの仕様:
        # - 基本的な最大取得期間: 37ヶ月（1,095日）
        # - Reach + Breakdown使用時: 13ヶ月（394日）のみ
        # - 現在の実装ではReachフィールドを使用しているが、Breakdownは使用していないため、37ヶ月が可能
        max_days_total = 1095  # 37ヶ月（1,095日）
        since = (datetime.utcnow() - timedelta(days=max_days_total)).strftime('%Y-%m-%d')
        print(f"[Meta API] Full period sync: {since} to {until} (max {max_days_total} days / 37 months)")
    else:
        # 指定された日数分のデータを取得（例: 90日 = 3ヶ月）
        since = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')
        print(f"[Meta API] Partial sync: {since} to {until} ({days} days)")
    
    try:
        async with httpx.AsyncClient() as client:
            all_insights = []
            all_adsets = []
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
            
            # 広告セット一覧を取得（ページネーション対応）
            print(f"[Meta API] Fetching adsets from account: {account_id}")
            adsets_url = f"https://graph.facebook.com/v24.0/{account_id}/adsets"
            adsets_params = {
                "access_token": access_token,
                "fields": "id,name,campaign_id",
                "limit": 100  # Meta APIの最大取得件数
            }
            
            # ページネーション処理（すべてのadsetsを取得）
            all_adsets = []
            page_count = 0
            while True:
                page_count += 1
                print(f"[Meta API] Fetching adsets page {page_count}...")
                adsets_response = await client.get(adsets_url, params=adsets_params)
                adsets_response.raise_for_status()
                adsets_data = adsets_response.json()
                
                # 取得した広告セットを追加
                page_adsets = adsets_data.get('data', [])
                all_adsets.extend(page_adsets)
                print(f"[Meta API] Retrieved {len(page_adsets)} adsets (total: {len(all_adsets)})")
                
                # 次のページがあるかチェック
                paging = adsets_data.get('paging', {})
                next_url = paging.get('next')
                
                if not next_url:
                    # 次のページがない場合は終了
                    print(f"[Meta API] No more pages. Total adsets retrieved: {len(all_adsets)}")
                    break
                
                # 次のページのURLを設定（パラメータをクリア）
                adsets_url = next_url
                adsets_params = {}  # URLにパラメータが含まれているためクリア
            
            print(f"[Meta API] Total adsets fetched: {len(all_adsets)}")
            
            # 広告セットIDからキャンペーンIDへのマッピングを作成（広告セットが属する正しいキャンペーンを把握するため）
            adset_to_campaign_map = {}
            for adset in all_adsets:
                adset_id = adset['id']
                campaign_id = adset.get('campaign_id')
                if campaign_id:
                    adset_to_campaign_map[adset_id] = campaign_id
            
            # キャンペーンIDからキャンペーン名へのマッピングを作成
            campaign_id_to_name_map = {}
            for campaign in all_campaigns:
                campaign_id = campaign['id']
                campaign_name = campaign.get('name', 'Unknown')
                campaign_id_to_name_map[campaign_id] = campaign_name
            
            print(f"[Meta API] Created adset-to-campaign mapping: {len(adset_to_campaign_map)} adsets mapped to campaigns")
            print(f"[Meta API] Created campaign-id-to-name mapping: {len(campaign_id_to_name_map)} campaigns")
            
            # 各キャンペーンのInsightsを取得（キャンペーンレベル）
            print(f"[Meta API] Processing {len(all_campaigns)} campaigns for campaign-level insights...")
            # 昨日までのデータを取得（UTCを使用して未来の日付を避ける）
            current_until = datetime.utcnow() - timedelta(days=1)
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
            if (current_until - current_since).days > max_days_total:
                current_since = current_until - timedelta(days=max_days_total)
                print(f"[Meta API] Date range limited to {max_days_total} days: {current_since.strftime('%Y-%m-%d')} to {current_until.strftime('%Y-%m-%d')}")
            
            # 日付範囲を文字列に変換
            start_date_str = current_since.strftime('%Y-%m-%d')
            end_date_str = current_until.strftime('%Y-%m-%d')
            print(f"[Meta API] Date range: {start_date_str} to {end_date_str} ({(current_until - current_since).days} days)")
            
            # バッチリクエストでキャンペーンレベルInsightsを取得（最大50件/バッチ）
            campaign_fields = "campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
            time_range_dict = {
                "since": start_date_str,
                "until": end_date_str
            }
            time_range_json = json.dumps(time_range_dict, separators=(',', ':'))  # スペースなしJSON
            
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
                    relative_url = f"{campaign_id}/insights?fields={campaign_fields}&time_range={time_range_json}&limit=100"
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
                    
                    batch_response = await client.post(batch_url, params=batch_params)
                    batch_response.raise_for_status()
                    batch_data = batch_response.json()
                    
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
                                        print(f"  impressions: {sample.get('impressions')}")
                                        print(f"  clicks: {sample.get('clicks')}")
                                        print(f"  inline_link_clicks: {sample.get('inline_link_clicks')}")
                                        print(f"  spend: {sample.get('spend')}")
                                        print(f"  reach: {sample.get('reach')}")
                                        print(f"  frequency: {sample.get('frequency')}")
                                    
                                    # ページネーション処理（pagingがある場合）
                                    paging = item_body.get('paging', {})
                                    while 'next' in paging:
                                        next_url = paging['next']
                                        # next_urlには既にaccess_tokenが含まれている可能性があるため、そのまま使用
                                        next_response = await client.get(next_url)
                                        next_response.raise_for_status()
                                        next_data = next_response.json()
                                        next_insights = next_data.get('data', [])
                                        all_insights.extend(next_insights)
                                        paging = next_data.get('paging', {})
                                        print(f"[Meta API] Retrieved {len(next_insights)} more insights for {campaign_name} (total: {len(all_insights)})")
                                    
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
            
            print(f"[Meta API] Campaign-level insights retrieved: {len([i for i in all_insights if 'adset_id' not in i or not i.get('adset_id')])}")
            
            # 各広告セットのInsightsを取得（広告セットレベル）
            print(f"[Meta API] Processing {len(all_adsets)} adsets for adset-level insights...")
            # 広告セットレベルでも同じ期間制限を適用
            adset_fields = "adset_id,adset_name,ad_id,ad_name,campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
            has_reach_adset = "reach" in adset_fields.lower()
            has_breakdowns_adset = False  # 現在の実装ではbreakdownsパラメータを使用していない
            
            if has_reach_adset and has_breakdowns_adset:
                max_days_total_adset = 394  # 13ヶ月
                print(f"[Meta API] Adset: Reach with breakdowns detected - limiting to 13 months")
            else:
                max_days_total_adset = 1095  # 37ヶ月
                print(f"[Meta API] Adset: Standard limit - 37 months")
            
            # 広告セットレベルでも同じ期間制限を適用
            current_since_adset = datetime.strptime(since, '%Y-%m-%d')
            if (current_until - current_since_adset).days > max_days_total_adset:
                current_since_adset = current_until - timedelta(days=max_days_total_adset)
                print(f"[Meta API] Adset date range limited to {max_days_total_adset} days: {current_since_adset.strftime('%Y-%m-%d')} to {current_until.strftime('%Y-%m-%d')}")
            
            # 日付範囲を文字列に変換
            start_date_str_adset = current_since_adset.strftime('%Y-%m-%d')
            end_date_str_adset = current_until.strftime('%Y-%m-%d')
            print(f"[Meta API] Adset date range: {start_date_str_adset} to {end_date_str_adset} ({(current_until - current_since_adset).days} days)")
            
            # バッチリクエストで広告セットレベルInsightsを取得（最大50件/バッチ）
            adset_fields = "adset_id,adset_name,ad_id,ad_name,campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
            time_range_dict_adset = {
                "since": start_date_str_adset,
                "until": end_date_str_adset
            }
            time_range_json_adset = json.dumps(time_range_dict_adset, separators=(',', ':'))  # スペースなしJSON
            
            # 広告セットを50件ずつのバッチに分割
            batch_size = 50  # Meta APIのバッチリクエスト最大数
            for batch_start in range(0, len(all_adsets), batch_size):
                batch_end = min(batch_start + batch_size, len(all_adsets))
                batch_adsets = all_adsets[batch_start:batch_end]
                batch_num = (batch_start // batch_size) + 1
                total_batches = (len(all_adsets) + batch_size - 1) // batch_size
                
                print(f"[Meta API] Processing adset batch {batch_num}/{total_batches} ({len(batch_adsets)} adsets)")
                
                # バッチリクエストの作成
                batch_requests = []
                for adset in batch_adsets:
                    adset_id = adset['id']
                    # 相対URLを作成（access_tokenとtime_rangeを含む）
                    relative_url = f"{adset_id}/insights?fields={adset_fields}&time_range={time_range_json_adset}&limit=100"
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
                    
                    batch_response = await client.post(batch_url, params=batch_params)
                    batch_response.raise_for_status()
                    batch_data = batch_response.json()
                    
                    # バッチレスポンスを処理
                    for idx, batch_item in enumerate(batch_data):
                        adset = batch_adsets[idx]
                        adset_name = adset.get('name', 'Unknown')
                        adset_id = adset['id']
                        campaign_id = adset.get('campaign_id', 'Unknown')
                        
                        # 広告セットが属する正しいキャンペーン名を取得
                        correct_campaign_name = campaign_id_to_name_map.get(campaign_id, 'Unknown')
                        if correct_campaign_name == 'Unknown' and campaign_id != 'Unknown':
                            print(f"[Meta API] Warning: Campaign ID {campaign_id} not found in campaign list for adset {adset_name}")
                        
                        if batch_item.get('code') == 200:
                            try:
                                item_body = json.loads(batch_item.get('body', '{}'))
                                page_insights = item_body.get('data', [])
                                
                                if len(page_insights) > 0:
                                    # 各Insightに正しいキャンペーン名を設定
                                    for insight in page_insights:
                                        # Insights APIのcampaign_nameを、広告セットが属する正しいキャンペーン名で上書き
                                        insight['campaign_name'] = correct_campaign_name
                                        insight['campaign_id'] = campaign_id
                                    all_insights.extend(page_insights)
                                    
                                    # サンプルデータをログ出力（最初のバッチの最初の広告セットのみ）
                                    if batch_start == 0 and idx == 0:
                                        sample = page_insights[0]
                                        print(f"[Meta API] Sample insight data for adset {adset_name}:")
                                        print(f"  impressions: {sample.get('impressions')}")
                                        print(f"  clicks: {sample.get('clicks')}")
                                        print(f"  inline_link_clicks: {sample.get('inline_link_clicks')}")
                                        print(f"  spend: {sample.get('spend')}")
                                        print(f"  reach: {sample.get('reach')}")
                                        print(f"  frequency: {sample.get('frequency')}")
                                    
                                    # ページネーション処理（pagingがある場合）
                                    paging = item_body.get('paging', {})
                                    while 'next' in paging:
                                        next_url = paging['next']
                                        # next_urlには既にaccess_tokenが含まれている可能性があるため、そのまま使用
                                        next_response = await client.get(next_url)
                                        next_response.raise_for_status()
                                        next_data = next_response.json()
                                        next_insights = next_data.get('data', [])
                                        all_insights.extend(next_insights)
                                        paging = next_data.get('paging', {})
                                        print(f"[Meta API] Retrieved {len(next_insights)} more insights for {adset_name} (total: {len(all_insights)})")
                                    
                                    if idx < 3 or (batch_start == 0 and idx == 0):
                                        print(f"  ✓ Success: Retrieved {len(page_insights)} insights for {adset_name}")
                                else:
                                    if idx < 3:
                                        print(f"  ⚠ No insights data returned for {adset_name}")
                            except json.JSONDecodeError as e:
                                print(f"[Meta API] Error parsing batch response for {adset_name}: {str(e)}")
                                print(f"  Response body: {batch_item.get('body', '')[:200]}")
                        else:
                            error_body = batch_item.get('body', '{}')
                            try:
                                error_data = json.loads(error_body) if isinstance(error_body, str) else error_body
                                error_msg = error_data.get('error', {}).get('message', str(error_body))
                                print(f"[Meta API] Error fetching insights for {adset_name} ({adset_id}): {error_msg}")
                            except:
                                print(f"[Meta API] Error fetching insights for {adset_name} ({adset_id}): {error_body}")
                
                except Exception as e:
                    print(f"[Meta API] Error processing adset batch {batch_num}: {str(e)}")
                    # バッチエラーが発生しても次のバッチの処理を続行
                    continue
            
            print(f"[Meta API] Total insights retrieved (campaign + adset level): {len(all_insights)}")
            
            # 各広告セットから広告（ads）一覧を取得（ページネーション対応）
            print(f"[Meta API] Fetching ads from {len(all_adsets)} adsets...")
            all_ads = []
            for idx, adset in enumerate(all_adsets):
                adset_id = adset['id']
                adset_name = adset.get('name', 'Unknown')
                
                if (idx + 1) % 10 == 0 or idx == 0:
                    print(f"[Meta API] Fetching ads from adset {idx + 1}/{len(all_adsets)}: {adset_name}")
                
                ads_url = f"https://graph.facebook.com/v24.0/{adset_id}/ads"
                ads_params = {
                    "access_token": access_token,
                    "fields": "id,name,adset_id,campaign_id",
                    "limit": 100  # Meta APIの最大取得件数
                }
                
                # ページネーション処理（すべてのadsを取得）
                page_count = 0
                while True:
                    page_count += 1
                    try:
                        ads_response = await client.get(ads_url, params=ads_params)
                        ads_response.raise_for_status()
                        ads_data = ads_response.json()
                        
                        # 取得した広告を追加
                        page_ads = ads_data.get('data', [])
                        for ad in page_ads:
                            ad_id = ad['id']
                            ad_to_adset_map[ad_id] = adset_id
                            if campaign_id:
                                ad_to_campaign_map[ad_id] = campaign_id
                        all_ads.extend(page_ads)
                        
                        if page_count == 1 and idx < 3:
                            print(f"[Meta API] Retrieved {len(page_ads)} ads from {adset_name} (total ads: {len(all_ads)})")
                        
                        # 次のページがあるかチェック
                        paging = ads_data.get('paging', {})
                        next_url = paging.get('next')
                        
                        if not next_url:
                            break
                        
                        # 次のページのURLを設定（パラメータをクリア）
                        ads_url = next_url
                        ads_params = {}  # URLにパラメータが含まれているためクリア
                    except Exception as e:
                        print(f"[Meta API] Error fetching ads from {adset_name} ({adset_id}): {str(e)}")
                        # エラーが発生しても次の広告セットの処理を続行
                        break
            
            print(f"[Meta API] Total ads fetched: {len(all_ads)}")
            
            # 各広告のInsightsを取得（広告レベル）- バッチリクエストを使用
            if len(all_ads) > 0:
                print(f"[Meta API] Processing {len(all_ads)} ads for ad-level insights...")
                ad_fields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency"
                time_range_dict_ad = {
                    "since": start_date_str_adset,
                    "until": end_date_str_adset
                }
                time_range_json_ad = json.dumps(time_range_dict_ad, separators=(',', ':'))  # スペースなしJSON
                
                # 広告を50件ずつのバッチに分割
                batch_size = 50  # Meta APIのバッチリクエスト最大数
                for batch_start in range(0, len(all_ads), batch_size):
                    batch_end = min(batch_start + batch_size, len(all_ads))
                    batch_ads = all_ads[batch_start:batch_end]
                    batch_num = (batch_start // batch_size) + 1
                    total_batches = (len(all_ads) + batch_size - 1) // batch_size
                    
                    if batch_num % 10 == 0 or batch_num == 1:
                        print(f"[Meta API] Processing ad batch {batch_num}/{total_batches} ({len(batch_ads)} ads)")
                    
                    # バッチリクエストの作成
                    batch_requests = []
                    for ad in batch_ads:
                        ad_id = ad['id']
                        # 相対URLを作成（access_tokenとtime_rangeを含む）
                        relative_url = f"{ad_id}/insights?fields={ad_fields}&time_range={time_range_json_ad}&limit=100"
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
                        
                        batch_response = await client.post(batch_url, params=batch_params)
                        batch_response.raise_for_status()
                        batch_data = batch_response.json()
                        
                        # バッチレスポンスを処理
                        for idx, batch_item in enumerate(batch_data):
                            ad = batch_ads[idx]
                            ad_name = ad.get('name', 'Unknown')
                            ad_id = ad['id']
                            
                            # 広告が属する正しい広告セットIDとキャンペーンIDを取得
                            correct_adset_id = ad_to_adset_map.get(ad_id)
                            correct_campaign_id = ad_to_campaign_map.get(ad_id)
                            correct_campaign_name = campaign_id_to_name_map.get(correct_campaign_id, 'Unknown') if correct_campaign_id else 'Unknown'
                            
                            if batch_item.get('code') == 200:
                                try:
                                    item_body = json.loads(batch_item.get('body', '{}'))
                                    page_insights = item_body.get('data', [])
                                    
                                    if len(page_insights) > 0:
                                        # 各Insightに正しいキャンペーン名と広告セットIDを設定
                                        for insight in page_insights:
                                            # Insights APIのcampaign_nameとadset_idを、広告が属する正しい値で上書き
                                            insight['campaign_name'] = correct_campaign_name
                                            insight['campaign_id'] = correct_campaign_id
                                            insight['adset_id'] = correct_adset_id
                                        all_insights.extend(page_insights)
                                        
                                        # サンプルデータをログ出力（最初のバッチの最初の広告のみ）
                                        if batch_start == 0 and idx == 0:
                                            sample = page_insights[0]
                                            print(f"[Meta API] Sample insight data for ad {ad_name}:")
                                            print(f"  ad_id: {sample.get('ad_id')}")
                                            print(f"  ad_name: {sample.get('ad_name')}")
                                            print(f"  adset_id: {sample.get('adset_id')}")
                                            print(f"  adset_name: {sample.get('adset_name')}")
                                            print(f"  impressions: {sample.get('impressions')}")
                                            print(f"  clicks: {sample.get('clicks')}")
                                            print(f"  inline_link_clicks: {sample.get('inline_link_clicks')}")
                                            print(f"  spend: {sample.get('spend')}")
                                            print(f"  Sample keys: {list(sample.keys())}")
                                        
                                        # ページネーション処理（pagingがある場合）
                                        paging = item_body.get('paging', {})
                                        while 'next' in paging:
                                            next_url = paging['next']
                                            # next_urlには既にaccess_tokenが含まれている可能性があるため、そのまま使用
                                            next_response = await client.get(next_url)
                                            next_response.raise_for_status()
                                            next_data = next_response.json()
                                            next_insights = next_data.get('data', [])
                                            all_insights.extend(next_insights)
                                            paging = next_data.get('paging', {})
                                            if batch_num == 1 and idx < 3:
                                                print(f"[Meta API] Retrieved {len(next_insights)} more insights for {ad_name} (total: {len(all_insights)})")
                                    
                                    if batch_num == 1 and idx < 3:
                                        if len(page_insights) > 0:
                                            print(f"  ✓ Success: Retrieved {len(page_insights)} insights for ad {ad_name}")
                                        else:
                                            print(f"  ⚠ No insights data returned for ad {ad_name}")
                                except json.JSONDecodeError as e:
                                    print(f"[Meta API] Error parsing batch response for ad {ad_name}: {str(e)}")
                                    print(f"  Response body: {batch_item.get('body', '')[:200]}")
                            else:
                                error_body = batch_item.get('body', '{}')
                                try:
                                    error_data = json.loads(error_body) if isinstance(error_body, str) else error_body
                                    error_msg = error_data.get('error', {}).get('message', str(error_body))
                                    error_code = error_data.get('error', {}).get('code', 'Unknown')
                                    print(f"[Meta API] Error fetching insights for ad {ad_name} ({ad_id}): Code {error_code}, Message: {error_msg}")
                                except:
                                    print(f"[Meta API] Error fetching insights for ad {ad_name} ({ad_id}): {error_body}")
                    
                    except Exception as e:
                        print(f"[Meta API] Error processing ad batch {batch_num}: {str(e)}")
                        # バッチエラーが発生しても次のバッチの処理を続行
                        continue
                
                ad_level_insights = [i for i in all_insights if i.get('ad_id') and i.get('ad_name')]
                print(f"[Meta API] Ad-level insights retrieved: {len(ad_level_insights)}")
                if len(ad_level_insights) > 0:
                    print(f"[Meta API] Sample ad-level insight: ad_id={ad_level_insights[0].get('ad_id')}, ad_name={ad_level_insights[0].get('ad_name')}")
                else:
                    # 広告レベルのInsightsが取得できていない場合、all_insightsの内容を確認
                    print(f"[Meta API] Warning: No ad-level insights found. Total insights: {len(all_insights)}")
                    if len(all_insights) > 0:
                        sample_insight = all_insights[0]
                        print(f"[Meta API] Sample insight keys: {list(sample_insight.keys())}")
                        print(f"[Meta API] Sample insight ad_id: {sample_insight.get('ad_id')}, ad_name: {sample_insight.get('ad_name')}")
            else:
                print(f"[Meta API] No ads found, skipping ad-level insights")
            
            print(f"[Meta API] Total insights retrieved (all levels): {len(all_insights)}")
            
            # InsightsデータをCampaignテーブルに保存
            saved_count = 0
            campaign_level_count = 0
            adset_level_count = 0
            ad_level_count = 0
            
            for insight in all_insights:
                try:
                    # 日付を取得
                    date_str = insight.get('date_start')
                    if not date_str:
                        continue
                    campaign_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    
                    # データを取得
                    campaign_name = insight.get('campaign_name', 'Unknown')
                    ad_set_name = insight.get('adset_name')
                    ad_name = insight.get('ad_name')
                    
                    # キャンペーンレベル、広告セットレベル、広告レベルかを判定
                    is_campaign_level = not ad_set_name or ad_set_name == ''
                    is_ad_level = ad_name and (ad_set_name and ad_set_name != '')
                    
                    if is_campaign_level:
                        campaign_level_count += 1
                    elif is_ad_level:
                        ad_level_count += 1
                    else:
                        adset_level_count += 1
                    
                    # デバッグログ（最初の数件のみ）
                    if saved_count < 10:
                        if is_campaign_level:
                            level_type = "campaign-level"
                        elif is_ad_level:
                            level_type = "ad-level"
                        else:
                            level_type = "adset-level"
                        print(f"[Meta API] Saving {level_type} insight: campaign={campaign_name}, adset={ad_set_name or 'N/A'}, ad={ad_name or 'N/A'}, date={campaign_date}, spend={insight.get('spend', 0)}")
                        print(f"[Meta API] Raw insight keys: {list(insight.keys())}")
                        print(f"[Meta API] adset_name from API: {insight.get('adset_name')}, ad_name from API: {insight.get('ad_name')}")
                    # デバッグログ：生データを詳細にログ出力（最初の数件のみ）
                    if saved_count < 3:
                        print(f"[Meta API] Raw data vs Saved data comparison:")
                        print(f"  Raw: impressions={insight.get('impressions')}, inline_link_clicks={insight.get('inline_link_clicks')}, clicks={insight.get('clicks')}")
                        print(f"  Raw: conversions={insight.get('conversions')}, action_values={insight.get('action_values')}")
                        print(f"  Raw: reach={insight.get('reach')}, engagements={insight.get('engagements')}, landing_page_views={insight.get('landing_page_views')}")
                        print(f"[Meta API Debug] ===== Raw insight data for {campaign_name} on {campaign_date} =====")
                        print(f"[Meta API Debug] Raw insight keys: {list(insight.keys())}")
                        print(f"[Meta API Debug] Raw data:")
                        print(f"  - impressions: {insight.get('impressions')}")
                        print(f"  - clicks: {insight.get('clicks')}")
                        print(f"  - inline_link_clicks: {insight.get('inline_link_clicks')}")
                        print(f"  - link_clicks: {insight.get('link_clicks')}")
                        print(f"  - reach: {insight.get('reach')}")
                        print(f"  - spend: {insight.get('spend')}")
                        print(f"  - engagements: {insight.get('engagements')}")
                        print(f"  - landing_page_views: {insight.get('landing_page_views')}")
                        print(f"  - frequency: {insight.get('frequency')}")
                        print(f"  - actions: {insight.get('actions')}")
                        print(f"  - action_values: {insight.get('action_values')}")
                        print(f"  - conversions: {insight.get('conversions')}")
                        print(f"[Meta API Debug] ===== End raw data =====")
                    
                    spend = float(insight.get('spend', 0))
                    impressions = int(insight.get('impressions', 0))
                    all_clicks = int(insight.get('clicks', 0))  # 全クリック（いいね、シェア、リンククリックなど全て）
                    inline_link_clicks = int(insight.get('inline_link_clicks', 0))  # リンククリック（Meta広告マネージャの「クリック数」）
                    reach = int(insight.get('reach', 0))
                    
                    # クリック数はinline_link_clicksを使用（Meta広告マネージャの「クリック数」に相当）
                    clicks = inline_link_clicks if inline_link_clicks > 0 else all_clicks
                    link_clicks = inline_link_clicks if inline_link_clicks > 0 else all_clicks
                    
                    # エンゲージメント関連のデータを取得
                    # engagementsフィールドが直接取得できない場合は、actionsからpost_engagementを抽出
                    engagements = int(insight.get('engagements', 0))
                    if engagements == 0:
                        # actionsからpost_engagementを抽出
                        actions = insight.get('actions', [])
                        for action in actions:
                            if action.get('action_type') == 'post_engagement':
                                engagements += int(action.get('value', 0))
                    
                    # link_clicksはinline_link_clicksを使用（既に取得済み）
                    link_clicks = inline_link_clicks if inline_link_clicks > 0 else all_clicks
                    
                    # landing_page_viewsはactionsから抽出
                    landing_page_views = 0
                    actions = insight.get('actions', [])
                    for action in actions:
                        if action.get('action_type') == 'landing_page_view':
                            landing_page_views += int(action.get('value', 0))
                    
                    frequency = float(insight.get('frequency', 0))
                    
                    # frequencyが取得できない場合は計算（impressions / reach）
                    if frequency == 0 and reach > 0:
                        frequency = (impressions / reach) if reach > 0 else 0
                    
                    # conversionsとconversion_valueを取得
                    # まず、直接conversionsフィールドを確認
                    conversions_data = insight.get('conversions', [])
                    conversions = 0
                    if conversions_data:
                        # conversionsが配列の場合
                        for conv in conversions_data:
                            if isinstance(conv, dict):
                                action_type = conv.get('action_type', '')
                                # コンバージョン関連のアクションタイプをチェック
                                if (action_type.startswith('offsite_conversion') or 
                                    action_type.startswith('onsite_conversion') or 
                                    action_type in ['omni_purchase', 'purchase'] or
                                    'complete_registration' in action_type or
                                    'lead' in action_type or
                                    'purchase' in action_type):
                                    value = conv.get('value', 0)
                                    try:
                                        conversions += int(value) if isinstance(value, (int, str)) else 0
                                    except (ValueError, TypeError):
                                        pass
                            else:
                                conversions += int(conv)
                    
                    # フォールバック: actionsから取得
                    if conversions == 0:
                        actions = insight.get('actions', [])
                        for action in actions:
                            action_type = action.get('action_type', '')
                            # コンバージョン関連のアクションタイプをチェック
                            # offsite_conversion, onsite_conversion, omni_purchase, purchase
                            # およびそれらのサブタイプ（例: offsite_conversion.fb_pixel_complete_registration）
                            if (action_type.startswith('offsite_conversion') or 
                                action_type.startswith('onsite_conversion') or 
                                action_type in ['omni_purchase', 'purchase'] or
                                'complete_registration' in action_type or
                                'lead' in action_type or
                                'purchase' in action_type):
                                value = action.get('value', 0)
                                try:
                                    conversions += int(value) if isinstance(value, (int, str)) else 0
                                except (ValueError, TypeError):
                                    pass
                    
                    # conversion_valueを取得（action_valuesから）
                    action_values = insight.get('action_values', [])
                    conversion_value = 0.0
                    if action_values:
                        # action_valuesが配列の場合
                        for av in action_values:
                            if isinstance(av, dict):
                                av_type = av.get('action_type', '')
                                # コンバージョン価値に関連するアクションタイプをチェック
                                if (av_type.startswith('offsite_conversion') or 
                                    av_type.startswith('onsite_conversion') or 
                                    av_type in ['omni_purchase', 'purchase'] or
                                    'purchase' in av_type):
                                    value = av.get('value', 0)
                                    try:
                                        conversion_value += float(value) if isinstance(value, (int, float, str)) else 0.0
                                    except (ValueError, TypeError):
                                        pass
                    
                    # フォールバック: actionsから取得（通常はaction_valuesを使用）
                    if conversion_value == 0:
                        actions = insight.get('actions', [])
                        for action in actions:
                            action_type = action.get('action_type', '')
                            # 購入関連のアクションタイプをチェック
                            if (action_type in ['purchase', 'omni_purchase'] or
                                'purchase' in action_type):
                                value = action.get('value', 0)
                                try:
                                    conversion_value += float(value) if isinstance(value, (int, float, str)) else 0.0
                                except (ValueError, TypeError):
                                    pass
                    
                    
                    # メトリクスを計算（Meta広告マネージャの定義に合わせる）
                    # CTR = (inline_link_clicks / impressions) * 100
                    ctr = (clicks / impressions * 100) if impressions > 0 else 0
                    # CPC = spend / inline_link_clicks
                    cpc = (spend / clicks) if clicks > 0 else 0
                    # CPM = (spend / impressions) * 1000
                    cpm = (spend / impressions * 1000) if impressions > 0 else 0
                    # CPA = spend / conversions
                    cpa = (spend / conversions) if conversions > 0 else 0
                    # CVR = (conversions / inline_link_clicks) * 100
                    cvr = (conversions / clicks * 100) if clicks > 0 else 0
                    # ROAS = conversion_value / spend（比率、パーセンテージではない）
                    roas = (conversion_value / spend) if spend > 0 else 0
                    # エンゲージメント率 = (engagements / impressions) * 100
                    engagement_rate = (engagements / impressions * 100) if impressions > 0 else 0
                    
                    # デバッグログ：計算結果を確認（最初の数件のみ）
                    if saved_count < 3:
                        print(f"[Meta API Debug] Calculated metrics:")
                        print(f"  - CTR: {ctr:.2f}% (clicks={clicks} / impressions={impressions})")
                        print(f"  - CVR: {cvr:.2f}% (conversions={conversions} / clicks={clicks})")
                        print(f"  - CPC: {cpc:.2f} (spend={spend} / clicks={clicks})")
                        print(f"  - CPA: {cpa:.2f} (spend={spend} / conversions={conversions})")
                        print(f"  - CPM: {cpm:.2f} (spend={spend} / impressions={impressions} * 1000)")
                        print(f"  - ROAS: {roas:.2f} (conversion_value={conversion_value} / spend={spend})")
                        print(f"  - Engagement Rate: {engagement_rate:.2f}% (engagements={engagements} / impressions={impressions} * 100)")
                        print(f"[Meta API Debug] Mapped data for DB:")
                        print(f"  - clicks (inline_link_clicks): {inline_link_clicks} → {clicks}")
                        print(f"  - conversions: {conversions}")
                        print(f"  - conversion_value: {conversion_value}")
                        print(f"  - engagements: {engagements}")
                        print(f"  - landing_page_views: {landing_page_views}")
                        print(f"  - frequency: {frequency}")
                        print(f"[Meta API Debug] Will save to DB:")
                        print(f"  - impressions: {impressions}, clicks: {clicks}, cost: {spend}")
                        print(f"  - conversions: {conversions}, conversion_value: {conversion_value}")
                        print(f"  - reach: {reach}, engagements: {engagements}, landing_page_views: {landing_page_views}")
                    
                    # 既存のレコードをチェック（meta_account_idも含める）
                    # データソースの優先順位: Meta APIデータ > CSVデータ
                    # Meta APIデータは常に最新のデータで上書きする
                    existing = db.query(Campaign).filter(
                        Campaign.user_id == user.id,
                        Campaign.date == campaign_date,
                        Campaign.campaign_name == campaign_name,
                        Campaign.ad_set_name == ad_set_name,
                        Campaign.ad_name == ad_name
                    ).first()
                    
                    # 既存レコードがあるが、meta_account_idが異なる場合は新規作成
                    # （同じキャンペーン名でも、異なるアカウントのデータは別レコードとして扱う）
                    if existing and existing.meta_account_id and existing.meta_account_id != account_id:
                        existing = None  # 異なるアカウントのデータは別レコードとして扱う
                    elif existing and not existing.meta_account_id:
                        # CSVデータをMeta APIデータで上書き（Meta APIデータを優先）
                        if saved_count < 3:
                            print(f"[Meta API] Updating CSV data with Meta API data (Meta API takes priority)")
                    
                    if existing:
                        # 更新
                        # デバッグログ: 更新前後のデータを比較（最初の数件のみ）
                        if saved_count < 3:
                            print(f"[Meta API Debug] Updating existing record:")
                            print(f"  Before: impressions={existing.impressions}, clicks={existing.clicks}, cost={existing.cost}")
                            print(f"  Before: conversions={existing.conversions}, conversion_value={existing.conversion_value}")
                            print(f"  Before: ad_set_name={existing.ad_set_name}, ad_name={existing.ad_name}")
                            print(f"  After: impressions={impressions}, clicks={clicks}, cost={spend}")
                            print(f"  After: conversions={conversions}, conversion_value={conversion_value}")
                            print(f"  After: ad_set_name={ad_set_name}, ad_name={ad_name}")
                        
                        existing.upload_id = upload.id
                        existing.meta_account_id = account_id
                        existing.campaign_name = campaign_name  # キャンペーン名も更新（変更される可能性があるため）
                        existing.ad_set_name = ad_set_name if ad_set_name else ''  # 広告セット名を更新
                        existing.ad_name = ad_name if ad_name else ''  # 広告名を更新
                        existing.cost = Decimal(str(spend))
                        existing.impressions = impressions
                        existing.clicks = clicks
                        existing.conversions = conversions
                        existing.conversion_value = Decimal(str(conversion_value))
                        existing.reach = reach
                        existing.engagements = engagements
                        existing.link_clicks = link_clicks
                        existing.landing_page_views = landing_page_views
                        existing.ctr = Decimal(str(round(ctr, 2)))
                        existing.cpc = Decimal(str(round(cpc, 2)))
                        existing.cpm = Decimal(str(round(cpm, 2)))
                        existing.cpa = Decimal(str(round(cpa, 2)))
                        existing.cvr = Decimal(str(round(cvr, 2)))
                        existing.roas = Decimal(str(round(roas, 2)))
                    else:
                        # 新規作成
                        campaign = Campaign(
                            user_id=user.id,
                            upload_id=upload.id,
                            meta_account_id=account_id,
                            date=campaign_date,
                            campaign_name=campaign_name,
                            ad_set_name=ad_set_name,
                            ad_name=ad_name,
                            cost=Decimal(str(spend)),
                            impressions=impressions,
                            clicks=clicks,
                            conversions=conversions,
                            conversion_value=Decimal(str(conversion_value)),
                            reach=reach,
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
                        db.add(campaign)
                        saved_count += 1
                except Exception as e:
                    print(f"[Meta OAuth] Error processing insight: {str(e)}")
                    continue
            
            # Uploadレコードを更新
            upload.row_count = saved_count
            if all_insights:
                dates = [datetime.strptime(i.get('date_start', ''), '%Y-%m-%d').date() for i in all_insights if i.get('date_start')]
                if dates:
                    upload.start_date = min(dates)
                    upload.end_date = max(dates)
            
            db.commit()
            print(f"[Meta OAuth] Saved {saved_count} campaign records")
            print(f"[Meta OAuth] Breakdown: {campaign_level_count} campaign-level insights, {adset_level_count} adset-level insights, {ad_level_count} ad-level insights")
    except Exception as e:
        db.rollback()
        raise

@router.get("/accounts")
async def get_meta_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ユーザーが連携しているMeta広告アカウント（アセット）一覧を取得"""
    # Campaignテーブルからユニークなmeta_account_idを取得
    accounts = db.query(Campaign.meta_account_id).filter(
        Campaign.user_id == current_user.id,
        Campaign.meta_account_id.isnot(None)
    ).distinct().all()
    
    # アカウントIDのリストを作成
    account_ids = [acc[0] for acc in accounts if acc[0]]
    
    # Meta APIからアカウント名を取得（アクセストークンがある場合）
    account_names = {}
    if current_user.meta_access_token:
        try:
            async with httpx.AsyncClient() as client:
                # すべての広告アカウント情報を取得
                accounts_url = "https://graph.facebook.com/v24.0/me/adaccounts"
                accounts_params = {
                    "access_token": current_user.meta_access_token,
                    "fields": "account_id,id,name"
                }
                
                accounts_response = await client.get(accounts_url, params=accounts_params)
                accounts_response.raise_for_status()
                accounts_data = accounts_response.json()
                
                if "data" in accounts_data:
                    for account in accounts_data["data"]:
                        account_id = account.get("id")
                        account_name = account.get("name", account_id)
                        account_names[account_id] = account_name
        except Exception as e:
            print(f"[Meta Accounts] Error fetching account names: {str(e)}")
            # エラーが発生しても続行（アカウントIDをそのまま使用）
    
    # 各アカウントの統計情報を取得
    result = []
    for account_id in account_ids:
        # 各アカウントのデータ件数を取得
        count = db.query(Campaign).filter(
            Campaign.user_id == current_user.id,
            Campaign.meta_account_id == account_id
        ).count()
        
        # 最新のデータ日付を取得
        latest_date = db.query(func.max(Campaign.date)).filter(
            Campaign.user_id == current_user.id,
            Campaign.meta_account_id == account_id
        ).scalar()
        
        # アカウント名を取得（Meta APIから取得できた場合はそれを使用、なければアカウントID）
        account_name = account_names.get(account_id, account_id)
        
        result.append({
            "account_id": account_id,
            "name": account_name,
            "data_count": count,
            "latest_date": str(latest_date) if latest_date else None
        })
    
    return {
        "accounts": result,
        "total": len(result)
    }

@router.get("/insights")
async def get_meta_insights(
    since: Optional[str] = None,
    until: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ユーザーのMetaアカウント情報を使用してInsightsを取得"""
    
    # ユーザーのMetaアカウント情報を確認
    if not current_user.meta_account_id or not current_user.meta_access_token:
        raise HTTPException(
            status_code=400,
            detail="Metaアカウント情報が設定されていません。設定画面でMetaアカウント情報を登録してください。"
        )
    
    # プランに応じた最大取得件数を取得
    max_limit = get_max_adset_limit(current_user.plan)
    
    # デフォルトの日付範囲（最近37ヶ月間、未来の日付を避ける）
    if not since:
        until_dt = datetime.utcnow() - timedelta(days=1)
        since_dt = until_dt - timedelta(days=1095)  # 37ヶ月
        since = since_dt.strftime('%Y-%m-%d')
    if not until:
        until = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Meta APIの期間制限を確認
    # - Reachフィールドを使用しているが、Breakdownは使用していないため、37ヶ月（1,095日）が可能
    insights_fields = "adset_id,adset_name,ad_id,ad_name,campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,conversions,reach,actions"
    has_reach_insights = "reach" in insights_fields.lower()
    has_breakdowns_insights = False  # 現在の実装ではbreakdownsパラメータを使用していない
    
    if has_reach_insights and has_breakdowns_insights:
        max_days_insights = 394  # 13ヶ月
        print(f"[Meta API] /insights endpoint: Reach with breakdowns detected - limiting to 13 months")
    else:
        max_days_insights = 1095  # 37ヶ月
        print(f"[Meta API] /insights endpoint: Standard limit - 37 months")
        print(f"[Meta API] Fields requested: {insights_fields}")
        print(f"[Meta API] Has reach: {has_reach_insights}, Has breakdowns: {has_breakdowns_insights}")
    
    # 期間を制限（37ヶ月または13ヶ月）
    try:
        until_dt = datetime.strptime(until, '%Y-%m-%d')
        since_dt = datetime.strptime(since, '%Y-%m-%d')
        
        if (until_dt - since_dt).days > max_days_insights:
            since_dt = until_dt - timedelta(days=max_days_insights)
            since = since_dt.strftime('%Y-%m-%d')
            print(f"[Meta API] Date range limited to {max_days_insights} days: {since} to {until}")
    except Exception as e:
        print(f"[Meta API] Error parsing dates: {e}")
        # デフォルトで最近37ヶ月間
        until_dt = datetime.utcnow() - timedelta(days=1)
        since_dt = until_dt - timedelta(days=1095)  # 37ヶ月
        since = since_dt.strftime('%Y-%m-%d')
        until = until_dt.strftime('%Y-%m-%d')
    
    # Meta Graph APIを呼び出し
    account_id = current_user.meta_account_id
    access_token = current_user.meta_access_token
    
    try:
        async with httpx.AsyncClient() as client:
            all_insights = []
            all_adsets = []
            
            # 広告セット一覧を取得（ページネーション処理）
            adsets_url = f"https://graph.facebook.com/v18.0/{account_id}/adsets"
            adsets_params = {
                "access_token": access_token,
                "fields": "id,name,campaign_id",
                "limit": 100  # Meta APIの最大取得件数
            }
            
            # ページネーション処理
            while True:
                adsets_response = await client.get(adsets_url, params=adsets_params)
                adsets_response.raise_for_status()
                adsets_data = adsets_response.json()
                
                # 取得した広告セットを追加
                page_adsets = adsets_data.get('data', [])
                all_adsets.extend(page_adsets)
                
                # プラン制限をチェック
                if max_limit is not None and len(all_adsets) >= max_limit:
                    # 制限に達した場合は、制限数までに制限
                    all_adsets = all_adsets[:max_limit]
                    break
                
                # 次のページがあるかチェック
                paging = adsets_data.get('paging', {})
                next_url = paging.get('next')
                
                if not next_url:
                    # 次のページがない場合は終了
                    break
                
                # 次のページのURLを設定（パラメータをクリア）
                adsets_url = next_url
                adsets_params = {}  # URLにパラメータが含まれているためクリア
            
            # 各広告セットのInsightsを取得
            for adset in all_adsets:
                adset_id = adset['id']
                insights_url = f"https://graph.facebook.com/v18.0/{adset_id}/insights"
                # JSON形式でtime_rangeを作成（スペースなし）
                time_range_dict = {
                    "since": since,
                    "until": until
                }
                time_range_json = json.dumps(time_range_dict, separators=(',', ':'))  # スペースなしJSON
                
                insights_params = {
                    "access_token": access_token,
                    "fields": "adset_id,adset_name,ad_id,ad_name,campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,conversions,reach,actions",
                    "time_range": time_range_json  # JSON文字列（スペースなし）
                }
                
                # デバッグログ
                print(f"[Meta API] Request params for /insights endpoint:")
                print(f"  Date range: {since} to {until}")
                print(f"  time_range param: {time_range_json}")
                insights_response = await client.get(insights_url, params=insights_params)
                insights_response.raise_for_status()
                insights_data = insights_response.json()
                all_insights.extend(insights_data.get('data', []))
            
            # 制限に達した場合の警告メッセージ
            warning_message = None
            if max_limit is not None and len(all_adsets) >= max_limit:
                warning_message = f"プラン制限により、{max_limit}件まで取得しました。全てのデータを取得するにはPROプランへのアップグレードが必要です。"
            
            return {
                "data": all_insights,
                "account_id": account_id,
                "since": since,
                "until": until,
                "adset_count": len(all_adsets),
                "max_limit": max_limit,
                "warning": warning_message
            }
            
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Meta APIエラー: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Meta API呼び出しに失敗しました: {str(e)}"
        )

@router.get("/oauth/authorize")
async def meta_oauth_authorize(
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
    
    # ステートパラメータを生成（CSRF対策）
    state = secrets.token_urlsafe(32)
    # ステートをセッションに保存する代わりに、ユーザーIDを含める（簡易版）
    state_with_user = f"{state}:{current_user.id}"
    
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

@router.get("/oauth/authorize-url")
async def meta_oauth_authorize_url(
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
        
        # ステートパラメータを生成（CSRF対策）
        state = secrets.token_urlsafe(32)
        # ステートをセッションに保存する代わりに、ユーザーIDを含める（簡易版）
        state_with_user = f"{state}:{current_user.id}"
        
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

@router.get("/oauth/callback")
async def meta_oauth_callback(
    code: Optional[str] = Query(None, description="OAuth認証コード"),
    state: Optional[str] = Query(None, description="ステートパラメータ（CSRF対策）"),
    error: Optional[str] = Query(None, description="エラーメッセージ"),
    error_reason: Optional[str] = Query(None, description="エラー理由"),
    error_description: Optional[str] = Query(None, description="エラー詳細"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Meta OAuthコールバック - トークンを取得して保存"""
    # エラーパラメータが存在する場合（認証拒否など）
    if error:
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_message = error_description or error_reason or error
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote(error_message)}"
        return RedirectResponse(url=error_url)
    
    # codeとstateが必須
    if not code:
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote('認証コードが取得できませんでした')}"
        return RedirectResponse(url=error_url)
    
    if not state:
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote('ステートパラメータが取得できませんでした')}"
        return RedirectResponse(url=error_url)
    
    if not settings.META_APP_ID or not settings.META_APP_SECRET:
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote('Meta OAuthが設定されていません')}"
        return RedirectResponse(url=error_url)
    
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
    
    # ステートからユーザーIDを取得
    try:
        print(f"[Meta OAuth] Parsing state: {state}")
        state_parts = state.split(":")
        print(f"  - state_parts: {state_parts}")
        print(f"  - state_parts length: {len(state_parts)}")
        
        if len(state_parts) < 2:
            print(f"[Meta OAuth] ERROR: State parts length is less than 2: {len(state_parts)}")
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
            error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote('無効なステートパラメータです')}"
            return RedirectResponse(url=error_url)
        
        user_id_str = state_parts[1]
        print(f"  - user_id (string): {user_id_str}")
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
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'無効なステートパラメータです: {str(e)}')}"
        return RedirectResponse(url=error_url)
    except IndexError as e:
        print(f"[Meta OAuth] ERROR: IndexError when parsing state: {str(e)}")
        print(f"  - state_parts: {state_parts if 'state_parts' in locals() else 'N/A'}")
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'無効なステートパラメータです: {str(e)}')}"
        return RedirectResponse(url=error_url)
    except Exception as e:
        print(f"[Meta OAuth] ERROR: Unexpected error when parsing state: {str(e)}")
        import traceback
        print(f"  - traceback: {traceback.format_exc()}")
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'無効なステートパラメータです: {str(e)}')}"
        return RedirectResponse(url=error_url)
    
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
            
            # 広告アカウントIDを取得
            accounts_url = "https://graph.facebook.com/v24.0/me/adaccounts"
            accounts_params = {
                "access_token": long_lived_token,
                "fields": "account_id,id,name"
            }
            
            accounts_response = await client.get(accounts_url, params=accounts_params)
            accounts_response.raise_for_status()
            accounts_data = accounts_response.json()
            
            if "error" in accounts_data:
                raise HTTPException(
                    status_code=400,
                    detail=f"広告アカウント取得エラー: {accounts_data.get('error', {}).get('message', 'Unknown error')}"
                )
            
            accounts = accounts_data.get("data", [])
            if not accounts:
                raise HTTPException(
                    status_code=400,
                    detail="広告アカウントが見つかりませんでした。Meta広告アカウントを作成してください。"
                )
            
            # すべての広告アカウントのデータを取得して保存
            # 最初のアカウントIDを保存（後方互換性のため）
            first_account = accounts[0]
            account_id = first_account.get("id")  # act_123456789形式
            
            # ユーザーのMetaアカウント設定を更新（最初のアカウントIDを保存）
            user.meta_account_id = account_id
            user.meta_access_token = long_lived_token
            db.commit()
            db.refresh(user)
            
            # 段階的データ取得: まず3ヶ月分を取得（ユーザー待機時間を短縮）、その後バックグラウンドで全期間を取得
            try:
                print(f"[Meta OAuth] Starting data sync for user {user.id}")
                print(f"[Meta OAuth] Found {len(accounts)} ad account(s)")
                
                # フェーズ1: 直近3ヶ月分のデータを先に取得（ユーザー待機時間を短縮）
                print(f"[Meta OAuth] Phase 1: Fetching last 3 months of data for quick access...")
                for idx, account in enumerate(accounts):
                    account_id_to_sync = account.get("id")
                    account_name = account.get("name", "Unknown")
                    print(f"[Meta OAuth] Syncing account {idx + 1}/{len(accounts)} (3 months): {account_name} ({account_id_to_sync})")
                    try:
                        await sync_meta_data_to_campaigns(user, long_lived_token, account_id_to_sync, db, days=90)
                        print(f"[Meta OAuth] Successfully synced 3 months of data for {account_name}")
                    except Exception as account_error:
                        import traceback
                        print(f"[Meta OAuth] Error syncing 3 months data for {account_name}: {str(account_error)}")
                        print(f"[Meta OAuth] Error details: {traceback.format_exc()}")
                        # 1つのアカウントでエラーが発生しても、他のアカウントの同期は続行
                        continue
                
                print(f"[Meta OAuth] Phase 1 completed: 3 months of data synced for user {user.id}")
                
                # フェーズ2: 全期間（37ヶ月）のデータをバックグラウンドで取得
                print(f"[Meta OAuth] Phase 2: Starting background sync for full period (37 months)...")
                def sync_full_period_background():
                    """バックグラウンドで全期間のデータを取得（同期関数として実装）"""
                    import asyncio
                    from ..database import SessionLocal
                    
                    # 新しいイベントループを作成（バックグラウンドタスク用）
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    background_db = SessionLocal()
                    try:
                        # ユーザー情報を再取得
                        background_user = background_db.query(User).filter(User.id == user.id).first()
                        if not background_user:
                            print(f"[Meta OAuth] Background sync: User not found")
                            return
                        
                        print(f"[Meta OAuth] Background sync: Starting full period sync for user {background_user.id}")
                        
                        # 非同期関数を実行
                        async def run_sync():
                            for idx, account in enumerate(accounts):
                                account_id_to_sync = account.get("id")
                                account_name = account.get("name", "Unknown")
                                print(f"[Meta OAuth] Background sync: Syncing account {idx + 1}/{len(accounts)} (full period): {account_name} ({account_id_to_sync})")
                                try:
                                    await sync_meta_data_to_campaigns(background_user, long_lived_token, account_id_to_sync, background_db, days=None)
                                    print(f"[Meta OAuth] Background sync: Successfully synced full period for {account_name}")
                                except Exception as account_error:
                                    import traceback
                                    print(f"[Meta OAuth] Background sync: Error syncing full period for {account_name}: {str(account_error)}")
                                    print(f"[Meta OAuth] Background sync: Error details: {traceback.format_exc()}")
                                    continue
                            
                            print(f"[Meta OAuth] Background sync: Full period sync completed for user {background_user.id}")
                        
                        # 非同期関数を実行
                        loop.run_until_complete(run_sync())
                    finally:
                        background_db.close()
                        loop.close()
                
                # バックグラウンドタスクとして追加
                background_tasks.add_task(sync_full_period_background)
                print(f"[Meta OAuth] Background task added for full period sync")
                
            except Exception as sync_error:
                import traceback
                print(f"[Meta OAuth] Error syncing data: {str(sync_error)}")
                print(f"[Meta OAuth] Error details: {traceback.format_exc()}")
                # データ同期エラーは無視して、OAuth認証は成功として扱う
            
            # フロントエンドにリダイレクト（成功メッセージ付き）
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
            account_count = len(accounts)
            if account_count > 1:
                success_url = f"{frontend_url}/settings?meta_oauth=success&account_id={account_id}&account_count={account_count}"
            else:
                success_url = f"{frontend_url}/settings?meta_oauth=success&account_id={account_id}"
            return RedirectResponse(url=success_url)
            
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if hasattr(e.response, 'text') else str(e)
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'Meta APIエラー: {error_text}')}"
        return RedirectResponse(url=error_url)
    except HTTPException:
        # HTTPExceptionはそのまま再スロー（ただし、リダイレクトに変換する）
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[Meta OAuth] Error in callback: {str(e)}")
        print(f"[Meta OAuth] Error details: {error_details}")
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote(f'OAuth認証に失敗しました: {str(e)}')}"
        return RedirectResponse(url=error_url)

