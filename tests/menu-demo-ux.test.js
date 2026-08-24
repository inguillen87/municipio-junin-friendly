import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function parseInlineScripts(file) {
  const html = read(file);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: file });
  }
  return html;
}

test('Administración activa el recorrido contextual ya definido', () => {
  const html = parseInlineScripts('administracion-plataforma.html');
  const guide = read('assets/internal-guide.js');
  assert.match(html, /<body data-mc-page="platformAdmin">/);
  assert.match(guide, /platformAdmin:\s*\{/);
  assert.doesNotMatch(html, /data-mc-page="platform-admin"/);
});

test('Actualizar sólo anuncia éxito cuando todas las consultas necesarias lo confirman', () => {
  const html = parseInlineScripts('internal-dashboard.html');
  assert.match(html, /return \{ ok: true, resource: 'summary' \}/);
  assert.match(html, /return \{ ok: false, resource: 'summary', error: error \}/);
  assert.match(html, /return \{ ok: true, resource: 'employees' \}/);
  assert.match(html, /return \{ ok: false, resource: 'employees', error: error \}/);

  const start = html.indexOf('function refreshCurrentView()');
  const end = html.indexOf('\n      let searchTimer', start);
  assert.ok(start > 0 && end > start, 'debe existir un contrato aislable para la actualización manual');
  const refresh = html.slice(start, end);
  assert.match(refresh, /Promise\.allSettled\(tasks\)/);
  assert.match(refresh, /result\.status === 'rejected'/);
  assert.match(refresh, /result\.value\.ok !== true/);
  assert.match(refresh, /La actualización quedó incompleta/);
  assert.match(refresh, /Información actualizada\./);
  assert.doesNotMatch(refresh, /Actualización finalizada/);
});
