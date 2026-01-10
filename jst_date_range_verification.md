# JST時間0時基準での日付範囲計算の確認結果

## 問題の概要
- ハイブリッドマーケティング１の30日間のリーチ数（全体）が273、リーチ数（ユニーク）が1,507と大きく異なる
- 全期間のリーチ数（全体）が1,963、リーチ数（ユニーク）が1,970と近い値になっている
- 集計期間がおかしい可能性がある

## 確認結果

### 1. フロントエンドでの日付範囲計算

#### ✅ 問題あり: `new Date()`がブラウザのタイムゾーンに依存
- **場所**: `Dashboard.tsx` Line 2177-2182, 1030-1032, 1088-1091, 1098-1101
- **現在のコード**:
  ```typescript
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  ```
- **問題点**:
  - `new Date()`はブラウザのローカル時刻を使用するため、JST以外のタイムゾーンでは問題が発生する可能性がある
  - サーバーがUTCで動作している場合、ブラウザがJSTで動作していても、日付の計算がずれる可能性がある

#### ✅ 問題あり: リーチ数（全体）の計算時の日付範囲フィルタリング
- **場所**: `Dashboard.tsx` Line 2210-2225
- **現在のコード**:
  ```typescript
  if (currentPeriod === 'all') {
    // 全期間の場合は、日付範囲でフィルタリングしない（全期間のデータをそのまま使用）
    reachFilteredData = campaignLevelData;
  } else {
    // 7日間/30日間の場合は、日付範囲でフィルタリング
    const periodStart = parseDateJST(periodStartDate);
    const periodEnd = parseDateJST(periodEndDate);
    reachFilteredData = campaignLevelData.filter((d: CampaignData) => {
      if (!d.date) return false;
      const dataDate = parseDateJST(d.date);
      return dataDate >= periodStart && dataDate <= periodEnd;
    });
  }
  ```
- **問題点**:
  - リーチ数（全体）の計算時に、日付範囲でフィルタリングしている
  - しかし、リーチ数（ユニーク）は`period_unique_reach_30days`から直接取得しているため、日付範囲が一致していない可能性がある

#### ✅ 問題あり: リーチ数（全体）の計算が日次データの合計
- **場所**: `Dashboard.tsx` Line 2343付近
- **現在のコード**:
  ```typescript
  const totalReach = current.reduce((acc, curr) => acc + (curr.reach || 0), 0);
  ```
- **問題点**:
  - `current`は`reachFilteredData`から取得されているが、日付範囲でフィルタリングされている
  - 30日間の場合、`periodStartDate`から`periodEndDate`までの日次データを合計している
  - しかし、`period_unique_reach_30days`はMeta APIから取得した30日間のユニークリーチであり、日付範囲が一致していない可能性がある

### 2. バックエンドでの日付範囲計算

#### ✅ 問題なし: JST基準で計算されている
- **場所**: `meta_api.py` Line 70-75, 413-425, 721-733
- **現在のコード**:
  ```python
  jst = timezone(timedelta(hours=9))  # JST = UTC+9
  current_jst = datetime.now(jst)
  today_jst = current_jst.date()
  yesterday = today_jst - timedelta(days=1)
  ```
- **結論**: バックエンドではJST基準で正しく計算されている

#### ✅ 問題なし: 期間別ユニークリーチ取得時の日付範囲
- **場所**: `meta_api.py` Line 416-425
- **現在のコード**:
  ```python
  # 7日間: 昨日から6日前まで
  seven_days_ago_dt = yesterday_dt - timedelta(days=6)
  seven_days_ago_str = seven_days_ago_dt.strftime('%Y-%m-%d')
  time_range_7days_json = json.dumps({"since": seven_days_ago_str, "until": yesterday_str}, separators=(',', ':'))

  # 30日間: 昨日から29日前まで
  thirty_days_ago_dt = yesterday_dt - timedelta(days=29)
  thirty_days_ago_str = thirty_days_ago_dt.strftime('%Y-%m-%d')
  time_range_30days_json = json.dumps({"since": thirty_days_ago_str, "until": yesterday_str}, separators=(',', ':'))
  ```
- **結論**: バックエンドではJST基準で正しく計算されている

### 3. データベースからの取得時の日付範囲フィルタリング

#### ✅ 問題あり: `get_campaign_summary`エンドポイントでの日付範囲計算
- **場所**: `campaigns.py` Line 1474-1479
- **現在のコード**:
  ```python
  if period == "7days":
      start_date = yesterday - timedelta(days=6)
      end_date = yesterday
  elif period == "30days":
      start_date = yesterday - timedelta(days=29)
      end_date = yesterday
  ```
- **結論**: バックエンドではJST基準で正しく計算されている

## 問題の原因

### 1. フロントエンドでの日付計算がブラウザのタイムゾーンに依存
- `new Date()`はブラウザのローカル時刻を使用するため、JST以外のタイムゾーンでは問題が発生する可能性がある
- サーバーがUTCで動作している場合、ブラウザがJSTで動作していても、日付の計算がずれる可能性がある

### 2. リーチ数（全体）とリーチ数（ユニーク）の日付範囲が一致していない可能性
- リーチ数（全体）: フロントエンドで計算された日付範囲でフィルタリングされた日次データの合計
- リーチ数（ユニーク）: Meta APIから取得した期間別ユニークリーチ（`period_unique_reach_30days`）
- 日付範囲が一致していない場合、数値が大きく異なる可能性がある

### 3. 全期間の場合の日付範囲フィルタリング
- 全期間の場合、リーチ数（全体）は全期間の日次データを合計している
- しかし、リーチ数（ユニーク）は`period_unique_reach_all`から直接取得している
- 日付範囲が一致していない可能性がある

## 修正が必要な箇所

### 1. フロントエンドでの日付計算をJST基準に統一
- `new Date()`の代わりに、JST基準で日付を計算する関数を作成
- または、バックエンドからJST基準の日付範囲を取得する

### 2. リーチ数（全体）とリーチ数（ユニーク）の日付範囲を一致させる
- リーチ数（全体）の計算時に、Meta APIから取得した期間別ユニークリーチと同じ日付範囲を使用する
- または、リーチ数（ユニーク）の計算時に、リーチ数（全体）と同じ日付範囲を使用する

### 3. 全期間の場合の日付範囲を明確にする
- 全期間の場合、リーチ数（全体）とリーチ数（ユニーク）の日付範囲を一致させる
- 昨日までの全期間のデータを使用する

## 確認方法

### 1. フロントエンドでの日付計算を確認
- ブラウザのコンソールで、日付範囲の計算結果を確認
- JST基準で正しく計算されているか確認

### 2. バックエンドでの日付計算を確認
- ログを確認して、JST基準で正しく計算されているか確認

### 3. リーチ数（全体）とリーチ数（ユニーク）の日付範囲を確認
- フロントエンドとバックエンドのログを比較して、日付範囲が一致しているか確認

