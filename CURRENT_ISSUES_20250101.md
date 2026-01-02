# 現在の課題と問題点（2025-01-01）

## 問題点の概要

### 1. アセット選択時のフィルタリングが正しく動作していない

**現象：**
- `act_1167343552134169` (MIERU AI) を選択した時: `data length: 58` だが `filteredData count: 0`
- `act_343589077304936` を選択した時: `data length: 58` で `filteredData count: 2`（正常）
- `act_192642196222501` を選択した時: `data length: 58` だが `filteredData count: 0`
- `act_4056755244361151` を選択した時: `data length: 58` だが `filteredData count: 0`

**原因の可能性：**
- `dateFilteredData` に該当アセットのデータが含まれていない
- `meta_account_id` が一致していない（データに `meta_account_id` が正しく設定されていない）
- `filteredData` useMemo のフィルタリングロジックに問題がある

**ログから確認できること：**
```
Dashboard.tsx:1258 [Dashboard] selectedMetaAccountId: act_1167343552134169
Dashboard.tsx:1285 [Dashboard] Using allApiData (asset selected, will filter in filteredData): 58 records
Dashboard.tsx:1848 [Dashboard] filteredData count: 0
```

### 2. `availableCampaigns` がアセット選択を考慮していない

**現象：**
- どのアセットを選択しても、常に全11キャンペーンが表示される
- アセットにデータがない場合でも、全キャンペーンが表示される

**原因：**
- `availableCampaigns` の計算で `selectedMetaAccountId` でフィルタリングしていない
- `data` useMemo で全データ（58レコード）を使用しているため、アセット選択に関係なく全キャンペーンが表示される

**ログから確認できること：**
```
Dashboard.tsx:1372 [Dashboard] Using allApiData for campaigns (asset selected): 58 records
Dashboard.tsx:1419 [Dashboard] Unique campaigns (after Set): Array(11)
```

### 3. データソースの優先順位の問題

**現象：**
- `allApiData` が58レコードあるが、これは全アカウントのデータが混在している
- `data` useMemo で `allApiData` をそのまま使用しているため、アセット選択時に正しくフィルタリングされていない可能性

**現在の実装：**
```typescript
if (allApiData && allApiData.length > 0) {
  // allApiDataをそのまま使用（フィルタリングはfilteredData useMemoで行う）
  sourceData = allApiData;
  console.log('[Dashboard] Using allApiData (asset selected, will filter in filteredData):', sourceData.length, 'records');
}
```

**問題点：**
- `allApiData` をそのまま使用しているため、`dateFilteredData` には全アセットのデータが含まれる
- `filteredData` useMemo で `selectedMetaAccountId` でフィルタリングしているが、正しく動作していない

### 4. 不要なAPI呼び出し

**現象：**
- `loadMetaAccounts` がキャッシュから読み込まれているが、`useEffect` が複数回実行されている可能性
- アセット選択時に不要なAPI呼び出しが発生している可能性

### 5. `filteredData` useMemo の依存関係

**確認が必要：**
- `filteredData` useMemo の依存配列に `selectedMetaAccountId` が含まれているか
- `dateFilteredData` の内容（どのアセットのデータが含まれているか）

## 修正が必要な箇所

### 1. `data` useMemo の修正
- アセット選択時に `allApiData` を `selectedMetaAccountId` でフィルタリングする
- または、`dateFilteredData` の前にアセットフィルタリングを行う

### 2. `availableCampaigns` の修正
- `availableCampaigns` の計算で `selectedMetaAccountId` でフィルタリングする
- アセットにデータがない場合、空の配列を返す

### 3. `filteredData` useMemo の確認
- 依存配列に `selectedMetaAccountId` が含まれているか確認
- フィルタリングロジックが正しく動作しているか確認

### 4. データソースの優先順位の見直し
- `allApiData` を使用する場合、アセット選択時に事前にフィルタリングする
- または、`apiData` を優先的に使用する

## 現在の実装状態

### `data` useMemo（1253-1350行目付近）
- `allApiData` をそのまま使用
- アセット選択時にフィルタリングしていない
- `filteredData` useMemo でフィルタリングする想定

### `filteredData` useMemo（1619-1724行目付近）
- `dateFilteredData` を `selectedMetaAccountId` でフィルタリング
- 依存配列: `[dateFilteredData, selectedCampaign, selectedAdSet, selectedAd]`
- **問題**: `selectedMetaAccountId` が依存配列に含まれていない可能性

### `availableCampaigns` useMemo（1360-1431行目付近）
- `data` から全キャンペーンを抽出
- `selectedMetaAccountId` でフィルタリングしていない

## 次のステップ

1. `filteredData` useMemo の依存配列を確認
2. `dateFilteredData` の内容を確認（どのアセットのデータが含まれているか）
3. `data` useMemo でアセット選択時にフィルタリングするか、`filteredData` useMemo で正しくフィルタリングするかを決定
4. `availableCampaigns` の計算で `selectedMetaAccountId` でフィルタリングする

## コードの詳細確認

### `filteredData` useMemo の依存配列（1724行目付近）
```typescript
}, [dateFilteredData, selectedCampaign, selectedAdSet, selectedAd]);
```
**問題**: `selectedMetaAccountId` が依存配列に含まれていない！
- `selectedMetaAccountId` でフィルタリングしているが、依存配列に含まれていないため、`selectedMetaAccountId` が変更されても再計算されない可能性がある

### `availableCampaigns` useMemo の実装（1363-1434行目）
- アセット選択時: `allApiData` を使用（全58レコード）
- **問題**: `allApiData` をそのまま使用しているため、アセットでフィルタリングされていない
- 結果: 全11キャンペーンが常に表示される

### `data` useMemo の実装（1253-1360行目）
- アセット選択時: `allApiData` をそのまま使用
- **問題**: アセットでフィルタリングしていない
- 依存配列: `[propData, apiData, allApiData, selectedMetaAccountId, dateRange.start, dateRange.end]`
- `selectedMetaAccountId` は依存配列に含まれているが、フィルタリングロジックで使用していない

## バックアップ情報

- 作成日時: 2025-01-01
- 変更されたファイル:
  - `frontend/src/components/Dashboard.tsx`
  - `frontend/src/App.tsx`
  - `frontend/src/components/DailyData.tsx`
  - `frontend/src/components/Settings.tsx`
  - `frontend/src/services/api.ts`
  - `backend/app/routers/campaigns.py`
  - `backend/app/routers/meta_api.py`
  - `backend/app/schemas/campaign.py`
  - `backend/app/middleware/security.py`

## 修正の優先順位

1. **最優先**: `filteredData` useMemo の依存配列に `selectedMetaAccountId` を追加
2. **高**: `availableCampaigns` useMemo で `selectedMetaAccountId` でフィルタリング
3. **中**: `data` useMemo でアセット選択時にフィルタリングするか、`filteredData` useMemo で正しく動作するようにする
4. **低**: 不要なAPI呼び出しの削減

