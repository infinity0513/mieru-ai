from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

# データベース接続プールの設定を追加
# pool_pre_ping: 接続が有効かどうかを確認してから使用（接続タイムアウトを防ぐ）
# pool_recycle: 接続を定期的に再生成（3600秒 = 1時間）
# pool_size: 接続プールのサイズ
# max_overflow: 追加で作成できる接続数
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # 接続が有効かどうかを確認
    pool_recycle=3600,   # 1時間ごとに接続を再生成
    pool_size=5,         # 接続プールのサイズ
    max_overflow=10      # 追加で作成できる接続数
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()




