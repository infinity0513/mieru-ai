# バックエンドサーバー再起動手順

## 1. 現在のプロセスを停止

```bash
kill -9 $(lsof -ti:8000)
```

## 2. Pythonキャッシュをクリア

```bash
cd backend
find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null || true
find . -name "*.pyc" -delete 2>/dev/null || true
```

## 3. バックエンドサーバーを再起動

```bash
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 4. ログで確認すべきポイント

サーバー起動後、OAuth認証または `/api/meta/sync-all` を実行し、以下のログが出力されることを確認：

- `[Meta API] time_increment: 1`
- `[Meta API] Sample relative_url for batch request: ...time_increment=1...`
- `[Meta API] First 5 dates in batch: [...]` （複数の異なる日付が表示される）

もし同じ日付しか表示されない場合は、`time_increment`が正しく動作していません。


