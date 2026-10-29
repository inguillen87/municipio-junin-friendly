// Real loopback HTTP over the exact QA server response fragment. No SQL,
// browser, production handler or provider is invoked by these transport tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {once} from 'node:events';
import {sendOwnPayrollStream} from '../lib/own-payroll-response.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';

const source=fs.readFileSync(new URL('../scripts/lib/noelia-payroll-circuit-browser.mjs',import.meta.url),'utf8');
const filter="    if(req.method==='POST'&&req.headers['idempotency-key']){";
function responseFragment(text){
 const comment='     // Observe the complete real response after SQL, for both JSON and',tail='};await handlers[kind](req,res);return;}';
 assert.equal(text.split(comment).length,2,'QA response observer anchor must be unique');assert.equal(text.split(tail).length,2,'QA response dispatch anchor must be unique');
 const marker=text.indexOf(comment),start=text.lastIndexOf('\n    if(',marker)+1,end=text.indexOf(tail,marker);
 assert.ok(start>0&&end>start);return text.slice(start,end+2);
}
const fragment=responseFragment(source);
// Only the response adapter is evaluated, extracted byte-for-byte from the real
// browser server. It retains the same closure variables and native req/res.
function installer(text){return Function('assert','Buffer',`return function(req,res,kind,state){const writes=state.writes;let drop=state.drop;${text}\nreturn()=>{state.drop=drop;};};`)(assert,Buffer);}
const install=installer(fragment);
const key='88888888-8888-4888-8888-888888888888';
async function serving(t,handler,{observer=install,drop=false}={}){
 const state={writes:[],drop},requests=[],failures=[],tasks=[];
 const server=http.createServer(async(req,res)=>{requests.push({req,res});res.setHeader('Cache-Control','no-store');res.status=n=>{res.statusCode=n;return res;};const kind=new URL(req.url,'http://local.invalid').searchParams.get('kind');let finish;
  try{finish=observer(req,res,kind,state);const pending=Promise.resolve(handler(req,res,kind));tasks.push(pending);await pending;finish();}catch(error){failures.push(error);res.on('error',()=>{});res.destroy(error);}
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await Promise.allSettled(tasks);});
 return{state,requests,failures,origin:'http://127.0.0.1:'+server.address().port,settled:()=>Promise.allSettled([...tasks])};
}
const post=(accept=OWN_RUN_FULL_JSON,body={command:'confirm',reason:"O'Hara public. $1 $2; Área cátedra",quantity:null,amount:'10.0000'})=>({method:'POST',headers:{Accept:accept,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
async function bytesAndValue(response){const bytes=Buffer.from(await response.arrayBuffer());return{bytes,value:JSON.parse(bytes.toString('utf8'))};}

for(const type of ['full','json'])test('every real POST kind is observed exactly once in '+type+' mode, retaining wire bytes and original request',async t=>{
 const seen=[],h=await serving(t,async(req,res,kind)=>{assert.ok(req instanceof http.IncomingMessage&&res instanceof http.ServerResponse);assert.equal(req.readableFlowing,null);assert.equal(Object.hasOwn(req,'body'),false);const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));seen.push({req,res,body});const data={kind,key,body,replayed:false,recordCount:29,records:Array.from({length:29},(_,n)=>({n,amount:'10.0000',quantity:null}))};if(type==='full')await sendOwnPayrollStream(res,201,data);else res.status(201).json({ok:true,data});});
 const kinds=['run','liquidation','close','receipt','novelty','nativeEmployee','accounting','imputation','journal'];
 for(const kind of kinds){const r=await fetch(h.origin+'/api/qa?kind='+kind,post(type==='full'?OWN_RUN_FULL_JSON:'application/json')),packet=await bytesAndValue(r);await h.settled();
  assert.equal(r.status,201);assert.equal(r.headers.get('content-type'),type==='full'?OWN_RUN_FULL_JSON+'; charset=utf-8':'application/json');assert.equal(r.headers.get('x-municontrol-json-bytes'),type==='full'?String(packet.bytes.length):null);assert.equal(r.headers.get('content-length'),null);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(packet.value.data.kind,kind);assert.equal(packet.value.data.body.reason,"O'Hara public. $1 $2; Área cátedra");assert.equal(packet.value.data.records.length,29);
  const entry=h.state.writes.at(-1);assert.deepEqual(entry,{kind,key,receipt:packet.value.data,status:201});assert.equal(h.state.writes.length,kinds.indexOf(kind)+1);assert.equal(seen.at(-1).req,h.requests.at(-1).req);assert.equal(seen.at(-1).res,h.requests.at(-1).res);assert.equal(seen.at(-1).req.headers.accept,type==='full'?OWN_RUN_FULL_JSON:'application/json');
 }assert.deepEqual(h.failures,[]);
});

for(const type of ['full','json'])test('a lost '+type+' acknowledgement follows one persisted synthetic command; same-key replay remains exact',async t=>{
 const saved=new Map(),commands=[];let commits=0;const h=await serving(t,async(req,res,kind)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));commands.push({key:req.headers['idempotency-key'],body});const replayed=saved.has(req.headers['idempotency-key']);if(!replayed){saved.set(req.headers['idempotency-key'],structuredClone(body));commits++;}else assert.deepEqual(saved.get(req.headers['idempotency-key']),body);const data={kind,key:req.headers['idempotency-key'],body:saved.get(key),replayed};if(replayed)res.setHeader('Idempotency-Replayed','true');if(type==='full')await sendOwnPayrollStream(res,replayed?200:201,data);else res.status(replayed?200:201).json({ok:true,data});},{drop:true});
 const initial=await fetch(h.origin+'/api/qa?kind=liquidation',post(type==='full'?OWN_RUN_FULL_JSON:'application/json')),first=await bytesAndValue(initial);await h.settled();assert.equal(commits,1);assert.equal(initial.status,503);assert.deepEqual(first.value,{ok:false,error:'Respuesta sintética interrumpida después de conservar el lote.'});assert.equal(initial.headers.get('content-type'),'application/json');assert.equal(initial.headers.get('x-municontrol-json-bytes'),null);assert.equal(initial.headers.get('content-length'),null);assert.equal(h.state.drop,false);assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].kind,'liquidation');assert.equal(h.state.writes[0].status,201);assert.equal(h.state.writes[0].receipt.replayed,false);
 const replay=await fetch(h.origin+'/api/qa?kind=liquidation',post(type==='full'?OWN_RUN_FULL_JSON:'application/json')),second=await bytesAndValue(replay);await h.settled();assert.equal(commits,1);assert.equal(replay.status,200);assert.equal(replay.headers.get('idempotency-replayed'),'true');assert.deepEqual(second.value.data.body,commands[0].body);assert.equal(second.value.data.replayed,true);assert.deepEqual(commands[1],commands[0]);assert.equal(h.state.writes.length,2);assert.equal(h.state.writes[1].status,200);assert.equal(h.state.writes[1].receipt.replayed,true);assert.deepEqual(h.failures,[]);
});

test('errors, GETs and POSTs without an attempt key never count as a write or consume a pending loss',async t=>{
 const h=await serving(t,async(req,res)=>{const mode=new URL(req.url,'http://local.invalid').searchParams.get('mode'),ok=mode!=='error',data={attemptOnly:true};if(req.headers.accept===OWN_RUN_FULL_JSON&&ok)await sendOwnPayrollStream(res,200,data);else res.status(ok?200:403).json(ok?{ok:true,data}:{ok:false,code:'SYNTHETIC_FORBIDDEN'});},{drop:true});
 const requests=[{method:'GET',headers:{Accept:OWN_RUN_FULL_JSON,'Idempotency-Key':key}}, {method:'POST',headers:{Accept:OWN_RUN_FULL_JSON}},post(),{...post(),headers:{...post().headers,Accept:'application/json'}}];
 for(const [index,options]of requests.entries()){const response=await fetch(h.origin+'/api/qa?kind=liquidation&mode='+(index<2?'ok':'error'),options),packet=await bytesAndValue(response);await h.settled();assert.equal(response.status,index<2?200:403);assert.equal(packet.value.ok,index<2);assert.deepEqual(h.state.writes,[]);assert.equal(h.state.drop,true);}assert.deepEqual(h.failures,[]);
});

test('the complete fragmented response retains every byte and declared size rather than a partial or regenerated receipt',async t=>{
 const data={kind:'close',body:{reason:"Área public. $1 O'Hara"},replayed:false,padding:'á😀'.repeat(20000)},expected=Buffer.from(JSON.stringify({ok:true,data}));const h=await serving(t,async(_req,res)=>{res.status(201);res.setHeader('Content-Type',OWN_RUN_FULL_JSON+'; charset=utf-8');res.setHeader('X-MuniControl-JSON-Bytes',String(expected.length));for(let offset=0;offset<expected.length;offset+=1301)res.write(expected.subarray(offset,offset+1301));res.end();});
 const r=await fetch(h.origin+'/api/qa?kind=close',post()),packet=await bytesAndValue(r);await h.settled();assert.ok(expected.length>64*1024);assert.deepEqual(packet.bytes,expected);assert.equal(r.headers.get('x-municontrol-json-bytes'),String(expected.length));assert.equal(r.headers.get('content-type'),OWN_RUN_FULL_JSON+'; charset=utf-8');assert.deepEqual(h.state.writes,[{kind:'close',key,receipt:data,status:201}]);assert.deepEqual(h.failures,[]);
});

test('causal control: restoring only the former run-only filter loses the actual streamed liquidation observation',async t=>{
 assert.equal(fragment.split(filter).length,2);const old=installer(fragment.replace(filter,"    if(kind==='run'&&req.method==='POST'){")),h=await serving(t,async(_req,res)=>sendOwnPayrollStream(res,201,{kind:'liquidation',body:{command:'confirm'},replayed:false}),{observer:old,drop:true});
 const response=await fetch(h.origin+'/api/qa?kind=liquidation',post()),packet=await bytesAndValue(response);await h.settled();assert.equal(response.status,201);assert.equal(packet.value.data.kind,'liquidation');assert.deepEqual(h.state.writes,[]);assert.equal(h.state.drop,true);assert.deepEqual(h.failures,[]);
});

test('the JSON path only serializes and the post observer retains its original 32MiB bound and restoration',()=>{
 assert.equal(fragment.split('writes.push(').length,2);assert.equal(fragment.split('if(drop)').length,2);assert.match(fragment,/bytes<=33554432,'QA_RESPONSE_TOO_LARGE'/);assert.match(fragment,/res.write=write;res.end=end/);const json=fragment.slice(fragment.indexOf('    res.json=value=>{'));assert.doesNotMatch(json,/writes\.push|if\(drop\)|kind!=='run'/);assert.match(json,/res.setHeader\('Content-Type','application\/json'\);res.end\(JSON.stringify\(value\)\);return res;/);
});