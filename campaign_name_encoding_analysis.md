# キャンペーン名の特殊文字・URLエンコード処理の確認結果

## 確認内容
「キャンペーン名に特殊文字が含まれている場合、Meta APIの検索で一致しない可能性がある」という指摘について、コードを確認しました。

## 確認結果

### 1. Meta APIへのリクエスト時のキャンペーン名の扱い

#### ✅ 問題なし: キャンペーンIDを使用
- **場所**: `meta_api.py` Line 211, 436, 743
- **処理**: キャンペーン名ではなく、**キャンペーンID**を使用してリクエスト
  ```python
  relative_url = f"{campaign_id}/insights?fields={period_reach_fields}&time_range={period_time_range_encoded}&level=campaign&limit=100"
  ```
- **結論**: キャンペーン名がURLに含まれていないため、URLエンコードの問題は発生しない

#### ⚠️ 問題あり: `update_unique_reach`エンドポイントでのキャンペーン名検索
- **場所**: `meta_api.py` Line 2647
- **処理**: `filtering`パラメータでキャンペーン名を検索
  ```python
  "filtering": json.dumps([{"field": "name", "operator": "EQUAL", "value": campaign_name}])
  ```
- **問題点**: 
  - キャンペーン名がJSONとしてエンコードされているが、**URLエンコードされていない**
  - 特殊文字（日本語、URL、スペースなど）を含むキャンペーン名の場合、Meta APIの検索で一致しない可能性がある
  - 例: `http://infinity111.net/ea/toshinavi/` のようなURLを含むキャンペーン名

### 2. キャンペーン名のマッピング処理

#### ⚠️ 問題あり: 完全一致での比較
- **場所**: `meta_api.py` Line 474, 779, 1158-1160
- **処理**: 
  ```python
  # 期間別ユニークリーチ取得時
  period_map[campaign_name] = period_reach
  
  # 日次データ保存時のマッピング
  period_unique_reach_all = campaign_period_reach_all_map.get(campaign_name, 0)
  ```
- **問題点**:
  1. **Meta APIから取得したキャンペーン名**（`campaign.get('name', 'Unknown')`）と
  2. **日次データのキャンペーン名**（`insight.get('campaign_name', 'Unknown')`）が
  3. **完全一致で比較されている**
  
- **不一致が発生するケース**:
  - 前後のスペース: `"ハイブリッドマーケティング"` vs `" ハイブリッドマーケティング "`
  - 全角・半角の違い: `"ハイブリッドマーケティング"` vs `"ハイブリッドマーケティング"`（全角スペース）
  - 特殊文字のエンコーディング: URLを含むキャンペーン名（`http://infinity111.net/ea/toshinavi/`）の場合、エンコーディングの違い
  - Meta APIとデータベースでの保存時の違い

### 3. データベースでのキャンペーン名の比較

#### ⚠️ 問題あり: 完全一致での比較
- **場所**: `campaigns.py` Line 42, 889
- **処理**: 
  ```python
  Campaign.campaign_name == campaign_name
  ```
- **問題点**: 
  - 完全一致で比較しているため、前後のスペースや全角・半角の違いで一致しない

#### ✅ 部分一致を使用している箇所
- **場所**: `campaigns.py` Line 668
- **処理**: 
  ```python
  query = query.filter(Campaign.campaign_name.ilike(f"%{campaign_name}%"))
  ```
- **結論**: 部分一致を使用しているため、この箇所は問題なし

## 問題のまとめ

### 1. `update_unique_reach`エンドポイントでのキャンペーン名検索
- **問題**: キャンペーン名がURLエンコードされていない
- **影響**: 特殊文字を含むキャンペーン名でMeta APIの検索が失敗する可能性
- **修正が必要**: `filtering`パラメータのJSONをURLエンコードする必要がある

### 2. キャンペーン名のマッピング処理
- **問題**: 完全一致での比較により、前後のスペースや全角・半角の違いで不一致が発生
- **影響**: ユニークリーチが0になる
- **修正が必要**: キャンペーン名を正規化（前後のスペース削除、全角・半角の統一）してから比較する必要がある

### 3. データベースでのキャンペーン名の比較
- **問題**: 完全一致での比較により、前後のスペースや全角・半角の違いで不一致が発生
- **影響**: データが取得できない
- **修正が必要**: キャンペーン名を正規化してから比較する必要がある

## 確認方法

### 1. Meta API同期処理のログを確認
- 期間別ユニークリーチ取得時のキャンペーン名
- 日次データ保存時のキャンペーン名
- マッピング時のキャンペーン名が一致しているか

### 2. データベースの実際のデータを確認
```sql
-- 特定のキャンペーンのデータを確認（前後のスペースも含めて）
SELECT 
    campaign_name,
    LENGTH(campaign_name) as name_length,
    HEX(campaign_name) as name_hex,
    date,
    period_unique_reach_all
FROM campaigns
WHERE campaign_name LIKE '%toshinavi%' OR campaign_name LIKE '%ハイブリッドマーケティング%'
ORDER BY campaign_name, date;
```

### 3. キャンペーン名の正規化を確認
- 前後のスペースが削除されているか
- 全角・半角が統一されているか
- 特殊文字が正しくエンコードされているか

## 結論

**はい、キャンペーン名に特殊文字が含まれている場合、問題が発生する可能性があります。**

主な問題点：
1. **`update_unique_reach`エンドポイントでのキャンペーン名検索**: URLエンコードが必要
2. **キャンペーン名のマッピング処理**: 正規化が必要（前後のスペース削除、全角・半角の統一）
3. **データベースでのキャンペーン名の比較**: 正規化が必要

特に、URLを含むキャンペーン名（`http://infinity111.net/ea/toshinavi/`）や、日本語を含むキャンペーン名（`ハイブリッドマーケティング`）の場合、エンコーディングや正規化の問題により、キャンペーン名の不一致が発生しやすいです。

