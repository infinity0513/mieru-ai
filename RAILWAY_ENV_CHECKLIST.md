# Railway環境変数設定チェックリスト

## エラー内容
```
Meta OAuthが設定されていません。バックエンドの環境変数にMETA_APP_IDを設定してください。
```

このエラーは、Railwayのバックエンドで`META_APP_ID`環境変数が設定されていないか、正しく読み込まれていないことを示しています。

## 確認手順

### 1. Railwayダッシュボードで環境変数を確認

1. https://railway.app/ にアクセス
2. プロジェクトを選択
3. バックエンドサービス（mieru-ai-production）を選択
4. 「Variables」タブを開く
5. 以下の環境変数が**すべて**設定されているか確認：

#### 必須の環境変数

✅ **META_APP_ID**
- 値: `854731910864400`
- 設定されているか: [ ]
- 値が正しいか: [ ]

✅ **META_APP_SECRET**
- 値: （Meta for Developersで取得したApp Secret）
- 設定されているか: [ ]
- 値が正しいか: [ ]

✅ **META_OAUTH_REDIRECT_URI**
- 値: `https://mieru-ai-production.up.railway.app/api/meta/oauth/callback`
- 設定されているか: [ ]
- 値が正しいか: [ ]

✅ **FRONTEND_URL**
- 値: `https://mieru.netlify.app`
- 設定されているか: [ ]
- 値が正しいか: [ ]

✅ **CORS_ORIGINS**
- 値: `https://mieru.netlify.app,http://localhost:3000,http://localhost:5173`
- 設定されているか: [ ]
- 値が正しいか: [ ]

### 2. 環境変数名の確認

**重要**: 環境変数名は**完全一致**する必要があります。

❌ 間違った名前:
- `META_REDIRECT_URI`（間違い）
- `META_APPID`（間違い）
- `METAAPP_ID`（間違い）

✅ 正しい名前:
- `META_APP_ID`
- `META_APP_SECRET`
- `META_OAUTH_REDIRECT_URI`
- `FRONTEND_URL`
- `CORS_ORIGINS`

### 3. 環境変数の値に余分なスペースがないか確認

環境変数の値の前後にスペースや改行がないか確認してください。

❌ 間違った値:
```
 854731910864400 （先頭にスペース）
854731910864400  （末尾にスペース）
```

✅ 正しい値:
```
854731910864400
```

### 4. サービスを再デプロイ

環境変数を追加・修正した後、**必ずサービスを再デプロイ**してください：

1. Railwayダッシュボードでバックエンドサービスを選択
2. 「Deployments」タブを開く
3. 最新のデプロイメントの右側にある「...」メニューをクリック
4. 「Redeploy」を選択

または、環境変数を追加すると自動的に再デプロイが開始される場合もあります。

### 5. デプロイログを確認

再デプロイ後、ログを確認してエラーがないか確認：

1. Railwayダッシュボードでバックエンドサービスを選択
2. 「Deployments」タブを開く
3. 最新のデプロイメントをクリック
4. 「View Logs」をクリック
5. エラーメッセージがないか確認

## トラブルシューティング

### エラーが続く場合

1. **環境変数が正しく設定されているか再確認**
   - Railwayの「Variables」タブで、すべての環境変数が表示されているか確認
   - 環境変数名が完全一致しているか確認
   - 値に余分なスペースがないか確認

2. **サービスを再デプロイ**
   - 環境変数を追加・修正した後、必ず再デプロイ

3. **Railwayのログを確認**
   - デプロイログでエラーメッセージを確認
   - アプリケーションログでエラーメッセージを確認

4. **環境変数の読み込みを確認**
   - バックエンドのコードで環境変数が正しく読み込まれているか確認
   - `settings.META_APP_ID`が`None`でないか確認

## 正しい環境変数設定例

Railwayの「Variables」タブで、以下のように表示されることを確認：

```
META_APP_ID = 854731910864400
META_APP_SECRET = a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
META_OAUTH_REDIRECT_URI = https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
FRONTEND_URL = https://mieru.netlify.app
CORS_ORIGINS = https://mieru.netlify.app,http://localhost:3000,http://localhost:5173
```

## 確認チェックリスト

- [ ] `META_APP_ID`が設定されている
- [ ] `META_APP_ID`の値が`854731910864400`である
- [ ] `META_APP_SECRET`が設定されている
- [ ] `META_APP_SECRET`の値が正しい（Meta for Developersで取得した値）
- [ ] `META_OAUTH_REDIRECT_URI`が設定されている
- [ ] `META_OAUTH_REDIRECT_URI`の値が`https://mieru-ai-production.up.railway.app/api/meta/oauth/callback`である
- [ ] `FRONTEND_URL`が設定されている
- [ ] `FRONTEND_URL`の値が`https://mieru.netlify.app`である
- [ ] `CORS_ORIGINS`が設定されている
- [ ] 環境変数名に余分なスペースがない
- [ ] 環境変数の値に余分なスペースがない
- [ ] サービスを再デプロイした
- [ ] デプロイログでエラーがないことを確認した
- [ ] 本番環境でエラーが解消された

