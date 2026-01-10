# 期間別ユニークリーチの時間指定・期間指定の問題分析と修正案

## 問題の概要

期間別ユニークリーチ（`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`）が異なる値になる可能性があるということは、**時間指定や期間指定が間違っている可能性が高い**。

## 調査結果

### 1. バックエンドでの期間別ユニークリーチ取得時の時間範囲

#### ✅ 問題あり: 全期間のtime_rangeが異なる基準で計算されている可能性

**場所**: `meta_api.py` Line 428-429, 736-737

**現在のコード**:
```python
# 全期間: 既存のtime_rangeを使用
# time_range_encodedは既に計算済み
```

**問題点**:
- 7日間と30日間は、**昨日までの日付を使用**して計算されている（Line 413-426, 721-734）
- しかし、全期間の`time_range_encoded`は、**日次データ取得時に計算されたtime_rangeを使用**している（Line 210-214）
- 日次データ取得時のtime_rangeは、**開始日から昨日まで**（37ヶ月前から昨日まで）を計算している
- しかし、7日間と30日間は、**昨日から6日前/29日前まで**を計算している

**不一致の可能性**:
- 全期間のtime_range: `{"since": "2022-11-26", "until": "2025-01-08"}`（37ヶ月前から昨日まで）
- 7日間のtime_range: `{"since": "2025-01-02", "until": "2025-01-08"}`（昨日から6日前まで）
- 30日間のtime_range: `{"since": "2024-12-10", "until": "2025-01-08"}`（昨日から29日前まで）

**問題**:
- 全期間のtime_rangeは、**開始日から昨日まで**を計算している
- しかし、7日間と30日間は、**昨日からN日前まで**を計算している
- **全期間も昨日までに統一する必要がある**

#### ✅ 問題あり: 全期間のtime_rangeが日次データ取得時のtime_rangeを使用している

**場所**: `meta_api.py` Line 210-214, 428-429

**現在のコード**:
```python
# 日次データ取得時のtime_range計算
time_range_dict = {
    "since": start_date_str,  # 37ヶ月前
    "until": end_date_str      # 昨日
}
time_range_json = json.dumps(time_range_dict, separators=(',', ':'))

# 全期間のユニークリーチ取得時
# 全期間: 既存のtime_rangeを使用
# time_range_encodedは既に計算済み
```

**問題点**:
- 全期間のユニークリーチ取得時に、日次データ取得時のtime_rangeを使用している
- 日次データ取得時のtime_rangeは、**37ヶ月前から昨日まで**を計算している
- しかし、7日間と30日間は、**昨日からN日前まで**を計算している
- **全期間も昨日までに統一する必要がある**

### 2. JST基準での日付範囲計算

#### ✅ 問題なし: 7日間と30日間の計算
- **場所**: `meta_api.py` Line 416-426, 724-734
- **処理**:
  - JST基準で昨日を計算
  - 7日間: 昨日から6日前まで
  - 30日間: 昨日から29日前まで
  - **正しく計算されている**

#### ⚠️ 問題あり: 全期間の計算
- **場所**: `meta_api.py` Line 85-102, 210-214
- **処理**:
  - 日次データ取得時: 37ヶ月前から昨日まで
  - 全期間のユニークリーチ取得時: 日次データ取得時のtime_rangeを使用
  - **問題**: 全期間のユニークリーチ取得時も、**昨日までに統一する必要がある**

### 3. フロントエンドでの期間別ユニークリーチ取得

#### ⚠️ 問題あり: 日付範囲でフィルタリングしたデータから取得
- **場所**: `Dashboard.tsx` Line 3008-3032, 3135-3153
- **問題点**:
  - 期間選択（7日/30日/全期間）の場合、日付範囲でフィルタリングしたデータから`period_unique_reach`を取得
  - しかし、`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`は期間全体の値なので、日付範囲でフィルタリングする必要はない

## 根本原因

### 問題1: 全期間のtime_rangeが異なる基準で計算されている

**原因**:
- 全期間のユニークリーチ取得時に、日次データ取得時のtime_rangeを使用している
- 日次データ取得時のtime_rangeは、**37ヶ月前から昨日まで**を計算している
- しかし、7日間と30日間は、**昨日からN日前まで**を計算している
- **全期間も昨日までに統一する必要がある**

**影響**:
- 全期間のユニークリーチが、7日間や30日間と異なる期間で計算される可能性がある
- 同じキャンペーンの複数日付データで、異なる`period_unique_reach_all`が保存される可能性がある

### 問題2: フロントエンドでの日付範囲フィルタリング

**原因**:
- 期間選択（7日/30日/全期間）の場合、日付範囲でフィルタリングしたデータから`period_unique_reach`を取得
- しかし、`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`は期間全体の値なので、日付範囲でフィルタリングする必要はない

**影響**:
- 該当期間にデータがない日付のレコードが除外され、`period_unique_reach`が取得できない可能性がある

## 修正案

### 修正案1: 全期間のtime_rangeを昨日までに統一（最優先）

**場所**: `meta_api.py` Line 428-429, 736-737

**現在のコード**:
```python
# 全期間: 既存のtime_rangeを使用
# time_range_encodedは既に計算済み
```

**修正後のコード**:
```python
# 全期間: 昨日までの日付を使用（7日間・30日間と同じ基準）
# 日次データ取得時のtime_range（37ヶ月前から昨日まで）ではなく、
# 昨日までの日付を使用して計算
yesterday_dt = until_dt
yesterday_str = yesterday_dt.strftime('%Y-%m-%d')

# 全期間: 開始日から昨日まで
# ただし、Meta APIの最大取得期間（37ヶ月）を考慮
max_days_total = 1095  # 37ヶ月（1,095日）
since_dt = yesterday_dt - timedelta(days=max_days_total)
since_str = since_dt.strftime('%Y-%m-%d')

time_range_all_json = json.dumps({"since": since_str, "until": yesterday_str}, separators=(',', ':'))
time_range_all_encoded = urllib.parse.quote(time_range_all_json, safe='')

# 期間別のマップとtime_rangeのペア
period_configs = [
    ("7days", campaign_period_reach_7days_map, time_range_7days_encoded),
    ("30days", campaign_period_reach_30days_map, time_range_30days_encoded),
    ("all", campaign_period_reach_all_map, time_range_all_encoded)  # 修正: 新しく計算したtime_rangeを使用
]
```

### 修正案2: フロントエンドでの期間別ユニークリーチ取得方法を変更

**場所**: `Dashboard.tsx` Line 2406-2506, 3037-3081

**修正内容**:
- 期間選択（7日/30日/全期間）の場合、**日付範囲でフィルタリングする前のデータ**から`period_unique_reach`を取得
- 最初の値を使用（最大値ではなく）

### 修正案3: データベースに保存されている期間別ユニークリーチの確認

**確認方法**:
- 同じキャンペーンの複数日付データで、`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`が同じ値か確認
- 異なる値が存在する場合は、時間指定や期間指定が間違っている可能性が高い

## 修正の優先順位

### 優先度1（最優先）
1. **修正案1**: 全期間のtime_rangeを昨日までに統一
   - 7日間・30日間と同じ基準（昨日まで）で計算する
   - 日次データ取得時のtime_range（37ヶ月前から昨日まで）ではなく、昨日までの日付を使用

### 優先度2
2. **修正案2**: フロントエンドでの期間別ユニークリーチ取得方法を変更
   - 日付範囲でフィルタリングする前のデータから取得

### 優先度3
3. **修正案3**: データベースに保存されている期間別ユニークリーチの確認
   - 同じキャンペーンの複数日付データで、同じ値か確認

## 結論

**主な問題は、全期間のtime_rangeが異なる基準で計算されていることです。**

- 7日間と30日間は、**昨日からN日前まで**を計算している
- 全期間は、**日次データ取得時のtime_range（37ヶ月前から昨日まで）を使用**している
- **全期間も昨日までに統一する必要がある**

修正案1を実装することで、この問題を解決できます。

