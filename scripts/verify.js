#!/usr/bin/env node
/**
 * verify.js — tibetan-siddham 的契約檢查（輔助輸入面板 ＋ 引擎符號記法的分流）。
 *
 *   node scripts/verify.js             跑全部檢查（任何一條 FAIL ⇒ exit 1）
 *   node scripts/verify.js --selftest  反向驗證：在記憶體裡把世界改壞，每一種改壞都必須被對應的那一條抓到
 *
 * 面板的每一格都在說一句話：「按這一格，藏文欄會出現這個字」。那句話的兩半來自兩個地方——
 * 字形是 data/assist.json 寫的，轉出什麼是防腐層（TibetanSiddhamConverter）算的——
 * 所以這裡把每一格的記法真的餵給防腐層，逐格比對。兩邊不同源，比對才有意義。
 */
'use strict';

// 轉換模組是 ESM 而 package.json 沒有 type:module（app.js 是 CommonJS）
// ⇒ Node 會印一次 MODULE_TYPELESS_PACKAGE_JSON 警告。那是預期的，不讓它淹掉報表。
process.removeAllListeners('warning');

const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');

const REPO = path.resolve(__dirname, '..');
const APP = path.join(REPO, 'public', 'apps', 'tibetan-siddham');
const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');

const LANGS = ['zh-Hant', 'en', 'ja'];
const CAT_IDS = ['vowel', 'consonant', 'vowel_sign', 'subjoined', 'punct'];
const METHODS = ['ISO15919', 'KH'];
const KA = String.fromCodePoint(0x0F40);
const MA = String.fromCodePoint(0x0F58);

const cp = (s) => Array.from(s, (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ') || '(空)';

/* ---------- 讀進「世界」：之後所有檢查只看這個物件（selftest 才改得壞它） ---------- */

function loadLocale(lang) {
  let dict = null;
  const I18n = { register: (code, d) => { dict = d; } };
  new Function('I18n', read(`locales/${lang}.js`))(I18n);
  if (!dict) throw new Error(`locales/${lang}.js 沒有呼叫 I18n.register`);
  return dict;
}

async function loadWorld() {
  // 藏文核心以 fetch(import.meta.url 相對路徑) 讀 TSV；Node 的 fetch 不吃 file:// ⇒ 掛一個只讀本機檔的替身
  globalThis.fetch = async (u) => {
    const text = fs.readFileSync(fileURLToPath(String(u).split('?')[0]), 'utf8');
    return { ok: true, status: 200, text: async () => text };
  };
  const { TibetanSiddhamConverter } = await import(pathToFileURL(path.join(APP, 'tibetan-siddham-converter.js')));
  const conv = new TibetanSiddhamConverter();
  await conv.ready();

  // 「哪些記法是記號（接在帶母音的音節之後）」取自規則表，不取自面板資料
  const signs = new Set(read('data/tibetan.tsv').split(/\r?\n/)
    .filter((l) => l.startsWith('sign\t')).map((l) => l.split('\t')[1]));
  if (!signs.size) throw new Error('tibetan.tsv 裡讀不到任何 sign 列——檢查的前提不成立');

  const locales = {};
  for (const l of LANGS) locales[l] = loadLocale(l);

  // 引擎的符號記法：**直接讀引擎原始碼裡那張表**（記法 → 悉曇記號），不取自防腐層自己的清單——
  // 防腐層漏了一個記法時，要靠這張表才問得出「還有哪一個沒被分流」。
  const engineSrc = read('vendor/bonji-input/siddham.js');
  const table = /const\s+ascii_symbol\s*=\s*\{([\s\S]*?)\n\}/.exec(engineSrc);
  if (!table) throw new Error('引擎原始碼裡找不到 ascii_symbol 表——檢查的前提不成立');
  const engineSymbols = Array.from(table[1].matchAll(/"([^"]+)":\s*"\\u\{([0-9a-fA-F]+)\}"/g))
    .map((m) => ({ token: m[1], char: String.fromCodePoint(parseInt(m[2], 16)) }));
  if (engineSymbols.length < 9) throw new Error(`ascii_symbol 表只讀到 ${engineSymbols.length} 項——多半是解析壞了`);

  return {
    data: JSON.parse(read('data/assist.json')),
    signs,
    engineSymbols,
    convert: (input, inputMethod) => {
      conv.setOptions({ inputMethod, ignoreSpacesAndHyphens: true });
      return conv.convert(input);
    },
    locales,
    html: read('index.html'),
    assistSrc: read('assist.js'),
    appJs: fs.readdirSync(APP).filter((f) => f.endsWith('.js'))
      .map((f) => ({ name: f, src: read(f) })),
  };
}

/* ---------- 每一格在什麼前後文裡驗 ---------- */

// 回傳 [餵給轉換器的字串, 期望的藏文輸出]
function expectation(catId, entry, signs) {
  const { code, char } = entry;
  switch (catId) {
    case 'vowel':
    case 'consonant':
      return [code, char];
    case 'vowel_sign':                     // 記號接在 ka 之後；母音符號接在 k 之後
      return [(signs.has(code) ? 'ka' : 'k') + code, KA + char];
    case 'subjoined':                      // 接在 m 之後（m 不與任何字母併成別的記法；k/g/c/t… 後面接 h 會變送氣音）
      return ['m' + code + 'a', MA + char];
    case 'punct':                          // 夾在兩個音節之間（tsheg 只出現在內容之間）
      return ['ka' + code + 'ka', KA + char + KA];
    default:
      return null;
  }
}

/* ---------- 檢查：每一條回傳錯誤訊息陣列（空＝通過） ----------
 * 形狀是「一條一個帶 name 的物件」——家族稽核 test-readme-counts.js 靠這個形狀數條數。 */

const CHECKS = [
  { name: '① 資料的形狀：五類、順序固定、每格都有 code 與 char（字串），字形是 NFC', run: (w) => {
    const out = [];
    const cats = w.data.categories;
    if (!Array.isArray(cats)) return ['categories 不是陣列'];
    const ids = cats.map((c) => c.id);
    if (ids.join(',') !== CAT_IDS.join(',')) out.push(`類別是 [${ids}]，應為 [${CAT_IDS}]`);
    for (const c of cats) {
      if (!Array.isArray(c.entries) || !c.entries.length) { out.push(`${c.id}：沒有任何格`); continue; }
      c.entries.forEach((e, i) => {
        if (typeof e.code !== 'string' || typeof e.char !== 'string') out.push(`${c.id}[${i}]：code／char 必須是字串`);
        else if (e.char.normalize('NFC') !== e.char) out.push(`${c.id}[${i}] ${JSON.stringify(e.code)}：char 不是 NFC`);
      });
    }
    return out;
  } },

  { name: '② 每一格的記法餵給防腐層，藏文輸出＝那一格的字形（ISO 15919 與 Kyoto-Harvard 兩種輸入法）', run: (w) => {
    const out = [];
    let n = 0;
    for (const c of w.data.categories || []) {
      for (const e of c.entries || []) {
        if (!e.code) continue;                               // 沒有記法的格由第 ④ 條管
        const ex = expectation(c.id, e, w.signs);
        if (!ex) { out.push(`${c.id}：不認得的類別，沒有驗證方式`); break; }
        for (const m of METHODS) {
          n++;
          const got = w.convert(ex[0], m).tibetan;
          if (got !== ex[1]) out.push(`${c.id} ${JSON.stringify(e.code)}（${m}）：輸入 ${JSON.stringify(ex[0])} 得到 ${cp(got)}，面板寫的是 ${cp(ex[1])}`);
        }
      }
    }
    if (!n) out.push('一格都沒有驗到——空的比對不算通過');
    return out;
  } },

  { name: '③ 載體（點圈）只加在組合字元上：有 carrier 的類每一格都以組合記號開頭，沒有的類一格都不是', run: (w) => {
    const out = [];
    for (const c of w.data.categories || []) {
      for (const e of c.entries || []) {
        if (!e.char) continue;                               // inherent a：沒有記號，只畫載體
        const combining = /^\p{M}/u.test(e.char);
        if (c.carrier && !combining) out.push(`${c.id} ${JSON.stringify(e.code)}：這一類會加載體，但 ${cp(e.char)} 不是組合記號開頭`);
        if (!c.carrier && combining) out.push(`${c.id} ${JSON.stringify(e.code)}：${cp(e.char)} 是組合記號開頭，但這一類不加載體（會浮空）`);
      }
    }
    return out;
  } },

  { name: '④ 「不可插入」的格是真的打不出來：它標的那個記法（alt）轉出來的是別的字', run: (w) => {
    const out = [];
    for (const c of w.data.categories || []) {
      for (const e of c.entries || []) {
        if (e.code) continue;
        if (!e.alt) { out.push(`${c.id} ${cp(e.char)}：沒有記法也沒有 alt，看不出它為什麼在這裡`); continue; }
        const ex = expectation(c.id, { code: e.alt, char: e.char }, w.signs);
        for (const m of METHODS) {
          if (w.convert(ex[0], m).tibetan === ex[1]) out.push(`${c.id} ${cp(e.char)}：記法 ${JSON.stringify(e.alt)}（${m}）其實轉得出它——不該標成不可插入`);
        }
      }
    }
    return out;
  } },

  { name: '⑤ 同一類裡同一個記法只出現一次（兩格同記法＝其中一格在說謊）', run: (w) => {
    const out = [];
    for (const c of w.data.categories || []) {
      const seen = new Set();
      for (const e of c.entries || []) {
        if (!e.code) continue;
        if (seen.has(e.code)) out.push(`${c.id}：記法 ${JSON.stringify(e.code)} 重複`);
        seen.add(e.code);
      }
    }
    return out;
  } },

  { name: '⑥ 三語的 key 集合相同，而且面板用到的 key 三語都有（含每一類的 assist.cat.<id>）', run: (w) => {
    const out = [];
    const base = Object.keys(w.locales[LANGS[0]]).sort().join('\n');
    for (const l of LANGS.slice(1)) {
      if (Object.keys(w.locales[l]).sort().join('\n') !== base) out.push(`${l} 的 key 集合與 ${LANGS[0]} 不同`);
    }
    const used = new Set(['assist.cat.all', 'assist.noinput', 'assist.empty', 'tool.clearFilter']);
    for (const c of w.data.categories || []) used.add('assist.cat.' + c.id);
    const panel = (w.html.match(/<section id="assist-panel"[\s\S]*?<\/section>/) || [''])[0];
    if (!panel) out.push('index.html 裡找不到 #assist-panel');
    const tool = (w.html.match(/<div id="setting-assist"[^>]*>/) || [''])[0];
    for (const m of (panel + tool).matchAll(/data-i18n(?:-title|-placeholder|-html)?="([^"]+)"/g)) used.add(m[1]);
    for (const k of used) for (const l of LANGS) {
      if (!(k in w.locales[l])) out.push(`${l} 缺 ${k}`);
    }
    return out;
  } },

  { name: '⑦ 頁面上的接線：面板、搜尋框（帶 data-filter-clear）、分類列、字形區、開關鈕、輸入欄都在；script 順序正確', run: (w) => {
    const out = [];
    const need = ['id="assist-panel"', 'id="assist-search"', 'id="assist-cats"', 'id="assist-body"',
      'id="assist-close"', 'id="assist-toggle-tools"', 'id="setting-assist"', 'id="ts-input"'];
    for (const n of need) if (!w.html.includes(n)) out.push(`index.html 缺 ${n}`);
    if (!/<input id="assist-search"[^>]*data-filter-clear/.test(w.html)) out.push('#assist-search 沒有 data-filter-clear');
    const pos = (s) => w.html.indexOf(s);
    const order = ['./locales/ja.js', './filter-clear.js', './assist.js', './tibetan-siddham.js'];
    for (let i = 0; i < order.length; i++) {
      if (pos(order[i]) < 0) out.push(`index.html 沒有載入 ${order[i]}`);
      else if (i && pos(order[i]) < pos(order[i - 1])) out.push(`${order[i]} 必須排在 ${order[i - 1]} 之後`);
    }
    for (const css of ['./filter-clear.css', './assist.css']) if (pos(css) < 0) out.push(`index.html 沒有載入 ${css}`);
    return out;
  } },

  { name: '⑧ 邊界紀律：assist.js 不 import 任何模組、不碰轉換；只有防腐層 import 引擎與藏文核心', run: (w) => {
    const out = [];
    if (/^\s*import\s/m.test(w.assistSrc) || /\bimport\s*\(/.test(w.assistSrc)) out.push('assist.js 出現 import');
    // ⚠️ 不可以拿 'siddham.js' 當關鍵字：控制器的檔名 tibetan-siddham.js 就含這個字串（檔頭註解會提到它）
    for (const banned of ['tibetan-core', 'vendor/bonji-input', 'tibetan-siddham-converter']) {
      if (w.assistSrc.includes(banned)) out.push(`assist.js 提到 ${banned}`);
    }
    for (const f of w.appJs) {
      if (f.name === 'tibetan-siddham-converter.js') continue;
      if (/from\s+["'][^"']*(vendor\/bonji-input\/siddham\.js|tibetan-core\.js)["']/.test(f.src)) {
        out.push(`${f.name} 直接 import 了引擎或藏文核心（只有防腐層可以）`);
      }
    }
    return out;
  } },

  { name: '⑨ 引擎的符號記法依文字分流：悉曇保留、拉丁還原成輸入的記法、藏文只留 -- 其餘還原（| 與 || 走標點政策）', run: (w) => {
    const out = [];
    const KA_S = String.fromCodePoint(0x1158E);
    const SIGN = String.fromCodePoint(0x115C1);
    const TIB = { '|': String.fromCodePoint(0x0F0D), '||': String.fromCodePoint(0x0F0E), '--': SIGN };   // 藏文欄的三個例外
    const stray = (text, allow) => Array.from(text).filter((ch) => {
      const c = ch.codePointAt(0);
      return c >= 0x11580 && c <= 0x115FF && ch !== allow;
    });
    let n = 0;
    for (const { token, char } of w.engineSymbols || []) {
      const punct = token === '|' || token === '||';
      for (const m of METHODS) {
        n++;
        const r = w.convert('ka' + token + 'ka', m);
        const wantTib = KA + (token in TIB ? TIB[token] : token) + KA;
        const wantSid = KA_S + (punct ? '' : char) + KA_S;
        const wantLat = 'ka' + token + 'ka';
        if (r.tibetan !== wantTib) out.push(`${JSON.stringify(token)}（${m}）藏文：得到 ${cp(r.tibetan)}，應為 ${cp(wantTib)}`);
        if (r.siddham !== wantSid) out.push(`${JSON.stringify(token)}（${m}）悉曇：得到 ${cp(r.siddham)}，應為 ${cp(wantSid)}`);
        if (r.latin !== wantLat) out.push(`${JSON.stringify(token)}（${m}）拉丁：得到 ${JSON.stringify(r.latin)}，應為 ${JSON.stringify(wantLat)}`);
        // 與上面三條不同源的一個性質：拉丁欄不該有任何悉曇區的字；藏文欄只准有借用的那一個
        if (stray(r.latin, '').length) out.push(`${JSON.stringify(token)}（${m}）拉丁欄出現悉曇字 ${cp(stray(r.latin, '').join(''))}`);
        if (stray(r.tibetan, SIGN).length) out.push(`${JSON.stringify(token)}（${m}）藏文欄出現借用以外的悉曇字 ${cp(stray(r.tibetan, SIGN).join(''))}`);
      }
    }
    if (!n) out.push('一個記法都沒有驗到——空的比對不算通過');
    return out;
  } },
];

function run(world) {
  return CHECKS.map(({ name: title, run: fn }) => {
    let errs;
    try { errs = fn(world); } catch (e) { errs = ['檢查本身丟出例外：' + (e && e.message || e)]; }
    return { title, errs };
  });
}

/* ---------- 反向驗證 ---------- */

// [說明, 該被哪一條抓到（CHECKS 的 index）, 怎麼改壞]
const INJECTIONS = [
  ['少一類（拿掉標點）', 0, (w) => { w.data.categories.pop(); }],
  ['兩類對調順序', 0, (w) => { const c = w.data.categories; [c[0], c[1]] = [c[1], c[0]]; }],
  ['字形換成預組字元（不是 NFC）', 0, (w) => { w.data.categories[1].entries[3].char = String.fromCodePoint(0x0F43); }],
  ['子音 ka 的字形換成 kha', 1, (w) => { w.data.categories[1].entries[0].char = String.fromCodePoint(0x0F41); }],
  ['母音 ii 的記法改成 i', 1, (w) => { w.data.categories[0].entries[3].code = 'i'; }],
  ['下加輔音 y 的字形換成固定形', 1, (w) => { const e = w.data.categories[3].entries.find((x) => x.code === 'y'); e.char = String.fromCodePoint(0x0FBB); }],
  ['標點 | 的字形換成 nyis shad', 1, (w) => { w.data.categories[4].entries.find((x) => x.code === '|').char = String.fromCodePoint(0x0F0E); }],
  ['轉換器整個壞掉（一律回空字串）', 1, (w) => { w.convert = () => ({ tibetan: '' }); }],
  ['每一格都沒有記法（空的比對）', 1, (w) => { for (const c of w.data.categories) for (const e of c.entries) { e.alt = e.alt || 'x'; e.code = ''; } }],
  ['元音符號那一類拿掉載體', 2, (w) => { delete w.data.categories[2].carrier; }],
  ['子音那一類加上載體', 2, (w) => { w.data.categories[1].carrier = String.fromCodePoint(0x25CC); }],
  ['把打得出來的 y 標成不可插入', 3, (w) => { const e = w.data.categories[3].entries.find((x) => x.code === 'y'); e.alt = 'y'; e.code = ''; }],
  ['不可插入的格沒有 alt', 3, (w) => { delete w.data.categories[3].entries.find((x) => !x.code).alt; }],
  ['同一類出現兩個 ka', 4, (w) => { const c = w.data.categories[1]; c.entries.push({ ...c.entries[0] }); }],
  ['ja 少一個分類名', 5, (w) => { delete w.locales.ja['assist.cat.subjoined']; }],
  ['en 少 tool.assist（開關鈕的 title）', 5, (w) => { delete w.locales.en['tool.assist']; }],
  ['資料多一類而三語都沒有它的名字', 5, (w) => { w.data.categories.push({ id: 'extra', entries: [{ code: 'q', char: 'q' }] }); }],
  ['搜尋框拿掉 data-filter-clear', 6, (w) => { w.html = w.html.replace(' data-filter-clear />', ' />'); }],
  ['assist.js 排到控制器之後', 6, (w) => { w.html = w.html.replace(/\s*<script src="\.\/assist\.js"><\/script>[^\n]*/, '').replace('</body>', '<script src="./assist.js"></script></body>'); }],
  ['頁面上沒有開關鈕', 6, (w) => { w.html = w.html.replace('id="setting-assist"', 'id="setting-other"'); }],
  ['assist.js 註解以外提到引擎路徑', 7, (w) => { w.assistSrc += '\nvar E = "./vendor/bonji-input/siddham.js";'; }],
  ['assist.js import 了防腐層', 7, (w) => { w.assistSrc = 'import { X } from "./tibetan-siddham-converter.js";\n' + w.assistSrc; }],
  ['拉丁欄不再還原（數字 2 留成悉曇記號）', 8, (w) => { const f = w.convert; w.convert = (i, m) => { const r = f(i, m); return { ...r, latin: r.latin.replace('ka2ka', 'ka' + String.fromCodePoint(0x115C6) + 'ka') }; }; }],
  ['藏文欄照舊借用悉曇記號（* 沒有還原）', 8, (w) => { const f = w.convert; w.convert = (i, m) => { const r = f(i, m); return { ...r, tibetan: r.tibetan.replace('*', String.fromCodePoint(0x115C4)) }; }; }],
  ['藏文欄把 -- 也還原成字面', 8, (w) => { const f = w.convert; w.convert = (i, m) => { const r = f(i, m); return { ...r, tibetan: r.tibetan.replace(String.fromCodePoint(0x115C1), '--') }; }; }],
  ['悉曇欄把符號拿掉', 8, (w) => { const f = w.convert; w.convert = (i, m) => { const r = f(i, m); return { ...r, siddham: Array.from(r.siddham).filter((ch) => ch === String.fromCodePoint(0x1158E)).join('') }; }; }],
  ['悉曇欄留著 | 轉出來的 daṇḍa', 8, (w) => { const f = w.convert; w.convert = (i, m) => { const r = f(i, m); return i === 'ka|ka' ? { ...r, siddham: r.siddham.slice(0, 2) + String.fromCodePoint(0x115C5) + r.siddham.slice(2) } : r; }; }],
  ['引擎的表多一個防腐層不認得的記法', 8, (w) => { w.engineSymbols.push({ token: '#', char: String.fromCodePoint(0x115D8) }); }],
  ['引擎的表是空的（空的比對）', 8, (w) => { w.engineSymbols = []; }],
  ['控制器直接 import 藏文核心', 7, (w) => { w.appJs.find((f) => f.name === 'tibetan-siddham.js').src += '\nimport { ascii2tibetan } from "./tibetan-core.js";'; }],
];

function cloneWorld(w) {
  return {
    ...w,
    data: JSON.parse(JSON.stringify(w.data)),
    locales: JSON.parse(JSON.stringify(w.locales)),
    engineSymbols: w.engineSymbols.map((e) => ({ ...e })),
    appJs: w.appJs.map((f) => ({ ...f })),
  };
}

function selftest(world) {
  const clean = run(world);
  if (clean.some((r) => r.errs.length)) {
    console.log('✖ 未改動的世界就有檢查不過，反向驗證沒有意義。先跑 node scripts/verify.js。');
    return 2;
  }
  let missed = 0;
  for (const [what, idx, breakIt] of INJECTIONS) {
    const w = cloneWorld(world);
    breakIt(w);
    const res = run(w);
    const hit = res[idx].errs.length > 0;
    if (!hit) missed++;
    console.log(`${hit ? 'ok  ' : 'MISS'}  ${what}  →  ${CHECKS[idx].name.slice(0, 1)}${hit ? '' : '（沒有抓到）'}`);
  }
  const covered = new Set(INJECTIONS.map((i) => i[1]));
  const uncovered = CHECKS.map((_, i) => i).filter((i) => !covered.has(i));
  if (uncovered.length) { missed++; console.log('MISS  這幾條沒有任何注入在驗它：' + uncovered.map((i) => CHECKS[i].name.slice(0, 1)).join(' ')); }
  console.log(`\n${INJECTIONS.length} 個注入，${missed ? missed + ' 個沒有被抓到' : '全部被對應的那一條抓到'}。`);
  return missed ? 1 : 0;
}

/* ---------- main ---------- */

(async () => {
  let world;
  try { world = await loadWorld(); }
  catch (e) { console.log('✖ 前提不成立：' + (e && e.message || e)); process.exit(2); }

  if (process.argv.includes('--selftest')) process.exit(selftest(world));

  const res = run(world);
  let fail = 0;
  for (const r of res) {
    if (r.errs.length) { fail++; console.log('FAIL  ' + r.title); r.errs.slice(0, 12).forEach((e) => console.log('        ' + e)); if (r.errs.length > 12) console.log(`        …另有 ${r.errs.length - 12} 筆`); }
    else console.log('PASS  ' + r.title);
  }
  const cells = world.data.categories.reduce((n, c) => n + c.entries.length, 0);
  console.log(`\n${res.length - fail} PASS ／ ${fail} FAIL（共 ${res.length} 條；面板 ${cells} 格、引擎符號記法 ${world.engineSymbols.length} 個）`);
  process.exit(fail ? 1 : 0);
})();
