# Railwayデプロイ進捗メモ

## 完了した作業

### ✅ ステップ1: Railwayプロジェクトの作成
- Railwayアカウントでプロジェクト作成
- PostgreSQLサービスを追加
- mieru-aiサービス（バックエンド）を追加

### ✅ ステップ2: PostgreSQLの設定
- PostgreSQLサービスで「Variables」タブを開く
- `DATABASE_URL`をコピー

### ✅ ステップ3: mieru-aiサービスに環境変数を設定
Railwayの「mieru-ai」サービス → 「Settings」→「Variables」タブで以下を設定：

#### 設定済み環境変数
- **DATABASE_URL**: PostgreSQLの接続URL（PostgresサービスのVariablesからコピー）
- **SECRET_KEY**: `lqB1SWftsEatV3nMI5Vc-OEy8P0iYhlmKYVbJNCHeQM`（新規生成）
- **ENVIRONMENT**: `production`（推奨）
- **DEBUG**: `False`（推奨）
- **PORT**: Railwayが自動設定

### ✅ ステップ4: デプロイ完了
- デプロイが成功
- サービスが「Online」状態
- アプリケーションが正常に起動
- Uvicornが `http://0.0.0.0:8000` で実行中

### ✅ ステップ5: 動作確認完了
以下のエンドポイントが正常に動作することを確認：
- `https://mieru-ai-production.up.railway.app/` → `{"message":"Meta Ad Analyzer AI API"}`
- `https://mieru-ai-production.up.railway.app/docs` → APIドキュメント表示
- `https://mieru-ai-production.up.railway.app/health` → `{"status":"ok"}`

---

## 次のステップ（未完了）

### 🔲 ステップ6: フロントエンドをNetlifyにデプロイ
1. Netlifyアカウントの準備
2. GitHubリポジトリからデプロイ
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `dist`
3. 環境変数の設定
   - `VITE_API_URL`: `https://mieru-ai-production.up.railway.app/api`
4. Netlifyのドメインを確認

### 🔲 ステップ7: RailwayのCORS設定を更新
Netlifyのデプロイが完了したら：
1. Railwayの「mieru-ai」サービス → 「Settings」→「Variables」タブを開く
2. 以下の環境変数を追加/更新：
   - **CORS_ORIGINS**: `https://your-netlify-domain.netlify.app`
   - **FRONTEND_URL**: `https://your-netlify-domain.netlify.app`

---

## 現在の状態

### バックエンド（Railway）
- ✅ デプロイ完了
- ✅ データベース接続完了
- ✅ API動作確認完了
- URL: `https://mieru-ai-production.up.railway.app`

### フロントエンド（Netlify）
- 🔲 未デプロイ
- 🔲 環境変数未設定

### データベース（Railway PostgreSQL）
- ✅ 作成完了
- ✅ 接続確認完了

---

## 重要な情報

### RailwayサービスURL
- バックエンド: `https://mieru-ai-production.up.railway.app`
- APIドキュメント: `https://mieru-ai-production.up.railway.app/docs`

### 環境変数（Railway mieru-aiサービス）
- `DATABASE_URL`: 設定済み
- `SECRET_KEY`: `lqB1SWftsEatV3nMI5Vc-OEy8P0iYhlmKYVbJNCHeQM`
- `ENVIRONMENT`: `production`
- `DEBUG`: `False`

---

## 参考ドキュメント
- `NETLIFY_DEPLOYMENT.md` - Netlifyデプロイ手順
- `N8N_RAILWAY_SETUP.md` - n8nセットアップ手順（META API連携用）
- `N8N_ENVIRONMENT_VARIABLES.md` - n8n環境変数設定

