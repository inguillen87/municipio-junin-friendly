// Calcular con un programa de total oficial (V4) o con política de emisión de renglones (V5). El servidor elige el productor
// de la entrada por lo que declara el programa capturado, calcula con el motor de esa versión y pide guardar el resultado
// al finalizador oficial. Los documentos de prueba son los que devolvió PostgreSQL 18.6 con el candidato nativo de Root:
// la entrada y el resultado que arma el producto tienen que ser, huella por huella, los que esa base aceptó y guardó.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownRunOperation, ownRunHash, ownRunAlgorithmHash, verifyOwnRunReceipt, runError, RUN_CALCULATE } from '../lib/internal-own-payroll-run.js';
import { nativeOfficial, NATIVE_OFFICIAL_VERSIONS } from './fixtures/own-payroll-native-official-pg18.js';
import { officialCloseCorpus, officialCapture } from './fixtures/own-payroll-official-close-synthetic.js';
import { capture as historicalCapture, saved as historicalSaved } from './fixtures/own-payroll-run-synthetic.js';
import { uid } from './fixtures/own-payroll-program-synthetic.js';

const principal = { user: { email: 'qa@example.invalid' }, tenant: { source: 'membership', id: uid(1), membershipId: uid(2), effectiveCapabilities: RUN_CALCULATE } }, session = { email: 'qa@example.invalid', id: uid(3), version: 1, releaseSha: 'd'.repeat(40) };
const rehash = c => { c.payloadSha256 = ownRunHash(c.payload); return c; };
// Base simulada: la primera consulta devuelve la captura y la segunda, lo que haya que devolver como guardado.
function database(captured, completed) {
  const calls = [];
  return { calls, query: async (q, v) => { calls.push({ q, v }); return [{ result: calls.length === 1 ? captured : typeof completed === 'function' ? completed(v) : completed }]; } };
}
const calculate = (sql, c, deps = {}) => ownRunOperation(sql, principal, session, 'calculate', { key: c.key, body: structuredClone(c.body) }, { algorithmHash: () => c.algorithmSha256, ...deps });
const rejects = (promise, code, status) => assert.rejects(promise, e => { assert.equal(e.code, code); assert.equal(e.status, status); return true; });

for (const version of NATIVE_OFFICIAL_VERSIONS) test('calcular ' + version.toUpperCase() + ': la entrada y el resultado que se piden guardar son los que PostgreSQL 18 aceptó', async () => {
  const { capture, saved } = nativeOfficial(version), sql = database(capture, saved);
  const answer = await calculate(sql, capture);
  assert.equal(sql.calls.length, 2);
  assert.match(sql.calls[0].q, /public\.own_run_capture_v1\(/);
  assert.match(sql.calls[1].q, /public\.own_run_complete_official_v1\(/, 'el resultado oficial lo guarda su finalizador, no el histórico');
  const [, captureId, input, result, algorithm] = sql.calls[1].v;
  assert.equal(captureId, capture.id); assert.equal(algorithm, capture.algorithmSha256);
  assert.equal(JSON.parse(input).version, 'own-payroll-input.' + version); assert.equal(JSON.parse(result).version, 'own-payroll-result.' + version);
  assert.equal(ownRunHash(JSON.parse(input)), saved.inputSha256, 'la entrada es idéntica a la que guardó la base');
  assert.equal(ownRunHash(JSON.parse(result)), saved.resultSha256, 'el resultado es idéntico al que guardó la base');
  assert.deepEqual(answer.saved, saved); assert.equal(answer.id, capture.id);
  assert.equal(answer.saved.result.paymentExecuted, false); assert.equal(answer.saved.result.municipalApprovalVerified, false);
});

test('el JSON completo usa el finalizador oficial completo, y un programa histórico sigue con el suyo', async () => {
  const { capture, saved } = nativeOfficial('v5'), sql = database(capture, saved);
  await calculate(sql, capture, { fullJson: true });
  assert.match(sql.calls[1].q, /public\.own_run_complete_official_full_v1\(/);
  const old = historicalCapture(), oldSql = database(old, historicalSaved(old));
  await calculate(oldSql, old);
  assert.match(oldSql.calls[1].q, /public\.own_run_complete_v1\(/);
  assert.doesNotMatch(oldSql.calls[1].q, /official/);
});

test('repetir el mismo intento devuelve el resultado guardado sin volver a calcular ni a guardar', async () => {
  const { capture, saved } = nativeOfficial('v5'), stored = { ...capture, saved, replayed: true }, sql = database(stored);
  const answer = await calculate(sql, capture, { algorithmHash: () => 'e'.repeat(64) });
  assert.equal(sql.calls.length, 1, 'ni el motor nuevo ni otra consulta tocan lo guardado');
  assert.deepEqual(answer.saved, saved);
});

test('si la base devuelve algo distinto de lo calculado, no se da por guardado', async () => {
  for (const [name, change] of Object.entries({
    'otro neto, con su huella rehecha': s => { s.result.employeeTotals[0].net = '1.00'; s.resultSha256 = ownRunHash(s.result); },
    'otra entrada, con su huella rehecha': s => { s.input.employees[0].employeeNumber = '900002'; s.inputSha256 = ownRunHash(s.input); },
    'huella del resultado que no es la suya': s => { s.resultSha256 = 'f'.repeat(64); },
    'resultado de otra captura': s => { s.id = uid(77); },
    'otro algoritmo': s => { s.algorithmSha256 = 'e'.repeat(64); },
    'resultado marcado como pagado': s => { s.result.paymentExecuted = true; s.resultSha256 = ownRunHash(s.result); },
  })) {
    const { capture, saved } = nativeOfficial('v5'); change(saved);
    await rejects(calculate(database(capture, saved), capture), 'OWN_RUN_CONTRACT_INVALID', 503).catch(e => { throw Error(name + ': ' + e.message); });
  }
});

test('la entrada y el resultado deben coincidir con el inventario que la base dejó en la captura; si no, no se pide guardar', async () => {
  for (const [name, change] of Object.entries({
    'decisiones de emisión esperadas': p => { p.sourceInventory.rowEmission.expectedDecisionCount += 1; },
    'políticas de emisión': p => { p.sourceInventory.rowEmission.policiesSha256 = 'f'.repeat(64); },
    'contratos de la emisión': p => { p.sourceInventory.rowEmission.contractIds = [uid(55)]; },
    'sin inventario de emisión': p => { delete p.sourceInventory.rowEmission; },
    'tarifa familiar capturada': p => { p.sourceInventory.familyTariffs.familyFactsVersion = 'f'.repeat(64); },
    'sin inventario de tarifas': p => { delete p.sourceInventory.familyTariffs; },
  })) {
    const { capture, saved } = nativeOfficial('v5'); change(capture.payload); rehash(capture);
    const sql = database(capture, saved);
    await rejects(calculate(sql, capture), 'OWN_RUN_CONTRACT_INVALID', 503).catch(e => { throw Error(name + ': ' + e.message); });
    assert.equal(sql.calls.length, 1, name + ': sólo se consultó la captura');
  }
});

test('una captura hecha con otro motor no se completa con el actual', async () => {
  const { capture, saved } = nativeOfficial('v5'), sql = database(capture, saved);
  await rejects(calculate(sql, capture, { algorithmHash: () => 'e'.repeat(64) }), 'OWN_RUN_ENGINE_CHANGED', 409);
  assert.equal(sql.calls.length, 1);
});

test('leer un recibo de cálculo oficial comprueba sobre, huellas y que la entrada sea la que producen las fuentes capturadas', () => {
  for (const version of NATIVE_OFFICIAL_VERSIONS) { const { capture, saved } = nativeOfficial(version); assert.equal(verifyOwnRunReceipt({ ...capture, saved }).id, capture.id); }
  for (const fixture of officialCloseCorpus) assert.equal(verifyOwnRunReceipt(officialCapture(fixture.name)).saved.input.version, fixture.input.version, fixture.name);
  const invalid = change => { const { capture, saved } = nativeOfficial('v5'), value = { ...capture, saved }; change(value); assert.throws(() => verifyOwnRunReceipt(value), e => e.code === 'OWN_RUN_CONTRACT_INVALID' || e.code === 'RUN_CONTRACT_INVALID'); };
  invalid(v => { v.saved.result.employeeTotals[0].net = '1.00'; });
  invalid(v => { v.saved.input.employees[0].inputs[0].value = '999'; });
  // Una entrada distinta de la que producen las fuentes capturadas no pasa aunque traiga su propia huella.
  invalid(v => { const observed = v.saved.input.employees[0].inputs.find(i => typeof i.value === 'string'); assert.ok(observed); observed.value = observed.value + '1'; v.saved.inputSha256 = ownRunHash(v.saved.input); });
  invalid(v => { v.saved.input.sourceVersions.novelties = 'f'.repeat(64); v.saved.inputSha256 = ownRunHash(v.saved.input); });
  invalid(v => { v.saved.result.version = 'own-payroll-result.v4'; v.saved.resultSha256 = ownRunHash(v.saved.result); });
  invalid(v => { v.saved.result.payrollPosted = true; v.saved.resultSha256 = ownRunHash(v.saved.result); });
  invalid(v => { v.payload.monthly.extra = true; });
  invalid(v => { v.saved.id = uid(77); });
});

test('la versión del resultado tiene que corresponder al programa capturado, en los dos sentidos', () => {
  const { saved } = nativeOfficial('v5'), old = historicalCapture();
  assert.throws(() => verifyOwnRunReceipt({ ...old, saved: { ...saved, id: old.id, algorithmSha256: old.algorithmSha256 } }), e => e.code === 'OWN_RUN_CONTRACT_INVALID' && /no corresponde al programa capturado/.test(e.message));
  const official = nativeOfficial('v5').capture, lowered = historicalSaved(old);
  assert.throws(() => verifyOwnRunReceipt({ ...official, saved: { ...lowered, id: official.id, algorithmSha256: official.algorithmSha256 } }), e => e.code === 'OWN_RUN_CONTRACT_INVALID' && /no corresponde al programa capturado/.test(e.message));
  const untouched = historicalCapture(); untouched.saved = historicalSaved(untouched);
  assert.equal(verifyOwnRunReceipt(untouched).id, untouched.id, 'los recibos históricos se leen igual que antes');
});

test('los rechazos de la captura y del finalizador oficial llegan con un código que Calcular sabe explicar', () => {
  const coded = message => { const e = runError(Error(message)); return [e.code, e.status]; };
  assert.deepEqual(coded('OWN_RUN_OFFICIAL_MULTIPLE_AGREEMENTS_UNSUPPORTED'), ['OWN_RUN_SINGLE_AGREEMENT_REQUIRED', 422]);
  assert.deepEqual(coded('OWN_RUN_OFFICIAL_POLICY_REQUIRED'), ['OWN_RUN_OFFICIAL_POLICY_REQUIRED', 422]);
  for (const m of ['OWN_RUN_OFFICIAL_PROGRAM_REQUIRED', 'OWN_RUN_ROW_EMISSION_PROGRAM_REQUIRED', 'OWN_RUN_FAMILY_TARIFF_V4_REQUIRED']) assert.deepEqual(coded(m), ['OWN_RUN_PROGRAM_REQUIRED', 422]);
  for (const m of ['OWN_RUN_OFFICIAL_FAMILY_REQUIRED', 'OWN_RUN_QUANTITY_FAMILY_REQUIRED']) assert.deepEqual(coded(m), ['OWN_RUN_OFFICIAL_NOT_INSTALLED', 503]);
  for (const m of ['OWN_RUN_OFFICIAL_ACCUMULATOR_MISMATCH', 'OWN_RUN_OFFICIAL_CAPTURE_POPULATION_INVALID', 'OWN_RUN_ROW_EMISSION_INVENTORY_CHANGED', 'OWN_RUN_FAMILY_TARIFF_INVENTORY_CHANGED']) assert.deepEqual(coded(m), ['OWN_RUN_CONTRACT_INVALID', 503]);
  for (const [m, expected] of [['OWN_RUN_PROGRAM_REQUIRED', 'OWN_RUN_PROGRAM_REQUIRED'], ['OWN_RUN_ENGINE_CHANGED', 'OWN_RUN_ENGINE_CHANGED'], ['OWN_RUN_RESULT_CONFLICT', 'OWN_RUN_RESULT_CONFLICT'], ['OWN_RUN_LIMIT', 'OWN_RUN_LIMIT'], ['OWN_RUN_FAMILY_APPROVAL_REQUIRED', 'OWN_RUN_FAMILY_APPROVAL_REQUIRED']]) assert.equal(coded(m)[0], expected, 'los códigos anteriores no cambian');
  const panel = fs.readFileSync(new URL('../assets/own-payroll-run-panel.js', import.meta.url), 'utf8');
  for (const code of ['OWN_RUN_SINGLE_AGREEMENT_REQUIRED', 'OWN_RUN_OFFICIAL_POLICY_REQUIRED', 'OWN_RUN_OFFICIAL_NOT_INSTALLED', 'OWN_RUN_OFFICIAL_NONPOSITIVE_NET_REVIEW_REQUIRED', 'OWN_RUN_FAMILY_APPROVAL_REQUIRED', 'OWN_RUN_FAMILY_TARIFF_FACT_SOURCE_REQUIRED', 'OWN_RUN_FAMILY_TARIFF_FACT_MISSING', 'OWN_RUN_FORCED_RULE_REQUIRED']) assert.match(panel, new RegExp('\\n  ' + code + ":'[^']{40,}',"), code + ' tiene su texto en la pantalla');
  assert.match(panel, /OWN_RUN_SINGLE_AGREEMENT_REQUIRED:'[^']*un convenio por vez[^']*No se creó ningún cálculo\.'/);
});

test('la identidad del algoritmo cubre todos los módulos de los que depende el cálculo, sin excepciones', () => {
  const root = fileURLToPath(new URL('..', import.meta.url)), seen = new Set();
  const walk = file => {
    if (seen.has(file)) return; seen.add(file);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) { const spec = m[1] ?? m[2]; if (spec.startsWith('.')) walk(path.resolve(path.dirname(file), spec)); }
  };
  for (const entry of ['lib/own-payroll-approved-input.js', 'lib/own-payroll-snapshot.js', 'assets/own-payroll-official-totals.js', 'assets/own-payroll-row-emission.js']) walk(path.join(root, entry));
  const source = fs.readFileSync(path.join(root, 'lib/internal-own-payroll-run.js'), 'utf8'), body = source.slice(source.indexOf('export function ownRunAlgorithmHash'), source.indexOf('export class OwnRunError'));
  const listed = [...body.matchAll(/new URL\('([^']+)'/g)].map(m => path.resolve(root, 'lib', m[1]));
  assert.equal(new Set(listed).size, listed.length, 'ningún módulo repetido');
  assert.equal(new Set(listed.map(f => path.basename(f))).size, listed.length, 'la identidad nombra cada archivo por su nombre: no puede haber dos iguales');
  const missing = [...seen].filter(f => !listed.includes(f)).map(f => path.relative(root, f)).sort();
  assert.deepEqual(missing, [], 'un módulo del cálculo fuera de la identidad podría cambiar sin que cambie el algoritmo');
  for (const name of ['own-payroll-engine.js', 'own-payroll-expression.js', 'own-payroll-quantity.js', 'own-payroll-special-methods.js', 'own-payroll-family-tariffs.js', 'own-payroll-official-totals.js', 'own-payroll-row-emission.js']) assert.ok(listed.some(f => path.basename(f) === name), name);
  assert.match(ownRunAlgorithmHash(), /^[a-f0-9]{64}$/);
});
