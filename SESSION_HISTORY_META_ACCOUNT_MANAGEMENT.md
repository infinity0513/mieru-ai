# セッション履歴: ユーザーごとのMetaアカウント情報管理実装

## 日付
2025年1月（最新セッション）

## 主な作業内容

### 1. 問題の背景

#### 発見された問題
- n8nワークフローで固定のMetaアカウントIDを使用していた
- 複数ユーザーが同じアカウント情報を共有していた
- ユーザーごとに異なるMetaアカウント情報を使用できない

#### ユーザーの要望
- 各ユーザーが自分のMetaアカウント情報を使用できるようにする
- n8nワークフローは共通で、ユーザーごとの設定は不要にする
- セキュアにトークンを管理する

---

### 2. 実装内容

#### 2.1 データベーススキーマの確認・拡張

**確認したモデル**:
- `backend/app/models/user.py` - Userモデルに以下が既に存在：
  - `meta_account_id: Optional[str]` - Meta広告アカウントID
  - `meta_access_token: Optional[str]` - Metaアクセストークン

**状態**: 既に実装済み（追加実装不要）

---

#### 2.2 バックエンドAPI実装

**実装したエンドポイント**:

1. **`GET /api/users/me/meta-settings`**
   - ユーザーのMetaアカウント情報を取得
   - トークンはセキュリティのため返さない
   - 実装ファイル: `backend/app/routers/users.py`

2. **`PUT /api/users/me/meta-settings`**
   - ユーザーのMetaアカウント情報を更新
   - `meta_account_id`と`meta_access_token`を個別に更新可能
   - 実装ファイル: `backend/app/routers/users.py`

3. **`GET /api/meta/insights`**
   - ユーザーごとのMetaアカウント情報を使用してInsightsを取得
   - 認証されたユーザーの`meta_account_id`と`meta_access_token`を使用
   - クエリパラメータ: `since`, `until`（日付範囲）
   - 実装ファイル: `backend/app/routers/meta_api.py`

**実装の詳細**:

```python
# backend/app/routers/meta_api.py
@router.get("/insights")
async def get_meta_insights(
    since: Optional[str] = None,
    until: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ユーザーのMetaアカウント情報を使用してInsightsを取得"""
    
    # ユーザーのMetaアカウント情報を確認
    if not current_user.meta_account_id or not current_user.meta_access_token:
        raise HTTPException(
            status_code=400,
            detail="Metaアカウント情報が設定されていません。設定画面でMetaアカウント情報を登録してください。"
        )
    
    # デフォルトの日付範囲（昨日から今日）
    if not since:
        since = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    if not until:
        until = datetime.now().strftime('%Y-%m-%d')
    
    # Meta Graph APIを呼び出し
    account_id = current_user.meta_account_id
    access_token = current_user.meta_access_token
    
    # 広告セットIDを取得してInsightsを取得
    # ... (実装詳細)
```

---

#### 2.3 フロントエンド実装

**実装した機能**:

1. **設定画面のMetaアカウント情報入力フォーム**
   - 実装ファイル: `frontend/src/components/Settings.tsx`
   - 機能:
     - Meta広告アカウントIDの入力・表示
     - Metaアクセストークンの入力（更新時のみ）
     - 設定の保存・取得

2. **APIクライアントの実装**
   - 実装ファイル: `frontend/src/services/api.ts`
   - メソッド:
     - `getMetaSettings()` - Metaアカウント情報を取得
     - `updateMetaSettings()` - Metaアカウント情報を更新

**実装の詳細**:

```typescript
// frontend/src/components/Settings.tsx
const [metaAccountId, setMetaAccountId] = useState('');
const [metaAccessToken, setMetaAccessToken] = useState('');

// Meta設定を読み込む
useEffect(() => {
  const loadMetaSettings = async () => {
    try {
      const settings = await Api.getMetaSettings();
      setMetaAccountId(settings.meta_account_id || '');
    } catch (error) {
      console.error('Failed to load Meta settings:', error);
    }
  };
  loadMetaSettings();
}, []);

// Meta設定を保存
const handleSaveMetaSettings = async () => {
  setMetaSettingsLoading(true);
  try {
    await Api.updateMetaSettings(metaAccountId, metaAccessToken);
    addToast('Metaアカウント設定を保存しました', 'success');
    setMetaAccessToken(''); // セキュリティのため、保存後はクリア
  } catch (error) {
    addToast('Metaアカウント設定の保存に失敗しました', 'error');
  } finally {
    setMetaSettingsLoading(false);
  }
};
```

---

#### 2.4 NaN値の処理

**問題**:
- Meta APIから取得したデータに`NaN`値が含まれる場合がある
- データ変換時に`NaN`が文字列として表示される

**解決方法**:
- Code in JavaScriptノードで`NaN`値を適切に処理
- 文字列の`NaN`を空文字列に置換

**実装内容**:
```javascript
// NaNや空文字列を処理
const campaignName = String(data.campaign_name || '').replace(/nan/gi, '');
const adsetName = String(data.adset_name || '').replace(/nan/gi, '');
const adName = String(data.ad_name || '').replace(/nan/gi, '');
```

---

### 3. n8nワークフローの更新

#### 3.1 ワークフロー構造の変更

**変更前**:
1. Schedule Trigger
2. Facebook Graph API（固定のアカウントID）
3. Code in JavaScript（データ変換）
4. HTTP Request1（ログイン）
5. Code in JavaScript1（CSV生成）
6. HTTP Request（アップロード）

**変更後**:
1. Schedule Trigger
2. HTTP Request1（ログイン）
3. HTTP Request（Meta Insights取得）← **新規追加**
4. Code in JavaScript（データ変換）
5. Code in JavaScript1（CSV生成）
6. HTTP Request（アップロード）

#### 3.2 実装の詳細

**HTTP Request1（ログイン）**:
- Method: `POST`
- URL: `https://mieru-ai-production.up.railway.app/api/auth/login`
- Body: `{ "email": "user@example.com", "password": "user-password" }`

**HTTP Request（Meta Insights取得）**:
- Method: `GET`
- URL: `https://mieru-ai-production.up.railway.app/api/meta/insights`
- Authentication: `Bearer {{ $('HTTP Request1').item.json.access_token }}`
- Query Parameters:
  - `since`: `{{ $now.minus({days: 1}).toFormat('yyyy-MM-dd') }}`
  - `until`: `{{ $now.toFormat('yyyy-MM-dd') }}`

**Code in JavaScript（データ変換）**:
- HTTP Request（Meta Insights取得）の出力を使用
- `data`配列を処理
- NaN値を適切に処理

---

### 4. ドキュメント作成

#### 作成したドキュメント

1. **`N8N_WORKFLOW_UPDATE_GUIDE.md`**
   - n8nワークフローの更新手順
   - 各ステップの詳細な設定方法
   - コード例を含む

2. **`NEXT_STEPS.md`**
   - 今後の実装・運用フロー
   - 優先順位付きのステップ
   - トラブルシューティングガイド

3. **`SESSION_HISTORY_META_ACCOUNT_MANAGEMENT.md`**（このファイル）
   - 今回の実装の詳細な記録
   - 問題の背景と解決方法
   - 実装内容の詳細

---

### 5. 解決した問題

#### 5.1 NaN値の処理
- **問題**: Meta APIから取得したデータに`NaN`値が含まれる
- **解決**: データ変換時に`NaN`を空文字列に置換

#### 5.2 認証エラー
- **問題**: n8nワークフローで認証エラーが発生
- **解決**: ログインエンドポイントを正しく設定

#### 5.3 ユーザーごとのアカウント情報管理
- **問題**: 固定のアカウントIDを使用していた
- **解決**: ユーザーごとのMetaアカウント情報をデータベースに保存し、APIで使用

---

### 6. 技術的な詳細

#### 6.1 セキュリティ
- Metaアクセストークンはデータベースに暗号化して保存（推奨）
- APIレスポンスではトークンを返さない
- 認証が必要なエンドポイントのみアクセス可能

#### 6.2 エラーハンドリング
- Metaアカウント情報が設定されていない場合のエラーメッセージ
- Meta APIエラーの適切な処理
- ユーザーへの分かりやすいエラーメッセージ

#### 6.3 データ処理
- NaN値の処理
- 空データの処理
- データ型の変換

---

### 7. 次のステップ

#### 7.1 ユーザーがMetaアカウント情報を設定
- 設定画面でMetaアカウントIDとアクセストークンを入力・保存

#### 7.2 n8nワークフローの更新
- `N8N_WORKFLOW_UPDATE_GUIDE.md` に従ってワークフローを更新

#### 7.3 テスト実行
- n8nワークフローを手動実行
- 各ステップでエラーが発生しないか確認

#### 7.4 エラーハンドリングの確認・改善
- トークンの有効期限切れ
- アカウントIDの不正
- APIレート制限

#### 7.5 本番環境での動作確認
- スケジュール実行が正しく動作するか
- 複数ユーザーが同時に使用しても問題ないか

---

### 8. ファイル一覧

#### 修正したファイル

**バックエンド:**
- `backend/app/routers/users.py` - Metaアカウント情報の取得・更新エンドポイント
- `backend/app/routers/meta_api.py` - ユーザーごとのMeta Insights取得エンドポイント

**フロントエンド:**
- `frontend/src/components/Settings.tsx` - Metaアカウント情報入力フォーム
- `frontend/src/services/api.ts` - Metaアカウント情報取得・更新API

**ドキュメント:**
- `N8N_WORKFLOW_UPDATE_GUIDE.md` - n8nワークフロー更新手順（新規作成）
- `NEXT_STEPS.md` - 今後の実装・運用フロー（新規作成）
- `SESSION_HISTORY_META_ACCOUNT_MANAGEMENT.md` - このファイル（新規作成）

---

### 9. 注意事項

1. **セキュリティ**
   - Metaアクセストークンは機密情報です。適切に管理してください
   - トークンは定期的に更新することを推奨します

2. **APIレート制限**
   - Meta APIにはレート制限があります
   - 大量のデータを取得する場合は、適切な間隔を空けてください

3. **データの整合性**
   - データ取得時にエラーが発生した場合、データが不完全になる可能性があります
   - 定期的にデータの整合性を確認してください

---

### 10. 参考ドキュメント

- `N8N_WORKFLOW_UPDATE_GUIDE.md` - n8nワークフロー更新手順
- `N8N_WORKFLOW_CREATION_GUIDE.md` - n8nワークフロー作成手順
- `META_ACCOUNT_ID_GUIDE.md` - MetaアカウントIDとトークンの取得方法
- `N8N_RAILWAY_SETUP.md` - n8nのRailwayセットアップ手順
- `NEXT_STEPS.md` - 今後の実装・運用フロー

