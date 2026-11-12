import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnContractFamilySelectedHandler} from '../api/internal-own-contract-family-payroll-facts-selection.js';
import {selectedIds,selectedBootstrap,selectedHistory,selectedCommand,selectedDetail,selectedReceipt,familyId as id} from './fixtures/own-contract-family-selected-synthetic.js';
const caps=['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.prepare','payroll.parameter.approve'];
const principal={user:{email:'selected-family-qa@example.invalid'},tenant:{source:'membership',id:id(20001),membershipId:id(20002),effectiveCapabilities:caps}};
const session={email:principal.user.email,id:id(20003),version:1,releaseSha:'d'.repeat(40)},key=id(10002),endpoint='/api/internal-own-contract-family-payroll-facts-selection';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
const request=(operation='command',payload=selectedCommand())=>({method:'POST',url:endpoint,query:{},headers:{origin:'https://municipio.example','content-type':'application/json',...(operation==='command'?{'idempotency-key':key}:{})},body:JSON.stringify({operation,payload})});
const get=(resource,extra)=>({method:'GET',query:{resource,...extra},url:endpoint+'?'+new URLSearchParams({resource,...extra}),headers:{}});
function setup(result,overrides={}){const calls=[],stats={connections:0};const handler=createOwnContractFamilySelectedHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>{stats.connections++;return{query:async(q,v)=>{calls.push({q,v});return[{result:await result()}];}};},...overrides});return{handler,calls,stats};}
test('read bootstrap POST fixes exactly two IDs and returns200 without invoking command',async()=>{
 const a=setup(selectedBootstrap),out=response();await a.handler(request('bootstrap',{period:'2026-10',contractIds:selectedIds()}),out);
 assert.equal(out.statusCode,200);assert.equal(a.calls.length,1);assert.match(a.calls[0].q,/bootstrap_v2/);assert.doesNotMatch(a.calls[0].q,/command/);assert.deepEqual(JSON.parse(a.calls[0].v[2]),selectedIds());assert.equal(JSON.parse(a.calls[0].v[0]).actorSessionId,session.id);assert.equal(out.value.data.source.subjects.length,2);
});
test('one command conserves only selected rows and the bound real principal context',async()=>{
 const a=setup(selectedReceipt),out=response();await a.handler(request(),out);assert.equal(out.statusCode,201);assert.match(a.calls[0].q,/command_v2/);assert.deepEqual(JSON.parse(a.calls[0].v[1]),selectedCommand());assert.equal(a.calls[0].v[2],key);assert.equal(out.value.data.body.items.length,2);assert.match(out.headers['Cache-Control'],/no-store/);
});
test('access and session are required before private input or SQL is read',async()=>{
 for(const override of[{requireAccess:async()=>({mode:'legacy',principal})},{requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}}})},{sessionFor:()=>({...session,id:null})}]){
  const a=setup(selectedReceipt,override),req=request(),out=response();let reads=0;Object.defineProperty(req,'body',{get(){reads++;throw Error('private input');}});await a.handler(req,out);assert.ok([401,403].includes(out.statusCode));assert.equal(reads,0);assert.equal(a.stats.connections,0);
 }
});
for(const [label,mutate] of[
 ['foreign origin',r=>r.headers.origin='https://foreign.invalid'],['missing key',r=>delete r.headers['idempotency-key']],
 ['duplicate escaped input key',r=>r.body='{"operation":"command","operati\\u006fn":"command"}'],
 ['unknown scope',r=>r.body=JSON.stringify({operation:'command',payload:{...selectedCommand(),tenantId:id(9)}})],
 ['duplicate selection',r=>{const b=selectedCommand();b.contractIds=[id(1),id(1)];r.body=JSON.stringify({operation:'command',payload:b});}],
 ['incomplete selected rows',r=>{const b=selectedCommand();b.items.pop();r.body=JSON.stringify({operation:'command',payload:b});}],
 ['noncanonical scope',r=>{const b=selectedCommand();b.contractIds.reverse();r.body=JSON.stringify({operation:'command',payload:b});}],
 ['bootstrap idempotency key',r=>{r.body=JSON.stringify({operation:'bootstrap',payload:{period:'2026-10',contractIds:selectedIds()}});}],
 ['query mutation',r=>{r.query={resource:'command'};r.url+='?resource=command';}]
])test('rejects '+label+' before any SQL',async()=>{const a=setup(selectedReceipt),out=response(),req=request();mutate(req);await a.handler(req,out);assert.ok(out.statusCode>=400);assert.equal(a.calls.length,0);});
test('read capabilities allow selection discovery but never imply prepare',async()=>{
 const p={...principal,tenant:{...principal.tenant,effectiveCapabilities:caps.filter(c=>!['payroll.parameter.prepare','payroll.parameter.approve'].includes(c))}};
 const a=setup(selectedBootstrap,{requireAccess:async()=>({mode:'managed',principal:p})}),out=response();await a.handler(request('bootstrap',{period:'2026-10',contractIds:selectedIds()}),out);assert.equal(out.statusCode,200);
 const denied=response();await a.handler(request(),denied);assert.equal(denied.statusCode,403);assert.equal(a.calls.length,1);
});
test('a substituted selection or period from SQL is withheld',async()=>{
 for(const mutate of[v=>v.period='2026-09',v=>v.contractIds=[id(1)],v=>v.complete=false]){const b=selectedBootstrap();mutate(b);const a=setup(()=>b),out=response();await a.handler(request('bootstrap',{period:'2026-10',contractIds:selectedIds()}),out);assert.equal(out.statusCode,503);assert.equal(out.value.data,undefined);}
});
test('history, details and same-key recovery use only read entries',async()=>{
 for(const [resource,input,value,fn] of [['history',{period:'2026-10'},selectedHistory,'history_v2'],['detail',{id:id(10001)},selectedDetail,'detail_v2'],['attempt',{key},async()=>({...await selectedReceipt(),replayed:true}),'attempt_v2']]){
  const a=setup(value),out=response();await a.handler(get(resource,input),out);assert.equal(out.statusCode,200);assert.equal(a.calls.length,1);assert.match(a.calls[0].q,new RegExp(fn));assert.doesNotMatch(a.calls[0].q,/command_v2/);
 }
});
test('write busy and uncertain transport never replay automatically',async()=>{
 for(const message of['FAMILY_PAYROLL_FACTS_BUSY','closed transport']){let n=0;const a=setup(()=>null,{getSql:async()=>({query:async()=>{n++;throw Error(message);}})}),out=response();await a.handler(request(),out);assert.ok([409,503].includes(out.statusCode));assert.equal(n,1);}
});
