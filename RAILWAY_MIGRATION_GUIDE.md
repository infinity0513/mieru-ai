# Railwayデータベースマイグレーションガイド

## 問題
本番環境（Railway）のPostgreSQLデータベースに`meta_account_id`カラムが存在しないため、以下のエラーが発生しています：
```
column campaigns.meta_account_id does not exist
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
railway run python add_meta_account_id_to_campaigns_railway.py
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
WHERE table_name = 'campaigns' AND column_name = 'meta_account_id';

-- カラムが存在しない場合のみ実行
ALTER TABLE campaigns ADD COLUMN meta_account_id VARCHAR(255);
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
python add_meta_account_id_to_campaigns_railway.py
```

## 確認方法

マイグレーションが成功したか確認するには、以下のSQLを実行：

```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'campaigns' AND column_name = 'meta_account_id';
```

`meta_account_id`カラムが表示されれば成功です。

## 注意事項

- マイグレーション実行中は、データベースへの書き込みを避けてください
- 本番環境で実行する前に、必ずバックアップを取ってください
- カラムが既に存在する場合は、エラーが発生しますが、問題ありません

