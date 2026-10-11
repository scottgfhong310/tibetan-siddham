# tibetan-siddham — Session context

把 ASCII / IAST 羅馬轉寫轉成**藏文梵字（Tibetan-script Sanskrit）＋ 悉曇（Siddhaṁ）＋ 拉丁轉寫 ＋ Unicode 碼位**的單頁 WebApp。**轉換全在瀏覽器**:藏文用本專案規則表(`tibetan-core.js` + `data/tibetan.tsv`)、悉曇用 vendored 的 [mandel59/bonji-input](https://github.com/mandel59/bonji-input)(MIT;**不是原樣的上游**——多 14 個符號記法,與 `bonji` 那一份不同,見 `vendor/bonji-input/SOURCE.md`),兩者都只透過防腐層 `TibetanSiddhamConverter` 使用。版面為左輸入 / 右輸出兩欄。

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
├─ assist.js · assist.css · data/assist.json   # 輔助輸入面板(五類 108 格;classic、與控制器解耦;DESIGN §13)
├─ tibetan-siddham-converter.js     # 防腐層:唯一對外轉換介面(ESM、不碰 DOM)
├─ tibetan-core.js                  # 本專案藏文規則核心(initTibetan + ascii2tibetan;會 fetch ./data/tibetan.tsv)
├─ data/tibetan.tsv                 # 藏文對照表(source of truth;kind/token/out/comment)
├─ vendor/bonji-input/{siddham.js, LICENSE, SOURCE.md}     # vendored 悉曇引擎(MIT;上游＋14 個符號記法、勿再改邏輯)
├─ fonts/{NotoSerifTibetan-Regular.ttf, NotoSansSiddham-Regular.woff2, *-OFL.txt}
├─ side-tool.css · side-tool.js · materialize-dark.css   # 家族共用側鍵（樣式＋setIconDone 行為；權威版＝家族 repo，§5.5）
├─ filter-clear.css · filter-clear.js   # 家族共用：搜尋框清除鈕（權威版在 app `local-reader`，§5.12）
└─ i18n.js · locales/{zh-Hant,en,ja}.js
```

## 執行 / 驗證

```bash
npm install && npm start            # → http://localhost:3000/apps/tibetan-siddham/
npm run verify                      # 10 條契約檢查（輔助輸入的每一格、引擎符號記法的分流、三個空格→全形空格,都對防腐層逐一驗）
node scripts/verify.js --selftest   # 37 個反向注入，全部必須被對應的那一條抓到
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
- **標點(集中在 converter ACL,藏文為主、悉曇僅對照)**:忽略空格時雙空格→tsheg `་`;**三個空格→全形空格 U+3000**(藏文與悉曇、不論忽略空格開關、拉丁不動;〔owner 2026-10-11,DESIGN §5.3〕⚠️ 在這之前 ≥2 個空格都是 tsheg,現在恰好兩個才是;全形空格後面不接 tsheg;做法是把 ascii 依三個空格切段、各段各自轉——`tibetan-core` 與引擎都沒有動);`|`→shad `།`、`||`→nyis-shad `༎`、`~`→siddhaṁ 符 `𑗁`、`~~`→yig mgo `༄`;任一標點後接 tsheg(來自雙空格)→改一個空格。悉曇忽略 `| || ~ ~~`、拉丁 `|`/`||` 保留、`~`/`~~` 忽略。`~m`/`~n` 是既有 token(candrabindu/ña)不受影響。`𑗁` 借用悉曇字,`.tibetan-text` 字型 fallback 含 `Noto Sans Siddham` 以免缺字。**引擎的符號記法也由 ACL 分流**〔owner 2026-10-11〕:`--` `,,` `..` `*` `2` `@` `=` 與多帶的 14 個——悉曇欄保留(那本來就是悉曇的記號)、拉丁欄還原成輸入的記法、藏文欄只有 `--` 留成 `𑗁`(與 `~` 同字)其餘還原成字面。`restoreSymbols()` 的對照表是向引擎問出來的;⚠️ 記法清單 `ENGINE_SYMBOL_TOKENS` 是引擎那張表的鍵的第二份,第 ⑨ 條檢查直接讀引擎原始碼的表去驗。見 DESIGN §5.2 最後一條。
- **對照表頁 `chart.html`**:`tibetan-table.js`(純解析 TSV)+ `chart.js`(渲染);一個 kind 一欄,每列 token → 藏文 │ 悉曇(`siddhamForToken`)│ 說明;組合字元加 ◌、無對應 —。以 `window.open` 新分頁開啟(保留 opener),返回鈕關回原分頁。
- **輔助輸入**(`keyboard` 側邊工具、DESIGN §13):固定在右側的藏文字形選盤,形制照 `bonji`、鍵位來自原型 VK 的「藏文梵字」五組——母音 16／子音 34／元音符號 16／下加輔音 37／標點 5,共 **108** 格(`data/assist.json`)。點一格 → 記法插入 `#ts-input` 游標處並派發 `input`,控制器即時重轉。⚠️ **改 `assist.json` 或 `tibetan.tsv` 之後跑 `npm run verify`**:每一格的字形是資料寫的、轉出什麼是防腐層算的,兩邊會各自漂。⚠️ **子音鍵帶隱含 a**(`ka`),之後按元音符號 `i` 會得到 `kai`;要接母音用下加輔音那一組的記法(`k`＋`i`)——與 `bonji` 同一個慣例,面板不替使用者改寫前一個字。⚠️ 標點一組依本 app 的 §5,不照抄原型(不收 `--`／`/`／`.`／全形)。`assist.js` 是 classic IIFE、不 import 模組、不碰轉換(第 ⑧ 條)。
- **延後(尚未做)**:即時 IME 打字、Devanāgarī 輸入、螢幕虛擬鍵盤(VK)的其餘分頁 —— 都在孵化器原型有(2026-10-11 起原型是 private repo `tibetan`)。VK 的「藏文梵字」五組已以輔助輸入的形式進來。
- **轉換管線**:原文 → `ascii2symbol` → `latin2ascii(inputMethod)` → 共用 ascii → `ascii2tibetan` / `ascii2siddham` / `ascii2latin`(沿用孵化器原型的驗證路徑)。
- **來源**:由 `InProgress/public/apps/tibetan/`(孵化器原型,fork 自 bonji-input + 自製藏文核心)抽取乾淨資產而成;`tibetan-core.js`←`lib/tibetan.js`、`data/tibetan.tsv`←`lib/data/tibetan.tsv`、`vendor/.../siddham.js`←`lib/siddham.js`。
