import test from 'node:test';
import assert from 'node:assert/strict';
import { seniorityDefinition, seniorityCommand, seniorityBootstrap, seniorityReceipt, seniorityCapture } from '../assets/own-salary-seniority-model.js';
const id = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002', h = 'a'.repeat(64);
const definition = () => ({ years: '0', months: null, asOfDate: '2026-10-01', documentReference: 'Constancia municipal sintética' });
const command = () => ({ command: 'propose', contractId: id, period: '2026-10', scopeVersion: h, baseVersion: h, sourceVersion: h, proposalId: null, proposalSha256: null, definition: definition(), reason: 'Declaración sintética documentada', reviewConfirmed: false });
const configuration = () => ({ version: h, revision: 1, definition: definition(), proposalId: id, approvalId: other, identityToken: h });
test('recognized components preserve null, zero and exact integers without aging or conversion', () => {
 assert.deepEqual(seniorityDefinition(definition(), '2026-10'), definition());
 assert.deepEqual(seniorityDefinition({ ...definition(), years: '8', months: '11' }, '2026-10'), { ...definition(), years: '8', months: '11' });
 assert.equal(seniorityDefinition({ ...definition(), years: null, months: null }, '2026-10').years, null);
});
test('rejects fractional, negative, padded, numeric, overflowing months and future reference dates', () => {
 for (const years of ['01', '-1', '1.5', 0, '', ' 1', '1000000000000000000']) assert.throws(() => seniorityDefinition({ ...definition(), years }, '2026-10'));
 for (const months of ['12', '-1', '01', 0, '1.0']) assert.throws(() => seniorityDefinition({ ...definition(), months }, '2026-10'));
 for (const asOfDate of ['2026-11-01', '2026-02-30', '2026-10-01T00:00:00Z']) assert.throws(() => seniorityDefinition({ ...definition(), asOfDate }, '2026-10'));
 assert.throws(() => seniorityDefinition({ ...definition(), hireDate: '2020-01-01' }, '2026-10'));
});
test('commands bind contract, period and exact immutable proposal/decision fields', () => {
 assert.deepEqual(seniorityCommand(command()), command());
 for (const change of [{ period: '2026-13' }, { contractId: '123' }, { reviewConfirmed: true }, { definition: null }, { sourceVersion: null }]) assert.throws(() => seniorityCommand({ ...command(), ...change }));
 assert.throws(() => seniorityCommand({ ...command(), command: 'approve' }));
 assert.equal(seniorityCommand({ ...command(), command: 'approve', definition: null, proposalId: id, proposalSha256: h, reviewConfirmed: true }).command, 'approve');
});
test('capture requires complete unique subjects, preserves absent approved facts and detects identity changes', () => {
 const v = { complete: true, version: h, records: [{ contractId: id, identityToken: h, configuration: configuration() }] };
 assert.deepEqual(seniorityCapture(v, [{ contractId: id, identityToken: h }], '2026-10'), v);
 assert.throws(() => seniorityCapture({ ...v, complete: false }, [{ contractId: id, identityToken: h }], '2026-10'));
 assert.throws(() => seniorityCapture({ ...v, records: [...v.records, ...v.records] }, [{ contractId: id, identityToken: h }], '2026-10'));
 assert.throws(() => seniorityCapture(v, [{ contractId: id, identityToken: 'b'.repeat(64) }], '2026-10'));
 assert.throws(() => seniorityCapture(v, [{ contractId: other, identityToken: h }], '2026-10'));
 const absent = { ...v, records: [{ contractId: id, identityToken: h, configuration: { version: h, revision: 0, definition: null, proposalId: null, approvalId: null, identityToken: null } }] };
 assert.equal(seniorityCapture(absent, [{ contractId: id, identityToken: h }], '2026-10').records[0].configuration.definition, null);
});
test('bootstrap and receipts reject fake business effects and changed retry bodies', () => {
 assert.throws(() => seniorityBootstrap({ version: 'own-salary-seniority.v1', complete: false }));
 const r = { version: 'own-salary-seniority.v1', eventId: id, proposalId: id, requestKey: other, requestSha256: h, body: command(), status: 'pending', revision: 0, configurationVersion: h, replayed: false, payrollCalculated: false, payrollPosted: false };
 assert.deepEqual(seniorityReceipt(r, { key: other, body: command() }), r);
 assert.throws(() => seniorityReceipt({ ...r, payrollCalculated: true }));
 assert.throws(() => seniorityReceipt(r, { key: other, body: { ...command(), period: '2026-09' } }));
});
