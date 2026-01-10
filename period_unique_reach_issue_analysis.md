# 7日、30日、全期間のユニークリーチ取得の問題分析と修正案

## 問題の概要

1. 7日、30日、全期間のユニークリーチの取得が正しく反映されていない
2. これらの期間のユニークリーチは、その期間で検索すると1つしか出ない数字であるべき
3. その数字を反映するだけのシンプルなロジックなのに、正しく動作していない
4. JST 0時を起点として集計できているかも確認が必要

## 調査結果

### 1. バックエンドでの期間別ユニークリーチ取得

#### ✅ 問題なし: Meta APIからの取得ロジック
- **場所**: `meta_api.py` Line 416-426, 464, 498-508
- **処理**:
  - 7日間: 昨日から6日前まで（JST基準）
  - 30日間: 昨日から29日前まで（JST基準）
  - 全期間: 開始日から昨日まで（JST基準）
  - `time_increment`なしで期間全体の集計データ（1件）を取得
  - `period_insights[0]`から`reach`を取得
  - 正規化されたキャンペーン名でマップに保存

#### ⚠️ 問題あり: データベースへの保存
- **場所**: `meta_api.py` Line 1214-1216, 1276-1278
- **問題点**:
  - 期間別のマップから取得して`period_unique_reach_7days`, `period_unique_reach_30days`, `period_unique_reach_all`に保存
  - しかし、**日次データの各レコードに同じ値を保存している**
  - 同じキャンペーンの複数日付データに、同じ`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`が保存される
  - これは正しい動作だが、フロントエンドでの取得方法に問題がある可能性がある

### 2. フロントエンドでの期間別ユニークリーチ表示

#### ⚠️ 問題あり: 複数日付データから最大値を使用
- **場所**: `Dashboard.tsx` Line 2452-2495, 3048-3061
- **現在のコード**:
  ```typescript
  const reachValues: number[] = [];
  for (const record of campaignFilteredData) {
    const reachValue = currentPeriod === '7days' ? record.period_unique_reach_7days :
                      currentPeriod === '30days' ? record.period_unique_reach_30days :
                      record.period_unique_reach_all || record.period_unique_reach;
    if (reachValue && reachValue > 0) {
      reachValues.push(reachValue);
    }
  }
  if (reachValues.length > 0) {
    totalUniqueReach = Math.max(...reachValues);
  }
  ```
- **問題点**:
  - 同じキャンペーンの複数日付データから`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`を取得
  - 最大値を使用しているが、**同じ値のはずなので、最初の値を使用すれば十分**
  - データの不整合を考慮して最大値を使用しているが、これが問題の原因ではない
  - **本当の問題は、データベースから正しい値が取得できていない可能性がある**

#### ⚠️ 問題あり: 日付範囲でフィルタリングしたデータから取得
- **場所**: `Dashboard.tsx` Line 3008-3032, 3135-3153
- **問題点**:
  - 期間選択（7日/30日/全期間）の場合、日付範囲でフィルタリングしたデータから`period_unique_reach`を取得
  - しかし、`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`は**期間全体の値**なので、日付範囲でフィルタリングする必要はない
  - 日付範囲でフィルタリングすると、該当期間にデータがない日付のレコードが除外され、`period_unique_reach`が取得できない可能性がある

### 3. JST基準での日付範囲計算

#### ✅ 問題なし: バックエンドでのJST基準計算
- **場所**: `meta_api.py` Line 70-75, 413-426, 721-734
- **処理**:
  - JST基準で昨日を計算
  - 7日間: 昨日から6日前まで
  - 30日間: 昨日から29日前まで
  - 全期間: 開始日から昨日まで

#### ⚠️ 問題あり: フロントエンドでの日付範囲計算
- **場所**: `Dashboard.tsx` Line 2172-2223, 2956-2993
- **問題点**:
  - フロントエンドでもJST基準で日付範囲を計算しているが、**リーチ数（ユニーク）の取得時に日付範囲でフィルタリングしている**
  - `period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`は期間全体の値なので、日付範囲でフィルタリングする必要はない

## 根本原因

### 問題1: 日付範囲でフィルタリングしたデータから期間別ユニークリーチを取得している
- **原因**: `period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`は期間全体の値なので、日付範囲でフィルタリングする必要はない
- **影響**: 該当期間にデータがない日付のレコードが除外され、`period_unique_reach`が取得できない可能性がある

### 問題2: 複数日付データから最大値を使用している
- **原因**: データの不整合を考慮して最大値を使用しているが、同じ値のはずなので、最初の値を使用すれば十分
- **影響**: データの不整合がある場合、最大値が正しくない可能性がある

### 問題3: データベースから正しい値が取得できていない可能性
- **原因**: キャンペーン名の正規化により、マッピングが失敗している可能性がある
- **影響**: `period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`が0になる

## 修正案

### 修正案1: 期間別ユニークリーチの取得方法を変更

#### 問題
- 日付範囲でフィルタリングしたデータから`period_unique_reach`を取得している
- 該当期間にデータがない日付のレコードが除外され、`period_unique_reach`が取得できない可能性がある

#### 修正内容
- **場所**: `Dashboard.tsx` Line 2406-2506, 3037-3081
- **修正**:
  - 期間選択（7日/30日/全期間）の場合、**日付範囲でフィルタリングする前のデータ**から`period_unique_reach`を取得
  - または、**キャンペーンレベルのデータから、日付範囲に関係なく`period_unique_reach`を取得**

#### 修正コード例
```typescript
// 期間選択（7日/30日/全期間）の場合
if (currentPeriod) {
  // 日付範囲でフィルタリングする前のデータから期間別ユニークリーチを取得
  // period_unique_reach_7days、period_unique_reach_30days、period_unique_reach_allは期間全体の値なので、
  // 日付範囲でフィルタリングする必要はない
  const campaignFilteredData = campaignNameParam 
    ? campaignLevelData.filter(d => d.campaign_name === campaignNameParam)
    : campaignLevelData;
  
  // 期間に応じたフィールドから値を取得（日付範囲でフィルタリングしない）
  const reachValues: number[] = [];
  for (const record of campaignFilteredData) {
    const reachValue = currentPeriod === '7days' ? record.period_unique_reach_7days :
                      currentPeriod === '30days' ? record.period_unique_reach_30days :
                      record.period_unique_reach_all || record.period_unique_reach;
    
    if (reachValue && reachValue > 0) {
      reachValues.push(reachValue);
      // 同じ値のはずなので、最初の値が見つかったら終了
      break;
    }
  }
  
  if (reachValues.length > 0) {
    totalUniqueReach = reachValues[0]; // 最大値ではなく、最初の値を使用
  }
}
```

### 修正案2: データベースから正しい値が取得できているか確認

#### 問題
- キャンペーン名の正規化により、マッピングが失敗している可能性がある
- `period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`が0になる

#### 修正内容
- **場所**: `meta_api.py` Line 1214-1216, 1276-1278
- **修正**:
  - マッピングが見つからない場合のデバッグログを追加
  - 正規化前後の両方の名前で検索（既に実装済み）

### 修正案3: JST基準での日付範囲計算の確認

#### 問題
- フロントエンドとバックエンドで日付範囲が一致しているか確認が必要

#### 修正内容
- **確認**:
  - バックエンド: JST基準で昨日から6日前/29日前まで計算（✅ 正しい）
  - フロントエンド: JST基準で昨日から6日前/29日前まで計算（✅ 正しい）
  - **ただし、リーチ数（ユニーク）の取得時に日付範囲でフィルタリングしているのが問題**

## 修正の優先順位

### 優先度1（最優先）
1. **修正案1**: 期間別ユニークリーチの取得方法を変更
   - 日付範囲でフィルタリングする前のデータから`period_unique_reach`を取得
   - 最初の値を使用（最大値ではなく）

### 優先度2
2. **修正案2**: データベースから正しい値が取得できているか確認
   - マッピングが見つからない場合のデバッグログを追加

### 優先度3
3. **修正案3**: JST基準での日付範囲計算の確認
   - 既に正しく実装されているが、リーチ数（ユニーク）の取得時に日付範囲でフィルタリングしているのが問題

## 結論

**主な問題は、期間別ユニークリーチの取得時に日付範囲でフィルタリングしていることです。**

`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`は期間全体の値なので、日付範囲でフィルタリングする必要はありません。日付範囲でフィルタリングすると、該当期間にデータがない日付のレコードが除外され、`period_unique_reach`が取得できない可能性があります。

修正案1を実装することで、この問題を解決できます。

