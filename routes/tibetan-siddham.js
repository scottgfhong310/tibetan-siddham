/**
 * routes/tibetan-siddham.js — 本 app 專屬 API（信封一律 { ok }）
 *
 *   POST /api/tibetan-siddham/export    — 把一次轉換結果存成 JSON 到 public/download/tibetan-siddham/
 *                                         檔名由 server 產生：tibetan-siddham-yyyyMMddHHmmss.json
 *   GET  /api/tibetan-siddham/downloads — 列出該夾內的 JSON（依檔名降冪）
 *   POST /api/tibetan-siddham/clear     — 清空該夾下所有 JSON（目標寫死在 server）
 *
 * 檔案存於 public/ 下，故可由 express.static 以 /download/tibetan-siddham/<file> 直接取回。
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 資料目錄寫死在 server 端（不接受任意路徑參數）
const DATA_DIR = path.join(__dirname, '..', 'public', 'download', 'tibetan-siddham');

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

// 時間工具（內建 padStart，不依賴 lodash）
function pad2(n) { return String(n).padStart(2, '0'); }
function timestamp(d) {
  d = d || new Date();
  return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}

// POST /api/tibetan-siddham/export
router.post('/export', (req, res) => {
  try {
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title : '';
    const input = typeof body.input === 'string' ? body.input : '';
    const output = (body.output && typeof body.output === 'object') ? body.output : {};
    const options = (body.options && typeof body.options === 'object') ? body.options : {};
    // 來源檔名（只記錄進 JSON、不用於檔案系統）：取 basename 去掉任何路徑成分
    const sourceFile = (typeof body.sourceFile === 'string' && body.sourceFile)
      ? path.basename(body.sourceFile) : null;

    if (!input && !(output.tibetan || output.siddham || output.latin || output.codepoints)) {
      return res.status(400).json({ ok: false, error: 'Nothing to export' });
    }

    ensureDir();
    const filename = `tibetan-siddham-${timestamp()}.json`;
    const abs = path.join(DATA_DIR, filename);
    // 落點檢查（filename 由 server 產生，仍雙重保險擋穿越）
    if (!abs.startsWith(DATA_DIR + path.sep)) {
      return res.status(400).json({ ok: false, error: 'Bad path' });
    }

    const record = {
      app: 'tibetan-siddham',
      exportedAt: new Date().toISOString(),
      sourceFile: sourceFile,
      title: title,
      options: {
        inputMethod: options.inputMethod || null,
        transliteration: options.transliteration || null,
        ignoreSpacesAndHyphens: !!options.ignoreSpacesAndHyphens
      },
      input: input,
      output: {
        tibetan: output.tibetan || '',
        siddham: output.siddham || '',
        latin: output.latin || '',
        codepoints: output.codepoints || ''
      }
    };

    fs.writeFileSync(abs, JSON.stringify(record, null, 2), 'utf8');
    console.log(`[tibetan-siddham] exported ${filename}`);
    return res.json({ ok: true, filename: filename, path: `/download/tibetan-siddham/${filename}` });
  } catch (e) {
    console.error('[tibetan-siddham] export failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/tibetan-siddham/downloads
router.get('/downloads', (req, res) => {
  try {
    ensureDir();
    const files = fs.readdirSync(DATA_DIR)
      .filter((n) => n.toLowerCase().endsWith('.json'))
      .map((n) => {
        const st = fs.statSync(path.join(DATA_DIR, n));
        return { name: n, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.name.localeCompare(a.name)); // 降冪（檔名含時間戳）
    return res.json({ ok: true, files: files });
  } catch (e) {
    console.error('[tibetan-siddham] list failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/tibetan-siddham/clear — 清空該夾下所有 JSON（目標寫死在 server）
router.post('/clear', (req, res) => {
  try {
    ensureDir();
    const names = fs.readdirSync(DATA_DIR).filter((n) => n.toLowerCase().endsWith('.json'));
    let removed = 0;
    for (const n of names) {
      const abs = path.join(DATA_DIR, n);
      if (abs.startsWith(DATA_DIR + path.sep)) { fs.unlinkSync(abs); removed++; }
    }
    console.log(`[tibetan-siddham] cleared ${removed} file(s)`);
    return res.json({ ok: true, removed: removed });
  } catch (e) {
    console.error('[tibetan-siddham] clear failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
