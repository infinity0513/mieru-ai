# リーチ数と他の項目の取得条件比較

## 1. 日次データ取得（他の項目：インプレッション、クリック数、費用など）

### 取得条件
- **場所**: `backend/app/routers/meta_api.py` Line 214-245
- **fields**: `campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency`
- **time_range**: 全期間（`current_since_dt`から`current_until_dt`まで）
- **time_increment**: `1`（日次データを取得）
- **level**: `campaign`（キャンペーンレベルのみ）
- **limit**: `100`

### 取得URL例
```
{campaign_id}/insights?fields={campaign_fields}&time_range={time_range_encoded}&time_increment=1&level=campaign&limit=100
```

### 取得されるデータ
- 日次データ（各日付ごとのデータ）
- 複数の日付のデータが返される（例：2024-01-01, 2024-01-02, ...）
- 各日付ごとに`reach`も含まれるが、これは**日次リーチ数**（重複を含む）

### データの使用
- 日次データとして保存
- `reach`フィールドは**リーチ数全体（日別データの合計）**として使用

---

## 2. 期間別ユニークリーチ取得（リーチ数ユニーク）

### 取得条件
- **場所**: `backend/app/routers/meta_api.py` Line 416-540
- **fields**: `campaign_id,campaign_name,reach`（`reach`のみ）
- **time_range**: 
  - 7日間: `current_until_dt`から6日前まで
  - 30日間: `current_until_dt`から29日前まで
  - 全期間: `current_since_dt`から`current_until_dt`まで
- **time_increment**: **指定なし**（期間全体の集計データを取得）
- **level**: `campaign`（キャンペーンレベルのみ）
- **limit**: `100`

### 取得URL例
```
{campaign_id}/insights?fields=campaign_id,campaign_name,reach&time_range={time_range_encoded}&level=campaign&limit=100
```

### 取得されるデータ
- 期間全体の集計データ（1件のみ）
- `time_increment`がないため、期間全体のユニークリーチ数が1つの値として返される
- 7日間、30日間、全期間でそれぞれ別々に取得

### データの使用
- `period_unique_reach_7days`, `period_unique_reach_30days`, `period_unique_reach_all`として保存
- **リーチ数ユニーク（期間別で取得した1つの数字）**として使用

---

## 3. 主な違い

### 3.1. fieldsパラメータ
| 項目 | 日次データ取得 | 期間別ユニークリーチ取得 |
|------|---------------|------------------------|
| fields | 全フィールド（12個） | `reach`のみ（3個） |
| 取得フィールド | `campaign_id,campaign_name,date_start,spend,impressions,clicks,inline_link_clicks,reach,actions,conversions,action_values,frequency` | `campaign_id,campaign_name,reach` |

### 3.2. time_incrementパラメータ
| 項目 | 日次データ取得 | 期間別ユニークリーチ取得 |
|------|---------------|------------------------|
| time_increment | `1`（日次データ） | **指定なし**（期間全体の集計） |
| 返されるデータ数 | 複数（日付ごと） | 1件（期間全体） |

### 3.3. time_rangeパラメータ
| 項目 | 日次データ取得 | 期間別ユニークリーチ取得 |
|------|---------------|------------------------|
| time_range | 全期間（1回のリクエスト） | 7日間、30日間、全期間（3回のリクエスト） |
| 取得回数 | 1回 | 3回（各期間ごと） |

### 3.4. 取得されるデータの性質
| 項目 | 日次データ取得 | 期間別ユニークリーチ取得 |
|------|---------------|------------------------|
| データ形式 | 日次データ（複数件） | 期間全体の集計（1件） |
| reachの意味 | 日次リーチ数（重複を含む） | 期間全体のユニークリーチ数（重複なし） |
| 使用目的 | リーチ数全体（日別データの合計） | リーチ数ユニーク（期間別で取得した1つの数字） |

---

## 4. 取得フロー

### 4.1. 日次データ取得フロー
```
1. 全キャンペーンを取得
2. バッチ処理（50件ずつ）
3. 各キャンペーンに対して：
   - fields: 全フィールド
   - time_range: 全期間
   - time_increment: 1
   - level: campaign
4. 日次データを取得（複数件）
5. ページネーション処理
6. すべての日次データを`all_insights`に追加
```

### 4.2. 期間別ユニークリーチ取得フロー
```
1. 全キャンペーンを取得（日次データ取得時と同じ）
2. 各期間（7日間、30日間、全期間）に対して：
   a. バッチ処理（50件ずつ）
   b. 各キャンペーンに対して：
      - fields: campaign_id,campaign_name,reach
      - time_range: 期間別（7日間/30日間/全期間）
      - time_increment: なし
      - level: campaign
   c. 期間全体の集計データを取得（1件）
   d. マップに保存（campaign_name -> unique_reach）
3. 3つのマップを作成：
   - campaign_period_reach_7days_map
   - campaign_period_reach_30days_map
   - campaign_period_reach_all_map
```

---

## 5. データ保存時の処理

### 5.1. 日次データ保存時（Line 766-1114）
```python
for insight in all_insights:
    # 日次データから各項目を取得
    spend = safe_float(insight.get('spend'), 0.0)
    impressions = safe_int(insight.get('impressions'), 0)
    clicks = safe_int(insight.get('clicks'), 0)
    reach = safe_int(insight.get('reach'), 0)  # 日次リーチ数
    
    # 期間別ユニークリーチをマップから取得
    period_unique_reach_7days = campaign_period_reach_7days_map.get(campaign_name, 0)
    period_unique_reach_30days = campaign_period_reach_30days_map.get(campaign_name, 0)
    period_unique_reach_all = campaign_period_reach_all_map.get(campaign_name, 0)
    
    # データベースに保存
    campaign = Campaign(
        reach=reach,  # 日次リーチ数
        period_unique_reach_7days=period_unique_reach_7days,
        period_unique_reach_30days=period_unique_reach_30days,
        period_unique_reach_all=period_unique_reach_all,
        # ... 他のフィールド
    )
```

---

## 6. 問題点の可能性

### 6.1. キャンペーン名の正規化
- **日次データ取得時**: `campaign_name`はMeta APIから取得したまま
- **期間別ユニークリーチ取得時**: `normalize_campaign_name(campaign_name_raw)`で正規化
- **データ保存時**: `normalize_campaign_name(campaign_name_raw)`で正規化
- **マッチング**: 正規化されたキャンペーン名でマップから取得

**潜在的な問題**: 正規化が一致していない場合、マップから取得できない可能性がある

### 6.2. エラーハンドリング
- **日次データ取得時**: エラーが発生しても次のバッチの処理を続行
- **期間別ユニークリーチ取得時**: エラーが発生しても次のバッチの処理を続行
- **マップへの保存**: エラーが発生した場合、マップには0が設定されない（既存の値があれば保持）

**潜在的な問題**: エラーが発生した場合、マップに値が設定されず、データ保存時に0が使用される可能性がある

### 6.3. 日付範囲の計算
- **日次データ取得時**: `current_since_dt`から`current_until_dt`まで（JST基準）
- **期間別ユニークリーチ取得時**: 
  - 7日間: `current_until_dt`から6日前まで
  - 30日間: `current_until_dt`から29日前まで
  - 全期間: `current_since_dt`から`current_until_dt`まで

**確認済み**: 日次データ取得時と同じ`current_until_dt`を使用しているため、日付範囲の計算は一致している

---

## 7. まとめ

### リーチ数と他の項目の取得条件の違い

1. **fields**: 日次データは全フィールド、期間別ユニークリーチは`reach`のみ
2. **time_increment**: 日次データは`1`、期間別ユニークリーチは指定なし
3. **time_range**: 日次データは全期間（1回）、期間別ユニークリーチは3回（7日間/30日間/全期間）
4. **取得回数**: 日次データは1回、期間別ユニークリーチは3回
5. **データ形式**: 日次データは複数件、期間別ユニークリーチは1件（期間全体の集計）

### 設計意図

- **リーチ数全体**: 日次データの`reach`フィールドを合計（日別データの合計）
- **リーチ数ユニーク**: 期間別で取得した1つの数字（重複なし）

この設計は、Meta APIの仕様に基づいており、正しい実装です。

