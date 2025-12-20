# n8n Railway クイックスタートガイド

## 最も簡単な方法：n8n公式リポジトリから直接デプロイ

### ステップ1: Railwayアカウントの準備
1. [Railway](https://railway.app/)にアクセス
2. 「Start a New Project」をクリック
3. GitHubアカウントでログイン（初回のみ連携が必要）

### ステップ2: n8n公式リポジトリをデプロイ
1. 「Deploy from GitHub repo」をクリック
2. リポジトリ検索で `n8n-io/n8n` を検索
3. **n8n-io/n8n** を選択
4. 「Deploy」をクリック
5. Railwayが自動的にビルドを開始（約2-3分）

### ステップ3: 環境変数の設定
デプロイが完了したら、以下の環境変数を設定：

1. Railwayダッシュボードでプロジェクトを開く
2. デプロイされたサービスをクリック
3. 「Variables」タブを開く
4. 以下の環境変数を追加：

```
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=https
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-secure-password-here
```

**重要**: `N8N_BASIC_AUTH_PASSWORD` は強力なパスワードに変更してください。

### ステップ4: ドメインの設定
1. 「Settings」タブを開く
2. 「Networking」セクションで「Generate Domain」をクリック
3. 生成されたドメインをコピー（例: `n8n-production.up.railway.app`）
4. このドメインを `WEBHOOK_URL` 環境変数に設定：

```
WEBHOOK_URL=https://n8n-production.up.railway.app/
```

### ステップ5: サービスを再起動
環境変数を設定した後、サービスを再起動：
1. 「Deployments」タブを開く
2. 最新のデプロイメントの「...」メニューから「Redeploy」を選択

### ステップ6: n8nにアクセス
1. 生成されたドメインにアクセス
2. 設定した認証情報でログイン：
   - ユーザー名: `admin`（または設定した値）
   - パスワード: 設定したパスワード

---

## よくある質問

### Q: n8n公式リポジトリを使う場合、カスタマイズは可能ですか？
A: 環境変数による設定は可能ですが、コードの変更はできません。カスタマイズが必要な場合は、方法B（独自リポジトリ）を使用してください。

### Q: データベースはどうなりますか？
A: デフォルトではSQLiteが使用されます。PostgreSQLを使用する場合は、RailwayでPostgreSQLサービスを追加し、環境変数を設定してください。

### Q: 自動デプロイは有効ですか？
A: はい、GitHubリポジトリからデプロイした場合、リポジトリの更新が自動的にRailwayに反映されます。ただし、n8n公式リポジトリの場合は、公式の更新が自動的に反映されます。

### Q: コストはいくらですか？
A: Railwayの最小プランで約$5/月（約¥750/月）です。無料枠もありますが、制限があります。

---

## 次のステップ

n8nが起動したら、以下を参照してください：
- [N8N_RAILWAY_SETUP.md](./N8N_RAILWAY_SETUP.md) - 詳細なセットアップガイド
- [N8N_ENVIRONMENT_VARIABLES.md](./N8N_ENVIRONMENT_VARIABLES.md) - 環境変数の詳細設定
- Meta API連携の設定方法

