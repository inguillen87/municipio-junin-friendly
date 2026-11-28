// Returning to the tab must not leave a payroll task empty: each panel withdraws its data while the page is hidden and,
// once visible again with its task still open, repeats what opening the task does (a fresh read or session check).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(`../assets/${name}.js`, import.meta.url), 'utf8');

const REFRESH = ['own-payroll-close-panel', 'own-payroll-liquidation-panel', 'own-bank-accounts-panel', 'own-payroll-accounting-panel'];
const REOPEN = {
  'own-payroll-annulment-panel': 'anulacion', 'own-payroll-imputation-panel': 'imputacion',
  'own-payroll-journal-panel': 'asientos', 'own-payroll-reconciliation-panel': 'conciliacion',
};
// Edit forms (encuadre, participación, antigüedad, jornada, condiciones, horas de convenio, días ART, datos fiscales, ART)
// keep their explicit «Verificar acceso» step after hiding: their tests hold that the person re-verifies on purpose.
const EXPLICIT_RECHECK = ['own-art-report-panel', 'own-agreement-working-time-panel', 'own-art-days-panel',
  'own-contract-salary-conditions-panel', 'own-contract-working-time-panel', 'own-fiscal-facts-panel',
  'own-period-classification-panel', 'own-period-participation-panel', 'own-salary-seniority-panel'];

const handler = source => {
  const start = source.indexOf("visibility=()=>{if(document.hidden)suspend('");
  assert.ok(start >= 0, 'the panel keeps a visibility handler that withdraws while hidden');
  let depth = 0, end = source.indexOf('{', start);
  for (let i = end; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) { end = i; break; }
  }
  const body = source.slice(source.indexOf('{', start) + 1, end);
  const match = body.match(/^if\(document\.hidden\)suspend\('([^']*)'\);(else.*)$/s);
  assert.ok(match, 'hidden withdraws, then the return branch');
  return { message: match[1], back: match[2] };
};

test('panels that read on opening read again on return, only while their task is open', () => {
  for (const name of REFRESH) {
    const { message, back } = handler(read(name));
    assert.match(message, /Al volver se consulta/, name);
    assert.match(back, /^else if\(active&&!stopped\)refresh\(\);else controls\(\);$/, name);
  }
});

test('panels that check the session on opening check it again on return, with their own task id', () => {
  for (const [name, id] of Object.entries(REOPEN)) {
    const source = read(name), { message, back } = handler(source);
    assert.match(source, new RegExp(`task=e=>\\{active=e\\.detail\\?\\.id==='${id}'`), name);
    assert.match(message, /Al volver se verifica el acceso/, name);
    assert.equal(back, `else if(active)task({detail:{id:'${id}'}});else controls();`, name);
  }
  for (const name of EXPLICIT_RECHECK) {
    const { back } = handler(read(name));
    assert.equal(back, 'else controls();', `${name} waits for the explicit access check`);
  }
});
