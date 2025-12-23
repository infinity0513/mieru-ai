# Railway環境変数設定ガイド（Meta OAuth用）

## エラー内容
```
mieru-ai-production.up.railway.app/api/meta/oauth/authorize-url:1  Failed to load resource: the server responded with a status of 500
```

このエラーは、RailwayのバックエンドでMeta OAuth関連の環境変数が設定されていないことが原因です。

## 必要な環境変数

Railwayダッシュボードで以下の環境変数を設定してください：

### 1. Railwayダッシュボードにアクセス

1. https://railway.app/ にアクセス
2. プロジェクトを選択
3. バックエンドサービス（mieru-ai-production）を選択
4. 「Variables」タブをクリック

### 2. 以下の環境変数を追加

#### 必須の環境変数

**META_APP_ID**
```
854731910864400
```

**META_APP_SECRET**
```
（Meta for Developersで取得したApp Secretを入力）
```

**META_OAUTH_REDIRECT_URI**
```
https://mieru.netlify.app/settings?meta_oauth=callback
```

**FRONTEND_URL**
```
https://mieru.netlify.app
```

**CORS_ORIGINS**
```
https://mieru.netlify.app,http://localhost:3000
```

### 3. 環境変数の設定手順

1. Railwayダッシュボードでバックエンドサービスを選択
2. 「Variables」タブを開く
3. 「New Variable」をクリック
4. 上記の環境変数を1つずつ追加：
   - **Name**: `META_APP_ID`
   - **Value**: `854731910864400`
   - 「Add」をクリック
5. 同様に他の環境変数も追加

### 4. 環境変数の確認

設定後、以下のように表示されることを確認：

```
META_APP_ID=854731910864400
META_APP_SECRET=your-app-secret-here
META_OAUTH_REDIRECT_URI=https://mieru.netlify.app/settings?meta_oauth=callback
FRONTEND_URL=https://mieru.netlify.app
CORS_ORIGINS=https://mieru.netlify.app,http://localhost:3000
```

### 5. サービスを再デプロイ

環境変数を追加した後、**必ずサービスを再デプロイ**してください：

1. Railwayダッシュボードでバックエンドサービスを選択
2. 「Deployments」タブを開く
3. 最新のデプロイメントの右側にある「...」メニューをクリック
4. 「Redeploy」を選択

または、自動的に再デプロイが開始される場合もあります。

## トラブルシューティング

### エラー: "Meta OAuthが設定されていません"

**原因**: `META_APP_ID`が設定されていない

**解決方法**:
1. Railwayの「Variables」タブで`META_APP_ID`が設定されているか確認
2. 値が正しいか確認（`854731910864400`）
3. サービスを再デプロイ

### エラー: 500 Internal Server Error

**原因**: 環境変数が設定されていない、または値が間違っている

**解決方法**:
1. Railwayのログを確認（「Deployments」→「View Logs」）
2. エラーメッセージを確認
3. 必要な環境変数がすべて設定されているか確認
4. サービスを再デプロイ

### META_APP_SECRETの取得方法

1. https://developers.facebook.com/apps/854731910864400 にアクセス
2. 左メニュー「設定」→「基本設定」を開く
3. 「アプリシークレット」セクションまでスクロール
4. 「表示」ボタンをクリック
5. パスワードを入力
6. 表示されたApp Secretをコピー
7. Railwayの`META_APP_SECRET`環境変数に貼り付け

## 確認チェックリスト

- [ ] `META_APP_ID`が設定されている
- [ ] `META_APP_SECRET`が設定されている
- [ ] `META_OAUTH_REDIRECT_URI`が設定されている
- [ ] `FRONTEND_URL`が設定されている
- [ ] `CORS_ORIGINS`が設定されている
- [ ] サービスを再デプロイした
- [ ] 本番環境でエラーが解消された

