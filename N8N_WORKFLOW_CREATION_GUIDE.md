# n8nワークフロー作成ガイド

## 初回セットアップ後の選択

n8nのウェルカム画面で「**Start from scratch**」を選択してください。

理由：
- Meta API連携と本システムAPIへの送信という具体的な要件があるため
- 手動でノードを配置する方が確実に設定できます
- 「Try an AI workflow」は汎用的なワークフローを生成しますが、今回の要件には合いません

---

## ワークフロー作成手順

### ステップ1: スケジュールトリガーを追加

1. ワークフロー画面で「+」ボタンをクリック
2. ノード検索で「Schedule Trigger」を検索
3. 「Schedule Trigger」ノードを追加

**設定**:
- **Trigger Times**: `Every Day`（毎日）
- **Hour**: `9`（朝9時）
- **Minute**: `0`

これで毎朝9時にワークフローが自動実行されます。

---

### ステップ2: Meta APIノードを追加

1. Schedule Triggerノードの右側に「+」をクリック
2. ノード検索で「Meta」を検索
3. 「Meta」ノードを追加

**認証設定**（初回のみ）:
1. Metaノードをクリック
2. 「Credential」タブで「Create New Credential」をクリック
3. 認証タイプ: **OAuth2** または **Access Token**
4. 以下の情報を入力：
   - **App ID**: MetaアプリのApp ID
   - **App Secret**: MetaアプリのApp Secret
   - **Access Token**: ユーザーのアクセストークン（長期トークン推奨）

**操作設定**:
- **Resource**: `Campaign`
- **Operation**: `Get Insights`
- **Account ID**: Meta広告アカウントID
- **Fields**: 以下のフィールドを選択
  - `campaign_id`
  - `campaign_name`
  - `date_start`
  - `date_stop`
  - `impressions`
  - `clicks`
  - `spend`
  - `conversions`
  - `ctr`
  - `cpc`
  - `cpm`
  - `reach`
  - `actions`

**時間範囲**:
- **Time Range**: `Custom`
- **Since**: `{{ $now.minus({days: 1}).toFormat('yyyy-MM-dd') }}`（昨日）
- **Until**: `{{ $now.toFormat('yyyy-MM-dd') }}`（今日）

---

### ステップ3: データ変換ノード（Code）を追加

1. Metaノードの右側に「+」をクリック
2. ノード検索で「Code」を検索
3. 「Code」ノードを追加

**コード**:
```javascript
// Meta APIのデータを本システムのフォーマットに変換
const items = $input.all();

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
  
  // CTRを計算（クリック数 / インプレッション数 * 100）
  const ctr = impressions > 0 ? (clicks / impressions * 100).toFixed(2) : '0.00';
  
  // CPCを計算（広告費 / クリック数）
  const cpc = clicks > 0 ? (spend / clicks).toFixed(2) : '0.00';
  
  // CPMを計算（広告費 / インプレッション数 * 1000）
  const cpm = impressions > 0 ? (spend / impressions * 1000).toFixed(2) : '0.00';
  
  // リーチ数を取得
  const reach = parseInt(data.reach || 0);
  
  return {
    json: {
      日付: date,
      キャンペーン名: data.campaign_name || '',
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

---

### ステップ4: CSV生成ノード（Code）を追加

1. データ変換ノードの右側に「+」をクリック
2. 「Code」ノードを追加

**コード**:
```javascript
// CSV形式でデータを生成
const items = $input.all();

// CSVヘッダー（本システムの必須カラム）
const headers = [
  '日付',
  'キャンペーン名',
  '広告費',
  'インプレッション数',
  'クリック数',
  'コンバージョン数',
  'CTR',
  'CPC',
  'CPM',
  'リーチ数'
];

// CSVデータ行
const rows = items.map(item => {
  const data = item.json;
  return [
    data.日付 || '',
    data.キャンペーン名 || '',
    data.広告費 || 0,
    data.インプレッション数 || 0,
    data.クリック数 || 0,
    data.コンバージョン数 || 0,
    data.CTR || 0,
    data.CPC || 0,
    data.CPM || 0,
    data.リーチ数 || 0
  ].map(val => {
    // 値を文字列に変換し、ダブルクォートをエスケープ
    const str = String(val || '');
    return `"${str.replace(/"/g, '""')}"`;
  }).join(',');
});

// CSV全体
const csv = [
  headers.map(h => `"${h}"`).join(','),
  ...rows
].join('\n');

// UTF-8 BOM付きCSV（Excel対応）
const bom = '\ufeff';
const csvWithBom = bom + csv;

// ファイル名を生成（今日の日付）
const today = new Date().toISOString().split('T')[0];
const filename = `meta_data_${today}.csv`;

return [{
  json: {
    csv: csvWithBom,
    filename: filename,
    contentType: 'text/csv; charset=utf-8'
  }
}];
```

---

### ステップ5: 本システムAPI送信ノード（HTTP Request）を追加

1. CSV生成ノードの右側に「+」をクリック
2. ノード検索で「HTTP Request」を検索
3. 「HTTP Request」ノードを追加

**設定**:
- **Method**: `POST`
- **URL**: `https://your-backend-domain.railway.app/api/uploads`
  - 注意: `your-backend-domain.railway.app` を実際のバックエンドドメインに置き換えてください

**認証設定**:
- **Authentication**: `Generic Credential Type`
- **Generic Auth Type**: `Header Auth`
- **Name**: `Authorization`
- **Value**: `Bearer {{ $env.JWT_TOKEN }}`
  - 注意: 環境変数 `JWT_TOKEN` を事前に設定してください

**ヘッダー**:
- **Send Headers**: `true`
- **Header Parameters**:
  - `Authorization`: `Bearer {{ $env.JWT_TOKEN }}`

**ボディ設定**:
- **Send Body**: `true`
- **Body Content Type**: `multipart/form-data`
- **Body Parameters**:
  - `file`: `{{ $json.csv }}`
  - `filename`: `{{ $json.filename }}`

**注意**: 
- JWTトークンは環境変数に設定するか、ログインAPIを呼び出して取得してください
- トークンは30分で期限切れになる可能性があるため、ワークフロー内で自動ログインすることを推奨します

---

### ステップ6: ワークフローを保存・有効化

1. ワークフロー名を設定（例: "Meta API to System Upload"）
2. 「Save」をクリック
3. 右上のトグルスイッチでワークフローを「Active」にする

---

## ワークフロー全体の流れ

```
1. Schedule Trigger（毎日9時）
   ↓
2. Meta API（データ取得）
   ↓
3. Code（データ変換）
   ↓
4. Code（CSV生成）
   ↓
5. HTTP Request（本システムAPIに送信）
```

---

## トラブルシューティング

### Meta API接続エラー
- アクセストークンが有効か確認
- トークンの有効期限を確認（60日で期限切れ）
- Metaアプリの権限設定を確認

### 本システムAPI送信エラー
- JWTトークンが有効か確認
- トークンの有効期限を確認（30分で期限切れの可能性）
- CSVフォーマットが正しいか確認
- 必須カラムが含まれているか確認

### データが取得できない
- Meta APIの時間範囲を確認
- アカウントIDが正しいか確認
- フィールドが正しく選択されているか確認

---

## 参考

- [N8N_RAILWAY_SETUP.md](./N8N_RAILWAY_SETUP.md) - 詳細なセットアップガイド
- [N8N_ENVIRONMENT_VARIABLES.md](./N8N_ENVIRONMENT_VARIABLES.md) - 環境変数の設定
- [n8n-workflow-example.json](./n8n-workflow-example.json) - ワークフローのJSON例
