# ローカル開発環境でのMeta OAuth認証テスト設定ガイド

## 概要

ローカルフロントエンド（`http://localhost:3000`）から本番バックエンド（`https://mieru-ai-production.up.railway.app`）のOAuth APIを使用する設定方法です。

## 設定手順

### 1. フロントエンドの環境変数設定

フロントエンドのプロジェクトルート（`frontend/`ディレクトリ）に `.env.local` ファイルを作成し、以下の内容を設定してください：

```bash
# ローカル開発環境で本番バックエンドを使用する場合の設定
# このファイルは .gitignore に含まれているため、Gitにはコミットされません

# 本番バックエンドのAPI URL
VITE_API_URL=https://mieru-ai-production.up.railway.app/api
```

**ファイル作成方法**:
```bash
cd frontend
cat > .env.local << 'EOF'
# ローカル開発環境で本番バックエンドを使用する場合の設定
VITE_API_URL=https://mieru-ai-production.up.railway.app/api
EOF
```

### 2. バックエンドのCORS設定確認

Railwayダッシュボードで、バックエンドサービスの環境変数 `CORS_ORIGINS` を確認してください。

**必要な設定**:
```
CORS_ORIGINS=https://mieru.netlify.app,http://localhost:3000,http://localhost:5173
```

`http://localhost:3000` が含まれていることを確認してください。含まれていない場合は追加してください。

**Railwayでの設定手順**:
1. Railwayダッシュボードにアクセス: https://railway.app/
2. プロジェクトを選択
3. バックエンドサービス（mieru-ai-production）を選択
4. 「Variables」タブを開く
5. `CORS_ORIGINS` 環境変数を確認・編集
6. `http://localhost:3000` が含まれていることを確認
7. 含まれていない場合は、カンマ区切りで追加（例: `https://mieru.netlify.app,http://localhost:3000,http://localhost:5173`）
8. サービスを再デプロイ

### 3. Meta for Developersの設定確認

Meta for Developersのアプリ設定で、コールバックURLが正しく設定されていることを確認してください。

**必要な設定**:
1. https://developers.facebook.com/apps/854731910864400 にアクセス
2. 左メニュー「製品」→「Facebook Login」→「設定」を開く
3. 「有効なOAuthリダイレクトURI」に以下が設定されていることを確認：

```
https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
```

**注意**: ローカルフロントエンド（`http://localhost:3000`）はMeta for Developersのアプリドメインに追加できませんが、コールバックURLはバックエンドのURL（`https://mieru-ai-production.up.railway.app/api/meta/oauth/callback`）を使用するため、問題ありません。

## 動作確認

### 1. フロントエンドの起動

```bash
cd frontend
npm run dev
```

フロントエンドが `http://localhost:3000` で起動します。

### 2. ブラウザでアクセス

`http://localhost:3000` にアクセスし、ログインします。

### 3. Meta OAuth認証のテスト

1. 設定画面（`/settings`）に移動
2. 「Metaでログインして連携」ボタンをクリック
3. 以下のフローが実行されることを確認：

   **期待される動作**:
   - フロントエンドが `/api/meta/oauth/authorize-url` を呼び出す
   - バックエンドがMeta認証URLを生成して返す
   - ブラウザがMeta認証画面にリダイレクトされる
   - ユーザーが権限を承認
   - MetaがバックエンドのコールバックURL（`https://mieru-ai-production.up.railway.app/api/meta/oauth/callback`）にリダイレクト
   - バックエンドがトークンを取得して処理
   - フロントエンド（`http://localhost:3000/settings?meta_oauth=success`）にリダイレクト

### 4. デバッグ方法

**ブラウザの開発者ツール**:
- ネットワークタブでAPIリクエストを確認
- `VITE_API_URL` が正しく設定されているか確認（`https://mieru-ai-production.up.railway.app/api` になっているか）

**コンソールログ**:
- フロントエンドのコンソールでエラーメッセージを確認
- バックエンドのログ（Railwayの「Logs」タブ）でエラーを確認

## トラブルシューティング

### エラー: CORSエラー

**原因**: バックエンドの `CORS_ORIGINS` に `http://localhost:3000` が含まれていない

**解決方法**:
1. Railwayの環境変数 `CORS_ORIGINS` を確認
2. `http://localhost:3000` を追加
3. サービスを再デプロイ

### エラー: 404 Not Found

**原因**: `VITE_API_URL` が正しく設定されていない、またはフロントエンドが再起動されていない

**解決方法**:
1. `.env.local` ファイルが正しく作成されているか確認
2. フロントエンドを再起動（`npm run dev`）
3. ブラウザのキャッシュをクリア

### エラー: Meta認証後にリダイレクトされない

**原因**: Meta for DevelopersのコールバックURLが正しく設定されていない

**解決方法**:
1. Meta for Developersの「有効なOAuthリダイレクトURI」を確認
2. `https://mieru-ai-production.up.railway.app/api/meta/oauth/callback` が設定されていることを確認

## 環境変数の確認

### フロントエンド（`.env.local`）

```bash
VITE_API_URL=https://mieru-ai-production.up.railway.app/api
```

### バックエンド（Railway）

```
META_APP_ID=854731910864400
META_APP_SECRET=（実際のApp Secret）
META_REDIRECT_URI=https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
FRONTEND_URL=https://mieru.netlify.app
CORS_ORIGINS=https://mieru.netlify.app,http://localhost:3000,http://localhost:5173
```

## 注意事項

1. **`.env.local` ファイルはGitにコミットされません**（`.gitignore`に含まれているため）
2. **ローカル開発環境では本番バックエンドを使用するため、本番データに影響を与える可能性があります**
3. **Meta認証のコールバックURLは常にバックエンドのURL（`https://mieru-ai-production.up.railway.app/api/meta/oauth/callback`）を使用します**

---

**作成日時**: 2024年12月24日

