# tibetan-siddham — チベット文字 梵字コンバーター

> English: [README.md](./README.md) ・ 繁體中文：[README.zh-Hant.md](./README.zh-Hant.md)

**ASCII / IAST のローマ字転写**を、**チベット文字の梵字（藏文梵字）**・**悉曇文字（Siddhaṁ）**・**ラテン翻字**・**Unicode コードポイント**に変換する単一ページ WebApp。変換はすべてブラウザ内で行われます。

本 app は **nodeapp WebApp ファミリー**の一員です。共通規約は
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md`、`WORKFLOW.md`）。

## 特長

- **チベット文字 + 悉曇を一度に** — ローマ字転写の真言を入力すると、チベット文字の綴り・悉曇文字・ラテン翻字・チベット文字の Unicode コードポイントを並べて表示。
- **ブラウザ内変換** — 変換そのものは完全にクライアント側（往復なし）。
- **チベット文字の約物** — スペース無視時、スペース2回 → tsheg `་`；`|` → shad `།`、`||` → nyis shad `༎`、`~` → siddhaṁ 符 `𑗁`、`~~` → yig mgo `༄`（悉曇はこれらを無視。区切り記号を持たない）。
- **文字対照表** — `chart.html` が `tibetan.tsv` を列（kind ごとに 1 列）で表示し、各行で ローマ字転写 → チベット文字 · 悉曇 を示す。
- **書き出し / 一覧 / 読み込み** — 変換を JSON としてサーバーに保存し、一覧 / 読み込み / 消去（下記 API 参照）。
- **組込み可能なコア** — 唯一の変換インターフェースは `TibetanSiddhamConverter`（防腐層。純ロジック、DOM 非依存）。
- **ファミリー canon** — CSS 変数による light/dark テーマ（既定 dark）、3 言語（`zh-Hant / en / ja`）、Materialize ネイティブのフォーム、ファミリー共通のサイドツール。

## 実行

```bash
npm install
npm start                 # → http://localhost:3000/apps/tibetan-siddham/
# PORT=4070 npm start     # 別ポートで起動
```

ルート `/` は `/apps/tibetan-siddham/` に 302 リダイレクトします。

## ディレクトリ構成

```
app.js                              # Express：static + /api/tibetan-siddham + / → 302 /apps/tibetan-siddham/；PORT||3000
routes/tibetan-siddham.js           # API：POST /export、GET /downloads、POST /clear（{ ok } エンベロープ）
public/download/tibetan-siddham/.gitkeep   # 書き出し JSON はここ（内容は gitignore）
public/apps/tibetan-siddham/        # フロントエンド（/apps/tibetan-siddham/ で配信）
├─ index.html · tibetan-siddham.css · tibetan-siddham.js   # コンバーター：構造 / スタイル / グルー（ESM module）
├─ chart.html · chart.css · chart.js · tibetan-table.js    # 文字対照表ページ（kind ごとに 1 列）
├─ tibetan-siddham-converter.js     # 防腐層：唯一の変換インターフェース（ESM、DOM 非依存）
├─ tibetan-core.js                  # 本プロジェクトのチベット文字規則コア（initTibetan + ascii2tibetan）
├─ data/tibetan.tsv                 # チベット文字対照表（source of truth）
├─ vendor/bonji-input/{siddham.js, LICENSE, SOURCE.md}     # vendored 悉曇エンジン（MIT、無改変）
├─ fonts/{NotoSerifTibetan-Regular.ttf, NotoSansSiddham-Regular.woff2, *-OFL.txt}
├─ i18n.js · locales/{zh-Hant,en,ja}.js
└─ side-tool.css · materialize-dark.css
```

## API（`routes/tibetan-siddham.js`、`{ ok }` エンベロープ）

| Method | Path | 説明 |
|---|---|---|
| POST | `/api/tibetan-siddham/export` | `{ title, options, input, output, sourceFile }` を `public/download/tibetan-siddham/tibetan-siddham-yyyyMMddHHmmss.json` に保存（ファイル名はサーバー生成）。`{ ok, filename, path }` を返す。 |
| GET | `/api/tibetan-siddham/downloads` | 書き出しフォルダをファイル名降順で一覧。`{ ok, files }` を返す。 |
| POST | `/api/tibetan-siddham/clear` | 書き出しフォルダを消去（対象はサーバー側で固定）。`{ ok, removed }` を返す。 |

書き出しは `/download/tibetan-siddham/<file>` で静的配信。サイドの「ダウンロード」ボタンは先に書き出してからその JSON をダウンロード；一覧項目をクリックすると title / options / input を読み戻し、`sourceFile` で来歴を追跡します。

## コアライブラリ — `TibetanSiddhamConverter`

```js
import { TibetanSiddhamConverter } from "./tibetan-siddham-converter.js";

const c = new TibetanSiddhamConverter({ inputMethod: "ISO15919", transliteration: "IAST" });
await c.ready();                     // ./data/tibetan.tsv を読み込み（idempotent）
const r = c.convert("siddha;m");
// r = { input, tibetan, siddham, latin, codepoints: { tibetan, siddham, latin } }
```

- `new TibetanSiddhamConverter(options?)` — オプション：`inputMethod`（`"ISO15919" | "KH"`）、`transliteration`（`"ISO15919" | "IAST"`）、`ignoreSpacesAndHyphens`（boolean）。
- `setOptions(patch)` → `this`。
- `ready()` → `Promise<void>` — `convert()` の前に await が必要（チベット文字コアが対照表を fetch するため）。
- `convert(input)` → `TibetanSiddhamResult`。

**境界規律**：app の他のコードは `tibetan-siddham-converter.js` **のみ**を import し、`vendor/bonji-input/siddham.js` や `tibetan-core.js` を直接 import しません。悉曇エンジンの更新は wrapper だけで完結します。

## データ構造

**`TibetanSiddhamConverter.convert(input)` の戻り値 →**

```jsonc
{
  "input":   "string",          // 入力（そのまま返す）
  "tibetan": "string",          // チベット文字の梵字
  "siddham": "string",          // 悉曇文字
  "latin":   "string",          // ラテン翻字
  "codepoints": {               // 「U+XXXX …」を行ごと、文字種ごとに
    "tibetan": "string",
    "siddham": "string",
    "latin":   "string"
  }
}
```

**書き出しファイル `tibetan-siddham-yyyyMMddHHmmss.json`**（`POST /api/tibetan-siddham/export` が書き込み。静的モードのクライアント側 Blob も同じ構造）：

```jsonc
{
  "app":        "tibetan-siddham",   // 固定。サーバー（静的モードはフロント）が付与
  "exportedAt": "string",            // ISO-8601。保存時に付与
  "sourceFile": "string | null",     // 由来ファイル（来歴）、無ければ null
  "title":      "string",            // ユーザー入力のタイトル（空可）
  "options": {
    "inputMethod":            "\"ISO15919\" | \"KH\"",
    "transliteration":        "\"ISO15919\" | \"IAST\"",
    "ignoreSpacesAndHyphens": "boolean"
  },
  "input":  "string",                // ローマ字転写の入力
  "output": {                        // 表示される 4 つの出力
    "tibetan":    "string",
    "siddham":    "string",
    "latin":      "string",
    "codepoints": "string"           // UI に表示されるチベット文字のコードポイント
  }
}
```

## 注意

- **バックエンド切替 `config.json`**：`public/apps/tibetan-siddham/config.json` の `{ "backend": true | false }` を起動時にフロントが読み込む。`true`（既定）＝サーバーの書き出し / 一覧 / 読み込み / 消去を使用（ダウンロード＝先に書き出してからダウンロード）。`false`＝その 3 つのツールを隠し、ダウンロードをクライアント側 Blob にし、`/api` を呼ばない → 純静的ホスティング（GitHub Pages など）が可能。オフ時もルートは載っているが未使用。
- **変換はクライアント側、書き出し / 一覧はサーバーが必要**：チベット文字コアは起動時に `data/tibetan.tsv` を 1 回だけ同一オリジンで `fetch`（悉曇エンジンは runtime fetch なし）。書き出し / 一覧を有効にする場合はこの Node サーバーが必要（オフなら純静的でも可）。
- **フォント**：チベット文字は TTF（手元に woff2 変換ツールがないため）、悉曇は woff2。チベット文字の woff2 化は今後の整理項目。
- **未実装（後回し）**：ライブ IME 入力、画面上の仮想キーボード、Devanāgarī 入力（いずれもインキュベーター原型に存在）。

## クレジット

- 悉曇エンジン：[mandel59/bonji-input](https://github.com/mandel59/bonji-input)（MIT）、無改変で vendored。
- フォント：Noto Serif Tibetan、Noto Sans Siddham（SIL Open Font License）。

[MIT](LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
