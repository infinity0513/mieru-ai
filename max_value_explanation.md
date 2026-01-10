# 「最大値」についての説明

## 質問
「この最大値ってなに？期間別だとそもそも数字が１つしかないから最大値もクソもないんだが。」

## 回答

**その通りです。期間別ユニークリーチは1つの値しかないので、最大値を使う必要はありません。**

## 現在のコードの問題

### 問題箇所1: `Dashboard.tsx` Line 2495
```typescript
if (reachValues.length > 0) {
  // 最大値を使用（同じキャンペーンの同じ期間のperiod_unique_reachは同じ値のはずだが、データの不整合を考慮）
  totalUniqueReach = Math.max(...reachValues);
}
```

### 問題箇所2: `Dashboard.tsx` Line 3061
```typescript
if (reachValues.length > 0) {
  // 最大値を使用（同じキャンペーンの同じ期間のperiod_unique_reachは同じ値のはずだが、データの不整合を考慮）
  totalUniqueReach = Math.max(...reachValues);
}
```

### 問題箇所3: `Dashboard.tsx` Line 2541, 3168
同様に`Math.max(...reachValues)`を使用

## なぜ「最大値」を使っているのか

### コードの意図（誤った前提）
- コメントには「データの不整合を考慮して最大値を使用」と書かれている
- 同じキャンペーンの複数日付データで、`period_unique_reach_7days`などが異なる値を持つ可能性を考慮している

### 実際の動作
1. **バックエンドでの取得**: Meta APIから期間別ユニークリーチを取得（1つの値のみ）
2. **データベースへの保存**: 同じキャンペーンのすべての日次データレコードに、同じ`period_unique_reach_7days`、`period_unique_reach_30days`、`period_unique_reach_all`を保存
3. **フロントエンドでの取得**: 同じキャンペーンの複数日付データから`period_unique_reach_7days`などを取得
4. **問題**: すべて同じ値のはずなのに、`Math.max(...reachValues)`で最大値を取得している

## なぜ「最大値」は不要か

### 理由1: 期間別ユニークリーチは1つの値しかない
- `period_unique_reach_7days`: 7日間のユニークリーチ（1つの値）
- `period_unique_reach_30days`: 30日間のユニークリーチ（1つの値）
- `period_unique_reach_all`: 全期間のユニークリーチ（1つの値）

### 理由2: 同じキャンペーンのすべての日次データレコードに同じ値が保存される
- バックエンドで、同じキャンペーンのすべての日次データレコードに、同じ`period_unique_reach_7days`などを保存
- したがって、同じキャンペーンの複数日付データから取得した`period_unique_reach_7days`などは、すべて同じ値であるはず

### 理由3: データの不整合がある場合は警告を出すだけで十分
- もし異なる値が存在する場合は、警告を出すだけで十分
- 最大値を使う必要はない（最初の値を使用すればよい）

## 正しい実装

### 修正案
```typescript
// 期間に応じたフィールドから値を取得
for (const record of campaignFilteredData) {
  const reachValue = currentPeriod === '7days' ? record.period_unique_reach_7days :
                    currentPeriod === '30days' ? record.period_unique_reach_30days :
                    record.period_unique_reach_all || record.period_unique_reach;
  
  if (reachValue && reachValue > 0) {
    totalUniqueReach = reachValue; // 最初の値を使用（最大値ではなく）
    break; // 同じ値のはずなので、最初の値が見つかったら終了
  }
}
```

## 結論

**「最大値」は不要です。期間別ユニークリーチは1つの値しかないので、最初の値（または任意の値）を使用すれば十分です。**

現在のコードでは、`Math.max(...reachValues)`を使っていますが、これは不要な処理です。同じ値のはずなので、最初の値を使用すれば十分です。

もしデータの不整合がある場合は、警告を出すだけで十分で、最大値を使う必要はありません。

