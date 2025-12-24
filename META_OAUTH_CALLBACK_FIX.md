# Meta OAuth認証フロー修正ガイド

## 問題の概要

Meta OAuth認証フローで、認証後にバックエンドのコールバックURLにリダイレクトされるが、`code`と`state`パラメータが渡されていないエラーが発生していました。

## 修正内容

### 1. バックエンドのコールバックエンドポイント修正

**ファイル**: `backend/app/routers/meta_api.py`

#### 修正前の問題
- `code`と`state`パラメータが必須（`Query(...)`）だったため、パラメータが渡されない場合にエラーが発生
- Meta認証が拒否された場合のエラーハンドリングが不十分
- エラー時にHTTPExceptionをスローしていたため、フロントエンドに適切にリダイレクトされない

#### 修正後
- `code`と`state`パラメータをオプショナル（`Query(None)`）に変更
- `error`、`error_reason`、`error_description`パラメータを追加して、Meta認証拒否時のエラーを処理
- エラー時はフロントエンドにリダイレクトして、エラーメッセージを表示

```python
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
    
    # ... 以降の処理
```

### 2. フロントエンドのエラーハンドリング追加

**ファイル**: `frontend/src/components/Settings.tsx`

#### 修正内容
- OAuthコールバック時のエラーメッセージを処理するロジックを追加

```typescript
// Handle OAuth callback
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const oauthStatus = urlParams.get('meta_oauth');
  
  if (oauthStatus === 'success') {
    // 成功時の処理
    // ...
  } else if (oauthStatus === 'error') {
    // エラー時の処理を追加
    const errorMessage = urlParams.get('message') || 'Meta OAuth認証に失敗しました';
    addToast(errorMessage, 'error');
    window.history.replaceState({}, '', '/settings');
  }
  // ...
}, []);
```

## 正しいOAuth認証フロー

### 1. ユーザーが「Metaでログインして連携」ボタンをクリック

フロントエンドが `/api/meta/oauth/authorize-url` を呼び出し、OAuth認証URLを取得

### 2. バックエンドがMeta認証URLを生成

```
https://www.facebook.com/v18.0/dialog/oauth?
  client_id=854731910864400&
  redirect_uri=https://mieru-ai-production.up.railway.app/api/meta/oauth/callback&
  scope=ads_read,ads_management&
  state=STATE_WITH_USER_ID&
  response_type=code
```

**重要**: `redirect_uri`はバックエンドのコールバックURLである必要があります。

### 3. ユーザーがMeta認証を完了

Meta認証後、以下のいずれかのURLにリダイレクトされます：

**成功時**:
```
https://mieru-ai-production.up.railway.app/api/meta/oauth/callback?code=xxx&state=xxx
```

**エラー時（認証拒否など）**:
```
https://mieru-ai-production.up.railway.app/api/meta/oauth/callback?error=access_denied&error_reason=user_denied&error_description=...
```

### 4. バックエンドがコールバックを処理

- `code`パラメータを使用してアクセストークンを取得
- 長期トークンに変換
- 広告アカウントIDを取得
- ユーザー設定を更新
- フロントエンドにリダイレクト（成功またはエラー）

### 5. フロントエンドが結果を表示

- 成功時: `?meta_oauth=success&account_id=xxx`
- エラー時: `?meta_oauth=error&message=xxx`

## 必要な設定

### Railway環境変数

以下の環境変数が正しく設定されていることを確認してください：

```
META_APP_ID=854731910864400
META_APP_SECRET=（実際のApp Secret）
META_OAUTH_REDIRECT_URI=https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
FRONTEND_URL=https://mieru.netlify.app
CORS_ORIGINS=https://mieru.netlify.app,http://localhost:3000,http://localhost:5173
```

**重要**: `META_OAUTH_REDIRECT_URI`は**バックエンドのコールバックURL**である必要があります。

### Meta for Developersの設定

1. https://developers.facebook.com/apps/854731910864400 にアクセス
2. 左メニュー「製品」→「Facebook Login」→「設定」を開く
3. 「有効なOAuthリダイレクトURI」に以下を追加：

```
https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
```

**重要**: このURLは、バックエンドのコールバックエンドポイントのURLと完全に一致する必要があります。

## トラブルシューティング

### エラー: `code`と`state`パラメータが取得できない

**原因**:
1. Meta for Developersの「有効なOAuthリダイレクトURI」に正しいURLが設定されていない
2. `META_OAUTH_REDIRECT_URI`環境変数の値が間違っている
3. Meta認証が拒否された（`error`パラメータが返される）

**解決方法**:
1. Meta for Developersの設定を確認
2. Railwayの環境変数を確認
3. ブラウザの開発者ツールでネットワークタブを確認し、実際にリダイレクトされているURLを確認

### エラー: 認証後にフロントエンドにリダイレクトされない

**原因**: バックエンドのエラーハンドリングが不十分

**解決方法**: 修正後のコードでは、すべてのエラーがフロントエンドにリダイレクトされるようになっています。

### エラー: 500 Internal Server Error

**原因**: 環境変数が設定されていない、または値が間違っている

**解決方法**:
1. Railwayのログを確認
2. すべての環境変数が設定されているか確認
3. サービスを再デプロイ

## 確認チェックリスト

- [ ] バックエンドのコールバックエンドポイントが修正されている
- [ ] フロントエンドのエラーハンドリングが追加されている
- [ ] Railwayの環境変数が正しく設定されている
- [ ] Meta for Developersの「有効なOAuthリダイレクトURI」が設定されている
- [ ] サービスが再デプロイされている
- [ ] 本番環境でテストが完了している

---

**修正日時**: 2024年12月24日  
**修正ファイル**: 
- `backend/app/routers/meta_api.py`
- `frontend/src/components/Settings.tsx`

