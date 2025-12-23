# Netlify デプロイガイド

## ステップ1: Netlifyアカウントの準備

1. [Netlify](https://www.netlify.com/)にアクセス
2. 「Sign up」をクリック
3. GitHubアカウントでログイン（推奨）

## ステップ2: プロジェクトをデプロイ

### 方法A: GitHubリポジトリからデプロイ（推奨）

1. Netlifyダッシュボードで「Add new site」→「Import an existing project」をクリック
2. GitHubを選択してリポジトリを連携
3. リポジトリを選択
4. 以下の設定を入力：
   - **Base directory**: `frontend`（フロントエンドフォルダを指定）
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. 「Deploy site」をクリック

### 方法B: Netlify CLIでデプロイ

```bash
# Netlify CLIをインストール
npm install -g netlify-cli

# ログイン
netlify login

# フロントエンドフォルダに移動
cd frontend

# デプロイ
netlify deploy --prod
```

## ステップ3: 環境変数の設定

Netlifyダッシュボードで以下の環境変数を設定：

1. サイトの「Site settings」→「Environment variables」を開く
2. 以下の環境変数を追加：

### 必須環境変数

- **VITE_API_URL**
  - 値: RailwayのバックエンドURL（例: `https://mieru-ai-production.up.railway.app/api`）
  - 注意: `/api` を必ず含める

### オプション環境変数

- **VITE_OPENAI_API_KEY**（AI機能を使用する場合）
  - 値: OpenAI APIキー

## ステップ4: ドメインの確認

1. Netlifyダッシュボードでサイトを開く
2. 「Site settings」→「Domain management」でドメインを確認
3. デフォルトドメインは `your-site-name.netlify.app` の形式

## ステップ5: Railwayの環境変数を更新

Netlifyでデプロイが完了したら、Railwayのバックエンド環境変数を更新：

1. Railwayダッシュボードで「mieru-ai」サービスを開く
2. 「Settings」→「Variables」タブを開く
3. 以下の環境変数を設定/更新：

```
CORS_ORIGINS=https://your-site-name.netlify.app,https://your-site-name.netlify.app
FRONTEND_URL=https://your-site-name.netlify.app
```

**重要**: `your-site-name.netlify.app` を実際のNetlifyドメインに置き換えてください。

## ステップ6: 動作確認

1. NetlifyのサイトURLにアクセス
2. ログイン機能が動作するか確認
3. API接続が正常に動作するか確認

## トラブルシューティング

### ビルドエラーが発生する場合

- Node.jsのバージョンを確認（18以上が必要）
- `npm install` をローカルで実行して依存関係を確認

### API接続エラーが発生する場合

- `VITE_API_URL` が正しく設定されているか確認
- Railwayのバックエンドが起動しているか確認
- CORS設定が正しいか確認

### ルーティングが動作しない場合

- `_redirects` ファイルが `public` フォルダに配置されているか確認
- `netlify.toml` の設定を確認

