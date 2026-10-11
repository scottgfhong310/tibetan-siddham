/**
 * filter-clear.js — 篩選／搜尋輸入框「清除」鈕（家族共用 utility，byte-identical 同步）
 *
 * 給帶 data-filter-clear 的文字輸入框自動掛上一顆右內緣的 × 清除鈕：
 *   - 就地把輸入框包進 .filter-clear-wrap，並注入 .filter-clear 鈕
 *   - 輸入框有值時在 wrap 加 .has-value（CSS 才顯示鈕）
 *   - 點鈕（或按 Esc）＝清空值 ＋ 派發原生 input 事件（既有篩選邏輯自動重跑）＋ 重新聚焦
 *
 * 依賴：無（原生）。需搭配 filter-clear.css。i18n：鈕 title 掛 data-i18n-title="tool.clearFilter"，
 * 由各 app 的 I18n.apply 在其後翻譯／語言切換時自動更新；未載 i18n 時退回中文 title。
 * ⚠️ aria-label **沒有對應的 data-i18n-* 屬性**，I18n.apply 碰不到它 ⇒ 只設一次的話它會停在
 *    掛上去那一刻的語言（實測：切到 en／ja 後 title 換了、aria-label 還是「清除」）。
 *    故另外聽引擎的公開事件 'i18n:changed'（I18n.set 會派發）把它補同步。
 *
 * 用法：輸入框加 data-filter-clear；本檔於 DOMContentLoaded 自動掃描掛載，或手動 FilterClear.attach(input)。
 * 載入順序：置於該 app 的控制器（會呼叫 I18n.apply）之前，鈕才會被一併翻譯。
 */
(function (window) {
  'use strict';

  var document = window.document;
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 10.586 6.707 5.293 5.293 6.707 10.586 12l-5.293 5.293 1.414 1.414L12 13.414l5.293 5.293 1.414-1.414L13.414 12l5.293-5.293-1.414-1.414z"/></svg>';

  function label() {
    return (window.I18n && window.I18n.t) ? window.I18n.t('tool.clearFilter') : '清除';
  }

  function sync(wrap, input) {
    wrap.classList.toggle('has-value', !!input.value);
  }

  function attach(input) {
    if (!input || input.__filterClear) return;
    input.__filterClear = true;

    // 取得定位容器 .filter-clear-wrap：
    //  - 已有就沿用
    //  - 父層是 Materialize .input-field → 就地掛 class 當 wrap（不插 span，保留 .input-field > input
    //    的 label／底線關係，否則會壞掉；如 user-admin）
    //  - 否則就地包一層 span
    var wrap = (input.closest && input.closest('.filter-clear-wrap')) || null;
    if (!wrap && input.parentNode) {
      var parent = input.parentNode;
      if (parent.classList && parent.classList.contains('input-field')) {
        parent.classList.add('filter-clear-wrap');
        wrap = parent;
      } else {
        wrap = document.createElement('span');
        wrap.className = 'filter-clear-wrap';
        parent.insertBefore(wrap, input);
        wrap.appendChild(input);
      }
    }
    if (!wrap) return;

    var btn = wrap.querySelector('.filter-clear');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-clear';
      btn.innerHTML = ICON;
      btn.setAttribute('data-i18n-title', 'tool.clearFilter');
      btn.setAttribute('title', label());
      btn.setAttribute('aria-label', label());
      wrap.appendChild(btn);
    }

    function clear() {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      sync(wrap, input);
      input.focus();
    }

    // 語言切換時把 aria-label 補同步（title 由 I18n.apply 依 data-i18n-title 自己更新）。
    // ⚠️ 只在這裡設 aria-label，不重設 title——同一個值有兩個寫入點，遲早會各自漂。
    document.addEventListener('i18n:changed', function () {
      btn.setAttribute('aria-label', label());
    });

    btn.addEventListener('click', clear);
    input.addEventListener('input', function () { sync(wrap, input); });
    input.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27) && input.value) {
        e.preventDefault();
        clear();
      }
    });
    sync(wrap, input);
  }

  function init(root) {
    (root || document).querySelectorAll('input[data-filter-clear]').forEach(attach);
  }

  window.FilterClear = { attach: attach, init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})(window);
