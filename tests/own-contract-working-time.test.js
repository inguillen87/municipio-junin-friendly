import test from 'node:test';
import assert from 'node:assert/strict';
import { workingTimeDefinition, workingTimeCommand, workingTimeCapture, workingTimeBootstrap, prepareWorkingTime, decideWorkingTime } from '../assets/own-contract-working-time-model.js';
import { syntheticSeniorityBootstrap, syntheticSeniorityCommand, syntheticSeniorityDetail } from './fixtures/own-salary-seniority-synthetic.js';
const definition = () => ({ dailyHours: '7.50000001', monthlyHours: '160.250', asOfDate: '2026-10-01', documentReference: 'Jornada exclusivamente sintética QA' });
const boot = () => ({ ...syntheticSeniorityBootstrap(), version: 'own-contract-working-time.v1' });
test('daily and monthly hours retain exact text, null and zero independently without conversion', () => {
  for (const d of [definition(), { ...definition(), dailyHours: null, monthlyHours: '0' }, { ...definition(), dailyHours: '0.00', monthlyHours: null }]) assert.deepEqual(workingTimeDefinition(d, '2026-10'), d);
});
for (const v of [-1, 7, '', ' 7', '07', '7,5', '-0', '-1', '1e2', '7.123456789', '1000000000000000000']) test('refuses undeclared or inexact hours ' + JSON.stringify(v), () => {
  for (const key of ['dailyHours', 'monthlyHours']) assert.throws(() => workingTimeDefinition({ ...definition(), [key]: v }, '2026-10'));
});
test('no salary, clock, calendar or seniority fields enter the working-time definition', () => {
  for (const key of ['years', 'minutes', 'clockId', 'payableAmount', 'daysWorked']) assert.throws(() => workingTimeDefinition({ ...definition(), [key]: '1' }, '2026-10'));
  assert.throws(() => workingTimeDefinition({ ...definition(), asOfDate: '2026-11-01' }, '2026-10'));
  assert.throws(() => workingTimeDefinition({ ...definition(), asOfDate: '2026-02-30' }, '2026-10'));
});
test('commands require the whole exact contract, period and declaration; preparation never approves', () => {
  const b = boot(), c = prepareWorkingTime(b, definition(), 'Declaración exclusivamente sintética QA');
  assert.deepEqual(workingTimeCommand(c), c); assert.equal(c.reviewConfirmed, false); assert.equal(c.proposalId, null);
  assert.throws(() => prepareWorkingTime({ ...b, permissions: { canPropose: false, canReview: true } }, definition(), c.reason));
  assert.throws(() => workingTimeBootstrap({ ...b, payrollCalculated: true }));
});
test('complete capture preserves missing approval and detects later-page omissions or identity changes', () => {
  const b=boot(), e={contractId:b.contractId,identityToken:b.source.subject.identityToken};
  const v={complete:true,version:b.scopeVersion,records:[{contractId:e.contractId,identityToken:e.identityToken,configuration:b.configuration}]};
  assert.deepEqual(workingTimeCapture(v,[e],'2026-10'),v);
  assert.throws(()=>workingTimeCapture({...v,records:[]},[e],'2026-10'));
  assert.throws(()=>workingTimeCapture({...v,records:[{...v.records[0],identityToken:'f'.repeat(64)}]},[e],'2026-10'));
});
test('same-person review and stale approval stay blocked without rewriting the proposal', async () => {
  const b=boot(), d=await syntheticSeniorityDetail(); d.version='own-contract-working-time.v1';d.body.definition=definition();
  b.permissions.canReview=true;b.proposals=[d.proposal];const before=structuredClone(d);
  assert.throws(()=>decideWorkingTime(b,{...d,proposal:{...d.proposal,canReview:false}},'approve','Decisión sintética independiente'));
  assert.throws(()=>decideWorkingTime(b,{...d,current:false},'approve','Decisión sintética independiente'));
  assert.deepEqual(d,before);
});
