# バックアップ手順

## Gitでのバックアップ（推奨）

現在の変更をコミットしてバックアップする場合：

```bash
# 変更をステージング
git add .

# コミット（メッセージは適宜変更してください）
git commit -m "日付範囲フィルタの統一と修正

- ダッシュボード、AnomalyDetector、スマートレポートの日付計算を統一
- 全期間ボタンの自動日付更新機能を修正
- React Hooksの順序エラーを修正
- 選択状態のハイライト表示を追加"

# リモートにプッシュ（オプション）
git push origin main
```

## 手動バックアップ

プロジェクト全体をバックアップする場合：

```bash
# プロジェクトディレクトリをコピー
cp -r /Users/waka/Desktop/システム開発/meta-ad-analyzer-ai-online \
      /Users/waka/Desktop/システム開発/meta-ad-analyzer-ai-online-backup-$(date +%Y%m%d)
```

## 重要なファイル

以下のファイルが修正されています：

1. `frontend/src/components/Dashboard.tsx`
2. `frontend/src/components/AnomalyDetector.tsx`
3. `frontend/src/services/api.ts`

これらのファイルは次回のセッションで確認が必要です。



