import test from 'node:test';
import assert from 'node:assert/strict';
import { createClockSourceIngestHandler } from '../api/clock-source-ingest.js';
import { createInternalClockSourceHandler } from '../api/internal-clock-source.js';
import { assertSourceFleet, assertSourceReceipt, sourceBindingCoordinates, sourceHash, sourceTimestamp, validateSourcePayload } from '../lib/clock-source-contract.js';
import { getClockSourceSql, readClockSourceFleet, receiveClockSource, sourceConnectionConfig } from '../lib/clock-source-store.js';
import { readSourceBody } from '../lib/clock-source-http.js';
import { sourceCoreInventory } from '../lib/clock-source-core.js';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { PassThrough, Readable } from 'node:stream';

const tenantId='00000000-0000-4000-8000-000000000001', deviceId='00000000-0000-4000-8000-000000000002', siteId='00000000-0000-4000-8000-000000000003';
const at='2026-09-21T12:00:00.123456Z';
function payload() {
  const bytes=Buffer.alloc(40,7), recordsSha256=sourceHash(bytes), snapshotSha256=sourceHash('synthetic snapshot');
  return {version:'zk40-delivery.v1',serial:'SYNTHETIC-001',batchId:sourceHash(snapshotSha256+':'+recordsSha256),snapshotSha256,recordsSha256,snapshotRecordCount:1,totalRecords:1,partStart:0,capturedAt:'2026-09-20T12:00:00.123Z',partSha256:recordsSha256,ordinals:[1],recordsBase64:bytes.toString('base64')};
}
function receipt(p=payload()) { return {version:'clock-source-receipt.v1',receiptId:siteId,tenantId,serial:p.serial,batchId:p.batchId,partStart:p.partStart,partSha256:p.partSha256,snapshotSha256:p.snapshotSha256,recordsSha256:p.recordsSha256,count:p.ordinals.length,receivedAt:at,persisted:true,scope:'source_only',payrollModified:false,replayed:false}; }
function access() { return {mode:'managed',principal:{user:{email:'synthetic@example.invalid',identityVersion:1},tenant:{id:tenantId,membershipId:siteId,source:'membership',effectiveCapabilities:['attendance.read'],sourceBindings:[{system:'GRH',database:'grh-synthetic',companyId:1,verified:true}]}},session:{id:siteId,version:1}}; }
function core() { return {checkedAt:at,devices:[{deviceId,siteKey:'synthetic-site',label:'Punto sintético',model:'PM10',deviceState:'active'}]}; }
function fleet() { return {version:'clock-source-fleet.v1',checkedAt:at,...sourceBindingCoordinates(access().principal),revision:'a'.repeat(64),devices:[{deviceId,siteId,enrolled:true,enabled:true,receipts:1,recordsPersisted:1,completedBatches:1,pendingBatches:0,lastReceivedAt:at,lastCapturedAt:'2026-09-20T12:00:00.123Z'}],scope:'source_only',reconciliationState:'pending',payrollModified:false}; }
function response() { return {headers:{},statusCode:null,body:null,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}}; }
function post(extra={}) { return {method:'POST',url:'/api/clock-source-ingest',headers:{authorization:'Bearer '+ 's'.repeat(43),'x-clock-connector':'synthetic-connector','content-type':'application/json'},body:JSON.stringify(payload()),...extra}; }
function get(extra={}) { return {method:'GET',url:'/api/internal-clock-source',headers:{},...extra}; }
function devices() { return {resource:'device',data:[{id:deviceId,siteId,version:1,driverKey:'zk40-snapshot.v1',model:'PM10',status:'active'}],pagination:{page:1,pageSize:100,total:1,pages:1}}; }
function readerDeps(extra={}) { return {env:{},authorize:async()=>access(),sessionFor:a=>a.session,getCoreSql:async()=>({}),getSourceSql:async()=>({}),getFleet:async()=>core(),readFleet:async()=>fleet(),readDevices:async()=>devices(),...extra}; }
async function run(handler,req) { const res=response();await handler(req,res);return res; }
function sourceEnv(kind='writer') { return {[kind==='writer'?'CLOCK_SOURCE_WRITER_DATABASE_URL':'CLOCK_SOURCE_READER_DATABASE_URL']:`postgresql://${kind==='writer'?'clocks_source_ingest_app':'clocks_source_reader_app'}:synthetic-password@ep-synthetic.us-east-2.aws.neon.tech/municontrol_clocks?sslmode=require`}; }

test('binding fingerprint is canonical, ordered and does not expose its tuple',()=>{
  const p=access().principal, expected=sourceHash(JSON.stringify({version:'clock-source-binding.v1',tenantId,system:'GRH',database:'grh-synthetic',companyId:1}));
  assert.deepEqual(sourceBindingCoordinates(p),{tenantId,sourceBindingSha256:expected});
  p.tenant.sourceBindings[0].companyId='1';assert.equal(sourceBindingCoordinates(p).sourceBindingSha256,expected);
  p.tenant.sourceBindings.push({...p.tenant.sourceBindings[0]});assert.throws(()=>sourceBindingCoordinates(p),/Cambió/);
});
test('binding rejects incomplete, unverified or imprecise scope',()=>{
  for (const change of [p=>p.tenant.sourceBindings[0].verified=false,p=>p.tenant.sourceBindings[0].companyId='01',p=>p.tenant.sourceBindings[0].companyId=Number.MAX_SAFE_INTEGER+1,p=>p.tenant.id='bad',p=>p.tenant.sourceBindings[0].database='x\n']) {const p=access().principal;change(p);assert.throws(()=>sourceBindingCoordinates(p));}
});
test('source payload retains exact bytes, hashes and ordinal constraints',()=>{
  assert.equal(validateSourcePayload(payload()).ordinals[0],1);
  for (const mutation of [{tenantId},{recordsBase64:Buffer.alloc(40).toString('base64')},{ordinals:[0]},{capturedAt:'2026-02-30T00:00:00.000Z'},{recordsSha256:'f'.repeat(64)},{totalRecords:0},{partStart:1}]) assert.throws(()=>validateSourcePayload({...payload(),...mutation}));
});
test('timestamps preserve microseconds and reject calendar normalization',()=>{assert.equal(sourceTimestamp(at),true);assert.equal(sourceTimestamp('2026-02-30T12:00:00.123456Z'),false);assert.equal(sourceTimestamp('2026-09-21 12:00:00'),false);});
test('strict source ACK accepts replay and rejects canonical or exchanged receipts',()=>{
  assert.equal(assertSourceReceipt({...receipt(),replayed:true},payload()).replayed,true);
  for (const mutation of [{version:'zk40-receipt.v1'},{serial:'OTHER-001'},{recordsSha256:'d'.repeat(64)},{newCanonical:1},{count:2},{persisted:false},{payrollModified:true},{tenantId:'bad'},{receivedAt:'2026-02-30T00:00:00.123Z'}]) assert.throws(()=>assertSourceReceipt({...receipt(),...mutation},payload()));
});
test('receive waits for commit and emits no success after commit failure',async()=>{
  let release, committed=false;
  const pending=receiveClockSource({transaction:async(fn,opts)=>{assert.equal(opts.isolationLevel,'ReadCommitted');const [q]=fn({query:(text,args)=>({text,args})});assert.match(q.text,/clock_source.receive_v1/);assert.equal(q.args[1],'h'.repeat(64));await new Promise(resolve=>release=resolve);committed=true;return [[{result:receipt()}]];}},'synthetic-connector','h'.repeat(64),payload());
  let resolved=false;pending.then(()=>resolved=true);await Promise.resolve();assert.equal(resolved,false);release();assert.equal((await pending).persisted,true);assert.equal(committed,true);
  await assert.rejects(receiveClockSource({transaction:async()=>{throw Error('COMMIT failed synthetic-secret');}},'connector','h',payload()),e=>e.code==='CLOCK_SOURCE_UNAVAILABLE'&&!e.message.includes('secret'));
});
test('ingest hashes bearer, never passes token or client scope, and acknowledges replay',async()=>{
  let args;
  const r=await run(createClockSourceIngestHandler({getSql:async(_,kind)=>{assert.equal(kind,'writer');return {};},receive:async(...v)=>{args=v;return {...receipt(),replayed:true};}}),post());
  assert.equal(r.statusCode,200);assert.equal(r.headers['Idempotency-Replayed'],'true');assert.equal(args[2],sourceHash('s'.repeat(43)));assert.equal(r.body.receipt.scope,'source_only');assert.doesNotMatch(JSON.stringify(r.body),/ssssss/);
});
test('ingest rejects wrong transport before connecting',async()=>{
  for (const req of [post({method:'GET'}),post({url:'/api/clock-source-ingest?tenantId=x'}),post({url:'/api/clock-source-ingest#x'}),post({url:'https://evil.invalid/api/clock-source-ingest'}),post({query:{tenantId}}),post({headers:{...post().headers,origin:'https://municipio-junin-friendly.vercel.app'}}),post({headers:{...post().headers,'transfer-encoding':'chunked'}}),post({headers:{...post().headers,authorization:['Bearer x']}}),post({rawHeaders:['Authorization','one','authorization','two']}),post({headers:{...post().headers,'content-length':'40001'}})]) {
    const r=await run(createClockSourceIngestHandler({getSql:async()=>assert.fail('must not connect')}),req);assert.notEqual(r.statusCode,200);assert.equal(r.body.ok,false);
  }
});
test('wire parser rejects duplicate escaped keys, object bypass, bad UTF8 and large streams',async()=>{
  for (const body of ['{"serial":"a","ser\\u0069al":"b"}',payload(),Buffer.from([0xff]),'x'.repeat(40001)]) await assert.rejects(readSourceBody({body}));
  const stream={async *[Symbol.asyncIterator](){yield Buffer.alloc(20001);yield Buffer.alloc(20000);}};await assert.rejects(readSourceBody(stream),e=>e.code==='CLOCK_SOURCE_BODY_TOO_LARGE');
  assert.deepEqual(await readSourceBody({body:JSON.stringify(payload())}),payload());
});
// Reproduce @vercel/node's real boundary: an already-consumed IncomingMessage,
// restored raw PassThrough data/end events, and a lazy JSON.parse body getter.
// https://github.com/vercel/vercel/blob/main/packages/node/src/serverless-functions/helpers.ts
async function vercelRequest(bytes,{bodyGetter,contentLength=bytes.length}={}) {
  const req=new IncomingMessage(new Socket());Object.assign(req,{method:'POST',url:'/api/clock-source-ingest',headers:{...post().headers,'content-length':String(contentLength)},complete:true});
  req.push(bytes);req.push(null);for await(const unused of req)void unused;
  const restored=new PassThrough(),originalOn=req.on.bind(req);let getterReads=0;
  req.read=restored.read.bind(restored);
  req.on=req.addListener=(event,listener)=>['data','end'].includes(event)?restored.on(event,listener):originalOn(event,listener);
  restored.end(bytes);
  Object.defineProperty(req,'body',{configurable:true,enumerable:true,get(){getterReads++;return bodyGetter?bodyGetter():JSON.parse(bytes.toString('utf8'));}});
  return {req,restored,getterReads:()=>getterReads};
}
test('Vercel restored bytes reach ingest without evaluating the parsed body getter',async()=>{
  const p=payload(),runtime=await vercelRequest(Buffer.from(JSON.stringify(p)),{bodyGetter:()=>{throw Error('getter must never run');}});let writes=0;
  assert.equal(runtime.req.readableEnded,true);
  const r=await run(createClockSourceIngestHandler({getSql:async()=>({}),receive:async(_sql,_key,_hash,body)=>{writes++;assert.deepEqual(body,p);return receipt(p);}}),runtime.req);
  assert.equal(r.statusCode,200);assert.equal(writes,1);assert.equal(runtime.getterReads(),0);
  assert.equal(runtime.restored.listenerCount('data'),0);assert.equal(runtime.restored.listenerCount('end'),0);
});
test('Vercel restored duplicates and invalid UTF8 cannot be hidden by a valid parsed object',async()=>{
  const valid=JSON.stringify(payload());
  for(const bytes of [Buffer.from(valid.replace('{','{"ser\\u0069al":"SYNTHETIC-001",')),Buffer.concat([Buffer.from(valid.slice(0,-1)+',"ignored":"'),Buffer.from([0xff]),Buffer.from('"}')])]){
    const runtime=await vercelRequest(bytes,{bodyGetter:payload});
    const r=await run(createClockSourceIngestHandler({getSql:async()=>assert.fail('raw rejection precedes SQL')}),runtime.req);
    assert.equal(r.statusCode,400);assert.equal(r.body.code,'CLOCK_SOURCE_PAYLOAD_INVALID');assert.equal(runtime.getterReads(),0);
  }
});
test('restored and ordinary raw streams retain the 40KB boundary and exact declared length',async()=>{
  const valid=JSON.stringify(payload()),boundary=Buffer.from(valid+' '.repeat(40000-Buffer.byteLength(valid)));
  assert.deepEqual(await readSourceBody(Readable.from([boundary.subarray(0,100),boundary.subarray(100)])),payload());
  const large=await vercelRequest(Buffer.concat([boundary,Buffer.from(' ')]));
  await assert.rejects(readSourceBody(large.req),e=>e.code==='CLOCK_SOURCE_BODY_TOO_LARGE');assert.equal(large.getterReads(),0);
  for(const declared of [boundary.length-1,boundary.length+1]){
    const wrong=await vercelRequest(boundary,{contentLength:declared});await assert.rejects(readSourceBody(wrong.req),e=>e.code==='CLOCK_SOURCE_PAYLOAD_INVALID');
  }
});
test('a getter or already parsed object without raw stream cannot bypass wire validation',async()=>{
  let calls=0;const req={};Object.defineProperty(req,'body',{get(){calls++;return payload();}});
  await assert.rejects(readSourceBody(req),e=>e.code==='CLOCK_SOURCE_PAYLOAD_INVALID');assert.equal(calls,0);
  await assert.rejects(readSourceBody({body:payload()}),e=>e.code==='CLOCK_SOURCE_PAYLOAD_INVALID');
});
test('premature abort, close, transport error and timeout fail closed and remove stream listeners',async()=>{
  for(const event of ['aborted','close','error','timeout']){
    const req=new PassThrough(),pending=readSourceBody(req,{timeoutMs:20});
    if(event!=='timeout')queueMicrotask(()=>req.emit(event,...(event==='error'?[Error('private transport details')]:[])));
    await assert.rejects(pending,e=>e.code==='CLOCK_SOURCE_UNAVAILABLE'&&!e.message.includes('private'));
    for(const name of ['data','end','error','aborted','close'])assert.equal(req.listenerCount(name),0);
    req.destroy();
  }
});
test('incomplete transfer cannot acknowledge or connect to SQL',async()=>{
  for(const event of ['aborted','error']){
    const req=new PassThrough();Object.assign(req,{method:'POST',url:'/api/clock-source-ingest',headers:post().headers});
    const pending=run(createClockSourceIngestHandler({getSql:async()=>assert.fail('incomplete body must not connect')}),req);
    req.write(Buffer.from('{"version":'));queueMicrotask(()=>req.emit(event,...(event==='error'?[Error('secret transport')]:[])));
    const r=await pending;assert.equal(r.statusCode,503);assert.equal(r.body.ok,false);assert.equal(r.body.receipt,undefined);req.destroy();
  }
});
test('unknown provider errors are redacted and unavailable does not imply no records',async()=>{
  const r=await run(createClockSourceIngestHandler({getSql:async()=>{throw Error('postgresql://secret@private.invalid payload=PII');}}),post());
  assert.equal(r.statusCode,503);assert.deepEqual(Object.keys(r.body).sort(),['code','error','ok']);assert.doesNotMatch(JSON.stringify(r.body),/secret|private|PII/);
});
test('known SQL errors keep retry/permanent meaning without provider details',async()=>{
  for (const [code,status] of [['CLOCK_SOURCE_BUSY',409],['CLOCK_SOURCE_AUTH_DENIED',401],['CLOCK_SOURCE_CAPACITY_LIMIT',503],['CLOCK_SOURCE_IDEMPOTENCY_CONFLICT',409],['CLOCK_SOURCE_BATCH_INTEGRITY_INVALID',409]]) {
    const r=await run(createClockSourceIngestHandler({getSql:async()=>({}),receive:async()=>{throw Error(code+' private detail');}}),post());assert.equal(r.statusCode,status);assert.equal(r.body.code,code);assert.doesNotMatch(r.body.error,/private/);if(code.endsWith('BUSY'))assert.equal(r.headers['Retry-After'],'900');
  }
});
test('unconfigured dedicated connection never falls back to core',async()=>{
  assert.throws(()=>sourceConnectionConfig({DATABASE_URL:'postgresql://secret@core/database'},'writer'),e=>e.code==='CLOCK_SOURCE_NOT_CONFIGURED');
  const r=await run(createClockSourceIngestHandler({env:{}}),post());assert.equal(r.statusCode,503);assert.equal(r.body.code,'CLOCK_SOURCE_NOT_CONFIGURED');
});
test('source connection enforces dedicated database, scoped login and TLS',()=>{
  assert.equal(sourceConnectionConfig(sourceEnv(),'writer').login,'clocks_source_ingest_app');
  for (const value of [sourceEnv().CLOCK_SOURCE_WRITER_DATABASE_URL.replace('municontrol_clocks','municipal'),sourceEnv().CLOCK_SOURCE_WRITER_DATABASE_URL.replace('clocks_source_ingest_app','owner'),sourceEnv().CLOCK_SOURCE_WRITER_DATABASE_URL.replace('?sslmode=require',''),sourceEnv().CLOCK_SOURCE_WRITER_DATABASE_URL+'&options=-c%20role=owner',sourceEnv().CLOCK_SOURCE_WRITER_DATABASE_URL+'&sslmode=require',sourceEnv().CLOCK_SOURCE_WRITER_DATABASE_URL.replace('.neon.tech','.invalid')]) assert.throws(()=>sourceConnectionConfig({CLOCK_SOURCE_WRITER_DATABASE_URL:value},'writer'));
  const env=sourceEnv();env.ACTIONS_DATABASE_URL=env.CLOCK_SOURCE_WRITER_DATABASE_URL.replace('clocks_source_ingest_app','different');assert.throws(()=>sourceConnectionConfig(env,'writer'));
});
test('source connection verifies effective login privileges each call',async()=>{
  const valid={database:'municontrol_clocks',current_user:'clocks_source_ingest_app',session_user:'clocks_source_ingest_app',safe_login:true,no_table_access:true,roles:['clocks_source_runtime'],can_receive:true,can_read:false};
  let calls=0;const sql={query:async()=>{calls++;return [valid];}};await getClockSourceSql(sourceEnv(),'writer',{neon:()=>sql});await getClockSourceSql(sourceEnv(),'writer',{neon:()=>sql});assert.equal(calls,2);
  for (const mutation of [{roles:['clocks_source_runtime','other']},{no_table_access:false},{safe_login:false},{session_user:'owner'},{database:'other'},{can_read:true},{can_receive:false}]) await assert.rejects(getClockSourceSql(sourceEnv(),'writer',{neon:()=>({query:async()=>[{...valid,...mutation}]})}));
});
test('source reader uses read-only snapshot and strictly authorized IDs',async()=>{
  const coordinates=sourceBindingCoordinates(access().principal);let parameters;
  const result=await readClockSourceFleet({transaction:async(fn,opts)=>{assert.equal(opts.readOnly,true);assert.equal(opts.isolationLevel,'RepeatableRead');fn({query:(_,values)=>{parameters=values;}});return [[{result:fleet()}]];}},coordinates,[deviceId]);
  assert.deepEqual(parameters,[tenantId,[deviceId],coordinates.sourceBindingSha256,null]);assert.equal(result.devices.length,1);
});
test('source fleet rejects scope, unexpected IDs, duplicate rows and unknown members',()=>{
  const coordinates=sourceBindingCoordinates(access().principal);assert.equal(assertSourceFleet(fleet(),coordinates,[deviceId]).scope,'source_only');
  for (const change of [f=>f.tenantId=siteId,f=>f.devices[0].deviceId=siteId,f=>f.devices.push({...f.devices[0]}),f=>f.devices[0].raw='sensitive',f=>f.devices[0].lastReceivedAt=null,f=>f.devices[0].recordsPersisted=0,f=>f.sourceBindingSha256='b'.repeat(64)]) {const f=fleet();change(f);assert.throws(()=>assertSourceFleet(f,coordinates,[deviceId]));}
});
test('private response composes source evidence with current core labels only',async()=>{
  let auth=0,coreReads=0;
  const r=await run(createInternalClockSourceHandler(readerDeps({authorize:async()=>{auth++;return access();},getFleet:async()=>{coreReads++;return core();}})),get());
  assert.equal(r.statusCode,200);assert.equal(auth,2);assert.equal(coreReads,2);assert.equal(r.body.snapshotConsistency,'composed_revalidated');assert.equal(r.body.devices[0].label,'Punto sintético');assert.equal(r.body.payrollModified,false);assert.equal(r.body.liveConnectionVerified,false);assert.equal(r.body.tenantId,undefined);assert.equal(r.headers['Cache-Control'],'private, no-store, max-age=0');
});
test('private read never forwards caller-supplied tenant, inventory or revision',async()=>{
  for (const req of [get({url:'/api/internal-clock-source?tenantId=x'}),get({query:{deviceIds:deviceId}}),get({body:{}}),get({headers:{origin:'https://evil.invalid'}}),get({headers:{'sec-fetch-site':'cross-site'}}),get({method:'POST'})]) {
    const r=await run(createInternalClockSourceHandler(readerDeps({authorize:async()=>assert.fail('no auth required for malformed')})),req);assert.notEqual(r.statusCode,200);
  }
});
test('revocation after source read scrubs complete private response',async()=>{
  let reads=0;
  const r=await run(createInternalClockSourceHandler(readerDeps({authorize:async()=>{const a=access();if(++reads===2)a.principal.tenant.effectiveCapabilities=[];return a;}})),get());
  assert.equal(r.statusCode,403);assert.equal(r.body.devices,undefined);assert.doesNotMatch(JSON.stringify(r.body),/Punto|recordsPersisted|revision/);
});
test('post-read session expiration uses authorization response without disclosure',async()=>{
  let reads=0;
  const r=await run(createInternalClockSourceHandler(readerDeps({authorize:async(_,res)=>{if(++reads===2){res.status(401).json({ok:false,code:'SESSION_EXPIRED'});return null;}return access();}})),get());
  assert.equal(r.statusCode,401);assert.equal(r.body.devices,undefined);
});
test('changed actor, membership, session or certified binding blocks disclosure',async()=>{
  for (const mutate of [a=>a.principal.user.email='other@example.invalid',a=>a.principal.tenant.membershipId=deviceId,a=>a.session.version=2,a=>a.principal.tenant.sourceBindings[0].database='other']) {
    let reads=0;const r=await run(createInternalClockSourceHandler(readerDeps({authorize:async()=>{const a=access();if(++reads===2)mutate(a);return a;}})),get());assert.equal(r.statusCode,409);assert.equal(r.body.devices,undefined);
  }
});
test('core inventory changes block disclosure; receipt-only activity does not',async()=>{
  let reads=0;const r=await run(createInternalClockSourceHandler(readerDeps({getFleet:async()=>{const c=core();if(++reads===2)c.devices=[];return c;}})),get());assert.equal(r.statusCode,409);assert.equal(r.body.code,'CLOCK_SOURCE_SNAPSHOT_CHANGED');
  const okay=await run(createInternalClockSourceHandler(readerDeps({getFleet:async()=>({...core(),recordsConfirmed:Math.random()})})),get());assert.equal(okay.statusCode,200);
});
test('unavailable source fails closed instead of fabricating zeros',async()=>{
  const r=await run(createInternalClockSourceHandler(readerDeps({readFleet:async()=>{throw Error('database timeout with private info');}})),get());assert.equal(r.statusCode,503);assert.equal(r.body.devices,undefined);assert.doesNotMatch(r.body.error,/private/);
});
test('unenrolled inventory is explicit and empty inventory cannot mean all tenant devices',async()=>{
  const f=fleet();f.devices[0]={deviceId,siteId:null,enrolled:false,enabled:false,receipts:0,recordsPersisted:0,completedBatches:0,pendingBatches:0,lastReceivedAt:null,lastCapturedAt:null};
  const r=await run(createInternalClockSourceHandler(readerDeps({readFleet:async()=>f})),get());assert.equal(r.statusCode,200);assert.equal(r.body.devices[0].enrolled,false);
  const e=await run(createInternalClockSourceHandler(readerDeps({getFleet:async()=>({...core(),devices:[]}),readFleet:async(_,coordinates,ids)=>{assert.deepEqual(ids,[]);return {...fleet(),devices:[]};}})),get());assert.equal(e.statusCode,200);assert.deepEqual(e.body.devices,[]);
});
test('final response is validated even when source adapter returns extra private fields',async()=>{
  const f=fleet();f.devices[0].serial='sensitive';const r=await run(createInternalClockSourceHandler(readerDeps({readFleet:async()=>f})),get());assert.equal(r.statusCode,502);assert.equal(r.body.devices,undefined);
});
test('ingest refuses mismatched ACK even from an injected transport adapter',async()=>{
  const r=await run(createClockSourceIngestHandler({getSql:async()=>({}),receive:async()=>({...receipt(),serial:'OTHER-001'})}),post());assert.equal(r.statusCode,502);assert.equal(r.body.receipt,undefined);
});
test('source reader scoped connection cannot receive and cannot read tables',async()=>{
  const valid={database:'municontrol_clocks',current_user:'clocks_source_reader_app',session_user:'clocks_source_reader_app',safe_login:true,no_table_access:true,roles:['clocks_source_reader'],can_receive:false,can_read:true};
  await getClockSourceSql(sourceEnv('reader'),'reader',{neon:()=>({query:async()=>[valid]})});
  for (const mutation of [{can_receive:true},{can_read:false},{roles:['clocks_source_runtime']}]) await assert.rejects(getClockSourceSql(sourceEnv('reader'),'reader',{neon:()=>({query:async()=>[{...valid,...mutation}]})}));
});
test('source site must still match governed device site, including stable device ID',async()=>{
  const r=await run(createInternalClockSourceHandler(readerDeps({readDevices:async()=>{const d=devices();d.data[0].siteId=tenantId;return d;}})),get());assert.equal(r.statusCode,409);assert.equal(r.body.code,'CLOCK_SOURCE_BINDING_CHANGED');assert.equal(r.body.devices,undefined);
});
test('site or device version change after source read invalidates composed snapshot',async()=>{
  for (const mutate of [row=>row.siteId=tenantId,row=>row.version=2]) {
    let reads=0;const r=await run(createInternalClockSourceHandler(readerDeps({readDevices:async()=>{const d=devices();if(++reads===2)mutate(d.data[0]);return d;}})),get());assert.equal(r.statusCode,409);assert.equal(r.body.devices,undefined);
  }
});
test('governed inventory facade stays bounded and strips optional network fields',async()=>{
  const d=devices();Object.assign(d.data[0],{serialNumber:'sensitive',networkHost:'private',networkPort:4370});
  const result=await sourceCoreInventory({},access().principal,{},core(),async(_,__,q)=>{assert.deepEqual(q,{resource:'device',page:1,pageSize:100});return d;});assert.doesNotMatch(JSON.stringify(result),/sensitive|private|4370/);
  for (const mutate of [v=>v.pagination.total=201,v=>v.data[0].siteId=null,v=>v.data=[],v=>v.data.push(v.data[0]),v=>v.data[0].driverKey='other',v=>v.data[0].version=0]) {const v=devices();mutate(v);await assert.rejects(sourceCoreInventory({},access().principal,{},core(),async()=>v));}
});
