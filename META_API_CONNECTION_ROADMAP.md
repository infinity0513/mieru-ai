# META API接続までの工程マップ

## 現在の進捗状況

### ✅ 完了（バックエンド基盤）
1. Railwayでバックエンドをデプロイ ✅
2. PostgreSQLデータベースをセットアップ ✅
3. バックエンドAPIが正常に動作 ✅

### 🔲 残りの工程

---

## META API接続までの工程（残り約5-7ステップ）

### 工程1: フロントエンドのデプロイ（約30分）
**目的**: ユーザーがシステムにアクセスできるようにする

**作業内容**:
1. Netlifyでフロントエンドをデプロイ
2. 環境変数 `VITE_API_URL` を設定
3. Railwayの `CORS_ORIGINS` と `FRONTEND_URL` を設定

**所要時間**: 約30分

---

### 工程2: n8nのセットアップ（約1時間）
**目的**: META APIからデータを取得するためのワークフローエンジンを準備

**作業内容**:
1. Railwayでn8nサービスを追加
2. n8nの環境変数を設定
3. n8nにアクセスして動作確認

**所要時間**: 約1時間

**参考ドキュメント**: `N8N_RAILWAY_SETUP.md`

---

### 工程3: Meta for Developersでアプリを作成（約30分）
**目的**: META APIにアクセスするための認証情報を取得

**作業内容**:
1. [Meta for Developers](https://developers.facebook.com/)にアクセス
2. アプリを作成（または既存アプリを使用）
3. 「Marketing API」を有効化
4. 認証情報を取得：
   - App ID
   - App Secret
   - Access Token（長期トークン推奨）
   - 広告アカウントID

**所要時間**: 約30分

**必要なもの**:
- Meta（Facebook）アカウント
- 広告アカウントへのアクセス権限

---

### 工程4: n8nでMeta API接続を設定（約30分）
**目的**: n8nからMETA APIに接続できるようにする

**作業内容**:
1. n8nダッシュボードにアクセス
2. 「Meta」ノードを追加
3. 認証情報を設定：
   - App ID
   - App Secret
   - Access Token
4. 接続テストを実行

**所要時間**: 約30分

**参考ドキュメント**: `N8N_RAILWAY_SETUP.md` の「2. n8nでMeta API連携ワークフローを作成」

---

### 工程5: n8nでデータ取得ワークフローを作成（約1-2時間）
**目的**: META APIからデータを取得して本システムに送信するワークフローを作成

**作業内容**:
1. **Schedule Trigger**ノードを追加（毎日9時に実行）
2. **Meta**ノードを追加（キャンペーンデータを取得）
3. **Code**ノードを追加（データを変換）
4. **Code**ノードを追加（CSV形式に変換）
5. **HTTP Request**ノードを追加（本システムAPIに送信）
6. ワークフローをテスト実行

**所要時間**: 約1-2時間（初回は時間がかかる）

**参考ドキュメント**: 
- `N8N_WORKFLOW_CREATION_GUIDE.md`
- `N8N_RAILWAY_SETUP.md` の「2.2 データ取得ワークフローの作成」

---

### 工程6: 本システムAPIとの連携設定（約30分）
**目的**: n8nから本システムのAPIにデータを送信できるようにする

**作業内容**:
1. 本システムにログインしてJWTトークンを取得
2. n8nの環境変数に `JWT_TOKEN` を設定
3. n8nの環境変数に `BACKEND_API_URL` を設定
4. HTTP RequestノードでAPI接続をテスト

**所要時間**: 約30分

**参考ドキュメント**: `N8N_ENVIRONMENT_VARIABLES.md` の「本システムAPI設定」

---

### 工程7: テスト実行と動作確認（約30分）
**目的**: 全体の動作を確認して問題がないかチェック

**作業内容**:
1. n8nワークフローを手動実行
2. META APIからデータが取得できるか確認
3. 本システムAPIにデータが送信されるか確認
4. フロントエンドでデータが表示されるか確認
5. スケジュール実行が正常に動作するか確認

**所要時間**: 約30分

---

## 合計所要時間の見積もり

| 工程 | 所要時間 |
|------|----------|
| 工程1: フロントエンドデプロイ | 30分 |
| 工程2: n8nセットアップ | 1時間 |
| 工程3: Metaアプリ作成 | 30分 |
| 工程4: Meta API接続設定 | 30分 |
| 工程5: ワークフロー作成 | 1-2時間 |
| 工程6: API連携設定 | 30分 |
| 工程7: テスト実行 | 30分 |
| **合計** | **約4.5-5.5時間** |

---

## 重要な前提条件

### 必要なアカウント
- ✅ Railwayアカウント（既に作成済み）
- 🔲 Netlifyアカウント（フロントエンドデプロイ用）
- 🔲 Meta（Facebook）アカウント（META API接続用）
- 🔲 Meta広告アカウント（データ取得用）

### 必要な情報
- ✅ バックエンドURL: `https://mieru-ai-production.up.railway.app`
- 🔲 フロントエンドURL（Netlifyデプロイ後に取得）
- 🔲 Meta App ID（Meta for Developersで取得）
- 🔲 Meta App Secret（Meta for Developersで取得）
- 🔲 Meta Access Token（Meta for Developersで取得）
- 🔲 広告アカウントID（Meta広告マネージャーで確認）

---

## 次のセッションでやること

1. **フロントエンドをNetlifyにデプロイ**
   - Netlifyアカウントを作成
   - GitHubリポジトリからデプロイ
   - 環境変数を設定

2. **RailwayのCORS設定を更新**
   - Netlifyのドメインを取得
   - Railwayの環境変数を更新

3. **動作確認**
   - フロントエンドからバックエンドAPIに接続できるか確認

---

## 参考ドキュメント一覧

- `RAILWAY_DEPLOYMENT_PROGRESS.md` - 現在の進捗状況
- `NETLIFY_DEPLOYMENT.md` - Netlifyデプロイ手順
- `N8N_RAILWAY_SETUP.md` - n8nセットアップ手順
- `N8N_ENVIRONMENT_VARIABLES.md` - n8n環境変数設定
- `N8N_WORKFLOW_CREATION_GUIDE.md` - ワークフロー作成ガイド
- `META_ACCOUNT_ID_GUIDE.md` - 広告アカウントIDの取得方法

