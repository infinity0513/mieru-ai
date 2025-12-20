# セッション履歴: メール実装・プラン設計

## 日付
2025年1月（最新セッション）

## 主な作業内容

### 1. Resendによるメール実装

#### 実装した機能
- **パスワードリセット機能**
  - パスワードリセットリクエスト（`POST /api/auth/forgot-password`）
  - パスワードリセット実行（`POST /api/auth/reset-password`）
  - フロントエンドのパスワードリセット画面
  - メール送信（Resend使用）

- **新規登録完了メール**
  - ウェルカムメール送信機能
  - 登録完了時に自動送信

#### 作成・修正したファイル

**バックエンド:**
- `backend/app/models/password_reset.py` (新規作成)
  - パスワードリセットトークンのモデル
- `backend/app/services/email_service.py` (新規作成)
  - Resendを使用したメール送信サービス
- `backend/app/routers/auth.py` (修正)
  - パスワードリセットエンドポイント追加
  - 新規登録時のウェルカムメール送信追加
- `backend/app/schemas/user.py` (修正)
  - パスワードリセット関連のスキーマ追加
- `backend/app/config.py` (修正)
  - Resend設定項目追加（RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME, FRONTEND_URL）
- `backend/requirements.txt` (修正)
  - resend==2.0.0 を追加

**フロントエンド:**
- `frontend/src/components/Auth.tsx` (修正)
  - パスワードリセット画面追加
  - パスワード忘れ画面追加
- `frontend/src/services/api.ts` (修正)
  - forgotPassword() メソッド追加
  - resetPassword() メソッド追加

**データベース:**
- `password_reset_tokens` テーブル作成（SQL実行）

#### 設定内容
- **Resend APIキー**: `re_TCwUTJEW_NfVbonXr378NKhMYnsxvLvZ3`
- **送信元メールアドレス**: `mail@mieruai.jp`
- **配信者名**: `MIERU AI`
- **フロントエンドURL**: `http://localhost:3000`（開発環境）

#### 解決した問題
1. `resend`パッケージがインストールされていない問題
   - `pip install resend==2.0.0` で解決

2. `password_reset_tokens`テーブルが存在しない問題
   - SQLで直接テーブル作成

3. Resend APIの呼び出し方法の問題
   - `SendParams`オブジェクトではなく、辞書形式で送信するように修正

4. メールの差出人表示の問題
   - 「MIERU AI <mail@mieruai.jp>」形式に修正

5. リセットボタンの表示問題
   - インラインスタイルを追加して修正

---

### 2. プラン設計

#### プラン構成
- **FREE プラン（無料）**
  - 基本機能（データ閲覧・分析）
  - 制限付き機能（AI機能は回数制限あり）

- **スタンダード プラン（月額9,800円）**
  - 全機能利用可能（一部回数制限あり）
  - チーム機能（最大5名）

- **PRO プラン（月額29,800円）**
  - 全機能無制限利用
  - チーム機能無制限
  - 優先サポート、APIアクセス

#### コスト試算

**通常モデル:**
- 100名: 月額コスト 93,500円、売上 394,000円、粗利 300,500円（粗利率76%）
- 1,000名: 月額コスト 993,000円、売上 5,920,000円、粗利 4,927,000円（粗利率83%）
- 10,000名: 月額コスト 10,800,500円、売上 69,000,000円、粗利 58,199,500円（粗利率84%）

**7日間無料トライアルモデル:**
- 100名: 月額コスト 65,901円、売上 108,600円、粗利 42,699円（粗利率39%）
- 1,000名: 月額コスト 629,700円、売上 1,780,000円、粗利 1,150,300円（粗利率65%）
- 10,000名: 月額コスト 5,667,500円、売上 17,800,000円、粗利 12,132,500円（粗利率68%）

#### 作成したドキュメント
- `PLAN_PROPOSAL.md`: 通常モデルのプラン設計
- `PLAN_PROPOSAL_TRIAL.md`: 7日間無料トライアルモデルのプラン設計

#### コード修正
- `backend/app/models/user.py`: プラン名を `FREE, STANDARD, PRO` に変更
- `frontend/src/types.ts`: プラン型を `FREE | STANDARD | PRO` に変更

---

### 3. その他の作業

#### ユーザー削除
- `infinity0513@live.jp` のユーザー登録を削除

#### ドメイン・メール設定の相談
- お名前.comでドメイン取得済み
- お名前メール（月額440円）を使用
- Resendでドメイン検証完了
- メール送信機能が正常に動作

---

## 技術的な詳細

### Resend APIの実装
- API形式: 辞書形式で送信
- 送信者名: `"MIERU AI <mail@mieruai.jp>"` 形式
- エラーハンドリング: 詳細なログ出力を実装

### メールテンプレート
- HTML形式のメールテンプレート
- レスポンシブデザイン
- 日本語対応

### セキュリティ
- パスワードリセットトークンは24時間有効
- 使用済みトークンは再利用不可
- メールアドレスの存在を明かさない（セキュリティベストプラクティス）

---

## 次のステップ

### 実装が必要な機能
1. プラン制限の実装
   - 各機能の使用回数制限
   - プランによる機能の有効/無効化

2. 課金システムの統合
   - 決済システム（Stripe等）の統合
   - サブスクリプション管理

3. トライアル期間の管理
   - 7日間無料トライアルの実装
   - 自動課金への移行

4. 使用量の追跡
   - 各機能の使用回数を記録
   - 制限に達した場合の通知

---

## ファイル一覧

### 新規作成
- `backend/app/models/password_reset.py`
- `backend/app/services/email_service.py`
- `PLAN_PROPOSAL.md`
- `PLAN_PROPOSAL_TRIAL.md`
- `SESSION_HISTORY_EMAIL_IMPLEMENTATION.md` (このファイル)

### 修正
- `backend/app/routers/auth.py`
- `backend/app/schemas/user.py`
- `backend/app/config.py`
- `backend/app/models/user.py`
- `backend/requirements.txt`
- `frontend/src/components/Auth.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/types.ts`

### データベース
- `password_reset_tokens` テーブル（新規作成）

---

## 環境変数設定

### バックエンド `.env`
```env
RESEND_API_KEY=re_TCwUTJEW_NfVbonXr378NKhMYnsxvLvZ3
RESEND_FROM_EMAIL=mail@mieruai.jp
RESEND_FROM_NAME=MIERU AI
FRONTEND_URL=http://localhost:3000
```

---

## 動作確認済み
- ✅ パスワードリセットメールの送信
- ✅ 新規登録完了メールの送信
- ✅ メールの差出人表示（「MIERU AI」）
- ✅ リセットボタンの表示

---

## 注意事項
- Resendのドメイン検証が必要（完了済み）
- 本番環境では `FRONTEND_URL` を本番URLに変更する必要がある
- メール送信に失敗しても登録処理は続行される（エラーログのみ出力）

