// Versioned comparison API regressions. In-memory HTTP/SQL
// dependencies only; this suite is not a native SQL or municipal acceptance test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPositionComparisonHandler} from '../api/internal-position-comparison.js';
import {COMPARISON_READ} from '../assets/position-comparison-model.js';
import {comparisonFixture,uid} from './fixtures/position-comparison-synthetic.js';

const sqlV2='SELECT public.position_comparison_detail_v2($1::jsonb,$2::integer,$3::integer,$4::text,$5::text) AS result';
const sqlV1='SELECT public.position_comparison_detail_v1($1::jsonb,$2::integer,$3::integer,$4::text,$5::text) AS result';
const principal={user:{email:'QA-M10@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:[...COMPARISON_READ]}};
const session={email:'qa-m10@example.invalid',id:uid(3),version:2,releaseSha:'d'.repeat(40)};
const query={resource:'detail-v2',year:'2026',revision:'1',period:'2026-10',liquidationType:'monthly'};
const response=()=>({headers:{},setHeader(key,value){this.headers[key]=value;},status(value){this.statusCode=value;return this;},json(value){this.value=value;return this;}});
const request=(resource='detail-v2')=>{const q={...query,resource};return {method:'GET',query:q,url:'/api/internal-position-comparison?'+new URLSearchParams(q)};};

// Explicit legacy-population proof, not a composite/native source fixture.
// No fields in the original approved annual norm or assignments are changed.
async function legacyPopulationV2(count=3){
 const value=await comparisonFixture(count);value.version='own-position-comparison.v2';
 for(const capture of value.captures)capture.populationProof={version:'own-position-population-proof.v1',shape:'employees',sources:{}};
 return value;
}
function setup(options={}){
 const calls=[],accessCalls=[],sessions=[];let connections=0;
 const env={NODE_ENV:'test'},access=options.access??{mode:'managed',principal:structuredClone(principal)};
 const handler=createPositionComparisonHandler({env,
  requireAccess:async(req,res,requirements)=>{accessCalls.push(requirements);return access;},
  sessionFor:(actualAccess,actualEnv)=>{sessions.push({access:actualAccess,env:actualEnv});return Object.hasOwn(options,'session')?options.session:structuredClone(session);},
  getSql:async actualEnv=>{
   connections++;assert.equal(actualEnv,env);
   return {query:async(text,values)=>{
    calls.push({text,values});
    if(options.sqlError)throw options.sqlError;
    const data=options.source?await options.source():await legacyPopulationV2();
    return options.rowsWrapper?{rows:[{result:data}]}:[{result:data}];
   }};
  }
 });
 return {handler,calls,accessCalls,sessions,env,get connections(){return connections;}};
}
function safeFailure(out,status,privateValues=[]){
 assert.equal(out.statusCode,status);assert.equal(out.value.ok,false);
 assert.deepEqual(Object.keys(out.value).sort(),['code','error','ok']);
 assert.match(out.value.code,/^POSITION_COMPARISON_/);assert.equal(out.value.data,undefined);
 const text=JSON.stringify(out.value);
 for(const value of privateValues)assert.equal(text.includes(value),false,'No private source text or original identity is exposed');
 assert.equal(text.includes('Persona sintética QA'),false);assert.equal(text.includes(uid(100)),false);
}

test('detail-v2 conserva el DTO completo, usa sólo RPC v2 con cinco binds y contexto de sesión, y no-store',async()=>{
 const fixture=await legacyPopulationV2(),before=structuredClone(fixture),a=setup({source:async()=>fixture}),out=response();
 await a.handler(request(),out);
 assert.equal(out.statusCode,200);assert.deepEqual(out.value,{ok:true,data:before});assert.deepEqual(fixture,before);
 assert.equal(out.value.data.version,'own-position-comparison.v2');
 assert.deepEqual(out.value.data.captures[0].populationProof,{version:'own-position-population-proof.v1',shape:'employees',sources:{}});
 assert.equal(a.connections,1);assert.equal(a.calls.length,1);assert.equal(a.calls[0].text,sqlV2);
 assert.equal(a.calls[0].values.length,5);assert.deepEqual(a.calls[0].values.slice(1),[2026,1,'2026-10','monthly']);
 assert.deepEqual(JSON.parse(a.calls[0].values[0]),{actorEmail:'qa-m10@example.invalid',actorSessionId:session.id,actorSessionVersion:session.version,releaseSha:session.releaseSha,tenantId:principal.tenant.id,membershipId:principal.tenant.membershipId});
 assert.equal(a.accessCalls.length,1);assert.deepEqual(a.accessCalls[0],{env:a.env,requiredCapabilities:COMPARISON_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
 assert.equal(a.sessions.length,1);assert.equal(a.sessions[0].env,a.env);
 assert.match(out.headers['Cache-Control'],/private/);assert.match(out.headers['Cache-Control'],/no-store/);assert.equal(out.headers.Pragma,'no-cache');
});

test('detail-v2 rechaza consulta extra o duplicada antes de autorizar o abrir SQL',async()=>{
 for(const mutate of [req=>{req.query.tenantId=uid(1);req.url+='&tenantId='+uid(1);},req=>{req.url+='&revision=1';}]){
  const a=setup(),req=request(),out=response();mutate(req);await a.handler(req,out);
  safeFailure(out,400);assert.equal(a.accessCalls.length,0);assert.equal(a.connections,0);assert.equal(a.calls.length,0);
 }
});

test('detail-v2 no admite POST ni cuerpo como sustituto del recurso de lectura',async()=>{
 const a=setup(),req=request(),out=response();req.method='POST';req.body={resource:'detail-v2',tenantId:uid(1)};
 await a.handler(req,out);safeFailure(out,405);assert.equal(out.headers.Allow,'GET');assert.equal(a.accessCalls.length,0);assert.equal(a.connections,0);assert.equal(a.calls.length,0);
});

test('detail-v2 exige cada permiso existente de COMPARISON_READ antes de getSql',async()=>{
 for(const removed of COMPARISON_READ){
  const actor=structuredClone(principal);actor.tenant.effectiveCapabilities=actor.tenant.effectiveCapabilities.filter(cap=>cap!==removed);
  const a=setup({access:{mode:'managed',principal:actor}}),out=response();await a.handler(request(),out);
  safeFailure(out,403);assert.equal(a.connections,0,removed);assert.equal(a.calls.length,0,removed);
 }
});

test('RPC v2 que devuelve DTO v1 se rechaza con 503 sin downgrade ni nominales',async()=>{
 const source=await comparisonFixture(3),privateName=source.captures[0].dimensions.payload.employees[0].name;
 const a=setup({source:async()=>source}),out=response();await a.handler(request(),out);
 assert.equal(a.calls.length,1);assert.equal(a.calls[0].text,sqlV2);safeFailure(out,503,[privateName,source.captures[0].id]);
});

test('fallo de SQL v2 se informa sin filtrar su mensaje, binds ni datos parciales',async()=>{
 const secret='private-m10-sql-diagnostic-and-person-should-not-leak',a=setup({sqlError:Error(secret)}),out=response();
 await a.handler(request(),out);safeFailure(out,503,[secret,principal.user.email,principal.tenant.id]);
 assert.equal(a.connections,1);assert.equal(a.calls.length,1);assert.equal(a.calls[0].text,sqlV2);
});

test('DTO v2 con captura de población incompleta no entrega una comparación parcial',async()=>{
 const source=await legacyPopulationV2();source.captures[0].population.complete=false;
 const a=setup({source:async()=>source}),out=response();await a.handler(request(),out);
 safeFailure(out,503,[source.captures[0].id]);assert.equal(a.calls.length,1);assert.equal(a.calls[0].text,sqlV2);
});

test('DTO v2 rechaza la huella alterada de la población original sin completar desde otro padrón',async()=>{
 const source=await legacyPopulationV2();source.captures[0].population.version='e'.repeat(64);
 const a=setup({source:async()=>source}),out=response();await a.handler(request(),out);
 safeFailure(out,503,[source.captures[0].id]);assert.equal(a.calls.length,1);assert.equal(a.calls[0].text,sqlV2);
});

test('detail-v2 requiere modo managed y membresía; no usa ámbito legacy ni abre SQL',async()=>{
 for(const access of [{mode:'legacy',principal:structuredClone(principal)},{mode:'managed',principal:{...structuredClone(principal),tenant:{...structuredClone(principal.tenant),source:'legacy'}}}]){
  const a=setup({access}),out=response();await a.handler(request(),out);safeFailure(out,403);assert.equal(a.connections,0);assert.equal(a.calls.length,0);
 }
});

test('sesión v2 inválida se detiene antes de getSql incluso con todos los permisos',async()=>{
 for(const invalid of [{...session,id:null},{...session,email:'different@example.invalid'},{...session,releaseSha:'not-a-release'}]){
  const a=setup({session:invalid}),out=response();await a.handler(request(),out);
  safeFailure(out,401);assert.equal(a.accessCalls.length,1);assert.equal(a.connections,0);assert.equal(a.calls.length,0);
 }
});

test('el recurso detail anterior conserva su RPC y DTO v1 sin adoptar v2 implícitamente',async()=>{
 const source=await comparisonFixture(3),a=setup({source:async()=>source,rowsWrapper:true}),out=response();
 await a.handler(request('detail'),out);assert.equal(out.statusCode,200);assert.deepEqual(out.value,{ok:true,data:source});
 assert.equal(a.calls.length,1);assert.equal(a.calls[0].text,sqlV1);assert.equal(a.calls[0].values.length,5);assert.equal(out.value.data.version,'own-position-comparison.v1');
 assert.equal(Object.hasOwn(out.value.data.captures[0],'populationProof'),false);
});

test('el panel solicita detail-v2 explícito, sin fallback silencioso a detail',()=>{
 const source=fs.readFileSync(new URL('../assets/position-comparison-panel.js',import.meta.url),'utf8');
 assert.match(source,/client\.request\(\{resource:'detail-v2',year:String\(q\.year\)/);
 assert.doesNotMatch(source,/client\.request\(\{resource:'detail',/);
});
