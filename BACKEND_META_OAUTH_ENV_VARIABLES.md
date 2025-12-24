# バックエンドコードで使用されているMeta OAuth環境変数名

## 確認結果

バックエンドコード（FastAPI）で使用されている**正確な環境変数名**は以下の通りです。

---

## 使用されている環境変数名

### 1. App ID
**環境変数名**: `META_APP_ID`  
**定義場所**: `backend/app/config.py` (60行目)  
**使用箇所**: `backend/app/routers/meta_api.py`
- 132行目: `if not settings.META_APP_ID:`
- 149行目: `f"client_id={settings.META_APP_ID}&"`
- 164行目: `if not settings.META_APP_ID:`
- 181行目: `f"client_id={settings.META_APP_ID}&"`
- 208行目: `if not settings.META_APP_ID or not settings.META_APP_SECRET:`
- 236行目: `"client_id": settings.META_APP_ID,`
- 260行目: `"client_id": settings.META_APP_ID,`

**❌ 使用されていない**: `FACEBOOK_APP_ID`

---

### 2. App Secret
**環境変数名**: `META_APP_SECRET`  
**定義場所**: `backend/app/config.py` (61行目)  
**使用箇所**: `backend/app/routers/meta_api.py`
- 208行目: `if not settings.META_APP_ID or not settings.META_APP_SECRET:`
- 237行目: `"client_secret": settings.META_APP_SECRET,`
- 261行目: `"client_secret": settings.META_APP_SECRET,`

**❌ 使用されていない**: `FACEBOOK_APP_SECRET`

---

### 3. OAuth Redirect URI
**環境変数名**: `META_OAUTH_REDIRECT_URI`  
**定義場所**: `backend/app/config.py` (62行目)  
**使用箇所**: `backend/app/routers/meta_api.py`
- 139行目: `redirect_uri = settings.META_OAUTH_REDIRECT_URI or f"{settings.FRONTEND_URL}/settings?meta_oauth=callback"`
- 171行目: `redirect_uri = settings.META_OAUTH_REDIRECT_URI or f"{settings.FRONTEND_URL}/settings?meta_oauth=callback"`
- 229行目: `redirect_uri = settings.META_OAUTH_REDIRECT_URI or f"{settings.FRONTEND_URL}/settings?meta_oauth=callback"`

**❌ 使用されていない**: `META_REDIRECT_URI`

---

## 環境変数の定義（config.py）

```python
# Meta OAuth
META_APP_ID: Optional[str] = None
META_APP_SECRET: Optional[str] = None
META_OAUTH_REDIRECT_URI: Optional[str] = None  # 例: "http://localhost:3000/settings?meta_oauth=callback"
```

---

## Railway環境変数設定（正しい名前）

Railwayダッシュボードで設定する環境変数名：

```
META_APP_ID=854731910864400
META_APP_SECRET=（実際のApp Secret）
META_OAUTH_REDIRECT_URI=https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
```

---

## 重要な注意事項

### ❌ 間違った環境変数名（使用されていない）
- `FACEBOOK_APP_ID` - 使用されていません
- `FACEBOOK_APP_SECRET` - 使用されていません
- `META_REDIRECT_URI` - 使用されていません（`META_OAUTH_REDIRECT_URI`が正しい）

### ✅ 正しい環境変数名（使用されている）
- `META_APP_ID` - ✅ 使用されている
- `META_APP_SECRET` - ✅ 使用されている
- `META_OAUTH_REDIRECT_URI` - ✅ 使用されている

---

## デフォルト値の動作

`META_OAUTH_REDIRECT_URI`が設定されていない場合、以下のフォールバックが使用されます：

```python
redirect_uri = settings.META_OAUTH_REDIRECT_URI or f"{settings.FRONTEND_URL}/settings?meta_oauth=callback"
```

つまり、`META_OAUTH_REDIRECT_URI`が未設定の場合、`FRONTEND_URL`環境変数から自動的に生成されます。

---

## 確認方法

バックエンドコードで環境変数が正しく読み込まれているか確認するには：

1. Railwayのログを確認
2. エラーメッセージを確認（500エラーの場合）
3. 環境変数が設定されているか確認（Railwayダッシュボード）

---

**最終確認日**: 2024年12月24日  
**コードベース**: `backend/app/config.py`, `backend/app/routers/meta_api.py`

