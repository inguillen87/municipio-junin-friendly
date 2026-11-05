// MuniControl internal selection helpers. Native visibility signals remain unchanged.
// Panels retain responsibility for aborting work, clearing nominal data and restoring
// their own draft after a fresh access check. This script does not retain session data.
(function (global) {
  'use strict';
  if (!global || !global.document || typeof global.document.addEventListener !== 'function') return;
  var document = global.document;

  // Select only options the browser currently allows the user to change.
  function dispatch(select) {
    select.dispatchEvent(new global.Event('input', { bubbles: true }));
    select.dispatchEvent(new global.Event('change', { bubbles: true }));
  }
  function enabledOptions(select) {
    return Array.prototype.filter.call(select.options, function (option) { return !option.matches(':disabled'); });
  }
  function setSelection(select, selected) {
    if (!select.multiple || select.matches(':disabled')) return;
    var changed = false;
    enabledOptions(select).forEach(function (option) {
      if (option.selected !== selected) { option.selected = selected; changed = true; }
    });
    if (changed) dispatch(select);
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
      var options = enabledOptions(select);
      var selected = options.filter(function (option) { return option.selected; }).length;
      count.textContent = options.length ? selected + ' de ' + options.length + ' disponibles' : '';
      all.disabled = !select.multiple || select.matches(':disabled') || !options.length || selected === options.length;
      none.disabled = !select.multiple || select.matches(':disabled') || !selected;
    };
    all.addEventListener('click', function () {
      setSelection(select, true); refresh();
    });
    none.addEventListener('click', function () {
      setSelection(select, false); refresh();
    });
    select.addEventListener('change', refresh);
    bar.appendChild(all); bar.appendChild(none); bar.appendChild(count);
    select.insertAdjacentElement('afterend', bar);
    var observer = new global.MutationObserver(refresh);
    observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'multiple'] });
    for (var ancestor = select.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === 'FIELDSET') observer.observe(ancestor, { attributes: true, attributeFilter: ['disabled'] });
    }
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

  global.MuniControlShellUx = Object.freeze({ decorateMultiSelect: decorate });
})(typeof window === 'undefined' ? globalThis : window);
