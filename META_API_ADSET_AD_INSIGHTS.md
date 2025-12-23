# Meta API Ad Set/Ad Insights取得ガイド

## 問題点

CampaignレベルのInsightsでは、`adset_name`と`ad_name`は取得できません。
これらの情報を取得するには、Ad SetレベルまたはAdレベルのInsightsを取得する必要があります。

## 解決方法

### 方法1: Ad SetレベルのInsightsを取得（推奨）

Meta APIノードの設定を変更：

**Resource**: `Ad Set`（`Campaign`から変更）
**Operation**: `Get Insights`
**Fields**: 以下のフィールドを追加
- `adset_id`
- `adset_name`
- `campaign_id`
- `campaign_name`
- `date_start`
- `date_stop`
- `impressions`
- `clicks`
- `spend`
- `conversions`
- `reach`
- `actions`

**注意**: Ad SetレベルのInsightsでは、`ad_name`は取得できません。

### 方法2: AdレベルのInsightsを取得

**Resource**: `Ad`（`Campaign`から変更）
**Operation**: `Get Insights`
**Fields**: 以下のフィールドを追加
- `ad_id`
- `ad_name`
- `adset_id`
- `adset_name`
- `campaign_id`
- `campaign_name`
- `date_start`
- `date_stop`
- `impressions`
- `clicks`
- `spend`
- `conversions`
- `reach`
- `actions`

**注意**: AdレベルのInsightsを取得すると、データ量が多くなる可能性があります。

### 方法3: 複数レベルのInsightsを取得（最も詳細）

1. Campaign Insightsを取得（全体のサマリー用）
2. Ad Set Insightsを取得（広告セット名を含む）
3. Ad Insightsを取得（広告名を含む）
4. データをマージ

## Code in JavaScriptノードの修正

Ad SetまたはAdレベルのInsightsを取得する場合、Code in JavaScriptノードを以下のように修正：

```javascript
// Meta APIのデータを本システムのフォーマットに変換
const items = $input.all();

// 入力が空の場合は空配列を返す
if (!items || items.length === 0) {
  return [];
}

return items.map(item => {
  const data = item.json;
  
  // 日付をフォーマット
  const date = data.date_start || data.date_stop || '';
  
  // 広告費を数値に変換
  const spend = parseFloat(data.spend || 0);
  
  // インプレッション数を整数に変換
  const impressions = parseInt(data.impressions || 0);
  
  // クリック数を整数に変換
  const clicks = parseInt(data.clicks || 0);
  
  // コンバージョン数を取得
  let conversions = 0;
  if (data.actions && Array.isArray(data.actions)) {
    const conversionAction = data.actions.find(action => 
      action.action_type === 'offsite_conversion.fb_pixel_purchase' ||
      action.action_type === 'purchase'
    );
    if (conversionAction) {
      conversions = parseInt(conversionAction.value || 0);
    }
  }
  
  // CTRを計算
  const ctr = impressions > 0 ? (clicks / impressions * 100).toFixed(2) : '0.00';
  
  // CPCを計算
  const cpc = clicks > 0 ? (spend / clicks).toFixed(2) : '0.00';
  
  // CPMを計算
  const cpm = impressions > 0 ? (spend / impressions * 1000).toFixed(2) : '0.00';
  
  // リーチ数を取得
  const reach = parseInt(data.reach || 0);
  
  // NaNや空文字列を処理
  const campaignName = String(data.campaign_name || '').replace(/nan/gi, '');
  const adsetName = String(data.adset_name || '').replace(/nan/gi, '');
  const adName = String(data.ad_name || '').replace(/nan/gi, '');
  
  return {
    json: {
      日付: date,
      キャンペーン名: campaignName,
      広告セット名: adsetName,
      広告名: adName,
      広告費: spend,
      インプレッション数: impressions,
      クリック数: clicks,
      コンバージョン数: conversions,
      CTR: parseFloat(ctr),
      CPC: parseFloat(cpc),
      CPM: parseFloat(cpm),
      リーチ数: reach
    }
  };
});
```

## 推奨設定

**Ad SetレベルのInsightsを取得することを推奨**します：
- 広告セット名が取得できる
- データ量が適切（Adレベルより少ない）
- キャンペーン全体の分析に十分

Ad名が必要な場合は、AdレベルのInsightsを取得してください。

