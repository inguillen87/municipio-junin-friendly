// Pure service/API callbacks and static UI contract; no PostgreSQL, HTTP server or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {largeImputationWorkspace} from './fixtures/own-payroll-imputation-large-synthetic.js';
import {imputationWorkspaceFixture} from './fixtures/own-payroll-imputation-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {accountingHash} from '../assets/own-payroll-accounting-model.js';
import {salaryJsonbBytes} from '../assets/native-salary-catalog-model.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse} from '../assets/own-payroll-response.js';
import {IMPUTATION_READ,IMPUTATION_CAPS,imputationOperation,imputationError} from '../lib/internal-own-payroll-imputation.js';
import {createOwnImputationHandler} from '../api/internal-own-payroll-imputation.js';
const LIMIT16=16*1024*1024,bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const principal={user:{email:'capacity@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:[...IMPUTATION_READ,...IMPUTATION_CAPS.propose,...IMPUTATION_CAPS.approve]}};
const session={email:'capacity@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
let shared;const fixture=()=>shared??=largeImputationWorkspace();
function callback(value){const calls=[];return {calls,sql:{query:async(q,values)=>{calls.push({q,values});return[{result:value}];}}};}
class Sink extends EventEmitter{
 constructor(){super();this.headers={};this.chunks=[];this.jsonCalls=0;this.headersSent=false;this.destroyed=false;}
 setHeader(key,value){this.headers[key.toLowerCase()]=value;}
 status(value){this.statusCode=value;return this;}
 write(chunk){this.headersSent=true;this.chunks.push(Uint8Array.from(chunk));return true;}
 end(){this.writableEnded=true;}
 json(value){this.jsonCalls++;this.value=value;this.writableEnded=true;return this;}
 destroy(){this.destroyed=true;}
 response(){const chunks=this.chunks;return {headers:{get:key=>this.headers[key.toLowerCase()]??null},body:new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(chunk);c.close();}})};}
}
function request(query,accept){return {method:'GET',query,headers:accept===undefined?{}:{accept},url:'/api/internal-own-payroll-imputation?'+new URLSearchParams(query)};}
function handlerFor(sql,extra={}){return createOwnImputationHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>sql,...extra});}

test('invented855x20 source preserves all rows/nulls/hashes and measures wire plus jsonb budgets separately',async()=>{
 const f=await fixture(),a=f.allocation;
 assert.equal(a.ready,true);assert.equal(a.employeeCount,855);assert.equal(a.rows.length,17100);assert.equal(a.conceptCount,17100);
 assert.equal(new Set(a.groups.flatMap(g=>g.ordinals)).size,17100);assert.equal(a.allocatedCount,17100);
 assert.ok(a.rows.every(r=>r.amount==='1.00'&&r.liquidationDate==='2026-10-31'&&r.destination.creditorReference===null&&r.destination.bankAccountReference===null&&r.destination.bankReference===null));
 assert.ok(f.source.configuration.definition.assignments.every(a=>a.conceptCode===null));
 assert.equal(await accountingHash(f.source.group.snapshot),f.source.group.snapshotSha256);assert.equal(await accountingHash(f.originalCapture.body),f.source.dateSources[0].bodySha256);
 assert.equal(await accountingHash(a),f.preview.allocationSha256);assert.equal(a.accountingPosted,false);assert.equal(a.paymentExecuted,false);
 assert.ok(bytes(f.source)<LIMIT16);assert.ok(salaryJsonbBytes(f.source)<LIMIT16);
 assert.ok(bytes(a)>LIMIT16);assert.ok(salaryJsonbBytes(a)>LIMIT16&&salaryJsonbBytes(a)<=OWN_RUN_FULL_MAX_BYTES);
 assert.ok(salaryJsonbBytes(f.source)+salaryJsonbBytes(a)+32768+16384<=OWN_RUN_FULL_MAX_BYTES);
 assert.ok(salaryJsonbBytes(f.source)+salaryJsonbBytes(a)+salaryJsonbBytes(f.body)+16384<=OWN_RUN_FULL_MAX_BYTES);
 for(const value of [f.preview,f.detail]){assert.ok(bytes(value)>LIMIT16);assert.ok(bytes({ok:true,data:value})<=OWN_RUN_FULL_MAX_BYTES);assert.ok(salaryJsonbBytes(value)+8192<=OWN_RUN_FULL_MAX_BYTES);}
});

test('trusted fullJson:true returns the same complete preview/detail; legacy16 and invented options stay bounded',async()=>{
 const f=await fixture();
 for(const [operation,input,value]of [['source',{id:f.source.group.groupId,fiscalYear:'2026'},f.preview],['detail',{id:f.detail.proposal.id},f.detail]]){
  const before=await accountingHash(value);
  for(const policy of [{},{fullJson:false},{fullJson:'true'},{maxBytes:OWN_RUN_FULL_MAX_BYTES}]){const c=callback(value);await assert.rejects(imputationOperation(c.sql,principal,session,operation,input,policy),e=>e.code==='IMPUTATION_LIMIT'&&e.status===422);assert.equal(c.calls.length,1);assert.ok(c.calls[0].q.includes('own_imputation_'+operation+'_v1('));}
  const c=callback(value);assert.equal(await imputationOperation(c.sql,principal,session,operation,input,{fullJson:true}),value);assert.ok(c.calls[0].q.includes('own_imputation_'+operation+'_full_v1('));assert.equal(c.calls.length,1);assert.equal(await accountingHash(value),before);
 }
});

test('full profile still rejects altered source/allocation contracts rather than return partial data',async()=>{
 const f=await fixture(),bad={...f.preview,allocationSha256:'0'.repeat(64)},c=callback(bad);
 await assert.rejects(imputationOperation(c.sql,principal,session,'source',{id:f.source.group.groupId,fiscalYear:'2026'},{fullJson:true}),e=>e.status===503&&e.code==='IMPUTATION_CONTRACT_INVALID');
 assert.equal(c.calls.length,1);assert.equal(f.preview.allocationSha256,await accountingHash(f.allocation));
});

test('full command uses the same body/key/hash and recovery/bootstrap keep their original compact entries',async()=>{
 const f=await imputationWorkspaceFixture();
 for(const fullJson of [false,true])for(const [operation,input,value]of [['command',{key:f.receipt.requestKey,body:f.body},f.receipt],['attempt',{key:f.receipt.requestKey},f.receipt],['bootstrap',{period:f.boot.period,liquidationType:f.boot.liquidationType},f.boot]]){
  const c=callback(value);assert.equal(await imputationOperation(c.sql,principal,session,operation,input,{fullJson}),value);
  assert.ok(c.calls[0].q.includes('own_imputation_'+operation+(fullJson&&operation==='command'?'_full':'')+'_v1('));assert.equal(c.calls.length,1);
  if(operation==='command'){assert.deepEqual(JSON.parse(c.calls[0].values[1]),f.body);assert.equal(c.calls[0].values[2],f.receipt.requestKey);assert.equal(await accountingHash(JSON.parse(c.calls[0].values[1])),f.receipt.requestSha256);}
 }
});

test('exact full Accept streams the full preview through the real bounded reader; nonexact negotiation stays legacy',async()=>{
 const f=await fixture(),q={resource:'source',id:f.source.group.groupId,fiscalYear:'2026'},c=callback(f.preview),sink=new Sink();
 await handlerFor(c.sql)(request(q,OWN_RUN_FULL_JSON),sink);assert.equal(sink.statusCode,200);assert.equal(sink.jsonCalls,0);assert.equal(sink.writableEnded,true);assert.match(c.calls[0].q,/own_imputation_source_full_v1/);assert.match(sink.headers['cache-control'],/no-store/);
 const wire=await readOwnPayrollResponse(sink.response(),{maxBytes:OWN_RUN_FULL_MAX_BYTES});assert.equal(wire.data.allocation.rows.length,17100);assert.equal(wire.data.allocationSha256,f.preview.allocationSha256);assert.equal(await accountingHash(wire.data),await accountingHash(f.preview));
 for(const accept of [undefined,'application/json',OWN_RUN_FULL_JSON+';q=1',OWN_RUN_FULL_JSON+',application/json']){const plain=new Sink(),sql=callback(f.preview);await handlerFor(sql.sql)(request(q,accept),plain);assert.equal(plain.statusCode,422);assert.equal(plain.value.code,'IMPUTATION_LIMIT');assert.equal(plain.value.data,undefined);assert.equal(plain.jsonCalls,1);assert.match(sql.calls[0].q,/own_imputation_source_v1/);}
});

test('full POST/replay preserves the command/key/hash and streams the original small receipt',async()=>{
 const f=await imputationWorkspaceFixture();
 for(const replayed of [false,true]){const receipt={...f.receipt,replayed},c=callback(receipt),sink=new Sink(),req={method:'POST',query:{},url:'/api/internal-own-payroll-imputation',headers:{accept:OWN_RUN_FULL_JSON,origin:'https://municipio.example','content-type':'application/json','idempotency-key':f.receipt.requestKey},body:JSON.stringify({operation:'command',payload:f.body})};await handlerFor(c.sql)(req,sink);assert.equal(sink.statusCode,replayed?200:201);assert.equal(sink.jsonCalls,0);assert.equal(sink.headers['idempotency-replayed'],replayed?'true':undefined);assert.match(c.calls[0].q,/own_imputation_command_full_v1/);assert.deepEqual(JSON.parse(c.calls[0].values[1]),f.body);assert.equal(c.calls[0].values[2],f.receipt.requestKey);const value=await readOwnPayrollResponse(sink.response(),{maxBytes:OWN_RUN_FULL_MAX_BYTES});assert.deepEqual(value.data,receipt);assert.equal(await accountingHash(value.data.body),f.receipt.requestSha256);}
});

test('full negotiation requires write/end/once before authorization, private body or SQL',async()=>{
 for(const missing of ['write','end','once']){const sink=new Sink();sink[missing]=undefined;let access=0,connections=0,reads=0;const h=handlerFor(null,{requireAccess:async()=>{access++;throw Error('must not authorize');},getSql:async()=>{connections++;throw Error('must not connect');}}),req={method:'POST',query:{},url:'/api/internal-own-payroll-imputation',headers:{accept:OWN_RUN_FULL_JSON,origin:'https://municipio.example','content-type':'application/json'}};Object.defineProperty(req,'body',{get(){reads++;throw Error('must not read body');}});await h(req,sink);assert.equal(sink.statusCode,503);assert.equal(access,0);assert.equal(connections,0);assert.equal(reads,0);assert.equal(sink.jsonCalls,1);}
});

test('stream failure after headers destroys the response; known stream capacity failure remains honest422',async()=>{
 const f=await imputationWorkspaceFixture(),c=callback(f.receipt),sink=new Sink();sink.write=()=>{sink.headersSent=true;throw Error('Synthetic stream delivery failure');};await handlerFor(c.sql)(request({resource:'attempt',key:f.receipt.requestKey},OWN_RUN_FULL_JSON),sink);assert.equal(sink.destroyed,true);assert.equal(sink.jsonCalls,0);assert.equal(c.calls.length,1);assert.equal(imputationError(Error('OWN_RUN_LIMIT')).status,422);assert.equal(imputationError(Error('private-database-error')).status,503);
});

test('panel opts into the shared streaming reader with live/abort guards and preserves the request body limit',()=>{
 const panel=readFileSync(new URL('../assets/own-payroll-imputation-panel.js',import.meta.url),'utf8'),api=readFileSync(new URL('../api/internal-own-payroll-imputation.js',import.meta.url),'utf8');
 assert.ok(panel.includes("import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse} from './own-payroll-response.js';"));
 const requestSource=panel.slice(panel.indexOf(' async function request('),panel.indexOf(' async function session('));
 assert.ok(requestSource.includes('if(!live())'));assert.ok(requestSource.includes('signal=controller?.signal'));assert.ok(requestSource.includes('Accept:full?OWN_RUN_FULL_JSON'));assert.ok(requestSource.includes('readOwnPayrollResponse(r,{maxBytes:full?OWN_RUN_FULL_MAX_BYTES:16777216,signal})'));assert.ok(!requestSource.includes('.text('));
 assert.ok(api.includes('maxBytes:IMPUTATION_MAX_BYTES,maxDepth:5'));assert.ok(api.indexOf('fullJson&&!supportsOwnPayrollStream(res)')<api.indexOf('const access=await authorize'));
});
