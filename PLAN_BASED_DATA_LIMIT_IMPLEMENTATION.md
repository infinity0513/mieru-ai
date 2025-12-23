# プラン別データ取得件数制限の実装方法

## 📋 要件

- **FREEプラン**: 100件まで
- **STANDARD（MIDDLE）プラン**: 100件まで
- **PRO（HIGH）プラン**: 無制限（ページネーション処理で全て取得）

---

## 🔧 実装方法

### 1. プラン別の取得件数制限を定義

```python
# backend/app/utils/plan_limits.py (新規作成)

PLAN_LIMITS = {
    "FREE": 100,
    "STANDARD": 100,
    "PRO": None  # None = 無制限
}

def get_max_adset_limit(plan: str) -> Optional[int]:
    """プランに応じた最大広告セット取得件数を返す"""
    return PLAN_LIMITS.get(plan, 100)  # デフォルトは100件
```

### 2. Meta APIエンドポイントの修正

```python
# backend/app/routers/meta_api.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from ..models.user import User
from ..utils.dependencies import get_current_user
from ..utils.plan_limits import get_max_adset_limit  # 追加
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
                
                # 次のページのURLを設定
                adsets_url = next_url
            
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
```

---

## 📝 実装の詳細

### プラン別の制限

| プラン | 最大取得件数 | ページネーション |
|--------|------------|----------------|
| **FREE** | 100件 | なし（100件で停止） |
| **STANDARD** | 100件 | なし（100件で停止） |
| **PRO** | 無制限 | あり（全て取得） |

### 動作フロー

1. **ユーザーのプランを確認**
   - `current_user.plan`からプランを取得
   - `get_max_adset_limit()`で最大取得件数を取得

2. **広告セット一覧の取得**
   - ページネーション処理で広告セットを取得
   - FREE/STANDARDプランの場合、100件に達したら停止
   - PROプランの場合、全ての広告セットを取得

3. **Insightsの取得**
   - 取得した広告セットのInsightsを取得
   - 制限に達した場合、警告メッセージを返す

---

## 🎯 メリット

1. **プラン差別化**: プランによって機能を差別化できる
2. **コスト管理**: FREE/STANDARDプランではAPI呼び出し数を制限
3. **アップグレード促進**: 制限に達した場合、PROプランへのアップグレードを促す

---

## ⚠️ 注意事項

1. **ユーザーへの通知**: 制限に達した場合、警告メッセージを表示
2. **エラーハンドリング**: プランが不明な場合のデフォルト値（100件）
3. **パフォーマンス**: PROプランで大量のデータを取得する場合、処理時間が長くなる可能性

---

## 📊 コストへの影響

### FREE/STANDARDプラン（100件まで）
- **API呼び出し数**: 最大101回（広告セット一覧1回 + Insights 100回）
- **月間API呼び出し数**: 最大3,030回/月
- **コスト**: ¥0（Meta APIは無料）

### PROプラン（無制限）
- **API呼び出し数**: 広告セット数に応じて変動
- **月間API呼び出し数**: 広告セット数 × 30日
- **コスト**: ¥0（Meta APIは無料）
- **処理時間**: 広告セット数に応じて増加

---

## 🔄 実装手順

1. **`backend/app/utils/plan_limits.py`を作成**
   - プラン別の制限を定義

2. **`backend/app/routers/meta_api.py`を修正**
   - プラン別の制限を適用
   - ページネーション処理を実装

3. **テスト**
   - 各プランで正しく制限が適用されるか確認
   - 警告メッセージが正しく表示されるか確認

---

## 💡 拡張案

### オプション1: プラン別の日付範囲制限

```python
PLAN_DATE_RANGE_LIMITS = {
    "FREE": 7,      # 7日間
    "STANDARD": 30,  # 30日間
    "PRO": None      # 無制限
}
```

### オプション2: プラン別の取得頻度制限

```python
PLAN_FREQUENCY_LIMITS = {
    "FREE": 1,      # 1日1回
    "STANDARD": 3,  # 1日3回
    "PRO": None      # 無制限
}
```

---

## 📚 参考

- `backend/app/models/user.py` - Userモデルのプランフィールド
- `backend/app/routers/meta_api.py` - Meta APIエンドポイント
- `PAGINATION_ANALYSIS.md` - ページネーション処理のメリット・デメリット

