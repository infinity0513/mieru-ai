from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from ..models.user import User
from ..utils.dependencies import get_current_user
from ..utils.plan_limits import get_max_adset_limit
from ..database import get_db
from ..config import settings
import httpx
import urllib.parse
import secrets

router = APIRouter()

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
    
    # Meta OAuth認証URLを生成
    oauth_url = (
        f"https://www.facebook.com/v24.0/dialog/oauth?"
        f"client_id={settings.META_APP_ID}&"
        f"redirect_uri={urllib.parse.quote(redirect_uri)}&"
        f"scope=ads_read,ads_management,business_management&"
        f"state={urllib.parse.quote(state_with_user)}&"
        f"response_type=code"
    )
    
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
        redirect_uri = settings.META_OAUTH_REDIRECT_URI or "https://mieru-ai-production.up.railway.app/api/meta/oauth/callback"
        
        # ステートパラメータを生成（CSRF対策）
        state = secrets.token_urlsafe(32)
        # ステートをセッションに保存する代わりに、ユーザーIDを含める（簡易版）
        state_with_user = f"{state}:{current_user.id}"
        
        # Meta OAuth認証URLを生成
        oauth_url = (
            f"https://www.facebook.com/v24.0/dialog/oauth?"
            f"client_id={settings.META_APP_ID}&"
            f"redirect_uri={urllib.parse.quote(redirect_uri)}&"
            f"scope=ads_read,ads_management,business_management&"
            f"state={urllib.parse.quote(state_with_user)}&"
            f"response_type=code"
        )
        
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
    
    # ステートからユーザーIDを取得
    try:
        state_parts = state.split(":")
        if len(state_parts) < 2:
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
            error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote('無効なステートパラメータです')}"
            return RedirectResponse(url=error_url)
        user_id = int(state_parts[1])
    except (ValueError, IndexError):
        frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
        error_url = f"{frontend_url}/settings?meta_oauth=error&message={urllib.parse.quote('無効なステートパラメータです')}"
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
            
            # 最初の広告アカウントを使用
            account = accounts[0]
            account_id = account.get("id")  # act_123456789形式
            
            # ユーザーのMetaアカウント設定を更新
            user.meta_account_id = account_id
            user.meta_access_token = long_lived_token
            db.commit()
            db.refresh(user)
            
            # フロントエンドにリダイレクト（成功メッセージ付き）
            frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
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

