# JST時間基準の使用状況調査レポート

## 調査目的
日次データ（全期間）、７日間、３０日間、全期間のすべてがJST時間0時を基準にしているか確認。
また、UTC時間や他の時間が使われていないか確認。

## 調査結果

### 1. フロントエンド（Dashboard.tsx）

#### ✅ JST基準で正しく実装されている箇所

1. **日付のパースとフォーマット**
   - `formatDateJST`: JST基準で日付文字列を生成（YYYY-MM-DD形式）
   - `parseDateJST`: JST基準（0時）で日付文字列をパース
   ```typescript
   const parseDateJST = (dateStr: string): Date => {
     const [year, month, day] = dateStr.split('-').map(Number);
     return new Date(year, month - 1, day); // ローカル時刻（JST）で作成
   };
   ```
   - **評価**: ✅ 正しく実装されている（ローカル時刻で作成されるため、JST環境ではJST基準）

2. **期間計算（7日間/30日間/全期間）**
   - Line 2177-2208: `kpiData`計算時の期間計算
   - Line 2962-3002: `campaignStats`計算時の期間計算
   ```typescript
   const now = new Date();
   const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
   const yesterday = new Date(today);
   yesterday.setDate(today.getDate() - 1);
   ```
   - **評価**: ✅ 正しく実装されている（ローカル時刻を使用しているため、JST環境ではJST基準）

3. **日付範囲のフィルタリング**
   - Line 2217-2224: 期間選択時の日付範囲フィルタリング
   - Line 2228-2235: 日別データ選択時の日付範囲フィルタリング
   - **評価**: ✅ 正しく実装されている（`parseDateJST`を使用してJST基準で比較）

#### ⚠️ 確認が必要な箇所

1. **`new Date()`の使用**
   - Line 533, 1029, 1088, 1098, 2177, 2962, 3281, 3323, 3371: `new Date()`を使用
   - Line 3415: `new Date()`を使用（CSVエクスポート時のファイル名）
   - **問題点**: `new Date()`はブラウザのタイムゾーンに依存する
   - **評価**: JST環境（日本）で実行されている場合は問題ないが、他のタイムゾーンで実行された場合に問題が発生する可能性がある
   - **推奨**: 明示的にJSTを使用するか、UTC基準で統一する

2. **`Date.now()`の使用**
   - Line 597, 618, 661, 709, 3486: `Date.now()`を使用（キャッシュのタイムスタンプ）
   - **問題点**: `Date.now()`はUTC基準のミリ秒を返す
   - **評価**: キャッシュのタイムスタンプとして使用されているため、日付計算には影響しない（問題なし）

### 2. バックエンド（campaigns.py）

#### ✅ JST基準で正しく実装されている箇所

1. **期間別サマリー取得（`get_campaign_summary`）**
   - Line 1439-1467: JST基準で期間を計算
   ```python
   from datetime import timezone
   jst = timezone(timedelta(hours=9))  # JST = UTC+9
   today_jst = datetime.now(jst).date()
   yesterday = today_jst - timedelta(days=1)
   ```
   - **評価**: ✅ 正しく実装されている（JSTを明示的に使用）

#### ⚠️ 問題がある箇所

1. **`date.today()`の使用**
   - Line 826: `today = datetime.now().date()` - サーバーのタイムゾーンに依存
   - Line 873, 875: `date.today()` - サーバーのタイムゾーンに依存
   - Line 1023, 1025: `date.today()` - サーバーのタイムゾーンに依存
   - Line 1074, 1076: `date.today()` - サーバーのタイムゾーンに依存
   - Line 1142: `date.today()` - サーバーのタイムゾーンに依存
   - Line 1207: `date.today()` - サーバーのタイムゾーンに依存
   - **問題点**: サーバーがUTCで実行されている場合、UTC基準の日付が使用される
   - **影響**: 日付範囲の計算がUTC基準になり、JST基準と最大9時間のずれが発生する可能性がある
   - **評価**: ❌ 修正が必要

2. **日付範囲のフィルタリング**
   - Line 649-650: クエリパラメータの説明に「JST 0時基準」と記載されているが、実際の処理でJSTを使用していない
   - Line 664-666: `start_date`と`end_date`のフィルタリング
   - **問題点**: データベースの`date`型はタイムゾーン情報を持たないため、保存時にUTC基準で保存されている場合、フィルタリングが正しく動作しない可能性がある
   - **評価**: ⚠️ 確認が必要

### 3. バックエンド（meta_api.py）

#### ✅ JST基準で正しく実装されている箇所

1. **Meta API同期処理（`sync_meta_data_to_campaigns`）**
   - Line 42-51: JST基準で昨日を計算
   ```python
   from datetime import timezone
   jst = timezone(timedelta(hours=9))  # JST = UTC+9
   current_jst = datetime.now(jst)
   today_jst = current_jst.date()
   yesterday = today_jst - timedelta(days=1)
   ```
   - **評価**: ✅ 正しく実装されている（JSTを明示的に使用）

2. **期間別ユニークリーチの取得**
   - Line 385-397: 7日間/30日間の期間計算（JST基準）
   - Line 688-700: 7日間/30日間の期間計算（JST基準、重複コード）
   - **評価**: ✅ 正しく実装されている（JST基準の`yesterday`を使用）

3. **Insights取得エンドポイント（`get_meta_insights`）**
   - Line 1760-1764: JST基準で昨日を計算
   - **評価**: ✅ 正しく実装されている（JSTを明示的に使用）

### 4. データベースへの保存

#### ⚠️ 確認が必要な箇所

1. **日付の保存**
   - Line 882: `campaign_date = datetime.strptime(date_str, '%Y-%m-%d').date()`
   - **問題点**: `date()`メソッドはタイムゾーン情報を削除するため、保存される日付は文字列から直接変換された日付になる
   - **評価**: Meta APIから取得した`date_start`はYYYY-MM-DD形式の文字列のため、タイムゾーンの問題は発生しない（問題なし）

## 問題点のまとめ

### 重大な問題

1. **バックエンドの`date.today()`使用箇所**
   - **場所**: `backend/app/routers/campaigns.py`
   - **影響**: サーバーがUTCで実行されている場合、日付範囲の計算がUTC基準になり、JST基準と最大9時間のずれが発生する
   - **修正が必要な箇所**:
     - Line 826: `today = datetime.now().date()` → JST基準に変更
     - Line 873, 875: `date.today()` → JST基準に変更
     - Line 1023, 1025: `date.today()` → JST基準に変更
     - Line 1074, 1076: `date.today()` → JST基準に変更
     - Line 1142: `date.today()` → JST基準に変更
     - Line 1207: `date.today()` → JST基準に変更

### 軽微な問題

1. **フロントエンドの`new Date()`使用箇所**
   - **場所**: `frontend/src/components/Dashboard.tsx`
   - **影響**: JST環境で実行されている場合は問題ないが、他のタイムゾーンで実行された場合に問題が発生する可能性がある
   - **推奨**: 明示的にJSTを使用するか、UTC基準で統一する

## 推奨される修正

### 1. バックエンドの`date.today()`をJST基準に変更

```python
# 修正前
today = datetime.now().date()
start_date = date.today() - timedelta(days=30)
end_date = date.today()

# 修正後
from datetime import timezone
jst = timezone(timedelta(hours=9))  # JST = UTC+9
today_jst = datetime.now(jst).date()
start_date = today_jst - timedelta(days=30)
end_date = today_jst
```

### 2. フロントエンドの`new Date()`を明示的にJST基準に変更（オプション）

```typescript
// 修正前
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// 修正後（オプション）
const now = new Date();
// JST環境では問題ないが、明示的にJSTを使用する場合は以下を使用
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
// または、UTC基準で統一する場合は以下を使用
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
```

## 確認事項

1. **サーバーのタイムゾーン設定**
   - バックエンドサーバーがUTCで実行されているか、JSTで実行されているかを確認
   - UTCで実行されている場合、`date.today()`の使用箇所を修正する必要がある

2. **データベースの日付保存形式**
   - データベースの`date`型はタイムゾーン情報を持たないため、保存時にUTC基準で保存されているか、JST基準で保存されているかを確認
   - Meta APIから取得した`date_start`はYYYY-MM-DD形式の文字列のため、タイムゾーンの問題は発生しない

3. **フロントエンドの実行環境**
   - フロントエンドがJST環境（日本）で実行されているか、他のタイムゾーンで実行されているかを確認
   - JST環境で実行されている場合は、`new Date()`の使用箇所は問題ない

## 結論

- **フロントエンド**: 基本的にJST基準で正しく実装されているが、`new Date()`の使用箇所がブラウザのタイムゾーンに依存している
- **バックエンド（meta_api.py）**: JST基準で正しく実装されている
- **バックエンド（campaigns.py）**: `date.today()`の使用箇所がサーバーのタイムゾーンに依存しているため、修正が必要

**優先度**: 高（バックエンドの`date.today()`使用箇所の修正）

