import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ADOPTED_LIFECYCLE_VERSION as V2,lifecycleIntervals,lifecycleAfter,validateLifecycleBootstrap,validateLifecycleProposal,validateLifecycleReceipt} from '../assets/native-employment-lifecycle-model.js';
import {reviewedLifecycleAttempt,assertLifecycleAttemptFresh,assertLifecycleAttemptReceipt} from '../assets/native-employment-lifecycle-review.js';
import {employmentLifecycleOperation} from '../lib/internal-employment-lifecycle.js';
import {lifecycleFixture,CONTRACT,ID} from './fixtures/native-employment-lifecycle-synthetic.js';
import {principal,session} from './fixtures/native-employee-synthetic.js';
import {employee} from '../api/internal-data.js';
import {historySql,proof as historyProof,CONTRACT as ADOPTED,TENANT,row} from './fixtures/employment-adoption-history-synthetic.js';
const key='11111111-1111-4111-8111-111111111111';
function fixture(operation='propose'){
 const f=lifecycleFixture(operation);for(const b of [f.bootstrap,f.current]){b.version=V2;b.subject.recordKind='adopted';b.subject.legajo='A/3501';b.employment.datesVerified=true;b.employment.intervals[0].startDate='1888-01-01';}
 for(const p of [f.proposal,f.saved]){p.subject.recordKind='adopted';p.subject.legajo='A/3501';p.before.intervals[0].startDate='1888-01-01';p.after.intervals[0].startDate='1888-01-01';}
 f.receipt.version=V2;return f;
}
test('v2 verifies opaque adopted legajo and old civil interval without weakening v1',()=>{
 const f=fixture();assert.equal(validateLifecycleBootstrap(f.bootstrap,CONTRACT),f.bootstrap);assert.equal(validateLifecycleProposal({version:V2,proposal:f.proposal},CONTRACT,ID).version,V2);
 assert.throws(()=>lifecycleIntervals(f.bootstrap.employment.intervals));assert.throws(()=>lifecycleAfter(f.bootstrap.employment.intervals,'terminate','1899-01-01',V2));
 assert.deepEqual(lifecycleAfter(f.bootstrap.employment.intervals,'terminate','2026-10-01',V2),f.proposal.after.intervals);
});
for(const dates of [[{startDate:'1888-02-30',endDate:null}],[{startDate:'0000-01-01',endDate:null}],[{startDate:'1888-01-01',endDate:'1887-01-01'}],[{startDate:'1888-01-01',endDate:null},{startDate:'2026-01-01',endDate:null}]])test('v2 refuses invalid or overlapping historical civil dates '+JSON.stringify(dates),()=>assert.throws(()=>lifecycleIntervals(dates,V2)));
test('missing dates are a verified unresolved response, never an invented period',()=>{
 const f=fixture();Object.assign(f.bootstrap.employment,{datesVerified:false,intervals:[],status:'unknown'});f.bootstrap.permissions.canPropose=false;
 assert.equal(validateLifecycleBootstrap(f.bootstrap,CONTRACT).employment.intervals.length,0);assert.throws(()=>reviewedLifecycleAttempt(f.body,f.bootstrap,null,key));
 f.bootstrap.permissions.canPropose=true;assert.throws(()=>validateLifecycleBootstrap(f.bootstrap,CONTRACT));
});
for(const change of [v=>delete v.employment.datesVerified,v=>v.subject.recordKind='hire',v=>v.subject.legajo='bad\nlegajo',v=>v.subject.dni='private',v=>v.version='native-employment-lifecycle.v3',v=>v.employment.datesVerified=false])test('closed adopted transport rejects contradictory fields '+change,()=>{const f=fixture();change(f.bootstrap);assert.throws(()=>validateLifecycleBootstrap(f.bootstrap,CONTRACT));});
test('adopted attempt preserves exact body/key while old civil history is reviewed',()=>{
 const f=fixture(),attempt=reviewedLifecycleAttempt(f.body,f.bootstrap,null,key),bytes=attempt.bytes;
 assert.equal(assertLifecycleAttemptFresh(attempt,f.bootstrap,null),attempt);assert.equal(assertLifecycleAttemptReceipt(f.receipt,attempt,{version:V2,proposal:f.saved},f.current),f.receipt);
 assert.equal(attempt.bytes,bytes);assert.equal(attempt.key,key);assert.deepEqual(Object.keys(attempt.body.payload).sort(),Object.keys(f.body.payload).sort());
 const mixed={...f.receipt,version:'native-employment-lifecycle.v1'};assert.throws(()=>assertLifecycleAttemptReceipt(mixed,attempt,{version:V2,proposal:f.saved},f.current));
});
test('independent adopted approval binds version, before/after and current intervals',()=>{
 const f=fixture('review'),attempt=reviewedLifecycleAttempt(f.body,f.bootstrap,f.proposal,key);
 assert.equal(assertLifecycleAttemptReceipt(f.receipt,attempt,{version:V2,proposal:f.saved},f.current),f.receipt);
 const changed=structuredClone(f.bootstrap);changed.employment.version='b'.repeat(64);assert.throws(()=>assertLifecycleAttemptFresh(attempt,changed,f.proposal));
});
test('server chooses the v2 RPC without changing the pending payload or key',async()=>{
 const f=fixture(),calls=[];const sql={query:async(q,p)=>{calls.push({q,p});return[{result:f.receipt}];}};
 await employmentLifecycleOperation(sql,principal,session,'propose',{current:true,key,body:f.body.payload});assert.match(calls[0].q,/propose_v2\(/);assert.equal(calls[0].p[1],JSON.stringify(f.body.payload));assert.equal(calls[0].p[2],key);
 const old=lifecycleFixture();await employmentLifecycleOperation({query:async(q,p)=>{assert.match(q,/propose_v1\(/);assert.equal(p[2],key);return[{result:old.receipt}];}},principal,session,'propose',{key,body:old.body.payload});
});
test('date-required errors are actionable and contain no database details',async()=>{
 await assert.rejects(employmentLifecycleOperation({query:async()=>{throw Error('NATIVE_EMPLOYMENT_LIFECYCLE_DATES_REQUIRED private');}},principal,session,'bootstrap',{contractId:CONTRACT,current:true}),e=>e.status===422&&e.message.includes('fechas laborales')&&!e.message.includes('private'));
});
function current(proof){return {version:'native-employee-read.v1',scope:proof.scope,contract:{...proof.contract,recordKind:'adopted',startDate:'2026-10-06',endDate:null,status:'active'}};}
test('adopted ficha reads approved current dates/state and retains historical evidence separately',async()=>{
 const h=historyProof(),sql=historySql(),p=current(h);let reads=0;
 const result=await employee(sql,{query:{contractId:ADOPTED}},TENANT,{resolveAdoptionHistory:async()=>h,resolveCurrentEmployee:async()=>{reads++;return p;}});
 assert.equal(result.status,200);assert.equal(reads,2);assert.equal(result.payload.data.administrativeStatus,'active');assert.equal(result.payload.data.activo,true);assert.equal(result.payload.data.fechaIngreso,'2026-10-06');assert.equal(result.payload.data.liquidable,false);assert.equal(result.payload.data.history.readOnly,true);
});
test('adopted ficha refuses an interval change during historical reads',async()=>{
 const h=historyProof(),p=current(h);let reads=0;
 await assert.rejects(employee(historySql(),{query:{contractId:ADOPTED}},TENANT,{resolveAdoptionHistory:async()=>h,resolveCurrentEmployee:async()=>++reads===1?p:{...p,contract:{...p.contract,status:'inactive',endDate:'2026-10-06'}}}),{status:409});
});
test('136 changes neither original entrypoints nor municipal tables/permissions',()=>{
 const sql=fs.readFileSync('scripts/migrations/136-adopted-employment-lifecycle.sql','utf8');assert.doesNotMatch(sql,/CREATE(?: OR REPLACE)? FUNCTION public\.native_employment_lifecycle_\w+_v1\(/);assert.doesNotMatch(sql,/UPDATE public\.(employment_contract|person_identity)|INSERT INTO public\.(?:iam_|tenant_action_employment_link)/);assert.match(sql,/ADOPTED_LIFECYCLE_READER_CHANGED/);assert.match(sql,/ADOPTED_LIFECYCLE_ALREADY_INSTALLED/);assert.match(sql,/datesVerified/);assert.doesNotMatch(sql,/GRANT .*employment_adoption_decide/);
});
