#!/usr/bin/env python3
"""
ユニークリーチ更新APIをテストするスクリプト
実行方法: cd backend && source venv/bin/activate && python3 test_update_unique_reach.py
"""
import os
import sys
import requests
import json
from datetime import timedelta

# .envファイルを読み込む
def load_env_file():
    """Load environment variables from .env file"""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")

load_env_file()

try:
    from sqlalchemy import create_engine, text
    from jose import jwt
    import uuid
except ImportError as e:
    print(f"❌ モジュールのインポートエラー: {e}")
    print("仮想環境をアクティベートしてください: source venv/bin/activate")
    sys.exit(1)

def create_access_token(user_id: str, secret_key: str, algorithm: str = "HS256", expires_delta: timedelta = None):
    """Create a JWT access token"""
    if expires_delta is None:
        expires_delta = timedelta(minutes=720)  # 12時間
    
    from datetime import datetime
    to_encode = {"sub": user_id}
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=algorithm)
    return encoded_jwt

def main():
    """メイン処理"""
    print("="*80)
    print("ユニークリーチ更新APIテスト")
    print("="*80)
    print()
    
    # データベース接続
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("❌ DATABASE_URLが設定されていません")
        sys.exit(1)
    
    # シークレットキー
    SECRET_KEY = os.getenv("SECRET_KEY")
    if not SECRET_KEY:
        print("❌ SECRET_KEYが設定されていません")
        sys.exit(1)
    
    print(f"[1/5] データベースURL: {DATABASE_URL[:30]}...")
    
    try:
        engine = create_engine(DATABASE_URL)
        print("[2/5] ✅ データベース接続成功")
        
        # ユーザーIDとmeta_access_tokenを取得
        with engine.connect() as conn:
            result = conn.execute(text(
                "SELECT id, meta_access_token FROM users WHERE meta_access_token IS NOT NULL AND meta_access_token != '' LIMIT 1"
            ))
            user = result.fetchone()
            
            if not user:
                print("[3/5] ❌ meta_access_tokenが見つかりません")
                print("       Meta OAuth認証を行ってください")
                sys.exit(1)
            
            user_id = str(user[0])
            meta_token = user[1].strip() if user[1] else None
            
            if not meta_token:
                print("[3/5] ❌ meta_access_tokenが空です")
                print("       Meta OAuth認証を行ってください")
                sys.exit(1)
            
            print(f"[3/5] ✅ ユーザーID取得: {user_id[:8]}...")
            print(f"       meta_access_token長さ: {len(meta_token)}文字")
        
        # JWTトークンを生成
        print("[4/5] JWTトークンを生成中...")
        access_token = create_access_token(user_id, SECRET_KEY)
        print(f"[4/5] ✅ JWTトークン生成成功（長さ: {len(access_token)}文字）")
        
        # APIエンドポイントを呼び出し
        print("[5/5] APIリクエスト送信中...")
        print()
        
        url = "http://127.0.0.1:8000/api/meta/update-unique-reach"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(url, headers=headers, timeout=120)
        
        print("="*80)
        print(f"ステータスコード: {response.status_code}")
        print("="*80)
        print()
        
        if response.status_code == 200:
            data = response.json()
            print("✅ 更新成功！")
            print()
            print(f"成功: {data.get('success_count', 0)}キャンペーン")
            print(f"失敗: {data.get('error_count', 0)}キャンペーン")
            print(f"合計: {data.get('total', 0)}キャンペーン")
            if 'total_campaigns' in data:
                print(f"総キャンペーン数: {data.get('total_campaigns', 0)}")
            print()
            
            details = data.get('details', [])
            if details:
                print("詳細:")
                # 成功したキャンペーンのみ表示（最初の10件）
                success_details = [d for d in details if d.get('status') == 'success'][:10]
                for detail in success_details:
                    print(f"  ✅ {detail.get('campaign_name', 'Unknown')}: {detail.get('unique_reach', 0):,} (更新レコード数: {detail.get('updated_records', 0)})")
                
                error_details = [d for d in details if d.get('status') == 'error']
                if error_details:
                    print()
                    print("エラー詳細:")
                    for detail in error_details[:5]:  # 最初の5件のみ表示
                        print(f"  ❌ {detail.get('campaign_name', 'Unknown')}: {detail.get('error', 'Unknown error')}")
                
                if len(details) > 10:
                    print(f"  ... 他 {len(details) - 10}件")
            else:
                print("詳細: なし")
        else:
            print("❌ エラー")
            try:
                error_data = response.json()
                print(json.dumps(error_data, indent=2, ensure_ascii=False))
            except:
                print(response.text)
        
        print()
        print("="*80)
        
    except requests.exceptions.ConnectionError:
        print("❌ バックエンドサーバーに接続できません")
        print("   http://127.0.0.1:8000 が起動しているか確認してください")
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("❌ リクエストがタイムアウトしました")
        print("   Meta APIへのアクセスに時間がかかっている可能性があります")
        sys.exit(1)
    except Exception as e:
        print(f"❌ エラー: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

