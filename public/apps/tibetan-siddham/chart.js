/**
 * chart — 字元對照表頁控制器（glue）。ESM module。
 *
 * 依 data/tibetan.tsv，把每個 kind（母音 / 子音 / 記號 / 標點）排成一個 column，
 * 一列＝一組對照（羅馬轉寫 token → 藏文 out + 說明）。資料解析在純模組
 * ./tibetan-table.js；本檔只碰 DOM、主題、語言與導覽。
 */

import { loadTibetanTable } from "./tibetan-table.js";
import { TibetanSiddhamConverter } from "./tibetan-siddham-converter.js";

(function () {
  'use strict';

  var THEME_KEY = 'tibetan-siddham-theme';
  var state = { theme: 'dark' };

  var GROUP_KEY = {
    vowel: 'group.vowel',
    cons: 'group.cons',
    sign: 'group.sign',
    punct: 'group.punct'
  };

  /* ---------- 工具 ---------- */

  function escapeHtml(s) {
    if (window._ && _.escape) return _.escape(String(s));
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 組合字元（藏文：母音記號 / anusvara / subjoined 子音 / tsa-phru…；
  // 悉曇：母音記號 / anusvara / candrabindu / visarga / virama / nukta）單獨顯示會浮空，
  // 加一個點圈 ◌（U+25CC）當載體才看得清。
  function isCombining(cp) {
    return (cp >= 0x0F71 && cp <= 0x0F87) ||
           (cp >= 0x0F8D && cp <= 0x0FBC) ||
           cp === 0x0F18 || cp === 0x0F19 || cp === 0x0F35 ||
           cp === 0x0F37 || cp === 0x0F39 || cp === 0x0F3E || cp === 0x0F3F ||
           (cp >= 0x115AF && cp <= 0x115C0);   // Siddham 組合記號
  }
  var DOTTED = '◌';

  function displayGlyph(out) {
    if (!out) return '';
    return isCombining(out.codePointAt(0)) ? DOTTED + out : out;
  }

  function displayToken(token) {
    if (token === ' ') return '␣';   // 空格 token → ␣
    return token;
  }

  /* ---------- 渲染 ---------- */

  function glyphCell(text, extraClass) {
    var g = displayGlyph(text);
    return g
      ? '<span class="glyph ' + extraClass + '">' + escapeHtml(g) + '</span>'
      : '<span class="glyph ' + extraClass + ' glyph-empty">—</span>';
  }

  function rowHtml(r) {
    var sid = TibetanSiddhamConverter.siddhamForToken(r.token);
    var note = r.comment ? '<span class="note">' + escapeHtml(r.comment) + '</span>' : '';
    return '<div class="map-row">' +
             '<span class="tok">' + escapeHtml(displayToken(r.token)) + '</span>' +
             '<i class="arrow material-icons">arrow_right_alt</i>' +
             glyphCell(r.out, 'glyph-tib') +
             glyphCell(sid, 'glyph-sid') +
             note +
           '</div>';
  }

  function colHtml(g) {
    var key = GROUP_KEY[g.kind];
    var titleAttr = key ? ' data-i18n="' + key + '"' : '';
    return '<section class="chart-col card">' +
             '<header class="chart-col-head">' +
               '<span class="col-title"' + titleAttr + '>' + escapeHtml(g.kind) + '</span>' +
               '<span class="col-count">' + g.rows.length + '</span>' +
             '</header>' +
             '<div class="chart-col-body">' + g.rows.map(rowHtml).join('') + '</div>' +
           '</section>';
  }

  function render(groups) {
    var grid = document.getElementById('chart-grid');
    grid.innerHTML = groups.map(colHtml).join('');
    I18n.apply(grid);   // 翻譯剛塞入的 group 標題
  }

  /* ---------- 主題 / 語言 / 導覽 ---------- */

  function applyTheme(theme) {
    state.theme = theme;
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark-mode', theme === 'dark');
    root.classList.toggle('light-mode', theme === 'light');
    var icon = document.querySelector('#setting-mode i');
    if (icon) icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  function cycleLang() {
    var next = I18n.cycle();
    M.toast({ html: I18n.t('toast.lang', { name: I18n.name(next) }), classes: 'teal' });
  }

  /* ---------- 初始化 ---------- */

  function init() {
    var saved = 'dark';
    try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    applyTheme(saved === 'light' ? 'light' : 'dark');

    I18n.apply(document);

    // 返回：若本頁是被轉換器以新分頁開啟的（有 opener），就聚焦回那個分頁並關閉本頁；
    // 否則（直接開 chart.html）就地導回 index.html。
    function goBack(e) {
      if (e) e.preventDefault();
      if (window.opener && !window.opener.closed) {
        try { window.opener.focus(); } catch (_) {}
        window.close();
      } else {
        window.location.href = 'index.html';
      }
    }
    document.getElementById('setting-back').addEventListener('click', goBack);
    var backLink = document.querySelector('.back-link');
    if (backLink) backLink.addEventListener('click', goBack);

    document.getElementById('setting-mode').addEventListener('click', toggleTheme);
    document.getElementById('setting-lang').addEventListener('click', cycleLang);

    loadTibetanTable()
      .then(render)
      .catch(function (e) {
        console.error('loadTibetanTable 失敗：', e);
        M.toast({ html: I18n.t('chart.loadFail', { m: String(e.message || e) }), classes: 'red' });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
