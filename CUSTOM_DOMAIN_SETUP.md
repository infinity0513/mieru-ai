# カスタムドメイン設定ガイド

## 概要

本番環境で頻繁にデプロイする場合、カスタムドメインを設定することで以下のメリットがあります：

- **プロフェッショナルなURL**: `mieru.ai` のような独自ドメインを使用
- **ブランディング**: サービス名を直接URLに反映
- **安定性**: デフォルトドメインが変更されても影響を受けない
- **SEO**: 独自ドメインは検索エンジン最適化に有利

## 現在のドメイン

- **フロントエンド（Netlify）**: `mieru.netlify.app`
- **バックエンド（Railway）**: `mieru-ai-production.up.railway.app`

## ステップ1: ドメインの取得

1. ドメイン登録サービスでドメインを購入
   - 推奨サービス: [Namecheap](https://www.namecheap.com/), [Google Domains](https://domains.google/), [お名前.com](https://www.onamae.com/)
   - 推奨ドメイン: `mieru.ai`, `mieru.app`, `getmieru.com` など

## ステップ2: Netlifyでカスタムドメインを設定

### 2.1 Netlifyダッシュボードでドメインを追加

1. Netlifyダッシュボードでサイトを開く
2. 「Site settings」→「Domain management」を開く
3. 「Add custom domain」をクリック
4. 購入したドメインを入力（例: `mieru.ai`）
5. 「Verify」をクリック

### 2.2 DNS設定

Netlifyが提供するDNS設定情報を確認：

1. 「Domain management」で追加したドメインをクリック
2. 「DNS configuration」セクションを確認
3. ドメイン登録サービスのDNS設定画面で以下を設定：

#### オプションA: Netlify DNSを使用する場合（推奨）

1. Netlifyの「Domain management」で「Use Netlify DNS」を選択
2. Netlifyが提供するネームサーバーをコピー（例: `dns1.p01.nsone.net`）
3. ドメイン登録サービスのネームサーバー設定で、Netlifyのネームサーバーに変更

#### オプションB: 外部DNSを使用する場合

ドメイン登録サービスのDNS設定で以下を追加：

```
Type: A
Name: @
Value: 75.2.60.5

Type: CNAME
Name: www
Value: mieru.netlify.app
```

### 2.3 SSL証明書の設定

1. Netlifyが自動的にSSL証明書を発行（Let's Encrypt）
2. 「Domain management」で「HTTPS」が有効になっていることを確認
3. 「Force HTTPS」を有効にする（推奨）

### 2.4 環境変数の更新

Netlifyの環境変数は変更不要（`VITE_API_URL`はバックエンドURLを指しているため）

## ステップ3: Railwayでカスタムドメインを設定（オプション）

バックエンドAPIにもカスタムドメインを設定する場合：

### 3.1 Railwayでカスタムドメインを追加

1. Railwayダッシュボードで「mieru-ai」サービスを開く
2. 「Settings」→「Networking」を開く
3. 「Custom Domain」セクションで「Add Custom Domain」をクリック
4. サブドメインを入力（例: `api.mieru.ai`）
5. Railwayが提供するDNS設定情報を確認

### 3.2 DNS設定

ドメイン登録サービスのDNS設定で以下を追加：

```
Type: CNAME
Name: api
Value: mieru-ai-production.up.railway.app
```

### 3.3 環境変数の更新

Railwayの環境変数を更新：

1. 「Settings」→「Variables」タブを開く
2. 以下の環境変数を更新：

```
FRONTEND_URL=https://mieru.ai
CORS_ORIGINS=https://mieru.ai,https://www.mieru.ai
```

### 3.4 Netlifyの環境変数を更新

Netlifyの環境変数も更新：

```
VITE_API_URL=https://api.mieru.ai/api
```

## ステップ4: Meta OAuth設定の更新

カスタムドメインを設定したら、Meta for Developersの設定も更新：

### 4.1 アプリドメインの追加

1. [Meta for Developers](https://developers.facebook.com/)にアクセス
2. アプリを選択
3. 「設定」→「基本設定」を開く
4. 「アプリドメイン」にカスタムドメインを追加（例: `mieru.ai`）

### 4.2 OAuth Redirect URIの更新

1. 「Facebookログイン」→「設定」を開く
2. 「有効なOAuthリダイレクトURI」に以下を追加：

```
https://mieru-ai-production.up.railway.app/api/meta/oauth/callback
```

（バックエンドのカスタムドメインを使用する場合は、そちらに変更）

## ステップ5: 動作確認

1. カスタムドメインにアクセス（例: `https://mieru.ai`）
2. ログイン機能が正常に動作するか確認
3. Meta OAuth認証が正常に動作するか確認
4. API接続が正常に動作するか確認

## トラブルシューティング

### DNS設定が反映されない

- DNS設定の反映には最大48時間かかる場合があります
- `dig` コマンドでDNS設定を確認：
  ```bash
  dig mieru.ai
  ```

### SSL証明書が発行されない

- DNS設定が正しく反映されているか確認
- Netlifyの「Domain management」で「Retry certificate」をクリック

### CORSエラーが発生する

- Railwayの`CORS_ORIGINS`環境変数にカスタムドメインが含まれているか確認
- プロトコル（`https://`）を含めて設定

## 参考リンク

- [Netlify: Custom domains](https://docs.netlify.com/domains-https/custom-domains/)
- [Railway: Custom domains](https://docs.railway.app/reference/custom-domains)
- [Meta for Developers: App Domains](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings#app-domains)

