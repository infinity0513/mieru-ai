# バックアップサマリー

## 作成日時
$(date)

## 現在のブランチ
$(git branch --show-current)

## 最新のコミット
$(git log --oneline -1)

## 重要な変更履歴（直近20件）
$(git log --oneline -20)

## 未コミットの変更
$(git status --short)

## 重要なファイルの状態

### netlify.toml
[build]
  base = "frontend"
  command = "npm ci && npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"


### backend/app/routers/meta_api.py (最新の変更)
85e98b3 feat: 広告セット/広告レベルのデータ取得処理を追加
10e11b6 fix: Meta API全期間データ取得のデバッグログ追加と日付範囲フィルタリング改善
3164963 fix: get_meta_accountsにページネーション処理を追加して全アカウントを取得できるように修正
7dd775c fix: get_meta_accountsでMeta APIから取得した全アカウントを表示するように修正
34ba990 fix: アセット名表示の改善とuntil_dtの確認

### frontend/src/components/Dashboard.tsx (最新の変更)
a4cde9d chore: Netlifyデプロイ用にfrontendファイルを変更
10e11b6 fix: Meta API全期間データ取得のデバッグログ追加と日付範囲フィルタリング改善
7da24d3 fix: フロントエンドのアセット名表示とキャッシュ処理を修正
33dd24e OAuthコールバック時の90日分取得を削除、全期間取得のみに統一
b165845 修正: propData変更時に既存データをクリアして強制的に再取得するように変更
