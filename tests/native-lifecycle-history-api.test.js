import test from 'node:test';import assert from 'node:assert/strict';
import {createEmploymentLifecycleHandler} from '../api/internal-employment-lifecycle.js';
import {principal as employeePrincipal,session} from './fixtures/native-employee-synthetic.js';
import {lifecycleHistoryFixture} from './fixtures/native-lifecycle-history-synthetic.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(payload){this.payload=payload;return this;}});
function fixture(options={}){
 const f=lifecycleHistoryFixture(100,{adopted:!!options.adopted}),calls=[],stats={connections:0},principal={...employeePrincipal,tenant:{...employeePrincipal.tenant,effectiveCapabilities:['workforce.employee.read']}};
 const handler=createEmploymentLifecycleHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},sessionFor:()=>session,requireAccess:async(_req,res,gates)=>{stats.gates=gates;if(options.anonymous){res.status(401).json({ok:false});return null;}return{mode:'managed',principal};},getSql:async()=>{stats.connections++;return{query:async(sql,values)=>{calls.push({sql,values});return[{result:options.result??f.history}];}};}});
 const query={resource:'history',contractId:f.bootstrap.subject.contractId},req={method:'GET',query,url:'/api/internal-employment-lifecycle?'+new URLSearchParams(query),headers:{}};
 return{...f,handler,calls,stats,req};
}
for(const adopted of [false,true])test(`authenticated complete ${adopted?'adopted':'fresh'} history uses one fixed read RPC`,async()=>{
 const f=fixture({adopted}),res=response();await f.handler(f.req,res);assert.equal(res.statusCode,200);assert.equal(res.payload.data.proposals.length,100);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].sql,'SELECT public.native_employment_lifecycle_history_v2($1::jsonb,$2::uuid) AS result');assert.equal(f.calls[0].values[1],f.bootstrap.subject.contractId);assert.equal(f.calls[0].values.length,2);
 assert.deepEqual(f.stats.gates.requiredCapabilities,['workforce.employee.read']);assert.equal(f.stats.gates.allowLegacy,false);assert.equal(f.stats.gates.requireCertifiedDataBinding,true);assert.match(res.headers['Cache-Control'],/no-store/);
 const ctx=JSON.parse(f.calls[0].values[0]);assert.equal(ctx.actorSessionId,session.id);assert.equal(ctx.membershipId,employeePrincipal.tenant.membershipId);
});
test('anonymous history does not open the SQL dependency',async()=>{const f=fixture({anonymous:true}),res=response();await f.handler(f.req,res);assert.equal(res.statusCode,401);assert.equal(f.stats.connections,0);});
test('incomplete database history is not returned as a valid population',async()=>{const bad=lifecycleHistoryFixture().history;bad.proposals.pop();const f=fixture({result:bad}),res=response();await f.handler(f.req,res);assert.equal(res.statusCode,503);assert.equal(res.payload.data,undefined);});
for(const key of ['tenantId','membershipId','limit','offset'])test('history refuses client '+key+' before opening SQL',async()=>{const f=fixture(),res=response();f.req.query[key]='1';f.req.url='/api/internal-employment-lifecycle?'+new URLSearchParams(f.req.query);await f.handler(f.req,res);assert.equal(res.statusCode,400);assert.equal(f.stats.connections,0);});
