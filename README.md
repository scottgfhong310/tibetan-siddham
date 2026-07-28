# tibetan-siddham — Tibetan Sanskrit Converter

> 繁體中文：[README.zh-Hant.md](./README.zh-Hant.md) ・ 日本語：[README.ja.md](./README.ja.md)

A single-page WebApp that converts **ASCII / IAST romanization** into **Tibetan-script Sanskrit (藏文梵字)**, **Siddhaṁ script**, **Latin transliteration**, and **Unicode code points** — all in the browser.

Part of the **nodeapp WebApp family**; shared conventions live in
<https://github.com/scottgfhong310/nodeapp-webapp-family> (`DESIGN_GUIDELINES.md`, `WORKFLOW.md`).
App-specific design decisions (architecture, conversion pipeline, punctuation policy, config toggle) are in [`DESIGN.md`](DESIGN.md).

## Features

- **Tibetan + Siddhaṁ in one pass** — type a romanized mantra, get the Tibetan-script spelling, the Siddhaṁ script, the Latin transliteration and the Tibetan Unicode code points side by side.
- **In-browser conversion** — the conversion itself is fully client-side (no round-trip).
- **Tibetan punctuation** — with *ignore spaces* on, a double space → tsheg `་`; `|` → shad `།`, `||` → nyis shad `༎`, `~` → siddhaṁ sign `𑗁`, `~~` → yig mgo `༄` (Siddhaṁ ignores these marks; it has no separators).
- **Character chart** — `chart.html` lists `tibetan.tsv` as columns (one per kind), each row showing romanization → Tibetan · Siddhaṁ.
- **Export / list / reload** — save a conversion as JSON to the server, list / reload / clear exports (see API below).
- **Embeddable core** — the only conversion surface is `TibetanSiddhamConverter` (an anti-corruption layer; pure logic, no DOM).
- **Family canon** — CSS-variable light/dark theme (default dark), three languages (`zh-Hant / en / ja`), Materialize-native form elements, the family side-tool rail.

## Run

```bash
npm install
npm start                 # → http://localhost:3000/apps/tibetan-siddham/
# PORT=4070 npm start     # run on another port
```

`/` redirects (302) to `/apps/tibetan-siddham/`.

## Layout

```
app.js                              # Express: static + /api/tibetan-siddham + / → 302 /apps/tibetan-siddham/ ; PORT||3000
routes/tibetan-siddham.js           # API: POST /export, GET /downloads, POST /clear ({ ok } envelope)
public/download/tibetan-siddham/.gitkeep   # exported JSON lands here (contents gitignored)
public/apps/tibetan-siddham/        # front-end (served at /apps/tibetan-siddham/)
├─ index.html · tibetan-siddham.css · tibetan-siddham.js   # converter page: structure / style / glue (ESM module)
├─ chart.html · chart.css · chart.js · tibetan-table.js    # character chart page (one column per kind)
├─ tibetan-siddham-converter.js     # anti-corruption layer: the ONLY conversion interface (ESM, no DOM)
├─ tibetan-core.js                  # project Tibetan rules core (initTibetan + ascii2tibetan)
├─ data/tibetan.tsv                 # Tibetan mapping table (source of truth)
├─ vendor/bonji-input/{siddham.js, LICENSE, SOURCE.md}     # vendored Siddhaṁ engine (MIT, unmodified)
├─ fonts/{NotoSerifTibetan-Regular.ttf, NotoSansSiddham-Regular.woff2, *-OFL.txt}
├─ i18n.js · locales/{zh-Hant,en,ja}.js
└─ side-tool.css · materialize-dark.css
```

## API (`routes/tibetan-siddham.js`, `{ ok }` envelope)

| Method | Path | Description |
|---|---|---|
| POST | `/api/tibetan-siddham/export` | Save `{ title, options, input, output, sourceFile }` as `public/download/tibetan-siddham/tibetan-siddham-yyyyMMddHHmmss.json` (filename generated server-side). Returns `{ ok, filename, path }`. |
| GET | `/api/tibetan-siddham/downloads` | List the export folder, descending by filename. Returns `{ ok, files }`. |
| POST | `/api/tibetan-siddham/clear` | Delete all JSON in the export folder (target hardcoded server-side). Returns `{ ok, removed }`. |

Exports are served statically at `/download/tibetan-siddham/<file>`. The side **download** button exports first, then downloads the produced JSON; clicking a list item reloads that file's title / options / input and tracks lineage via `sourceFile`.

## Core library — `TibetanSiddhamConverter`

```js
import { TibetanSiddhamConverter } from "./tibetan-siddham-converter.js";

const c = new TibetanSiddhamConverter({ inputMethod: "ISO15919", transliteration: "IAST" });
await c.ready();                     // loads ./data/tibetan.tsv once (idempotent)
const r = c.convert("siddha;m");
// r = { input, tibetan, siddham, latin, codepoints: { tibetan, siddham, latin } }
```

- `new TibetanSiddhamConverter(options?)` — options: `inputMethod` (`"ISO15919" | "KH"`), `transliteration` (`"ISO15919" | "IAST"`), `ignoreSpacesAndHyphens` (boolean).
- `setOptions(patch)` → `this`.
- `ready()` → `Promise<void>` — must be awaited before `convert()` (the Tibetan core fetches its TSV).
- `convert(input)` → `TibetanSiddhamResult`.

**Boundary discipline:** the rest of the app imports **only** `tibetan-siddham-converter.js`; it never imports `vendor/bonji-input/siddham.js` or `tibetan-core.js` directly. Upgrading the Siddhaṁ engine touches only the wrapper.

## Data structures

**`TibetanSiddhamConverter.convert(input)` →**

```jsonc
{
  "input":   "string",          // original input, returned as-is
  "tibetan": "string",          // Tibetan-script Sanskrit
  "siddham": "string",          // Siddhaṁ script
  "latin":   "string",          // Latin transliteration
  "codepoints": {               // "U+XXXX …" per line, one per script
    "tibetan": "string",
    "siddham": "string",
    "latin":   "string"
  }
}
```

**Export file `tibetan-siddham-yyyyMMddHHmmss.json`** (written by `POST /api/tibetan-siddham/export`; the client-side Blob in static mode has the same shape):

```jsonc
{
  "app":        "tibetan-siddham",   // fixed; added by server (or client in static mode)
  "exportedAt": "string",            // ISO-8601; added at save time
  "sourceFile": "string | null",     // file this was derived from (lineage), else null
  "title":      "string",            // user-entered title (may be empty)
  "options": {
    "inputMethod":            "\"ISO15919\" | \"KH\"",
    "transliteration":        "\"ISO15919\" | \"IAST\"",
    "ignoreSpacesAndHyphens": "boolean"
  },
  "input":  "string",                // the romanized input
  "output": {                        // the four displayed outputs
    "tibetan":    "string",
    "siddham":    "string",
    "latin":      "string",
    "codepoints": "string"           // the Tibetan code points shown in the UI
  }
}
```

## Notes

- **Backend toggle — `config.json`:** `public/apps/tibetan-siddham/config.json` holds `{ "backend": true | false }`, read by the front-end at startup. `true` (default) uses the server export/list/reload/clear (download = export then download). `false` hides those three tools, makes the download button a client-side Blob, and calls no `/api` — so the app can be served as pure static files (e.g. GitHub Pages). The route stays mounted but idle when off.
- **Conversion is client-side; export/list needs the Node server.** The Tibetan core does one same-origin `fetch` of `data/tibetan.tsv` at startup; the Siddhaṁ engine does no runtime fetch. Because of the export/list API, this app needs its Node server (not GitHub-Pages static).
- **Fonts:** Tibetan ships as TTF (no woff2 build tooling on hand); Siddhaṁ as woff2. Converting Tibetan to woff2 is a future cleanup.
- **Deferred:** live-IME typing, the on-screen virtual keyboard and Devanāgarī input (all present in the incubator prototype) are intentionally not included yet.

## Credits

- Siddhaṁ engine: [mandel59/bonji-input](https://github.com/mandel59/bonji-input) (MIT), vendored unmodified.
- Fonts: Noto Serif Tibetan, Noto Sans Siddham (SIL Open Font License).

[MIT](LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
