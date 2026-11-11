// Novedades fijas se abre de tres maneras: por su pestaña, por un enlace #fixedNovelties o por la ficha de un alta
// (?fixedContractId=…). En las tres, la sección puede abrirse antes de que se conozca el acceso. Estas guardas fijan que,
// en cualquier orden, termina consultando una vez y nunca lee sin permiso.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../assets/payroll-fixed-novelties.js', import.meta.url), 'utf8');

test('abrir antes de conocer el acceso no lee nada y deja anotado que falta consultar', () => {
  assert.match(source, /shell\.addEventListener\('toggle',\(\)=>\{if\(shell\.open\)\{mount\(\);if\(!hasRead\(access\)\)openedWithoutAccess=true;else if\(!data&&!editor&&!busy\)refresh\(\);\}/);
});

test('al llegar el acceso, la sección ya abierta consulta: no queda abierta y vacía', () => {
  const access = source.slice(source.indexOf('setAccess({capabilities,principalKey}){'));
  assert.ok(access.length > 0 && source.includes('setAccess({capabilities,principalKey}){'));
  assert.match(access, /else if\(shell\.open&&\(!mounted\|\|openedWithoutAccess\)\)\{openedWithoutAccess=false;mount\(\);if\(!data&&!editor&&!busy\)refresh\(\);\}/);
  // El permiso de lectura se verifica antes de montar o consultar.
  assert.ok(access.indexOf('if(!hasRead(access)){deny();') >= 0);
  assert.ok(access.indexOf('if(!hasRead(access)){deny();') < access.indexOf('openedWithoutAccess=false'));
});

test('el enlace desde la ficha de un alta abre la sección y la consulta resuelve a la persona pedida', () => {
  const access = source.slice(source.indexOf('setAccess({capabilities,principalKey}){'));
  assert.ok(access.indexOf('if(requestedContract&&!shell.open)shell.open=true;') < access.indexOf('else if(shell.open&&(!mounted||openedWithoutAccess))'));
  assert.match(source, /else if\(requestedContract&&allowedPrepare\(\)\)\{\s*const contractId=requestedContract;requestedContract=null;/);
});
