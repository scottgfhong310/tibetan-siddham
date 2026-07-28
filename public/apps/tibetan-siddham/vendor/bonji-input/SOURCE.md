# Vendored: bonji-input Siddham engine

- Source:        https://github.com/mandel59/bonji-input
- License:       MIT (see ./LICENSE)
- Files taken:
  - siddham.js            (悉曇引擎，原樣不改)

> 本檔取自 nodeapp WebApp 家族的孵化器原型 `InProgress/public/apps/tibetan/lib/siddham.js`，
> 與已發佈的 `bonji` app 所 vendored 的是**同一支引擎**（mandel59/bonji-input，MIT）。
> 釘選 commit 以 `bonji` 倉庫的 `vendor/bonji-input/SOURCE.md` 為準。

> 僅取悉曇（ASCII/IAST → Siddhaṁ / Latin）部分；本 app 的天城體（Devanāgarī）輸入
> **未** vendored（第一階段不做），故 `devanagari.js` / `devanagari.tsv` 刻意不在此目錄。

本 app 其餘程式**只 import `../../tibetan-siddham-converter.js`**（防腐層），
不得直接 import 本目錄下的 `siddham.js`，亦不得直接 import `tibetan-core.js`。
