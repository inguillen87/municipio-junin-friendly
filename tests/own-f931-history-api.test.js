import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createOwnCloseHandler} from '../api/internal-own-payroll-close.js';
import {createOwnLiquidationHandler} from '../api/internal-own-payroll-liquidation.js';
import {ownCloseOperation} from '../lib/internal-own-payroll-close.js';
import {ownLiquidationOperation} from '../lib/internal-own-payroll-liquidation.js';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {OWN_LIQ_REVIEW} from '../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {ownF931HistoryAdmission} from '../assets/own-f931-history-admission.js';
import {INACTIVE_F931_HISTORY_ADMISSION as INACTIVE} from './fixtures/own-f931-inactive-admission.js';
import {jurisdictionFixture} from './fixtures/own-payroll-jurisdiction-synthetic.js';
import {reportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {detail as liquidationDetail} from './fixtures/own-payroll-liquidation-synthetic.js';
import {reportCensusFixture,liquidationDetailFor} from './fixtures/own-payroll-report-census-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
// Contexto sintético válido (mismo patrón que tests/own-payroll-close-api.test.js:5 y own-payroll-liquidation-api.test.js:7).
const principal=caps=>({user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:caps}}),session={email:'qa@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
// Admisión ACTIVA sintética sólo para ejercitar rutas: no acredita ninguna época instalada.
const ACTIVE=Object.freeze({version:'own-f931-history-admission.v1',activated:true,sourceCommit:'4dc2c19b7549e07e1cad52b16924d25f87ea5589',epoch:'201',target:{major:18,projectId:'wild-cake-87689498',branchId:'br-plain-dawn-ac8crb1h',endpointId:'ep-falling-rain-aca27ph1',database:'neondb',role:'neondb_owner'},protocol:'1'.repeat(32),mode:'install_fresh',custodyRunSha256:'d'.repeat(64),capacityPostflightSha256:'a'.repeat(64),ledgerProjectionSha256:'b'.repeat(64),facades:{census:'5912530eb374316518cf7b33006b0bb7555040391131321b82c000a455da1ebd',groupFull:'2bb9b017085a8441e44f70dfe8545ed52a7fda9ce4258e4829baf2b9b7e36c91',liquidationDetailFull:'8b0bd3213b3b025f92892742bd5846822fabb254787214b6ce912a9de90ec5d8'},durableProofSha256:'c'.repeat(64)});
const bytesOf=v=>Buffer.byteLength(JSON.stringify({ok:true,data:v}));
const jsonRes=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
class StreamRes extends EventEmitter{constructor(){super();this.headers={};this.chunks=[];this.destroyed=false;this.ended=false;}setHeader(k,v){this.headers[k]=v;}status(n){this.statusCode=n;return this;}json(v){this.value=v;return this;}write(c){this.chunks.push(Buffer.from(c));return true;}end(){this.ended=true;}body(){return JSON.parse(Buffer.concat(this.chunks).toString('utf8'));}}
const getReq=(path,query,accept='application/json')=>({method:'GET',url:path+'?'+new URLSearchParams(query),query,headers:{accept}});
function closeApi({caps=OWN_CLOSE_NOMINAL,admission=INACTIVE,sql}){const calls=[],stats={connect:0};return {calls,stats,handler:createOwnCloseHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},historyAdmission:admission,requireAccess:async()=>({mode:'managed',principal:principal(caps)}),sessionFor:()=>session,getSql:async()=>{stats.connect++;return {query:async(q,v)=>{calls.push({q,v});return sql(q,v);}};}})};}
function liqApi({caps=OWN_LIQ_REVIEW,admission=INACTIVE,sql}){const calls=[],stats={connect:0};return {calls,stats,handler:createOwnLiquidationHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},historyAdmission:admission,requireAccess:async()=>({mode:'managed',principal:principal(caps)}),sessionFor:()=>session,getSql:async()=>{stats.connect++;return {query:async(q,v)=>{calls.push({q,v});return sql(q,v);}};}})};}
const fixture=()=>{const f=jurisdictionFixture(4,()=>'42');return {f,census:reportCensusFixture(f),receipt:f.receipts[0]};};

test('explicit inactive fixture has no proof fields and the validator refuses partial or inconsistent activations',()=>{
 assert.equal(ownF931HistoryAdmission(INACTIVE).activated,false);assert.equal(ownF931HistoryAdmission(ACTIVE).activated,true);
 for(const patch of [{activated:true,sourceCommit:null},{activated:false,epoch:'201'},{epoch:'201+214'},{facades:{census:'5'.repeat(64)}},{durableProofSha256:'x'},{extra:true}])assert.throws(()=>ownF931HistoryAdmission({...ACTIVE,...patch}));
});

test('R11 rejects the old route-only ACTIVE shape and each missing custody identity field',()=>{
 const missing=['target','protocol','mode','custodyRunSha256'],legacy={...ACTIVE};for(const key of missing)delete legacy[key];
 assert.throws(()=>ownF931HistoryAdmission(legacy),/La admisión del lector histórico no es válida/);
 for(const key of missing){const partial={...ACTIVE};delete partial[key];assert.throws(()=>ownF931HistoryAdmission(partial),/La admisión del lector histórico no es válida/);}
 assert.equal(ownF931HistoryAdmission(ACTIVE).activated,true);
});

test('lib report-census: exact SQL, exact arguments, verified census; fake sourceVersion → CONTRACT_INVALID 503; availability remaps; INPUT_INVALID before SQL',async()=>{
 const {f,census}=fixture(),calls=[],sql={query:async(q,v)=>{calls.push({q,v});return [{result:structuredClone(census)}];}};
 const value=await ownCloseOperation(sql,principal(OWN_CLOSE_NOMINAL),session,'report-census',{period:f.query.from,liquidationType:'monthly'});
 assert.deepEqual(value,census);assert.equal(calls.length,1);assert.equal(calls[0].q,'SELECT public.own_close_report_census_v1($1::jsonb,$2::text,$3::text) AS result');
 assert.deepEqual(calls[0].v.slice(1),[f.query.from,'monthly']);assert.equal(JSON.parse(calls[0].v[0]).membershipId,uid(51));assert.equal(JSON.parse(calls[0].v[0]).actorSessionId,session.id);
 await assert.rejects(ownCloseOperation({query:async()=>[{result:{...structuredClone(census),sourceVersion:'0'.repeat(64)}}]},principal(OWN_CLOSE_NOMINAL),session,'report-census',{period:f.query.from,liquidationType:'monthly'}),e=>e.code==='OWN_CLOSE_CONTRACT_INVALID'&&e.status===503);
 await assert.rejects(ownCloseOperation({query:async()=>[{result:{...structuredClone(census),period:'2025-01'}}]},principal(OWN_CLOSE_NOMINAL),session,'report-census',{period:f.query.from,liquidationType:'monthly'}),e=>e.code==='OWN_CLOSE_CONTRACT_INVALID');
 await assert.rejects(ownCloseOperation({query:async()=>{throw Error('connection reset');}},principal(OWN_CLOSE_NOMINAL),session,'report-census',{period:f.query.from,liquidationType:'monthly'}),e=>e.code==='OWN_CLOSE_UNAVAILABLE'&&e.status===503&&/histórico cerrado/.test(e.message));
 await assert.rejects(ownCloseOperation({query:async()=>{throw Error('ERROR: OWN_CLOSE_BUSY');}},principal(OWN_CLOSE_NOMINAL),session,'report-census',{period:f.query.from,liquidationType:'monthly'}),e=>e.code==='OWN_CLOSE_BUSY'&&e.status===409&&/histórico cerrado/.test(e.message));
 const none=[];await assert.rejects(ownCloseOperation({query:async(q)=>{none.push(q);return [];}},principal(OWN_CLOSE_NOMINAL),session,'report-census',{period:f.query.from,liquidationType:'weekly'}),e=>e.code==='OWN_CLOSE_INPUT_INVALID');assert.equal(none.length,0);
});

test('lib group: FULL switches only the SQL reader and its 32 MiB limit; plain keeps v1 and 4 MiB',async()=>{
 const {f,receipt}=fixture(),texts=[],sql={query:async(q)=>{texts.push(q);return [{result:structuredClone(receipt)}];}};
 await ownCloseOperation(sql,principal(OWN_CLOSE_NOMINAL),session,'group',{id:receipt.groupId},{fullJson:true});
 await ownCloseOperation(sql,principal(OWN_CLOSE_NOMINAL),session,'group',{id:receipt.groupId});
 assert.deepEqual(texts,['SELECT public.own_close_group_full_v1($1::jsonb,$2::uuid) AS result','SELECT public.own_close_group_v1($1::jsonb,$2::uuid) AS result']);
 // Recibo válido y grande: precondición explícita de tamaño (ajustar count si el motor sintético cambia).
 const big=reportFixture(2600).receipts[0];assert.ok(bytesOf(big)>OWN_RUN_MAX_RESPONSE&&bytesOf(big)<=OWN_RUN_FULL_MAX_BYTES,'synthetic receipt must exceed 4 MiB and stay under 32 MiB: '+bytesOf(big));
 const bigSql={query:async()=>[{result:structuredClone(big)}]};
 await assert.rejects(ownCloseOperation(bigSql,principal(OWN_CLOSE_NOMINAL),session,'group',{id:big.groupId}),e=>e.code==='OWN_CLOSE_LIMIT'&&e.status===422);
 assert.equal((await ownCloseOperation(bigSql,principal(OWN_CLOSE_NOMINAL),session,'group',{id:big.groupId},{fullJson:true})).groupId,big.groupId);
 void f;
});

test('lib liquidation detail: FULL reader and 32 MiB capture limit; plain large capture → OWN_LIQ_LIMIT 422, not 503',async()=>{
 const d=liquidationDetail(),texts=[],sql={query:async(q)=>{texts.push(q);return [{result:structuredClone(d)}];}};
 await ownLiquidationOperation(sql,principal(OWN_LIQ_REVIEW),session,'detail',{id:d.id},{fullJson:true});await ownLiquidationOperation(sql,principal(OWN_LIQ_REVIEW),session,'detail',{id:d.id});
 assert.deepEqual(texts,['SELECT public.own_liquidation_detail_full_v1($1::jsonb,$2::uuid) AS result','SELECT public.own_liquidation_detail_v1($1::jsonb,$2::uuid) AS result']);
 const big=liquidationDetail(2600);assert.ok(bytesOf(big)>OWN_RUN_MAX_RESPONSE&&bytesOf(big)<=OWN_RUN_FULL_MAX_BYTES,'synthetic detail must exceed 4 MiB and stay under 32 MiB: '+bytesOf(big));
 const bigSql={query:async()=>[{result:structuredClone(big)}]};
 await assert.rejects(ownLiquidationOperation(bigSql,principal(OWN_LIQ_REVIEW),session,'detail',{id:big.id}),e=>e.code==='OWN_LIQ_LIMIT'&&e.status===422);
 assert.equal((await ownLiquidationOperation(bigSql,principal(OWN_LIQ_REVIEW),session,'detail',{id:big.id},{fullJson:true})).id,big.id);
});

test('close API with inactive admission: report-census is an invalid query and FULL is refused, both before any SQL',async()=>{
 const {f}=fixture(),a=closeApi({sql:()=>{throw Error('must not query');}});
 let r=jsonRes();await a.handler(getReq('/api/internal-own-payroll-close',{resource:'report-census',period:f.query.from,liquidationType:'monthly'}),r);assert.equal(r.statusCode,400);assert.equal(r.value.code,'OWN_CLOSE_QUERY_INVALID');
 r=jsonRes();await a.handler(getReq('/api/internal-own-payroll-close',{resource:'group',id:uid(400)},OWN_RUN_FULL_JSON),r);assert.equal(r.statusCode,503);assert.match(r.value.error,/no está habilitada en esta versión/);
 assert.equal(a.stats.connect,0);assert.equal(a.calls.length,0);
});

test('close API with active admission: census JSON and group FULL stream with exact MIME/bytes; missing capability → 403 without SQL; FULL without stream support → 503',async()=>{
 const {f,census,receipt}=fixture();
 const a=closeApi({admission:ACTIVE,sql:q=>[{result:structuredClone(q.includes('report_census')?census:receipt)}]});
 let r=jsonRes();await a.handler(getReq('/api/internal-own-payroll-close',{resource:'report-census',period:f.query.from,liquidationType:'monthly'}),r);
 assert.equal(r.statusCode,200);assert.deepEqual(r.value,{ok:true,data:census});assert.equal(a.calls.length,1);assert.match(a.calls[0].q,/own_close_report_census_v1/);
 const s=new StreamRes();await a.handler(getReq('/api/internal-own-payroll-close',{resource:'group',id:receipt.groupId},OWN_RUN_FULL_JSON),s);
 assert.equal(s.statusCode,200);assert.equal(s.ended,true);assert.equal(s.headers['Content-Type'],OWN_RUN_FULL_JSON+'; charset=utf-8');
 assert.equal(Number(s.headers['X-MuniControl-JSON-Bytes']),Buffer.concat(s.chunks).length);assert.deepEqual(s.body(),{ok:true,data:receipt});assert.match(a.calls[1].q,/own_close_group_full_v1/);
 const noStream=jsonRes();await a.handler(getReq('/api/internal-own-payroll-close',{resource:'group',id:receipt.groupId},OWN_RUN_FULL_JSON),noStream);assert.equal(noStream.statusCode,503);assert.match(noStream.value.error,/No está disponible la lectura completa/);
 for(const cap of OWN_CLOSE_NOMINAL){const denied=closeApi({admission:ACTIVE,caps:OWN_CLOSE_NOMINAL.filter(c=>c!==cap),sql:()=>{throw Error('must not query');}}),d=jsonRes();await denied.handler(getReq('/api/internal-own-payroll-close',{resource:'report-census',period:f.query.from,liquidationType:'monthly'}),d);assert.equal(d.statusCode,403,cap);assert.equal(denied.stats.connect,0);}
 const tampered=closeApi({admission:ACTIVE,sql:()=>[{result:{...structuredClone(census),sourceVersion:'0'.repeat(64)}}]}),t=jsonRes();await tampered.handler(getReq('/api/internal-own-payroll-close',{resource:'report-census',period:f.query.from,liquidationType:'monthly'}),t);assert.equal(t.statusCode,503);assert.equal(t.value.code,'OWN_CLOSE_CONTRACT_INVALID');
});

test('liquidation API: FULL refused when inactive; with active admission detail streams FULL and plain stays JSON',async()=>{
 const d=liquidationDetail(),wrapped=liquidationDetailFor(d.capture);
 const inactive=liqApi({sql:()=>{throw Error('must not query');}}),r=jsonRes();await inactive.handler(getReq('/api/internal-own-payroll-liquidation',{resource:'detail',id:d.id},OWN_RUN_FULL_JSON),r);assert.equal(r.statusCode,503);assert.match(r.value.error,/no está habilitada/);assert.equal(inactive.stats.connect,0);
 const a=liqApi({admission:ACTIVE,sql:()=>[{result:structuredClone(wrapped)}]}),s=new StreamRes();await a.handler(getReq('/api/internal-own-payroll-liquidation',{resource:'detail',id:d.id},OWN_RUN_FULL_JSON),s);
 assert.equal(s.statusCode,200);assert.deepEqual(s.body(),{ok:true,data:wrapped});assert.match(a.calls[0].q,/own_liquidation_detail_full_v1/);
 const p=jsonRes();await a.handler(getReq('/api/internal-own-payroll-liquidation',{resource:'detail',id:d.id}),p);assert.equal(p.statusCode,200);assert.match(a.calls[1].q,/own_liquidation_detail_v1\(/);
});
