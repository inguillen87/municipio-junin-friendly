import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementWorkingTimeDefinition, agreementWorkingTimeItems, agreementWorkingTimeSource, agreementWorkingTimeBootstrap, agreementWorkingTimeCommand, agreementWorkingTimeCapture, agreementWorkingTimeDetail, agreementWorkingTimeReceipt, prepareAgreementWorkingTime, decideAgreementWorkingTime } from '../assets/own-agreement-working-time-model.js';
import { agreementTimeId, agreementTimeKey, agreementTimeHash, agreementTimeDefinition, syntheticAgreementTimeBootstrap, syntheticAgreementTimeItems, syntheticAgreementTimeDetail } from './fixtures/own-agreement-working-time-synthetic.js';

test('agreement hours preserve exact eight decimals, zero and unknown without deriving contract or clock hours', () => {
 for (const monthlyHours of ['160.25000001', '0', '0.00000000', null]) {
  const d = {...agreementTimeDefinition(), monthlyHours}; assert.deepEqual(agreementWorkingTimeDefinition(d, '2026-10'), d);
 }
 for (const key of ['dailyHours', 'contractId', 'clockId', 'daysWorked', 'payableAmount']) assert.throws(() => agreementWorkingTimeDefinition({...agreementTimeDefinition(), [key]:'1'}, '2026-10'));
});

test('hours reject numeric coercion, negative quantities, locale decimals and implicit precision', () => {
 for (const monthlyHours of [160, -1, true, '', ' 160', '0160', '160,25', '1e2', '-0', '-1', '1.123456789', '1000000000000000000']) assert.throws(() => agreementWorkingTimeDefinition({...agreementTimeDefinition(), monthlyHours}, '2026-10'));
 for (const asOfDate of ['2026-02-30', '2026-11-01', '2026-10', null]) assert.throws(() => agreementWorkingTimeDefinition({...agreementTimeDefinition(), asOfDate}, '2026-10'));
 assert.throws(() => agreementWorkingTimeDefinition({...agreementTimeDefinition(), documentReference:' '}, '2026-10'));
});

test('complete declarations retain leading zeros and agreements unavailable for new registration', () => {
 const b = syntheticAgreementTimeBootstrap(61), items = syntheticAgreementTimeItems(b), command = prepareAgreementWorkingTime(b, items, 'Registro sintético de todos los convenios');
 assert.equal(command.items.length, 61); assert.equal(command.items[0].agreementCode, '0001'); assert.equal(b.source.agreements[1].registrationAllowed, false);
 assert.equal(command.items[1].agreementCode, '0002'); assert.equal(command.reviewConfirmed, false); assert.equal(command.proposalId, null);
 assert.notEqual(command.items, items); items[0].definition.monthlyHours = '1'; assert.equal(command.items[0].definition.monthlyHours, '160.25000001');
});

test('a missing last page, changed agreement identity, duplicate or reorder rejects the whole preparation', () => {
 const b = syntheticAgreementTimeBootstrap(61), rows = syntheticAgreementTimeItems(b), reason = 'Conjunto exclusivamente sintético QA';
 for (const items of [rows.slice(0, 25), rows.slice(0, -1), [...rows, rows[0]], [...rows].reverse(), rows.map((r, i) => i === 60 ? {...r, agreementToken:agreementTimeHash('f')} : r), rows.map((r, i) => i === 0 ? {...r, agreementCode:'1'} : r)]) assert.throws(() => prepareAgreementWorkingTime(b, items, reason));
 assert.throws(() => agreementWorkingTimeSource({...b.source, agreements:[b.source.agreements[0], b.source.agreements[0]]}));
 assert.throws(() => agreementWorkingTimeSource({...b.source, agreements:b.source.agreements.map((r, i) => i === 60 ? {...r, employeeName:'Dato ajeno'} : r)}));
});

test('a whole empty source is an empty consultation, never an invented proposal or a zero approval', () => {
 const b = syntheticAgreementTimeBootstrap(0); assert.equal(agreementWorkingTimeBootstrap(b), b);
 assert.throws(() => prepareAgreementWorkingTime(b, [], 'No hay convenios propios en esta consulta'));
 assert.throws(() => agreementWorkingTimeBootstrap({...b, configuration:{...b.configuration, revision:1, proposalId:agreementTimeId, approvalId:agreementTimeKey}}));
 assert.throws(() => agreementWorkingTimeBootstrap({...b, payrollCalculated:true}));
});

test('object accessors, sparse arrays and unsupported fields cannot change verified declarations', () => {
 const b = syntheticAgreementTimeBootstrap(), items = syntheticAgreementTimeItems(b), sparse = new Array(items.length); sparse[0] = items[0];
 assert.throws(() => agreementWorkingTimeItems(sparse, b.period));
 let invoked = false; const d = agreementTimeDefinition(); Object.defineProperty(d, 'monthlyHours', {enumerable:true, get(){invoked = true; return '160';}});
 assert.throws(() => agreementWorkingTimeDefinition(d, b.period)); assert.equal(invoked, false);
 const hidden = agreementTimeDefinition(); hidden[Symbol('extra')] = '1'; assert.throws(() => agreementWorkingTimeDefinition(hidden, b.period));
});

test('preparation and decisions keep independent permissions and the complete immutable body', async () => {
 const b = syntheticAgreementTimeBootstrap(), d = await syntheticAgreementTimeDetail(b); b.proposals = [d.proposal]; const original = structuredClone(d);
 assert.throws(() => prepareAgreementWorkingTime({...b, permissions:{canPropose:false, canReview:true}}, d.body.items, d.body.reason));
 await assert.rejects(() => decideAgreementWorkingTime(b, {...d, proposal:{...d.proposal, canReview:false}}, 'approve', 'Decisión sintética independiente'));
 await assert.rejects(() => decideAgreementWorkingTime({...b, permissions:{canPropose:true, canReview:false}}, d, 'approve', 'Decisión sintética independiente'));
 const review = await decideAgreementWorkingTime(b, d, 'approve', 'Decisión sintética independiente');
 assert.equal(review.items, null); assert.equal(review.proposalId, agreementTimeId); assert.equal(review.reviewConfirmed, true); assert.equal(agreementWorkingTimeCommand(review), review);
 assert.deepEqual(d, original);
});

test('stale period, reader scope or catalog stops approval, while stale rejection preserves the proposal', async () => {
 const b = syntheticAgreementTimeBootstrap(), d = await syntheticAgreementTimeDetail(b); b.proposals = [d.proposal];
 await assert.rejects(() => decideAgreementWorkingTime(b, {...d, period:'2026-09'}, 'approve', 'Decisión sintética independiente'));
 await assert.rejects(() => decideAgreementWorkingTime(b, {...d, scopeVersion:agreementTimeHash('f')}, 'approve', 'Decisión sintética independiente'));
 await assert.rejects(() => decideAgreementWorkingTime(b, {...d, current:false}, 'approve', 'Decisión sintética independiente'));
 await assert.rejects(() => decideAgreementWorkingTime({...b, source:{...b.source, version:agreementTimeHash('f')}}, d, 'approve', 'Decisión sintética independiente'));
 assert.equal((await decideAgreementWorkingTime(b, {...d, current:false}, 'reject', 'Rechazo independiente exclusivamente sintético')).command, 'reject');
});

test('conserved proposal details verify all body bytes and the complete source', async () => {
 const d = await syntheticAgreementTimeDetail(); assert.equal(await agreementWorkingTimeDetail(d), d);
 await assert.rejects(() => agreementWorkingTimeDetail({...d, body:{...d.body, items:d.body.items.slice(0, 1)}}));
 await assert.rejects(() => agreementWorkingTimeDetail({...d, body:{...d.body, reason:'Otro fundamento exclusivamente sintético'}}));
 await assert.rejects(() => agreementWorkingTimeDetail({...d, source:{...d.source, version:agreementTimeHash('f')}}));
});

test('receipt replay keeps the exact body and key; preparation is never salary calculation or approval', async () => {
 const d = await syntheticAgreementTimeDetail(), receipt = {version:d.version, eventId:agreementTimeId, proposalId:agreementTimeId, requestKey:agreementTimeKey, requestSha256:d.proposal.requestSha256, body:d.body, status:'pending', revision:0, configurationVersion:d.body.baseVersion, replayed:true, payrollCalculated:false, payrollPosted:false};
 assert.equal(await agreementWorkingTimeReceipt(receipt, {key:agreementTimeKey, body:d.body}), receipt);
 await assert.rejects(() => agreementWorkingTimeReceipt(receipt, {key:agreementTimeId, body:d.body}));
 await assert.rejects(() => agreementWorkingTimeReceipt(receipt, {key:agreementTimeKey, body:{...d.body, reason:'Cuerpo sintético diferente para otro intento'}}));
 await assert.rejects(() => agreementWorkingTimeReceipt({...receipt, status:'approved'}));
 await assert.rejects(() => agreementWorkingTimeReceipt({...receipt, payrollCalculated:true}));
});

const employees = () => Array.from({length:855}, (_, i) => ({contractId:(i + 1).toString(16).padStart(8,'0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa', agreementCode:i % 2 ? '0002' : '0001'}));
const capture = () => ({complete:true, version:agreementTimeHash('a'), records:['0001','0002'].map(agreementCode => ({agreementCode, agreementToken:agreementTimeHash('b'), revision:1, definition:agreementTimeDefinition(), approvalId:agreementTimeId, approvedAgreementToken:agreementTimeHash('b')}))});
test('855 synthetic contracts capture one approved source per agreement, distinct from each contract monthly hours', () => {
 const v = capture(), e = employees(); for (const r of e) r.monthlyHours = '80.125';
 assert.equal(agreementWorkingTimeCapture(v, e, '2026-10'), v); assert.equal(v.records.length, 2); assert.equal(v.records[0].definition.monthlyHours, '160.25000001');
});

test('the complete selection rejects missing agreements, foreign or duplicate records and repeated employees', () => {
 const v = capture(), e = employees();
 for (const records of [v.records.slice(0, 1), [v.records[0], v.records[0]], v.records.map((r, i) => i ? {...r, agreementCode:'0003'} : r)]) assert.throws(() => agreementWorkingTimeCapture({...v, records}, e, '2026-10'));
 assert.throws(() => agreementWorkingTimeCapture(v, [...e, e[0]], '2026-10'));
 assert.throws(() => agreementWorkingTimeCapture(v, e.map((r, i) => i === 854 ? {...r, agreementCode:null} : r), '2026-10'));
 assert.throws(() => agreementWorkingTimeCapture({...v, complete:false}, e, '2026-10'));
});

test('unapproved or unknown hours remain absent and a changed approved agreement refuses capture', () => {
 const v = capture(), e = employees(), absent = {...v.records[0], revision:0, definition:null, approvalId:null, approvedAgreementToken:null};
 assert.equal(agreementWorkingTimeCapture({...v, records:[absent,v.records[1]]}, e, '2026-10').records[0].definition, null);
 assert.equal(agreementWorkingTimeCapture({...v, records:v.records.map(r => ({...r, definition:{...r.definition, monthlyHours:null}}))}, e, '2026-10').records[0].definition.monthlyHours, null);
 assert.throws(() => agreementWorkingTimeCapture({...v, records:[{...absent, definition:agreementTimeDefinition()},v.records[1]]}, e, '2026-10'));
 assert.throws(() => agreementWorkingTimeCapture({...v, records:[{...v.records[0], approvedAgreementToken:agreementTimeHash('f')},v.records[1]]}, e, '2026-10'));
});
