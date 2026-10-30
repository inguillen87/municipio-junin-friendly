import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs';
import {forwardReceiptUiQaHttp} from '../scripts/lib/own-payroll-receipt-ui-http.mjs';
import {sendOwnPayrollStream} from '../lib/own-payroll-response.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse} from '../assets/own-payroll-response.js';
import {createOwnReceiptHandler} from '../api/internal-own-payroll-receipts.js';
import {OWN_RECEIPT_PREPARE,ownReceiptIssuer} from '../assets/own-payroll-receipt-model.js';
import {receiptCommand,receiptEvent,receiptPreview} from './fixtures/own-payroll-receipt-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

// Loopback HTTP and in-memory SQL recording only. No database is opened.
const endpoint='/api/internal-own-payroll-receipts',principal={user:{email:'receipt-ui-stream@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:OWN_RECEIPT_PREPARE}},session={email:principal.user.email,id:uid(52),version:1,releaseSha:'d'.repeat(40)};
const issuer={id:'qa-municipal-issuer',revision:1,issuer:{name:'MUNICIPIO INVENTADO QA',taxId:'30000000007',address:'CALLE INVENTADA 1, LOCALIDAD QA'},source:{kind:'municipal_official_backup',label:'Respaldo institucional inventado QA',cutoff:'2026-10-01T15:17:29',validityDeclared:false}};
async function serverFor(t,handler,options=()=>({})){
 const pending=[],failures=[],completed=[],incoming=[],wireWrites=[],wireDrains=[];
 const server=http.createServer({highWaterMark:1024},(req,res)=>{
  incoming.push({req,res});req.query=Object.fromEntries(new URL(req.url,'http://local.invalid').searchParams);
  const originalWrite=res.write;res.write=function(...args){const accepted=originalWrite.apply(this,args);wireWrites.push({bytes:Buffer.byteLength(args[0],typeof args[1]==='string'?args[1]:undefined),accepted});return accepted;};
  res.on('drain',()=>wireDrains.push(true));
  const task=forwardReceiptUiQaHttp(req,res,handler,options()).then(result=>completed.push(result),error=>{failures.push(error);res.on('error',()=>{});res.destroy(error);});
  pending.push(task);
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await Promise.all(pending);});
 return{origin,server,failures,completed,incoming,wireWrites,wireDrains,settled:()=>Promise.all([...pending])};
}
function receiptApi(value=receiptPreview()){
 const env={},calls=[],authorized=[],stats={connections:0},profiles={[principal.tenant.id]:structuredClone(issuer)};
 const handler=createOwnReceiptHandler({env,issuerProfiles:profiles,requireAccess:async(req,res)=>{authorized.push({req,res,flowing:req.readableFlowing,ownsBody:Object.hasOwn(req,'body')});await new Promise(resolve=>setImmediate(resolve));return{mode:'managed',principal};},sessionFor:()=>session,getSql:async()=>{stats.connections++;return{query:async(text,values)=>{calls.push({text,values});return[{result:typeof value==='function'?value():structuredClone(value)}];}};}});
 return{env,calls,authorized,stats,profiles,handler};
}
const post=(origin,payload,accept=OWN_RUN_FULL_JSON)=>({method:'POST',headers:{Accept:accept,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','Idempotency-Key':uid(9)},body:JSON.stringify(payload)});
async function packet(response){const bytes=Buffer.from(await response.arrayBuffer());return{bytes,value:JSON.parse(bytes.toString('utf8'))};}

test('actual issuer handler retains native HTTP identity and negotiated complete bytes with zero SQL',async t=>{
 const a=receiptApi(),previews=[],writes=[],h=await serverFor(t,a.handler,()=>({onPreview:p=>previews.push(p),onWrite:w=>writes.push(w)}));a.env.INTERNAL_APP_ORIGIN=h.origin;
 const r=await fetch(h.origin+endpoint+'?resource=issuer',{headers:{Accept:OWN_RUN_FULL_JSON}}),{bytes,value}=await packet(r);await h.settled();
 assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),OWN_RUN_FULL_JSON+'; charset=utf-8');assert.equal(r.headers.get('x-municontrol-json-bytes'),String(bytes.length));assert.equal(r.headers.get('content-length'),null);
 assert.deepEqual(ownReceiptIssuer(value.data,{tenantId:principal.tenant.id}).profile.issuer,issuer.issuer);
 assert.equal(a.authorized[0].req,h.incoming[0].req);assert.equal(a.authorized[0].res,h.incoming[0].res);assert.equal(a.authorized[0].flowing,null);assert.equal(a.authorized[0].ownsBody,false);assert.equal(h.incoming[0].req.headers.accept,OWN_RUN_FULL_JSON);
 assert.equal(a.stats.connections,0);assert.deepEqual(previews,[]);assert.deepEqual(writes,[]);assert.deepEqual(h.failures,[]);assert.equal(h.completed[0].observedPackets,1);
});

test('cross-tenant negative actually changes the full HTTP issuer body and the real validator rejects it',async t=>{
 const a=receiptApi(),h=await serverFor(t,a.handler,()=>({wrongIssuerScope:()=>true}));a.env.INTERNAL_APP_ORIGIN=h.origin;
 const r=await fetch(h.origin+endpoint+'?resource=issuer',{headers:{Accept:OWN_RUN_FULL_JSON}}),{bytes,value}=await packet(r);await h.settled();
 assert.equal(r.status,200);assert.notEqual(value.data.scope.tenantId,principal.tenant.id);assert.throws(()=>ownReceiptIssuer(value.data,{tenantId:principal.tenant.id}),/municipio/);
 assert.equal(r.headers.get('content-type'),OWN_RUN_FULL_JSON+'; charset=utf-8');assert.equal(r.headers.get('x-municontrol-json-bytes'),String(bytes.length));assert.equal(a.stats.connections,0);assert.deepEqual(a.profiles[principal.tenant.id],issuer);assert.deepEqual(h.failures,[]);
});

for(const accept of [OWN_RUN_FULL_JSON,'application/json'])test('actual preview POST is observed once without request consumption or a business write: '+accept,async t=>{
 const expected=receiptPreview(),a=receiptApi(expected),previews=[],writes=[],h=await serverFor(t,a.handler,()=>({onPreview:p=>previews.push(p),onWrite:w=>writes.push(w),loseAcknowledgement:()=>{throw Error('A preview must not consume a dropped command ACK');}}));a.env.INTERNAL_APP_ORIGIN=h.origin;
 const body={operation:'preview',params:expected.snapshot.params},r=await fetch(h.origin+endpoint,post(h.origin,body,accept)),{bytes,value}=await packet(r);await h.settled();
 assert.equal(r.status,200);assert.deepEqual(value,{ok:true,data:expected});assert.deepEqual(previews,[expected.snapshot]);assert.deepEqual(writes,[]);assert.equal(previews[0].records.length,35);
 assert.equal(a.authorized[0].flowing,null);assert.equal(a.authorized[0].ownsBody,false);assert.equal(h.incoming[0].req.headers.accept,accept);assert.equal(a.calls.length,1);assert.match(a.calls[0].text,/own_receipt_preview/);assert.deepEqual(JSON.parse(a.calls[0].values[1]),expected.snapshot.params);
 assert.equal(r.headers.get('content-type'),accept===OWN_RUN_FULL_JSON?OWN_RUN_FULL_JSON+'; charset=utf-8':'application/json');assert.equal(r.headers.get('x-municontrol-json-bytes'),accept===OWN_RUN_FULL_JSON?String(bytes.length):null);assert.deepEqual(h.failures,[]);assert.equal(h.completed[0].observedPackets,1);
});

test('lost ACK is injected after observing the actual command; replay and attempt retain exact original body and key',async t=>{
 let replay=false,drop=true,lossCalls=0;const original=receiptEvent(),a=receiptApi(()=>({...original,replayed:replay})),writes=[],previews=[],h=await serverFor(t,a.handler,()=>({onPreview:p=>previews.push(p),onWrite:w=>writes.push(w),loseAcknowledgement:()=>{lossCalls++;if(!drop)return false;drop=false;return true;}}));a.env.INTERNAL_APP_ORIGIN=h.origin;
 const body={operation:'command',payload:receiptCommand()},first=await fetch(h.origin+endpoint,post(h.origin,body)),one=await packet(first);await h.settled();
 assert.equal(first.status,503);assert.deepEqual(one.value,{ok:false,error:'No se confirmó la respuesta del envío sintético.'});assert.equal(first.headers.get('content-type'),'application/json');assert.equal(first.headers.get('x-municontrol-json-bytes'),null);assert.equal(first.headers.get('content-length'),null);assert.equal(first.headers.get('idempotency-replayed'),null);
 assert.deepEqual(writes,[{key:uid(9),body:original.body,replayed:false}]);assert.equal(a.calls.length,1);assert.deepEqual(JSON.parse(a.calls[0].values[1]),original.body);
 replay=true;const second=await fetch(h.origin+endpoint,post(h.origin,body)),two=await packet(second);await h.settled();
 assert.equal(second.status,200);assert.equal(second.headers.get('idempotency-replayed'),'true');assert.equal(second.headers.get('content-type'),OWN_RUN_FULL_JSON+'; charset=utf-8');assert.equal(second.headers.get('x-municontrol-json-bytes'),String(two.bytes.length));assert.deepEqual(two.value.data,{...original,replayed:true});assert.deepEqual(writes[1],{key:uid(9),body:original.body,replayed:true});assert.deepEqual(a.calls[0].values,a.calls[1].values);
 const readback=await fetch(h.origin+endpoint+'?resource=attempt&key='+uid(9),{headers:{Accept:OWN_RUN_FULL_JSON}}),three=await packet(readback);await h.settled();
 assert.equal(readback.status,200);assert.deepEqual(three.value.data.body,original.body);assert.equal(writes.length,2);assert.equal(lossCalls,2);assert.deepEqual(previews,[]);assert.deepEqual(h.failures,[]);assert.equal(h.completed.length,3);
});

test('real authorization refusal remains 403 JSON and never consumes the request or becomes a recorded write',async t=>{
 let authorizations=0,connections=0;const env={},writes=[],handler=createOwnReceiptHandler({env,requireAccess:async(req,res)=>{authorizations++;assert.equal(req.readableFlowing,null);assert.equal(Object.hasOwn(req,'body'),false);res.status(403).json({ok:false,code:'SYNTHETIC_AUTHORITY_REFUSED'});return null;},getSql:async()=>{connections++;throw Error('Forbidden SQL recording');}}),h=await serverFor(t,handler,()=>({onWrite:w=>writes.push(w),loseAcknowledgement:()=>{throw Error('No success ACK exists');}}));
 env.INTERNAL_APP_ORIGIN=h.origin;const r=await fetch(h.origin+endpoint,post(h.origin,{operation:'command',payload:receiptCommand()})),value=await r.json();await h.settled();assert.equal(r.status,403);assert.deepEqual(value,{ok:false,code:'SYNTHETIC_AUTHORITY_REFUSED'});assert.equal(authorizations,1);assert.equal(connections,0);assert.deepEqual(writes,[]);assert.deepEqual(h.failures,[]);
});

test('fragmented UTF-8 JSON preserves bytes, write callbacks, end callback and real network backpressure',async t=>{
 const value={ok:true,data:{version:'synthetic-http-only',label:'Área cátedra — niño 😀',rows:Array.from({length:6000},(_,i)=>({index:i,amount:'10.0000',quantity:null,text:'camino sintético completo'}))}},bytes=Buffer.from(JSON.stringify(value)),cuts=[1,bytes.indexOf(Buffer.from('😀'))+1,65539,131077,bytes.length-1].filter((v,i,a)=>v>0&&v<bytes.length&&a.indexOf(v)===i).sort((a,b)=>a-b),parts=[];let at=0;for(const cut of cuts){parts.push(bytes.subarray(at,cut));at=cut;}parts.push(bytes.subarray(at));
 let callbacks=0,ended=0,capturedBackpressure=0;const h=await serverFor(t,async(_req,res)=>{res.status(200);res.setHeader('Content-Type',OWN_RUN_FULL_JSON+'; charset=utf-8');res.setHeader('X-MuniControl-JSON-Bytes',String(bytes.length));for(const chunk of parts.slice(0,-1)){if(!res.write(chunk,()=>callbacks++)){capturedBackpressure++;await once(res,'drain');}}res.end(parts.at(-1),()=>ended++);});
 const r=await fetch(h.origin+endpoint+'?resource=synthetic',{headers:{Accept:OWN_RUN_FULL_JSON}}),actual=Buffer.from(await r.arrayBuffer());await h.settled();assert.deepEqual(actual,bytes);assert.deepEqual(JSON.parse(actual.toString()),value);assert.equal(callbacks,parts.length-1);assert.equal(ended,1);assert.ok(capturedBackpressure>0);assert.ok(h.wireWrites.some(item=>!item.accepted));assert.ok(h.wireDrains.length>0);assert.equal(h.wireWrites.reduce((n,item)=>n+item.bytes,0),bytes.length);assert.equal(h.completed[0].retainedBytes,bytes.length);assert.equal(h.completed[0].deliveredBytes,bytes.length);assert.equal(h.completed[0].observedPackets,1);assert.deepEqual(h.failures,[]);
});

test('ordinary string encoding/callback signatures and end return the same native ServerResponse',async t=>{
 let writes=0,ends=0;const expected={ok:true,data:{label:'José cátedra',value:null}},h=await serverFor(t,async(_req,res)=>{assert.equal(res.status(202),res);res.setHeader('Content-Type','application/json');const json=JSON.stringify(expected),first=json.slice(0,19),last=json.slice(19);res.write(first,'utf8',()=>writes++);assert.equal(res.end(last,'utf8',()=>ends++),res);});
 const r=await fetch(h.origin+endpoint),value=await r.json();await h.settled();assert.equal(r.status,202);assert.deepEqual(value,expected);assert.equal(writes,1);assert.equal(ends,1);assert.deepEqual(h.failures,[]);
});

for(const [label,body,headers,pattern] of [
 ['oversize',JSON.stringify({ok:true,data:{version:'own-receipt-preview.v1',snapshot:{text:'x'.repeat(200)}}}),{},/RECEIPT_UI_RESPONSE_TOO_LARGE/],
 ['announced mismatch',JSON.stringify({ok:true}),{'X-MuniControl-JSON-Bytes':'999'},/RECEIPT_UI_BYTE_COUNT_MISMATCH/],
 ['invalid JSON','{"ok":true,',{},/JSON/],
 ['invalid UTF8',Buffer.from([123,34,120,34,58,34,255,34,125]),{},/encoded data|encoding/i]
])test('a '+label+' packet fails closed before any successful preview or write is observed',async t=>{
 const previews=[],writes=[],h=await serverFor(t,async(_req,res)=>{res.status(200);res.setHeader('Content-Type','application/json');for(const[k,v]of Object.entries(headers))res.setHeader(k,v);res.end(body);},()=>({maxBytes:128,onPreview:p=>previews.push(p),onWrite:w=>writes.push(w)}));
 await assert.rejects(fetch(h.origin+endpoint));await h.settled();assert.equal(h.failures.length,1);assert.match(h.failures[0].message,pattern);assert.deepEqual(previews,[]);assert.deepEqual(writes,[]);assert.deepEqual(h.completed,[]);
});

test('unfinished handler and observer exceptions remain failures rather than successful empty packets',async t=>{
 const unfinished=await serverFor(t,async()=>{});await assert.rejects(fetch(unfinished.origin+endpoint));await unfinished.settled();assert.match(unfinished.failures[0].message,/RECEIPT_UI_HANDLER_RESPONSE_UNFINISHED/);
 const original=Error('SYNTHETIC_OBSERVER_FAILURE'),h=await serverFor(t,async(_req,res)=>sendOwnPayrollStream(res,200,{version:'own-receipt-preview.v1',snapshot:{count:0}}),()=>({onPreview:()=>{throw original;}}));await assert.rejects(fetch(h.origin+endpoint));await h.settled();assert.equal(h.failures[0],original);assert.deepEqual(h.completed,[]);
});

test('response cap cannot be disabled or expanded above the negotiated public maximum',async t=>{
 for(const maxBytes of [0,-1,1.1,Infinity,OWN_RUN_FULL_MAX_BYTES+1]){const h=await serverFor(t,async(_req,res)=>res.json({ok:true}),()=>({maxBytes}));await assert.rejects(fetch(h.origin+endpoint));await h.settled();assert.match(h.failures[0].message,/RECEIPT_UI_RESPONSE_BOUND_REQUIRED/);}
});

test('the receipt UI verifier wires both response forms without changing Accept or the production request/handler',()=>{
 const source=fs.readFileSync(new URL('../scripts/verify-own-payroll-receipt-ui.mjs',import.meta.url),'utf8');
 assert.match(source,/import \{forwardReceiptUiQaHttp\} from '\.\/lib\/own-payroll-receipt-ui-http\.mjs'/);assert.match(source,/await forwardReceiptUiQaHttp\(req,res,handler,/);assert.match(source,/onPreview:snapshot=>previews\.push\(snapshot\)/);assert.match(source,/onWrite:record=>writes\.push\(record\)/);assert.match(source,/wrongIssuerScope:\(\)=>wrongIssuerScope/);assert.doesNotMatch(source,/res\.json=value=>|req\.headers\[['"]accept|req\.body\s*=/);
});
test('causal control: the old res.json-only fault is bypassed by the same real negotiated issuer stream',async t=>{
 const a=receiptApi();let oldJsonCalls=0;
 const oldStyle=async(req,res)=>{const json=res.json;res.json=value=>{oldJsonCalls++;if(value.ok&&value.data?.version==='own-receipt-issuer.v1')value={...value,data:{...value.data,scope:{tenantId:uid(999)}}};return json(value);};await a.handler(req,res);};
 const h=await serverFor(t,oldStyle);a.env.INTERNAL_APP_ORIGIN=h.origin;const response=await fetch(h.origin+endpoint+'?resource=issuer',{headers:{Accept:OWN_RUN_FULL_JSON}}),body=await response.json();await h.settled();
 assert.equal(oldJsonCalls,0,'The former negative never reached res.json');assert.equal(body.data.scope.tenantId,principal.tenant.id);assert.doesNotThrow(()=>ownReceiptIssuer(body.data,{tenantId:principal.tenant.id}));assert.deepEqual(h.failures,[]);
});

test('a bounded write callback receives its original failure exactly once and never emits a successful packet',async t=>{
 const callbacks=[],h=await serverFor(t,async(_req,res)=>{res.status(200);res.setHeader('Content-Type','application/json');await new Promise(resolve=>res.write(Buffer.alloc(200,120),error=>{callbacks.push(error);resolve();}));},()=>({maxBytes:128}));
 await assert.rejects(fetch(h.origin+endpoint));await h.settled();assert.equal(callbacks.length,1);assert.match(callbacks[0].message,/RECEIPT_UI_RESPONSE_TOO_LARGE/);assert.equal(h.failures.length,1);assert.equal(h.failures[0],callbacks[0]);assert.deepEqual(h.completed,[]);
});