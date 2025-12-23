from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from ..models.user import User
from ..utils.dependencies import get_current_user
from ..utils.plan_limits import get_max_adset_limit
from ..database import get_db
import httpx

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

