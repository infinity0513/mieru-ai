# Python 3.11のベースイメージを使用
FROM python:3.11-slim

# 作業ディレクトリを設定
WORKDIR /app

# システムの依存関係をインストール
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# requirements.txtをコピーして依存関係をインストール
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY backend/ ./backend/

# 作業ディレクトリをbackendに変更
WORKDIR /app/backend

# 環境変数を設定
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1

# ポートを公開（Railwayが自動設定するポート番号を使用、デフォルトは8000）
EXPOSE 8000

# Pythonスクリプトでサーバーを起動（環境変数PORTを正しく読み取る）
CMD ["python", "start_server.py"]

