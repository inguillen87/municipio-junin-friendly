import test from 'node:test';
import assert from 'node:assert/strict';
import {createCajasApiClient} from '../assets/own-cajas-api-client.js';
import {createCajasControl} from '../assets/own-cajas-control-factory.js';
import {syntheticApi,fixtureInput,fixtureScope} from './fixtures/own-cajas-fixture-api.js';
test('complete GET source counts actual UTF8 wire across auth, detail, receipts and both bookends',async()=>{
 const fake=syntheticApi();fake.state.prefix=' \n';
 const client=createCajasApiClient(fake),loaded=await client.load(fake.input.query);
 assert.equal(loaded.completeBundleVerified,true);assert.equal(loaded.historicalCoverageVerified,false);
 assert.equal(loaded.bytesRead,fake.state.bytes);assert.equal(fake.state.calls.length,6);
 assert.equal(fake.state.authReads,2);assert.equal(fake.state.detailReads,2);assert.equal(fake.state.groupReads,2);
 assert.equal(loaded.bundle.employees.length,4);
 assert.deepEqual([...new Set(loaded.conceptChoices.filter(c=>c.financial).map(c=>c.code))].sort(),['100','110','120','210','310']);
 assert.ok(Object.isFrozen(loaded.input.receipts[0].snapshot.concepts));
});
test('historical inactive rejects before even authentication and cannot fall back to operative detail',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);
 await assert.rejects(client.load(fake.input.query,{mode:'history'}),error=>error.code==='CAJAS_HISTORY_INACTIVE');
 assert.equal(fake.state.calls.length,0);
});
test('query does not accept caller jurisdiction/filter or a multimonth substitute',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);
 await assert.rejects(client.load({...fake.input.query,jurisdiction:'55'}));
 await assert.rejects(client.load({...fake.input.query,to:'2026-09'}),error=>error.code==='CAJAS_SINGLE_PERIOD_REQUIRED');
 assert.equal(fake.state.calls.length,0);
});
test('bookend binds receipt id/key/body/snapshot/time even when census versions stay unchanged',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);
 fake.state.mutate=({payload,params,state})=>{
  if(params.resource==='group'&&state.groupReads===2)payload.data.key='00000000-0000-4000-8000-000000000099';
 };
 await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_SOURCE_CHANGED');
});
test('census state drift in its bookend rejects the whole source',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);
 const before=fake.input.details[0].stateVersion;
 const fresh=(before[0]==='f'?'0':'f')+before.slice(1);
 assert.match(fresh,/^[a-f0-9]{64}$/);
 assert.notEqual(before,fresh,'The fixture must inject an actual census state change');
 fake.state.mutate=({payload,params,state})=>{
  if(params.resource==='detail'&&state.detailReads===2){
   assert.equal(payload.data.stateVersion,before);
   payload.data.stateVersion=fresh;
  }
 };
 await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_SOURCE_CHANGED');
});
test('second authenticated identity cannot mint or keep a source',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);
 fake.state.mutate=({payload,path,state})=>{if(path==='/api/internal-auth'&&state.authReads===2)payload.user.id='synthetic-other';};
 await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_SESSION_CHANGED');
});
test('malformed receipt outside a later selected jurisdiction is never hidden',async()=>{
 const fake=syntheticApi('all');fake.input.receipts[0].snapshot.concepts.at(-1).amount='0.001';
 const client=createCajasApiClient(fake);
 await assert.rejects(client.load(fake.input.query));
});
test('explicit own concepts are validated against the whole bundle before source filtering',async()=>{
 const model=createCajasControl(),input=fixtureInput('55');
 const value=await model.prepareOwn(input,fixtureScope(['210']));
 assert.deepEqual(value.concepts.map(row=>row.conceptCode),['210']);
 await assert.rejects(model.prepareOwn(input,fixtureScope([])),/CONCEPT_SCOPE_REQUIRED/);
 await assert.rejects(model.prepareOwn(input,fixtureScope(['999999'])),/CONCEPT_SCOPE_UNAVAILABLE/);
 const damaged=fixtureInput('55');damaged.receipts[0].snapshot.concepts.find(row=>row.conceptCode==='100').amount='0.001';
 await assert.rejects(model.prepareOwn(damaged,fixtureScope(['210'])));
});
test('retirement rejects clones and a genuine but retired source for revalidation',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake),loaded=await client.load(fake.input.query);
 await assert.rejects(client.revalidate(structuredClone(loaded)),error=>error.code==='CAJAS_SOURCE_PRODUCER_REQUIRED');
 client.retire();assert.equal(client.owns(loaded),false);
 await assert.rejects(client.revalidate(loaded),error=>error.code==='CAJAS_SOURCE_PRODUCER_REQUIRED');
});
test('pending source cannot revive after retirement even when the response later resolves',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);let release;
 fake.state.delay=()=>new Promise(resolve=>{release=resolve;});
 const pending=client.load(fake.input.query);
 await new Promise(resolve=>setTimeout(resolve,0));client.retire();release();
 await assert.rejects(pending,error=>error.name==='AbortError');
});
test('wire limit stops oversized response before parsing and no subsequent query runs',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);
 fake.state.prefix=' '.repeat(64*1024);
 await assert.rejects(client.load(fake.input.query),/capacidad/);
 assert.equal(fake.state.calls.length,1);
});
test('auth failure is actionable and retry performs a new whole read without a refresh',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);fake.state.denied=401;
 await assert.rejects(client.load(fake.input.query),error=>error.status===401);
 fake.state.denied=0;const source=await client.load(fake.input.query);
 assert.equal(source.completeBundleVerified,true);assert.equal(fake.state.groupReads,2);
});
test('session check retires permission changes without asking for historical data',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);await client.load(fake.input.query);
 fake.state.denied=403;await assert.rejects(client.checkSession(),error=>error.status===403);
 assert.ok(fake.state.calls.every(call=>call.resource!=='report-census'));
});

for(const target of ['auth','detail','group']){
 for(const direction of ['larger','smaller']){
  test('valid JSON rejects '+target+' announced byte count '+direction+' than wire, without another request',async()=>{
   const fake=syntheticApi(),client=createCajasApiClient(fake);
   fake.state.announcedJsonBytes=metrics=>{
    const resource=metrics.path==='/api/internal-auth'?'auth':metrics.params.resource;
    return String(metrics.wireBytes+(resource===target?(direction==='larger'?1:-1):0));
   };
   await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_RESPONSE_BYTES_INVALID');
   assert.equal(fake.state.calls.length,target==='auth'?1:target==='detail'?2:3);
  });
 }
 for(const invalid of ['01','1.0','-1','1e3','+1']){
  test('valid JSON rejects '+target+' noncanonical byte announcement '+invalid,async()=>{
   const fake=syntheticApi(),client=createCajasApiClient(fake);
   fake.state.announcedJsonBytes=metrics=>(metrics.path==='/api/internal-auth'?'auth':metrics.params.resource)===target?invalid:String(metrics.wireBytes);
   await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_RESPONSE_BYTES_INVALID');
   assert.equal(fake.state.calls.length,target==='auth'?1:target==='detail'?2:3);
  });
 }
}
test('an absent optional announcement remains valid for every response',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);fake.state.announcedJsonBytes=null;
 const loaded=await client.load(fake.input.query);
 assert.equal(loaded.completeBundleVerified,true);assert.equal(loaded.bytesRead,fake.state.bytes);
 assert.ok(fake.state.responses.every(response=>response.announced===null));
});
test('exact announcements include actual multibyte UTF8 and original JSON whitespace',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);fake.state.multibyteAuth=true;fake.state.prefix=' \n\t';
 const loaded=await client.load(fake.input.query);
 assert.equal(loaded.bytesRead,fake.state.bytes);
 assert.ok(fake.state.responses.some(response=>response.wireBytes>response.textCodeUnits));
 assert.ok(fake.state.responses.every(response=>Number(response.announced)===response.wireBytes));
});
test('UTF8 announcement using characters instead of wire bytes is rejected',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);fake.state.multibyteAuth=true;
 fake.state.announcedJsonBytes=metrics=>String(metrics.textCodeUnits);
 await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_RESPONSE_BYTES_INVALID');
 assert.equal(fake.state.calls.length,1);
});
test('data response exactly4MiB remains complete with exact header and both bookends',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake),limit=4*1024*1024;
 fake.state.prefixFor=({params,payloadBytes})=>params.resource==='group'?' '.repeat(limit-payloadBytes):'';
 const loaded=await client.load(fake.input.query);
 assert.equal(loaded.completeBundleVerified,true);
 assert.ok(fake.state.responses.filter(response=>response.params.resource==='group').every(response=>response.wireBytes===limit));
 assert.equal(loaded.bytesRead,fake.state.bytes);
});
test('data response4MiB+1 cancels its open stream and cannot continue to a bookend',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake),limit=4*1024*1024;
 fake.state.prefixFor=({params,payloadBytes})=>params.resource==='group'?' '.repeat(limit+1-payloadBytes):'';
 fake.state.keepOpenFor=({params})=>params.resource==='group';
 await assert.rejects(client.load(fake.input.query),/respuesta completa supera la capacidad/);
 assert.equal(fake.state.calls.length,3);assert.equal(fake.state.cancelled,1);
});
test('shared256MiB budget rejects the crossing group before aggregate validation and cancels the stream',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake),limit=4*1024*1024,total=256*1024*1024;
 const sample=structuredClone(fake.input.receipts[0]),group=structuredClone(fake.input.details[0].groups[0]);
 // Individually valid synthetic close receipts with distinct IDs. Repeated employees intentionally make
 // the aggregate untrusted too; the transport ceiling must reject earlier, before that validator.
 fake.input.receipts=[];fake.input.details[0].groups=[];
 for(let index=0;index<80;index++){
  const id='00000000-0000-4000-8000-'+String(index+100).padStart(12,'0');
  fake.input.receipts.push({...structuredClone(sample),id,groupId:id,key:id});
  fake.input.details[0].groups.push({...structuredClone(group),id});
 }
 fake.state.prefixFor=({params,payloadBytes})=>params.resource==='group'?' '.repeat(limit-payloadBytes):'';
 fake.state.keepOpenFor=metrics=>metrics.totalBytesAfter>total;
 await assert.rejects(client.load(fake.input.query),/revisión completa supera su capacidad/);
 assert.ok(fake.state.bytes>total);assert.ok(fake.state.groupReads<80);
 assert.equal(fake.state.detailReads,1);assert.equal(fake.state.authReads,1);assert.equal(fake.state.cancelled,1);
});

// Un cierre que no entra en JSON común (422 OWN_CLOSE_LIMIT): Cajas repite esa misma consulta en modo completo. Para todo
// lo demás sigue pidiendo sólo JSON común: el servidor sintético rechaza cualquier otra negociación.
const FULL='application/vnd.municontrol.payroll-full.v1+json';
for(const resource of ['detail','group']){
 test('a '+resource+' beyond common capacity is read whole in full mode, counted on the wire, and its bookend goes straight to full',async()=>{
  const fake=syntheticApi(),client=createCajasApiClient(fake);fake.state.large=({params})=>params.resource===resource;
  const loaded=await client.load(fake.input.query);
  assert.equal(loaded.completeBundleVerified,true);assert.equal(loaded.bundle.employees.length,4);
  assert.equal(loaded.bytesRead,fake.state.bytes,'the rejected common response is part of the wire total');
  // auth, detail, group, detail (bookend), group (bookend), auth: one extra request for the first oversized read only.
  assert.deepEqual(fake.state.calls.map(call=>call.resource),resource==='detail'
   ?['auth','detail','detail','group','detail','group','auth']:['auth','detail','group','group','detail','group','auth']);
  assert.deepEqual(fake.state.accepts,resource==='detail'
   ?['common','common','full','common','full','common','common']:['common','common','common','full','common','full','common']);
  assert.ok(fake.state.responses.filter(r=>r.params.resource===resource).every(r=>Number(r.announced)===r.wireBytes));
 });
}
test('full mode demands its own content type and an announced byte count',async()=>{
 for(const damage of [state=>{state.fullContentType='application/json';},state=>{state.announcedJsonBytes=null;}]){
  const fake=syntheticApi(),client=createCajasApiClient(fake);fake.state.large=({params})=>params.resource==='group';damage(fake.state);
  // Sólo la respuesta en modo completo queda abierta: si el lector la esperara entera, esta prueba no terminaría.
  fake.state.keepOpenFor=({params})=>params.resource==='group'&&fake.state.accepts.at(-1)==='full';
  await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_RESPONSE_INVALID');
  assert.equal(fake.state.calls.at(-1).resource,'group','nothing is read after the unverifiable response');
  assert.ok(fake.state.cancelled>=1,'the unverified stream is cancelled, not parsed');
 }
});
test('a close beyond full capacity too is reported as a capacity limit, never trimmed, and stops the read',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);fake.state.large=({params})=>params.resource==='detail';
 fake.state.mutate=({params,state})=>params.resource==='detail'&&state.accepts.at(-1)==='full'
  ?{status:422,payload:{ok:false,code:'OWN_CLOSE_LIMIT',error:'synthetic'}}:null;
 await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_SOURCE_LIMIT'&&error.status===422&&/No se recortó/.test(error.message));
 assert.deepEqual(fake.state.calls.map(call=>call.resource),['auth','detail','detail']);
});
test('any other 422 is not renegotiated',async()=>{
 const fake=syntheticApi(),client=createCajasApiClient(fake);
 fake.state.mutate=({params})=>params.resource==='detail'?{status:422,payload:{ok:false,code:'OWN_CLOSE_INPUT_INVALID',error:'synthetic'}}:null;
 await assert.rejects(client.load(fake.input.query),error=>error.code==='CAJAS_READ_UNAVAILABLE'&&error.status===422);
 assert.deepEqual(fake.state.accepts,['common','common']);
});
