from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
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
    
    # 現在のUTC時刻を取得してログ出力（デバッグ用）
    current_utc = datetime.utcnow()
    print(f"[Meta API] Current UTC time: {current_utc.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 昨日までのデータを取得（未来の日付を指定すると400エラーになるため）
    until_dt = current_utc - timedelta(days=1)
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
        if since_dt > current_utc or until_dt > current_utc:
            print(f"[Meta API] WARNING: Date range includes future dates! Current UTC: {current_utc.strftime('%Y-%m-%d')}, Since: {since}, Until: {until}")
    
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
            
            print(f"[Meta API] Campaign-level insights retrieved: {len(all_insights)}")
            
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
            
            # InsightsデータをCampaignテーブルに保存（キャンペーンレベルのみ）
            # 同じ期間の既存データを削除（重複を防ぐ）
            db.query(Campaign).filter(
                Campaign.user_id == user.id,
                Campaign.meta_account_id == account_id,
                Campaign.date >= datetime.strptime(since, '%Y-%m-%d').date(),
                Campaign.date <= datetime.strptime(until, '%Y-%m-%d').date(),
                Campaign.ad_set_name.is_(None),
                Campaign.ad_name.is_(None)
            ).delete()
            
            saved_count = 0
            # 重複チェック用のセット（campaign_name, date, meta_account_idの組み合わせ）
            seen_records = set()
            
            for insight in all_insights:
                try:
                    # 日付を取得
                    date_str = insight.get('date_start')
                    if not date_str:
                        print(f"[Meta API] WARNING: Skipping insight with no date_start: {insight}")
                        continue
                    campaign_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    
                    # データを取得（キャンペーンレベルのみ）
                    campaign_name = insight.get('campaign_name', 'Unknown')
                    # キャンペーンレベルのみなので、ad_set_nameとad_nameは常にNULL
                    ad_set_name = None
                    ad_name = None
                    
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
                    conversions_data = insight.get('conversions', [])
                    conversions = 0
                    if conversions_data:
                        for conv in conversions_data:
                            if isinstance(conv, dict):
                                action_type = conv.get('action_type', '')
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
                        for av in action_values:
                            if isinstance(av, dict):
                                av_type = av.get('action_type', '')
                                if (av_type.startswith('offsite_conversion') or 
                                    av_type.startswith('onsite_conversion') or 
                                    av_type in ['omni_purchase', 'purchase'] or
                                    'purchase' in av_type):
                                    value = av.get('value', 0)
                                    try:
                                        conversion_value += float(value) if isinstance(value, (int, float, str)) else 0.0
                                    except (ValueError, TypeError):
                                        pass
                    
                    # フォールバック: actionsから取得
                    if conversion_value == 0:
                        actions = insight.get('actions', [])
                        for action in actions:
                            action_type = action.get('action_type', '')
                            if (action_type in ['purchase', 'omni_purchase'] or
                                'purchase' in action_type):
                                value = action.get('value', 0)
                                try:
                                    conversion_value += float(value) if isinstance(value, (int, float, str)) else 0.0
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
                    
                    # 重複チェック（同じcampaign_name, date, meta_account_idの組み合わせは1件のみ）
                    record_key = (campaign_name, campaign_date, account_id)
                    if record_key in seen_records:
                        print(f"[Meta API] WARNING: Duplicate record skipped: {campaign_name} on {campaign_date}")
                        continue
                    seen_records.add(record_key)
                    
                    # 新規作成（既に同じ期間のデータは削除済み）
                    campaign = Campaign(
                        user_id=user.id,
                        upload_id=upload.id,
                        meta_account_id=account_id,
                        date=campaign_date,
                        campaign_name=campaign_name,
                        ad_set_name=None,  # キャンペーンレベルのみ
                        ad_name=None,  # キャンペーンレベルのみ
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
        
        # Campaignテーブルからユニークなmeta_account_idを取得
        accounts = db.query(Campaign.meta_account_id).filter(
            Campaign.user_id == current_user.id,
            Campaign.meta_account_id.isnot(None)
        ).distinct().all()
        
        print(f"[Meta Accounts] Found {len(accounts)} unique account IDs")
        
        # アカウントIDのリストを作成
        account_ids = [acc[0] for acc in accounts if acc[0]]
        print(f"[Meta Accounts] Account IDs: {account_ids}")
        
        # Meta APIからアカウント名を取得（アクセストークンがある場合）
        account_names = {}
        if current_user.meta_access_token:
            try:
                print(f"[Meta Accounts] Fetching account names from Meta API...")
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
                    print(f"[Meta Accounts] Fetched {len(account_names)} account names from Meta API")
            except Exception as e:
                import traceback
                print(f"[Meta Accounts] Error fetching account names: {str(e)}")
                print(f"[Meta Accounts] Error details: {traceback.format_exc()}")
                # エラーが発生しても続行（アカウントIDをそのまま使用）
        
        # レスポンスを作成
        result = []
        for account_id in account_ids:
            result.append({
                "id": account_id,
                "name": account_names.get(account_id, account_id)
            })
        
        return {"accounts": result}
    except Exception as e:
        import traceback
        print(f"[Meta Accounts] Error: {str(e)}")
        print(f"[Meta Accounts] Error details: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"アカウント取得エラー: {str(e)}")

@router.get("/accounts/")
async def get_meta_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ユーザーが連携しているMeta広告アカウント（アセット）一覧を取得"""
    try:
        print(f"[Meta Accounts] Getting accounts for user: {current_user.id}")
        
        # Campaignテーブルからユニークなmeta_account_idを取得
        accounts = db.query(Campaign.meta_account_id).filter(
            Campaign.user_id == current_user.id,
            Campaign.meta_account_id.isnot(None)
        ).distinct().all()
        
        print(f"[Meta Accounts] Found {len(accounts)} unique account IDs")
        
        # アカウントIDのリストを作成
        account_ids = [acc[0] for acc in accounts if acc[0]]
        print(f"[Meta Accounts] Account IDs: {account_ids}")
        
        # Meta APIからアカウント名を取得（アクセストークンがある場合）
        account_names = {}
        if current_user.meta_access_token:
            try:
                print(f"[Meta Accounts] Fetching account names from Meta API...")
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
                    print(f"[Meta Accounts] Fetched {len(account_names)} account names from Meta API")
            except Exception as e:
                import traceback
                print(f"[Meta Accounts] Error fetching account names: {str(e)}")
                print(f"[Meta Accounts] Error details: {traceback.format_exc()}")
                # エラーが発生しても続行（アカウントIDをそのまま使用）
        
        # 各アカウントの統計情報を取得
        result = []
        for account_id in account_ids:
            try:
                # 各アカウントのデータ件数を取得（全レベル合計）
                total_count = db.query(Campaign).filter(
                    Campaign.user_id == current_user.id,
                    Campaign.meta_account_id == account_id
                ).count()
                
                # ユニークなキャンペーン数を取得
                unique_campaigns = db.query(Campaign.campaign_name).filter(
                    Campaign.user_id == current_user.id,
                    Campaign.meta_account_id == account_id,
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
                    Campaign.meta_account_id == account_id
                ).scalar()
                
                # アカウント名を取得（Meta APIから取得できた場合はそれを使用、なければアカウントID）
                account_name = account_names.get(account_id, account_id)
                
                result.append({
                    "account_id": account_id,
                    "name": account_name,
                    "data_count": total_count,
                    "campaign_count": unique_campaigns,
                    "latest_date": str(latest_date) if latest_date else None
                })
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
    if not since:
        until_dt = datetime.utcnow() - timedelta(days=1)
        since_dt = until_dt - timedelta(days=1095)  # 37ヶ月
        since = since_dt.strftime('%Y-%m-%d')
    if not until:
        until = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')
    
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
        # デフォルトで最近37ヶ月間
        until_dt = datetime.utcnow() - timedelta(days=1)
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
            
            # 段階的データ取得: まず90日分を同期的に取得（完了まで待つ）、その後バックグラウンドで全期間を取得
            account_count = len(accounts)
            
            print(f"[Meta OAuth] Starting data sync for user {user.id}")
            print(f"[Meta OAuth] Found {len(accounts)} ad account(s)")
            
            # フェーズ1: 直近90日分のデータを同期的に取得（完了まで待つ）
            print(f"[Meta OAuth] Phase 1: Fetching last 90 days of data synchronously...")
            try:
                for idx, account in enumerate(accounts):
                    account_id_to_sync = account.get("id")
                    account_name = account.get("name", "Unknown")
                    print(f"[Meta OAuth] Syncing account {idx + 1}/{len(accounts)} (90 days): {account_name} ({account_id_to_sync})")
                    try:
                        await sync_meta_data_to_campaigns(user, long_lived_token, account_id_to_sync, db, days=90)
                        print(f"[Meta OAuth] Successfully synced 90 days of data for {account_name}")
                    except Exception as account_error:
                        import traceback
                        print(f"[Meta OAuth] Error syncing 90 days data for {account_name}: {str(account_error)}")
                        print(f"[Meta OAuth] Error details: {traceback.format_exc()}")
                        # 1つのアカウントでエラーが発生しても、他のアカウントの同期は続行
                        continue
                
                print(f"[Meta OAuth] Phase 1 completed: 90 days of data synced for user {user.id}")
            except Exception as sync_error:
                import traceback
                print(f"[Meta OAuth] Error syncing 90 days data: {str(sync_error)}")
                print(f"[Meta OAuth] Error details: {traceback.format_exc()}")
                # データ同期エラーは無視して、OAuth認証は成功として扱う
            
            # フェーズ2: 全期間（37ヶ月）のデータをバックグラウンドで取得
            print(f"[Meta OAuth] Phase 2: Starting background sync for full period (37 months)...")
            
            # アカウント情報をバックグラウンドタスクに渡すためにコピー
            accounts_for_background = [{"id": acc.get("id"), "name": acc.get("name", "Unknown")} for acc in accounts]
            user_id_for_background = user.id
            
            async def sync_full_period_background_async():
                """バックグラウンドで全期間のデータを取得（非同期関数）"""
                from ..database import SessionLocal
                import asyncio
                
                print(f"[Meta OAuth] Background sync: Task started")
                print(f"[Meta OAuth] Background sync: Accounts to sync: {len(accounts_for_background)}")
                
                # 新しいイベントループを作成（バックグラウンドタスク用）
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                
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
                    
                    # トークンを再取得（バックグラウンドタスクでは新しいセッションを使用）
                    if not background_user.meta_access_token:
                        print(f"[Meta OAuth] Background sync: ERROR - No access token found")
                        return
                    
                    for idx, account in enumerate(accounts_for_background):
                        account_id_to_sync = account.get("id")
                        account_name = account.get("name", "Unknown")
                        print(f"[Meta OAuth] Background sync: Syncing account {idx + 1}/{len(accounts_for_background)} (full period): {account_name} ({account_id_to_sync})")
                        try:
                            await sync_meta_data_to_campaigns(background_user, background_user.meta_access_token, account_id_to_sync, background_db, days=None)
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
            
            # バックグラウンドタスクとして追加
            background_tasks.add_task(sync_full_period_background_async)
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

