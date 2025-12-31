#!/bin/bash
# バックエンドサーバーを再起動するスクリプト

echo "🔄 バックエンドサーバーを再起動します..."

# ポート8000を使用しているプロセスを停止
echo "📌 既存のプロセスを停止中..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || echo "  ポート8000を使用しているプロセスはありません"

# 少し待機
sleep 1

# バックエンドサーバーを起動
echo "🚀 バックエンドサーバーを起動中..."
cd "$(dirname "$0")"
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &

# 起動を待機
sleep 3

# 起動確認
if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "✅ バックエンドサーバーが正常に起動しました"
else
    echo "⚠️  バックエンドサーバーは起動中です（数秒待ってから再度確認してください）"
fi


