# 階層構造フィールドマイグレーションガイド

## 問題
本番環境（Railway）のPostgreSQLデータベースに`campaign_id`, `adset_id`, `ad_id`, `level`カラムが存在しないため、以下のエラーが発生しています：
```
column campaigns.campaign_id does not exist
```

## 解決方法

### 方法1: Railway CLIを使用（推奨）

1. Railway CLIをインストール（未インストールの場合）
```bash
npm i -g @railway/cli
```

2. Railwayにログイン
```bash
railway login
```

3. プロジェクトを選択
```bash
railway link
```

4. マイグレーションスクリプトを実行
```bash
cd backend
railway run python add_hierarchy_fields_to_campaigns_railway.py
```

### 方法2: Railwayダッシュボードから直接SQLを実行

1. Railwayダッシュボードにアクセス
2. プロジェクトを選択
3. PostgreSQLサービスを選択
4. 「Data」タブを開く
5. 「Query」タブを開く
6. 以下のSQLを実行：

```sql
-- カラムが既に存在するか確認
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
AND column_name IN ('campaign_id', 'adset_id', 'ad_id', 'level');

-- カラムが存在しない場合のみ実行
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_id VARCHAR(255);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS adset_id VARCHAR(255);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ad_id VARCHAR(255);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS level VARCHAR(20);
```

### 方法3: Railwayのコンソールから実行

1. Railwayダッシュボードにアクセス
2. バックエンドサービス（mieru-ai）を選択
3. 「Deployments」タブを開く
4. 最新のデプロイメントを選択
5. 「View Logs」をクリック
6. 「Shell」タブを開く
7. 以下のコマンドを実行：

```bash
cd backend
python add_hierarchy_fields_to_campaigns_railway.py
```

## 確認方法

マイグレーションが成功したか確認するには、以下のSQLを実行：

```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
AND column_name IN ('campaign_id', 'adset_id', 'ad_id', 'level')
ORDER BY column_name;
```

4つのカラム（`campaign_id`, `adset_id`, `ad_id`, `level`）が表示されれば成功です。

## 注意事項

- マイグレーション実行後、Meta OAuth連携を再実行して、新しいフィールドを含むデータを取得してください
- 既存のデータには`level`フィールドが`NULL`のままになる可能性があります。必要に応じて、既存データの`level`を更新してください：

```sql
-- 既存データのlevelを更新（オプション）
UPDATE campaigns 
SET level = CASE
    WHEN ad_set_name IS NULL OR ad_set_name = '' THEN 'campaign'
    WHEN ad_name IS NOT NULL AND ad_name != '' THEN 'ad'
    ELSE 'adset'
END
WHERE level IS NULL;
```

