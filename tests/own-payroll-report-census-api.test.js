import test from 'node:test';import assert from 'node:assert/strict';
import {createOwnCloseHandler} from '../api/internal-own-payroll-close.js';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {reportCensusFixture,oneGroupCensus} from './fixtures/own-payroll-report-census-synthetic.js';
import {verifiedOwnReportCensus} from '../assets/own-payroll-report-census-model.js';

const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:OWN_CLOSE_NOMINAL}};
const session={email:'qa@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
function request(query={resource:'report-census',period:'2026-09',liquidationType:'sac'}){return {method:'GET',url:'/api/internal-own-payroll-close?'+new URLSearchParams(query),query,headers:{}};}
function setup({caps=OWN_CLOSE_NOMINAL,value=reportCensusFixture(),error=null}={}){
 const calls=[],stats={connect:0},seen=[];
 const handler=createOwnCloseHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async(_req,_res,options)=>{seen.push(options);return {mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:caps}}};},sessionFor:()=>session,getSql:async()=>{stats.connect++;return {query:async(sql,values)=>{calls.push({sql,values});assert.doesNotMatch(sql,/own_close_detail_v1|own_close_roster_v1|own_imputation_/);if(error)throw error;return [{result:value}];}};}});
 return {handler,calls,stats,seen};
}

test('GET censo de tipo sin cierres devuelve vacío probado sin consultar padrón operativo',async()=>{
 const a=setup(),r=response();await a.handler(request(),r);
 assert.equal(r.statusCode,200);assert.equal(a.calls.length,1);
 assert.match(a.calls[0].sql,/SELECT public\.own_close_report_census_v1\(\$1::jsonb,\$2::text,\$3::text\)/);
 assert.deepEqual(a.calls[0].values.slice(1),['2026-09','sac']);
 assert.equal(JSON.parse(a.calls[0].values[0]).membershipId,principal.tenant.membershipId);
 assert.deepEqual(a.seen[0].requiredCapabilities,OWN_CLOSE_NOMINAL);
 assert.equal(a.seen[0].requireCertifiedDataBinding,true);assert.equal(a.seen[0].allowLegacy,false);
 assert.equal(r.value.ok,true);assert.equal(r.value.data.eventCount,0);assert.deepEqual(r.value.data.groups,[]);
 assert.match(r.headers['Cache-Control'],/no-store/);
});
test('cada capacidad nominal actual sigue siendo obligatoria antes de conectar',async()=>{
 for(const cap of OWN_CLOSE_NOMINAL){const a=setup({caps:OWN_CLOSE_NOMINAL.filter(v=>v!==cap)}),r=response();await a.handler(request(),r);assert.equal(r.statusCode,403,cap);assert.equal(a.stats.connect,0);}
});
test('un error del lector jamás se convierte en un censo vacío',async()=>{
 for(const error of [Error('OWN_RUN_HISTORY_REQUIRED'),Error('OWN_CLOSE_BUSY'),Error('synthetic unavailable')]){
  const a=setup({error}),r=response();await a.handler(request(),r);assert.ok(r.statusCode>=400);assert.equal(r.value.ok,false);assert.equal(Object.hasOwn(r.value,'data'),false);assert.equal(a.calls.length,1);
  if(['OWN_CLOSE_BUSY','synthetic unavailable'].includes(error.message)){assert.match(r.value.error,/consultar.*histórico|histórico.*consultar/i);assert.doesNotMatch(r.value.error,/envío|confirmó el cierre|synthetic/);}
 }
});
test('respuesta de otro mes/tipo, truncada o con huella corrupta invalida toda la consulta',async()=>{
 const values=[reportCensusFixture({period:'2026-10'}),reportCensusFixture({liquidationType:'monthly'}),...[
  v=>v.complete=false,v=>v.eventCount=1,v=>v.sourceVersion='f'.repeat(64)
 ].map(change=>{const value=reportCensusFixture();change(value);return value;})];
 for(const value of values){
  const a=setup({value}),r=response();await a.handler(request(),r);assert.equal(r.statusCode,503);assert.equal(r.value.ok,false);assert.equal(Object.hasOwn(r.value,'data'),false);
 }
});
test('no acepta parámetros de filtro, consultas ambiguas ni POST sobre el recurso de lectura',async()=>{
 for(const change of [
  r=>{r.query.search='x';r.url+='&search=x';},
  r=>{r.url+='&period=2026-09';},
  r=>{r.query.limit='1';r.url+='&limit=1';},
  r=>{r.method='POST';r.headers={'content-type':'application/json',origin:'https://municipio.example'};r.body='{}';}
 ]){
  const a=setup(),r=response(),q=request();change(q);await a.handler(q,r);assert.ok(r.statusCode>=400);assert.equal(a.stats.connect,0);
 }
});

test('período/tipo inválidos se rechazan antes de abrir la conexión',async()=>{
 for(const query of [{period:'2026-13',liquidationType:'sac'},{period:'2026-09',liquidationType:'all'},{period:'2026-09',liquidationType:''}]){
  const a=setup(),r=response();await a.handler(request({resource:'report-census',...query}),r);assert.equal(r.statusCode,422);assert.equal(a.stats.connect,0);assert.equal(a.calls.length,0);
 }
});

test('el lector conserva una reapertura y su cierre; no los transforma en ausencia',async()=>{
 const value=oneGroupCensus({reopened:true});await verifiedOwnReportCensus(value);
 const a=setup({value}),r=response();await a.handler(request({resource:'report-census',period:'2026-09',liquidationType:'monthly'}),r);
 assert.equal(r.statusCode,200);assert.equal(a.calls.length,1);assert.equal(r.value.data.eventCount,2);assert.equal(r.value.data.groups[0].state,'reopened');assert.deepEqual(r.value.data,value);
});
