# Netlify本番環境でのMeta OAuth認証設定ガイド

## 現在の状況

- **フロントエンド**: Netlify (https://mieru.netlify.app)
- **バックエンド**: Railway (https://mieru-ai-production.up.railway.app)
- **実装状況**: Meta OAuth認証ボタンは実装済み（ローカルでは動作）

## 必要な設定

### 1. Netlify環境変数の設定

Netlifyダッシュボードで以下の環境変数を設定してください：

1. Netlifyダッシュボードにアクセス: https://app.netlify.com/
2. プロジェクトを選択
3. 「Site settings」→「Environment variables」を開く
4. 以下の環境変数を追加：

```
VITE_API_URL=https://mieru-ai-production.up.railway.app/api
```

**重要**: 環境変数を追加した後、**サイトを再デプロイ**してください。

### 2. Railway環境変数の設定

Railwayダッシュボードで以下の環境変数を設定してください：

1. Railwayダッシュボードにアクセス: https://railway.app/
2. プロジェクトを選択
3. バックエンドサービスを選択
4. 「Variables」タブを開く
5. 以下の環境変数を追加または確認：

```
META_APP_ID=854731910864400
META_APP_SECRET=your-meta-app-secret-here
META_OAUTH_REDIRECT_URI=https://mieru.netlify.app/settings?meta_oauth=callback
FRONTEND_URL=https://mieru.netlify.app
CORS_ORIGINS=https://mieru.netlify.app,http://localhost:3000
```

**重要**: 環境変数を追加した後、**サービスを再デプロイ**してください。

### 3. Meta for Developersの設定

1. Meta for Developersにアクセス: https://developers.facebook.com/apps/854731910864400
2. 左メニュー「製品」→「Facebook Login」→「設定」を開く
3. 「有効なOAuthリダイレクトURI」に以下を追加：

```
https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
```

**注意**: バックエンドのコールバックURLを設定します。フロントエンドのURLではありません。

### 4. 動作確認

1. https://mieru.netlify.app にアクセス
2. ログイン
3. 左メニュー「設定」をクリック
4. 「Meta広告アカウント連携」セクションまでスクロール
5. 「Metaでログインして連携」ボタンが表示されることを確認
6. ボタンをクリックしてMeta認証が動作することを確認

## トラブルシューティング

### ボタンが表示されない

1. ブラウザのコンソール（F12）でエラーを確認
2. `VITE_API_URL`が正しく設定されているか確認
3. Netlifyのビルドログでエラーがないか確認
4. サイトを再デプロイ

### 認証が失敗する

1. Railwayのログでエラーを確認
2. `META_APP_ID`と`META_APP_SECRET`が正しく設定されているか確認
3. `META_OAUTH_REDIRECT_URI`が正しく設定されているか確認
4. Meta for Developersの「有効なOAuthリダイレクトURI」を確認

### CORSエラー

1. Railwayの`CORS_ORIGINS`に`https://mieru.netlify.app`が含まれているか確認
2. バックエンドを再デプロイ

## 確認チェックリスト

- [ ] Netlifyに`VITE_API_URL`環境変数が設定されている
- [ ] Railwayに`META_APP_ID`環境変数が設定されている
- [ ] Railwayに`META_APP_SECRET`環境変数が設定されている
- [ ] Railwayに`META_OAUTH_REDIRECT_URI`環境変数が設定されている
- [ ] Railwayに`FRONTEND_URL`環境変数が設定されている
- [ ] Railwayに`CORS_ORIGINS`環境変数が設定されている
- [ ] Meta for Developersの「有効なOAuthリダイレクトURI」にバックエンドのコールバックURLが設定されている
- [ ] Netlifyサイトを再デプロイした
- [ ] Railwayサービスを再デプロイした
- [ ] 本番環境でボタンが表示されることを確認した
- [ ] 本番環境で認証が動作することを確認した

