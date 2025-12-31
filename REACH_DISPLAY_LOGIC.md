# ダッシュボードのリーチ数表示ロジック

## 現在の実装（2025-12-30時点）

### バックエンド（`backend/app/routers/campaigns.py`）

#### `get_summary`関数（850行目〜）

1. **初期値設定（931行目）**
   - `total_reach = total_reach_from_db` （DBの合算値）

2. **Meta APIからの取得条件（932行目）**
   - `if current_user.meta_access_token and meta_account_id:`
   - アクセストークンとアカウントIDがある場合のみ実行

3. **キャンペーンID取得（938-970行目）**
   - `campaign_name`が指定されている場合：
     - DBから`campaign_name`に一致するキャンペーンを検索（939-943行目）
     - DBに存在する場合のみ、Meta APIからキャンペーン一覧を取得（945-965行目）
     - キャンペーン一覧から`campaign_name`に一致するキャンペーンのIDを取得（967-970行目）
   - `campaign_name`が指定されていない場合：
     - `campaign_id = None`のまま

4. **リーチ数取得（987-1037行目）**
   - `campaign_id`が取得できた場合：
     - Meta APIの`/insights`エンドポイントから`reach`を取得
     - `time_increment`なしで期間全体のユニークリーチ数を取得
     - 広告セット/広告フィルタがある場合は、すべてのinsightsを取得してフィルタリング
     - 取得できた場合は`total_reach`を更新
   - `campaign_id`が取得できない場合（1038-1041行目）：
     - DBの合算値を使用（フォールバック）

5. **エラーハンドリング（1042-1045行目）**
   - 例外発生時はDBの合算値を使用

### フロントエンド（`frontend/src/components/Dashboard.tsx`）

#### `kpiData`の計算（1340行目〜）

1. **リーチ数の取得（1371行目付近）**
   ```typescript
   const totalReach = summaryData?.totals?.reach ?? current.reduce((acc, curr) => acc + (curr.reach || 0), 0);
   ```
   - `summaryData?.totals?.reach`を優先的に使用
   - `summaryData`が存在しない場合は、`filteredData`から合算

2. **`summaryData`の取得（698行目）**
   ```typescript
   Api.getCampaignSummary(dateRange.start, dateRange.end, metaAccountParam, campaignNameParam, adSetNameParam, adNameParam)
   ```
   - `campaignNameParam`は`selectedCampaign && selectedCampaign !== 'all' ? selectedCampaign : undefined`（693行目）

## 問題点

1. **DBに存在しないキャンペーンは取得できない**
   - 939-943行目でDBから検索し、存在しない場合はMeta APIを呼ばない
   - そのため、DBに存在しないキャンペーンのリーチ数は取得できない

2. **エラー時やキャンペーンID取得失敗時にDBの合算値を使用**
   - 1038-1041行目、1042-1045行目でDBの合算値にフォールバック
   - これにより、全てのキャンペーンで同じ数字（全キャンペーンの合計）が表示される可能性がある

3. **`campaign_name`が指定されていない場合の処理がない**
   - `campaign_name`が`None`の場合、Meta APIを呼ばずにDBの合算値を使用
   - これは意図的な動作（全体表示時）

## 修正が必要な箇所

1. **DB検索を削除し、直接Meta APIからキャンペーン一覧を取得**
   - 939-943行目のDB検索を削除
   - `campaign_name`が指定されている場合、直接Meta APIからキャンペーン一覧を取得

2. **エラー時やキャンペーンID取得失敗時に0を返す**
   - 1038-1041行目、1042-1045行目で0を返すように変更
   - DBの合算値は使わない


