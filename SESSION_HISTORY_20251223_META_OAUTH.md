# セッション履歴: Meta OAuth認証フロー実装

**日付**: 2024年12月23日  
**主な作業**: Meta OAuth認証フローの実装と本番環境デプロイ

---

## 実装内容

### 1. バックエンド実装

#### 環境変数の追加（`backend/app/config.py`）
```python
# Meta OAuth
META_APP_ID: Optional[str] = None
META_APP_SECRET: Optional[str] = None
META_OAUTH_REDIRECT_URI: Optional[str] = None
```

#### OAuth認証エンドポイントの実装（`backend/app/routers/meta_api.py`）

**GET /api/meta/oauth/authorize-url**
- Meta OAuth認証URLを取得（JSON形式で返す）
- 認証済みユーザーのみアクセス可能
- CSRF対策のためステートパラメータを生成

**GET /api/meta/oauth/callback**
- Meta OAuthコールバック処理
- 認証コードをアクセストークンに交換
- 長期トークン（60日有効）に変換
- 広告アカウントIDを自動取得
- ユーザーのMetaアカウント設定を自動保存
- フロントエンドにリダイレクト（成功メッセージ付き）

### 2. フロントエンド実装

#### APIサービスの追加（`frontend/src/services/api.ts`）

**startMetaOAuth()メソッド**
- バックエンドからOAuth認証URLを取得
- Metaの認証ページにリダイレクト

**request()メソッドの追加**
- 共通のリクエスト処理メソッド
- 認証ヘッダーの自動付与
- 401エラーの統一処理
- `/api/`の重複を自動的に削除

#### Settingsコンポーネントの更新（`frontend/src/components/Settings.tsx`）

**OAuth認証ボタンの追加**
- 「簡単に連携する（推奨）」セクション
- 「Metaでログインして連携」ボタン
- 手動入力との区切り線（「または」）

**OAuthコールバック処理**
- URLパラメータから認証結果を取得
- 成功時にアカウントIDを自動設定
- 成功メッセージを表示

### 3. バグ修正

#### URL重複問題の修正
- `/api/api/`の重複を解消
- `getNotifications`のURL修正: `/api/notifications` → `/notifications`
- `request`メソッドで`/api/`の重複を自動削除

#### エラーハンドリングの改善
- `verifyLoginCode`に詳細なログを追加
- ネットワークエラーの検出と適切なエラーメッセージ
- `organization`プロパティの追加

---

## 環境変数設定

### Netlify環境変数

**VITE_API_URL**
```
https://mieru-ai-production.up.railway.app/api
```

### Railway環境変数

**META_APP_ID**
```
854731910864400
```

**META_APP_SECRET**
```
（Meta for Developersで取得したApp Secret）
```

**META_OAUTH_REDIRECT_URI**
```
https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
```

**FRONTEND_URL**
```
https://mieru.netlify.app
```

**CORS_ORIGINS**
```
https://mieru.netlify.app,http://localhost:3000,http://localhost:5173
```

---

## Meta for Developers設定

### アプリ情報
- **App ID**: 854731910864400
- **App Name**: MIERU AI

### 必要な設定

1. **Facebook Loginの追加**
   - 左メニュー「製品」→「Facebook Login」→「セットアップ」

2. **有効なOAuthリダイレクトURI**
   ```
   https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
   ```

3. **必要な権限**
   - `ads_read` - 広告データの読み取り
   - `ads_management` - 広告の管理

---

## 発生したエラーと解決方法

### エラー1: 画面が真っ白
**原因**: `request`メソッドが未実装  
**解決**: `api.ts`に`request`メソッドを追加

### エラー2: `/api/api/`の重複
**原因**: `baseURL`に既に`/api`が含まれているのに、エンドポイントも`/api/`で始まっていた  
**解決**: `request`メソッドで`/api/`の重複を自動削除する処理を追加

### エラー3: 500エラー（Meta OAuthが設定されていません）
**原因**: Railwayの環境変数`META_APP_ID`が設定されていない  
**解決**: Railwayで環境変数を設定して再デプロイ

### エラー4: 環境変数名の間違い
**原因**: `META_REDIRECT_URI`という間違った名前で設定されていた  
**解決**: 正しい名前`META_OAUTH_REDIRECT_URI`に修正

---

## ファイル変更履歴

### バックエンド
- `backend/app/config.py` - Meta OAuth環境変数を追加
- `backend/app/routers/meta_api.py` - OAuth認証エンドポイントを実装
- `backend/app/routers/auth.py` - 重複メール送信防止の修正

### フロントエンド
- `frontend/src/services/api.ts` - `request`メソッドと`startMetaOAuth`メソッドを追加
- `frontend/src/components/Settings.tsx` - OAuth認証ボタンとコールバック処理を追加
- `frontend/src/components/Auth.tsx` - エラーハンドリングの改善

### ドキュメント
- `META_OAUTH_SETUP_GUIDE.md` - Meta OAuth設定ガイド（実践版）
- `NETLIFY_DEPLOYMENT_META_OAUTH.md` - Netlify本番環境設定ガイド
- `RAILWAY_ENV_VARIABLES_SETUP.md` - Railway環境変数設定ガイド
- `RAILWAY_ENV_CHECKLIST.md` - Railway環境変数チェックリスト

---

## Gitコミット

**コミットメッセージ**: "Add Meta OAuth authentication button and setup guide"

**変更ファイル数**: 29ファイル  
**追加行数**: 4214行  
**削除行数**: 66行

---

## 現在の状況

### 完了した作業
- [x] OAuth認証フローの実装（バックエンド・フロントエンド）
- [x] 環境変数の設定（Netlify）
- [x] Gitへのプッシュ
- [x] Netlifyへのデプロイ

### 進行中の作業
- [ ] Railway環境変数の設定確認
- [ ] 本番環境での動作確認

### 次のステップ
1. Railwayで環境変数を確認・設定
2. サービスを再デプロイ
3. 本番環境でMeta OAuth認証をテスト
4. Meta for Developersの設定確認

---

## 重要な注意事項

### 環境変数名
- ❌ `META_REDIRECT_URI`（間違い）
- ✅ `META_OAUTH_REDIRECT_URI`（正しい）

### OAuth Redirect URI
- Meta for Developersには**バックエンドのコールバックURL**を設定
- Railwayの`META_OAUTH_REDIRECT_URI`も**バックエンドのコールバックURL**を設定
- フロントエンドのURL（`https://mieru.netlify.app/settings?meta_oauth=callback`）は設定しない

### デプロイ
- 環境変数を追加・修正した後、**必ずサービスを再デプロイ**
- NetlifyとRailwayの両方で再デプロイが必要

---

## 参考リンク

- **Meta for Developers**: https://developers.facebook.com/apps/854731910864400
- **Netlifyダッシュボード**: https://app.netlify.com/
- **Railwayダッシュボード**: https://railway.app/
- **本番環境URL**: https://mieru.netlify.app
- **バックエンドURL**: https://mieru-ai-production.up.railway.app

---

## トラブルシューティング

### エラー: "Meta OAuthが設定されていません"
1. Railwayの「Variables」タブで`META_APP_ID`が設定されているか確認
2. 環境変数名が完全一致しているか確認（`META_APP_ID`）
3. 値に余分なスペースがないか確認
4. サービスを再デプロイ

### エラー: 500 Internal Server Error
1. Railwayのログを確認
2. すべての環境変数が設定されているか確認
3. 環境変数名が正しいか確認
4. サービスを再デプロイ

### ボタンが表示されない
1. Netlifyで`VITE_API_URL`が設定されているか確認
2. サイトを再デプロイ
3. ブラウザのキャッシュをクリア（Cmd+Shift+R）

---

**作成日時**: 2024年12月23日  
**最終更新**: 2024年12月23日

