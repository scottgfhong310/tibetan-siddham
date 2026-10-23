# tibetan-siddham — 設計文件（Design）

> 本文記錄 **tibetan-siddham 這支 app 特有的設計決議**。通用的家族規範（結構 / 後端 / 視覺 / i18n / 安全 / side-tools / 文件規範…）**承襲** [nodeapp WebApp 家族規範](https://github.com/scottgfhong310/nodeapp-webapp-family)（`DESIGN_GUIDELINES.md` / `WORKFLOW.md`），本文**不重複**，只記在其之上的 app 專屬內容；與規範衝突時以最新規範為準。
>
> 面向開發者；使用者導向說明見 `README.md`、單檔 clone 的速覽見 `CLAUDE.md`。

---

## 1. 一句話定位

把**羅馬轉寫的梵字**（ASCII / IAST，如 `o;m`）一次轉成 **藏文梵字（Tibetan-script Sanskrit）／ 悉曇（Siddhaṁ）／ 拉丁轉寫 ／ Unicode 碼位**。**藏文為主、悉曇是對照參考**——這條原則貫穿整個標點與輸出政策（§5）。

---

## 2. 架構與邊界（Architecture）

三層，由上而下依賴：

```
index.html / chart.html              ← 純結構
  │
tibetan-siddham.js / chart.js        ← 控制器（glue）：碰 DOM、事件、i18n、主題、導覽、後端呼叫
  │  （只 import↓）
tibetan-siddham-converter.js         ← 防腐層 ACL：唯一對外轉換介面（純邏輯、不碰 DOM）
  │            ├── tibetan-core.js                  ← 本專案藏文核心（規則表驅動）
  │            │       └── data/tibetan.tsv         ← source of truth
  │            └── vendor/bonji-input/siddham.js    ← vendored 悉曇引擎（MIT；上游 ＋ 14 個符號記法，見其 SOURCE.md）

assist.js ─→ data/assist.json        ← 輔助輸入面板（§13）：classic、不 import 模組、不經 converter，只對 #ts-input 插字
```

**邊界紀律（硬約束）**：

- App 其餘程式（控制器、對照表）**只** import `tibetan-siddham-converter.js`，**絕不**直接 import `vendor/bonji-input/siddham.js` 或 `tibetan-core.js`。
- 升級 vendored 悉曇引擎 → 只動 wrapper（ACL）；換藏文規則 → 只改 `tibetan.tsv`（必要時 `tibetan-core.js` 的解析）。
  ⚠️ **這一份引擎不是原樣的上游**：它自孵化器原型帶來 14 個符號記法（`*0`–`*7`、`o2`／`o2x`／`ox2`／`ox3`／`ox4`／`oxx`），與 `bonji` 所 vendored 的那一份不同（2026-10-11 實查）。**升級時不可整檔換成上游**，要把那 14 項重新併入——清單與碼位見 `vendor/bonji-input/SOURCE.md`。
- ⚠️ **防腐層、藏文核心、規則表、引擎、`data/assist.json` 與兩支字型有一個下游複製點**：手機版 [`tibetan-siddham-mobile`](https://github.com/scottgfhong310/tibetan-siddham-mobile)（2026-10-12）。改了要複製過去並在那邊跑 `npm run verify`；本 repo 不推、也不會提醒。
- 之所以這樣分：`siddham.js` 是外來的、會被整支替換；`tibetan-core.js` 是自有規則核心；兩者語意不同，但對 UI 應呈現**單一介面**——這就是 ACL 的職責。

**偏離家族 §4.2 字面之處**：核心不是 IIFE→`window.XxxLib`，而是**原生 ESM**（`tibetan-core.js` / `siddham.js` / converter / 控制器都 `export`，以 `<script type="module">` 載入）。理由：vendored 引擎本身是 ESM 且 canon 禁止改它，故全鏈走 ESM。守其**精神**（純核心、零依賴、不碰 DOM），與 `bonji` 一致。jQuery / Materialize / Lodash / I18n 仍是 classic CDN globals。

---

## 3. 轉換管線（Pipeline）

`TibetanSiddhamConverter.convert(input)`：

```
原文 input
  → ascii2symbol(input)              // 符號正規化（vendored）
  → latin2ascii(…, { inputMethod })  // 羅馬轉寫 → 共用 ascii 記法（vendored）
  = 共用 ascii  ───────────────┬── ascii2tibetan(ascii, { ignoreSpacesAndHyphens })  → 藏文
                               ├── ascii2siddham(ascii, { ignoreSpacesAndHyphens })  → 悉曇
                               └── ascii2latin (ascii, { transliteration })          → 拉丁
  → 標點跨文字後處理（§5）→ codepoints（§6）
```

- **ascii 是樞紐記法**：三種輸出都從同一份 `ascii` 產生（沿用孵化器原型驗證過的路徑），確保三者同源、不漂移。
- **比 bonji 多一步 async 載表**：藏文核心要先 `fetch ./data/tibetan.tsv`。故 `convert()` 前須 `await converter.ready()`（idempotent）；控制器在 `init` 末尾 await，未就緒前 `convert()` 直接 return（不會丟錯）。悉曇引擎無 runtime fetch。

---

## 4. 羅馬轉寫記法 & `tibetan.tsv`

### 4.1 記法（沿用 bonji-input + 本 app 對照表）

| 類 | 例 | 說明 |
|---|---|---|
| 長母音 | `aa`=ā、`ii`=ī、`uu`=ū | |
| 記號 | `;m`=ṁ(anusvara)、`~m`=m̐(candrabindu)、`.h`=ḥ(visarga) | `~m`/`~n` 是 **token**，不是標點 `~`（§5 注意） |
| 逆舌音（全形） | `.ta .tha .da .dha .na`、大寫別名 `T Th D Dh N` | |
| 子音與下加字 | `ka`→ཀ、`kra`→ཀྲ、`jrii`→ཛྲཱི；音節裡第一個子音畫成全形、之後的由 `tibetan-core` 轉成下加字；後面接母音（含 `a`）就不加 halanta | ⚠️ **每一個子音都是同一個規則**。2026-10-22 之前 `c` `ch` `j` `jh` `;n` `~n` `.t` `.th` `.d` `.dh` `.n` `;s` `.s` 這 13 個另有「`ja`＝基字、`j`＝下加字」兩套記法，longest-match 讓 `jaa` 轉成 ཛ（ā 被吃掉）、`jai` 轉成 ཛི、`jrii` 轉成沒有基字的 ྫྲཱི；**不要把帶 a 的整串加回 TSV**（verify 第 ⑪ 條） |
| vocalic | `r.`/`,r`=ṛ、`l.`/`,l`=ḷ | tibetan-core 內建 `r.`→`,r` alias |

### 4.2 `data/tibetan.tsv`（source of truth）

- 欄位：`kind \t token \t out \t comment`；`#` 開頭為註解列。
- `kind` ∈ `vowel / cons / sign / punct`。
- **兩個消費者、用途不同**：
  - `tibetan-core.js` → 解析成 `Map`（vowel/cons/sign），longest-match tokenize；合併 alias、丟棄註解與順序、丟棄 punct（punct 在 core 未用）。
  - `tibetan-table.js` → 保留**原始列**（token/out/comment + 檔案順序 + alias 列），供對照表逐列呈現（§7）。
- **規則要改就改 TSV**：對照表頁是 TSV 的鏡像，改完即反映。改欄位/格式時須同步檢查兩個解析器。

---

## 5. 標點政策（Punctuation）— 本 app 的核心設計

原則：**藏文為主、悉曇只是對照**。空格與四個標點在三種輸出各有不同處理，集中實作在 **converter ACL 的後處理**（不污染 `tibetan-core` / 引擎）。

### 5.1 對照表

| 輸入 | 藏文輸出 | 悉曇 | 拉丁 |
|---|---|---|---|
| **三個空格**（不論「忽略空格」開關） | **全形空格**(U+3000) | **全形空格**(U+3000) | 收斂成 1 空格 |
| **兩個空格**（限「忽略空格」開啟時） | tsheg `་`(U+0F0B) | 無（合併） | 收斂成 1 空格 |
| 單一空格 | 忽略（仍是音節邊界） | 同左 | 同左 |
| `\|` | shad `།`(U+0F0D) | **忽略** | `\|`（IAST daṇḍa） |
| `\|\|` | nyis shad `༎`(U+0F0E) | **忽略** | `\|\|` |
| `~` | siddhaṁ 符 `𑗁`(U+115C1) | **忽略** | **忽略** |
| `~~` | yig mgo `༄`(U+0F04) | **忽略** | **忽略** |
| `--` | siddhaṁ 符 `𑗁`(U+115C1)（與 `~` 同一個字） | `𑗁`（**保留**） | `--`（還原） |
| 引擎的其他符號記法：`,,` `..` `*` `2` `@` `=`、`*0`–`*7`、`o2` `o2x` `ox2` `ox3` `ox4` `oxx` | **還原成輸入的字面** | 悉曇記號（**保留**） | **還原成輸入的字面** |

最後兩列是**引擎的符號記法**（不是藏文的標點）：悉曇欄保留，因為那本來就是悉曇的記號；拉丁欄與藏文欄不出現悉曇字，只有 `--` 在藏文欄留成 `𑗁`（藏文欄本來就以 `~` 借用同一個字）。〔owner 2026-10-11 逐欄裁定〕
單一個 `-` 仍是連字號（藏文忽略；悉曇在「忽略空格與連字號」開啟時忽略、關閉時保留；拉丁保留）。

**spacing 規則**：任一標點（`། ༎ ༄ 𑗁`）**後面**若接 tsheg（來自雙空格）→ 改成一個普通空格（藏文 shad 後慣例接空格、非 tsheg）。即 `\|  `（後 2 空格）→ `།␣`（後 1 空格）。標點**前**的雙空格仍照常變 tsheg（使用者自控）。

### 5.2 實作關鍵（為什麼這樣寫）

- **`\|` / `\|\|`**：引擎 `ascii2symbol` 會**先**把它們轉成 Siddham 標點 `𑗅`(U+115C5) / `𑗉`(U+115C9)。ACL 再依文字分流：藏文 `𑗅→།`、`𑗉→༎`；拉丁 `𑗅→\|`、`𑗉→\|\|`；悉曇直接移除。
- **`~` / `~~`**：引擎**不**轉換，以字面殘留在輸出。但 `~m`/`~n` 是既有 token，在 tokenize 階段就被吃掉 → 輸出層**只剩「單獨的 `~`」**可安全替換（先 `~~`→`༄`，再 `~`→`𑗁`，最後對悉曇/拉丁 strip 掉 `~`）。
- **首尾不輸出 tsheg**：`ascii2tibetan` 的忽略分支用 pending-tsheg（延後到下個有內容的 chunk 才補；開頭 out 為空不補、結尾 pending 丟棄）。
- **`𑗁` 借用悉曇字形**：藏文欄字型 `Noto Serif Tibetan` 無此字，故 `.tibetan-text` 的 `font-family` fallback 含 `Noto Sans Siddham`，避免缺字方塊。
- **引擎的符號記法由 ACL 依文字分流**〔owner 2026-10-11 逐欄裁定；在那之前 ACL 沒有攔，三欄都原樣出現悉曇記號——拉丁欄會冒出悉曇字、輸入裡的數字 `2` 在三欄都變成 `𑗆`〕。
  - **成因**：引擎 `ascii2symbol` 在管線最前面就把這些記法換成悉曇記號（`--`→U+115C1、`,,`→U+115C2、`..`→U+115C3、`*`→U+115C4、`2`→U+115C6、`@`→U+115C7、`=`→U+115C8，以及這一份引擎多帶的 14 個→U+115CA–U+115D7；見 `vendor/bonji-input/SOURCE.md`），之後三條轉換都把它當成不認得的字元原樣留著。
  - **做法**：`TibetanSiddhamConverter.restoreSymbols()` 把輸出裡的悉曇記號換回輸入的記法——拉丁全部換回；藏文除了 U+115C1 以外全部換回；悉曇不動。對照表（記號 → 記法）在第一次用到時**向引擎問出來**（`ascii2symbol(記法)`），本層不另寫一份碼位。
  - ⚠️ **記法清單 `ENGINE_SYMBOL_TOKENS` 是引擎那張表的鍵的第二份**。引擎多了一個記法而這裡沒跟上，那個記號會照舊穿進拉丁與藏文欄。`scripts/verify.js` 第 ⑨ 條**直接讀引擎原始碼的表**逐一去驗（不讀本層的清單），漏了會紅。
  - **結果**：`ka--ka` → 藏文 `ཀ𑗁ཀ`／悉曇 `𑖎𑗁𑖎`／拉丁 `ka--ka`；`ka2` → `ཀ2`／`𑖎𑗆`／`ka2`。上面的 spacing 規則照樣適用（它認的是字元不是來源）：`ka--  ka` 的藏文是 `ཀ𑗁␣ཀ`。
  - ⚠️ 帶字母的那幾個（`o2` `o2x` `ox2` `ox3` `ox4` `oxx`）在藏文欄是**字面的拉丁字母**——`o2` 顯示成 `o2`，不是 ཨོ 加 `2`。那是「還原成輸入的字面」的直接結果。
  - ⚠️ 還原認的是**字元不是來源**：直接把悉曇記號（例如 `𑗆`）貼進輸入，拉丁欄與藏文欄同樣會顯示成它的記法（`2`）。
  - 輔助輸入面板仍然不放 `--`（§13）：要在藏文欄出 `𑗁`，面板給的是 `~`。

### 5.3 三個空格＝一個全形空格〔owner 2026-10-11〕

連打**三個半形空格**，藏文與悉曇兩欄各多一個**全形空格**（U+3000）。同一個記法也在 `bonji`／`bonji-mobile`／原型 `tibetan`；取三個而不是兩個，是因為兩個在本 app 已經是 tsheg。

- ⚠️ **這改了一件既有的事**：在這之前「連續 ≥2 個空格」都是 tsheg，所以三個、四個、五個空格以前也出 tsheg。現在**恰好兩個**（或三個一組之後剩下的兩個）才是 tsheg。
- **由左而右每三個一組**；剩下的一個或兩個留在後面、照原本的規則：四個＝全形＋一個空格、六個＝兩個全形。
- **不論「忽略空格」開或關**都成立。
- **藏文：全形空格後面不接 tsheg**（與「標點後不接 tsheg」同一個道理）——五個空格在藏文欄是一個全形空格，不是全形空格加 tsheg。
- **它是邊界**：`n␣␣␣a` 的悉曇是 𑖡𑖿□𑖀（n 收 virama、a 是獨立母音）。⚠️ 這一點與引擎自己的「忽略空格」不同——單一空格在悉曇欄會被併掉（`n␣a` → 𑖡），全形空格是看得見的分隔，兩側不可以併。
- **貼著邊緣也留著**：行首的三個空格是一個全形空格的縮排；貼著換行時換行不受影響。標點後照樣出現（`\|␣␣␣` → `།□`）。
- **拉丁不動**：照舊把連續空格收斂成一個。碼位欄是對各自的輸出算的，藏文與悉曇會出現 `U+3000`。
- 直接打一個全形空格的行為沒有變（藏文核心把它當一般空白）。

**實作**（防腐層 `convert()`）：把共用的 ascii 依「三個空格」切段，**各段各自轉**（藏文、悉曇各一次），段與段之間補 U+3000。切段再轉、而不是轉完再換，是因為兩個引擎都把空格吃掉或改寫了，轉完就認不出原本是幾個；各段獨立也讓它自然成為邊界。`tibetan-core` 與 vendored 引擎都沒有動。

**驗證**：`scripts/verify.js` 第 ⑩ 條（14 筆寫死的期望值 × 兩種輸入法）；另以改前那一份當對照組做過差分——不含三個連續空格的輸入，六個輸出欄逐字相同（6 萬筆隨機輸入、四種選項組合，0 不符）。

---

## 6. 碼位（Codepoints）

`TibetanSiddhamConverter.toCodepoints(text)`：逐行、每字輸出 `U+XXXX`（≥4 位、padStart、大寫）。`convert()` 對 tibetan/siddham/latin 各算一份；UI 的「Unicode 碼位」欄顯示**藏文**那份（本 app 焦點）。

---

## 7. 字元對照表頁（chart.html）

- **版面**：一個 `kind` 一欄（母音 / 子音 / 記號 / 標點），響應式 grid（寬螢幕並排、窄螢幕收合）。每列＝`token → 藏文 │ 悉曇 │ 說明`。
- **資料**：`tibetan-table.js`（純解析，§4.2）+ `chart.js`（渲染、主題、語言、導覽）。
- **顯示細節**：
  - **組合字元**（藏文母音記號/subjoined/記號、悉曇母音記號/anusvara…）單獨會浮空 → 一律加點圈 `◌`(U+25CC) 當載體。判定範圍：藏文 `0F71–0F87`/`0F8D–0FBC`（+ 少數）、悉曇 `115AF–115C0`。
  - **空 `out`**（inherent `a`、被忽略的 hyphen）→ `—`；空格 token → `␣`。
  - **悉曇對照**用 `TibetanSiddhamConverter.siddhamForToken(token)`：先正規化（vocalic 點→逗號 `r.`→`,r`；大寫逆舌音別名 `T/Th/D/Dh/N/Sh`→小寫全形 `.ta/.tha/.da/.dha/.na/.sa`），再轉；**殘留 ASCII = 無對應**回 `""` → UI 顯示 `—`。
- **導覽**：以 `window.open('chart.html','_blank')` 開新分頁（**用 window.open 而非 `target=_blank`**，才保留 `opener`）；對照表的「返回」若有 opener 就 `focus()` + `close()` 關回原分頁，否則就地導回 `index.html`。

---

## 8. 後端與 `config.json`（backend 開關）

- **API**（`routes/tibetan-siddham.js`，`{ ok }` 信封）：`POST /export`（存 `tibetan-siddham-yyyyMMddHHmmss.json`，檔名 server 產生）、`GET /downloads`（降冪列出）、`POST /clear`（清空，目標寫死 server）。匯出檔以 `/download/tibetan-siddham/<file>` 靜態提供。安全：目標目錄寫死、`startsWith(DATA_DIR+sep)` 落點檢查、前端 `confirm()`。
- **血緣（lineage）**：前端以 `loadedFrom` 記「目前內容來自哪個匯出檔」；點清單載回會設 `loadedFrom`，再匯出時把它寫進新檔的 `sourceFile`（顯示於 `#source-row`）。
- **`config.json`（後端開關）**：`{ "backend": true | false }`，前端 `loadConfig()` 在 `init` 讀取。
  - `true`（預設）：用後端（下載＝先匯出再下載）。
  - `false`：`applyBackendMode()` 隱藏 downloads/export/clear-downloads 三工具，下載改 **client-side Blob**（不打 `/api`），app 可純靜態託管。
  - 讀不到 config（多半無伺服器）→ 視為 `false`。
  - 後端 route **永遠掛著**，`false` 時閒置不被呼叫——開關控的是「**前端對後端的依賴**」，改 config 重載即可，不需重啟 server。

---

## 9. 資料結構（Data structures）

兩份對外 JSON 的完整結構見 `README.md`「Data structures / 資料結構」一節：(1) `convert()` 回傳、(2) 匯出檔 `tibetan-siddham-yyyyMMddHHmmss.json`。純前端模式的 Blob 下載與匯出檔**同形狀**。

---

## 10. 字型（Fonts）

- 藏文 `Noto Serif Tibetan`（目前 **TTF**；本機無 woff2 轉檔工具，**日後轉 woff2** 為待辦）。
- 悉曇 `Noto Sans Siddham`（woff2）。
- 皆 `@font-face` 內嵌（CDN 無可靠來源），否則輸出是缺字方塊。
- `.tibetan-text` fallback 含 `Noto Sans Siddham`（供借用的 `𑗁`，§5.2）。

---

## 11. 延後 / 未做（Deferred）

孵化器原型 `InProgress/public/apps/tibetan/` 有、但本 app **尚未做**：即時 IME 逐鍵輸入法、Devanāgarī（天城體）輸入，以及螢幕虛擬鍵盤（VK）的其餘分頁（悉曇、天城體、藏文 Unicode 區塊）。

VK 的「藏文梵字」五組已於 2026-10-11 以**輔助輸入面板**的形式進來（§13）——它只做「點一格插入記法」，不是 IME。

## 12. 來源（Provenance）

由孵化器原型 `InProgress/public/apps/tibetan/`（fork 自 bonji-input + 自製藏文核心）抽取乾淨資產而成：`tibetan-core.js`←`lib/tibetan.js`、`data/tibetan.tsv`←`lib/data/tibetan.tsv`、`vendor/bonji-input/siddham.js`←`lib/siddham.js`。

## 13. 輔助輸入面板（index.html）

看著藏文字形、在面板裡認出它、點一下就把它的羅馬記法插進輸入欄。**形制照 `bonji` 的輔助輸入**（固定在右側的 dock、搜尋、分類 chips、底部輔助鈕；`assist.js` + `assist.css`），**鍵位由孵化器原型 `tibetan` 的虛擬鍵盤「藏文梵字」五組整理而來**。

| 類 | 格數 | 每一格插入什麼 |
|---|---|---|
| 母音（獨立元音） | 16 | `a` `aa` … `a;m` `a.h` |
| 子音 | 34 | 全形、**帶隱含 a**：`ka` `kha` … `k.sa` |
| 元音符號 | 16 | `a`（隱含 a，只畫載體）`aa` `i` … `;m` `.h` |
| 下加輔音 | 37 | **不帶 a**：`k` `kh` … `k.s`；其中 3 格是固定形、不可插入 |
| 標點 | 5 | 兩個空格（tsheg）、`\|`、`\|\|`、`~`、`~~` |

合計 **108** 格。

- **資料 `data/assist.json`**（策展、可手改）：`categories[].entries[]`，每格 `code`（記法）＋ `char`（字形，NFC）＋選用的 `label`／`note`。類別上的 `carrier` 表示「這一類是組合字元，畫的時候前面加點圈」——**哪一類要加載體寫在資料裡，`assist.js` 不判斷碼位範圍**（`chart.js` 已有一份碼位範圍的判斷，再寫一份就是同一條規則兩份實作）。
- **每一格說的話由 `scripts/verify.js` 逐格驗**：把記法真的餵給防腐層，藏文輸出要等於那一格的字形，ISO 15919 與 Kyoto-Harvard 兩種輸入法各驗一次。字形來自資料、輸出來自轉換器，兩邊不同源，比對才有意義。驗的時候子音／母音直接比，元音符號接在 `k` 之後，下加輔音接在 `m` 之後（`k`／`g`／`t`… 後面接 `h` 會變成送氣音，`m` 不與任何字母併成別的記法），標點夾在兩個音節之間。
- **單獨驗每一格看不見「子音後面再接東西」**：第 ⑪ 條把每一個子音鍵去掉隱含的 a，接上每一個元音符號與下加 `r`／`y`／`v`，藏文要等於「子音字形＋那幾個字形」（期望值來自面板資料、不來自規則表）。⚠️ 唯一的豁免是 `ny`：TSV 的別名 `ny`＝ña 與 n＋ya 撞號（`nya` 轉成 ཉ，悉曇與拉丁是 n＋ya）——要不要拿掉別名還沒有裁決；豁免寫在檢查裡，哪天它轉對了檢查會要求拿掉豁免。
- ⚠️ **子音鍵帶隱含 a，所以「子音鍵＋元音符號鍵」不是你以為的那個字**：`ka` 之後再按 `i` 是 `kai`＝ཀཻ（ai）。要接母音請用**下加輔音**那一組的記法（不帶 a）：`k` ＋ `i` ＝ ཀི——音節開頭的 `k` 照樣畫成全形。這與 `bonji` 面板的「子音／體文／接續」是同一個慣例；面板只插入記法，不替你改寫前一個字。
- **「不可插入」的 3 格**（下加輔音裡的固定形 U+0FBA／U+0FBB／U+0FBC）：轉換器不產生它們，留著是為了辨認；點了只出提示（`assist.noinput`）。第 ④ 條檢查盯著它們**真的打不出來**。
- **標點一組依本 app 的標點政策（§5），不是照抄原型**：原型那一組的 `--`（࿓）、`/`、`.` 與三個全形鍵是它 IME 模式才有的行為，本 app 沒有 ⇒ 不收；另收原型沒有的 `~`（𑗁）與 tsheg（兩個空格）。⚠️ `--` 是引擎的符號記法（§5.1 表的最後兩列、§5.2 最後一條）：藏文欄也出 𑗁，但悉曇欄會留著它、拉丁欄還原成 `--`——與 `~` 不同。面板只放 `~`。
- **與原型的另外三處不同**：`tha` 那一格原型的標籤誤植成字面 `tha`，這裡是 ཐ；字形一律存 NFC（藏文的預組字元如 U+0F43 在 NFC 下會拆開，而轉換器的輸出是 NFC）；三個固定形在原型裡按下去會插入一般的 `y`／`r`／`v`，這裡改成不可插入。
- **與控制器解耦**：`assist.js` 是 classic IIFE、不 import 任何模組，只碰 `#ts-input` 與 `#setting-assist`；點一格 → 插入游標處 → 派發 `input` 事件，控制器既有的監聽即時重轉。
- **版面**同 `bonji`：`position: fixed` 覆蓋式、不推主畫面；開啟時隱藏 side-tools，標題列 ⋮ 鈕可再叫出（此時 dock 讓到 `right: 70px`）、× 關閉。開關狀態存 `localStorage`（`tibetan-siddham-assist-open`）。底部三顆輔助鈕：空格／換行／連字號。搜尋框掛家族共用的 `filter-clear`（§5.12）。
- **與 `bonji` 不同的兩點**：只有一個群（一排 chips）；**不讀任何本機字型**（全部是隨附的 Noto Serif Tibetan，借用的 𑗁 落到 Noto Sans Siddham），所以沒有缺字型說明那一段。另外開啟面板時不把焦點搶到搜尋框——游標留在輸入欄。

## 14. 對照檢視（校對用）〔owner 2026-10-23〕

**緣起**：校對以藏文為主，看到錯的藏文要回輸入欄重打；內容一長就「對不準」，找不到那個字在輸入裡的哪裡（owner 拿藥師長咒說明）。⇒ 輸出卡裡在「藏文梵字」之下多一塊**對照**：輸入的每一格各一張卡，**藏文在上、拉丁在下**；**點一張卡 → 輸入欄選取那一段**，直接打字就是取代它。這是第一階段；第二階段（卡片就地變成小輸入框）尚未做。

- **一格＝輸入裡一段不含空白的記法**，由防腐層的 `segments(input)` 切出來，回 `{ text, start, end, gap, tibetan, latin }`。`start`／`end` 是在**原始輸入**裡的位置（不是 ascii 裡的——`ā` → `aa` 會改變長度），控制器拿它 `setSelectionRange`。
- **為什麼一格一格轉得出與整段相同的結果**：藏文核心本來就以空白切塊、一塊一塊轉，空白只決定塊與塊之間接什麼（§5）。**第 ⑫ 條不信這段話**：拿整段的 `convert()` 去對——兩邊拿掉分隔（tsheg、空白、全形空格、換行）之後，各格接起來的藏文與拉丁要逐字等於整段；語料是藥師長咒原文、範例、IAST／Kyoto-Harvard、標點與空格的各種組合、面板 108 格的記法，兩種輸入法 × 忽略空格開／關。
- ⚠️ **唯一的豁免：只隔一個空格的 `~`**（第 ⑫ 條明列）。「忽略空格＝開」時整段轉換先吃掉空格、藏文核心接出 `~~`／`~~~`，標點政策再把前兩個換成 ༄：`~ ~` → ༄、`~ ~~` → ༄𑗁；一格一格轉則是 𑗁 𑗁、𑗁 ༄。**是不是錯、改哪一邊待 owner 裁決**——對照檢視照一格一格的畫，所以這兩種輸入在對照與藏文欄會不一樣。哪天整段不再併起來，檢查會要求拿掉豁免。
- **只給藏文與拉丁**：悉曇引擎會跨過單一空格組成連字，一格一格轉出來的不是整段的樣子。
- **怎麼分行、分組只看那一格前面的空白**（控制器）：含換行或三個以上空格（全形空格）→ 新的一行（藥師長咒是一句一行）；「忽略空格」開著時只隔一個空格 → 同一個藏文音節、卡貼在一起（`su bda` → སུབྡ）；其餘 → 新的一組，組與組之間畫 tsheg，前一格以標點結尾就只留間距（同 §5 的「標點之後不接 tsheg」）。
- **選取與卡片雙向**：輸入欄有焦點時，與目前選取（或游標）重疊的卡標成 `active`——點卡、在輸入欄移動游標、打字之後都會重標。按下卡片時 `preventDefault` 不搶焦點；選取的那一行不在畫面上時把它捲到視窗上方三分之一處（以隱形的鏡像 div 量那一行的位置；「減少動態」時瞬移）。
- 卡片是 `<button type="button">`（不是 `<a href="#!">`）；卡上的 `title` 是那一格的記法原文。

---

*MIT © 2026 Scott G.F. Hong*
