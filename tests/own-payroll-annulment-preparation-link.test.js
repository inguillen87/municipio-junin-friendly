import test from 'node:test';
import assert from 'node:assert/strict';
import {ownAnnulPreparationLink,ownProjectedAnnulmentQueue,requestedOwnAnnulPreparation} from '../assets/own-payroll-annulment-preparation-link.js';
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
