// Proposed pure callbacks/source contracts; no SQL, HTTP server or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {largeJournalWorkspace} from './fixtures/own-payroll-journal-large-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {accountingHash} from '../assets/own-payroll-accounting-model.js';
import {salaryJsonbBytes} from '../assets/native-salary-catalog-model.js';
import {JOURNAL_READ,JOURNAL_CAPS,JOURNAL_MAX_BYTES} from '../assets/own-payroll-journal-model.js';
import {journalOperation,journalError} from '../lib/internal-own-payroll-journal.js';
import {createOwnJournalHandler} from '../api/internal-own-payroll-journal.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse} from '../assets/own-payroll-response.js';
const LIMIT16=16*1024*1024,bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const principal={user:{email:'capacity@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:[...JOURNAL_READ,...JOURNAL_CAPS.propose,...JOURNAL_CAPS.post]}};
const session={email:'capacity@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
let shared;const fixture=()=>shared??=largeJournalWorkspace();
function callback(value){const calls=[];return {calls,sql:{query:async(q,values)=>{calls.push({q,values});return[{result:value}];}}};}
class Sink extends EventEmitter{
 constructor(){super();this.headers={};this.chunks=[];this.jsonCalls=0;this.headersSent=false;this.destroyed=false;}
 setHeader(key,value){this.headers[key.toLowerCase()]=value;}
 status(value){this.statusCode=value;return this;}
 write(chunk){this.headersSent=true;this.chunks.push(Uint8Array.from(chunk));return true;}
 end(){this.writableEnded=true;}
 json(value){this.jsonCalls++;this.value=value;return this;}
 destroy(){this.destroyed=true;}
 response(){const chunks=this.chunks;return {headers:{get:key=>this.headers[key.toLowerCase()]??null},body:new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(chunk);c.close();}})};}
}
const request=(query,accept)=>({method:'GET',query,headers:accept===undefined?{}:{accept},url:'/api/internal-own-payroll-journal?'+new URLSearchParams(query)});
const handlerFor=(sql,extra={})=>createOwnJournalHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>sql,...extra});
const commandRequest=(f,accept)=>({method:'POST',query:{},url:'/api/internal-own-payroll-journal',headers:{accept,origin:'https://municipio.example','content-type':'application/json','idempotency-key':f.receipt.requestKey},body:JSON.stringify({operation:'command',payload:f.body})});

test('invented855x20 journal keeps balanced40entries, complete ordinal coverage, nulls and distinct wire/jsonb budgets',async()=>{
 const f=await fixture(),j=f.journal;assert.equal(j.ready,true);assert.equal(j.employeeCount,855);assert.equal(j.conceptCount,17100);assert.equal(j.groupCount,20);assert.equal(j.entries.length,40);assert.deepEqual(j.totals,{debit:'17100.00',credit:'17100.00'});assert.equal(j.paymentExecuted,false);
 for(const role of ['primary','counterpart']){const ordinals=j.entries.filter(e=>e.role===role).flatMap(e=>e.sourceOrdinals);assert.equal(ordinals.length,17100);assert.equal(new Set(ordinals).size,17100);}
 assert.ok(j.entries.every(e=>e.destination.creditorReference===null&&e.destination.bankAccountReference===null&&e.destination.bankReference===null));
 for(const value of [f.source,f.detail]){assert.ok(bytes(value)>LIMIT16);assert.ok(bytes({ok:true,data:value})<=OWN_RUN_FULL_MAX_BYTES);assert.ok(salaryJsonbBytes(value)+8192<=OWN_RUN_FULL_MAX_BYTES);}
 assert.ok(bytes({operation:'command',payload:f.body})<JOURNAL_MAX_BYTES);assert.ok(salaryJsonbBytes(f.source)+salaryJsonbBytes(j)+salaryJsonbBytes(f.body)+8192<=OWN_RUN_FULL_MAX_BYTES);assert.equal(await accountingHash(j),f.body.journalSha256);assert.equal(await accountingHash(f.body),f.detail.requestSha256);
});

test('only trusted fullJson:true admits complete source/detail; legacy16 and arbitrary options reject without truncating',async()=>{
 const f=await fixture();for(const [operation,input,value]of [['source',{id:f.source.imputation.proposal.id,basis:'imputation'},f.source],['detail',{id:f.detail.id},f.detail]]){
  const hash=await accountingHash(value);
  for(const policy of [{},{fullJson:false},{fullJson:'true'},{maxBytes:OWN_RUN_FULL_MAX_BYTES}]){const c=callback(value);await assert.rejects(journalOperation(c.sql,principal,session,operation,input,policy),e=>e.code==='JOURNAL_LIMIT'&&e.status===422);assert.equal(c.calls.length,1);assert.ok(c.calls[0].q.includes('own_journal_'+operation+'_v1('));}
  const c=callback(value);assert.equal(await journalOperation(c.sql,principal,session,operation,input,{fullJson:true}),value);assert.ok(c.calls[0].q.includes('own_journal_'+operation+'_full_v1('));assert.equal(await accountingHash(value),hash);
 }
});

test('full delivery still rejects a changed journal hash instead of accepting the declared state',async()=>{
 const f=await fixture(),bad={...f.detail,journalSha256:'0'.repeat(64)},c=callback(bad);await assert.rejects(journalOperation(c.sql,principal,session,'detail',{id:f.detail.id},{fullJson:true}),e=>e.code==='JOURNAL_CONTRACT_INVALID'&&e.status===503);assert.equal(c.calls.length,1);assert.equal(await accountingHash(f.journal),f.detail.journalSha256);
});

test('full command retains the same body/key/hash while attempts remain the compact canonical read',async()=>{
 const f=await fixture();for(const fullJson of [false,true])for(const operation of ['command','attempt']){const value=operation==='attempt'?{...f.receipt,replayed:true}:f.receipt,c=callback(value),input={key:f.receipt.requestKey,...(operation==='command'?{body:f.body}:{})};assert.equal(await journalOperation(c.sql,principal,session,operation,input,{fullJson}),value);assert.ok(c.calls[0].q.includes('own_journal_'+operation+(fullJson&&operation==='command'?'_full':'')+'_v1('));if(operation==='command'){assert.deepEqual(JSON.parse(c.calls[0].values[1]),f.body);assert.equal(c.calls[0].values[2],f.receipt.requestKey);assert.equal(await accountingHash(JSON.parse(c.calls[0].values[1])),f.receipt.requestSha256);}}
});

test('exact full Accept streams the full source via the existing bounded reader; lists/parameters keep legacy16',async()=>{
 const f=await fixture(),q={resource:'source',id:f.source.imputation.proposal.id,basis:'imputation'},c=callback(f.source),sink=new Sink();await handlerFor(c.sql)(request(q,OWN_RUN_FULL_JSON),sink);assert.equal(sink.statusCode,200);assert.equal(sink.jsonCalls,0);assert.equal(sink.writableEnded,true);assert.match(c.calls[0].q,/own_journal_source_full_v1/);assert.match(sink.headers['cache-control'],/no-store/);const value=await readOwnPayrollResponse(sink.response(),{maxBytes:OWN_RUN_FULL_MAX_BYTES});assert.equal(value.data.imputation.allocation.rows.length,17100);assert.equal(await accountingHash(value.data),await accountingHash(f.source));
 for(const accept of [undefined,'application/json',OWN_RUN_FULL_JSON+';q=1',OWN_RUN_FULL_JSON+',application/json']){const c=callback(f.source),sink=new Sink();await handlerFor(c.sql)(request(q,accept),sink);assert.equal(sink.statusCode,422);assert.equal(sink.value.code,'JOURNAL_LIMIT');assert.equal(sink.value.data,undefined);assert.match(c.calls[0].q,/own_journal_source_v1/);}
});

test('stream support and revoked/session authority fail before private body reads and SQL',async()=>{
 const f=await fixture();for(const missing of ['write','end','once']){let auth=0,connect=0,reads=0;const req=commandRequest(f,OWN_RUN_FULL_JSON);delete req.body;Object.defineProperty(req,'body',{get(){reads++;throw Error('must not read');}});const sink=new Sink();sink[missing]=undefined;await handlerFor(null,{requireAccess:async()=>{auth++;throw Error('must not authorize');},getSql:async()=>{connect++;throw Error('must not connect');}})(req,sink);assert.equal(sink.statusCode,503);assert.equal(auth,0);assert.equal(connect,0);assert.equal(reads,0);}
 for(const change of [{requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}}})},{sessionFor:()=>({...session,id:null})}]){let connect=0,reads=0;const req=commandRequest(f,OWN_RUN_FULL_JSON);delete req.body;Object.defineProperty(req,'body',{get(){reads++;throw Error('must not read');}});const sink=new Sink();await handlerFor(null,{getSql:async()=>{connect++;throw Error('must not connect');},...change})(req,sink);assert.ok([401,403].includes(sink.statusCode));assert.equal(connect,0);assert.equal(reads,0);}
});

test('POST/replay streams the same receipt and a later delivery failure cannot send a second JSON envelope',async()=>{
 const f=await fixture();for(const replayed of [false,true]){const receipt={...f.receipt,replayed},c=callback(receipt),sink=new Sink();await handlerFor(c.sql)(commandRequest(f,OWN_RUN_FULL_JSON),sink);assert.equal(sink.statusCode,replayed?200:201);assert.equal(sink.jsonCalls,0);assert.equal(sink.headers['idempotency-replayed'],replayed?'true':undefined);assert.deepEqual((await readOwnPayrollResponse(sink.response(),{maxBytes:OWN_RUN_FULL_MAX_BYTES})).data,receipt);assert.equal(c.calls[0].values[2],receipt.requestKey);}
 const c=callback(f.receipt),sink=new Sink();sink.write=()=>{sink.headersSent=true;throw Error('synthetic delivery failure');};await handlerFor(c.sql)(request({resource:'attempt',key:f.receipt.requestKey},OWN_RUN_FULL_JSON),sink);assert.equal(sink.destroyed,true);assert.equal(sink.jsonCalls,0);for(const message of ['OWN_RUN_LIMIT','IMPUTATION_LIMIT'])assert.equal(journalError(Error(message)).status,422);assert.equal(journalError(Error('private-unknown-database-error')).status,503);
});

test('panel uses shared bounded chunks/signal/visibility and the original8MiB command limit remains unchanged',()=>{
 const panel=readFileSync(new URL('../assets/own-payroll-journal-panel.js',import.meta.url),'utf8'),api=readFileSync(new URL('../api/internal-own-payroll-journal.js',import.meta.url),'utf8');const requestSource=panel.slice(panel.indexOf(' async function request('),panel.indexOf(' async function session('));assert.ok(requestSource.includes('if(!live())'));assert.ok(requestSource.includes('signal=controller?.signal'));assert.ok(requestSource.includes('Accept:full?OWN_RUN_FULL_JSON'));assert.ok(requestSource.includes('readOwnPayrollResponse(r,{maxBytes:full?OWN_RUN_FULL_MAX_BYTES:16777216,signal})'));assert.ok(!requestSource.includes('.text('));assert.ok(api.includes('maxBytes:JOURNAL_MAX_BYTES,maxDepth:5'));assert.equal(JOURNAL_MAX_BYTES,8388608);assert.ok(api.indexOf('fullJson&&!supportsOwnPayrollStream(res)')<api.indexOf('const access=await authorize'));
});
