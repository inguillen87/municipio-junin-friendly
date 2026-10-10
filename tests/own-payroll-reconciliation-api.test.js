import test from 'node:test';import assert from 'node:assert/strict';
import {createOwnReconciliationHandler} from '../api/internal-own-payroll-reconciliation.js';
import {RECONCILIATION_READ,RECONCILIATION_CAPS,prepareReconciliation} from '../assets/own-payroll-reconciliation-model.js';
import {reconciliationFixture,approvedReconciliationFixture} from './fixtures/own-payroll-reconciliation-synthetic.js';
import {accountingHash} from '../assets/own-payroll-accounting-model.js';
const uid=n=>`cccccccc-0000-4000-8000-${String(n).padStart(12,'0')}`;
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:[...RECONCILIATION_READ,...RECONCILIATION_CAPS.propose,...RECONCILIATION_CAPS.approve]}};
const session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.value=v;return this;}});
async function setup(overrides={}){
 const f=await reconciliationFixture(2),body=await prepareReconciliation(f.source,f.document,'Declaración exclusivamente sintética para API'),receipt={version:'own-payroll-reconciliation.v1',eventId:uid(40),proposalId:uid(40),requestKey:uid(41),requestSha256:await accountingHash(body),body,status:'pending',comparisonSha256:body.comparisonSha256,sourceVersion:body.sourceVersion,replayed:false,accountingReconciled:false,paymentExecuted:false,externalAcceptance:false},calls=[],stats={connections:0};
 const handler=createOwnReconciliationHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>{stats.connections++;return{query:async(q,v)=>{calls.push({q,v});return[{result:receipt}];}};},...overrides});
 const req={method:'POST',url:'/api/internal-own-payroll-reconciliation',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':receipt.requestKey},body:JSON.stringify({operation:'command',payload:body})};return{f,body,receipt,calls,stats,handler,req};
}
test('propuesta conserva documento completo y sesión; no concilia, contabiliza ni paga',async()=>{const a=await setup(),res=response();await a.handler(a.req,res);assert.equal(res.statusCode,201);assert.equal(a.calls.length,1);assert.deepEqual(res.value.data.body,a.body);assert.equal(JSON.parse(a.calls[0].v[0]).actorSessionId,session.id);assert.equal(res.value.data.accountingReconciled,false);assert.equal(res.value.data.externalAcceptance,false);assert.match(res.headers['Cache-Control'],/no-store/);});
for(const[label,change]of [
 ['origen ajeno',r=>r.headers.origin='https://otro.invalid'],
 ['query duplicada',r=>{r.method='GET';r.query={resource:'attempt',key:uid(9)};r.url+='?resource=attempt&resource=attempt&key='+uid(9);}],
 ['JSON duplicado',r=>r.body='{"operation":"command","operati\\u006fn":"command"}'],
 ['clave ausente',r=>delete r.headers['idempotency-key']],
 ['clave normalizada',r=>r.headers['idempotency-key']=r.headers['idempotency-key'].toUpperCase()],
 ['UTF8 inválido',r=>r.body=Buffer.from([255])],['DELETE',r=>r.method='DELETE'],
 ['identidad inyectada',r=>{const b=JSON.parse(r.body);b.payload.actorEmail='forged@example.invalid';r.body=JSON.stringify(b);}],
 ['JSON parseado',r=>r.body=JSON.parse(r.body)],
 ['renglón incompleto',r=>{const b=JSON.parse(r.body);b.payload.document.lines.at(-1).debit=null;r.body=JSON.stringify(b);}]
])test('rechaza '+label+' sin SQL ni escritura',async()=>{const a=await setup(),res=response();change(a.req);await a.handler(a.req,res);assert.ok(res.statusCode>=400);assert.equal(a.calls.length,0);});
test('revocación y sesión inválida retiran acceso antes de leer bytes o conectar SQL',async()=>{
 for(const override of[{requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}}})},{sessionFor:()=>({...session,id:null})}]){const a=await setup(override),res=response();let reads=0;Object.defineProperty(a.req,'body',{get(){reads++;throw Error('Forbidden');}});await a.handler(a.req,res);assert.ok([401,403].includes(res.statusCode));assert.equal(reads,0);assert.equal(a.stats.connections,0);}
});
test('fuente y constancia completas rechazan pérdida de última fila y cruce de identificador',async()=>{
 const f=await approvedReconciliationFixture(2);
 for(const[q,value,change]of[[{resource:'source',id:f.source.journal.id},f.source,x=>x.journal.journal.entries.pop()],[{resource:'detail',id:f.detail.id},f.detail,x=>x.body.document.lines.pop()]])for(const bad of[false,true]){
  const data=structuredClone(value);if(bad)change(data);const a=await setup({getSql:async()=>({query:async()=>[{result:data}]})}),res=response();Object.assign(a.req,{method:'GET',query:q,url:'/api/internal-own-payroll-reconciliation?'+new URLSearchParams(q)});await a.handler(a.req,res);assert.equal(res.statusCode,bad?503:200);
 }
 const a=await setup({getSql:async()=>({query:async()=>[{result:f.source}]})}),res=response(),q={resource:'source',id:uid(99)};Object.assign(a.req,{method:'GET',query:q,url:'/api/internal-own-payroll-reconciliation?'+new URLSearchParams(q)});await a.handler(a.req,res);assert.equal(res.statusCode,503);
});
test('recuperación sólo GET mantiene el mismo cuerpo y clave de intento confirmado',async()=>{const a=await setup(),data={...a.receipt,replayed:true},b=await setup({getSql:async()=>({query:async()=>[{result:data}]})}),res=response();Object.assign(b.req,{method:'GET',query:{resource:'attempt',key:data.requestKey},url:'/api/internal-own-payroll-reconciliation?resource=attempt&key='+data.requestKey});await b.handler(b.req,res);assert.equal(res.statusCode,200);assert.equal(res.headers['Idempotency-Replayed'],'true');assert.deepEqual(res.value.data.body,a.body);});
test('no admite fachadas, claves adicionales ni consulta de otro período',async()=>{
 const f=await approvedReconciliationFixture(2);
 for(const query of[{resource:'source',id:f.source.journal.id,basis:'journal'},{resource:'command',id:f.source.journal.id}]){const a=await setup(),res=response();Object.assign(a.req,{method:'GET',query,url:'/api/internal-own-payroll-reconciliation?'+new URLSearchParams(query)});await a.handler(a.req,res);assert.equal(res.statusCode,400);assert.equal(a.stats.connections,0);}
 const a=await setup({getSql:async()=>({query:async()=>[{result:f.boot}]})}),res=response(),query={resource:'bootstrap',period:'2026-09',liquidationType:'monthly'};Object.assign(a.req,{method:'GET',query,url:'/api/internal-own-payroll-reconciliation?'+new URLSearchParams(query)});await a.handler(a.req,res);assert.equal(res.statusCode,503);
});
test('rechazos SQL son accionables y no filtran material privado',async()=>{for(const[code,status]of[['SOURCE_CHANGED',409],['INDEPENDENT_REQUIRED',403],['DUPLICATE',409],['REVIEW_REQUIRED',422],['LIMIT',422],['NOT_FOUND',404],['BUSY',409],['database-private-secret',503]]){const a=await setup({getSql:async()=>({query:async()=>{throw Error(code==='database-private-secret'?code:'RECONCILIATION_'+code);}})}),res=response();await a.handler(a.req,res);assert.equal(res.statusCode,status);assert.ok(!JSON.stringify(res.value).includes('private-secret'));}});
