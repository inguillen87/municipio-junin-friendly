import test from 'node:test';
import assert from 'node:assert/strict';
import {createClockWorkspace} from '../assets/clock-fleet-workspace-model.js';
import {createClockCombinedState,normalizeClockLocalEvidence,CLOCK_STATE_RECENT_MS} from '../assets/clock-combined-state-model.js';

// Synthetic aggregates only: no personnel, real series, tokens, network or files.
const now='2026-11-05T20:30:00.000Z',tenant='10000000-1111-4111-8111-111111111111';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const hash='a'.repeat(64),old='2026-10-06T10:00:00.000Z';
const at=minutes=>new Date(Date.parse(now)-minutes*60000).toISOString();
const device=(n=2,patch={})=>({siteKey:`pm-${String(n).padStart(2,'0')}`,label:`Punto sintético ${n}`,deviceId:id(n),model:'K20',deviceState:'active',connectorState:'active',enrolled:true,lastReceivedAt:at(1),lastCapturedAt:old,receipts:2,recordsConfirmed:103,newCanonical:100,observations:3,duplicates:0,canConsult:true,...patch});
function workspace(devices=[device()]){
 const reception={version:'clock-fleet.v1',checkedAt:now,devices,liveConnectionVerified:false,payrollModified:false};
 return createClockWorkspace(reception,null,'CLOCK_SOURCE_UNAVAILABLE',{version:'clock-reported-park.v1',pointCount:3,physicalConnectionVerified:false,points:[{siteKey:'pm-01',label:'Declarado sin inscripción',model:'K20'},{siteKey:'pm-02',label:'Punto sintético 2',model:'K20'},{siteKey:'pm-04',label:'Otro declarado',model:'K20'}]});
}
const binding=(n=2)=>({deviceId:id(n),siteKey:`pm-${String(n).padStart(2,'0')}`,clockId:`synthetic-${n}`,serial:`SYNTHETIC00${n}`,connectorId:id(n+100),connectorKey:`synthetic-clock-${n}`});
const capture=(n=2,patch={})=>({clockId:`synthetic-${n}`,status:'captured_locally',blocked:false,lastAttemptAt:at(2),lastCaptureAt:at(1.5),lastError:null,connectionFailureCount:0,uniqueLocalRecords:120,nextPollAt:at(-13),cloudReception:'not_configured',...patch});
const sender=(n=2,patch={})=>({version:'zk40-sender-status.v1',clockId:`synthetic-${n}`,state:'pending',updatedAt:at(0.5),failures:0,code:null,nextAttemptAt:null,sent:4,confirmedRecords:52,remainingParts:7,lastReceiptAt:at(0.6),lastReconciledAt:at(0.5),captureFilesRemoved:false,physicalClockVerified:false,...patch});
function local(n=2,patch={}){
 const b=binding(n);
 return {version:'clock-local-evidence.v1',tenantId:tenant,checkedAt:now,bindings:[b],capture:{sha256:hash,summary:{schema:'clock-fleet-summary.v1',updatedAt:at(1),clocks:[capture(n)],cloudReception:'not_configured'},identities:[{sha256:hash,identity:{schema:'clock-fleet-identity.v1',clockId:b.clockId,serial:b.serial}}]},deliveries:[{identitySha256:hash,identity:{schema:'clock-fleet-delivery-identity.v1',clockId:b.clockId,serial:b.serial,connectorKey:b.connectorKey},statusSha256:hash,status:sender(n)}],...patch};
}
const input=(patch={})=>({workspace:workspace(),tenantId:tenant,asOf:now,localEvidence:local(),identityMapping:null,...patch});
const row=x=>createClockCombinedState(x).rows.find(r=>r.siteKey==='pm-02');
const mapping=(patch={})=>({version:'clock-identity-mapping-summary.v1',tenantId:tenant,checkedAt:now,target:'own_employment',population:'canonical_marks',from:'2026-11-01',to:'2026-11-05',rows:[{deviceId:id(2),siteKey:'pm-02',total:7,linked:5,unmapped:1,ambiguous:1}],...patch});

test('legacy cloudReception belongs to capture; canonical delivery and server receipts remain visible',()=>{
 const result=createClockCombinedState(input()),r=result.rows.find(r=>r.siteKey==='pm-02');
 assert.equal(r.capture.state,'recent');assert.equal(r.delivery.state,'pending');assert.equal(r.delivery.remainingParts,7);assert.equal(r.reception.state,'recent');
 assert.equal(result.liveConnectionVerified,false);assert.equal(result.coverageVerified,false);assert.equal(result.payrollModified,false);
 assert.doesNotMatch(JSON.stringify(result),/cloudReception|not_configured|token|serial|connectorKey|networkHost/);
});
test('blocked physical capture can coexist with healthy historical delivery and recent durable receipts',()=>{
 const x=input();Object.assign(x.localEvidence.capture.summary.clocks[0],{status:'blocked',blocked:true,lastAttemptAt:old,lastCaptureAt:old,lastError:'RESPONSE_TIMEOUT',connectionFailureCount:1000,nextPollAt:null});
 const r=row(x);assert.equal(r.capture.state,'blocked');assert.equal(r.delivery.state,'pending');assert.equal(r.reception.state,'recent');assert.deepEqual(r.signals.map(s=>s.key),['capture','backlog','receipt']);assert.equal(r.capture.lastCaptureAt,old);
});
test('new physical capture is independent of old capturedAt in the receipt backlog',()=>{
 const r=row(input());assert.equal(r.capture.lastCaptureAt,at(1.5));assert.equal(r.reception.lastDeclaredCaptureAt,old);assert.ok(r.capture.captureAgeMs<300000);
});
test('reading an old capture summary now does not refresh its freshness',()=>{
 const x=input();x.localEvidence.capture.summary.updatedAt=at(40);Object.assign(x.localEvidence.capture.summary.clocks[0],{lastAttemptAt:at(42),lastCaptureAt:at(41),nextPollAt:at(26)});
 const r=row(x);assert.equal(r.capture.state,'stale');assert.equal(r.capture.reportedState,'captured_locally');assert.equal(r.reception.state,'recent');assert.equal(r.capture.freshness.ageMs,40*60000);
});
test('recent error does not refresh backlog from a previous reconciliation',()=>{
 const x=input();Object.assign(x.localEvidence.deliveries[0].status,{state:'blocked',updatedAt:at(1),failures:1,code:'ZK40_DELIVERY_AUTH_BLOCKED',sent:0,lastReconciledAt:at(45),lastReceiptAt:at(46)});
 const r=row(x);assert.equal(r.delivery.state,'blocked');assert.equal(r.delivery.queueFreshness.state,'stale');assert.equal(r.delivery.remainingParts,null);assert.equal(r.delivery.confirmedRecords,null);assert.equal(r.delivery.lastKnownRemainingParts,7);assert.equal(r.delivery.lastKnownConfirmedRecords,52);
});
test('zero local queue without a receipt proves no canonical reception',()=>{
 const d=device(2,{receipts:0,recordsConfirmed:0,newCanonical:0,observations:0,duplicates:0,lastReceivedAt:null,lastCapturedAt:null,canConsult:false});
 const x=input({workspace:workspace([d])});Object.assign(x.localEvidence.deliveries[0].status,{state:'queue_confirmed',sent:0,confirmedRecords:0,remainingParts:0,lastReceiptAt:null});
 const r=row(x);assert.equal(r.delivery.remainingParts,0);assert.equal(r.delivery.state,'queue_confirmed');assert.equal(r.reception.state,'waiting');assert.equal(r.canConsult,false);
});
test('missing local evidence is unknown; reported-only points never receive zero invented counts',()=>{
 const result=createClockCombinedState(input({workspace:workspace([device(),device(10)]),localEvidence:null}));
 const registered=result.rows.find(r=>r.siteKey==='pm-02'),pm10=result.rows.find(r=>r.siteKey==='pm-10'),unregistered=result.rows.find(r=>r.siteKey==='pm-01');
 assert.equal(registered.capture.state,'unknown');assert.equal(registered.delivery.remainingParts,null);assert.equal(pm10.delivery.state,'unknown');assert.equal(pm10.reception.state,'recent');
 assert.equal(unregistered.administration,'registration_required');assert.equal(unregistered.reception.recordsConfirmed,null);assert.equal(unregistered.mapping.unmapped,null);assert.equal(unregistered.canConsult,false);
});
test('observed receipt rows do not become unmapped or ambiguous identities',()=>{
 const r=row(input());assert.equal(r.reception.observations,3);assert.equal(r.mapping.state,'unknown');assert.equal(r.mapping.total,null);assert.equal(r.mapping.unmapped,null);assert.equal(r.mapping.ambiguous,null);
});
test('explicit mapping has its own period/population; it is not subtracted from reception totals',()=>{
 const r=row(input({identityMapping:mapping()}));assert.equal(r.mapping.state,'review');assert.equal(r.mapping.total,7);assert.equal(r.reception.newCanonical,100);assert.equal(r.mapping.unmapped,1);assert.equal(r.mapping.from,'2026-11-01');
 assert.equal(Object.hasOwn(r.delivery,'remainingRecords'),false);
});
test('empty mapping scope does not imply that every identity is linked',()=>{
 const m=mapping();Object.assign(m.rows[0],{total:0,linked:0,unmapped:0,ambiguous:0});assert.equal(row(input({identityMapping:m})).mapping.state,'empty');
});
test('administrative restriction remains visible alongside genuine historical receipts',()=>{
 const r=row(input({workspace:workspace([device(2,{connectorState:'suspended'})])}));assert.equal(r.administration,'restricted');assert.equal(r.reception.recordsConfirmed,103);assert.equal(r.signals[0].key,'restriction');
});
test('freshness boundary is inclusive at 30 minutes and stale one millisecond later',()=>{
 const x=input({localEvidence:null});x.workspace.reception.checkedAt=at(30);x.workspace.checkedAt=at(30);x.workspace.reception.devices[0].lastReceivedAt=at(30);
 assert.equal(row(x).reception.state,'recent');x.asOf=new Date(Date.parse(now)+1).toISOString();assert.equal(row(x).reception.state,'stale');assert.equal(CLOCK_STATE_RECENT_MS,1800000);
});
test('recent receipt cannot refresh an older server consultation',()=>{
 const x=input();x.workspace.reception.checkedAt=at(31);x.workspace.checkedAt=at(31);x.workspace.reception.devices[0].lastReceivedAt=at(29);
 const r=row(x);assert.equal(r.reception.state,'stale');assert.equal(r.reception.freshness.sourceAt,at(31));
});
test('review_required capture keeps unknown dates instead of borrowing the last receiver date',()=>{
 const x=input();x.localEvidence.capture.summary.clocks[0]={clockId:'synthetic-2',status:'review_required',lastError:'FLEET_STATE_INVALID',cloudReception:'not_configured'};
 const r=row(x);assert.equal(r.capture.state,'review_required');assert.equal(r.capture.lastCaptureAt,null);assert.equal(r.capture.code,'FLEET_STATE_INVALID');assert.equal(r.reception.state,'recent');
});
test('capture-only binding does not invent a configured sender',()=>{
 const x=input();x.localEvidence.bindings[0].connectorId=null;x.localEvidence.bindings[0].connectorKey=null;x.localEvidence.deliveries=[];
 const r=row(x);assert.equal(r.capture.state,'recent');assert.equal(r.delivery.state,'unknown');
});
test('a disabled capture preserves its prior durable block',()=>{
 const x=input();Object.assign(x.localEvidence.capture.summary.clocks[0],{status:'disabled',blocked:true,lastAttemptAt:old,lastCaptureAt:old,lastError:'RESPONSE_TIMEOUT',nextPollAt:null});
 const r=row(x);assert.equal(r.capture.state,'disabled');assert.equal(r.capture.blocked,true);assert.equal(r.reception.state,'recent');assert.equal(r.signals[0].key,'capture');
});
for(const [name,mutate] of [
 ['different tenant',x=>x.localEvidence.tenantId=id(90)],
 ['unknown registered device',x=>x.localEvidence.bindings[0].deviceId=id(90)],
 ['different registered site',x=>x.localEvidence.bindings[0].siteKey='pm-04'],
 ['capture serial conflict',x=>x.localEvidence.capture.identities[0].identity.serial='OTHER000001'],
 ['delivery serial conflict',x=>x.localEvidence.deliveries[0].identity.serial='OTHER000001'],
 ['delivery connector conflict',x=>x.localEvidence.deliveries[0].identity.connectorKey='other-connector'],
 ['sender clock conflict',x=>x.localEvidence.deliveries[0].status.clockId='synthetic-other'],
 ['duplicate binding',x=>x.localEvidence.bindings.push({...x.localEvidence.bindings[0],deviceId:x.localEvidence.bindings[0].deviceId.toUpperCase()})],
 ['duplicate sender',x=>x.localEvidence.deliveries.push(structuredClone(x.localEvidence.deliveries[0]))],
 ['unexpected token field',x=>x.localEvidence.deliveries[0].status.token='never-allowed'],
 ['unsupported capture contract',x=>x.localEvidence.capture.summary.schema='clock-fleet-summary.v2'],
 ['future local observation',x=>x.localEvidence.checkedAt=at(-6)],
 ['future capture update',x=>x.localEvidence.capture.summary.updatedAt=at(-6)],
 ['negative pending parts',x=>x.localEvidence.deliveries[0].status.remainingParts=-1],
 ['contradictory empty sender',x=>x.localEvidence.deliveries[0].status.state='queue_confirmed'],
 ['unreconciled counts',x=>x.localEvidence.deliveries[0].status.lastReconciledAt=null],
 ['unsafe integer',x=>x.localEvidence.deliveries[0].status.confirmedRecords=Number.MAX_SAFE_INTEGER+1],
 ['invalid calendar date',x=>x.localEvidence.checkedAt='2026-02-30T20:30:00.000Z'],
]) test('rejects '+name,()=>{const x=input();mutate(x);assert.throws(()=>createClockCombinedState(x),/CLOCK_COMBINED_/);});

for(const [name,mutate] of [
 ['mapping arithmetic',m=>m.rows[0].linked=6],
 ['mapping tenant',m=>m.tenantId=id(99)],
 ['mapping target',m=>m.target='legacy_person'],
 ['mapping population',m=>m.population='receipt_rows'],
 ['mapping scope inversion',m=>m.from='2026-11-06'],
 ['mapping site',m=>m.rows[0].siteKey='pm-04'],
 ['mapping duplicate',m=>m.rows.push({...m.rows[0]})],
 ['mapping nominal field',m=>m.rows[0].personName='Synthetic forbidden value'],
]) test('rejects '+name,()=>{const m=mapping();mutate(m);assert.throws(()=>createClockCombinedState(input({identityMapping:m})),/CLOCK_COMBINED_/);});

test('existing PG workspace contracts remain authoritative',()=>{
 const x=input();x.workspace.reception.devices[0].recordsConfirmed=104;assert.throws(()=>createClockCombinedState(x),/CLOCK_FLEET_CONTRACT_INVALID/);
});
test('pure derivation preserves frozen inputs and deterministic output',()=>{
 const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
 const x=freeze(input({identityMapping:mapping()})),before=JSON.stringify(x),a=createClockCombinedState(x),b=createClockCombinedState(x);
 assert.deepEqual(a,b);assert.equal(JSON.stringify(x),before);assert.notEqual(a,b);
});
test('normalizer keeps supplied evidence hashes without claiming to verify source bytes',()=>{
 const x=input(),rows=normalizeClockLocalEvidence(x.localEvidence,{tenantId:tenant,asOf:now,devices:x.workspace.reception.devices});assert.equal(rows.length,1);assert.equal(rows[0].capture.sha256,hash);assert.equal(rows[0].delivery.sha256,hash);assert.equal(Object.hasOwn(rows[0],'authenticated'),false);
});
