import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnAgreementWorkingTimeHandler} from '../api/internal-own-agreement-working-time.js';
import {syntheticAgreementTimeBootstrap, syntheticAgreementTimeCommand, syntheticAgreementTimeDetail, agreementTimeKey, agreementTimeId, agreementTimeHash} from './fixtures/own-agreement-working-time-synthetic.js';
const caps=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'];
const principal={user:{email:'agreement-qa@example.invalid'},tenant:{source:'membership',id:agreementTimeId,membershipId:agreementTimeKey,effectiveCapabilities:caps}};
const session={email:principal.user.email,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',version:1,releaseSha:'d'.repeat(40)};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
const get=(resource,extra)=>({method:'GET',query:{resource,...extra},url:'/api/internal-own-agreement-working-time?'+new URLSearchParams({resource,...extra}),headers:{}});
const post=()=>({method:'POST',url:'/api/internal-own-agreement-working-time',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':agreementTimeKey},body:JSON.stringify({operation:'command',payload:syntheticAgreementTimeCommand()})});
function setup(result,overrides={}){
 const calls=[],stats={connections:0,authorizations:0};const deps={env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>{stats.authorizations++;return{mode:'managed',principal};},sessionFor:()=>session,getSql:async()=>{stats.connections++;return{query:async(q,v)=>{calls.push({q,v});return[{result:await result()}];}};},...overrides};
 return{handler:createOwnAgreementWorkingTimeHandler(deps),calls,stats};
}
async function receipt(){const d=await syntheticAgreementTimeDetail();return{version:d.version,eventId:agreementTimeId,proposalId:agreementTimeId,requestKey:agreementTimeKey,requestSha256:d.proposal.requestSha256,body:d.body,status:'pending',revision:0,configurationVersion:d.body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};}

test('bootstrap reaches the exact SQL facade and returns all61 verified agreement declarations',async()=>{
 const a=setup(()=>syntheticAgreementTimeBootstrap(61)),out=response();await a.handler(get('bootstrap',{period:'2026-10'}),out);
 assert.equal(out.statusCode,200);assert.equal(a.calls.length,1);assert.match(a.calls[0].q,/own_agreement_working_time_bootstrap_v1/);assert.equal(out.value.data.source.agreements.length,61);assert.match(out.headers['Cache-Control'],/no-store/);
});
test('one voluntary proposal keeps the complete original body and key without calculating or approving salaries',async()=>{
 const a=setup(receipt),out=response();await a.handler(post(),out);assert.equal(out.statusCode,201);assert.equal(a.calls.length,1);
 assert.deepEqual(JSON.parse(a.calls[0].v[1]),syntheticAgreementTimeCommand());assert.equal(a.calls[0].v[2],agreementTimeKey);assert.equal(out.value.data.status,'pending');assert.equal(out.value.data.payrollCalculated,false);
});
test('missing managed rights or session refuses private body and SQL before any operation',async()=>{
 for(const override of[{requireAccess:async()=>({mode:'legacy',principal})},{requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:caps.filter(c=>c!=='payroll.parameter.read')}}})},{sessionFor:()=>({...session,id:null})}]){
  const a=setup(receipt,override),r=post(),out=response();let reads=0;Object.defineProperty(r,'body',{get(){reads++;throw Error('private body unread');}});await a.handler(r,out);assert.ok([401,403].includes(out.statusCode));assert.equal(reads,0);assert.equal(a.stats.connections,0);
 }
});
for(const[label,mutate]of[
 ['foreign origin',r=>r.headers.origin='https://foreign.invalid'],['text content type',r=>r.headers['content-type']='text/plain'],['missing key',r=>delete r.headers['idempotency-key']],['ambiguous JSON',r=>r.body='{"operation":"command","operati\\u006fn":"command"}'],['numeric hours',r=>{const b=syntheticAgreementTimeCommand();b.items[0].definition.monthlyHours=160;r.body=JSON.stringify({operation:'command',payload:b});}],['nominal added field',r=>{const b=syntheticAgreementTimeCommand();b.items[0].employeeName='Campo ajeno';r.body=JSON.stringify({operation:'command',payload:b});}],
])test('refuses '+label+' without running SQL',async()=>{const a=setup(receipt),r=post(),out=response();mutate(r);await a.handler(r,out);assert.ok(out.statusCode>=400);assert.equal(a.calls.length,0);});
test('bootstrap rejects a different period or a partial whole response',async()=>{
 for(const patch of[{period:'2026-09'},{complete:false}]){const a=setup(()=>({...syntheticAgreementTimeBootstrap(),...patch})),out=response();await a.handler(get('bootstrap',{period:'2026-10'}),out);assert.equal(out.statusCode,503);assert.equal(a.calls.length,1);}
});
test('busy bootstrap reauthorizes and retries only the same bounded read',async()=>{
 let reads=0;const a=setup(()=>{if(reads++===0)throw Error('AGREEMENT_WORKING_TIME_BUSY');return syntheticAgreementTimeBootstrap();}),out=response();await a.handler(get('bootstrap',{period:'2026-10'}),out);
 assert.equal(out.statusCode,200);assert.equal(reads,2);assert.equal(a.stats.authorizations,2);assert.deepEqual(a.calls[0],a.calls[1]);
});
test('revocation during busy recovery stops the second SQL read and returns no data',async()=>{
 let authorizations=0;const a=setup(()=>{throw Error('AGREEMENT_WORKING_TIME_BUSY');},{requireAccess:async(req,res)=>{if(authorizations++===0)return{mode:'managed',principal};res.status(403).json({ok:false});return null;}}),out=response();await a.handler(get('bootstrap',{period:'2026-10'}),out);
 assert.equal(out.statusCode,403);assert.equal(a.calls.length,1);assert.equal(out.value.data,undefined);
});
test('a write BUSY never replays the command automatically',async()=>{
 const a=setup(()=>{throw Error('AGREEMENT_WORKING_TIME_BUSY');}),out=response();await a.handler(post(),out);assert.equal(out.statusCode,409);assert.equal(a.calls.length,1);assert.equal(a.stats.authorizations,1);
});
