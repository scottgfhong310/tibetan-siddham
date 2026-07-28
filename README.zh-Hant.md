# tibetan-siddham — 藏文梵字轉換器

> English: [README.md](./README.md) ・ 日本語：[README.ja.md](./README.ja.md)

把 **ASCII / IAST 羅馬轉寫**轉成**藏文梵字**、**悉曇文字（Siddhaṁ）**、**拉丁轉寫**與 **Unicode 碼位**的單頁 WebApp，轉換全部在瀏覽器完成。

本 app 屬於 **nodeapp WebApp 家族**；共同規範與流程見
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md`、`WORKFLOW.md`）。

## 特色

- **藏文 + 悉曇一次到位** — 輸入羅馬轉寫的梵字咒語，同時得到藏文拼寫、悉曇文字、拉丁轉寫與藏文 Unicode 碼位。
- **瀏覽器內轉換** — 轉換本身全在前端（不走伺服器往返）。
- **藏文標點** — 開「忽略空格」時，雙空格 → tsheg `་`；`|` → shad `།`、`||` → nyis shad `༎`、`~` → siddhaṁ 符 `𑗁`、`~~` → yig mgo `༄`（悉曇忽略這些標點，它本無分隔符）。
- **字元對照表** — `chart.html` 把 `tibetan.tsv` 排成欄（一個 kind 一欄），每列顯示 羅馬轉寫 → 藏文 · 悉曇。
- **匯出 / 清單 / 載回** — 把一次轉換存成 JSON 到伺服器，可列出 / 載回 / 清空（見下方 API）。
- **可嵌入核心** — 唯一對外轉換介面是 `TibetanSiddhamConverter`（防腐層；純邏輯、不碰 DOM）。
- **家族 canon** — CSS 變數 light/dark 主題（預設 dark）、三語（`zh-Hant / en / ja`）、Materialize 原生表單、家族側邊工具列。

## 執行

```bash
npm install
npm start                 # → http://localhost:3000/apps/tibetan-siddham/
# PORT=4070 npm start     # 用其他 port
```

根路徑 `/` 會 302 轉址到 `/apps/tibetan-siddham/`。

## 目錄結構

```
app.js                              # Express：static + /api/tibetan-siddham + / → 302 /apps/tibetan-siddham/；PORT||3000
routes/tibetan-siddham.js           # API：POST /export、GET /downloads、POST /clear（{ ok } 信封）
public/download/tibetan-siddham/.gitkeep   # 匯出 JSON 落在這（內容不進版控）
public/apps/tibetan-siddham/        # 前端（服務於 /apps/tibetan-siddham/）
├─ index.html · tibetan-siddham.css · tibetan-siddham.js   # 轉換器頁：結構 / 樣式 / 膠水（ESM module）
├─ chart.html · chart.css · chart.js · tibetan-table.js    # 字元對照表頁（一個 kind 一欄）
├─ tibetan-siddham-converter.js     # 防腐層：唯一對外轉換介面（ESM、不碰 DOM）
├─ tibetan-core.js                  # 本專案藏文規則核心（initTibetan + ascii2tibetan）
├─ data/tibetan.tsv                 # 藏文對照表（source of truth）
├─ vendor/bonji-input/{siddham.js, LICENSE, SOURCE.md}     # vendored 悉曇引擎（MIT、原樣不改）
├─ fonts/{NotoSerifTibetan-Regular.ttf, NotoSansSiddham-Regular.woff2, *-OFL.txt}
├─ i18n.js · locales/{zh-Hant,en,ja}.js
└─ side-tool.css · materialize-dark.css
```

## API（`routes/tibetan-siddham.js`，`{ ok }` 信封）

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/tibetan-siddham/export` | 把 `{ title, options, input, output, sourceFile }` 存成 `public/download/tibetan-siddham/tibetan-siddham-yyyyMMddHHmmss.json`（檔名由 server 產生）。回 `{ ok, filename, path }`。 |
| GET | `/api/tibetan-siddham/downloads` | 依檔名降冪列出匯出夾。回 `{ ok, files }`。 |
| POST | `/api/tibetan-siddham/clear` | 清空匯出夾（目標寫死在 server）。回 `{ ok, removed }`。 |

匯出檔以 `/download/tibetan-siddham/<file>` 靜態提供。側邊「下載」鈕＝先匯出再下載剛產生的 JSON；點清單項目＝把該檔 title / options / input 載回並重算，並以 `sourceFile` 追蹤血緣。

## 核心 library — `TibetanSiddhamConverter`

```js
import { TibetanSiddhamConverter } from "./tibetan-siddham-converter.js";

const c = new TibetanSiddhamConverter({ inputMethod: "ISO15919", transliteration: "IAST" });
await c.ready();                     // 載入 ./data/tibetan.tsv（idempotent）
const r = c.convert("siddha;m");
// r = { input, tibetan, siddham, latin, codepoints: { tibetan, siddham, latin } }
```

- `new TibetanSiddhamConverter(options?)` — 選項：`inputMethod`（`"ISO15919" | "KH"`）、`transliteration`（`"ISO15919" | "IAST"`）、`ignoreSpacesAndHyphens`（boolean）。
- `setOptions(patch)` → `this`。
- `ready()` → `Promise<void>` — `convert()` 前須先 await（藏文核心要 fetch 對照表）。
- `convert(input)` → `TibetanSiddhamResult`。

**邊界紀律**：app 其餘程式**只** import `tibetan-siddham-converter.js`，絕不直接 import `vendor/bonji-input/siddham.js` 或 `tibetan-core.js`；升級悉曇引擎只動 wrapper。

## 資料結構

**`TibetanSiddhamConverter.convert(input)` 回傳 →**

```jsonc
{
  "input":   "string",          // 原輸入（原樣回傳）
  "tibetan": "string",          // 藏文梵字
  "siddham": "string",          // 悉曇文字
  "latin":   "string",          // 拉丁轉寫
  "codepoints": {               // 「U+XXXX …」逐行，各文字一份
    "tibetan": "string",
    "siddham": "string",
    "latin":   "string"
  }
}
```

**匯出檔 `tibetan-siddham-yyyyMMddHHmmss.json`**（由 `POST /api/tibetan-siddham/export` 寫入；純前端模式的 Blob 結構相同）：

```jsonc
{
  "app":        "tibetan-siddham",   // 固定；由 server 寫入（純前端模式由前端寫）
  "exportedAt": "string",            // ISO-8601；存檔時加入
  "sourceFile": "string | null",     // 來源檔（血緣），無則 null
  "title":      "string",            // 使用者標題（可空）
  "options": {
    "inputMethod":            "\"ISO15919\" | \"KH\"",
    "transliteration":        "\"ISO15919\" | \"IAST\"",
    "ignoreSpacesAndHyphens": "boolean"
  },
  "input":  "string",                // 羅馬轉寫輸入
  "output": {                        // 四項顯示輸出
    "tibetan":    "string",
    "siddham":    "string",
    "latin":      "string",
    "codepoints": "string"           // UI 顯示的藏文碼位
  }
}
```

## 注意

- **後端開關 `config.json`**：`public/apps/tibetan-siddham/config.json` 的 `{ "backend": true | false }` 由前端啟動時讀取。`true`（預設）＝用伺服器匯出/清單/載回/清空（下載＝先匯出再下載）；`false`＝隱藏那三個工具、下載改純前端 Blob、不打 `/api`，本 app 即可純靜態託管（如 GitHub Pages）。關閉時後端 route 仍掛著但閒置。
- **轉換在前端、匯出/列表需後端**：藏文核心啟動時對 `data/tibetan.tsv` 做一次同源 `fetch`，悉曇引擎無 runtime fetch。開啟匯出/列表時需要這支 Node server（非純靜態）；關閉則可純靜態。
- **字型**：藏文暫用 TTF（本機無 woff2 轉檔工具），悉曇用 woff2；藏文轉 woff2 列為日後清理。
- **尚未做（延後）**：即時 IME 打字、螢幕虛擬鍵盤、天城體輸入（皆存在於孵化器原型）。

## 致謝

- 悉曇引擎：[mandel59/bonji-input](https://github.com/mandel59/bonji-input)（MIT），原樣 vendored。
- 字型：Noto Serif Tibetan、Noto Sans Siddham（SIL Open Font License）。

[MIT](LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
