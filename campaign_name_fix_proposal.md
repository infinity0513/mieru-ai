# キャンペーン名の特殊文字・URLエンコード処理の修正案

## 修正が必要な3つの問題

### 1. `update_unique_reach`エンドポイントでのキャンペーン名検索: URLエンコードが必要
### 2. キャンペーン名のマッピング処理: 正規化が必要（前後のスペース削除、全角・半角の統一）
### 3. データベースでのキャンペーン名の比較: 正規化が必要

---

## 修正案1: キャンペーン名の正規化関数を作成

### 場所
`backend/app/routers/meta_api.py` の先頭（import文の後）

### 修正内容
```python
def normalize_campaign_name(name: str) -> str:
    """
    キャンペーン名を正規化（前後のスペース削除、全角・半角の統一）
    
    Args:
        name: 正規化するキャンペーン名
        
    Returns:
        正規化されたキャンペーン名
    """
    if not name:
        return ''
    
    # 前後のスペースを削除
    name = name.strip()
    
    # 全角スペースを半角スペースに変換
    name = name.replace('　', ' ')
    
    # 連続するスペースを1つに統一
    import re
    name = re.sub(r'\s+', ' ', name)
    
    # 再度前後のスペースを削除（連続スペース削除後のため）
    name = name.strip()
    
    return name
```

### 使用箇所
- キャンペーン名のマッピング処理（`meta_api.py` Line 474, 779, 1158-1160）
- データベースでのキャンペーン名の比較（`campaigns.py` Line 42, 889）

---

## 修正案2: `update_unique_reach`エンドポイントでのキャンペーン名検索のURLエンコード

### 場所
`backend/app/routers/meta_api.py` Line 2647付近

### 現在のコード
```python
campaigns_params = {
    "access_token": access_token,
    "fields": "id,name",
    "filtering": json.dumps([{"field": "name", "operator": "EQUAL", "value": campaign_name}]),
    "limit": 100
}
```

### 修正後のコード
```python
# キャンペーン名を正規化
normalized_campaign_name = normalize_campaign_name(campaign_name)

# filteringパラメータをJSONとして作成
filtering_json = json.dumps([{"field": "name", "operator": "EQUAL", "value": normalized_campaign_name}])

# URLエンコード（httpxが自動的にエンコードするが、明示的にエンコードする場合）
# 注意: httpxのparamsパラメータは自動的にURLエンコードされるため、通常は不要
# ただし、filteringパラメータが特殊な場合は、明示的にエンコードする必要がある可能性がある

campaigns_params = {
    "access_token": access_token,
    "fields": "id,name",
    "filtering": filtering_json,  # httpxが自動的にURLエンコードする
    "limit": 100
}
```

### 注意点
- `httpx`の`params`パラメータは自動的にURLエンコードされるため、通常は明示的なエンコードは不要
- ただし、Meta APIの`filtering`パラメータが特殊な形式を要求する場合は、明示的にエンコードする必要がある可能性がある
- 実際の動作を確認してから、必要に応じて`urllib.parse.quote()`を使用

---

## 修正案3: キャンペーン名のマッピング処理の正規化

### 場所1: 期間別ユニークリーチ取得時（`meta_api.py` Line 474付近）

### 現在のコード
```python
period_map[campaign_name] = period_reach
```

### 修正後のコード
```python
# キャンペーン名を正規化してからマップに保存
normalized_campaign_name = normalize_campaign_name(campaign_name)
period_map[normalized_campaign_name] = period_reach

# デバッグ: 正規化前後のキャンペーン名をログ出力（最初の数件のみ）
if len(period_map) <= 3:
    print(f"[Meta API] Campaign name normalization: '{campaign_name}' -> '{normalized_campaign_name}'")
```

### 場所2: 期間別ユニークリーチ取得時（`meta_api.py` Line 779付近）

### 現在のコード
```python
period_map[campaign_name] = period_reach
```

### 修正後のコード
```python
# キャンペーン名を正規化してからマップに保存
normalized_campaign_name = normalize_campaign_name(campaign_name)
period_map[normalized_campaign_name] = period_reach
```

### 場所3: 日次データ保存時のマッピング（`meta_api.py` Line 1158-1160付近）

### 現在のコード
```python
period_unique_reach_7days = campaign_period_reach_7days_map.get(campaign_name, 0)
period_unique_reach_30days = campaign_period_reach_30days_map.get(campaign_name, 0)
period_unique_reach_all = campaign_period_reach_all_map.get(campaign_name, 0)
```

### 修正後のコード
```python
# キャンペーン名を正規化してからマップから取得
normalized_campaign_name = normalize_campaign_name(campaign_name)
period_unique_reach_7days = campaign_period_reach_7days_map.get(normalized_campaign_name, 0)
period_unique_reach_30days = campaign_period_reach_30days_map.get(normalized_campaign_name, 0)
period_unique_reach_all = campaign_period_reach_all_map.get(normalized_campaign_name, 0)

# デバッグ: マッピングが見つからない場合の警告（特定のキャンペーンのみ）
if period_unique_reach_all == 0 and normalized_campaign_name != campaign_name:
    # 正規化前の名前でも試す（後方互換性のため）
    period_unique_reach_all = campaign_period_reach_all_map.get(campaign_name, 0)
    if period_unique_reach_all > 0:
        print(f"[Meta API] ⚠️ Found reach using original campaign name (not normalized): '{campaign_name}'")
```

---

## 修正案4: データベースでのキャンペーン名の比較の正規化

### 場所1: `get_campaign_data`エンドポイント（`campaigns.py` Line 42付近）

### 現在のコード
```python
records = db.query(Campaign).filter(
    Campaign.user_id == current_user.id,
    Campaign.campaign_name == campaign_name,
    ...
)
```

### 修正後のコード
```python
# キャンペーン名を正規化
from ..routers.meta_api import normalize_campaign_name
normalized_campaign_name = normalize_campaign_name(campaign_name)

# 正規化された名前で検索（完全一致）
# 注意: データベースに保存されているキャンペーン名も正規化されている必要がある
# 既存データがある場合は、正規化されていない可能性があるため、両方を試す
records = db.query(Campaign).filter(
    Campaign.user_id == current_user.id,
    or_(
        Campaign.campaign_name == normalized_campaign_name,
        Campaign.campaign_name == campaign_name  # 後方互換性のため
    ),
    ...
)
```

### 場所2: `get_summary`エンドポイント（`campaigns.py` Line 889付近）

### 現在のコード
```python
if campaign_name:
    query = query.filter(Campaign.campaign_name == campaign_name)
```

### 修正後のコード
```python
if campaign_name:
    # キャンペーン名を正規化
    from ..routers.meta_api import normalize_campaign_name
    normalized_campaign_name = normalize_campaign_name(campaign_name)
    
    # 正規化された名前で検索（完全一致）
    # 既存データがある場合は、正規化されていない可能性があるため、両方を試す
    query = query.filter(
        or_(
            Campaign.campaign_name == normalized_campaign_name,
            Campaign.campaign_name == campaign_name  # 後方互換性のため
        )
    )
```

### 注意点
- 既存のデータベースに正規化されていないキャンペーン名が保存されている可能性がある
- 後方互換性のため、正規化前後の両方の名前で検索する
- 将来的には、データベースに保存する際にも正規化することを推奨

---

## 修正案5: データベース保存時のキャンペーン名の正規化（将来的な改善）

### 場所
`backend/app/routers/meta_api.py` Line 1177付近（Campaignオブジェクト作成時）

### 現在のコード
```python
campaign = Campaign(
    user_id=user.id,
    upload_id=upload.id,
    meta_account_id=account_id,
    date=campaign_date,
    campaign_name=campaign_name,
    ...
)
```

### 修正後のコード
```python
# キャンペーン名を正規化してから保存
normalized_campaign_name = normalize_campaign_name(campaign_name)

campaign = Campaign(
    user_id=user.id,
    upload_id=upload.id,
    meta_account_id=account_id,
    date=campaign_date,
    campaign_name=normalized_campaign_name,  # 正規化された名前を保存
    ...
)
```

### 注意点
- 既存データとの互換性を考慮する必要がある
- 新規データのみ正規化して保存し、既存データは後方互換性のため両方の名前で検索する

---

## 実装の優先順位

### 優先度1（最優先）
1. **修正案1**: キャンペーン名の正規化関数を作成
2. **修正案3**: キャンペーン名のマッピング処理の正規化
   - これが最も影響が大きい（ユニークリーチが0になる問題を解決）

### 優先度2
3. **修正案4**: データベースでのキャンペーン名の比較の正規化
   - 既存データとの互換性を考慮

### 優先度3
4. **修正案2**: `update_unique_reach`エンドポイントでのキャンペーン名検索のURLエンコード
   - このエンドポイントが実際に使用されているか確認が必要

### 優先度4（将来的な改善）
5. **修正案5**: データベース保存時のキャンペーン名の正規化
   - 既存データとの互換性を考慮し、段階的に実装

---

## テスト方法

### 1. 正規化関数のテスト
```python
# テストケース
assert normalize_campaign_name("  ハイブリッドマーケティング  ") == "ハイブリッドマーケティング"
assert normalize_campaign_name("ハイブリッド　マーケティング") == "ハイブリッド マーケティング"
assert normalize_campaign_name("http://infinity111.net/ea/toshinavi/") == "http://infinity111.net/ea/toshinavi/"
```

### 2. マッピング処理のテスト
- 正規化前後のキャンペーン名でマッピングが正しく動作するか確認
- ログを確認して、正規化が正しく行われているか確認

### 3. データベース検索のテスト
- 正規化前後のキャンペーン名で検索が正しく動作するか確認
- 既存データとの互換性が保たれているか確認

---

## 注意事項

1. **既存データとの互換性**: 既存のデータベースに正規化されていないキャンペーン名が保存されている可能性があるため、後方互換性を考慮する必要がある

2. **パフォーマンス**: 正規化処理は軽量だが、大量のデータを処理する場合は影響を確認する

3. **ログ出力**: デバッグのために、正規化前後のキャンペーン名をログ出力することを推奨（ただし、本番環境では過度なログ出力を避ける）

4. **段階的な実装**: 一度にすべてを修正するのではなく、優先度の高いものから順に実装することを推奨

