# セキュリティガイドライン

このドキュメントでは、STT Evaluation Appのセキュリティ対策について説明します。

## 実装済みのセキュリティ対策

### 1. セキュリティヘッダー

`next.config.ts` で以下のHTTPセキュリティヘッダーを設定しています：

| ヘッダー | 値 | 目的 |
|---------|-----|------|
| X-Frame-Options | DENY | クリックジャッキング防止 |
| X-Content-Type-Options | nosniff | MIMEタイプスニッフィング防止 |
| Referrer-Policy | strict-origin-when-cross-origin | リファラー情報の制御 |
| X-XSS-Protection | 1; mode=block | 古いブラウザでのXSSフィルタ有効化 |
| Permissions-Policy | camera=(), geolocation=(), microphone=(self) | ブラウザ機能の制限 |
| Content-Security-Policy | (詳細設定) | XSS攻撃防止 |

### 2. レート制限

`src/lib/rate-limit.ts` でスライディングウィンドウアルゴリズムを使用したレート制限を実装：

- **STT API**: 30リクエスト/分
- **評価API**: 10リクエスト/分
- **ヘルスチェック**: 60リクエスト/分

レート制限超過時は `429 Too Many Requests` を返し、以下のヘッダーを含めます：
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

### 3. 入力検証

- **ファイルサイズ制限**: 25MB
- **必須フィールド検証**: 各エンドポイントで実施
- **エラーハンドリング**: 詳細なエラーコードとメッセージ

### 4. 環境変数管理

- `.env.local` はGitから除外済み（`.gitignore`）
- `.env.example` でテンプレートを提供

---

## セキュリティベストプラクティス

### 本番環境へのデプロイ時

1. **APIキーのローテーション**
   - 定期的にAPIキーを更新してください
   - 漏洩の疑いがある場合は即座に更新

2. **環境変数の安全な管理**
   - Vercel/Cloudflare等のSecrets機能を使用
   - ローカルの`.env`ファイルは共有しない

3. **HTTPS の強制**
   - 本番環境では必ずHTTPSを使用
   - Vercel等のプラットフォームでは自動設定

4. **監視とログ**
   - Convexのダッシュボードでログを確認
   - 異常なリクエストパターンを監視

### 脆弱性報告

セキュリティの脆弱性を発見した場合は、公開イシューではなく、直接開発者に連絡してください。

---

## 制限事項

このアプリケーションは現在、以下のセキュリティ機能を実装していません：

- **認証・認可**: ユーザー認証なし（個人利用向け）
- **WAF**: アプリケーションレベルのファイアウォールなし
- **監査ログ**: 詳細なアクセスログなし

これらが必要な場合は、Clerk等の認証サービスや、Cloudflare WAFの導入を検討してください。
