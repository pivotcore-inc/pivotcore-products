# PivotCore 製品ページ自動生成システム

`products.json` に型番を追記するだけで、Cloudflare Pages 上に製品ページが自動生成されます。

---

## ファイル構成

```
pivotcore-products/
├── products.json              ← ★ 担当者が編集するファイル（型番マスターデータ）
├── build.js                   ← ビルドスクリプト（エンジニアが初期設定のみ）
├── .github/
│   └── workflows/
│       └── deploy.yml         ← GitHub Actions（自動デプロイ設定）
└── dist/                      ← ビルド後に自動生成（GitHubにコミット不要）
    ├── index.html             ← 型番一覧ページ
    ├── stm32f103c8t6/
    │   └── index.html         ← 各型番の個別ページ
    └── ...
```

---

## 製品ページの追加方法（担当者向け）

### 方法A：GitHub画面から直接編集（推奨・エンジニア不要）

1. GitHubの `products.json` を開く
2. 右上の鉛筆アイコン（Edit this file）をクリック
3. 以下の形式で末尾に追記する：

```json
  {
    "partNumber": "型番をそのまま入力",
    "slug": "型番を小文字・ハイフンのみに変換",
    "maker": "メーカー名",
    "category": "マイコン",
    "longLead": true,
    "description": "本製品の調達についてご相談ください。長納期品・調達困難品にも対応しております。"
  }
```

4. 「Commit changes」ボタンをクリック
5. 数分後に自動でページが公開される

### slugの命名ルール

| 型番 | slug |
|------|------|
| STM32F103C8T6 | stm32f103c8t6 |
| XC7A35T-1CSG324C | xc7a35t-1csg324c |
| TPS65987DDRSHR | tps65987ddrshr |

- **すべて小文字**にする
- **英数字とハイフン（-）のみ**使用
- スラッシュ・アンダースコアはハイフンに変換

### categoryの選択肢

現在設定されているカテゴリ（自由に追加可能）：
- `マイコン`
- `FPGA`
- `電源IC`
- `MOSFET`

### longLeadの設定

- `true`：長納期対応バッジを表示（需給逼迫品に設定）
- `false`：バッジなし（通常品・EOL品など）

---

## 初期セットアップ（エンジニア向け・初回のみ）

### 1. 新しいGitHubリポジトリを作成

```bash
# このフォルダをGitHubにプッシュ
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/hideakitamura714/pivotcore-products.git
git push -u origin main
```

### 2. Cloudflare Pages プロジェクトを作成

Cloudflareダッシュボード → Workers & Pages → Create application → Pages

- **プロジェクト名**：`pivotcore-products`
- **本番ブランチ**：`main`
- フレームワーク：なし（Static HTML）

### 3. GitHub Secretsを設定

GitHubリポジトリ → Settings → Secrets and variables → Actions

| シークレット名 | 値の取得場所 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → マイプロフィール → APIトークン → 「Cloudflare Pages:Edit」権限で作成 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflareダッシュボード右サイドバーのアカウントID |

### 4. Cloudflareでカスタムドメインを設定

Cloudflare Pages → pivotcore-products → Custom domains

```
www.pivotcore.jp/products/* → pivotcore-products.pages.dev/*
```

**DNSルーティング設定（既存サイトに影響しない）：**
Cloudflare DNS → `www.pivotcore.jp` のCNAMEレコードを変更

または、**Cloudflare Workers Route**で `/products/*` だけを転送する方法が安全です：

```
Route: www.pivotcore.jp/products/*
Worker: なし（直接Pagesへ）
```

### 5. 動作確認

```bash
# ローカルでビルド確認
node build.js

# distフォルダの中身を確認
ls dist/
ls dist/stm32f103c8t6/
```

---

## URL構造

| ページ | URL |
|--------|-----|
| 型番一覧 | `https://www.pivotcore.jp/products/` |
| STM32F103C8T6 | `https://www.pivotcore.jp/products/stm32f103c8t6/` |
| XC7A35T-1CSG324C | `https://www.pivotcore.jp/products/xc7a35t-1csg324c/` |

---

## よくある質問

**Q: 既存サイト（pivotcore.jp）に影響しますか？**  
A: /products/ 配下のみが対象です。既存のindex.htmlやRFQフォームには一切影響しません。

**Q: 製品を削除したい場合は？**  
A: products.jsonから該当の行を削除してコミットするだけです。

**Q: ページの見た目を変えたい場合は？**  
A: build.js内のHTMLを編集してください。変更後にコミットすると全ページに反映されます。
