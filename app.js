/**
 * tibetan-siddham — 獨立執行的 Express 伺服器（極簡）
 *
 * 藏文梵字 + 悉曇 轉換器：轉換邏輯全部在瀏覽器
 *   - 藏文核心     public/apps/tibetan-siddham/tibetan-core.js（規則表驅動）
 *   - vendored 悉曇 public/apps/tibetan-siddham/vendor/bonji-input/siddham.js
 *   兩者包在 TibetanSiddhamConverter 防腐層之後。
 *
 * 後端負責靜態檔，外加本 app 專屬的匯出 / 列表 API（把結果存成 JSON 到
 * /download/tibetan-siddham/、並列出 / 清空該夾）。轉換本身仍是純前端，但匯出 /
 * 列表需要本 Node server（非純靜態 / 非 GitHub Pages）。
 *
 * 提供：
 *   - 靜態檔（public/）→ 應用在 /apps/tibetan-siddham/；匯出檔在 /download/tibetan-siddham/
 *   - API：/api/tibetan-siddham（routes/tibetan-siddham.js）：POST /export、GET /downloads、POST /clear
 *   - 根路徑 / → 302 /apps/tibetan-siddham/
 *
 * 啟動： npm install && npm start
 *        預設 http://localhost:3000/apps/tibetan-siddham/
 */

const express = require('express');
const path = require('path');
const logger = require('morgan');

const appRouter = require('./routes/tibetan-siddham');

const app = express();

app.use(logger('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/tibetan-siddham', appRouter);

// 根路徑導向應用頁
app.get('/', (req, res) => res.redirect('/apps/tibetan-siddham/'));

// 404（API 回 JSON，其餘回純文字）
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found' });
  res.status(404).type('text/plain').send('Not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[tibetan-siddham] →  http://localhost:${PORT}/apps/tibetan-siddham/`);
});
