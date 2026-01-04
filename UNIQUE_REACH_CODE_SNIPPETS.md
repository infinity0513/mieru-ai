# ユニークリーチ取得・表示ロジックの該当コード

## 問題
- `period_unique_reach`がデータベースに常に0として保存されている
- フロントエンドでユニークリーチが0のまま表示されている

## バックエンド: period_unique_reach取得部分

### ファイル: `backend/app/routers/meta_api.py`

#### 1. 期間全体のユニークリーチ数を取得（599-683行目）

```python
# ===== 期間全体のユニークリーチ数を取得（キャンペーンレベルのみ） =====
print(f"[Meta API] Fetching period unique reach for campaign-level data...")
campaign_period_reach_map = {}  # キャンペーン名 -> 期間全体のユニークリーチ数

# キャンペーンレベルのデータのみを対象（ad_set_nameとad_nameが空のデータ）
# all_campaignsからキャンペーンIDと名前を取得
campaign_level_campaigns = [c for c in all_campaigns]

if len(campaign_level_campaigns) > 0:
    # バッチ処理で期間全体のユニークリーチ数を取得
    batch_size = 50  # Meta APIのバッチリクエスト最大数
    for batch_start in range(0, len(campaign_level_campaigns), batch_size):
        batch_end = min(batch_start + batch_size, len(campaign_level_campaigns))
        batch_campaigns = campaign_level_campaigns[batch_start:batch_end]
        batch_num = (batch_start // batch_size) + 1
        total_batches = (len(campaign_level_campaigns) + batch_size - 1) // batch_size
        
        print(f"[Meta API] Processing period unique reach batch {batch_num}/{total_batches} ({len(batch_campaigns)} campaigns)")
        
        batch_requests = []
        for campaign in batch_campaigns:
            campaign_id = campaign.get('id')
            campaign_name = campaign.get('name', 'Unknown')
            # 期間全体のユニークリーチ数を取得（time_incrementなしで期間全体の集計データを取得）
            # period_unique_reach, unique_reach, reachの順で試す
            period_reach_fields = "campaign_id,campaign_name,period_unique_reach,unique_reach,reach"
            time_range_encoded = urllib.parse.quote(time_range_json, safe='')
            # time_incrementを指定しないことで、期間全体の集計データ（1件）を取得
            relative_url = f"{campaign_id}/insights?fields={period_reach_fields}&time_range={time_range_encoded}&level=campaign&limit=100"
            batch_requests.append({
                "method": "GET",
                "relative_url": relative_url
            })
        
        try:
            batch_response = await client.post(batch_url, params={
                "access_token": access_token,
                "batch": json.dumps(batch_requests, separators=(',', ':'))
            })
            batch_response.raise_for_status()
            batch_data = batch_response.json()
            
            for idx, batch_item in enumerate(batch_data):
                campaign = batch_campaigns[idx]
                campaign_name = campaign.get('name', 'Unknown')
                
                if batch_item.get('code') == 200:
                    try:
                        item_body = json.loads(batch_item.get('body', '{}'))
                        period_insights = item_body.get('data', [])
                        if period_insights:
                            # time_incrementなしの場合、期間全体のデータは1件のみ
                            insight_data = period_insights[0]
                            
                            # デバッグ: 利用可能なフィールドを確認
                            available_fields = list(insight_data.keys())
                            print(f"[Meta API] Available fields for '{campaign_name}': {available_fields}")
                            
                            # フィールドの優先順位: period_unique_reach > unique_reach > reach
                            period_unique_reach_value = insight_data.get('period_unique_reach')
                            unique_reach_value = insight_data.get('unique_reach')
                            reach_value = insight_data.get('reach', '0')
                            
                            # デバッグ: 各フィールドの値を確認
                            print(f"[Meta API] Field values for '{campaign_name}': period_unique_reach={period_unique_reach_value}, unique_reach={unique_reach_value}, reach={reach_value}")
                            
                            # 優先順位で使用
                            if period_unique_reach_value is not None and safe_int(period_unique_reach_value, 0) > 0:
                                period_reach = safe_int(period_unique_reach_value, 0)
                                print(f"[Meta API] Using 'period_unique_reach' for '{campaign_name}': {period_reach:,}")
                            elif unique_reach_value is not None and safe_int(unique_reach_value, 0) > 0:
                                period_reach = safe_int(unique_reach_value, 0)
                                print(f"[Meta API] Using 'unique_reach' for '{campaign_name}': {period_reach:,}")
                            else:
                                period_reach = safe_int(reach_value, 0)
                                print(f"[Meta API] Using 'reach' for '{campaign_name}': {period_reach:,}")
                            
                            campaign_period_reach_map[campaign_name] = period_reach
                            print(f"[Meta API] Period unique reach for '{campaign_name}': {period_reach:,}")
                        else:
                            print(f"[Meta API] ⚠️ No period reach data for '{campaign_name}' (empty data array)")
                            # エラー時は0を設定せず、前回の値を保持（campaign_period_reach_mapに設定しない）
                    except json.JSONDecodeError as e:
                        print(f"[Meta API] Error parsing period reach response for {campaign_name}: {str(e)}")
                        print(f"[Meta API] Response body: {batch_item.get('body', '{}')}")
                        # エラー時は0を設定せず、前回の値を保持（campaign_period_reach_mapに設定しない）
                else:
                    error_body = batch_item.get('body', '{}')
                    try:
                        error_data = json.loads(error_body) if isinstance(error_body, str) else error_body
                        error_msg = error_data.get('error', {}).get('message', str(error_body))
                        print(f"[Meta API] Error fetching period reach for {campaign_name}: {error_msg}")
                    except:
                        print(f"[Meta API] Error fetching period reach for {campaign_name}: {error_body}")
                    # エラー時は0を設定せず、前回の値を保持（campaign_period_reach_mapに設定しない）
```

#### 2. period_unique_reach保存部分（1009-1053行目）

```python
# 期間全体のユニークリーチ数を取得（キャンペーンレベルのデータのみ）
# time_incrementなしで取得したreachフィールドをperiod_unique_reachとして使用
period_unique_reach = 0
if not ad_set_name and not ad_name:  # キャンペーンレベルのデータのみ
    # campaign_period_reach_mapから取得（time_incrementなしで取得したreach）
    period_unique_reach_from_map = campaign_period_reach_map.get(campaign_name, 0)
    # period_unique_reach_from_mapが0より大きい場合はそれを使用
    if period_unique_reach_from_map > 0:
        period_unique_reach = period_unique_reach_from_map
    # period_unique_reach_from_mapが0の場合でも、日次のreachが0より大きい場合はそれを使用（フォールバック）
    elif reach > 0:
        period_unique_reach = reach
        print(f"[Meta API] Using daily reach as period_unique_reach (fallback) for '{campaign_name}': {period_unique_reach:,}")

# 既存データがある場合の処理
if existing_campaign:
    # キャンペーンレベルのデータで、period_unique_reachが0より大きい場合は更新
    if not ad_set_name and not ad_name:
        if period_unique_reach > 0:
            # APIから取得した値が0より大きい場合は常に更新
            existing_campaign.period_unique_reach = period_unique_reach
            db.commit()
            print(f"[Meta API] Updated period_unique_reach for existing record: {campaign_name} on {campaign_date} -> {period_unique_reach:,}")
        else:
            print(f"[Meta API] Skipping existing record (period_unique_reach is 0): {campaign_name} on {campaign_date}")
    else:
        print(f"[Meta API] Skipping existing record: {campaign_name} / {ad_set_name} / {ad_name} on {campaign_date}")
    continue

# 新規作成（既存データがない場合のみ）
campaign = Campaign(
    user_id=user.id,
    upload_id=upload.id,
    meta_account_id=account_id,
    date=campaign_date,
    campaign_name=campaign_name,
    ad_set_name=ad_set_name,
    ad_name=ad_name,
    cost=Decimal(str(spend)),
    impressions=impressions,
    clicks=clicks,
    conversions=conversions,
    conversion_value=Decimal(str(conversion_value)),
    reach=reach,
    period_unique_reach=period_unique_reach,  # 期間全体のユニークリーチ数
    engagements=engagements,
    link_clicks=link_clicks,
    landing_page_views=landing_page_views,
    # ... その他のフィールド
)
```

## フロントエンド: ユニークリーチ表示部分

### ファイル: `frontend/src/components/Dashboard.tsx`

#### 1. loadSummaryOnly（750-785行目）

```typescript
// リーチ数の計算: period_unique_reachを優先的に使用（0より大きい場合のみ）
// キャンペーンごとにperiod_unique_reachを取得し、複数キャンペーンの場合は合計（重複排除は困難なため、近似値として合計）
// period_unique_reachは期間全体のユニークリーチ数なので、同じキャンペーンの複数日付データでは同じ値のはず
const campaignReachMap = new Map<string, number>();
filteredData.forEach(d => {
  const campaignKey = d.campaign_name || 'unknown';
  // period_unique_reachが存在し、0より大きい場合のみ使用
  if (d.period_unique_reach && d.period_unique_reach > 0) {
    // period_unique_reachが設定されている場合は、最初に見つかった値を使用
    if (!campaignReachMap.has(campaignKey)) {
      campaignReachMap.set(campaignKey, d.period_unique_reach);
    }
  }
});

// period_unique_reachが未設定または0のキャンペーンについては、日次のreachの合計を使用（フォールバック）
const campaignDailyReachMap = new Map<string, number>();
filteredData.forEach(d => {
  const campaignKey = d.campaign_name || 'unknown';
  if (!campaignReachMap.has(campaignKey)) {
    // period_unique_reachが未設定または0のキャンペーンの場合、日次のreachの合計を使用
    const currentDailyReach = campaignDailyReachMap.get(campaignKey) || 0;
    campaignDailyReachMap.set(campaignKey, currentDailyReach + (d.reach || 0));
  }
});

// 各キャンペーンのリーチ数を合計
const totalReach = Array.from(campaignReachMap.values()).reduce((sum, reach) => sum + reach, 0) +
                  Array.from(campaignDailyReachMap.values()).reduce((sum, reach) => sum + reach, 0);

// ユニークリーチ数の合計（period_unique_reachのみ）
// period_unique_reachが0の場合は、日次のreachの合計を表示（参考値として）
let totalUniqueReach = Array.from(campaignReachMap.values()).reduce((sum, reach) => sum + reach, 0);
// period_unique_reachが0の場合、日次のreachの合計を使用（参考値として）
if (totalUniqueReach === 0) {
  totalUniqueReach = Array.from(campaignDailyReachMap.values()).reduce((sum, reach) => sum + reach, 0);
}
```

#### 2. loadDashboardData（1020-1056行目）

```typescript
// リーチ数の計算: period_unique_reachを優先的に使用（0より大きい場合のみ）
// キャンペーンごとにperiod_unique_reachを取得し、複数キャンペーンの場合は合計（重複排除は困難なため、近似値として合計）
// period_unique_reachは期間全体のユニークリーチ数なので、同じキャンペーンの複数日付データでは同じ値のはず
const campaignReachMap = new Map<string, number>();
filteredData.forEach(d => {
  const campaignKey = d.campaign_name || 'unknown';
  // period_unique_reachが存在し、0より大きい場合のみ使用
  if (d.period_unique_reach && d.period_unique_reach > 0) {
    // period_unique_reachが設定されている場合は、最初に見つかった値を使用
    if (!campaignReachMap.has(campaignKey)) {
      campaignReachMap.set(campaignKey, d.period_unique_reach);
    }
  }
});

// period_unique_reachが未設定または0のキャンペーンについては、日次のreachの合計を使用（フォールバック）
const campaignDailyReachMap = new Map<string, number>();
filteredData.forEach(d => {
  const campaignKey = d.campaign_name || 'unknown';
  if (!campaignReachMap.has(campaignKey)) {
    // period_unique_reachが未設定または0のキャンペーンの場合、日次のreachの合計を使用
    const currentDailyReach = campaignDailyReachMap.get(campaignKey) || 0;
    campaignDailyReachMap.set(campaignKey, currentDailyReach + (d.reach || 0));
  }
});

// 各キャンペーンのリーチ数を合計
const totalReach = Array.from(campaignReachMap.values()).reduce((sum, reach) => sum + reach, 0) +
                  Array.from(campaignDailyReachMap.values()).reduce((sum, reach) => sum + reach, 0);

// ユニークリーチ数の合計（period_unique_reachのみ）
// period_unique_reachが0の場合は、日次のreachの合計を表示（参考値として）
let totalUniqueReach = Array.from(campaignReachMap.values()).reduce((sum, reach) => sum + reach, 0);
// period_unique_reachが0の場合、日次のreachの合計を使用（参考値として）
if (totalUniqueReach === 0) {
  totalUniqueReach = Array.from(campaignDailyReachMap.values()).reduce((sum, reach) => sum + reach, 0);
}
```

#### 3. kpiData（1946-1961行目）

```typescript
// リーチ数は summaryData から取得（フロントエンドで計算済み）
// summaryDataが有効な場合は必ず使用
const filteredDataSum = current.reduce((acc, curr) => acc + (curr.reach || 0), 0);
const totalReach = summaryData?.totals?.reach !== undefined && summaryData?.totals?.reach !== null
  ? summaryData.totals.reach 
  : filteredDataSum;

// ユニークリーチ数は summaryData から取得
// period_unique_reachが0の場合は、日次のreachの合計を表示（参考値として）
let totalUniqueReach = summaryData?.totals?.unique_reach !== undefined && summaryData?.totals?.unique_reach !== null
  ? summaryData.totals.unique_reach
  : 0;
// period_unique_reachが0の場合、日次のreachの合計を使用（参考値として）
if (totalUniqueReach === 0) {
  totalUniqueReach = summaryData?.totals?.reach || filteredDataSum;
}
```

#### 4. CampaignDetailModal（95-112行目）

```typescript
const totalReach = campaignHistory.reduce((acc, curr) => acc + (curr.reach || 0), 0);
// ユニークリーチ数: period_unique_reachの合計（0より大きい値のみ、キャンペーンごとに1回のみカウント）
const campaignUniqueReachMap = new Map<string, number>();
campaignHistory.forEach(curr => {
  if (curr.period_unique_reach && curr.period_unique_reach > 0) {
    const campaignKey = curr.campaign_name || 'unknown';
    if (!campaignUniqueReachMap.has(campaignKey)) {
      campaignUniqueReachMap.set(campaignKey, curr.period_unique_reach);
    }
  }
});
let totalUniqueReach = Array.from(campaignUniqueReachMap.values()).reduce((sum, reach) => sum + reach, 0);
// period_unique_reachが0の場合、日次のreachの合計を使用（参考値として）
if (totalUniqueReach === 0) {
  totalUniqueReach = totalReach; // 日次のreachの合計を使用
}
```

## データベースの状態

データベース確認結果（`get_reach_data.py`実行結果）:
- すべてのキャンペーンで `period_unique_reach` が 0
- 例: Platinum1: `reach=17,954`, `period_unique_reach=0`

## 問題点

1. `period_unique_reach`フィールドがMeta APIに存在しない、または常に0を返している
2. `time_increment`なしで取得した`reach`フィールドも0になっている可能性
3. 既存データの更新ロジックが`period_unique_reach > 0`の場合のみ更新しているため、0の場合は更新されない


