import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createInternalPayrollMonthlyCorrectionHandler} from '../api/internal-payroll-monthly-correction.js';
import {callMonthlyCorrection,monthlyCorrectionSafeError} from '../lib/internal-payroll-monthly-correction.js';
import {monthlyCorrectionBootstrap,monthlyCorrectionPlan,monthlyCorrectionVerifiedPlan,monthlyCorrectionReviewPlan} from '../assets/payroll-monthly-correction-model.js';
import {approved,bootstrap as originalBootstrap,id,scope,effects,stamp} from './fixtures/payroll-monthly-annul-synthetic.js';

const reason='Corregir todos los lotes sintéticos seleccionados';
const candidate=batch=>({version:'payroll-monthly-correction.v1',scopeKey:scope,proposalId:null,proposalSha256:null,previewSha256:null,status:'candidate',reason:null,patch:null,canPropose:true,canReview:false,items:[{snapshotSha256:'d'.repeat(64),batch,identityCurrent:true}],decision:null,effects:{...effects}});
const draft=(count=1)=>monthlyCorrectionPlan(Array.from({length:count},(_,n)=>candidate(approved(n,2,n%2===1))),scope,{observation:'Corrección de ensayo'},reason);
const preview=plan=>({version:'payroll-monthly-correction.v1',scopeKey:scope,proposalId:null,proposalSha256:null,previewSha256:'9'.repeat(64),status:'preview',reason:plan.body.reason,patch:plan.body.patch,canPropose:true,canReview:false,items:structuredClone(plan.items),decision:null,effects:{...effects}});
const proposal=plan=>({...preview(plan),proposalId:id(8000),proposalSha256:'e'.repeat(64),status:'pending',canPropose:false,canReview:true});
const receipt=(body,key=id(9000),replayed=false)=>({version:'payroll-monthly-correction.v1',eventId:id(8000),proposalId:body.proposalId??id(8000),key,bodySha256:'f'.repeat(64),body:structuredClone(body),replayed,status:({propose:'pending',approve:'approved',reject:'rejected'})[body.command],recordedAt:stamp,effects:{...effects}});
const bootstrap=rows=>({...originalBootstrap(rows),version:'payroll-monthly-correction.v1'});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
const defaults=['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.prepare','payroll.novelty.approve'];
function setup({caps=defaults,result,error,queryResult,mode='managed',anonymous=false}={}){
 const calls=[],accessCalls=[],session={id:id(100),email:'operator@example.invalid',version:1,releaseSha:'a'.repeat(40)};
 const principal={user:{email:session.email},tenant:{source:'membership',id:id(2),membershipId:id(3),certifiedReleaseSha:session.releaseSha,effectiveCapabilities:caps}};
 const sql={query:async(query,args)=>{calls.push({query,args});if(error)throw error;if(queryResult!==undefined)return queryResult;let value=result;
  if(value===undefined){const body=JSON.parse(args[1]);value=receipt(body,args[2]);}return [{result:value}];}};
 const handler=createInternalPayrollMonthlyCorrectionHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireCompatibleInternalAccess:async(req,res,options)=>{accessCalls.push(options);if(anonymous){res.status(401).json({ok:false,code:'IDENTITY_SESSION_REQUIRED'});return null;}return {mode,principal};},actionMutationSession:()=>session,getInternalSql:async()=>sql});
 return {handler,calls,accessCalls,sql,principal,session};
}
function post(body,{key=id(9000),headers={},raw}={}){
 const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw??JSON.stringify({command:'correct',payload:body}));
 const req=new PassThrough();Object.assign(req,{method:'POST',query:{},url:'/api/internal-payroll-monthly-correction',headers:{origin:'https://municipio.example','content-type':'application/json','content-length':String(bytes.length),...(key?{'idempotency-key':key}:{}),...headers}});
 queueMicrotask(()=>req.end(bytes));return req;
}
const get=q=>({method:'GET',query:q,url:'/api/internal-payroll-monthly-correction?'+new URLSearchParams(q),headers:{}});
const proposed=plan=>monthlyCorrectionVerifiedPlan(preview(plan),plan).body;

test('verified complete preview uses only the read facade with no attempt key or persisted command',async()=>{
 const plan=draft(26),data=preview(plan),{handler,calls,accessCalls}=setup({result:data}),res=response();
 await handler(post(plan.body,{key:null}),res);assert.equal(res.statusCode,200,JSON.stringify(res.body));assert.deepEqual(res.body.data,data);assert.equal(data.items.length,26);
 assert.equal(calls.length,1);assert.match(calls[0].query,/SELECT public\.payroll_monthly_correction_preview_v1/);assert.equal(calls[0].args.length,2);assert.deepEqual(JSON.parse(calls[0].args[1]),plan.body);
 assert.equal(res.headers['Idempotency-Replayed'],undefined);assert.match(res.headers['Cache-Control'],/no-store/);assert.equal(accessCalls[0].requireCertifiedDataBinding,true);assert.equal(accessCalls[0].allowLegacy,false);
});
test('a preview carrying a writer key cannot reach any SQL facade',async()=>{
 const {handler,calls}=setup({result:preview(draft())}),res=response();await handler(post(draft().body),res);assert.equal(res.statusCode,400);assert.equal(calls.length,0);
});
test('100 same-name sibling targets and nested commands retain their exact body and key through real raw HTTP',async()=>{
 const body=proposed(draft(100)),{handler,calls}=setup(),res=response();await handler(post(body),res);
 assert.equal(res.statusCode,201,JSON.stringify(res.body));assert.equal(calls.length,1);assert.match(calls[0].query,/monthly_correction_command_v1/);assert.deepEqual(JSON.parse(calls[0].args[1]),body);assert.equal(calls[0].args[2],id(9000));
 const context=JSON.parse(calls[0].args[0]);assert.deepEqual(Object.keys(context).sort(),['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']);assert(!Object.hasOwn(context,'patch'));
});
test('a local comparison without a server preview hash never becomes a proposal',async()=>{
 const body={...draft().body,command:'propose'},s=setup(),res=response();await s.handler(post(body),res);assert.equal(res.statusCode,422);assert.equal(s.calls.length,0);
});
test('preview rejects missing batches, row changes, injected provenance, unsupported effects and mismatched declared patch',async()=>{
 const plan=draft(26),good=preview(plan);
 for(const mutate of [d=>d.items.pop(),d=>d.items.reverse(),d=>d.items[25].after.rows[0].amountCents='0',d=>d.items[25].batch.rows[0].legajo='7',d=>d.items[25].after.rows[0].employmentContractId=id(99),d=>d.items[25].identityCurrent=false,d=>d.effects.payrollCalculated=true,d=>d.patch.observation='Otro valor',d=>d.reason+=' distinto',d=>d.previewSha256=null]){
  const data=structuredClone(good);mutate(data);const s=setup({result:data}),res=response();await s.handler(post(plan.body,{key:null}),res);assert.equal(res.statusCode,503,JSON.stringify(data));assert.equal(s.calls.length,1);
 }
});
test('recomputed warnings are allowed only when complete and nonblocking; inconsistent counters reject the preview',async()=>{
 const plan=draft(),data=preview(plan);data.items[0].after.rows[0].issues=[{code:'concept_not_observed',severity:'warning',blocking:false,field:'conceptSourceId',details:{basis:'published_grh_observation'}}];data.items[0].after.warningIssueCount=1;
 let s=setup({result:data}),res=response();await s.handler(post(plan.body,{key:null}),res);assert.equal(res.statusCode,200);
 for(const mutate of [d=>d.items[0].after.warningIssueCount=0,d=>d.items[0].after.rows[0].issues[0].blocking=true]){const wrong=structuredClone(data);mutate(wrong);s=setup({result:wrong});res=response();await s.handler(post(plan.body,{key:null}),res);assert.equal(res.statusCode,503);}
});
test('duplicate JSON keys, forbidden prototype keys and invalid UTF-8 are refused before SQL',async()=>{
 const body=proposed(draft()),raw=JSON.stringify({command:'correct',payload:body});
 for(const broken of [raw.replace('"command":"correct"','"command":"correct","command":"correct"'),raw.replace('"expectedVersion":3','"expectedVersion":3,"expectedVersion":3'),raw.replace('"patch":{','"patch":{"observation":"First",'),raw.replace('"batchId":','"constructor":{},"batchId":'),raw.replace('"batchId":','"__proto__":{},"batchId":'),Buffer.from([0x7b,0xff,0x7d])]){
  const s=setup(),res=response();await s.handler(post(body,{raw:broken}),res);assert.equal(res.statusCode,400);assert.equal(s.calls.length,0);
 }
});
test('raw body cap, content type and permitted origin retain the shared HTTP controls',async()=>{
 const body=proposed(draft());for(const [options,status]of [[{raw:' '.repeat(65537)},413],[{headers:{'content-type':'text/plain'}},415],[{headers:{origin:'https://other.example'}},403],[{headers:{'content-length':'invalid'}},400]]){
  const s=setup(),res=response();await s.handler(post(body,options),res);assert.equal(res.statusCode,status,JSON.stringify(res.body));assert.equal(s.calls.length,0);
 }
});
test('preparation, nominal access and managed binding are required for both preview and proposal',async()=>{
 const plan=draft();for(const settings of [{caps:[]},{caps:['payroll.novelty.read','payroll.novelty.prepare']},{caps:['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.approve']},{mode:'legacy'}])for(const body of [plan.body,proposed(plan)]){
  const s=setup(settings),res=response();await s.handler(post(body,{key:body.command==='preview'?null:id(9000)}),res);assert.equal(res.statusCode,403);assert.equal(s.calls.length,0);
 }
});
test('approve and reject require the reviewer capability, independently of preparation',async()=>{
 for(const command of ['approve','reject']){const body=monthlyCorrectionReviewPlan(proposal(draft()),command,reason).body;
  let s=setup({caps:defaults.filter(c=>c!=='payroll.novelty.approve')}),res=response();await s.handler(post(body),res);assert.equal(res.statusCode,403);assert.equal(s.calls.length,0);
  s=setup({caps:defaults.filter(c=>c!=='payroll.novelty.prepare')});res=response();await s.handler(post(body),res);assert.equal(res.statusCode,201);assert.equal(s.calls.length,1);
 }
});
test('all mutations require a v4 attempt key and exact sealed confirmations',async()=>{
 const body=proposed(draft());for(const key of [null,'00000000-0000-0000-0000-000000000000','bad']){const s=setup(),res=response();await s.handler(post(body,{key}),res);assert.equal(res.statusCode,key?400:428);assert.equal(s.calls.length,0);}
 for(const mutate of [r=>r.key=id(91),r=>r.body.reason+=' diferente',r=>r.body.items.reverse(),r=>r.body.previewSha256='0'.repeat(64),r=>r.status='approved',r=>r.effects.payrollPosted=true]){
  const many=proposed(draft(2)),data=receipt(many);mutate(data);const s=setup({result:data}),res=response();await s.handler(post(many),res);assert.equal(res.statusCode,503);
 }
});
test('same request recovery is read-only and never substitutes a different attempt or context',async()=>{
 const body=proposed(draft()),data=receipt(body,id(9000),true),s=setup({result:data}),res=response();await s.handler(get({resource:'attempt',key:id(9000)}),res);
 assert.equal(res.statusCode,200);assert.equal(s.calls.length,1);assert.match(s.calls[0].query,/monthly_correction_attempt_v1/);assert.equal(s.calls[0].args.length,2);
 for(const mutate of [r=>r.key=id(9001),r=>r.replayed=false,r=>r.body.command='preview']){const bad=structuredClone(data);mutate(bad);const t=setup({result:bad}),r=response();await t.handler(get({resource:'attempt',key:id(9000)}),r);assert.equal(r.statusCode,503);}
 const revoked=setup({caps:['payroll.novelty.read'],result:data}),r=response();await revoked.handler(get({resource:'attempt',key:id(9000)}),r);assert.equal(r.statusCode,403);assert.equal(revoked.calls.length,0);
});
test('replayed proposals keep the original body and key with a replay header',async()=>{
 const body=proposed(draft()),s=setup({result:receipt(body,id(9000),true)}),res=response();await s.handler(post(body),res);assert.equal(res.statusCode,200);assert.equal(res.headers['Idempotency-Replayed'],'true');assert.deepEqual(res.body.data.body,body);
});
test('metadata bootstrap is complete, globally bounded and contains no row values',async()=>{
 const data=bootstrap(Array.from({length:26},(_,i)=>approved(i,2))),s=setup({result:data}),res=response();await s.handler(get({resource:'bootstrap',period:'2026-08-01'}),res);
 // Fixtures explicitly set their period to the requested query, independently of screen filters.
 assert.equal(res.statusCode,503);data.candidates.forEach(c=>c.periodMonth='2026-08-01');const t=setup({result:data}),r=response();await t.handler(get({resource:'bootstrap',period:'2026-08-01'}),r);assert.equal(r.statusCode,200);assert.equal(r.body.data.candidates.length,26);assert.doesNotMatch(JSON.stringify(r.body.data),/amountCents|legajo|employeeName|employmentContractId/);
 monthlyCorrectionBootstrap(data);
 for(const mutate of [d=>d.complete=false,d=>d.version='payroll-monthly-annul.v1',d=>d.candidates.push(d.candidates[0]),d=>d.candidates=Array.from({length:1001},(_,i)=>({...d.candidates[0],batchId:id(1000+i)})),d=>d.permissions.canPropose='true',d=>d.effects.grhMutation=true,d=>d.candidates[0].legajo='1']){const bad=structuredClone(data);mutate(bad);assert.throws(()=>monthlyCorrectionBootstrap(bad));}
 const inherited=Object.assign(Object.create({private:true}),data);assert.throws(()=>monthlyCorrectionBootstrap(inherited));
});
test('detail refuses a different candidate, proposal or forged available capability',async()=>{
 const good=candidate(approved(1,2));let s=setup({result:good}),r=response();await s.handler(get({resource:'detail',kind:'candidate',id:good.items[0].batch.id}),r);assert.equal(r.statusCode,200);
 for(const [data,q,settings]of [[candidate(approved(2,2)),{resource:'detail',kind:'candidate',id:good.items[0].batch.id},{}],[proposal(draft()),{resource:'detail',kind:'proposal',id:id(8001)},{}],[good,{resource:'detail',kind:'proposal',id:id(8000)},{}],[good,{resource:'detail',kind:'candidate',id:good.items[0].batch.id},{caps:['payroll.novelty.read','payroll.novelty.nominal.read']}]]){s=setup({...settings,result:data});r=response();await s.handler(get(q),r);assert.equal(r.statusCode,503);}
});
test('invalid and repeated query parameters, unknown resources and methods never reach SQL',async()=>{
 for(const req of [get({resource:'bootstrap',period:'2026-08-02'}),get({resource:'detail',kind:'candidate',id:'invalid'}),get({resource:'preview'}),get({resource:'bootstrap',extra:'x'}),{...get({resource:'bootstrap'}),url:'/api/internal-payroll-monthly-correction?resource=bootstrap&resource=bootstrap'},{...get({resource:'bootstrap'}),method:'DELETE'}]){const s=setup(),res=response();await s.handler(req,res);assert.equal(res.statusCode,req.method==='DELETE'?405:400);assert.equal(s.calls.length,0);}
});
test('anonymous access remains 401, without nominal data or database calls',async()=>{
 const s=setup({anonymous:true}),res=response();await s.handler(get({resource:'bootstrap'}),res);assert.equal(res.statusCode,401);assert.equal(s.calls.length,0);assert.match(res.headers['Cache-Control'],/no-store/);assert.doesNotMatch(JSON.stringify(res.body),/legajo|amountCents|employeeName/);
});
test('database diagnostics are not exposed, while actionable conflict, limits and lock codes survive',async()=>{
 for(const [message,status,suffix]of [['Private person 12345678 connection secret',503,'UNAVAILABLE'],['PAYROLL_MONTHLY_CORRECTION_PREVIEW_CHANGED',409,'PREVIEW_CHANGED'],['PAYROLL_MONTHLY_CORRECTION_IDENTITY_CHANGED',409,'IDENTITY_CHANGED'],['PAYROLL_NOVELTY_PERIOD_OUTSIDE_EMPLOYMENT',422,'PERIOD_OUTSIDE_EMPLOYMENT'],['PAYROLL_MONTHLY_CORRECTION_NATIVE_TYPE_UNSUPPORTED',422,'NATIVE_TYPE_UNSUPPORTED'],['PAYROLL_MONTHLY_CORRECTION_READ_LIMIT',422,'READ_LIMIT'],['PAYROLL_MONTHLY_CORRECTION_REVIEW_LIMIT',422,'REVIEW_LIMIT'],['PAYROLL_MONTHLY_CORRECTION_SESSION_BUSY',409,'SESSION_BUSY'],['PAYROLL_MONTHLY_ANNUL_SESSION_INVALID',401,'SESSION_INVALID']]){
  const s=setup({error:Error(message)}),r=response();await s.handler(post(proposed(draft())),r);assert.equal(r.statusCode,status);assert.equal(r.body.code,'PAYROLL_MONTHLY_CORRECTION_'+suffix);assert.doesNotMatch(JSON.stringify(r.body),/12345678|secret|stack|connection/);if(suffix==='SESSION_BUSY')assert.equal(r.headers['Retry-After'],'1');
 }
 assert.equal(monthlyCorrectionSafeError({code:'ACTION_SOURCE_BINDING_REQUIRED'}).status,503);
});
test('missing, duplicate or malformed SQL result rows never validate a write or preview',async()=>{
 for(const queryResult of [[],[{result:receipt(proposed(draft()))},{result:receipt(proposed(draft()))}],{rows:[{result:null}]}]){const s=setup({queryResult}),r=response();await s.handler(post(proposed(draft())),r);assert.equal(r.statusCode,503);}
});
test('preview cannot be routed to a mutation even through an internal caller',async()=>{
 const s=setup();await assert.rejects(callMonthlyCorrection(s.sql,s.principal,s.session,{resource:'command',body:draft().body,key:id(9000)}),e=>e.code==='PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD');assert.equal(s.calls.length,0);
 await assert.rejects(callMonthlyCorrection(s.sql,s.principal,s.session,{resource:'preview',body:draft().body,key:id(9000)}),e=>e.code==='PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD');assert.equal(s.calls.length,0);
});
