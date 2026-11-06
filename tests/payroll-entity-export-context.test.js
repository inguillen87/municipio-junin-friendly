import test from 'node:test';
import assert from 'node:assert/strict';
import { internalPayrollEntityExport } from '../lib/internal-payroll-entity-export.js';

const id = '3fbf3df3-2bad-4d92-ab96-f16fcdd253ac';
const other = '8b2a1c90-e0be-4abd-9273-a577404548d2';
const principal = { user: { email: 'qa@example.invalid' }, tenant: { source: 'membership', id, membershipId: id, effectiveCapabilities: ['payroll.read', 'workforce.employee.read'] } };
const session = { email: 'qa@example.invalid', id, version: 1, releaseSha: 'a'.repeat(40) };
const base = { version: 'payroll-entity-export.v1', found: true, datasetId: id, date: '2026-10-31', period: 2026, month: 10, type: 'M', concept: '638', concepts: [], rows: [] };
const answer = data => ({ query: async () => [{ result: data }] });
const request = concept => ({ query: { resource: 'payrollentityexport', datasetId: id, ...(concept === undefined ? {} : { concept }) } });

test('a valid response for another dataset is never returned to the caller', async () => {
  await assert.rejects(internalPayrollEntityExport(answer({ ...base, datasetId: other }), request('638'), principal, session), /PAYROLL_ENTITY_EXPORT_CONTEXT_DRIFT/);
});

test('a valid response for another concept is never returned to the caller', async () => {
  await assert.rejects(internalPayrollEntityExport(answer({ ...base, concept: '639' }), request('638'), principal, session), /PAYROLL_ENTITY_EXPORT_CONTEXT_DRIFT/);
});

test('concept listings and selected concept rows cannot be interchanged', async () => {
  await assert.rejects(internalPayrollEntityExport(answer({ ...base, concept: null }), request('638'), principal, session), /PAYROLL_ENTITY_EXPORT_CONTEXT_DRIFT/);
  await assert.rejects(internalPayrollEntityExport(answer(base), request(undefined), principal, session), /PAYROLL_ENTITY_EXPORT_CONTEXT_DRIFT/);
  const list = await internalPayrollEntityExport(answer({ ...base, concept: null }), request(undefined), principal, session);
  assert.equal(list.status, 200);
  assert.equal(list.payload.data.concept, null);
});

test('not-found replies remain non-nominal and valid for either request kind', async () => {
  for (const concept of [undefined, '638']) {
    const result = await internalPayrollEntityExport(answer({ version: base.version, found: false }), request(concept), principal, session);
    assert.deepEqual(result, { status: 200, payload: { ok: true, data: { version: base.version, found: false } } });
  }
});

test('invalid or duplicate selectors never reach the SQL reader', async () => {
  let calls = 0;
  const sql = { query: async () => { calls++; throw Error('unexpected query'); } };
  for (const query of [
    { resource: 'payrollentityexport', datasetId: [id, other] },
    { resource: 'payrollentityexport', datasetId: id, concept: ['638', '639'] },
    { resource: 'payrollentityexport', datasetId: id, extra: 'value' },
    { resource: 'payrollentityexport', datasetId: id, concept: '' },
  ]) assert.equal((await internalPayrollEntityExport(sql, { query }, principal, session)).status, 400);
  assert.equal(calls, 0);
});

test('uppercase dataset ids still compare against the canonical returned id', async () => {
  const req = request('638'); req.query.datasetId = id.toUpperCase();
  assert.equal((await internalPayrollEntityExport(answer(base), req, principal, session)).status, 200);
});
