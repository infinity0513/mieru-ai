import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # 1. 全レコード数
    result = conn.execute(text("SELECT COUNT(*) as count FROM campaigns"))
    print(f"総レコード数: {result.fetchone()[0]}")
    
    # 2. アカウント別レコード数
    result = conn.execute(text("""
        SELECT meta_account_id, COUNT(*) as count 
        FROM campaigns 
        GROUP BY meta_account_id
    """))
    print("\n=== アカウント別レコード数 ===")
    for row in result:
        print(f"{row[0]}: {row[1]}件")
    
    # 3. キャンペーン別レコード数（act_343589077304936）
    result = conn.execute(text("""
        SELECT campaign_name, COUNT(*) as count, 
               COUNT(DISTINCT date) as unique_dates,
               MIN(date) as min_date, MAX(date) as max_date
        FROM campaigns 
        WHERE meta_account_id = 'act_343589077304936'
        GROUP BY campaign_name
        ORDER BY count DESC
        LIMIT 10
    """))
    print("\n=== キャンペーン別レコード数（act_343589077304936）===")
    for row in result:
        print(f"{row[0]}: {row[1]}件 ({row[2]}日分, {row[3]} ~ {row[4]})")
    
    # 4. 同じキャンペーン・日付の重複レコード確認
    result = conn.execute(text("""
        SELECT campaign_name, date, COUNT(*) as count
        FROM campaigns 
        WHERE meta_account_id = 'act_343589077304936'
        GROUP BY campaign_name, date
        HAVING COUNT(*) > 1
        ORDER BY count DESC
        LIMIT 10
    """))
    print("\n=== 重複レコード（同じキャンペーン・日付）===")
    duplicates = list(result)
    if duplicates:
        for row in duplicates:
            print(f"{row[0]} on {row[1]}: {row[2]}件")
    else:
        print("重複なし")
    
    # 5. ad_set_name/ad_name の分布
    result = conn.execute(text("""
        SELECT 
            COUNT(CASE WHEN ad_set_name IS NULL THEN 1 END) as null_adset,
            COUNT(CASE WHEN ad_set_name IS NOT NULL THEN 1 END) as has_adset,
            COUNT(CASE WHEN ad_name IS NULL THEN 1 END) as null_ad,
            COUNT(CASE WHEN ad_name IS NOT NULL THEN 1 END) as has_ad
        FROM campaigns
        WHERE meta_account_id = 'act_343589077304936'
    """))
    print("\n=== ad_set_name/ad_name の分布 ===")
    row = result.fetchone()
    print(f"ad_set_name が NULL: {row[0]}件")
    print(f"ad_set_name がある: {row[1]}件")
    print(f"ad_name が NULL: {row[2]}件")
    print(f"ad_name がある: {row[3]}件")

