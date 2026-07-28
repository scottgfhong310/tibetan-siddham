# tibetan-siddham — Session context

把 ASCII / IAST 羅馬轉寫轉成**藏文梵字（Tibetan-script Sanskrit）＋ 悉曇（Siddhaṁ）＋ 拉丁轉寫 ＋ Unicode 碼位**的單頁 WebApp。**轉換全在瀏覽器**:藏文用本專案規則表(`tibetan-core.js` + `data/tibetan.tsv`)、悉曇用 vendored 的 [mandel59/bonji-input](https://github.com/mandel59/bonji-input)(MIT,原樣不改),兩者都只透過防腐層 `TibetanSiddhamConverter` 使用。版面為左輸入 / 右輸出兩欄。

本 app 屬於 **nodeapp WebApp 家族**;共同規範與流程在
<https://github.com/scottgfhong310/nodeapp-webapp-family>(`DESIGN_GUIDELINES.md` 規範、`WORKFLOW.md` 流程)。**改動前請先讀那兩份,照其中 canon 做。**

**本 app 特有的設計決議**(承襲家族規範之上)見 [`DESIGN.md`](./DESIGN.md):架構/邊界、轉換管線、記法與 TSV、**標點政策**、對照表、`config.json` 後端開關、資料結構。改本 app 的轉換/標點/對照表行為前,先讀它。

## 結構

```
app.js                              # Express 入口:port 3000;static + /api/tibetan-siddham + / → 302 /apps/tibetan-siddham/
routes/tibetan-siddham.js           # API:POST /export、GET /downloads、POST /clear（{ ok } 信封）
public/download/tibetan-siddham/.gitkeep   # 匯出 JSON 落在這（內容 gitignore）
public/apps/tibetan-siddham/        # 前端(服務於 /apps/tibetan-siddham/)
├─ index.html · tibetan-siddham.css · tibetan-siddham.js   # 轉換器頁:結構 / 樣式 / 膠水(ESM module)
├─ chart.html · chart.css · chart.js · tibetan-table.js    # 字元對照表頁(一個 kind 一欄)
├─ tibetan-siddham-converter.js     # 防腐層:唯一對外轉換介面(ESM、不碰 DOM)
├─ tibetan-core.js                  # 本專案藏文規則核心(initTibetan + ascii2tibetan;會 fetch ./data/tibetan.tsv)
├─ data/tibetan.tsv                 # 藏文對照表(source of truth;kind/token/out/comment)
├─ vendor/bonji-input/{siddham.js, LICENSE, SOURCE.md}     # vendored 悉曇引擎(MIT、勿改邏輯)
├─ fonts/{NotoSerifTibetan-Regular.ttf, NotoSansSiddham-Regular.woff2, *-OFL.txt}
├─ side-tool.css · side-tool.js · materialize-dark.css   # 家族共用側鍵（樣式＋setIconDone 行為；權威版＝家族 repo，§5.5）
└─ i18n.js · locales/{zh-Hant,en,ja}.js
```

## 執行 / 驗證

```bash
npm install && npm start            # → http://localhost:3000/apps/tibetan-siddham/
```

驗證以 preview 實跑:`/` 應 302 → `/apps/tibetan-siddham/`、資產 200、轉換正確、i18n 三語、主題 light/dark 切換。

## 本 app 的 canon 重點 / 注意

- **可嵌入 lib = `tibetan-siddham-converter.js`**(`TibetanSiddhamConverter`,anti-corruption layer):純邏輯不碰 DOM;`tibetan-siddham.js` 才是碰 DOM 的控制器。**邊界紀律**:app 其餘程式只 import `tibetan-siddham-converter.js`,**絕不**直接 import `vendor/bonji-input/siddham.js` 或 `tibetan-core.js`。
- **比 bonji 多一步 async 載表**:藏文核心需先 `await converter.ready()`(載 `data/tibetan.tsv`)才能 `convert()`;控制器在 `init()` 末尾 await,完成前不轉。
- **原生 ESM、零 build**:`tibetan-core.js` / `siddham.js` / converter / 控制器都是 ESM,以 `<script type="module">` 載入。jQuery / Materialize / Lodash / I18n 仍是 classic CDN globals。此偏離家族 §4.2 的 IIFE→`window.XxxLib` 字面,但守其精神(純核心、零依賴、不碰 DOM),與 bonji 一致。
- **主題(重要)**:CSS 變數 light/dark,預設 dark;**materialize-dark.css 以 `html.light-mode` class 標記淺色**(否則系統偏好為深色時會強制深色)。`applyTheme` 同時設 `data-theme` **與** `light-mode`/`dark-mode` class;防閃爍開機腳本也要一起設 class。
- **字型**:藏文 `Noto Serif Tibetan`(目前 **TTF**,本機無 woff2 轉檔工具,日後轉 woff2)、悉曇 `Noto Sans Siddham`(woff2);皆 `@font-face` 內嵌,否則輸出是缺字方塊。
- **i18n**:`i18n.js` 引擎 + `locales/*.js`,`data-i18n` 屬性,預設 `zh-Hant`,三語齊備。
- **API（`routes/tibetan-siddham.js`,`{ ok }` 信封)**:`POST /export` 把 `{ title, options, input, output, sourceFile }` 存成 `public/download/tibetan-siddham/tibetan-siddham-yyyyMMddHHmmss.json`(檔名 server 產生;`output` 四欄 tibetan/siddham/latin/codepoints);`GET /downloads` 降冪列出;`POST /clear` 清空(目標寫死在 server、前端 `confirm()`)。匯出檔以 `/download/tibetan-siddham/<file>` 靜態提供。**側邊「下載」鈕＝先 export 再下載剛產生的 JSON**;**點清單項目＝把 title/options/input 載回並重算**,以 `loadedFrom` 追蹤血緣、再匯出寫進新檔的 `sourceFile`(顯示於 `#source-row`)。因有此 API,**轉換可純前端,但匯出/列表需要本 Node server**(非純靜態)。
- **後端開關 `config.json`**:`public/apps/tibetan-siddham/config.json` 的 `{ "backend": true|false }` 由前端 `tibetan-siddham.js` 在 `init` 讀取(`loadConfig`)。`true`(預設)＝用後端(匯出/清單/載回/清空、下載＝先匯出再下載);`false`＝純前端(隱藏 downloads/export/clear-downloads 三工具、下載改 Blob、不打 `/api`),可純靜態託管。讀不到 config 視為 `false`(無伺服器)。後端 route 永遠掛著、`false` 時閒置不被呼叫。
- **標點(集中在 converter ACL,藏文為主、悉曇僅對照)**:忽略空格時雙空格→tsheg `་`;`|`→shad `།`、`||`→nyis-shad `༎`、`~`→siddhaṁ 符 `𑗁`、`~~`→yig mgo `༄`;任一標點後接 tsheg(來自雙空格)→改一個空格。悉曇忽略 `| || ~ ~~`、拉丁 `|`/`||` 保留、`~`/`~~` 忽略。`~m`/`~n` 是既有 token(candrabindu/ña)不受影響。`𑗁` 借用悉曇字,`.tibetan-text` 字型 fallback 含 `Noto Sans Siddham` 以免缺字。
- **對照表頁 `chart.html`**:`tibetan-table.js`(純解析 TSV)+ `chart.js`(渲染);一個 kind 一欄,每列 token → 藏文 │ 悉曇(`siddhamForToken`)│ 說明;組合字元加 ◌、無對應 —。以 `window.open` 新分頁開啟(保留 opener),返回鈕關回原分頁。
- **延後(尚未做)**:即時 IME 打字、螢幕虛擬鍵盤(VK)、Devanāgarī 輸入 —— 都在孵化器原型 `InProgress/public/apps/tibetan/` 有。
- **轉換管線**:原文 → `ascii2symbol` → `latin2ascii(inputMethod)` → 共用 ascii → `ascii2tibetan` / `ascii2siddham` / `ascii2latin`(沿用孵化器原型的驗證路徑)。
- **來源**:由 `InProgress/public/apps/tibetan/`(孵化器原型,fork 自 bonji-input + 自製藏文核心)抽取乾淨資產而成;`tibetan-core.js`←`lib/tibetan.js`、`data/tibetan.tsv`←`lib/data/tibetan.tsv`、`vendor/.../siddham.js`←`lib/siddham.js`。
