/**
 * tibetan-siddham — 頁面控制器（glue）。ESM module：天然 defer，執行時 DOM 與所有
 * classic 依賴（jQuery / Materialize / Lodash / I18n + locales）皆已就緒。
 *
 * 唯一的轉換介面是 ./tibetan-siddham-converter.js（TibetanSiddhamConverter 防腐層）；
 * 本檔不得直接 import vendor/bonji-input/siddham.js 或 tibetan-core.js。
 *
 * 碰 DOM 的行為：即時轉換、選項、複製、清除、主題切換、i18n 重繪、對照表導覽、
 * JSON 匯出（POST /api/tibetan-siddham/export）、匯出檔清單面板（GET …/downloads）、
 * 載回已存檔、清空匯出夾（POST …/clear）。
 */

import { TibetanSiddhamConverter } from "./tibetan-siddham-converter.js";

(function () {
  'use strict';

  var THEME_KEY = 'tibetan-siddham-theme';
  var API = '/api/tibetan-siddham';
  var DOWNLOAD_DIR = '/download/tibetan-siddham/';
  var converter = new TibetanSiddhamConverter();
  var ready = false;     // 藏文對照表是否已載入
  var backend = true;    // 是否使用後端 API（由 config.json 切換；關閉＝純前端 / 可純靜態）

  var $title = document.getElementById('ts-title');
  var $input = document.getElementById('ts-input');
  var $inputMethod = document.getElementById('opt-input-method');
  var $translit = document.getElementById('opt-translit');
  var $ignoreSpaces = document.getElementById('opt-ignore-spaces');
  var outEls = {
    tibetan: document.getElementById('out-tibetan'),
    siddham: document.getElementById('out-siddham'),
    latin: document.getElementById('out-latin'),
    codepoints: document.getElementById('out-codepoints')
  };

  var state = { theme: 'dark' };
  // 目前頁面內容來自哪個匯出檔（由清單載入或上次匯出設定）；下次匯出會記進新檔的 sourceFile
  var loadedFrom = null;
  // 目前內容的來源檔名（= 載入檔的 sourceFile，或匯出時寫入的來源）；顯示於 options 下方
  var currentSource = null;

  /* ---------- 工具 ---------- */

  // 點擊回饋：icon 暫時變 check 800ms 再還原（家族共用 side-tool.js，§5.5）
  var setIconDone = window.SideTool.setIconDone;

  function copyText(text) {
    function fallback() {
      return new Promise(function (resolve, reject) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.top = '0';
          ta.style.left = '0';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          ok ? resolve() : reject(new Error('execCommand copy failed'));
        } catch (e) { reject(e); }
      });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(fallback);
    }
    return fallback();
  }

  // 觸發瀏覽器下載一個（同源）URL，檔名用 download 屬性
  function downloadUrl(url, name) {
    var a = document.createElement('a');
    a.href = url;
    a.download = name || '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function formatSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' B';
    var kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
  }

  // 純前端下載一段文字（Blob；後端關閉時用）
  function downloadText(name, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name || 'download.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function timestamp(d) {
    d = d || new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  /* ---------- 轉換 ---------- */

  function readOptions() {
    converter.setOptions({
      inputMethod: $inputMethod.value,
      transliteration: $translit.value,
      ignoreSpacesAndHyphens: $ignoreSpaces.checked
    });
  }

  function clearOutputs() {
    outEls.tibetan.textContent = '';
    outEls.siddham.textContent = '';
    outEls.latin.textContent = '';
    outEls.codepoints.textContent = '';
  }

  function convert() {
    if (!ready) return;            // 對照表載入前不轉（init 完成後會補跑一次）
    readOptions();
    var input = $input.value;
    if (!input) { clearOutputs(); return; }
    var r;
    try {
      r = converter.convert(input);
    } catch (e) {
      console.error('TibetanSiddhamConverter.convert 失敗：', e);
      M.toast({ html: I18n.t('toast.convertFail', { m: String(e.message || e) }), classes: 'red' });
      return;
    }
    outEls.tibetan.textContent = r.tibetan;
    outEls.siddham.textContent = r.siddham;
    outEls.latin.textContent = r.latin;
    outEls.codepoints.textContent = r.codepoints.tibetan;
  }

  // 目前的「來源 + 標題 + 選項 + 輸入 + 四項輸出」（供匯出用）
  function currentRecord() {
    return {
      sourceFile: loadedFrom,
      title: $title.value,
      options: {
        inputMethod: $inputMethod.value,
        transliteration: $translit.value,
        ignoreSpacesAndHyphens: $ignoreSpaces.checked
      },
      input: $input.value,
      output: {
        tibetan: outEls.tibetan.textContent,
        siddham: outEls.siddham.textContent,
        latin: outEls.latin.textContent,
        codepoints: outEls.codepoints.textContent
      }
    };
  }

  function hasContent(rec) {
    return !!(rec.input || rec.output.tibetan || rec.output.siddham || rec.output.latin || rec.output.codepoints);
  }

  // 顯示 / 隱藏「來源檔」列（options 下方）
  function renderSource() {
    var row = document.getElementById('source-row');
    var name = document.getElementById('source-file');
    if (currentSource) {
      name.textContent = currentSource;
      row.style.display = '';
    } else {
      name.textContent = '';
      row.style.display = 'none';
    }
  }

  /* ---------- 主題（light / dark） ---------- */

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

  /* ---------- 語系（i18n） ---------- */

  function cycleLang() {
    var next = I18n.cycle();
    M.toast({ html: I18n.t('toast.lang', { name: I18n.name(next) }), classes: 'teal' });
  }

  /* ---------- 複製 / 清除 ---------- */

  function copyValue(text, trigger) {
    if (!text) {
      M.toast({ html: I18n.t('toast.nothingToCopy'), classes: 'orange' });
      return;
    }
    copyText(text).then(function () {
      if (trigger) setIconDone(trigger);
      M.toast({ html: I18n.t('toast.copied'), classes: 'teal' });
    }).catch(function () {
      M.toast({ html: I18n.t('toast.copyFail'), classes: 'red' });
    });
  }

  function copyOutput(key, trigger) {
    var el = outEls[key];
    copyValue(el ? el.textContent : '', trigger);
  }

  function clearAll() {
    loadedFrom = null;   // 清除後等同全新內容，下次匯出無來源
    currentSource = null;
    renderSource();
    $title.value = '';
    $input.value = '';
    if (window.M && M.textareaAutoResize) {
      try { M.textareaAutoResize($title); M.textareaAutoResize($input); } catch (e) {}
    }
    if (window.M && M.updateTextFields) { try { M.updateTextFields(); } catch (e) {} }
    convert();
    setIconDone(document.getElementById('setting-clear'));
    M.toast({ html: I18n.t('toast.cleared'), classes: 'grey' });
    $input.focus();
  }

  /* ---------- JSON 匯出（存到伺服器 /download/tibetan-siddham/） ---------- */

  function downloadsOpen() {
    var inst = M.Sidenav.getInstance(document.getElementById('downloads-panel'));
    return !!(inst && inst.isOpen);
  }

  // 共用：把目前結果 POST 到 /export → resolve(resp)。內容為空時 toast 並 reject(null)。
  function doExport() {
    var rec = currentRecord();
    if (!hasContent(rec)) {
      M.toast({ html: I18n.t('toast.nothingToExport'), classes: 'orange' });
      return Promise.reject(null);
    }
    return fetch(API + '/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec)
    }).then(function (r) { return r.json(); })
      .then(function (resp) {
        if (!resp.ok) throw new Error(resp.error || 'export failed');
        // 剛匯出的檔，其 sourceFile 就是這次送出的 loadedFrom；頁面現在代表新檔
        currentSource = rec.sourceFile || null;
        loadedFrom = resp.filename;
        renderSource();
        if (downloadsOpen()) loadDownloads();
        return resp;
      });
  }

  // 匯出鈕：只存到伺服器
  function exportJson() {
    doExport().then(function (resp) {
      setIconDone(document.getElementById('setting-export'));
      M.toast({ html: I18n.t('toast.exported', { n: resp.filename }), classes: 'green' });
    }).catch(function (err) {
      if (err) M.toast({ html: I18n.t('toast.exportFail', { m: err.message }), classes: 'red' });
    });
  }

  // 下載鈕：
  //  - 後端開啟：先 export，再下載剛產生的 tibetan-siddham-yyyyMMddHHmmss.json
  //  - 後端關閉：純前端把 currentRecord 包成 JSON 用 Blob 下載（不碰伺服器）
  function downloadJson() {
    if (backend) {
      doExport().then(function (resp) {
        setIconDone(document.getElementById('setting-download'));
        downloadUrl(resp.path, resp.filename);
        M.toast({ html: I18n.t('toast.downloaded', { n: resp.filename }), classes: 'teal' });
      }).catch(function (err) {
        if (err) M.toast({ html: I18n.t('toast.exportFail', { m: err.message }), classes: 'red' });
      });
      return;
    }
    var rec = currentRecord();
    if (!hasContent(rec)) {
      M.toast({ html: I18n.t('toast.nothingToExport'), classes: 'orange' });
      return;
    }
    var name = 'tibetan-siddham-' + timestamp() + '.json';
    var out = Object.assign({ app: 'tibetan-siddham', exportedAt: new Date().toISOString() }, rec);
    downloadText(name, JSON.stringify(out, null, 2));
    setIconDone(document.getElementById('setting-download'));
    M.toast({ html: I18n.t('toast.downloaded', { n: name }), classes: 'teal' });
  }

  /* ---------- 匯出檔清單面板 ---------- */

  function openDownloads() {
    var inst = M.Sidenav.getInstance(document.getElementById('downloads-panel'));
    if (inst) inst.open();
    loadDownloads();
  }

  function loadDownloads() {
    var list = document.getElementById('downloads-list');
    list.innerHTML = '<li class="dl-empty">…</li>';
    fetch(API + '/downloads', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (!resp.ok) throw new Error(resp.error || 'list failed');
        renderDownloads(resp.files || []);
      })
      .catch(function (err) {
        list.innerHTML = '<li class="dl-empty">' + I18n.t('downloads.fail', { m: _.escape(err.message) }) + '</li>';
      });
  }

  function renderDownloads(files) {
    var list = document.getElementById('downloads-list');
    if (!files.length) {
      list.innerHTML = '<li class="dl-empty">' + I18n.t('downloads.empty') + '</li>';
      return;
    }
    // server 已降冪排序（檔名含時間戳，最新在前）；點項目 → 載入該檔內容到頁面
    list.innerHTML = files.map(function (f) {
      return '<li><a href="#!" class="dl-item" data-file="' + _.escape(f.name) + '">' +
        '<i class="material-icons">data_object</i>' +
        '<span class="dl-name">' + _.escape(f.name) + '</span>' +
        '<span class="dl-meta">' + formatSize(f.size) + '</span>' +
        '</a></li>';
    }).join('');
  }

  // 從清單載入一個匯出檔的內容到頁面（帶回 title / options / input，並重算輸出）
  function loadFile(name) {
    if (!name) return;
    fetch(DOWNLOAD_DIR + encodeURIComponent(name), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rec) {
        rec = rec || {};
        var o = rec.options || {};
        $title.value = rec.title || '';
        $input.value = rec.input || '';
        if (o.inputMethod) $inputMethod.value = o.inputMethod;
        if (o.transliteration) $translit.value = o.transliteration;
        $ignoreSpaces.checked = !!o.ignoreSpacesAndHyphens;
        // 同步 Materialize 元件（select 值改了要重建、textarea 高度/label 要更新）
        M.FormSelect.init(document.querySelectorAll('select'));
        if (M.updateTextFields) M.updateTextFields();
        M.textareaAutoResize($title);
        M.textareaAutoResize($input);
        loadedFrom = name;          // 之後再匯出會把這個檔名記成 sourceFile
        currentSource = rec.sourceFile || null;   // 顯示這個載入檔的 sourceFile
        renderSource();
        convert();                  // 依載入的 input/options 重算輸出
        var inst = M.Sidenav.getInstance(document.getElementById('downloads-panel'));
        if (inst && inst.isOpen) inst.close();
        M.toast({ html: I18n.t('toast.loaded', { n: name }), classes: 'teal' });
      })
      .catch(function (err) {
        M.toast({ html: I18n.t('toast.loadFail', { m: err.message }), classes: 'red' });
      });
  }

  // 清空 /download/tibetan-siddham/（危險操作：二次確認）
  function clearDownloads() {
    if (!confirm(I18n.t('confirm.clearDownloads'))) return;
    fetch(API + '/clear', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (!resp.ok) throw new Error(resp.error || 'clear failed');
        setIconDone(document.getElementById('setting-clear-downloads'));
        M.toast({ html: I18n.t('toast.downloadsCleared', { n: resp.removed || 0 }), classes: 'teal' });
        if (downloadsOpen()) loadDownloads();
      })
      .catch(function (err) {
        M.toast({ html: I18n.t('toast.clearDownloadsFail', { m: err.message }), classes: 'red' });
      });
  }

  /* ---------- 事件繫結 ---------- */

  function bindEvents() {
    $input.addEventListener('input', convert);
    $inputMethod.addEventListener('change', convert);
    $translit.addEventListener('change', convert);
    $ignoreSpaces.addEventListener('change', convert);

    // 範例 chips
    document.querySelectorAll('.ex-chips .ex').forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        $input.value = chip.getAttribute('data-ex') || '';
        if (window.M && M.textareaAutoResize) { try { M.textareaAutoResize($input); } catch (e2) {} }
        if (window.M && M.updateTextFields) { try { M.updateTextFields(); } catch (e2) {} }
        convert();
        $input.focus();
      });
    });

    // 輸出區的內嵌複製鈕（只取有 data-copy 的；輸入區的複製鈕另綁）
    document.querySelectorAll('.out-copy[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        copyOutput(btn.getAttribute('data-copy').replace('out-', ''), btn);
      });
    });

    // 輸入區的內嵌複製鈕
    document.getElementById('copy-input').addEventListener('click', function (e) {
      e.preventDefault();
      copyValue($input.value, this);
    });

    // 點匯出檔清單項目 → 把該檔內容載入頁面（清單會重繪，故用委派）
    $(document).on('click', '#downloads-list a.dl-item', function (e) {
      e.preventDefault();
      loadFile(this.getAttribute('data-file'));
    });

    // 右側工具列
    document.getElementById('setting-downloads').addEventListener('click', openDownloads);
    document.getElementById('setting-mode').addEventListener('click', toggleTheme);
    document.getElementById('setting-lang').addEventListener('click', cycleLang);
    document.getElementById('setting-chart').addEventListener('click', function () {
      // 開新分頁；用 window.open（非 target=_blank）以保留 opener，
      // 讓對照表的「返回」能關回開啟它的這個轉換器分頁。
      window.open('chart.html', '_blank');
    });
    document.getElementById('setting-export').addEventListener('click', exportJson);
    document.getElementById('setting-download').addEventListener('click', downloadJson);
    document.getElementById('setting-clear').addEventListener('click', clearAll);
    document.getElementById('setting-clear-downloads').addEventListener('click', clearDownloads);
  }

  /* ---------- 設定（config.json：後端開關） ---------- */

  // 讀 ./config.json 決定是否使用後端 API。
  //  - backend !== false → 用後端（預設）
  //  - 明確 false，或讀不到 config（多半代表無伺服器）→ 純前端
  function loadConfig() {
    return fetch('./config.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (c) { backend = !(c && c.backend === false); })
      .catch(function () { backend = false; });
  }

  // 依 backend 顯示/隱藏「依賴後端」的工具（清單 / 匯出到伺服器 / 清空匯出夾）
  function applyBackendMode() {
    ['setting-downloads', 'setting-export', 'setting-clear-downloads'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = backend ? '' : 'none';
    });
  }

  /* ---------- 初始化 ---------- */

  function init() {
    // Materialize 元件
    M.FormSelect.init(document.querySelectorAll('select'));
    M.textareaAutoResize($title);
    M.textareaAutoResize($input);
    M.Sidenav.init(document.getElementById('downloads-panel'), {
      edge: 'right',
      onOpenStart: function () { document.body.classList.add('sidenav-open'); },
      onCloseEnd: function () { document.body.classList.remove('sidenav-open'); }
    });

    // 主題（防閃爍腳本已先設好 data-theme + class；此處同步 state 與 icon）
    var saved = 'dark';
    try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    applyTheme(saved === 'light' ? 'light' : 'dark');

    // i18n：套用靜態文字 / placeholder / 標題（引擎自行解析初始語系）
    I18n.apply(document);
    document.addEventListener('i18n:changed', function () {
      // 清單面板開著時，重繪（空狀態 / 失敗訊息會跟著語言走）
      if (downloadsOpen()) loadDownloads();
    });

    bindEvents();
    renderSource();

    // 讀 config 後套用後端模式（隱藏/顯示伺服器相關工具）
    loadConfig().then(applyBackendMode);

    // 載入藏文對照表後才開放轉換（避免首次輸入時 ascii2tibetan 未就緒丟錯）
    converter.ready().then(function () {
      ready = true;
      convert();
    }).catch(function (e) {
      console.error('initTibetan 失敗：', e);
      M.toast({ html: I18n.t('toast.convertFail', { m: String(e.message || e) }), classes: 'red' });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
