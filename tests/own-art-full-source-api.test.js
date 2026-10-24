// Synthetic handler/stream tests. No real SQL connection or provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createOwnArtReportHandler} from '../api/internal-own-art-report.js';
import {OWN_ART_READ,OWN_ART_MAX_BYTES,prepareOwnArtReport} from '../assets/own-art-report-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownArtFixture,rehashArtFixture} from './fixtures/own-art-report-synthetic.js';
import {ownArtFullSourceFixture,OWN_ART_FULL_QA_RULE_COUNT} from './fixtures/own-art-full-source-synthetic.js';

const FULL_RPC='SELECT public.own_art_report_source_full_v1($1::jsonb,$2::jsonb) AS result';
const uid=n=>'bbbbbbbb-0000-4000-8000-'+String(n).padStart(12,'0');
const principal={user:{email:'art-full-qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:OWN_ART_READ}};
const session={email:principal.user.email,id:uid(3),version:1,releaseSha:'d'.repeat(40)};
const request=()=>({method:'GET',query:{period:'2026-10',types:'monthly'},url:'/api/internal-own-art-report?period=2026-10&types=monthly',headers:{}});
function response(stream=false){
 const r=new EventEmitter();Object.assign(r,{headers:{},parts:[],ended:false,status(n){this.statusCode=n;return this;},
  setHeader(k,v){this.headers[k]=v;},json(value){this.value=value;return this;}});
 if(stream){r.write=bytes=>{r.parts.push(Buffer.from(bytes));return true;};r.end=()=>{r.ended=true;};}
 return r;
}
function setup({data=ownArtFixture(2),principalValue=principal,sessionValue=session,authorize,query}={}){
 const calls=[],authorization=[];let connections=0;
 const handler=createOwnArtReportHandler({env:{},
  requireAccess:async(req,res,options)=>{authorization.push(options);return authorize?authorize(req,res,options):{mode:'managed',principal:principalValue};},
  sessionFor:()=>sessionValue,getSql:async()=>{connections++;return {query:async(q,v)=>{calls.push({q,v});return query?query(q,v):[{result:data}];}};}});
 return {handler,calls,authorization,get connections(){return connections;}};
}
const assertSafeFailure=(res,status)=>{
 assert.equal(res.statusCode,status);assert.equal(res.value?.ok,false);assert.equal(res.value?.data,undefined);
 assert.equal(res.parts.length,0);assert.equal(res.ended,false);
 assert.doesNotMatch(JSON.stringify(res.value),/99010000|Agente exclusivamente|password|private-secret|art-full-qa@/);
};

test('ART uses the exact full RPC with unchanged v1 source, session/tenant binds and private headers',async()=>{
 const data=ownArtFixture(2),a=setup({data}),res=response();await a.handler(request(),res);
 assert.equal(res.statusCode,200);assert.equal(a.calls.length,1);assert.equal(a.calls[0].q,FULL_RPC);
 assert.deepEqual(JSON.parse(a.calls[0].v[0]),{actorEmail:principal.user.email,actorSessionId:session.id,
  actorSessionVersion:session.version,releaseSha:session.releaseSha,tenantId:principal.tenant.id,membershipId:principal.tenant.membershipId});
 assert.deepEqual(JSON.parse(a.calls[0].v[1]),{period:'2026-10',types:['monthly']});assert.equal(a.calls[0].v.length,2);
 assert.equal(res.value.data.version,'own-art-preview.v1');assert.equal(res.value.data.content.version,'own-art-source.v1');
 assert.deepEqual(res.value.data,data);assert.match(res.headers['Cache-Control'],/private.*no-store/);
 assert.equal(res.headers.Pragma,'no-cache');assert.equal(res.headers.Vary,'Cookie, Origin');
 assert.deepEqual(a.authorization[0].requiredCapabilities,OWN_ART_READ);assert.equal(a.authorization[0].capabilityMode,'all');
 for(const key of ['requireDataPlaneReady','requireCertifiedDataBinding'])assert.equal(a.authorization[0][key],true);
 assert.equal(a.authorization[0].allowLegacy,false);
});

test('855 complete engine-derived employees and 20520 concepts exceed legacy 4 MiB and stream intact below ART 32 MiB',async()=>{
 const f=ownArtFullSourceFixture(855),data=f.source,expected=Buffer.from(JSON.stringify({ok:true,data}));
 assert.equal(OWN_ART_MAX_BYTES,32*1024*1024);assert.equal(OWN_ART_FULL_QA_RULE_COUNT,24);
 // SQL201 limits each close receipt, not the aggregate ART source. Compact JSON
 // alone exceeds 4 MiB here, so jsonb text plus its 8192-byte reserve also does.
 assert.equal(data.content.groups.length,1);
 assert.ok(Buffer.byteLength(JSON.stringify({...f.receipt,replayed:true}))>4*1024*1024,'one legitimate close receipt must cross the legacy boundary');
 assert.ok(expected.length<=OWN_ART_MAX_BYTES,'the complete framed response must remain within the unchanged global limit');
 assert.equal(f.capture.saved.result.rows.length,855*24);assert.equal(data.content.sourceRecordCount,855);
 assert.equal(f.receipt.snapshot.conceptCount,855*24);assert.equal(f.receipt.snapshot.employeeCount,855);
 assert.equal(f.receipt.snapshot.populationComplete,true);assert.equal(new Set(data.content.people.map(p=>p.contractId)).size,855);
 assert.equal(f.capture.payloadSha256,ownRunHash(f.capture.payload));assert.equal(f.capture.saved.inputSha256,ownRunHash(f.capture.saved.input));
 assert.equal(f.capture.saved.resultSha256,ownRunHash(f.capture.saved.result));assert.equal(f.receipt.snapshotSha256,ownRunHash(f.receipt.snapshot));
 assert.equal(data.sourceVersion,ownRunHash(data.content));
 assert.deepEqual(f.receipt.snapshot.totals,{remuneration:'216315.00',non_remuneration:'0.00',deduction:'0.00',employer_contribution:'0.00',gross:'216315.00',net:'216315.00'});
 // This models the dependency rejection only. No PostgreSQL is exercised here.
 const a=setup({data,query:async q=>{if(q!==FULL_RPC)throw Error('OWN_CLOSE_RESPONSE_LIMIT');return [{result:data}];}}),res=response(true);
 await a.handler(request(),res);assert.equal(res.statusCode,200);assert.equal(a.calls.length,1);assert.equal(a.calls[0].q,FULL_RPC);
 assert.equal(res.ended,true);assert.ok(res.parts.length>64);assert.ok(res.parts.every(p=>p.length<=65536));
 assert.deepEqual(Buffer.concat(res.parts),expected);const returned=JSON.parse(Buffer.concat(res.parts).toString('utf8')).data;
 assert.equal(returned.content.people.length,855);assert.equal(returned.content.groups[0].snapshot.concepts.length,20520);
 assert.equal(returned.content.people.at(-1).contractId,data.content.people.at(-1).contractId);
 assert.equal(returned.content.groups[0].snapshot.concepts.at(-1).contractId,f.receipt.snapshot.concepts.at(-1).contractId);
 const report=prepareOwnArtReport(data);assert.equal(report.total,855);assert.equal(report.sourceRecordCount,855);
 assert.equal(report.issueCount,0);assert.equal(report.canExport,true);assert.equal(report.salaryCents,String(855n*10003n));
 assert.equal(report.rows[0].workedDays,'0');assert.ok(report.rows.slice(1).every(r=>r.workedDays==='23'));
 assert.equal(f.provenance.sqlApproval,false);assert.equal(f.provenance.municipalRule,false);
});

test('each required capability, anonymous access, non-managed scope and invalid session stop before getSql',async()=>{
 for(const missing of OWN_ART_READ){const p={...principal,tenant:{...principal.tenant,effectiveCapabilities:OWN_ART_READ.filter(c=>c!==missing)}},a=setup({principalValue:p}),res=response();await a.handler(request(),res);assertSafeFailure(res,403);assert.equal(a.connections,0);}
 for(const options of [
  {authorize:async(_req,res)=>{res.status(401).json({ok:false,code:'TEST_UNAUTHENTICATED'});return null;}},
  {authorize:async()=>({mode:'legacy',principal})},
  {principalValue:{...principal,tenant:{...principal.tenant,source:'legacy'}}},
  {sessionValue:{...session,id:null}},{sessionValue:{...session,email:'other-qa@example.invalid'}},
  {sessionValue:{...session,releaseSha:'not-a-release'}}
 ]){const a=setup(options),res=response();await a.handler(request(),res);assert.ok([401,403].includes(res.statusCode));assertSafeFailure(res,res.statusCode);assert.equal(a.connections,0);assert.equal(a.calls.length,0);}
});

test('POST, added scope/search, duplicates and malformed query cannot start a full or legacy RPC',async()=>{
 for(const change of [r=>r.method='POST',r=>r.query.tenantId=uid(9),r=>r.query.search='QA',r=>r.query.types=['monthly'],
  r=>r.query.types='monthly,monthly',r=>r.query.types='not-a-type',r=>r.query.period='2026-13',
  r=>r.url+='&period=2026-10',r=>r.url+='&search=x']){
  const a=setup(),res=response(),req=request();change(req);await a.handler(req,res);assert.ok([400,405].includes(res.statusCode));
  assertSafeFailure(res,res.statusCode);assert.equal(a.connections,0);assert.equal(a.calls.length,0);
 }
});

test('incomplete census, missing person, altered snapshot hash and changed query fail before streaming nominal data',async()=>{
 for(const change of [
  v=>{v.content.complete=false;rehashArtFixture(v);},
  v=>{v.content.sourceRecordCount--;rehashArtFixture(v);},
  v=>{v.content.people.pop();rehashArtFixture(v);},
  v=>{v.content.groups[0].snapshot.totals.net='999.00';},
  v=>{v.sourceVersion='0'.repeat(64);},
  v=>{v.content.params.period='2026-09';rehashArtFixture(v);}
 ]){const data=ownArtFixture(2);change(data);const a=setup({data}),res=response(true);await a.handler(request(),res);assertSafeFailure(res,503);assert.equal(a.calls.length,1);}
});

test('the unchanged 32 MiB maximum rejects an oversized untrusted source before validation or first nominal byte',async()=>{
 const data=ownArtFixture(1),snapshot=data.content.groups[0].snapshot,record=snapshot.concepts[0];
 // Deliberately INVALID duplicated records exercise the outer transport ceiling.
 // This is not the valid 855-employee fixture and is never a claim of valid census.
 const count=Math.ceil(OWN_ART_MAX_BYTES/Buffer.byteLength(JSON.stringify(record)))+1;
 snapshot.concepts=Array.from({length:count},()=>record);
 assert.ok(Buffer.byteLength(JSON.stringify(data))>OWN_ART_MAX_BYTES);
 const a=setup({data}),res=response(true);await a.handler(request(),res);assertSafeFailure(res,422);
 assert.equal(res.value.code,'OWN_ART_LIMIT');assert.equal(a.calls.length,1);
});

test('full-RPC SQL failures retain safe statuses without SQL text, synthetic nominal data or credentials',async()=>{
 for(const [message,status,code]of [
  ['OWN_ART_LIMIT',422,'OWN_ART_LIMIT'],['OWN_ART_IDENTITY_CHANGED',409,'OWN_ART_IDENTITY_CHANGED'],
  ['OWN_ART_BUSY',409,'OWN_ART_BUSY'],['ACTION_SESSION_INVALID',401,'OWN_ART_SESSION_INVALID'],
  ['OWN_ART_FORBIDDEN',403,'OWN_ART_FORBIDDEN'],['private-secret password SELECT nominal',503,'OWN_ART_UNAVAILABLE']
 ]){const a=setup({query:async()=>{throw Error(message);}}),res=response(true);await a.handler(request(),res);
  assertSafeFailure(res,status);assert.equal(res.value.code,code);assert.doesNotMatch(JSON.stringify(res.value),/SELECT|private-secret|password/);
  assert.equal(a.calls.length,1);assert.equal(a.calls[0].q,FULL_RPC);
 }
});
