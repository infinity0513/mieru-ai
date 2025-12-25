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
    
    # 全期間のデータを取得（Meta APIの最大範囲：過去2年間）
    from datetime import datetime, timedelta
    until = datetime.now().strftime('%Y-%m-%d')
    # Meta APIは最大2年間のデータを取得可能
    since = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%d')
    
    try:
        async with httpx.AsyncClient() as client:
            all_insights = []
            all_adsets = []
            
            # 広告セット一覧を取得
            adsets_url = f"https://graph.facebook.com/v24.0/{account_id}/adsets"
            adsets_params = {
                "access_token": access_token,
                "fields": "id,name,campaign_id",
                "limit": 100
            }
            
            # ページネーション処理（最初の100件のみ）
            adsets_response = await client.get(adsets_url, params=adsets_params)
            adsets_response.raise_for_status()
            adsets_data = adsets_response.json()
            all_adsets = adsets_data.get('data', [])[:100]  # 最初の100件のみ
            
            # 各広告セットのInsightsを取得
            for adset in all_adsets:
                adset_id = adset['id']
                insights_url = f"https://graph.facebook.com/v24.0/{adset_id}/insights"
                insights_params = {
                    "access_token": access_token,
                    "fields": "adset_id,adset_name,ad_id,ad_name,campaign_id,campaign_name,date_start,spend,impressions,clicks,reach,actions,conversions,action_values",
                    "time_range": f"{{'since':'{since}','until':'{until}'}}"
                }
                try:
                    insights_response = await client.get(insights_url, params=insights_params)
                    insights_response.raise_for_status()
                    insights_data = insights_response.json()
                    all_insights.extend(insights_data.get('data', []))
                except Exception as e:
                    print(f"[Meta OAuth] Error fetching insights for adset {adset_id}: {str(e)}")
                    continue
            
            # InsightsデータをCampaignテーブルに保存
            saved_count = 0
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
                    spend = float(insight.get('spend', 0))
                    impressions = int(insight.get('impressions', 0))
                    clicks = int(insight.get('clicks', 0))
                    reach = int(insight.get('reach', 0))
                    
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
                        actions = insight.get('actions', [])
                        for action in actions:
                            action_type = action.get('action_type', '')
                            if action_type in ['offsite_conversion', 'onsite_conversion', 'omni_purchase', 'purchase']:
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
                                if av_type in ['offsite_conversion', 'onsite_conversion', 'omni_purchase', 'purchase']:
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
                            if action_type in ['purchase', 'omni_purchase']:
                                value = action.get('value', 0)
                                try:
                                    conversion_value += float(value) if isinstance(value, (int, float, str)) else 0
                                except (ValueError, TypeError):
                                    pass
                    
                    # デバッグログ（最初の数件のみ）
                    if saved_count < 3:
                        print(f"[Meta OAuth] Insight data for {campaign_name} on {campaign_date}:")
                        print(f"  - conversions: {conversions}")
                        print(f"  - conversion_value: {conversion_value}")
                        print(f"  - spend: {spend}")
                        print(f"  - clicks: {clicks}")
                        if conversions > 0:
                            print(f"  - Calculated CPA: {spend / conversions}")
                    
                    # メトリクスを計算
                    ctr = (clicks / impressions * 100) if impressions > 0 else 0
                    cpc = (spend / clicks) if clicks > 0 else 0
                    cpm = (spend / impressions * 1000) if impressions > 0 else 0
                    cpa = (spend / conversions) if conversions > 0 else 0
                    cvr = (conversions / clicks * 100) if clicks > 0 else 0
                    roas = (conversion_value / spend) if spend > 0 else 0
                    
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
    
    # デフォルトの日付範囲（昨日から今日）
    if not since:
        since = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    if not until:
        until = datetime.now().strftime('%Y-%m-%d')
    
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
                insights_params = {
                    "access_token": access_token,
                    "fields": "adset_id,adset_name,ad_id,ad_name,campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,conversions,reach,actions",
                    "time_range": f"{{'since':'{since}','until':'{until}'}}"
                }
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

