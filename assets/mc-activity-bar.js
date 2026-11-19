// MuniControl activity bar: while a request to the app's own API takes longer than a moment, the brand line at the top
// of the page moves. Presentation only: the original fetch promise is returned untouched and nothing is stored.
(function (global) {
  'use strict';
  var root = global && global.document && global.document.documentElement;
  if (!root || typeof global.fetch !== 'function' || global.__mcActivityBar) return;
  global.__mcActivityBar = true;
  var original = global.fetch, pending = 0, timer = null;
  function sameOriginApi(input) {
    try {
      var url = new URL(typeof input === 'string' ? input : (input && input.url) || String(input), global.location.href);
      return url.origin === global.location.origin && url.pathname.indexOf('/api/') === 0;
    } catch (_) { return false; }
  }
  function update() {
    if (pending > 0 && !timer && !root.classList.contains('mc-loading')) timer = global.setTimeout(function () { timer = null; if (pending > 0) root.classList.add('mc-loading'); }, 250);
    if (pending === 0) { if (timer) { global.clearTimeout(timer); timer = null; } root.classList.remove('mc-loading'); }
  }
  global.fetch = function (input) {
    var promise = original.apply(this, arguments);
    if (!sameOriginApi(input)) return promise;
    pending++; update();
    var done = function () { pending = Math.max(0, pending - 1); update(); };
    promise.then(done, done);
    return promise;
  };
})(typeof window !== 'undefined' ? window : null);
