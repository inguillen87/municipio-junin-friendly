import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAreaEffectivityCommand, validateAreaEffectivityResponse, areaEffectivityCommandCapabilities, areaEffectivityKey,
  AREA_EFFECTIVITY_CAPABILITIES,
} from '../assets/attendance-area-effectivity-model.js';
import {id, state, partial, pending, decided, record, propose, review, receipt, areas} from './fixtures/attendance-area-effectivity-synthetic.js';

test('preparar exige fecha real no futura, referencia documental y la huella de la vista previa', () => {
  assert.deepEqual(validateAreaEffectivityCommand(propose(), {today: '2026-11-19'}), propose());
  for (const patch of [{effectiveFrom: '2026-02-30'}, {effectiveFrom: '01/11/2026'}, {effectiveFrom: '2026-11-20'}, {authorizationReference: 'corta'},
    {authorizationReference: ' con espacio al inicio'}, {authorizationReference: 'Referencia con <script>'}, {authorizationReference: 'Referencia​ invisible'},
    {authorizationReference: 'x'.repeat(501)}, {previewVersion: 'b'.repeat(63)}, {previewVersion: null}, {scope: 'some'}, {scope: undefined}, {tenantId: id(1)}, {contracts: []}])
    assert.throws(() => validateAreaEffectivityCommand(propose(patch), {today: '2026-11-19'}), e => e.status === 422, JSON.stringify(patch));
  assert.throws(() => validateAreaEffectivityCommand({...propose(), effectiveFrom: '2026-11-20'}, {today: '2026-11-19'}), e => e.code === 'ATTENDANCE_AREA_EFFECTIVITY_DATE_INVALID');
});
test('decidir exige la declaración exacta, su versión y un motivo escrito', () => {
  assert.deepEqual(validateAreaEffectivityCommand(review()), review());
  assert.deepEqual(validateAreaEffectivityCommand(review({decision: 'reject'})).decision, 'reject');
  for (const patch of [{decision: 'retire'}, {proposalId: 'x'}, {proposalVersion: 'c'.repeat(10)}, {reason: 'breve'}, {reason: 'x'.repeat(1001)}, {reason: 'Motivo con\nsalto'}, {extra: true}])
    assert.throws(() => validateAreaEffectivityCommand(review(patch)), e => e.status === 422, JSON.stringify(patch));
  for (const body of [null, [], 'propose', {action: 'delete'}, {}]) assert.throws(() => validateAreaEffectivityCommand(body));
});
test('la capacidad mínima sale de la operación; rechazar admite a quien preparó', () => {
  assert.deepEqual(areaEffectivityCommandCapabilities(propose()), ['employee.record.propose']);
  assert.deepEqual(areaEffectivityCommandCapabilities(review()), ['employee.record.approve']);
  assert.deepEqual(areaEffectivityCommandCapabilities(review({decision: 'reject'})), AREA_EFFECTIVITY_CAPABILITIES);
  assert.equal(areaEffectivityKey(id(10)), true); assert.equal(areaEffectivityKey('e0000000-0000-1000-8000-000000000010'), false);
});
test('el estado sólo se acepta completo, coherente y sin contratos ni personas declaradas', () => {
  assert.equal(validateAreaEffectivityResponse(state()).preview.scopes.all.eligible, 5);
  assert.equal(validateAreaEffectivityResponse(partial()).preview.scopes.missing.eligible, 2);
  assert.equal(validateAreaEffectivityResponse(state({pending: pending(), history: [decided('rejected', {id: id(8)})]})).pending.itemCount, 5);
  const broken = [
    s => { s.preview.scopes.all.items = [{contractId: id(7)}]; }, s => { s.preview.scopes.all.areas[0].contracts = 4; },
    s => { s.preview.scopes.all.areas.push({...areas()[0]}); s.preview.scopes.all.eligible = 8; }, s => { s.preview.scopes.missing.eligible = 4; },
    s => { s.declaredContracts = 1; }, s => { delete s.preview.scopes.missing; }, s => { s.preview.scopes.other = s.preview.scopes.all; }, s => { s.preview.eligible = 5; },
    s => { s.preview.scopes.missing.areas[0].contractIds = [id(7)]; }, s => { s.preview.excluded.other = 1; }, s => { delete s.preview.excluded.withdrawn; },
    s => { s.pending = pending({scope: 'area'}); },
    s => { s.pending = record(); }, s => { s.pending = pending({stale: 'no'}); }, s => { s.pending = pending({status: 'approved'}); },
    s => { s.pending = pending({reviewedBy: 'alguien@example.invalid'}); }, s => { s.pending = pending({legajo: '1001'}); },
    s => { s.history = [record()]; }, s => { s.history = [decided('approved', {contractsInForce: 6})]; }, s => { s.history = [decided('rejected', {contractsInForce: 1})]; },
    s => { s.history = [decided(), decided()]; }, s => { s.history = [decided('approved', {reviewReason: null})]; }, s => { s.today = 'hoy'; },
    s => { s.permissions.canPropose = 'true'; }, s => { s.principal.sessionVersion = 0; }, s => { s.version = 'otra'; }, s => { s.declaredContracts = -1; },
    s => { s.preview.scopes.all.areas[1].sectorSourceId = ''; }, s => { s.preview.scopes.missing.areas[0].areaLabel = 'Área <b>'; },
  ];
  for (const [index, mutate] of broken.entries()) {
    const value = state(); mutate(value);
    assert.throws(() => validateAreaEffectivityResponse(value), e => e.status === 503, 'caso ' + index);
  }
});
test('el comprobante tiene que corresponder al pedido que se envió', () => {
  assert.equal(validateAreaEffectivityResponse(receipt(), {resource: 'receipt', command: propose()}).declaration.status, 'proposed');
  assert.equal(validateAreaEffectivityResponse(receipt(review()), {resource: 'receipt', command: review()}).declaration.status, 'approved');
  assert.equal(validateAreaEffectivityResponse(receipt(review({decision: 'reject'})), {resource: 'receipt', command: review({decision: 'reject'})}).declaration.status, 'rejected');
  assert.throws(() => validateAreaEffectivityResponse(receipt(), {resource: 'receipt', command: propose({effectiveFrom: '2026-10-01'})}), e => e.status === 503);
  assert.throws(() => validateAreaEffectivityResponse(receipt(), {resource: 'receipt', command: propose({scope: 'all'})}), e => e.status === 503);
  assert.throws(() => validateAreaEffectivityResponse(receipt(review()), {resource: 'receipt', command: review({decision: 'reject'})}), e => e.status === 503);
  assert.throws(() => validateAreaEffectivityResponse(receipt(review()), {resource: 'receipt', command: review({proposalId: id(11)})}), e => e.status === 503);
  assert.throws(() => validateAreaEffectivityResponse(receipt(propose(), {declaration: {...receipt().declaration, areas: areas()}}), {resource: 'receipt'}), e => e.status === 503);
  assert.throws(() => validateAreaEffectivityResponse(receipt(propose(), {replayed: 'no'}), {resource: 'receipt'}), e => e.status === 503);
});
