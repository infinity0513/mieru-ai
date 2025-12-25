from fastapi import APIRouter, Depends, HTTPException, Query
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

async def sync_meta_data_to_campaigns(user: User, access_token: str, account_id: str, db: Session):
    """Meta APIからデータを取得してCampaignテーブルに保存"""
    # ダミーのUploadレコードを作成（Meta API同期用）
    upload = Upload(
        user_id=user.id,
        file_name="Meta API Sync",
        status="completed",
        row_count=0
    )
    db.add(upload)
    db.flush()  # upload.idを取得するためにflush
    
    # 全期間のデータを取得（Meta APIの最大範囲：過去37ヶ月間）
    from datetime import datetime, timedelta
    # 昨日までのデータを取得（未来の日付を指定すると400エラーになるため）
    until = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')
    # Meta APIは1回のリクエストで最大37ヶ月（約3年）のデータを取得可能
    # より長期間のデータが必要な場合は、複数回に分けて取得する必要がある
    # ここでは最大37ヶ月（約1125日）を設定
    # Meta APIの推奨期間は90日以内に制限
    since = (datetime.utcnow() - timedelta(days=90)).strftime('%Y-%m-%d')
    
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
            
            # 各キャンペーンのInsightsを取得（キャンペーンレベル）
            print(f"[Meta API] Processing {len(all_campaigns)} campaigns for campaign-level insights...")
            # 昨日までのデータを取得（UTCを使用して未来の日付を避ける）
            current_until = datetime.utcnow() - timedelta(days=1)
            current_since = datetime.strptime(since, '%Y-%m-%d')
            
            # 期間を90日以内に制限
            max_days_per_request = 90  # Meta APIの推奨期間
            if (current_until - current_since).days > max_days_per_request:
                current_since = current_until - timedelta(days=max_days_per_request)
                print(f"[Meta API] Date range reduced to last {max_days_per_request} days: {current_since.strftime('%Y-%m-%d')} to {current_until.strftime('%Y-%m-%d')}")
            
            for idx, campaign in enumerate(all_campaigns):
                campaign_id = campaign.get('id')
                campaign_name = campaign.get('name', 'Unknown')
                
                if (idx + 1) % 10 == 0 or idx == 0:
                    print(f"[Meta API] Fetching insights for campaign {idx + 1}/{len(all_campaigns)}: {campaign_name} (ID: {campaign_id})")
                
                campaign_insights_url = f"https://graph.facebook.com/v24.0/{campaign_id}/insights"
                
                # 期間を分割して取得（90日ごと）
                request_since = current_since
                while request_since < current_until:
                    request_until = min(request_since + timedelta(days=max_days_per_request), current_until)
                    
                    # JSON形式でtime_rangeを作成
                    time_range_dict = {
                        "since": request_since.strftime('%Y-%m-%d'),
                        "until": request_until.strftime('%Y-%m-%d')
                    }
                    time_range_json = json.dumps(time_range_dict)
                    
                    campaign_insights_params = {
                        "access_token": access_token,
                        "fields": "campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,engagements,landing_page_views,link_clicks,frequency",
                        "time_range": time_range_json,  # JSON文字列
                        "limit": 100
                    }
                    
                    # デバッグログ（最初の数件のみ）
                    if idx < 3:
                        print(f"[Meta API] Request params for campaign {campaign_name}: time_range={time_range_json}")
                    
                    try:
                        campaign_insights_response = await client.get(campaign_insights_url, params=campaign_insights_params)
                        campaign_insights_response.raise_for_status()
                        campaign_insights_data = campaign_insights_response.json()
                        
                        # 最初のページのデータを追加
                        page_campaign_insights = campaign_insights_data.get('data', [])
                        all_insights.extend(page_campaign_insights)
                        
                        # デバッグログ（最初の数件のみ）
                        if idx < 3 and len(page_campaign_insights) > 0:
                            sample_insight = page_campaign_insights[0]
                            print(f"[Meta API] Campaign {campaign_name}: spend={sample_insight.get('spend')}, impressions={sample_insight.get('impressions')}, clicks={sample_insight.get('clicks')}")
                        
                        # ページネーション処理（すべてのページを取得）
                        page_num = 1
                        while 'paging' in campaign_insights_data and 'next' in campaign_insights_data['paging']:
                            page_num += 1
                            next_url = campaign_insights_data['paging']['next']
                            next_response = await client.get(next_url)
                            next_response.raise_for_status()
                            campaign_insights_data = next_response.json()
                            page_campaign_insights = campaign_insights_data.get('data', [])
                            all_insights.extend(page_campaign_insights)
                            
                            # デバッグログ（最初の数件のみ）
                            if idx < 3 and page_num <= 3:
                                print(f"[Meta API] Campaign {campaign_name}: Page {page_num} - Retrieved {len(page_campaign_insights)} insights")
                    except Exception as e:
                        print(f"[Meta API] Error fetching campaign insights for {campaign_name} ({campaign_id}) from {request_since.strftime('%Y-%m-%d')} to {request_until.strftime('%Y-%m-%d')}: {str(e)}")
                        # エラーが発生しても次の期間の取得を続行
                    
                    # 次の期間に進む
                    request_since = request_until + timedelta(days=1)
                    
                    # 無限ループ防止
                    if request_since >= current_until:
                        break
            
            print(f"[Meta API] Campaign-level insights retrieved: {len([i for i in all_insights if 'adset_id' not in i or not i.get('adset_id')])}")
            
            # 各広告セットのInsightsを取得（広告セットレベル）
            print(f"[Meta API] Processing {len(all_adsets)} adsets for adset-level insights...")
            for idx, adset in enumerate(all_adsets):
                adset_id = adset['id']
                adset_name = adset.get('name', 'Unknown')
                campaign_id = adset.get('campaign_id', 'Unknown')
                
                if (idx + 1) % 10 == 0 or idx == 0:
                    print(f"[Meta API] Processing adset {idx + 1}/{len(all_adsets)}: {adset_name} (campaign_id: {campaign_id})")
                
                insights_url = f"https://graph.facebook.com/v24.0/{adset_id}/insights"
                
                # 期間を分割して取得（90日ごと）
                request_since = current_since
                while request_since < current_until:
                    request_until = min(request_since + timedelta(days=max_days_per_request), current_until)
                    
                    # JSON形式でtime_rangeを作成
                    time_range_dict = {
                        "since": request_since.strftime('%Y-%m-%d'),
                        "until": request_until.strftime('%Y-%m-%d')
                    }
                    time_range_json = json.dumps(time_range_dict)
                    
                    insights_params = {
                        "access_token": access_token,
                        "fields": "adset_id,adset_name,ad_id,ad_name,campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,engagements,landing_page_views,link_clicks,frequency",
                        "time_range": time_range_json,  # JSON文字列
                        "limit": 100  # ページネーション用のlimitを追加
                    }
                    
                    # デバッグログ（最初の数件のみ）
                    if idx < 3:
                        print(f"[Meta API] Request params for adset {adset_name}: time_range={time_range_json}")
                    try:
                        insights_response = await client.get(insights_url, params=insights_params)
                        insights_response.raise_for_status()
                        insights_data = insights_response.json()
                        
                        # 最初のページのデータを追加
                        page_insights = insights_data.get('data', [])
                        all_insights.extend(page_insights)
                        
                        # ページネーション処理（すべてのページを取得）
                        page_num = 1
                        while 'paging' in insights_data and 'next' in insights_data['paging']:
                            page_num += 1
                            next_url = insights_data['paging']['next']
                            next_response = await client.get(next_url)
                            next_response.raise_for_status()
                            insights_data = next_response.json()
                            page_insights = insights_data.get('data', [])
                            all_insights.extend(page_insights)
                            
                            # デバッグログ（最初の数件のみ）
                            if idx < 3 and page_num <= 3:
                                print(f"[Meta API] Adset {adset_name}: Page {page_num} - Retrieved {len(page_insights)} insights")
                    except Exception as e:
                        print(f"[Meta OAuth] Error fetching insights for adset {adset_id} ({adset_name}) from {request_since.strftime('%Y-%m-%d')} to {request_until.strftime('%Y-%m-%d')}: {str(e)}")
                        # エラーが発生しても次の期間の取得を続行
                    
                    # 次の期間に進む
                    request_since = request_until + timedelta(days=1)
                    
                    # 無限ループ防止
                    if request_since >= current_until:
                        break
            
            print(f"[Meta API] Total insights retrieved: {len(all_insights)}")
            
            # InsightsデータをCampaignテーブルに保存
            saved_count = 0
            campaign_level_count = 0
            adset_level_count = 0
            
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
                    
                    # キャンペーンレベルか広告セットレベルかを判定
                    is_campaign_level = not ad_set_name or ad_set_name == ''
                    if is_campaign_level:
                        campaign_level_count += 1
                    else:
                        adset_level_count += 1
                    
                    # デバッグログ（最初の数件のみ）
                    if saved_count < 5:
                        level_type = "campaign-level" if is_campaign_level else "adset-level"
                        print(f"[Meta API] Saving {level_type} insight: campaign={campaign_name}, adset={ad_set_name or 'N/A'}, date={campaign_date}, spend={insight.get('spend', 0)}")
                    # デバッグログ：生データを詳細にログ出力（最初の数件のみ）
                    if saved_count < 3:
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
                    clicks = int(insight.get('clicks', 0))
                    inline_link_clicks = int(insight.get('inline_link_clicks', 0))
                    reach = int(insight.get('reach', 0))
                    
                    # エンゲージメント関連のデータを取得
                    engagements = int(insight.get('engagements', 0))
                    link_clicks = int(insight.get('link_clicks', 0))
                    landing_page_views = int(insight.get('landing_page_views', 0))
                    frequency = float(insight.get('frequency', 0))
                    
                    # link_clicksが取得できない場合は、inline_link_clicksまたはclicksを使用
                    if link_clicks == 0:
                        if inline_link_clicks > 0:
                            link_clicks = inline_link_clicks
                        elif clicks > 0:
                            link_clicks = clicks
                    
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
                                conversions += int(conv.get('value', 0))
                            else:
                                conversions += int(conv)
                    else:
                        # フォールバック: actionsから取得
                        # Meta APIのactionsフィールドからコンバージョンを取得
                        # offsite_conversion.fb_pixel_complete_registration などのサブタイプにも対応
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
                    
                    # conversion_valueを取得
                    action_values = insight.get('action_values', [])
                    conversion_value = 0
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
                                        conversion_value += float(value) if isinstance(value, (int, float, str)) else 0
                                    except (ValueError, TypeError):
                                        pass
                    else:
                        # フォールバック: actionsから取得
                        actions = insight.get('actions', [])
                        for action in actions:
                            action_type = action.get('action_type', '')
                            # 購入関連のアクションタイプをチェック
                            if (action_type in ['purchase', 'omni_purchase'] or
                                'purchase' in action_type):
                                value = action.get('value', 0)
                                try:
                                    conversion_value += float(value) if isinstance(value, (int, float, str)) else 0
                                except (ValueError, TypeError):
                                    pass
                    
                    
                    # メトリクスを計算（Meta広告マネージャの定義に合わせる）
                    # CTR = (link_clicks / impressions) * 100
                    ctr = (link_clicks / impressions * 100) if impressions > 0 else 0
                    # CPC = spend / link_clicks
                    cpc = (spend / link_clicks) if link_clicks > 0 else 0
                    # CPM = (spend / impressions) * 1000
                    cpm = (spend / impressions * 1000) if impressions > 0 else 0
                    # CPA = spend / conversions
                    cpa = (spend / conversions) if conversions > 0 else 0
                    # CVR = (conversions / link_clicks) * 100
                    cvr = (conversions / link_clicks * 100) if link_clicks > 0 else 0
                    # ROASはパーセンテージで計算（conversion_value / spend * 100）
                    roas = (conversion_value / spend * 100) if spend > 0 else 0
                    
                    # デバッグログ：計算結果を確認（最初の数件のみ）
                    if saved_count < 3:
                        print(f"[Meta API Debug] Calculated metrics:")
                        print(f"  - CTR: {ctr:.2f}% (link_clicks={link_clicks} / impressions={impressions})")
                        print(f"  - CVR: {cvr:.2f}% (conversions={conversions} / link_clicks={link_clicks})")
                        print(f"  - CPC: {cpc:.2f} (spend={spend} / link_clicks={link_clicks})")
                        print(f"  - CPA: {cpa:.2f} (spend={spend} / conversions={conversions})")
                        print(f"  - CPM: {cpm:.2f} (spend={spend} / impressions={impressions} * 1000)")
                        print(f"  - ROAS: {roas:.2f}% (conversion_value={conversion_value} / spend={spend} * 100)")
                    
                    # 既存のレコードをチェック（meta_account_idも含める）
                    existing = db.query(Campaign).filter(
                        Campaign.user_id == user.id,
                        Campaign.meta_account_id == account_id,
                        Campaign.date == campaign_date,
                        Campaign.campaign_name == campaign_name,
                        Campaign.ad_set_name == ad_set_name,
                        Campaign.ad_name == ad_name
                    ).first()
                    
                    if existing:
                        # 更新
                        existing.upload_id = upload.id
                        existing.meta_account_id = account_id
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
            print(f"[Meta OAuth] Breakdown: {campaign_level_count} campaign-level insights, {adset_level_count} adset-level insights")
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
    
    # デフォルトの日付範囲（最近90日間、未来の日付を避ける）
    if not since:
        until_dt = datetime.utcnow() - timedelta(days=1)
        since_dt = until_dt - timedelta(days=90)
        since = since_dt.strftime('%Y-%m-%d')
    if not until:
        until = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # 期間を90日以内に制限
    try:
        until_dt = datetime.strptime(until, '%Y-%m-%d')
        since_dt = datetime.strptime(since, '%Y-%m-%d')
        
        if (until_dt - since_dt).days > 90:
            since_dt = until_dt - timedelta(days=90)
            since = since_dt.strftime('%Y-%m-%d')
            print(f"[Meta API] Date range reduced to last 90 days: {since} to {until}")
    except Exception as e:
        print(f"[Meta API] Error parsing dates: {e}")
        # デフォルトで最近90日間
        until_dt = datetime.utcnow() - timedelta(days=1)
        since_dt = until_dt - timedelta(days=90)
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
                # JSON形式でtime_rangeを作成
                time_range_dict = {
                    "since": since,
                    "until": until
                }
                time_range_json = json.dumps(time_range_dict)
                
                insights_params = {
                    "access_token": access_token,
                    "fields": "adset_id,adset_name,ad_id,ad_name,campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,conversions,reach,actions",
                    "time_range": time_range_json  # JSON文字列
                }
                
                # デバッグログ
                print(f"[Meta API] Request params for /insights endpoint: time_range={time_range_json}")
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
            
            # すべての広告アカウントからデータを取得してCampaignテーブルに保存（バックグラウンドで実行）
            try:
                print(f"[Meta OAuth] Starting data sync for user {user.id}")
                print(f"[Meta OAuth] Found {len(accounts)} ad account(s)")
                
                # すべての広告アカウントのデータを同期
                for idx, account in enumerate(accounts):
                    account_id_to_sync = account.get("id")
                    account_name = account.get("name", "Unknown")
                    print(f"[Meta OAuth] Syncing account {idx + 1}/{len(accounts)}: {account_name} ({account_id_to_sync})")
                    try:
                        await sync_meta_data_to_campaigns(user, long_lived_token, account_id_to_sync, db)
                        print(f"[Meta OAuth] Successfully synced account {account_name}")
                    except Exception as account_error:
                        import traceback
                        print(f"[Meta OAuth] Error syncing account {account_name}: {str(account_error)}")
                        print(f"[Meta OAuth] Error details: {traceback.format_exc()}")
                        # 1つのアカウントでエラーが発生しても、他のアカウントの同期は続行
                        continue
                
                print(f"[Meta OAuth] Data sync completed for user {user.id}")
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

