# Railway環境変数設定修正ガイド

## 現状の問題

- 古い環境変数名（`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `META_REDIRECT_URI`）が設定されているが、コードでは使用されていない
- コードは `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` を期待している

## 修正手順

### ステップ1: Railwayダッシュボードにアクセス

1. https://railway.app/ にアクセス
2. プロジェクトを選択
3. バックエンドサービス（mieru-ai-production）を選択
4. 「Variables」タブをクリック

### ステップ2: 古い環境変数を削除

以下の環境変数が存在する場合は削除してください：

❌ **削除する環境変数:**
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `META_REDIRECT_URI`

**削除方法:**
1. 各環境変数の右側にある「...」メニューまたは「Delete」ボタンをクリック
2. 削除を確認

### ステップ3: 正しい環境変数を追加

以下の環境変数を追加してください：

#### 1. META_APP_ID

**Key（変数名）:**
```
META_APP_ID
```

**Value（値）:**
```
854731910864400
```

**追加方法:**
1. 「New Variable」または「Add Variable」ボタンをクリック
2. Key: `META_APP_ID`
3. Value: `854731910864400`
4. 「Add」または「Save」をクリック

---

#### 2. META_APP_SECRET

**Key（変数名）:**
```
META_APP_SECRET
```

**Value（値）:**
```
（Meta for Developersで取得した実際のApp Secret）
```

**App Secretの取得方法:**
1. https://developers.facebook.com/apps/854731910864400 にアクセス
2. 左メニュー「設定」→「基本設定」を開く
3. 「アプリシークレット」セクションまでスクロール
4. 「表示」ボタンをクリック
5. パスワードを入力
6. 表示されたApp Secretをコピー

**追加方法:**
1. 「New Variable」または「Add Variable」ボタンをクリック
2. Key: `META_APP_SECRET`
3. Value: （コピーしたApp Secretを貼り付け）
4. 「Add」または「Save」をクリック

---

#### 3. META_OAUTH_REDIRECT_URI

**Key（変数名）:**
```
META_OAUTH_REDIRECT_URI
```

**Value（値）:**
```
https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
```

**追加方法:**
1. 「New Variable」または「Add Variable」ボタンをクリック
2. Key: `META_OAUTH_REDIRECT_URI`
3. Value: `https://mieru-ai-production.up.railway.app/api/meta/oauth/callback`
4. 「Add」または「Save」をクリック

---

### ステップ4: その他の必要な環境変数を確認

以下の環境変数も設定されているか確認してください：

#### FRONTEND_URL

**Key:**
```
FRONTEND_URL
```

**Value:**
```
https://mieru.netlify.app
```

#### CORS_ORIGINS

**Key:**
```
CORS_ORIGINS
```

**Value:**
```
https://mieru.netlify.app,http://localhost:3000,http://localhost:5173
```

---

### ステップ5: 環境変数の確認

設定後、以下のように表示されることを確認：

```
✅ META_APP_ID = 854731910864400
✅ META_APP_SECRET = （実際のApp Secret）
✅ META_OAUTH_REDIRECT_URI = https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
✅ FRONTEND_URL = https://mieru.netlify.app
✅ CORS_ORIGINS = https://mieru.netlify.app,http://localhost:3000,http://localhost:5173
```

**削除済み（表示されないことを確認）:**
```
❌ FACEBOOK_APP_ID（削除済み）
❌ FACEBOOK_APP_SECRET（削除済み）
❌ META_REDIRECT_URI（削除済み）
```

---

### ステップ6: サービスを再デプロイ

環境変数を追加・削除した後、**必ずサービスを再デプロイ**してください：

1. Railwayダッシュボードでバックエンドサービスを選択
2. 「Deployments」タブを開く
3. 最新のデプロイメントの右側にある「...」メニューをクリック
4. 「Redeploy」を選択

または、環境変数を追加・削除すると自動的に再デプロイが開始される場合もあります。

---

## 確認チェックリスト

- [ ] `FACEBOOK_APP_ID`を削除した
- [ ] `FACEBOOK_APP_SECRET`を削除した
- [ ] `META_REDIRECT_URI`を削除した
- [ ] `META_APP_ID`を追加した（値: `854731910864400`）
- [ ] `META_APP_SECRET`を追加した（実際のApp Secret）
- [ ] `META_OAUTH_REDIRECT_URI`を追加した（値: `https://mieru-ai-production.up.railway.app/api/meta/oauth/callback`）
- [ ] `FRONTEND_URL`が設定されている（値: `https://mieru.netlify.app`）
- [ ] `CORS_ORIGINS`が設定されている
- [ ] サービスを再デプロイした
- [ ] 本番環境でエラーが解消された

---

## トラブルシューティング

### エラー: "Meta OAuthが設定されていません"

**原因**: `META_APP_ID`が設定されていない、または環境変数名が間違っている

**解決方法**:
1. Railwayの「Variables」タブで`META_APP_ID`が設定されているか確認
2. 環境変数名が完全一致しているか確認（`META_APP_ID`）
3. 値に余分なスペースがないか確認
4. サービスを再デプロイ

### エラー: 500 Internal Server Error

**原因**: 環境変数が設定されていない、または値が間違っている

**解決方法**:
1. Railwayのログを確認（「Deployments」→「View Logs」）
2. すべての環境変数が設定されているか確認
3. 環境変数名が正しいか確認
4. サービスを再デプロイ

---

## 参考情報

- **バックエンドコード**: `backend/app/config.py` (60-62行目)
- **使用箇所**: `backend/app/routers/meta_api.py`
- **詳細ドキュメント**: `BACKEND_META_OAUTH_ENV_VARIABLES.md`

---

**作成日時**: 2024年12月24日

