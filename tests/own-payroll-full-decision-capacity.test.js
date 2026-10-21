// Proposed pure callbacks only. No HTTP server, browser or PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {largeCapacityDetail,largeCapacityCloseDetail} from './fixtures/own-payroll-large-capacity-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {annulDetail,annulCommand,annulReceipt} from './fixtures/own-payroll-annulment-synthetic.js';
import {closeCommand,closeReceipt} from './fixtures/own-payroll-close-synthetic.js';
import {OWN_LIQ_REVIEW,verifiedOwnLiquidationDetail} from '../assets/own-payroll-liquidation-model.js';
import {OWN_ANNUL_ACCESS} from '../assets/own-payroll-annulment-model.js';
import {OWN_CLOSE_WRITE,ownCloseDetail,ownCloseSnapshot} from '../assets/own-payroll-close-model.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse} from '../assets/own-payroll-response.js';
import {ownRunHash,verifyOwnRunReceipt} from '../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation} from '../lib/internal-own-payroll-liquidation.js';
import {ownAnnulOperation} from '../lib/internal-own-payroll-annulment.js';
import {ownCloseOperation} from '../lib/internal-own-payroll-close.js';
import {createOwnLiquidationHandler} from '../api/internal-own-payroll-liquidation.js';
import {createOwnAnnulHandler} from '../api/internal-own-payroll-annulment.js';
import {createOwnCloseHandler} from '../api/internal-own-payroll-close.js';
import {createOwnReceiptHandler} from '../api/internal-own-payroll-receipts.js';
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const principal=caps=>({user:{email:'capacity@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:caps}});
const session={email:'capacity@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
let sharedDetail;const detail=()=>sharedDetail??=largeCapacityDetail();
function callback(value){const calls=[];return {calls,sql:{query:async(q,values)=>{calls.push({q,values});return[{result:value}];}}};}
class Sink extends EventEmitter{
 constructor(){super();this.headers={};this.chunks=[];this.jsonCalls=0;this.headersSent=false;this.destroyed=false;}
 setHeader(key,value){this.headers[key.toLowerCase()]=value;}
 status(value){this.statusCode=value;return this;}
 write(chunk){this.headersSent=true;this.chunks.push(Uint8Array.from(chunk));return true;}
 end(){this.writableEnded=true;}
 json(value){this.jsonCalls++;this.value=value;this.writableEnded=true;return this;}
 destroy(){this.destroyed=true;}
 response(){const chunks=this.chunks;return {headers:{get:key=>this.headers[key.toLowerCase()]??null},body:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}})};}
}
const req=(id,accept)=>({method:'GET',headers:{accept},query:{resource:'detail',id},url:'/api/internal-own-payroll-liquidation?resource=detail&id='+id});

test('only trusted fullJson:true recovers the entire valid855x20 capture; legacy and arbitrary limits stay bounded',async()=>{
 const d=detail(),c=d.capture;await verifiedOwnLiquidationDetail(d);assert.ok(bytes(c.payload)+bytes(c.body)+8192<OWN_RUN_MAX_RESPONSE);assert.ok(bytes({ok:true,data:d})>OWN_RUN_MAX_RESPONSE&&bytes({ok:true,data:d})<OWN_RUN_FULL_MAX_BYTES);
 for(const policy of [{},{fullJson:false},{fullJson:'true'},{maxBytes:OWN_RUN_FULL_MAX_BYTES},{fullJson:false,maxBytes:Number.MAX_SAFE_INTEGER}])assert.throws(()=>verifyOwnRunReceipt(c,policy),e=>e.code==='OWN_RUN_LIMIT');
 assert.equal(verifyOwnRunReceipt(c,{fullJson:true}),c);const before=ownRunHash(d);
 const old=callback(d);await assert.rejects(ownLiquidationOperation(old.sql,principal(OWN_LIQ_REVIEW),session,'detail',{id:d.id}),e=>e.code==='OWN_LIQ_LIMIT'&&e.status===422);assert.match(old.calls[0].q,/own_liquidation_detail_v1\(/);
 const full=callback(d),value=await ownLiquidationOperation(full.sql,principal(OWN_LIQ_REVIEW),session,'detail',{id:d.id},{fullJson:true});assert.equal(value,d);assert.equal(ownRunHash(value),before);assert.equal(value.capture.saved.result.employeeCount,855);assert.equal(value.capture.saved.result.rows.length,17100);assert.match(full.calls[0].q,/own_liquidation_detail_full_v1\(/);assert.equal(full.calls.length,1);
 const broken=structuredClone(d);broken.capture.payloadSha256='f'.repeat(64);assert.throws(()=>verifyOwnRunReceipt(broken.capture,{fullJson:true}),e=>e.code==='OWN_RUN_CONTRACT_INVALID');const bad=callback(broken);await assert.rejects(ownLiquidationOperation(bad.sql,principal(OWN_LIQ_REVIEW),session,'detail',{id:d.id},{fullJson:true}),e=>e.status===503);assert.equal(ownRunHash(d),before);
});

test('actual API requires the exact full Accept and sends the same complete data through its bounded stream',async()=>{
 const d=detail();for(const accept of ['application/json',OWN_RUN_FULL_JSON+', application/json']){const f=callback(d),sink=new Sink(),handler=createOwnLiquidationHandler({env:{},requireAccess:async()=>({mode:'managed',principal:principal(OWN_LIQ_REVIEW)}),sessionFor:()=>session,getSql:async()=>f.sql});await handler(req(d.id,accept),sink);assert.equal(sink.statusCode,422);assert.equal(sink.value.code,'OWN_LIQ_LIMIT');assert.match(f.calls[0].q,/own_liquidation_detail_v1\(/);assert.equal(sink.chunks.length,0);}
 const f=callback(d),sink=new Sink(),handler=createOwnLiquidationHandler({env:{},requireAccess:async()=>({mode:'managed',principal:principal(OWN_LIQ_REVIEW)}),sessionFor:()=>session,getSql:async()=>f.sql});await handler(req(d.id,OWN_RUN_FULL_JSON),sink);assert.equal(sink.statusCode,200);assert.equal(sink.jsonCalls,0);assert.ok(sink.chunks.length>1);assert.equal(sink.headers['content-type'],OWN_RUN_FULL_JSON+'; charset=utf-8');assert.equal(Number(sink.headers['x-municontrol-json-bytes']),sink.chunks.reduce((n,c)=>n+c.length,0));const value=await readOwnPayrollResponse(sink.response(),{maxBytes:OWN_RUN_FULL_MAX_BYTES});assert.equal(ownRunHash(value.data),ownRunHash(d));assert.match(f.calls[0].q,/own_liquidation_detail_full_v1\(/);
});

test('full negotiation without a real stream response fails before authorization or SQL in every API',async()=>{
 for(const factory of [createOwnLiquidationHandler,createOwnAnnulHandler,createOwnCloseHandler,createOwnReceiptHandler]){let access=0,connections=0;const handler=factory({requireAccess:async()=>{access++;throw Error('Must not authorize');},getSql:async()=>{connections++;throw Error('Must not connect');}}),sink={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}};await handler({method:'GET',headers:{accept:OWN_RUN_FULL_JSON},query:{}},sink);assert.equal(sink.statusCode,503);assert.equal(sink.value.ok,false);assert.equal(access,0);assert.equal(connections,0);}
});

test('stream failures after headers destroy the response rather than send a second JSON envelope',async()=>{
 const d=detail(),f=callback(d),sink=new Sink();sink.write=()=>{sink.headersSent=true;throw Error('Synthetic delivery failure');};const handler=createOwnLiquidationHandler({env:{},requireAccess:async()=>({mode:'managed',principal:principal(OWN_LIQ_REVIEW)}),sessionFor:()=>session,getSql:async()=>f.sql});await handler(req(d.id,OWN_RUN_FULL_JSON),sink);assert.equal(sink.destroyed,true);assert.equal(sink.jsonCalls,0);assert.equal(f.calls.length,1);assert.equal(ownRunHash(d),ownRunHash(detail()));
});

test('full annul detail/attempt/command use the declared full SQL while the old profile retains the original entries',async()=>{
 const d=annulDetail(),body=annulCommand(d),key=uid(11),receipt=annulReceipt(d,body,key);
 for(const fullJson of [false,true])for(const [operation,input,value]of [['detail',{period:d.period,liquidationType:d.liquidationType},d],['attempt',{key},receipt],['command',{key,body},receipt]]){const f=callback(value),result=await ownAnnulOperation(f.sql,principal(OWN_ANNUL_ACCESS),session,operation,input,{fullJson});assert.equal(result,value);assert.ok(f.calls[0].q.includes('own_annul_'+operation+(fullJson?'_full_v1':'_v1')+'('));assert.equal(f.calls.length,1);assert.ok(f.calls.every(c=>c.q.startsWith('SELECT public.own_annul_')));}
});

test('full close snapshot and all recovery/group/reopen branches preserve the complete original data',async()=>{
 const d=largeCapacityCloseDetail();ownCloseDetail(d);const snapshot=ownCloseSnapshot(d,{kind:'all',values:[]}),body=closeCommand({scopeVersion:d.scopeVersion,stateVersion:d.stateVersion}),key=uid(9),receipt=closeReceipt({body,snapshot,snapshotSha256:ownRunHash(snapshot)});assert.ok(bytes(snapshot)>3*1024*1024);assert.equal(snapshot.concepts.length,17100);const before=ownRunHash(snapshot);
 for(const [operation,input,value]of [['detail',{period:d.period,liquidationType:d.liquidationType},d],['command',{key,body},receipt],['attempt',{key},receipt],['group',{id:receipt.groupId},receipt]]){const f=callback(value),result=await ownCloseOperation(f.sql,principal(OWN_CLOSE_WRITE),session,operation,input,{fullJson:true});assert.equal(result,value);assert.ok(f.calls[0].q.includes('own_close_'+operation+'_full_v1('));assert.equal(f.calls.length,1);}
 const reopenBody={...body,command:'reopen',groupId:receipt.groupId},reopened={...receipt,key:uid(19),body:reopenBody,bodySha256:ownRunHash(reopenBody)};const f=callback(reopened);assert.equal(await ownCloseOperation(f.sql,principal(OWN_CLOSE_WRITE),session,'command',{key:reopened.key,body:reopenBody},{fullJson:true}),reopened);assert.match(f.calls[0].q,/own_close_command_full_v1/);assert.equal(ownRunHash(reopened.snapshot),before);
});

test('aggregate32MiB remains separate from individual capture32MiB and refuses the whole close review',async()=>{
 const d=largeCapacityCloseDetail(4);ownCloseDetail(d);for(const capture of d.captures){assert.ok(bytes({ok:true,data:capture})<OWN_RUN_FULL_MAX_BYTES);verifyOwnRunReceipt(capture,{fullJson:true});}assert.ok(bytes({ok:true,data:d})>OWN_RUN_FULL_MAX_BYTES);const before=ownRunHash(d),f=callback(d);await assert.rejects(ownCloseOperation(f.sql,principal(OWN_CLOSE_WRITE),session,'detail',{period:d.period,liquidationType:d.liquidationType},{fullJson:true}),e=>e.code==='OWN_CLOSE_LIMIT'&&e.status===422);assert.equal(f.calls.length,1);assert.equal(ownRunHash(d),before);
});

test('the actual shared reader checks chunk bytes, UTF8, advertised bytes and cancellation',async()=>{
 const value={ok:true,data:{synthetic:'á'}},wire=new TextEncoder().encode(JSON.stringify(value));let canceled=0,released=0;
 const response=(chunks,announced)=>{let at=0;return {headers:{get:()=>announced??null},body:{getReader:()=>({read:async()=>at<chunks.length?{done:false,value:chunks[at++]}:{done:true},cancel:async()=>{canceled++;},releaseLock:()=>{released++;}})}};};
 assert.deepEqual(await readOwnPayrollResponse(response([wire.subarray(0,wire.indexOf(0xc3)+1),wire.subarray(wire.indexOf(0xc3)+1)],String(wire.length)),{maxBytes:1024}),value);
 await assert.rejects(readOwnPayrollResponse(response([new Uint8Array([0xc3,0x28])]),{maxBytes:1024}));await assert.rejects(readOwnPayrollResponse(response([wire],'999'),{maxBytes:1024}));await assert.rejects(readOwnPayrollResponse(response([wire]),{maxBytes:3}));const controller=new AbortController();controller.abort();await assert.rejects(readOwnPayrollResponse(response([wire]),{maxBytes:1024,signal:controller.signal}),e=>e.name==='AbortError');assert.equal(canceled,4);assert.equal(released,5);
});
