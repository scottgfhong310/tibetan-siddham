/**
 * assist.js — 輔助輸入字形選盤（index.html）。
 *
 * 看著藏文字形、在面板裡認出它、點一下就把它的羅馬記法插進 #ts-input 游標處。
 * 形制照 `bonji` 的輔助輸入（固定在右側的 dock、搜尋、分類 chips、底部輔助鈕）；
 * 鍵位由孵化器原型 `tibetan` 的虛擬鍵盤「藏文梵字」五組整理而來，資料在 data/assist.json：
 *   母音（獨立元音）／子音／元音符號／下加輔音／標點
 *
 * 與控制器解耦：只操作 #ts-input 並派發 'input' 事件——tibetan-siddham.js 既有的
 * `$input.addEventListener('input', convert)` 會自動即時重轉。本檔不 import 任何模組，
 * 用全域 I18n / M（classic script，置於 locales 之後、控制器 module 之前）。
 * **不碰轉換**：每一格會轉出什麼字，由 scripts/verify.js 逐鍵對防腐層驗證，不在這裡算。
 *
 * ⚠️ 元音符號與下加輔音是組合字元，單獨畫會浮空 ⇒ 前面加一個載體（點圈）。
 *    「哪一類要加載體」寫在資料裡（category.carrier），本檔不判斷碼位範圍——
 *    chart.js 已經有一份碼位範圍的判斷，這裡再寫一份就是同一條規則兩份實作。
 * ⚠️ 沒有記法的格（下加輔音裡三個固定形 U+0FBA／U+0FBB／U+0FBC）：轉換器不產生它們，僅供辨認、不可插入。
 */
(function () {
  'use strict';

  var OPEN_KEY = 'tibetan-siddham-assist-open';

  var panel, body, search, catsEl, input;
  var loaded = false;
  var activeCat = 'all';

  /* 內部形狀：cats = [{ id, carrier, entries: [{ code, char, label, note, alt }] }] */
  var cats = [];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 插入記法到輸入框游標處 ---------- */

  function insertAtCursor(text) {
    var s = input.selectionStart, e = input.selectionEnd, v = input.value;
    input.value = v.slice(0, s) + text + v.slice(e);
    var p = s + text.length;
    input.focus();
    try { input.setSelectionRange(p, p); } catch (err) {}
    if (window.M) {
      if (M.textareaAutoResize) M.textareaAutoResize(input);
      if (M.updateTextFields) M.updateTextFields();
    }
    input.dispatchEvent(new Event('input', { bubbles: true })); // → tibetan-siddham.js 即時重轉
  }

  /* ---------- 正規化：data/assist.json → 內部形狀 ---------- */

  function fromData(d) {
    return (d.categories || []).map(function (c) {
      return {
        id: c.id,
        carrier: c.carrier || '',
        entries: (c.entries || []).map(function (e) {
          return { code: e.code || '', char: e.char || '', label: e.label || '', note: e.note || '', alt: e.alt || '' };
        })
      };
    });
  }

  /* ---------- 渲染 ---------- */

  function chip(val, i18nKey, fallback, active) {
    return '<span class="assist-cat' + (active ? ' active' : '') + '" data-cat="' + val + '"' +
      ' data-i18n="' + i18nKey + '">' + escapeHtml(fallback) + '</span>';
  }

  function render() {
    var cc = [chip('all', 'assist.cat.all', '全部', true)];
    cats.forEach(function (c) { cc.push(chip(c.id, 'assist.cat.' + c.id, c.id, false)); });
    catsEl.innerHTML = cc.join('');

    var html = '';
    cats.forEach(function (c) {
      html += '<section class="assist-section" data-cat="' + c.id + '">' +
        '<div class="assist-section-title" data-i18n="assist.cat.' + c.id + '">' + escapeHtml(c.id) + '</div>' +
        '<div class="assist-grid">';
      c.entries.forEach(function (en) {
        var has = !!en.code;
        // 搜尋只比記法（同 bonji）；沒有記法的格用它的 alt，查 y 時固定形的 y 才會一起出來。
        // 說明文字（note）不進搜尋——拉丁字母會到處命中（查 sa 會撈到 visarga）。
        var shown = en.label || en.code;          // 兩個空格看不見 ⇒ 資料給它一個可見的標示
        var tip = (shown || '') + (en.note ? (shown ? ' — ' : '') + en.note : '');
        html += '<a href="#!" class="ia' + (has ? '' : ' noinput') + '"' +
          ' data-code="' + escapeHtml(en.code) + '"' +
          ' data-search="' + escapeHtml(((en.code || en.alt) + ' ' + en.label).toLowerCase()) + '"' +
          ' title="' + escapeHtml(tip) + '">' +
          '<span class="ia-char">' + escapeHtml(c.carrier + en.char) + '</span>' +
          '<span class="ia-code">' + (has ? escapeHtml(shown) : '·') + '</span>' +
          '</a>';
      });
      html += '</div></section>';
    });
    body.innerHTML = html;
    if (window.I18n && I18n.apply) I18n.apply(panel);
  }

  function applyFilter() {
    var q = (search.value || '').toLowerCase();
    if (q.trim() === '') q = '';                  // 只打空白不算查詢（否則會只剩 tsheg 那一格）
    var total = 0;
    body.querySelectorAll('.assist-section').forEach(function (sec) {
      var catOk = activeCat === 'all' || sec.getAttribute('data-cat') === activeCat;
      var any = false;
      sec.querySelectorAll('.ia').forEach(function (cell) {
        var show = catOk && (!q || cell.getAttribute('data-search').indexOf(q) !== -1);
        cell.hidden = !show;
        if (show) { any = true; total++; }
      });
      sec.hidden = !any;                          // 空的類連標題一起收
    });
    var empty = body.querySelector('.assist-empty');
    if (total === 0 && !empty) {
      body.insertAdjacentHTML('beforeend', '<p class="assist-empty" data-i18n="assist.empty">' +
        escapeHtml(window.I18n ? I18n.t('assist.empty') : '查無符合的字') + '</p>');
    } else if (total > 0 && empty) {
      empty.remove();
    }
  }

  function load() {
    if (loaded) return Promise.resolve();
    return fetch('./data/assist.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('assist.json: HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        cats = fromData(d);
        render(); loaded = true; applyFilter();
      })
      .catch(function (err) {
        // 載入失敗要看得見：留一個空面板會被讀成「這裡沒有任何鍵」
        body.innerHTML = '<p class="assist-empty">' + escapeHtml(err.message) + '</p>';
      });
  }

  /* ---------- 開關 ---------- */

  function setOpen(open) {
    panel.hidden = !open;
    document.body.classList.toggle('assist-open', open); // 開啟時隱藏 side-tools（assist.css）；dock 覆蓋、不推主畫面
    if (!open) {
      // 關閉：恢復 side-tools、重置「工具列」切換鈕狀態
      document.body.classList.remove('assist-tools');
      var tt = document.getElementById('assist-toggle-tools');
      if (tt) tt.classList.remove('active');
      if (window.SideTool && SideTool.refreshOverflow) SideTool.refreshOverflow();
    }
    var tool = document.getElementById('setting-assist');
    if (tool) tool.classList.toggle('active', open);
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch (e) {}
    if (open) load();
  }

  /* ---------- 初始化 ---------- */

  function init() {
    panel = document.getElementById('assist-panel');
    if (!panel) return;
    body = document.getElementById('assist-body');
    search = document.getElementById('assist-search');
    catsEl = document.getElementById('assist-cats');
    input = document.getElementById('ts-input');

    document.getElementById('setting-assist').addEventListener('click', function () {
      setOpen(panel.hidden);
    });

    // 面板自帶關閉鈕（side-tools 隱藏時仍能關）
    document.getElementById('assist-close').addEventListener('click', function (e) {
      e.preventDefault();
      setOpen(false);
    });

    // 面板上的「工具列」切換鈕：顯示 / 隱藏 side-tools（顯示時 dock 自動讓出空間，見 assist.css）
    document.getElementById('assist-toggle-tools').addEventListener('click', function (e) {
      e.preventDefault();
      var shown = document.body.classList.toggle('assist-tools');
      this.classList.toggle('active', shown);
      if (shown && window.SideTool && SideTool.refreshOverflow) SideTool.refreshOverflow();
    });

    catsEl.addEventListener('click', function (e) {
      var chipEl = e.target.closest('.assist-cat');
      if (!chipEl) return;
      activeCat = chipEl.getAttribute('data-cat');
      catsEl.querySelectorAll('.assist-cat').forEach(function (c) {
        c.classList.toggle('active', c === chipEl);
      });
      applyFilter();
    });

    search.addEventListener('input', applyFilter);

    body.addEventListener('click', function (e) {
      var cell = e.target.closest('.ia');
      if (!cell) return;
      e.preventDefault();
      var code = cell.getAttribute('data-code');
      if (!code) {
        if (window.M) M.toast({ html: I18n.t('assist.noinput') });
        return;
      }
      insertAtCursor(code);
    });

    // 底部輔助按鈕：插入 空格 / 換行 / 連字號
    var INS = { space: ' ', newline: '\n', dash: '-' };
    var controls = panel.querySelector('.assist-controls');
    if (controls) {
      controls.addEventListener('click', function (e) {
        var btn = e.target.closest('.assist-ctrl');
        if (!btn) return;
        e.preventDefault();
        var ch = INS[btn.getAttribute('data-ins')];
        if (ch != null) insertAtCursor(ch);
      });
    }

    // 還原上次開關狀態（預設關）
    var wasOpen = false;
    try { wasOpen = localStorage.getItem(OPEN_KEY) === '1'; } catch (e) {}
    if (wasOpen) setOpen(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
