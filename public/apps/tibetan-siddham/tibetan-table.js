// SPDX-License-Identifier: MIT
// tibetan-table.js — 純資料模組：載入並解析 data/tibetan.tsv 成「分組的原始列」，
// 供字元對照表頁（chart.html）顯示。不碰 DOM。
//
// 與 tibetan-core.js 讀同一份 TSV（single source of truth），但用途不同：
//   - tibetan-core.js：解析成 Map 供轉換用（會合併 alias、丟棄註解與順序）。
//   - 本檔：保留原始 token / out / comment 與檔案順序（含 alias 列），供對照表逐列呈現。

const TSV_URL = new URL("./data/tibetan.tsv", import.meta.url);

// 對照表的欄位（column）順序：母音 → 子音 → 記號 → 標點
const GROUP_ORDER = ["vowel", "cons", "sign", "punct"];

/**
 * @typedef {Object} TibetanRow
 * @property {string} token    羅馬轉寫鍵（保留原樣，含空白 token）
 * @property {string} out      藏文輸出（可能為空，如 inherent a / 被忽略的 hyphen）
 * @property {string} comment  說明
 */

/**
 * @typedef {Object} TibetanGroup
 * @property {string} kind      vowel | cons | sign | punct | …
 * @property {TibetanRow[]} rows
 */

/** fetch + parse。 @returns {Promise<TibetanGroup[]>} */
export async function loadTibetanTable() {
  const res = await fetch(`${TSV_URL}?_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load tibetan.tsv: HTTP ${res.status}`);
  return parseTibetanTable(await res.text());
}

/** 解析 TSV 文字成分組列（純函式）。 @param {string} text @returns {TibetanGroup[]} */
export function parseTibetanTable(text) {
  /** @type {Map<string, TibetanRow[]>} */
  const groups = new Map();
  for (const kind of GROUP_ORDER) groups.set(kind, []);

  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith("#")) continue;   // 跳過空行與註解（含表頭、區段註解）
    const parts = raw.split("\t");
    if (parts.length < 3) continue;
    const kind = parts[0].trim();
    const token = parts[1] ?? "";                // 不 trim：punct 的空白 token 是有意義的
    const out = parts[2] ?? "";
    const comment = (parts[3] ?? "").trim();
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push({ token, out, comment });
  }

  // 已知 kind 依固定順序在前；未知 kind 接在後面（皆只輸出有列的）
  const known = GROUP_ORDER.filter((k) => (groups.get(k) || []).length);
  const extra = [...groups.keys()].filter((k) => !GROUP_ORDER.includes(k));
  return [...known, ...extra]
    .filter((k) => (groups.get(k) || []).length)
    .map((kind) => ({ kind, rows: groups.get(kind) }));
}
