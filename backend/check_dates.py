import sys
import os

# venvのパスを追加
venv_path = os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.14', 'site-packages')
if os.path.exists(venv_path):
    sys.path.insert(0, venv_path)

# プロジェクトのルートディレクトリをパスに追加
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.campaign import Campaign
from sqlalchemy import func

db = SessionLocal()

print('===== データベースの日付確認 =====')

# 全レコード数
total = db.query(Campaign).count()
print(f'\n総レコード数: {total}件')

# 最初の10件の日付
print('\n最初の10件の日付:')
dates = db.query(Campaign.date, Campaign.campaign_name).limit(10).all()
for d in dates:
    print(f'  日付: {d[0]}, キャンペーン: {d[1]}')

# ユニーク日付の一覧
print('\nユニーク日付:')
unique_dates = db.query(Campaign.date).distinct().order_by(Campaign.date).all()
print(f'ユニーク日付数: {len(unique_dates)}件')
for d in unique_dates[:20]:  # 最初の20件
    count = db.query(Campaign).filter(Campaign.date == d[0]).count()
    print(f'  {d[0]}: {count}件')

# 日付の型を確認
if dates:
    first_date = dates[0][0]
    print(f'\n日付の型: {type(first_date).__name__}')
    print(f'日付の値: {first_date}')

db.close()
print('\n===== 確認完了 =====')

