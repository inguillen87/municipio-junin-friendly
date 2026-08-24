import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('la ficha convierte el legajo en punto de partida operativo sin exponerlo en URL', async () => {
  const html = await read('internal-dashboard.html');
  assert.match(html, /Gestión rápida del legajo/);
  assert.match(html, /Estimar referencia anual/);
  assert.match(html, /Nueva solicitud de licencia/);
  assert.match(html, /LEAVE_PREVIEW_HANDOFF_KEY/);
  assert.match(html, /ACTION_SUBJECT_HANDOFF_KEY/);
  assert.match(html, /sessionStorage\.setItem\(key/);
  assert.match(html, /location\.assign\('licencias-control\.html#preview'\)/);
  assert.match(html, /location\.assign\('centro-acciones\.html'\)/);
  assert.doesNotMatch(html, /location\.assign\([^\n]*(?:companyId|legajo|contractId)/);
  assert.doesNotMatch(html, /localStorage/);
});

test('licencias consume el traspaso una sola vez y ejecuta el motor existente', async () => {
  const html = await read('licencias-control.html');
  assert.match(html, /function consumePreviewHandoff/);
  assert.match(html, /sessionStorage\.removeItem\(LEAVE_PREVIEW_HANDOFF_KEY\)/);
  assert.match(html, /HANDOFF_MAX_AGE_MS/);
  assert.match(html, /el\.previewForm\.requestSubmit\(\)/);
  assert.match(html, /resource:\s*'leavepreview'/);
  assert.doesNotMatch(html, /localStorage/);
});

test('Centro de acciones consume el legajo y conserva la búsqueda privada por POST', async () => {
  const html = await read('centro-acciones.html');
  assert.match(html, /function consumeActionSubjectHandoff/);
  assert.match(html, /sessionStorage\.removeItem\(ACTION_SUBJECT_HANDOFF_KEY\)/);
  assert.match(html, /openWizard\(\)/);
  assert.match(html, /searchAuthorizedSubjects\(\)/);
  assert.match(html, /command:\s*'search_subjects'/);
  assert.match(html, /method:\s*'POST'/);
  assert.doesNotMatch(html, /localStorage\.(?:setItem|getItem)\(ACTION_SUBJECT_HANDOFF_KEY/);
});

test('los scripts inline modificados conservan sintaxis JavaScript válida', async () => {
  for (const file of ['internal-dashboard.html', 'licencias-control.html', 'centro-acciones.html']) {
    const html = await read(file);
    for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: file });
    }
  }
});
