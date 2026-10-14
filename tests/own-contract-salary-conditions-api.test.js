import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnContractSalaryConditionsHandler} from '../api/internal-own-contract-salary-conditions.js';
import {salaryConditionsFingerprint} from '../lib/internal-own-contract-salary-conditions.js';
import {syntheticConditionsCommand as command,syntheticConditionsBootstrap as bootstrap,syntheticConditionsDetail as detail,syntheticConditionsReceipt as receipt,conditionsId as id} from './fixtures/own-contract-salary-conditions-synthetic.js';
const caps=['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.prepare','payroll.parameter.approve'];
const principal={user:{email:'conditions-qa@example.invalid'},tenant:{source:'membership',id:id(20001),membershipId:id(20002),effectiveCapabilities:caps}};
const session={email:principal.user.email,id:id(20003),version:1,releaseSha:'d'.repeat(40)},key=id(10002);
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
const request=(count=1)=>({method:'POST',url:'/api/internal-own-contract-salary-conditions',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':key},body:JSON.stringify({operation:'command',payload:command(count)})});
function get(resource,extra){const r=request();r.method='GET';r.query={resource,...extra};r.url+='?'+new URLSearchParams(r.query);return r;}
function setup(result,overrides={}){
 const calls=[],stats={connections:0,authorizations:0};
 const handler=createOwnContractSalaryConditionsHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>{stats.authorizations++;return{mode:'managed',principal};},sessionFor:()=>session,getSql:async()=>{stats.connections++;return{query:async(q,v)=>{calls.push({q,v});return[{result:await result()}];}};},...overrides});return{handler,calls,stats};
}
test('one voluntary write conserves all855 original rows, bound actor session, exact body and key',async()=>{
 const a=setup(()=>receipt(855)),r=request(855),out=response();await a.handler(r,out);
 assert.equal(out.statusCode,201);assert.equal(a.calls.length,1);assert.match(a.calls[0].q,/own_salary_conditions_command_v1/);
 assert.equal(JSON.parse(a.calls[0].v[0]).actorSessionId,session.id);assert.equal(a.calls[0].v[2],key);
 assert.deepEqual(JSON.parse(a.calls[0].v[1]),command(855));assert.deepEqual(out.value.data.body,command(855));assert.equal(out.value.data.body.items.length,855);
 assert.equal(out.value.data.payrollCalculated,false);assert.equal(out.value.data.payrollPosted,false);assert.match(out.headers['Cache-Control'],/no-store/);
});
test('whole-cohort nominal access and current session are required before touching body or SQL',async()=>{
 for(const override of [{requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:caps.filter(c=>c!=='payroll.calculation.nominal.read')}}})},{requireAccess:async()=>({mode:'legacy',principal})},{sessionFor:()=>({...session,id:null})}]){
  const a=setup(()=>receipt(),override),r=request(),out=response();let reads=0;
  Object.defineProperty(r,'body',{get(){reads++;throw Error('private body must remain unread');}});await a.handler(r,out);
  assert.ok([401,403].includes(out.statusCode));assert.equal(reads,0);assert.equal(a.stats.connections,0);
 }
});
for(const[label,mutate]of[
 ['foreign origin',r=>r.headers.origin='https://foreign.invalid'],
 ['wrong content type',r=>r.headers['content-type']='text/plain'],
 ['missing request key',r=>delete r.headers['idempotency-key']],
 ['uppercase request key',r=>r.headers['idempotency-key']='AAAAAAAA-0000-4000-8000-000000000004'],
 ['duplicate escaped JSON property',r=>r.body='{"operation":"command","operati\\u006fn":"command"}'],
 ['invalid UTF8',r=>r.body=Buffer.from([0xff])],
 ['unsupported method',r=>r.method='DELETE'],
 ['query on write',r=>{r.query={resource:'command'};r.url+='?resource=command';}],
 ['forged actor',r=>r.body=JSON.stringify({operation:'command',payload:{...command(),actorEmail:'forged@example.invalid'}})],
 ['a numeric title percentage',r=>{const b=command();b.items[0].definition.title={status:'declared',code:'56',percentage:12.5};r.body=JSON.stringify({operation:'command',payload:b});}],
 ['an inferred zero for no title',r=>{const b=command();b.items[0].definition.title={status:'none',code:null,percentage:'0'};r.body=JSON.stringify({operation:'command',payload:b});}],
 ['numeric unhealthy work',r=>{const b=command();b.items[0].definition.unhealthyWork=1;r.body=JSON.stringify({operation:'command',payload:b});}],
 ['a nominal extra column',r=>{const b=command();b.items[0].definition.dni='synthetic';r.body=JSON.stringify({operation:'command',payload:b});}],
 ['duplicate contract',r=>{const b=command();b.items.push(structuredClone(b.items[0]));r.body=JSON.stringify({operation:'command',payload:b});}],
 ['percentage precision overflow',r=>{const b=command();b.items[0].definition.title={status:'declared',code:'56',percentage:'12.123456789'};r.body=JSON.stringify({operation:'command',payload:b});}],
])test('rejects '+label+' before executing SQL',async()=>{const a=setup(()=>receipt()),r=request(),out=response();mutate(r);await a.handler(r,out);assert.ok(out.statusCode>=400);assert.equal(a.calls.length,0);});
test('bootstrap returns every subject and rejects a different period or incomplete response',async()=>{
 const a=setup(()=>bootstrap(855)),out=response();await a.handler(get('bootstrap',{period:'2026-10'}),out);
 assert.equal(out.statusCode,200);assert.equal(out.value.data.source.subjects.length,855);
 for(const patch of[{period:'2026-09'},{complete:false}]){const bad=setup(()=>({...bootstrap(),...patch})),res=response();await bad.handler(get('bootstrap',{period:'2026-10'}),res);assert.equal(res.statusCode,503);}
});
test('ambiguous or unexpected GET properties are refused without a query',async()=>{
 for(const make of [()=>({...get('bootstrap',{period:'2026-10'}),url:'/api/internal-own-contract-salary-conditions?resource=bootstrap&period=2026-10&period=2026-09'}),()=>get('bootstrap',{period:'2026-10',contractId:id(1)}),()=>({...get('detail',{id:id(1)}),query:{resource:'detail',id:[id(1),id(2)]}})]){
  const a=setup(()=>bootstrap()),out=response();await a.handler(make(),out);assert.equal(out.statusCode,400);assert.equal(a.calls.length,0);
 }
});
test('a reviewer detail keeps another reader scope without changing the signed proposal body',async()=>{
 const d=await detail(855);d.scopeVersion='b'.repeat(64);const a=setup(()=>d),out=response();await a.handler(get('detail',{id:d.proposal.id}),out);
 assert.equal(out.statusCode,200);assert.equal(out.value.data.scopeVersion,'b'.repeat(64));assert.equal(out.value.data.body.scopeVersion,'a'.repeat(64));
 assert.equal(out.value.data.proposal.requestSha256,salaryConditionsFingerprint(out.value.data.body));
 const broken=structuredClone(d);broken.body.items[854].definition.unhealthyWork=false;const bad=setup(()=>broken),res=response();await bad.handler(get('detail',{id:d.proposal.id}),res);assert.equal(res.statusCode,503);
});
test('attempt recovery reads the same key and whole original body without any command',async()=>{
 const r=await receipt(855);r.replayed=true;const a=setup(()=>r),out=response();await a.handler(get('attempt',{key}),out);
 assert.equal(out.statusCode,200);assert.equal(out.headers['Idempotency-Replayed'],'true');assert.deepEqual(out.value.data.body,command(855));assert.equal(a.calls.length,1);assert.match(a.calls[0].q,/own_salary_conditions_attempt_v1/);
});
test('corrupt receipts, last-row substitutions and fake payroll effects are withheld',async()=>{
 const correct=await receipt(855);
 const cases=[{...correct,requestSha256:'f'.repeat(64)},{...correct,payrollCalculated:true},{...correct,payrollPosted:true},{...correct,requestKey:id(12345)}];
 const substituted=structuredClone(correct);substituted.body.items[854].definition.partialSeniorityYears='0';cases.push(substituted);
 for(const r of cases){const a=setup(()=>r),out=response();await a.handler(request(855),out);assert.equal(out.statusCode,503);assert.equal(out.value.data,undefined);}
});
test('error classes remain distinct and internal details never reach the operator',async()=>{
 for(const[message,status,code]of[['SALARY_CONDITIONS_INDEPENDENT_REQUIRED private@example.invalid',403,'INDEPENDENT_REQUIRED'],['SALARY_CONDITIONS_POPULATION_CHANGED',409,'POPULATION_CHANGED'],['SALARY_CONDITIONS_BASE_CHANGED',409,'BASE_CHANGED'],['ACTION_SESSION_INVALID',401,'SESSION_INVALID'],['password hidden internal diagnostic',503,'UNAVAILABLE']]){
  const a=setup(()=>null,{getSql:async()=>({query:async()=>{throw Error(message);}})}),out=response();await a.handler(request(),out);
  assert.equal(out.statusCode,status);assert.equal(out.value.code,'SALARY_CONDITIONS_'+code);assert.ok(!JSON.stringify(out.value).includes('@'));assert.ok(!JSON.stringify(out.value).includes('password'));assert.ok(!JSON.stringify(out.value).includes('hidden'));
 }
});
test('a transient read rechecks the same full access before one bounded recovery',async()=>{
 let reads=0,auth=0;const a=setup(()=>null,{requireAccess:async()=>{auth++;return{mode:'managed',principal};},getSql:async()=>({query:async(q)=>{assert.match(q,/own_salary_conditions_bootstrap_v1/);reads++;if(reads===1)throw Error('SALARY_CONDITIONS_BUSY');return[{result:bootstrap()}];}})}),out=response();
 await a.handler(get('bootstrap',{period:'2026-10'}),out);assert.equal(out.statusCode,200);assert.equal(reads,2);assert.equal(auth,2);
});
test('revocation or a changed session while waiting prevents the second read',async()=>{
 for(const changedSession of[false,true]){
  let reads=0,auth=0;const a=setup(()=>null,{requireAccess:async()=>{auth++;return{mode:'managed',principal:!changedSession&&auth>1?{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}}:principal};},sessionFor:()=>changedSession&&auth>1?{...session,version:2}:session,getSql:async()=>({query:async()=>{reads++;throw Error('SALARY_CONDITIONS_BUSY');}})}),out=response();
  await a.handler(get('bootstrap',{period:'2026-10'}),out);assert.equal(out.statusCode,changedSession?409:403);assert.equal(reads,1);assert.equal(auth,2);
 }
});
test('a pending write is never repeated on busy or an unknown outcome',async()=>{
 for(const error of ['SALARY_CONDITIONS_BUSY','unexpected closed connection']){
  let reads=0,auth=0;const a=setup(()=>null,{requireAccess:async()=>{auth++;return{mode:'managed',principal};},getSql:async()=>({query:async()=>{reads++;throw Error(error);}})}),out=response();
  await a.handler(request(855),out);assert.ok([409,503].includes(out.statusCode));assert.equal(reads,1);assert.equal(auth,1);
 }
});
