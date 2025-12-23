# Meta APIトークン期限設定ガイド

## 📋 トークン期限設定の場所

Meta Graph API Explorerでトークンの期限を設定する方法を説明します。

---

## 🔍 Graph API Explorerでの設定

### 現在の画面（Graph API Explorer）

右側のパネルで以下の設定が可能です：

1. **「Configurations」タブ**
   - トークンの詳細設定が可能
   - 期限設定のオプションがある場合があります

2. **「User or Page」セクション**
   - **「ユーザートークン」**: 短期トークン（1-2時間）または長期トークン（60日）
   - **「システムユーザートークン」**: 無期限トークン

---

## 🎯 トークン期限の設定方法

### 方法1: システムユーザートークンを使用（無期限）

**手順**:

1. **Graph API Explorerの右側パネルで**:
   - 「User or Page」セクションを確認
   - 「Get Token」→「Get System User Token」を選択

2. **システムユーザートークンを生成**:
   - アプリを選択（例: "MIERU AI"）
   - 権限を選択（`ads_read`, `ads_management`）
   - 「Generate Token」をクリック

**結果**: 無期限トークンが生成されます

---

### 方法2: Business Settingsからシステムユーザートークンを生成（推奨）

**手順**:

1. **Meta for Developersにアクセス**
   - [Meta for Developers](https://developers.facebook.com/)にログイン

2. **Business Settingsを開く**
   - アプリダッシュボードから「Business Settings」をクリック
   - または直接 [Business Settings](https://business.facebook.com/settings) にアクセス

3. **System Usersを選択**
   - 左メニューから「System Users」を選択

4. **システムユーザーを作成（まだの場合）**
   - 「Add」ボタンをクリック
   - システムユーザー名を入力
   - 「Create System User」をクリック

5. **トークンを生成**
   - 作成したシステムユーザーを選択
   - 「Generate New Token」ボタンをクリック
   - アプリを選択
   - 権限を選択（`ads_read`, `ads_management`）
   - **「Token Expiration」オプションを確認**
     - 「Never expire」（無期限）を選択可能な場合があります
   - 「Generate Token」をクリック

**結果**: 無期限トークンが生成されます

---

### 方法3: Graph API Explorerの「Configurations」タブ

**手順**:

1. **Graph API Explorerの右側パネルで**:
   - 「Configurations」タブをクリック

2. **トークン設定を確認**:
   - トークンの有効期限設定がある場合、ここで確認・変更可能
   - 「Token Expiration」や「Expires In」などのオプションを確認

3. **期限を設定**:
   - 無期限にする場合は「Never expire」を選択
   - または特定の日数を設定

**注意**: 「Configurations」タブの内容は、Meta APIのバージョンやアプリの設定によって異なる場合があります。

---

## ⚠️ 重要な注意事項

### トークンの種類と期限

| トークン種類 | 生成方法 | 有効期限 | 設定場所 |
|------------|---------|---------|---------|
| **ユーザートークン** | Graph API Explorer | 1-2時間（短期）<br>60日（長期） | Graph API Explorer |
| **システムユーザートークン** | Business Settings | 無期限 | Business Settings |
| **広告アカウントトークン** | システムユーザーから取得 | 無期限 | API経由 |

### 無期限トークンを取得する推奨方法

**最も確実な方法**: Business Settingsからシステムユーザートークンを生成

1. **Business Settings** → **System Users**
2. **システムユーザーを作成**
3. **「Generate New Token」をクリック**
4. **トークンを生成**（自動的に無期限）

---

## 🔧 具体的な手順（Business Settings）

### ステップ1: Business Settingsにアクセス

1. [Meta for Developers](https://developers.facebook.com/)にログイン
2. アプリを選択（例: "MIERU AI"）
3. 左上の「Business Settings」をクリック
   - または直接 [Business Settings](https://business.facebook.com/settings) にアクセス

### ステップ2: System Usersを開く

1. 左メニューから「System Users」を選択
2. 既存のシステムユーザーがある場合は選択
3. ない場合は「Add」ボタンで作成

### ステップ3: トークンを生成

1. システムユーザーを選択
2. 「Generate New Token」ボタンをクリック
3. 以下の設定を確認：
   - **App**: アプリを選択（例: "MIERU AI"）
   - **Permissions**: 権限を選択
     - `ads_read`（必須）
     - `ads_management`（推奨）
   - **Token Expiration**: 
     - 「Never expire」（無期限）が選択可能な場合があります
     - または自動的に無期限になります
4. 「Generate Token」をクリック
5. **トークンをコピーして保存**（再表示できません）

---

## 📝 Graph API Explorerでの確認方法

### 現在のトークンの期限を確認

1. **Graph API Explorerで以下のクエリを実行**:

```
GET /debug_token?input_token={YOUR_TOKEN}
```

2. **レスポンスで確認**:
```json
{
  "data": {
    "app_id": "123456789",
    "expires_at": 0,  // 0 = 無期限
    "is_valid": true,
    "scopes": ["ads_read", "ads_management"]
  }
}
```

**`expires_at`の値**:
- `0`: 無期限
- タイムスタンプ（例: `1735689600`）: その日時まで有効

---

## 🎯 推奨手順（まとめ）

### 無期限トークンを取得する最確実な方法

1. **Business Settingsにアクセス**
   - [Business Settings](https://business.facebook.com/settings)

2. **System Usersを選択**
   - 左メニューから「System Users」

3. **システムユーザーを作成または選択**
   - 既存のシステムユーザーを使用
   - または新規作成

4. **「Generate New Token」をクリック**
   - アプリを選択
   - 権限を選択
   - トークンを生成

5. **トークンを本システムに設定**
   - 設定画面で「Metaアクセストークン」に貼り付け
   - 「Meta設定を保存」をクリック

---

## 🔍 現在の画面での確認ポイント

Graph API Explorerの右側パネルで確認できる項目：

1. **「Configurations」タブ**
   - トークンの詳細設定
   - 期限設定のオプション

2. **「User or Page」セクション**
   - 「ユーザートークン」: 期限あり
   - 「システムユーザートークン」: 無期限（推奨）

3. **「Generate Access Token」ボタン**
   - クリックすると、トークン生成画面が表示
   - システムユーザートークンを選択可能

---

## 💡 推奨事項

### 本番環境での使用

- **システムユーザートークンを使用**（無期限）
- Business Settingsから生成（最も確実）
- 定期的にトークンの有効性を確認

### 開発環境での使用

- 長期トークン（60日）でも問題なし
- 期限切れ前に更新

---

## 📚 参考リンク

- [Business Settings](https://business.facebook.com/settings)
- [System Users ドキュメント](https://developers.facebook.com/docs/marketing-api/system-users)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)

---

## ✅ チェックリスト

無期限トークン取得の確認：

- [ ] Business Settingsにアクセスできる
- [ ] System Usersが作成されている
- [ ] 広告アカウントにシステムユーザーが割り当てられている
- [ ] システムユーザートークンを生成した
- [ ] トークンが無期限であることを確認（`expires_at: 0`）
- [ ] 本システムの設定画面でトークンを設定した

