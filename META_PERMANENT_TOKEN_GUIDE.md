# Meta API無期限トークン取得ガイド

## 📋 概要

Meta APIの無期限トークン（永続的なトークン）を取得する方法を説明します。
無期限トークンを使用することで、60日ごとの更新作業が不要になります。

---

## ⚠️ 重要な注意事項

### 無期限トークンの特徴
- **有効期限**: 無期限（ただし、手動で無効化するまで有効）
- **取得方法**: システムユーザートークン（System User Token）を使用
- **セキュリティ**: より高いセキュリティ管理が必要

### 推奨事項
- **本番環境**: 無期限トークンの使用を推奨
- **開発環境**: 長期トークン（60日）でも問題なし
- **セキュリティ**: トークンは適切に管理し、定期的に監視

---

## 🔧 無期限トークン取得手順

### ステップ1: Meta for Developersでアプリを作成

1. [Meta for Developers](https://developers.facebook.com/)にアクセス
2. 「My Apps」→「Create App」をクリック
3. アプリタイプを選択：
   - **Business** を選択（推奨）
   - または **Other** を選択
4. アプリ名を入力して「Create App」をクリック

---

### ステップ2: Marketing APIを有効化

1. アプリダッシュボードで「Add Products」をクリック
2. 「Marketing API」を検索して「Set Up」をクリック
3. Marketing APIが有効化されます

---

### ステップ3: システムユーザーを作成

1. アプリダッシュボードで「Business Settings」を開く
2. 左メニューから「System Users」を選択
3. 「Add」ボタンをクリック
4. システムユーザー名を入力（例: `MIERU AI System User`）
5. 「Create System User」をクリック

---

### ステップ4: システムユーザーに権限を付与

1. 作成したシステムユーザーを選択
2. 「Assign Assets」タブをクリック
3. 「Ad Accounts」セクションで「Assign Ad Account」をクリック
4. 広告アカウントを選択して「Assign」をクリック
5. 権限を選択：
   - **View Ads**（必須）
   - **Manage Ads**（データ取得に必要）
6. 「Save Changes」をクリック

---

### ステップ5: システムユーザートークンを生成

1. システムユーザーの「Generate New Token」ボタンをクリック
2. アプリを選択（作成したアプリ）
3. 権限（Permissions）を選択：
   - `ads_read`（必須）
   - `ads_management`（データ取得に必要）
4. 「Generate Token」をクリック
5. **トークンをコピーして保存**（この画面を閉じると再表示できません）

---

### ステップ6: 無期限トークンを取得

システムユーザートークンは既に無期限ですが、広告アカウントレベルで使用する場合は、以下の手順で広告アカウント用のトークンを取得します。

#### 方法1: Graph API Explorerを使用

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer/)にアクセス
2. 右上の「User or Page」でシステムユーザーを選択
3. 「Get Token」→「Get System User Token」をクリック
4. アプリと権限を選択
5. 以下のクエリを実行：

```
GET /{ad-account-id}?fields=access_token
```

**注意**: `{ad-account-id}`は`act_`を含む形式（例: `act_123456789`）

#### 方法2: APIを直接呼び出す

```bash
curl -X GET "https://graph.facebook.com/v18.0/act_{ACCOUNT_ID}?fields=access_token" \
  -H "Authorization: Bearer {SYSTEM_USER_TOKEN}"
```

**レスポンス例**:
```json
{
  "access_token": "EAABwzLix...",
  "id": "act_123456789"
}
```

---

## 🔐 より安全な方法: 広告アカウントアクセストークンの取得

### 推奨方法: 広告アカウントレベルのトークン

広告アカウントレベルのトークンを取得することで、より安全に管理できます。

#### 手順

1. **システムユーザートークンを取得**（上記のステップ5まで完了）

2. **広告アカウントのアクセストークンを取得**:

```bash
curl -X GET "https://graph.facebook.com/v18.0/act_{ACCOUNT_ID}?fields=access_token" \
  -H "Authorization: Bearer {SYSTEM_USER_TOKEN}"
```

3. **取得したトークンを本システムに設定**:
   - 設定画面で「Metaアクセストークン」に貼り付け
   - 「Meta設定を保存」をクリック

---

## 📝 本システムへの設定方法

### 方法1: 設定画面から設定（推奨）

1. 本システムにログイン
2. 「設定」画面にアクセス
3. 「Meta広告アカウント連携」セクションで以下を入力：
   - **Meta広告アカウントID**: `act_123456789`
   - **Metaアクセストークン**: 取得した無期限トークン
4. 「Meta設定を保存」をクリック

### 方法2: APIから設定

```bash
curl -X PUT "http://localhost:8000/api/users/me/meta-settings" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "meta_account_id": "act_123456789",
    "meta_access_token": "YOUR_PERMANENT_TOKEN"
  }'
```

---

## 🔍 トークンの有効性確認

### トークンが有効か確認する方法

```bash
curl -X GET "https://graph.facebook.com/v18.0/me?access_token={YOUR_TOKEN}"
```

**正常なレスポンス**:
```json
{
  "id": "123456789",
  "name": "Your App Name"
}
```

**エラーレスポンス**:
```json
{
  "error": {
    "message": "Invalid OAuth access token.",
    "type": "OAuthException",
    "code": 190
  }
}
```

---

## 🛡️ セキュリティベストプラクティス

### 1. トークンの保護
- **トークンは機密情報**: 他人に共有しない
- **バージョン管理に含めない**: `.gitignore`に追加
- **環境変数で管理**: 本番環境では環境変数を使用

### 2. 定期的な監視
- **トークンの有効性を定期的に確認**
- **使用状況を監視**
- **異常なアクセスを検知**

### 3. アクセス権限の最小化
- **必要な権限のみを付与**
- **不要な権限は削除**

---

## 🔄 トークンの更新が必要な場合

### トークンが無効になった場合

1. **新しいシステムユーザートークンを生成**
2. **広告アカウントのアクセストークンを再取得**
3. **本システムの設定を更新**

### 自動更新の実装（将来の拡張）

将来的には、トークンの自動更新機能を実装することも可能です：
- トークンの有効期限を監視
- 期限切れ前に自動更新
- ユーザーへの通知

---

## 📊 トークンの種類比較

| トークン種類 | 有効期限 | 取得方法 | 用途 |
|------------|---------|---------|------|
| **短期トークン** | 1-2時間 | Graph API Explorer | テスト用 |
| **長期トークン** | 60日 | 短期トークンから変換 | 開発環境 |
| **システムユーザートークン** | 無期限 | システムユーザーから生成 | 本番環境（推奨） |
| **広告アカウントトークン** | 無期限 | システムユーザートークンから取得 | 本番環境（最推奨） |

---

## 🐛 トラブルシューティング

### エラー1: "Invalid OAuth access token"

**原因**: トークンが無効または期限切れ

**解決方法**:
1. トークンが正しくコピーされているか確認
2. 新しいトークンを生成
3. 本システムの設定を更新

### エラー2: "Insufficient permissions"

**原因**: 必要な権限が付与されていない

**解決方法**:
1. システムユーザーに`ads_read`権限があるか確認
2. 広告アカウントへのアクセス権限があるか確認
3. 権限を再付与

### エラー3: "System User not found"

**原因**: システムユーザーが正しく作成されていない

**解決方法**:
1. システムユーザーが作成されているか確認
2. 正しいアプリに紐づいているか確認
3. システムユーザーを再作成

---

## 📚 参考リンク

- [Meta for Developers](https://developers.facebook.com/)
- [Marketing API ドキュメント](https://developers.facebook.com/docs/marketing-apis)
- [システムユーザーガイド](https://developers.facebook.com/docs/marketing-api/system-users)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)

---

## ✅ チェックリスト

無期限トークン取得の確認項目：

- [ ] Meta for Developersでアプリを作成
- [ ] Marketing APIを有効化
- [ ] システムユーザーを作成
- [ ] 広告アカウントにシステムユーザーを追加
- [ ] 必要な権限を付与（`ads_read`, `ads_management`）
- [ ] システムユーザートークンを生成
- [ ] 広告アカウントのアクセストークンを取得
- [ ] 本システムの設定画面でトークンを設定
- [ ] トークンの有効性を確認

---

## 🎯 まとめ

無期限トークンを取得することで：
- ✅ 60日ごとの更新作業が不要
- ✅ より安定した運用が可能
- ✅ 本番環境での使用に適している

**推奨**: 本番環境では無期限トークン（システムユーザートークン）の使用を強く推奨します。

