#!/usr/bin/env python3
"""Railway用のサーバー起動スクリプト"""
import os
import uvicorn

if __name__ == "__main__":
    # 環境変数PORTからポート番号を取得（デフォルトは8000）
    port = int(os.environ.get("PORT", 8000))
    
    # uvicornでアプリケーションを起動
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

