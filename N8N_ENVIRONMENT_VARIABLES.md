# n8n環境変数設定ガイド

## Railwayでの環境変数設定

Railwayダッシュボードで以下の環境変数を設定してください。

### n8n基本設定

```bash
# n8nのホスト設定
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=https

# Webhook URL（Railwayが自動生成したドメイン）
WEBHOOK_URL=https://your-n8n-domain.railway.app/

# 認証設定（本番環境では必須）
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-secure-password-here

# CDNの使用を無効化（unpkg.comがブロックされている場合）
# 注意: この設定により、一部の機能が制限される可能性があります
N8N_DISABLE_PRODUCTION_MAIN_PROCESS=true
```

### データベース設定（オプション）

#### SQLite（デフォルト・小規模利用向け）
```bash
# 追加設定不要
```

#### PostgreSQL（推奨・大規模利用向け）
```bash
# RailwayのPostgreSQLサービスを追加後、以下の環境変数を設定
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=containers-us-west-xxx.railway.app
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=railway
DB_POSTGRESDB_USER=postgres
DB_POSTGRESDB_PASSWORD=your-postgres-password
```

### Meta API設定

```bash
# Metaアプリの認証情報
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret
META_ACCOUNT_ID=your-meta-account-id
META_ACCESS_TOKEN=your-meta-access-token
```

### 本システムAPI設定

```bash
# バックエンドAPIのURL
BACKEND_API_URL=https://your-backend-domain.railway.app

# JWTトークン（ユーザーのログイントークン）
# 注意: トークンは定期的に更新が必要（30分で期限切れの可能性）
JWT_TOKEN=your-jwt-token-here
```

### メール通知設定（オプション）

```bash
# エラー通知用のメール設定
N8N_EMAIL_MODE=smtp
N8N_SMTP_HOST=smtp.resend.com
N8N_SMTP_PORT=587
N8N_SMTP_USER=resend
N8N_SMTP_PASS=your-resend-api-key
N8N_SMTP_SENDER=notifications@yourdomain.com
```

---

## 環境変数の取得方法

### Meta API認証情報

1. [Meta for Developers](https://developers.facebook.com/)にアクセス
2. アプリを作成（または既存アプリを使用）
3. 「Settings」→「Basic」で以下を確認：
   - **App ID**: アプリID
   - **App Secret**: アプリシークレット（「Show」をクリック）
4. 「Tools」→「Graph API Explorer」で以下を取得：
   - **Access Token**: アクセストークン
   - **User Token**: ユーザートークン（長期トークンに変換推奨）

### 長期トークンの取得

短期トークン（1-2時間有効）を長期トークン（60日有効）に変換：

```bash
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_LIVED_TOKEN}"
```

### JWTトークンの取得

#### 方法1: ブラウザの開発者ツールから取得
1. 本システムにログイン
2. ブラウザの開発者ツール（F12）を開く
3. 「Application」→「Local Storage」でトークンを確認
4. または「Network」タブでAPIリクエストのヘッダーを確認

#### 方法2: n8nで自動ログイン
n8nワークフロー内でログインAPIを呼び出してトークンを取得：

```javascript
// HTTP Requestノード
Method: POST
URL: https://your-backend-domain.railway.app/api/auth/login
Body (JSON):
{
  "email": "user@example.com",
  "password": "user-password"
}

// レスポンスからトークンを取得して環境変数に保存
const token = $json.access_token;
```

---

## セキュリティベストプラクティス

### 1. 環境変数の保護
- **本番環境では環境変数を暗号化**
- **GitHubにコミットしない**（`.env`ファイルは`.gitignore`に追加）
- **定期的にトークンを更新**

### 2. パスワードの強度
- **n8nの認証パスワード**: 最低12文字、大文字・小文字・数字・記号を含む
- **定期的にパスワードを変更**

### 3. トークンの管理
- **JWTトークン**: 30分で期限切れの可能性があるため、自動更新を実装
- **Meta APIトークン**: 60日で期限切れのため、定期的に更新
- **トークンは環境変数に保存し、コードに直接書かない**

### 4. アクセス制御
- **n8nの認証を必ず有効化**
- **IP制限を設定**（可能であれば）
- **HTTPSを使用**（Railwayは自動でHTTPSを提供）

---

## 環境変数の確認方法

### Railwayダッシュボードで確認
1. Railwayダッシュボードにアクセス
2. プロジェクトを選択
3. n8nサービスを選択
4. 「Variables」タブで環境変数を確認・編集

### n8nワークフロー内で確認
```javascript
// Codeノードで環境変数を確認
const backendUrl = $env.BACKEND_API_URL;
const jwtToken = $env.JWT_TOKEN;

console.log('Backend URL:', backendUrl);
// 注意: トークンはログに出力しない（セキュリティリスク）
```

---

## トラブルシューティング

### 環境変数が読み込まれない
- Railwayで環境変数が正しく設定されているか確認
- サービスを再起動
- 環境変数名にタイポがないか確認

### トークンが無効
- トークンの有効期限を確認
- 新しいトークンを取得して更新
- トークンの形式が正しいか確認（Bearerトークンの場合、`Bearer `プレフィックスが必要）

### Meta API接続エラー
- App IDとApp Secretが正しいか確認
- アクセストークンが有効か確認
- Metaアプリの権限設定を確認

---

## 環境変数テンプレート

新しいRailwayプロジェクトを作成する際は、以下のテンプレートをコピーして使用してください：

```bash
# ============================================
# n8n基本設定
# ============================================
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=https
WEBHOOK_URL=https://your-n8n-domain.railway.app/

# ============================================
# 認証設定（本番環境では必須）
# ============================================
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=CHANGE_THIS_PASSWORD

# ============================================
# Meta API設定
# ============================================
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret
META_ACCOUNT_ID=your-meta-account-id
META_ACCESS_TOKEN=your-meta-access-token

# ============================================
# 本システムAPI設定
# ============================================
BACKEND_API_URL=https://your-backend-domain.railway.app
JWT_TOKEN=your-jwt-token-here
```

