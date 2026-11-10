import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnContractSalaryConditionsHandler} from '../api/internal-own-contract-salary-conditions.js';
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const caps=['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.approve'];
const principal={user:{email:'pending-qa@example.invalid'},tenant:{source:'membership',id:id(1),membershipId:id(2),effectiveCapabilities:caps}};
const session={email:principal.user.email,id:id(3),version:1,releaseSha:'d'.repeat(40)};
const sample=()=>({version:'own-contract-salary-conditions.pending.v1',generatedAt:'2026-11-10T15:00:00.000Z',complete:true,decisionWindowDays:30,toReview:[{proposalId:id(11),period:'2026-10',authorLabel:'Preparador QA',createdAt:'2026-11-09T15:00:00.000Z',canReview:true}],decided:[{eventId:id(13),proposalId:id(12),period:'2026-09',status:'approved',actorLabel:'Revisor QA',recordedAt:'2026-11-09T15:00:00.000Z'}],counts:{toReview:1,decided:1},payrollCalculated:false,payrollPosted:false});
const request=()=>({method:'GET',url:'/api/internal-own-contract-salary-conditions?resource=pending',query:{resource:'pending'},headers:{}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
function setup(result,overrides={}) {
 const calls=[];
 const handler=createOwnContractSalaryConditionsHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>({query:async(query,values)=>{calls.push({query,values});return[{result:await result()}];}}),...overrides});
 return{handler,calls};
}
test('pending GET reads the metadata-only facade once with the authenticated context',async()=>{
 const a=setup(sample),out=response();await a.handler(request(),out);
 assert.equal(out.statusCode,200);assert.deepEqual(out.value.data,sample());assert.equal(a.calls.length,1);
 assert.equal(a.calls[0].query,'SELECT public.own_salary_conditions_pending_v1($1::jsonb) AS result');
 const context=JSON.parse(a.calls[0].values[0]);assert.equal(context.actorSessionId,session.id);assert.equal(context.membershipId,principal.tenant.membershipId);
 assert.match(out.headers['Cache-Control'],/no-store/);
});
test('pending retains current read capabilities, managed membership and normal session checks',async()=>{
 for(const override of [{requireAccess:async()=>({mode:'legacy',principal})},{requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:caps.filter(c=>c!=='payroll.calculation.nominal.read')}}})},{sessionFor:()=>({...session,id:null})}]) {
  const a=setup(sample,override),out=response();await a.handler(request(),out);assert.ok([401,403].includes(out.statusCode));assert.equal(a.calls.length,0);
 }
});
test('pending refuses caller-selected identity, period, pagination or duplicate query keys',async()=>{
 for(const extra of [{period:'2026-10'},{tenantId:id(8)},{actorEmail:'forged@example.invalid'},{limit:'1'}]) {
  const req=request();Object.assign(req.query,extra);req.url='/api/internal-own-contract-salary-conditions?'+new URLSearchParams(req.query);
  const a=setup(sample),out=response();await a.handler(req,out);assert.equal(out.statusCode,400);assert.equal(a.calls.length,0);
 }
 const req=request();req.url+='&resource=pending';const a=setup(sample),out=response();await a.handler(req,out);assert.equal(out.statusCode,400);assert.equal(a.calls.length,0);
});
test('corrupt, partial or nominal pending responses are withheld',async()=>{
 for(const patch of [{complete:false},{source:{subjects:[]}},{counts:{toReview:0,decided:1}},{payrollCalculated:true}]) {
  const a=setup(()=>({...sample(),...patch})),out=response();await a.handler(request(),out);assert.equal(out.statusCode,503);assert.equal(out.value.data,undefined);
 }
});
test('busy pending read preserves the domain error without entering the period recovery whitelist',async()=>{
 const a=setup(()=>{throw Error('SALARY_CONDITIONS_BUSY');}),out=response();await a.handler(request(),out);assert.equal(out.statusCode,409);assert.equal(a.calls.length,1);assert.equal(out.value.code,'SALARY_CONDITIONS_BUSY');
});
test('pending is a GET resource and cannot be used as a write command',async()=>{
 const a=setup(sample),req=request(),out=response();req.method='POST';await a.handler(req,out);assert.equal(out.statusCode,400);assert.equal(a.calls.length,0);
});