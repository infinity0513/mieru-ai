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

# ポートを環境変数から取得（Railwayが自動設定）
EXPOSE $PORT

# 環境変数を設定
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1

# デフォルトポート（環境変数PORTが設定されていない場合）
ENV PORT=8000

# uvicornでアプリケーションを起動（環境変数PORTを使用）
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}

