import test from 'node:test';import assert from 'node:assert/strict';
import {createPositionComparisonHandler} from '../api/internal-position-comparison.js';
import {positionComparisonOperation} from '../lib/internal-position-comparison.js';
import {COMPARISON_READ} from '../assets/position-comparison-model.js';
import {comparisonV2Fixture} from './fixtures/position-comparison-v2-synthetic.js';
import {comparisonFixture,uid} from './fixtures/position-comparison-synthetic.js';
import {bootstrap as annualBootstrap} from './fixtures/annual-position-budget-synthetic.js';
const principal={user:{email:'comparison-v2@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:COMPARISON_READ}},session={email:'comparison-v2@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
const q={resource:'detail-v2',year:'2026',revision:'1',period:'2026-10',liquidationType:'monthly'},input={year:2026,revision:1,period:'2026-10',liquidationType:'monthly'};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}}),request=patch=>{const query={...q,...patch};return{method:'GET',query,url:'/api/internal-position-comparison?'+new URLSearchParams(query)};};
function setup({value,error,authorize,sessionValue=session}={}){const calls=[],access=[];let connections=0;const sql={query:async(text,values)=>{calls.push({text,values});assert.match(text,/^SELECT public\.position_comparison_(?:detail_v[12]|annual_v2)\(/);if(error)throw error;return[{result:value??await comparisonV2Fixture()}];}};const handler=createPositionComparisonHandler({env:{},requireAccess:async(req,res,options)=>{access.push(options);return authorize??{mode:'managed',principal};},sessionFor:()=>sessionValue,getSql:async()=>{connections++;return sql;}});return{handler,sql,calls,access,get connections(){return connections;}};}
const annualRequest=()=>({method:'GET',query:{resource:'annual-v2',year:'2026'},url:'/api/internal-position-comparison?resource=annual-v2&year=2026'});
const annualValue=()=>({...annualBootstrap({approved:true}),permissions:{canPropose:false,canReview:false}});

test('explicit annual V2 reads approved versions through its own read-only facade and managed session',async()=>{
 const value=annualValue(),a=setup({value}),r=response();await a.handler(annualRequest(),r);assert.equal(r.statusCode,200);assert.equal(r.value.data,value);assert.equal(r.value.data.catalog.revision,1);assert.deepEqual(r.value.data.permissions,{canPropose:false,canReview:false});assert.equal(a.calls.length,1);assert.match(a.calls[0].text,/^SELECT public\.position_comparison_annual_v2\(/);assert.deepEqual(a.calls[0].values.slice(1),[2026]);assert.equal(JSON.parse(a.calls[0].values[0]).actorSessionId,session.id);assert.deepEqual(a.access[0].requiredCapabilities,COMPARISON_READ);assert.match(r.headers['Cache-Control'],/no-store/);
 const direct=setup({value});assert.equal(await positionComparisonOperation(direct.sql,principal,session,'annual-v2',{year:2026}),value);assert.equal(direct.calls.length,1);
});

test('annual V2 never retries a missing reader through the old employment-dependent annual bootstrap',async()=>{
 const a=setup({error:Object.assign(Error('private-annual-reader-definition'),{code:'42883'})}),r=response();await a.handler(annualRequest(),r);assert.equal(r.statusCode,503);assert.equal(r.value.data,undefined);assert.equal(a.calls.length,1);assert.ok(a.calls[0].text.includes('position_comparison_annual_v2('));assert.doesNotMatch(JSON.stringify(r.value),/private-annual-reader-definition/);
});

test('annual V2 rejects truncated or altered normative history before returning it',async()=>{
 for(const mutate of [v=>v.proposals.pop(),v=>v.catalog.definitionSha256='f'.repeat(64)]){const value=annualValue();mutate(value);const a=setup({value}),r=response();await a.handler(annualRequest(),r);assert.equal(r.statusCode,503);assert.equal(r.value.data,undefined);assert.equal(a.calls.length,1);}
});

test('annual V2 preserves every capability and rejects ambiguous or foreign query scope before SQL',async()=>{
 for(const capability of COMPARISON_READ){const a=setup({authorize:{mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:COMPARISON_READ.filter(c=>c!==capability)}}}}),r=response();await a.handler(annualRequest(),r);assert.equal(r.statusCode,403);assert.equal(a.connections,0);}
 for(const mutate of [r=>r.url+='&year=2026',r=>{r.query.tenantId=uid(999);r.url+='&tenantId='+uid(999);},r=>r.method='POST']){const a=setup(),req=annualRequest(),r=response();mutate(req);await a.handler(req,r);assert.ok([400,405].includes(r.statusCode));assert.equal(a.access.length,0);assert.equal(a.connections,0);}
});

test('explicit V2 GET reaches only the V2 reader with the original complete capture and managed session',async()=>{
 const value=await comparisonV2Fixture({count:3,closeCount:1}),a=setup({value}),r=response();await a.handler(request(),r);
 assert.equal(r.statusCode,200);assert.equal(r.value.data,value);assert.equal(r.value.data.version,'own-position-comparison.v2');assert.equal(r.value.data.employees.length,1);assert.equal(r.value.data.captures[0].original.payload.population.employees.length,3);
 assert.equal(a.calls.length,1);assert.match(a.calls[0].text,/^SELECT public\.position_comparison_detail_v2\(/);assert.deepEqual(a.calls[0].values.slice(1),[2026,1,'2026-10','monthly']);assert.equal(JSON.parse(a.calls[0].values[0]).actorSessionId,session.id);
 assert.deepEqual(a.access[0].requiredCapabilities,COMPARISON_READ);assert.equal(a.access[0].capabilityMode,'all');assert.equal(a.access[0].allowLegacy,false);assert.equal(a.access[0].requireCertifiedDataBinding,true);assert.match(r.headers['Cache-Control'],/no-store/);
});

test('the V2 library operation preserves the response contract without an implicit V1 retry',async()=>{
 const value=await comparisonV2Fixture(),a=setup({value});assert.equal(await positionComparisonOperation(a.sql,principal,session,'detail-v2',input),value);assert.equal(a.calls.length,1);assert.match(a.calls[0].text,/detail_v2\(/);
});

test('an unavailable V2 reader returns a safe failure and never falls through to the legacy reader',async()=>{
 const a=setup({error:Object.assign(Error('private-missing-reader-definition'),{code:'42883'})}),r=response();await a.handler(request(),r);
 assert.equal(r.statusCode,503);assert.equal(r.value.data,undefined);assert.equal(a.calls.length,1);assert.ok(a.calls.every(c=>c.text.includes('detail_v2(')));assert.doesNotMatch(JSON.stringify(r.value),/private-missing-reader-definition/);
});

test('a legacy response is not accepted as a substitute for a requested V2 response',async()=>{
 const a=setup({value:await comparisonFixture(2)}),r=response();await a.handler(request(),r);assert.equal(r.statusCode,503);assert.equal(r.value.data,undefined);assert.equal(a.calls.length,1);
});

test('V2 rejects a missing original or a wrong closed input pin without returning partial nominal rows',async()=>{
 for(const mutate of [v=>delete v.captures[0].original,v=>v.employees[0].inputSha256='a'.repeat(64)]){const value=await comparisonV2Fixture();mutate(value);const a=setup({value}),r=response();await a.handler(request(),r);assert.equal(r.statusCode,503);assert.equal(r.value.data,undefined);assert.equal(a.calls.length,1);}
});

test('each existing capability remains mandatory for V2 before connecting to SQL',async()=>{
 for(const capability of COMPARISON_READ){const a=setup({authorize:{mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:COMPARISON_READ.filter(c=>c!==capability)}}}}),r=response();await a.handler(request(),r);assert.equal(r.statusCode,403);assert.equal(a.connections,0);assert.equal(a.calls.length,0);}
});

test('an invalid V2 session or a legacy access mode cannot open a nominal connection',async()=>{
 for(const options of [{sessionValue:{...session,id:null}},{authorize:{mode:'legacy',principal}}]){const a=setup(options),r=response();await a.handler(request(),r);assert.ok([401,403].includes(r.statusCode));assert.equal(a.connections,0);assert.equal(a.calls.length,0);}
});

test('ambiguous and foreign-scope V2 query parameters fail before authorization or SQL',async()=>{
 for(const change of [r=>r.url+='&period=2026-10',r=>{r.query.tenantId=uid(999);r.url+='&tenantId='+uid(999);},r=>{r.query.period='2025-10';r.url='/api/internal-position-comparison?'+new URLSearchParams(r.query);},r=>r.method='POST']){const a=setup(),req=request(),r=response();change(req);await a.handler(req,r);assert.ok([400,405].includes(r.statusCode));assert.equal(a.access.length,0);assert.equal(a.connections,0);}
});

test('the explicit V1 resource still uses only the unchanged V1 contract',async()=>{
 const value=await comparisonFixture(2),a=setup({value}),r=response();await a.handler(request({resource:'detail'}),r);assert.equal(r.statusCode,200);assert.equal(r.value.data,value);assert.equal(a.calls.length,1);assert.match(a.calls[0].text,/detail_v1\(/);
});
