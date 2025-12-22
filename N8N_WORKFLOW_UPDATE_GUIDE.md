# n8nワークフロー更新ガイド

## ユーザーごとのMetaアカウント情報を使用する方法

### 変更内容

Facebook Graph APIノードの代わりに、本システムのAPIエンドポイントを使用します。
これにより、各ユーザーが自分のMetaアカウント情報を使用できます。

### ワークフロー構造の変更

**変更前**:
1. Schedule Trigger
2. Facebook Graph API（固定のアカウントID）
3. Code in JavaScript（データ変換）
4. HTTP Request1（ログイン）
5. Code in JavaScript1（CSV生成）
6. HTTP Request（アップロード）

**変更後**:
1. Schedule Trigger
2. HTTP Request1（ログイン）
3. HTTP Request（Meta Insights取得）← **新規追加**
4. Code in JavaScript（データ変換）
5. Code in JavaScript1（CSV生成）
6. HTTP Request（アップロード）

### ステップ1: HTTP Request1（ログイン）の設定

**設定**:
- **Method**: `POST`
- **URL**: `https://mieru-ai-production.up.railway.app/api/auth/login`
- **Body Content Type**: `JSON`
- **Body Parameters**:
  ```json
  {
    "email": "user@example.com",
    "password": "user-password"
  }
  ```

### ステップ2: HTTP Request（Meta Insights取得）の追加

1. HTTP Request1の後に新しい「HTTP Request」ノードを追加
2. **設定**:
   - **Method**: `GET`
   - **URL**: `https://mieru-ai-production.up.railway.app/api/meta/insights`
   - **Authentication**: `Generic Credential Type`
   - **Generic Auth Type**: `Header Auth`
   - **Name**: `Authorization`
   - **Value**: `Bearer {{ $('HTTP Request1').item.json.access_token }}`
   - **Query Parameters**:
     - `since`: `{{ $now.minus({days: 1}).toFormat('yyyy-MM-dd') }}`
     - `until`: `{{ $now.toFormat('yyyy-MM-dd') }}`

### ステップ3: Code in JavaScript（データ変換）の修正

HTTP Request（Meta Insights取得）の出力を使用するように変更：

```javascript
// Meta APIのデータを本システムのフォーマットに変換
const items = $input.all();

// 入力が空の場合は空配列を返す
if (!items || items.length === 0) {
  return [];
}

// data配列を取得
const dataArray = items[0]?.json?.data || [];

return dataArray.map(data => {
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

### ステップ4: ユーザーがMetaアカウント情報を設定

1. 本システムの設定画面にアクセス
2. 「Meta広告アカウント連携」セクションで以下を入力：
   - **Meta広告アカウントID**: `act_123456789`
   - **Metaアクセストークン**: アクセストークン
3. 「Meta設定を保存」をクリック

### メリット

- 各ユーザーが自分のMetaアカウント情報を使用可能
- n8nワークフローは共通で、ユーザーごとの設定は不要
- セキュア（トークンは本システムのデータベースに保存）

