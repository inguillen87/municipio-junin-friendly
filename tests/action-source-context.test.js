import assert from 'node:assert/strict';
import test from 'node:test';
import { actionSourceContextFields } from '../lib/action-source-context.js';
import { ActionCenterError, serializeActionCase, serializeActionCaseSummary, allowedCommandsForCase, readLeaveCase } from '../lib/internal-leave-workflow.js';
import { readOvertimeCase, listOvertimeCases } from '../lib/internal-overtime-workflow.js';

const earlier = '2026-08-06T18:15:21+00:00', later = '2026-09-10T18:17:30Z';
const history = { status: 'historical_read_only', sourceCutoffAt: earlier, currentCutoffAt: later };
const id = n => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const identity = { user: { email: 'history@municipal.example' }, tenant: { id: id('a'), membershipId: id('b'), source: 'membership' } };
const session = { id: id('c'), email: identity.user.email, version: 1, releaseSha: 'a'.repeat(40) };
const principal = { email: identity.user.email, tenantId: id('a'), membershipId: id('b'), sourceBindingId: id('d'), roleKey: 'JUNIN_RRHH', sourceCompanyId: 101, sourceDatabase: 'grh_junin', employmentContractId: id('e'), actorPersonId: id('f'), capabilities: ['actions.read','leave.request.all.read','time.overtime.read'], areaScopes: [] };
const record = { id: id('1'), caseNumber: '42', caseType: 'leave_request', beneficiaryContractId: id('e'), status: 'submitted', confidentiality: 'standard', policyVersionId: 'mendoza-ley-5811-title-vi.v1', payload: { reasonCode: '19', startsOn: '2026-08-20', endsOn: '2026-08-21', durationUnit: 'calendar_day', employeeNote: 'Private synthetic note' }, evidenceStatus: 'pending', version: 2, nominalProjection: true, projection: 'nominal', subjectDisplayName: 'Synthetic', sourceContext: history };
const sql = envelope => ({ query: async () => ({ rows: [{ result: envelope }] }) });

test('origin contract preserves legacy omission and exact bounded non-nominal shape', () => {
  assert.deepEqual(actionSourceContextFields({}), {});
  assert.deepEqual(actionSourceContextFields({ sourceContext: history }, ActionCenterError), { sourceContext: history });
  assert.deepEqual(actionSourceContextFields({ sourceContext: { status: 'current', sourceCutoffAt: earlier, currentCutoffAt: '2026-08-06T15:15:21-03:00' } }, ActionCenterError).sourceContext.status, 'current');
});
for (const [name, bad] of [
  ['null', null], ['array', []], ['private extra field', { ...history, name: 'Do not echo this' }],
  ['unknown mode', { ...history, status: 'approved' }], ['missing date', { status: 'historical_read_only', sourceCutoffAt: earlier }],
  ['invalid civil date', { ...history, sourceCutoffAt: '2026-02-30T00:00:00Z' }],
  ['missing zone', { ...history, sourceCutoffAt: '2026-08-06T18:15:21' }],
  ['inverted history', { ...history, sourceCutoffAt: later, currentCutoffAt: earlier }],
  ['equal history', { ...history, currentCutoffAt: earlier }],
  ['current differs', { ...history, status: 'current' }],
  ['fraction differs in current', { status: 'current', sourceCutoffAt: '2026-08-01T00:00:00.000001Z', currentCutoffAt: '2026-08-01T00:00:00.000002Z' }],
]) test(`origin rejects ${name} with a controlled message`, () => {
  assert.throws(() => actionSourceContextFields({ sourceContext: bad }, ActionCenterError), e => e.code === 'ACTION_SOURCE_CONTEXT_INVALID' && e.status === 502 && !e.message.includes('Do not echo'));
});
test('microseconds retain chronological ordering', () => {
  assert.equal(actionSourceContextFields({ sourceContext: { status: 'historical_read_only', sourceCutoffAt: '2026-08-01T00:00:00.000001Z', currentCutoffAt: '2026-08-01T00:00:00.000002Z' } }, ActionCenterError).sourceContext.status, 'historical_read_only');
});
test('leave summary and detail preserve origin in nominal and payroll projections without private subject leakage', () => {
  for (const serialize of [serializeActionCase, serializeActionCaseSummary]) {
    const nominal = serialize(record, principal, 'nominal'), payroll = serialize(record, principal, 'payroll');
    assert.deepEqual(nominal.sourceContext, history); assert.deepEqual(payroll.sourceContext, history);
    assert.equal(payroll.subject, undefined); assert.ok(!JSON.stringify(payroll).includes('Private synthetic note'));
    assert.equal(nominal.status, 'submitted');
  }
});
test('leave historical context vetoes all commands even with an inconsistent facade command list', async () => {
  assert.deepEqual(allowedCommandsForCase(principal, record), []);
  const result = await readLeaveCase(sql({ principal, record, timeline: [], allowedCommands: ['approve','submit','cancel'] }), identity, record.id, session);
  assert.deepEqual(result.allowedCommands, []); assert.deepEqual(result.data.sourceContext, history); assert.equal(result.data.status, 'submitted');
});
test('overtime historical list and detail preserve origin, administrative status and command veto', async () => {
  const item = { ...record, caseType: 'overtime_entry', subject: { displayName: 'Synthetic', contractId: id('e'), legajo: '42' }, payload: { workDate: '2026-08-20', declaredMinutes: 45, reasonCode: 'service_continuity' } };
  const detail = await readOvertimeCase(sql({ principal, record: item, timeline: [], allowedCommands: ['approve','cancel'] }), identity, item.id, session);
  assert.deepEqual(detail.allowedCommands, []); assert.deepEqual(detail.data.sourceContext, history); assert.equal(detail.data.status, 'submitted');
  const list = await listOvertimeCases(sql({ principal, records: [item], total: 1 }), identity, {}, session);
  assert.deepEqual(list.data[0].sourceContext, history);
});
