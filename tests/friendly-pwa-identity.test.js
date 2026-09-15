import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFriendlyPwaIdentity } from '../scripts/apply-friendly-social-metadata.mjs';

test('PWA: normaliza enlaces antiguos y agrega iconos ausentes sin cambiar el cuerpo', () => {
  const body = '<body><form><input value="trabajo guardado"></form><script>const icon = "<link rel=icon>";</script></body></html>';
  const input = '<html><head><title>Recibos</title><link rel="icon" href="data:image/svg+xml,<svg></svg>"><link rel="shortcut icon" href="/old.ico"><link rel="apple-touch-icon" href="/old.png"><link rel="manifest" href="/old.json"><meta name="theme-color" content="red"><link rel="canonical" href="/recibos"><meta name="robots" content="noindex"></head>' + body;
  const result = applyFriendlyPwaIdentity(input);
  assert.equal((result.match(/rel="icon"/g) || []).length, 1);
  assert.equal((result.match(/rel="manifest"/g) || []).length, 1);
  assert.equal((result.match(/rel="apple-touch-icon"/g) || []).length, 1);
  assert.equal((result.match(/name="theme-color"/g) || []).length, 1);
  assert.match(result, /href="\/assets\/pwa\/icon.svg"/);
  assert.doesNotMatch(result, /old\.(?:ico|png|json)|data:image/);
  assert.match(result, /<title>Recibos<\/title>/);
  assert.match(result, /<link rel="canonical" href="\/recibos">/);
  assert.match(result, /<meta name="robots" content="noindex">/);
  assert.equal(result.slice(result.indexOf('<body>')), body);
  const missing = applyFriendlyPwaIdentity('<html><head></head><body></body></html>');
  assert.match(missing, /rel="manifest"/);
  assert.match(missing, /apple-mobile-web-app-title" content="MuniControl"/);
});

test('PWA: es idempotente y conserva comentarios, scripts y plantillas', () => {
  const preserved = '<!-- <link rel="icon" href="comment"> --><script>const s = \'<link rel="icon" href="script">\';</script><template><link rel="icon" href="template"></template>';
  const input = `<html><head>${preserved}</head><body>ok</body></html>`;
  const result = applyFriendlyPwaIdentity(input);
  assert.ok(result.includes(preserved));
  assert.equal(applyFriendlyPwaIdentity(result), result);
});

test('PWA: exige un documento completo y conserva los saltos de línea', () => {
  assert.throws(() => applyFriendlyPwaIdentity(null), TypeError);
  assert.throws(() => applyFriendlyPwaIdentity('<body>incompleto</body>'), /head/);
  const result = applyFriendlyPwaIdentity('<html>\r\n<head>\r\n</head>\r\n<body></body></html>');
  assert.doesNotMatch(result, /(?<!\r)\n/);
});
