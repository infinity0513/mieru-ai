# バックエンドサーバーの再起動手順

## 問題
ローカル環境でコードの変更が反映されない問題が発生しています。

## 原因
uvicornの`--reload`オプションが正しく動作していない可能性があります。

## 解決方法

### 1. 現在のバックエンドサーバーを停止

```bash
# ポート8000を使用しているプロセスを確認
lsof -ti:8000

# プロセスを停止（プロセスIDを確認してから）
kill -9 <プロセスID>
```

または、バックエンドサーバーを起動しているターミナルで `Ctrl+C` を押して停止してください。

### 2. Pythonのキャッシュをクリア

```bash
cd backend
find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null || true
find . -name "*.pyc" -delete 2>/dev/null || true
```

### 3. バックエンドサーバーを再起動

```bash
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 4. 変更が反映されているか確認

バックエンドサーバーのログで、以下のメッセージが出力されることを確認してください：

```
[Meta API] time_increment: 1
[Meta API] Sample relative_url for batch request: ...
```

## 注意事項

- `--reload`オプションは、ファイルの変更を検知して自動的に再ロードしますが、場合によっては正しく動作しないことがあります。
- 変更が反映されない場合は、必ず手動でサーバーを再起動してください。
- 本番環境にプッシュする前に、ローカル環境で必ず動作確認を行ってください。


