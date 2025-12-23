# Meta Insights API動作確認ガイド

## 📋 動作確認の方法

実装したページネーション処理とプラン別制限の動作確認は、以下の方法で行えます。

---

## 方法1: バックエンドAPIの直接テスト（推奨）

### 1.1 バックエンドサーバーの起動

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 1.2 ログインしてトークンを取得

```bash
# ログイン
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

**レスポンス例**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 1.3 Meta Insights APIを呼び出す

```bash
# Meta Insightsを取得
curl -X GET "http://localhost:8000/api/meta/insights?since=2025-01-01&until=2025-01-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**レスポンス例**:
```json
{
  "data": [...],
  "account_id": "act_123456789",
  "since": "2025-01-01",
  "until": "2025-01-31",
  "adset_count": 100,
  "max_limit": 100,
  "warning": "プラン制限により、100件まで取得しました。全てのデータを取得するにはPROプランへのアップグレードが必要です。"
}
```

### 1.4 確認ポイント

#### FREE/STANDARDプランの場合
- ✅ `adset_count`が100以下であること
- ✅ `max_limit`が100であること
- ✅ `warning`メッセージが表示されること（100件に達した場合）

#### PROプランの場合
- ✅ `adset_count`が実際の広告セット数と一致すること
- ✅ `max_limit`が`null`であること
- ✅ `warning`が`null`であること

---

## 方法2: n8nワークフローからのテスト

### 2.1 n8nワークフローの設定

1. n8nダッシュボードにアクセス
2. ワークフローを開く
3. 「HTTP Request（Meta Insights取得）」ノードを確認

**設定内容**:
- **Method**: `GET`
- **URL**: `https://mieru-ai-production.up.railway.app/api/meta/insights`
- **Authentication**: `Generic Credential Type`
- **Generic Auth Type**: `Header Auth`
- **Name**: `Authorization`
- **Value**: `Bearer {{ $('HTTP Request1').item.json.access_token }}`
- **Query Parameters**:
  - `since`: `{{ $now.minus({days: 1}).toFormat('yyyy-MM-dd') }}`
  - `until`: `{{ $now.toFormat('yyyy-MM-dd') }}`

### 2.2 ワークフローを手動実行

1. ワークフローを保存
2. 「Execute Workflow」をクリック
3. 各ノードの出力を確認

### 2.3 確認ポイント

#### HTTP Request（Meta Insights取得）ノードの出力
- ✅ `data`配列が存在すること
- ✅ `adset_count`が表示されること
- ✅ `max_limit`が表示されること
- ✅ `warning`が表示されること（制限に達した場合）

#### Code in JavaScript（データ変換）ノード
- ✅ `data`配列が正しく処理されること
- ✅ データ変換が正常に完了すること

---

## 方法3: フロントエンドからのテスト（開発用）

### 3.1 ブラウザの開発者ツールを使用

1. フロントエンドアプリケーションを起動
2. ブラウザの開発者ツール（F12）を開く
3. 「Network」タブを開く
4. 設定画面でMetaアカウント情報を保存
5. 必要に応じて、フロントエンドからAPIを呼び出す

### 3.2 コンソールから直接APIを呼び出す

```javascript
// ブラウザのコンソールで実行
const token = localStorage.getItem('token');
const response = await fetch('http://localhost:8000/api/meta/insights?since=2025-01-01&until=2025-01-31', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const data = await response.json();
console.log(data);
```

---

## 方法4: Postmanを使用したテスト

### 4.1 Postmanの設定

1. **新しいリクエストを作成**
   - Method: `GET`
   - URL: `http://localhost:8000/api/meta/insights?since=2025-01-01&until=2025-01-31`

2. **認証ヘッダーを設定**
   - Headersタブ
   - Key: `Authorization`
   - Value: `Bearer YOUR_ACCESS_TOKEN`

3. **リクエストを送信**

### 4.2 レスポンスの確認

- Status: `200 OK`
- Body: JSON形式のレスポンス
- `adset_count`, `max_limit`, `warning`を確認

---

## 🔍 詳細な確認項目

### プラン別の動作確認

#### 1. FREEプランのユーザーでテスト

**期待される動作**:
- 広告セットを100件まで取得
- 100件に達したら停止
- 警告メッセージを返す

**確認コマンド**:
```bash
# ユーザーのプランを確認
curl -X GET "http://localhost:8000/api/users/me" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Meta Insightsを取得
curl -X GET "http://localhost:8000/api/meta/insights" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 2. STANDARDプランのユーザーでテスト

**期待される動作**:
- FREEプランと同じ（100件まで）

#### 3. PROプランのユーザーでテスト

**期待される動作**:
- 全ての広告セットを取得（ページネーション処理）
- 警告メッセージなし

**ユーザーのプランを変更**:
```sql
-- データベースで直接変更（開発環境のみ）
UPDATE users SET plan = 'PRO' WHERE email = 'your-email@example.com';
```

---

## 🐛 トラブルシューティング

### エラー1: "Metaアカウント情報が設定されていません"

**原因**: ユーザーのMetaアカウント情報が設定されていない

**解決方法**:
1. 設定画面でMetaアカウントIDとアクセストークンを設定
2. または、データベースで直接設定（開発環境のみ）

### エラー2: "Meta APIエラー"

**原因**: Meta APIの呼び出しに失敗

**確認事項**:
- MetaアカウントIDが正しいか（`act_`で始まる）
- アクセストークンが有効か
- Meta APIのレート制限に達していないか

### エラー3: ページネーションが動作しない

**原因**: Meta APIの`paging.next`が正しく処理されていない

**確認事項**:
- Meta APIのレスポンスに`paging`が含まれているか
- `next_url`が正しく設定されているか

---

## 📊 テストデータの準備

### テスト用のMetaアカウント情報

開発環境でテストする場合、以下の情報が必要です：

1. **Meta広告アカウントID**: `act_123456789`（形式）
2. **Metaアクセストークン**: 有効なアクセストークン

### テスト用ユーザーの作成

```sql
-- テスト用ユーザーを作成（開発環境のみ）
INSERT INTO users (email, name, password_hash, plan, meta_account_id, meta_access_token)
VALUES (
  'test@example.com',
  'Test User',
  'hashed_password',
  'FREE',  -- または 'STANDARD', 'PRO'
  'act_123456789',
  'your-access-token'
);
```

---

## ✅ 動作確認チェックリスト

### 基本動作
- [ ] バックエンドサーバーが起動している
- [ ] ログインが成功する
- [ ] Metaアカウント情報が設定されている
- [ ] APIエンドポイントが正常に応答する

### プラン別制限
- [ ] FREEプランで100件まで取得される
- [ ] STANDARDプランで100件まで取得される
- [ ] PROプランで全ての広告セットが取得される

### ページネーション処理
- [ ] 100件を超える広告セットがある場合、PROプランで全て取得される
- [ ] ページネーションが正しく動作する

### 警告メッセージ
- [ ] FREE/STANDARDプランで100件に達した場合、警告メッセージが表示される
- [ ] PROプランでは警告メッセージが表示されない

---

## 📝 ログの確認

### バックエンドのログ

```bash
# バックエンドサーバーのログを確認
# ターミナルに以下のようなログが表示されます：

[INFO] GET /api/meta/insights
[INFO] User plan: FREE
[INFO] Max limit: 100
[INFO] Adsets fetched: 100
[INFO] Warning: プラン制限により、100件まで取得しました。
```

### n8nワークフローのログ

1. n8nダッシュボードでワークフローを開く
2. 各ノードの「Execution Data」を確認
3. エラーメッセージがないか確認

---

## 🎯 推奨テストフロー

1. **基本動作確認**
   - バックエンドAPIの直接テスト（方法1）

2. **プラン別制限の確認**
   - FREE/STANDARD/PROプランでそれぞれテスト

3. **ページネーション処理の確認**
   - PROプランで100件を超える広告セットがある場合にテスト

4. **n8nワークフローでの確認**
   - 実際の運用環境での動作確認

---

## 📚 参考資料

- `backend/app/routers/meta_api.py` - Meta Insights APIエンドポイント
- `backend/app/utils/plan_limits.py` - プラン別制限の定義
- `N8N_WORKFLOW_UPDATE_GUIDE.md` - n8nワークフロー更新手順
- `PLAN_BASED_DATA_LIMIT_IMPLEMENTATION.md` - 実装の詳細

