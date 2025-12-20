# Meta Ad Analyzer AI - SaaS版

META広告（Facebook/Instagram）の運用データをAIで分析し、改善提案を行うWebアプリケーション。

## 機能

- ✅ ユーザー認証（登録・ログイン）
- ✅ CSV/Excelファイルアップロード
- ✅ リアルタイムダッシュボード
- ✅ AI分析・改善提案
- ✅ PDF/Excelレポート生成
- ✅ チーム機能
- ✅ 通知機能

## 技術スタック

### フロントエンド
- React 19 + TypeScript
- Vite
- Recharts
- Lucide Icons

### バックエンド
- FastAPI (Python 3.10+)
- PostgreSQL 15
- Redis 7
- SQLAlchemy
- OpenAI API

## セットアップ（開発環境）

### 必要なもの
- Docker & Docker Compose
- Node.js 18+
- Python 3.10+

### 1. リポジトリクローン
```bash
git clone <repository-url>
cd meta-ad-analyzer-ai-online
```

### 2. 環境変数設定
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

各ファイルを編集して、必要な値を設定してください。

### 3. Docker起動
```bash
docker-compose up -d
```

### 4. バックエンド起動
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 5. フロントエンド起動
```bash
cd frontend
npm install
npm run dev
```

アクセス:
- フロントエンド: http://localhost:5173
- バックエンドAPI: http://localhost:8000
- API Docs: http://localhost:8000/docs

## デプロイ（本番環境）

### 前提条件
- Docker & Docker Compose がインストールされていること
- ドメイン名が設定されていること（SSL証明書取得のため）
- サーバーに十分なリソース（CPU、メモリ、ストレージ）があること

### 1. 環境変数設定
```bash
# プロジェクトルートに.env.exampleをコピー
cp .env.example .env

# .envを編集して本番環境の値を設定
# 特に以下を必ず変更してください：
# - SECRET_KEY: 強力なランダム文字列（32文字以上）
# - POSTGRES_PASSWORD: 強力なパスワード
# - OPENAI_API_KEY: 実際のAPIキー
# - CORS_ORIGINS: 本番環境のドメイン
```

### 2. デプロイ実行
```bash
# デプロイスクリプトに実行権限を付与
chmod +x deploy.sh

# デプロイ実行
./deploy.sh
```

### 3. データベースマイグレーション
```bash
# 初回デプロイ時のみ実行
docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### 4. SSL証明書設定（推奨）
Let's Encryptを使用してSSL証明書を取得してください。

```bash
# Certbotを使用した例
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# SSL証明書を取得（Nginxを使用する場合）
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 自動更新の設定
sudo certbot renew --dry-run
```

### 5. 本番環境チェックリスト
- [ ] 環境変数が正しく設定されている
- [ ] SECRET_KEYが強力なランダム文字列である
- [ ] データベースバックアップが設定されている
- [ ] SSL証明書が設定されている
- [ ] ファイアウォール設定が適切である
- [ ] ログ監視が設定されている
- [ ] エラートラッキング（Sentry）が設定されている（オプション）
- [ ] 負荷テストを実施した
- [ ] セキュリティ監査を実施した

## 環境変数

詳細な環境変数の説明は `.env.example` を参照してください。

### バックエンド環境変数（主要なもの）
- `ENVIRONMENT`: 環境（development, staging, production）
- `DEBUG`: デバッグモード（True/False）
- `DATABASE_URL`: PostgreSQL接続URL
- `SECRET_KEY`: JWT署名用の秘密鍵（**本番環境では必ず変更**）
- `OPENAI_API_KEY`: OpenAI APIキー
- `CORS_ORIGINS`: CORS許可オリジン（カンマ区切り）
- `SENTRY_DSN`: Sentryエラートラッキング用DSN（オプション）

### フロントエンド環境変数
- `VITE_API_URL`: バックエンドAPIのURL

### 環境変数の設定方法
```bash
# 開発環境
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 本番環境（Docker Compose使用時）
cp .env.example .env
```

## セキュリティ

- JWT認証
- パスワードハッシュ化（bcrypt）
- レート制限
- CORS設定
- セキュリティヘッダー
- SQLインジェクション対策（SQLAlchemy ORM）

## パフォーマンス

- データベースインデックス
- クエリ最適化
- キャッシング（Redis）
- Gzip圧縮
- 静的ファイル最適化

## トラブルシューティング

### データベース接続エラー
```bash
# PostgreSQLが起動しているか確認
docker-compose -f docker-compose.prod.yml ps

# ログを確認
docker-compose -f docker-compose.prod.yml logs postgres

# データベースに接続して確認
docker-compose -f docker-compose.prod.yml exec postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}
```

### バックエンドが起動しない
```bash
# ログを確認
docker-compose -f docker-compose.prod.yml logs backend

# 環境変数を確認
docker-compose -f docker-compose.prod.yml exec backend env | grep -E "DATABASE_URL|SECRET_KEY|OPENAI_API_KEY"

# コンテナ内で直接確認
docker-compose -f docker-compose.prod.yml exec backend bash
```

### フロントエンドがAPIに接続できない
```bash
# バックエンドのヘルスチェック
curl http://localhost/health

# CORS設定を確認
# .envファイルのCORS_ORIGINSが正しく設定されているか確認

# ネットワーク設定を確認
docker-compose -f docker-compose.prod.yml network ls
```

### デプロイ後の確認
```bash
# すべてのサービスが起動しているか確認
docker-compose -f docker-compose.prod.yml ps

# ログを確認
docker-compose -f docker-compose.prod.yml logs -f

# リソース使用状況を確認
docker stats
```

### パフォーマンス問題
- データベースインデックスを確認
- クエリログを確認
- Redisキャッシュが動作しているか確認
- サーバーリソース（CPU、メモリ）を確認

## ライセンス
MIT

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`