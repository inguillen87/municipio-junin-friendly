import test from 'node:test';
import assert from 'node:assert/strict';
import {ownAnnulPreparationLink,ownProjectedAnnulmentQueue,requestedOwnAnnulPreparation,ownLiquidationDecisionLink,ownProjectedDecisionQueue} from '../assets/own-payroll-annulment-preparation-link.js';
const id='00000001-0000-4000-8000-000000000000';
test('stable link contains only canonical municipal route and the source UUID',()=>{
 const link=ownAnnulPreparationLink(id);assert.equal(link,'/nomina?anulacion='+id+'#calculo');const u=new URL(link,'https://example.invalid');assert.deepEqual([...u.searchParams],[['anulacion',id]]);assert.equal(u.pathname,'/nomina');assert.equal(u.hash,'#calculo');
});
test('an unrelated municipal query does not request a projected handoff',()=>{assert.equal(requestedOwnAnnulPreparation(''),null);assert.equal(requestedOwnAnnulPreparation('?other=1'),null);});
test('source link queues no inherited actor, key, access context or consent',()=>{
 const q=requestedOwnAnnulPreparation('?anulacion='+id);assert.deepEqual(q,{kind:'projected_annulment',sourceId:id});assert.ok(Object.isFrozen(q));assert.equal(Object.hasOwn(q,'liquidationDate'),false);
});
test('duplicate raw or escaped source references and extra authority parameters are rejected',()=>{
 for(const search of ['?anulacion='+id+'&anulacion='+id,'?anulacion='+id+'&%61nulacion='+id,'?anulacion='+id+'&accessKey=foreign','?anulacion='+id+'&key='+id,'?anulacion='+id+'&actor=someone'])assert.throws(()=>requestedOwnAnnulPreparation(search));
});
test('a source reference must be one canonical UUID',()=>{for(const value of ['', 'bad', id.toUpperCase().replace('00000001','ABCDEF01'), 'https://outside.invalid']){assert.throws(()=>ownAnnulPreparationLink(value));assert.throws(()=>requestedOwnAnnulPreparation('?anulacion='+encodeURIComponent(value)));}});
test('the projected queue is a closed data contract without borrowed authority',()=>{
 for(const extra of [{accessKey:'foreign'},{key:id},{actorPersonId:id},{ctx:{}},{reason:'private'},{reviewConfirmed:true}])assert.throws(()=>ownProjectedAnnulmentQueue({kind:'projected_annulment',sourceId:id,...extra}));
 assert.throws(()=>ownProjectedAnnulmentQueue({kind:'consolidated',sourceId:id}));
});
test('date choice preserves null and snapshots caller data without inventing a new date',()=>{
 for(const liquidationDate of [null,'2026-10-15']){const source={kind:'projected_annulment',sourceId:id,liquidationDate},q=ownProjectedAnnulmentQueue(source);source.sourceId='changed';assert.equal(q.sourceId,id);assert.equal(q.liquidationDate,liquidationDate);assert.ok(Object.isFrozen(q));}
});
test('invalid date fields and executable queue properties are rejected',()=>{
 for(const liquidationDate of ['',undefined,'2026-02-30','2026-10-15T00:00:00Z'])assert.throws(()=>ownProjectedAnnulmentQueue({kind:'projected_annulment',sourceId:id,liquidationDate}));
 const getter={kind:'projected_annulment',sourceId:id};Object.defineProperty(getter,'liquidationDate',{enumerable:true,get(){throw Error('GETTER_MUST_NOT_RUN');}});assert.throws(()=>ownProjectedAnnulmentQueue(getter));
});

// Proposed causal tests: opaque run+decision reference for an INDIVIDUAL annul.
const runId='00000002-0000-4000-8000-000000000000',decisionId='00000003-0000-4000-8000-000000000000';
test('decision link carries only the canonical route, the run and the decision event',()=>{
 const link=ownLiquidationDecisionLink(runId,decisionId);assert.equal(link,'/nomina?corrida='+runId+'&decision='+decisionId+'#calculo');
 const u=new URL(link,'https://example.invalid');assert.deepEqual([...u.searchParams],[['corrida',runId],['decision',decisionId]]);assert.equal(u.pathname,'/nomina');assert.equal(u.hash,'#calculo');
 assert.throws(()=>ownLiquidationDecisionLink(runId,'x'));assert.throws(()=>ownLiquidationDecisionLink('x',decisionId));
});
test('decision link queues no actor, attempt key, access context or consent, in either parameter order',()=>{
 for(const search of ['?corrida='+runId+'&decision='+decisionId,'?decision='+decisionId+'&corrida='+runId]){const q=requestedOwnAnnulPreparation(search);assert.deepEqual(q,{kind:'projected_decision',runId,decisionId});assert.ok(Object.isFrozen(q));}
 assert.deepEqual(ownProjectedDecisionQueue({kind:'projected_decision',runId,decisionId}),{kind:'projected_decision',runId,decisionId});
 for(const extra of [{key:id},{accessKey:'k'},{liquidationDate:'2026-10-31'},{sourceId:id}])assert.throws(()=>ownProjectedDecisionQueue({kind:'projected_decision',runId,decisionId,...extra}));
 assert.throws(()=>ownProjectedDecisionQueue({kind:'projected_decision',runId,decisionId:runId}));assert.throws(()=>ownProjectedDecisionQueue({kind:'projected_annulment',runId,decisionId}));
});
test('a decision reference is rejected when incomplete, duplicated, mixed with a consolidated source or extended with authority',()=>{
 for(const search of ['?corrida='+runId,'?decision='+decisionId,'?corrida='+runId+'&decision='+decisionId+'&decision='+decisionId,'?corrida='+runId+'&corrida='+runId+'&decision='+decisionId,'?corrida='+runId+'&decision='+decisionId+'&anulacion='+id,'?anulacion='+id+'&decision='+decisionId,'?corrida='+runId+'&decision='+decisionId+'&key='+id,'?corrida='+runId+'&decision='+decisionId+'&accessKey=x','?corrida=x&decision='+decisionId,'?corrida='+runId+'&decision='+runId])assert.throws(()=>requestedOwnAnnulPreparation(search),search);
});
