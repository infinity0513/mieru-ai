# API動作確認結果

## 📅 確認日時
2025年1月（デプロイ後）

## ✅ 確認結果

### 1. 基本エンドポイントの確認

#### `/health` エンドポイント
```bash
curl -X GET "https://mieru-ai-production.up.railway.app/health"
```

**結果**: ✅ 正常に応答
```json
{"status":"ok"}
```

#### `/` エンドポイント
```bash
curl -X GET "https://mieru-ai-production.up.railway.app/"
```

**結果**: ✅ 正常に応答
```json
{"message":"Meta Ad Analyzer AI API"}
```

### 2. Meta Insights APIエンドポイントの確認

#### `/api/meta/insights` エンドポイント
```bash
curl -X GET "https://mieru-ai-production.up.railway.app/api/meta/insights" \
  -H "Authorization: Bearer invalid_token"
```

**結果**: ✅ エンドポイントは存在し、認証エラーを返す（正常な動作）
```json
{"detail":"Could not validate credentials"}
```

**確認事項**:
- ✅ エンドポイントが存在する
- ✅ 認証が必要であることを確認
- ✅ 認証エラーハンドリングが正常に動作

---

## 📋 次の確認ステップ

### ステップ1: ログインAPIのテスト

**必要な情報**:
- メールアドレス
- パスワード

**確認コマンド**:
```bash
curl -X POST "https://mieru-ai-production.up.railway.app/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

**期待される結果**:
- ✅ ステータスコード: `200 OK`
- ✅ `access_token`が返ってくる

---

### ステップ2: Meta Insights APIのテスト

**前提条件**:
- ログインが成功している
- Metaアカウント情報が設定されている

**確認コマンド**:
```bash
curl -X GET "https://mieru-ai-production.up.railway.app/api/meta/insights?since=2025-01-01&until=2025-01-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**期待される結果**:
- ✅ ステータスコード: `200 OK`
- ✅ `data`配列が存在する
- ✅ `adset_count`が表示される
- ✅ `max_limit`が表示される（プランに応じて）
- ✅ `warning`が表示される（制限に達した場合）

---

### ステップ3: プラン別制限の確認

#### FREE/STANDARDプランの場合
- ✅ `adset_count`が100以下であること
- ✅ `max_limit`が100であること
- ✅ `warning`メッセージが表示されること（100件に達した場合）

#### PROプランの場合
- ✅ `adset_count`が実際の広告セット数と一致すること
- ✅ `max_limit`が`null`であること
- ✅ `warning`が`null`であること

---

## 🎯 現在の状況

### ✅ 完了している項目
- デプロイが完了している
- 基本エンドポイントが正常に応答している
- Meta Insights APIエンドポイントが存在する
- 認証エラーハンドリングが正常に動作している

### ⏳ 次のステップ
- ログインAPIのテスト（認証情報が必要）
- Meta Insights APIのテスト（Metaアカウント情報が必要）
- プラン別制限の動作確認

---

## 💡 推奨事項

### 今すぐ実施可能
1. **ログインAPIのテスト**
   - 既存のユーザーアカウントでログインをテスト
   - トークンが正しく返ってくるか確認

2. **Meta Insights APIのテスト**
   - ログイン後、Meta Insights APIを呼び出す
   - プラン別制限が正しく動作するか確認

### 後で実施
- n8nワークフローの更新
- スケジュール実行の確認

---

## 📝 注意事項

1. **認証情報の管理**
   - テスト用の認証情報を使用
   - 本番環境の認証情報は適切に管理

2. **Metaアカウント情報**
   - MetaアカウントIDとアクセストークンが設定されている必要がある
   - 設定画面で確認・設定可能

3. **エラーハンドリング**
   - エラーが発生した場合、エラーメッセージを確認
   - トラブルシューティングガイドを参照

---

## ✅ 動作確認チェックリスト

### 基本動作
- [x] デプロイが完了している
- [x] `/health`エンドポイントが正常に応答する
- [x] `/api/meta/insights`エンドポイントが存在する
- [ ] ログインAPIが正常に動作する
- [ ] Meta Insights APIが正常に動作する

### プラン別制限
- [ ] FREEプランで100件まで取得される
- [ ] STANDARDプランで100件まで取得される
- [ ] PROプランで全ての広告セットが取得される

### ページネーション処理
- [ ] PROプランで100件を超える広告セットがある場合、全て取得される
- [ ] ページネーションが正しく動作する

