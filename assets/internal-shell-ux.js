// MuniControl · shell UX for the internal pages. Plain script, loaded in <head> after the
// capability gate. Two behaviours requested by the municipal owner on 2026-11-05:
//
// 1. Visibility grace. Every panel erases its query when the tab is hidden, which made the
//    product unusable while people switch between tabs. The panels still own that policy:
//    this shim only delays what they see. While the session is alive and the tab has been
//    hidden for less than VISIBILITY_GRACE_MS, `document.hidden` keeps answering false and
//    the `visibilitychange` event is not delivered to the panels. After the grace period the
//    shim delivers one `visibilitychange` with `document.hidden === true`, so the panels erase
//    exactly as before. `pagehide` and the logout button are untouched.
//
// 2. Multi-select helpers. Every `<select multiple>` gets "Todas" / "Ninguna" buttons so a
//    person can cover all departments or agreements without picking them one by one. The
//    buttons change the selection and dispatch the same `change` event a person would.
(function (global) {
  'use strict';
  if (!global || !global.document || typeof global.document.addEventListener !== 'function') return;
  var document = global.document;
  var VISIBILITY_GRACE_MS = 20 * 60 * 1000;

  // ---- 1. visibility grace -------------------------------------------------------------
  // Read the browser's own answer each time: the instance property below shadows it for the panels.
  var nativeHidden = (function () {
    try {
      var proto = global.Document && global.Document.prototype;
      if (!proto || !Object.getOwnPropertyDescriptor(proto, 'hidden')) return null;
      return function () { var descriptor = Object.getOwnPropertyDescriptor(proto, 'hidden'); return descriptor && typeof descriptor.get === 'function' ? descriptor.get.call(document) === true : false; };
    } catch (error) { return null; }
  })();
  var expireVisibilityGrace = function () {};
  if (nativeHidden && typeof global.Event === 'function') {
    var shadowHidden = false, graceTimer = null, delivering = false;
    var deliver = function () {
      graceTimer = null;
      if (!nativeHidden()) return;
      shadowHidden = true;
      delivering = true;
      try { document.dispatchEvent(new global.Event('visibilitychange', { bubbles: false })); }
      finally { delivering = false; }
    };
    expireVisibilityGrace = function () { if (graceTimer !== null) global.clearTimeout(graceTimer); deliver(); };
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return shadowHidden; } });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return shadowHidden ? 'hidden' : 'visible'; } });
      document.addEventListener('visibilitychange', function (event) {
        if (delivering) return; // the delayed event dispatched below must reach the panels
        var hiddenNow = nativeHidden();
        if (hiddenNow) {
          event.stopImmediatePropagation();
          if (graceTimer !== null) global.clearTimeout(graceTimer);
          graceTimer = global.setTimeout(deliver, VISIBILITY_GRACE_MS);
          return;
        }
        if (graceTimer !== null) { global.clearTimeout(graceTimer); graceTimer = null; }
        if (!shadowHidden) { event.stopImmediatePropagation(); return; } // nothing was erased
        shadowHidden = false; // let the panels see the tab coming back after an erase
      }, true);
      document.documentElement.setAttribute('data-mc-visibility-grace', String(VISIBILITY_GRACE_MS));
    } catch (error) { /* keep the native behaviour */ }
  }

  // ---- 2. multi-select helpers ---------------------------------------------------------
  function dispatch(select) {
    select.dispatchEvent(new global.Event('input', { bubbles: true }));
    select.dispatchEvent(new global.Event('change', { bubbles: true }));
  }
  function decorate(select) {
    if (!(select instanceof global.HTMLSelectElement) || !select.multiple || select.dataset.mcMultiHelpers === 'true') return;
    if (select.closest('[data-mc-no-multi-helpers]')) return;
    select.dataset.mcMultiHelpers = 'true';
    var bar = document.createElement('div');
    bar.className = 'mc-multi-helpers';
    bar.setAttribute('data-mc-multi-helpers', '');
    var all = document.createElement('button'), none = document.createElement('button'), count = document.createElement('span');
    all.type = 'button'; all.textContent = 'Todas'; all.className = 'mc-multi-helper';
    none.type = 'button'; none.textContent = 'Ninguna'; none.className = 'mc-multi-helper';
    count.className = 'mc-multi-count'; count.setAttribute('aria-live', 'polite');
    var refresh = function () {
      var options = Array.prototype.filter.call(select.options, function (option) { return !option.disabled; });
      var selected = options.filter(function (option) { return option.selected; }).length;
      count.textContent = options.length ? selected + ' de ' + options.length + ' elegidas' : '';
      all.disabled = select.disabled || !options.length || selected === options.length;
      none.disabled = select.disabled || !selected;
    };
    all.addEventListener('click', function () {
      Array.prototype.forEach.call(select.options, function (option) { if (!option.disabled) option.selected = true; });
      dispatch(select); refresh();
    });
    none.addEventListener('click', function () {
      Array.prototype.forEach.call(select.options, function (option) { option.selected = false; });
      dispatch(select); refresh();
    });
    select.addEventListener('change', refresh);
    bar.appendChild(all); bar.appendChild(none); bar.appendChild(count);
    select.insertAdjacentElement('afterend', bar);
    new global.MutationObserver(refresh).observe(select, { childList: true, attributes: true, attributeFilter: ['disabled'] });
    refresh();
  }
  function scan(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    if (root instanceof global.HTMLSelectElement) decorate(root);
    Array.prototype.forEach.call(root.querySelectorAll('select[multiple]'), decorate);
  }
  function installStyle() {
    if (document.getElementById('mc-shell-ux-style')) return;
    var style = document.createElement('style');
    style.id = 'mc-shell-ux-style';
    style.textContent = '.mc-multi-helpers{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0 0}' +
      '.mc-multi-helper{font:inherit;min-height:32px;padding:4px 12px;border:1px solid #afc7cc;border-radius:6px;background:#fff;color:#154854;cursor:pointer}' +
      '.mc-multi-helper:disabled{opacity:.5;cursor:not-allowed}.mc-multi-count{font-size:.9em;color:#4d6973}';
    (document.head || document.documentElement).appendChild(style);
  }
  function startMultiHelpers() {
    if (typeof global.MutationObserver !== 'function' || typeof global.HTMLSelectElement !== 'function') return;
    installStyle();
    scan(document.body);
    new global.MutationObserver(function (records) {
      records.forEach(function (record) { Array.prototype.forEach.call(record.addedNodes, scan); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startMultiHelpers, { once: true });
  else startMultiHelpers();

  global.MuniControlShellUx = Object.freeze({ visibilityGraceMs: VISIBILITY_GRACE_MS, decorateMultiSelect: decorate, expireVisibilityGrace: function () { expireVisibilityGrace(); } });
})(typeof window === 'undefined' ? globalThis : window);
