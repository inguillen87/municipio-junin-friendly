// Source-only proposal. Genuine handlers + synthetic auth/SQL dependency injection.
// These tests verify wiring and validation, not an SDK connection or provisioned database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createOwnCloseHandler} from '../api/internal-own-payroll-close.js';
import {createOwnLiquidationHandler} from '../api/internal-own-payroll-liquidation.js';
import {OWN_F931_HISTORY_ADMISSION,ownF931HistoryAdmission} from '../assets/own-f931-history-admission.js';
import {OWN_CLOSE_NOMINAL,OWN_CLOSE_WRITE} from '../assets/own-payroll-close-model.js';
import {OWN_LIQ_REVIEW} from '../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';
import {INACTIVE_F931_HISTORY_ADMISSION as INACTIVE} from './fixtures/own-f931-inactive-admission.js';
import {jurisdictionFixture} from './fixtures/own-payroll-jurisdiction-synthetic.js';
import {detail as liquidationDetail,command as liquidationCommand} from './fixtures/own-payroll-liquidation-synthetic.js';
import {closeCommand} from './fixtures/own-payroll-close-synthetic.js';
import {reportCensusFixture,liquidationDetailFor} from './fixtures/own-payroll-report-census-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
const projectTarget=t=>({major:t.major,projectId:t.projectId,branchId:t.branchId,endpointId:t.endpointId,database:t.database});
const principal=caps=>({user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:caps}});
const session={email:'qa@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
// Syntactic DI fixture only. It does not prove an installed PG18 epoch or activate a published source.
const DI_ACTIVE=Object.freeze({version:'own-f931-history-admission.v1',activated:true,sourceCommit:'4dc2c19b7549e07e1cad52b16924d25f87ea5589',epoch:'201',target:{major:18,projectId:'wild-cake-87689498',branchId:'br-plain-dawn-ac8crb1h',endpointId:'ep-falling-rain-aca27ph1',database:'neondb',role:'neondb_owner'},protocol:'1'.repeat(32),mode:'install_fresh',custodyRunSha256:'d'.repeat(64),capacityPostflightSha256:'a'.repeat(64),ledgerProjectionSha256:'b'.repeat(64),facades:{census:'5'.repeat(64),groupFull:'2'.repeat(64),liquidationDetailFull:'8'.repeat(64)},durableProofSha256:'c'.repeat(64)});
class Response extends EventEmitter{
 constructor(){super();this.headers={};this.chunks=[];this.destroyed=false;this.ended=false;}
 setHeader(k,v){this.headers[k]=v;}status(v){this.statusCode=v;return this;}json(v){this.value=v;return this;}
 write(v){this.chunks.push(Buffer.from(v));return true;}end(){this.ended=true;}
 full(){return JSON.parse(Buffer.concat(this.chunks).toString('utf8'));}
}
const request=(kind,query,accept='application/json',extraHeaders={})=>({method:'GET',url:'/api/internal-own-payroll-'+kind+'?'+new URLSearchParams(query),query,headers:{accept,...extraHeaders}});
function rig(kind,options={}){
 const f=jurisdictionFixture(4,()=>'42'),census=reportCensusFixture(f),receipt=f.receipts[0],detail=liquidationDetailFor(liquidationDetail().capture);
 const required=options.caps??(kind==='close'?OWN_CLOSE_NOMINAL:OWN_LIQ_REVIEW),sqlCalls=[],getSqlOptions=[];
 const sql={query:async(q,values)=>{sqlCalls.push({q,values});
  if(q.includes('own_close_report_census_v1'))return[{result:structuredClone(census)}];
  if(q.includes('own_close_group_'))return[{result:structuredClone(receipt)}];
  if(q.includes('own_liquidation_detail_'))return[{result:structuredClone(detail)}];
  throw Error('Unexpected synthetic query');
 }};
 const deps={env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async(_req,res)=>{if(options.authStatus){res.status(options.authStatus).json({ok:false,code:'AUTH_'+options.authStatus,error:'Acceso sintético denegado.'});return null;}return{mode:'managed',principal:principal(required)};},sessionFor:()=>session,
  getSql:async(_env,settings)=>{getSqlOptions.push(structuredClone(settings));if(options.sqlError)throw options.sqlError;return sql;}};
 // Omission uses the actual source default. Inactive/alternate DI is always explicit.
 if(Object.hasOwn(options,'admission'))deps.historyAdmission=options.admission;
 const handler=(kind==='close'?createOwnCloseHandler:createOwnLiquidationHandler)(deps);
 return{f,census,receipt,detail,sqlCalls,getSqlOptions,handler,async call(query,accept='application/json',headers={}){const res=new Response();await handler(request(kind,query,accept,headers),res);return res;}};
}
const censusQuery=a=>({resource:'report-census',period:a.f.query.from,liquidationType:'monthly'});
const groupQuery=a=>({resource:'group',id:a.receipt.groupId});
const detailQuery=a=>({resource:'detail',id:a.detail.id});
test('W1 default source PG17 reaches close census and group FULL; ordinary group remains v1 with no destination requirement',async()=>{
 assert.equal(ownF931HistoryAdmission().activated,true);assert.equal(OWN_F931_HISTORY_ADMISSION.target.major,17);
 const a=rig('close'),expected=projectTarget(OWN_F931_HISTORY_ADMISSION.target);
 let r=await a.call(censusQuery(a));assert.equal(r.statusCode,200);assert.deepEqual(r.value,{ok:true,data:a.census});
 r=await a.call(groupQuery(a),OWN_RUN_FULL_JSON);assert.equal(r.statusCode,200);assert.equal(r.ended,true);assert.deepEqual(r.full(),{ok:true,data:a.receipt});
 r=await a.call(groupQuery(a));assert.equal(r.statusCode,200);assert.deepEqual(r.value,{ok:true,data:a.receipt});
 assert.deepEqual(a.getSqlOptions,[{expectedDestination:expected},{expectedDestination:expected},{expectedDestination:null}]);
 assert.deepEqual(a.sqlCalls.map(c=>c.q),['SELECT public.own_close_report_census_v1($1::jsonb,$2::text,$3::text) AS result','SELECT public.own_close_group_full_v1($1::jsonb,$2::uuid) AS result','SELECT public.own_close_group_v1($1::jsonb,$2::uuid) AS result']);
 assert.equal(Object.hasOwn(expected,'role'),false);
});
test('W2 default source PG17 binds liquidation FULL while ordinary detail stays on v1',async()=>{
 const a=rig('liquidation'),expected=projectTarget(OWN_F931_HISTORY_ADMISSION.target);
 const full=await a.call(detailQuery(a),OWN_RUN_FULL_JSON);assert.equal(full.statusCode,200);assert.deepEqual(full.full(),{ok:true,data:a.detail});
 const plain=await a.call(detailQuery(a));assert.equal(plain.statusCode,200);assert.deepEqual(plain.value,{ok:true,data:a.detail});
 assert.deepEqual(a.getSqlOptions,[{expectedDestination:expected},{expectedDestination:null}]);
 assert.deepEqual(a.sqlCalls.map(c=>c.q),['SELECT public.own_liquidation_detail_full_v1($1::jsonb,$2::uuid) AS result','SELECT public.own_liquidation_detail_v1($1::jsonb,$2::uuid) AS result']);
});
test('W3 an explicit synthetic DI admission selects its own destination rather than the global source target',async()=>{
 assert.equal(ownF931HistoryAdmission(DI_ACTIVE).activated,true);const expected=projectTarget(DI_ACTIVE.target);assert.notDeepEqual(expected,projectTarget(OWN_F931_HISTORY_ADMISSION.target));
 const close=rig('close',{admission:DI_ACTIVE});assert.equal((await close.call(censusQuery(close))).statusCode,200);assert.equal((await close.call(groupQuery(close),OWN_RUN_FULL_JSON)).statusCode,200);
 const liq=rig('liquidation',{admission:DI_ACTIVE});assert.equal((await liq.call(detailQuery(liq),OWN_RUN_FULL_JSON)).statusCode,200);
 assert.deepEqual(close.getSqlOptions,[{expectedDestination:expected},{expectedDestination:expected}]);assert.deepEqual(liq.getSqlOptions,[{expectedDestination:expected}]);assert.equal(expected.major,18);assert.equal(Object.hasOwn(expected,'role'),false);
});
test('W4 explicit inactive fixtures preserve v1 options and reject census/FULL before acquiring a client',async()=>{
 const close=rig('close',{admission:INACTIVE});assert.equal((await close.call(groupQuery(close))).statusCode,200);assert.deepEqual(close.getSqlOptions,[{expectedDestination:null}]);
 const census=await close.call(censusQuery(close));assert.equal(census.statusCode,400);assert.equal(census.value.code,'OWN_CLOSE_QUERY_INVALID');
 assert.equal((await close.call(groupQuery(close),OWN_RUN_FULL_JSON)).statusCode,503);assert.equal(close.getSqlOptions.length,1);assert.equal(close.sqlCalls.length,1);
 const liq=rig('liquidation',{admission:INACTIVE});assert.equal((await liq.call(detailQuery(liq))).statusCode,200);assert.deepEqual(liq.getSqlOptions,[{expectedDestination:null}]);
 assert.equal((await liq.call(detailQuery(liq),OWN_RUN_FULL_JSON)).statusCode,503);assert.equal(liq.getSqlOptions.length,1);assert.equal(liq.sqlCalls.length,1);
});
test('W5 HTTP query fields cannot select a destination or an admission; every attempt is rejected before getSql',async()=>{
 for(const field of['destination','expectedDestination','historyAdmission','major','branchId','role'])for(const kind of['close','liquidation']){
  const a=rig(kind),base=kind==='close'?censusQuery(a):detailQuery(a),query={...base,[field]:field==='historyAdmission'?JSON.stringify(DI_ACTIVE):'attacker-choice'};
  const r=await a.call(query,kind==='close'?'application/json':OWN_RUN_FULL_JSON);assert.equal(r.statusCode,400,kind+':'+field);assert.match(r.value.code,/QUERY_INVALID$/);assert.equal(a.getSqlOptions.length,0);assert.equal(a.sqlCalls.length,0);
 }
});
test('W6 spoofed HTTP metadata headers cannot replace the active source destination',async()=>{
 const expected=projectTarget(OWN_F931_HISTORY_ADMISSION.target),headers={'x-municontrol-destination':'other-branch','x-municontrol-history-admission':JSON.stringify(DI_ACTIVE)};
 for(const kind of['close','liquidation']){const a=rig(kind),query=kind==='close'?censusQuery(a):detailQuery(a);const r=await a.call(query,kind==='close'?'application/json':OWN_RUN_FULL_JSON,headers);assert.equal(r.statusCode,200);assert.deepEqual(a.getSqlOptions,[{expectedDestination:expected}]);}
});


const historyDestinationMessage='No se pudo verificar el destino de lectura del histórico cerrado. Avisá a administración del sistema antes de volver a consultar.';
const destinationFailure=()=>Object.assign(Error('private-source-error: endpoint-and-branch-must-not-leak'),{code:'ACTION_DATABASE_DESTINATION_REQUIRED'});
const unavailableMessage=kind=>kind==='close'?'No se confirmó el cierre. Consultá el mismo intento antes de enviar otro.':'No se confirmó la decisión. Consultá el mismo intento antes de enviar otra.';
const unavailableCode=kind=>kind==='close'?'OWN_CLOSE_UNAVAILABLE':'OWN_LIQ_UNAVAILABLE';

test('W7 unavailable destination on historical GET returns safe UNAVAILABLE 503 before any facade query',async()=>{
 for(const [kind,resource,accept]of[['close','census','application/json'],['close','group',OWN_RUN_FULL_JSON],['liquidation','detail',OWN_RUN_FULL_JSON]]){
  const a=rig(kind,{sqlError:destinationFailure()}),query=resource==='census'?censusQuery(a):resource==='group'?groupQuery(a):detailQuery(a);
  const r=await a.call(query,accept);
  assert.equal(r.statusCode,503);assert.deepEqual(r.value,{ok:false,code:unavailableCode(kind),error:historyDestinationMessage});
  assert.deepEqual(a.getSqlOptions,[{expectedDestination:projectTarget(OWN_F931_HISTORY_ADMISSION.target)}]);
  assert.equal(a.sqlCalls.length,0);assert.equal(r.chunks.length,0);assert.equal(r.headers['Idempotency-Replayed'],undefined);
 }
});

test('W8 ordinary JSON reads and unrelated client errors retain their previous UNAVAILABLE response',async()=>{
 for(const kind of['close','liquidation'])for(const historical of[false,true]){
  const a=rig(kind,{sqlError:historical?Error('unrelated-private-client-error'):destinationFailure()}),query=kind==='close'?groupQuery(a):detailQuery(a);
  const r=await a.call(query,historical?OWN_RUN_FULL_JSON:'application/json');
  assert.equal(r.statusCode,503);assert.deepEqual(r.value,{ok:false,code:unavailableCode(kind),error:unavailableMessage(kind)});assert.equal(a.sqlCalls.length,0);
  assert.deepEqual(a.getSqlOptions,[{expectedDestination:historical?projectTarget(OWN_F931_HISTORY_ADMISSION.target):null}]);
 }
});

test('W9 POST destination failures keep decision/close ambiguity guidance, including FULL negotiation',async()=>{
 for(const kind of['close','liquidation'])for(const accept of['application/json',OWN_RUN_FULL_JSON]){
  const a=rig(kind,{caps:kind==='close'?OWN_CLOSE_WRITE:OWN_LIQ_REVIEW,sqlError:destinationFailure()}),r=new Response();
  await a.handler({method:'POST',url:'/api/internal-own-payroll-'+kind,query:{},headers:{accept,origin:'https://municipio.example','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'command',payload:kind==='close'?closeCommand():liquidationCommand()})},r);
  assert.equal(r.statusCode,503);assert.deepEqual(r.value,{ok:false,code:unavailableCode(kind),error:unavailableMessage(kind)});assert.equal(a.sqlCalls.length,0);
  assert.deepEqual(a.getSqlOptions,[{expectedDestination:accept===OWN_RUN_FULL_JSON?projectTarget(OWN_F931_HISTORY_ADMISSION.target):null}]);
 }
});

test('W10 auth 401/403 remain unchanged and stop historical GET before client acquisition',async()=>{
 for(const kind of['close','liquidation'])for(const status of[401,403]){
  const a=rig(kind,{authStatus:status,sqlError:destinationFailure()}),query=kind==='close'?censusQuery(a):detailQuery(a);
  const r=await a.call(query,kind==='close'?'application/json':OWN_RUN_FULL_JSON);
  assert.equal(r.statusCode,status);assert.deepEqual(r.value,{ok:false,code:'AUTH_'+status,error:'Acceso sintético denegado.'});assert.equal(a.sqlCalls.length,0);assert.equal(a.getSqlOptions.length,0);
 }
});
