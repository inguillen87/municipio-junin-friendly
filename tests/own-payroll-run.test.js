import test from 'node:test';
import assert from 'node:assert/strict';
import { ownRunCommand, ownRunBootstrap, ownRunCapture } from '../assets/own-payroll-run-model.js';
import { ownRunOperation, ownRunHash, ownRunAlgorithmHash, RUN_CALCULATE } from '../lib/internal-own-payroll-run.js';
import { capture, saved, runCommand } from './fixtures/own-payroll-run-synthetic.js';
import { uid, hash } from './fixtures/own-payroll-program-synthetic.js';
const principal = { user: { email: 'qa@example.invalid' }, tenant: { source: 'membership', id: uid(1), membershipId: uid(2), effectiveCapabilities: RUN_CALCULATE } }, session = { email: 'qa@example.invalid', id: uid(3), version: 1, releaseSha: 'd'.repeat(40) };
const operate = (sql, op = 'calculate', input = { key: uid(9), body: runCommand() }, algorithm = hash('c')) => ownRunOperation(sql, principal, session, op, input, { algorithmHash: () => algorithm });
test('captura completa se calcula en servidor y se persiste sin entregar importes al cliente como entrada', async () => {
  const c = capture(), calls = [], sql = { query: async (q, v) => { calls.push([q, v]); return [{ result: calls.length === 1 ? c : saved(c) }]; } };
  const r = await operate(sql); assert.equal(calls.length, 2); assert.match(calls[0][0], /own_run_capture/); assert.match(calls[1][0], /own_run_complete/);
  assert.equal(r.saved.result.rowCount, 12); assert.equal(r.saved.result.paymentExecuted, false); assert.equal(r.saved.result.municipalApprovalVerified, false); assert.equal(r.saved.inputSha256, ownRunHash(JSON.parse(calls[1][1][2])));
});

test('una observación histórica de GRH no impide guardar el cálculo de un concepto propio aprobado', async () => {
  const c = capture(); c.payload.monthly.batches[0].rows[0].issues = [{ code: 'concept_not_observed', severity: 'warning', blocking: false, field: 'conceptSourceId', details: { basis: 'published_grh_observation' } }];
  c.payloadSha256 = ownRunHash(c.payload); let calls = 0;
  const r = await operate({ query: async () => [{ result: ++calls === 1 ? c : saved(c) }] });
  assert.equal(calls, 2); assert.equal(r.saved.input.employees[0].inputs.find(i => i.key === 'addition').value, '20.00000000');
  assert.deepEqual(r.payload.monthly.batches[0].rows[0].issues, c.payload.monthly.batches[0].rows[0].issues);
});
test('resultado recuperado conserva fuentes anteriores incluso con otra versión actual del motor', async () => {
  const c = capture(); c.saved = saved(c); c.replayed = true; let count = 0;
  const r = await operate({ query: async () => { count++; return [{ result: c }]; } }, 'calculate', { key: c.key, body: c.body }, hash('e'));
  assert.equal(count, 1); assert.deepEqual(r, c);
});
test('captura pendiente queda congelada si cambió el motor; GET no recalcula', async () => {
  const c = capture(); let count = 0; const sql = { query: async () => { count++; return [{ result: c }]; } };
  await assert.rejects(operate(sql, 'calculate', { key: c.key, body: c.body }, hash('e')), e => e.code === 'OWN_RUN_ENGINE_CHANGED' && e.status === 409); assert.equal(count, 1);
  assert.deepEqual(await operate(sql, 'attempt', { key: c.key }), c); assert.equal(count, 2);
});
for (const field of ['bodySha256', 'payloadSha256']) test('hash corrupto ' + field + ' impide calcular o guardar', async () => {
  const c = capture({ [field]: hash('f') }); let count = 0; await assert.rejects(operate({ query: async () => { count++; return [{ result: c }]; } }), e => e.status === 503); assert.equal(count, 1);
});
test('un recibo válido de otro intento no sustituye la clave ni el cuerpo', async () => {
  for (const c of [capture({ key: uid(99) }), capture({ body: runCommand({ period: '2026-11' }) })]) await assert.rejects(operate({ query: async () => [{ result: c }] }), e => e.status === 503);
});
test('datos incompletos no guardan resultado ni convierten ausencia en cero', async () => {
  const c = capture(); c.payload.population.complete = false; c.payloadSha256 = ownRunHash(c.payload); let count = 0;
  await assert.rejects(operate({ query: async () => { count++; return [{ result: c }]; } }), e => e.status === 422); assert.equal(count, 1);
});
test('respuesta por encima de4MiB es un error global, no una captura recortada', async () => {
  const c = capture(); c.payload.sourceInventory.largeSyntheticAudit = 'x'.repeat(4 * 1024 * 1024); c.payloadSha256 = ownRunHash(c.payload); let calls = 0;
  await assert.rejects(operate({ query: async () => { calls++; return [{ result: c }]; } }), e => e.code === 'OWN_RUN_LIMIT' && e.status === 422); assert.equal(calls, 1);
});
test('recuperación comprueba hashes de resultado y banderas antes de devolver datos', async () => {
  for (const mutate of [s => s.resultSha256 = hash('f'), s => s.inputSha256 = hash('f'), s => { s.result.paymentExecuted = true; s.resultSha256 = ownRunHash(s.result); }]) {
    const c = capture(); c.saved = saved(c); mutate(c.saved); await assert.rejects(operate({ query: async () => [{ result: c }] }, 'attempt', { key: c.key }), e => e.status === 503);
  }
});
test('un hash coherente de otra entrada no autoriza sustituir las fuentes capturadas', async () => {
  const c = capture(); c.saved = saved(c); c.saved.input.period = '2026-11'; c.saved.result.period = '2026-11'; c.saved.inputSha256 = ownRunHash(c.saved.input); c.saved.resultSha256 = ownRunHash(c.saved.result);
  await assert.rejects(operate({ query: async () => [{ result: c }] }, 'attempt', { key: c.key }), e => e.status === 503);
});
test('guardar exige que el recibo coincida con el resultado exacto calculado en ese envío', async () => {
  const c = capture(), s = saved(c); s.result.rows[0].amount = '100.11'; s.resultSha256 = ownRunHash(s.result); let calls = 0;
  await assert.rejects(operate({ query: async () => [{ result: ++calls === 1 ? c : s }] }), e => e.status === 503); assert.equal(calls, 2);
});
test('selección explícita se ordena, y filtros/UUID nominales/campos extras no se aceptan', () => {
  assert.deepEqual(ownRunCommand(runCommand({ selection: { kind: 'contracts', values: [uid(8), uid(7)] } })).selection.values, [uid(7), uid(8)]);
  for (const body of [runCommand({ search: 'qa' }), runCommand({ selection: { kind: 'all', values: [uid(1)] } }), runCommand({ selection: { kind: 'contracts', values: [uid(1), uid(1)] } }), runCommand({ populationDomain: 'GRH' }), runCommand({ period: null })]) assert.throws(() => ownRunCommand(body));
});
test('listado sin permiso nominal sólo admite cantidades y referencias de corrida', () => {
  const metadata = { version: 'own-payroll-bootstrap.v1', scopeVersion: hash('a'), programVersion: hash('b'), canCalculate: false, complete: true, runs: [{ id: uid(90), key: uid(9), period: '2026-10', liquidationType: 'monthly', selectionKind: 'contracts', selectionValueCount: 1, createdAt: '2026-10-05T10:00:00Z', state: 'captured', inputSha256: null, resultSha256: null }] };
  assert.deepEqual(ownRunBootstrap(metadata), metadata); metadata.runs[0].selection = { kind: 'contracts', values: [uid(1)] }; assert.throws(() => ownRunBootstrap(metadata));
});
test('errores SQL preservan incertidumbre y no exponen mensaje interno', async () => {
  for (const [message, status] of [['OWN_RUN_FORBIDDEN', 403], ['OWN_RUN_IDEMPOTENCY_REUSE', 409], ['OWN_RUN_HISTORY_REQUIRED', 422], ['OWN_RUN_LIMIT', 422], ['PAYROLL_FIXED_ROW_LIMIT', 422], ['PAYROLL_FIXED_IDENTITY_CHANGED', 409], ['PAYROLL_FIXED_DATES_INVALID', 422], ['private password', 503]]) await assert.rejects(operate({ query: async () => { throw Error(message); } }), e => e.status === status && !e.message.includes('password'));
});
test('huella del algoritmo es estable y el contrato de captura es cerrado', () => {
  assert.match(ownRunAlgorithmHash(), /^[a-f0-9]{64}$/); assert.equal(ownRunAlgorithmHash(), ownRunAlgorithmHash()); assert.throws(() => ownRunCapture({ ...capture(), nominal: 'x' }));
});
