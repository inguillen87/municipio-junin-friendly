import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDeveloperHomologationHandler} from '../lib/developer-homologation-session.js';

const scope='a'.repeat(64),receipt='99999999-9999-4999-8999-999999999999',tenant='11111111-1111-4111-8111-111111111111';
const ctx={tenantId:tenant,actorSessionId:'55555555-5555-4555-8555-555555555555',membershipId:'33333333-3333-4333-8333-333333333333'};
const base={active:true,scopeToken:scope,expiresAt:'2030-01-02T00:00:00.000Z'};
const result={id:'baja-revisar',status:'passed',detail:'Prueba del producto',checks:[{label:'Contrato',passed:true}]};
function harness(opts={}){
 const calls=[],env=opts.env??{MUNICONTROL_DEVELOPER_HOMOLOGATION:'enabled',MUNICONTROL_HOMOLOGATION_TENANT_ID:tenant};
 const deps={env,http:{
   headers:r=>{r.setHeader('Cache-Control','private, no-store');},header:(req,n)=>req.headers[n]??'',
   assertOrigin:req=>{if(req.headers.origin!=='https://site.invalid')throw {code:'SCHOOL_CERTIFICATE_ORIGIN_INVALID'};},checkLength:()=>{}},
   requiredCapabilities:['example'],requireAccess:async(req,res,gate)=>{calls.push(['auth',gate]);if(opts.noSession){res.status(401).json({ok:false});return null;}return {principal:{user:{displayName:'Operador QA'}}};},
   assertOwner:()=>{if(opts.notOwner)throw {code:'OWNER_ADOPTION_AUTHORITY_REQUIRED'};return ctx;},sessionFor:()=>({}),
   readBody:async r=>r.body,cases:[{id:'baja-revisar',role:'review',label:'Revisar baja',description:'Caso aislado'}],
   getSql:async()=>({query:async(q,v)=>{calls.push(['sql',q,...v]);let d={...base};
     if(v[1]==='status'&&opts.inactive)d={active:false,expiresAt:null,scopeToken:scope};
     if(v[1]==='workspace')d.readiness={period:v[5]};
     if(v[1]==='stop')d={active:false,expiresAt:null,scopeToken:'b'.repeat(64)};
     if(v[1]==='trial'){if(opts.scopeChangedAtCommit)throw Error('QA_SCOPE_CHANGED');d.receiptId=receipt;}
     return [{result:d}];}}),
   runTrial:id=>{calls.push(['trial',id]);return result;},
   practice:async(sql,ctx2,t,step,rev,amount)=>{calls.push(['practice',ctx2,t,step,rev,amount]);return {...base,practice:{revision:1}};},
 };
 const handler=createDeveloperHomologationHandler(deps);
 async function invoke(op,{body={},method='GET',tag=scope,origin='https://site.invalid',query={op},url,headers={}}={}){
   const res={setHeader(){},status(n){this.statusCode=n;return this;},json(x){this.data=x;return this;}};
   const req={url:url??('/api/internal-developer-homologation?'+new URLSearchParams(query)),method,query,body,
     headers:{'x-homologation-scope':tag,'content-type':'application/json',origin,...headers}};
   await handler(req,res);return res;
 }
 return {invoke,calls};
}
test('feature off or incorrect tenant fails closed before any payroll or QA DB call',async()=>{
 const h=harness({env:{}});assert.equal((await h.invoke('status')).statusCode,404);assert.equal(h.calls.length,0);
 const another=harness({env:{MUNICONTROL_DEVELOPER_HOMOLOGATION:'enabled',MUNICONTROL_HOMOLOGATION_TENANT_ID:receipt}});
 assert.equal((await another.invoke('status')).statusCode,403);assert.ok(!another.calls.some(c=>c[0]==='sql'));
});
test('gateway and canonical owner guard select managed, certified tenant only; no session is not a fallback',async()=>{
 for(const [options,status] of [[{noSession:true},401],[{notOwner:true},403]]){
   const h=harness(options);assert.equal((await h.invoke('status')).statusCode,status);
   const gate=h.calls[0][1];assert.equal(gate.allowLegacy,false);assert.equal(gate.requireCertifiedDataBinding,true);assert.equal(gate.requireDataPlaneReady,true);
   assert.ok(!h.calls.some(c=>c[0]==='sql'));
 }
});
test('ambiguous query, incorrect method, origin, content type and missing scope rejected before work',async()=>{
 const h=harness();
 const cases=[
   ['status',{url:'/api/internal-developer-homologation?op=status&op=status'},400],
   ['status',{query:{op:'status',period:'2026-10'}},400],['workspace',{query:{op:'workspace',period:'2026-13'}},400],
   ['start',{method:'GET'},405],['start',{method:'POST',origin:'https://other.invalid'},403],
   ['start',{method:'POST',tag:''},409],['start',{method:'POST',headers:{'content-type':'text/plain'}},415],
 ];
 for(const [op,opts,status] of cases)assert.equal((await h.invoke(op,opts)).statusCode,status,op);
 assert.equal(h.calls.length,0);
});
test('no caller can name a municipality, actor or result in a QA command',async()=>{
 for(const [op,body] of [['start',{reviewed:true,tenantId:receipt}],['start',{reviewed:false}],['stop',{user:'any'}],['trial',{caseId:'baja-revisar',status:'passed'}],['trial',{caseId:'inventado'}]]){
   const h=harness();assert.equal((await h.invoke(op,{method:'POST',body})).statusCode,400);
   assert.ok(!h.calls.some(c=>c[0]==='sql'));
 }
});
test('workspace returns authorized aggregate diagnostics and projected catalog; no actor/session ID leaks',async()=>{
 const h=harness();const res=await h.invoke('workspace',{query:{op:'workspace',period:'2026-10'}});
 assert.equal(res.statusCode,200);assert.equal(res.data.readiness.period,'2026-10');assert.equal(res.data.cases[0].role,'review');
 assert.ok(!JSON.stringify(res.data).includes(ctx.actorSessionId));
 const sql=h.calls.find(c=>c[0]==='sql');assert.equal(sql[1],'SELECT developer_homologation.operate_v1($1::jsonb,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text) AS result');assert.equal(sql[7],'2026-10');
});
test('window state before and at commit checked; client cannot run tests under stale or inactive scope',async()=>{
 for(const [opt,tag,expectTrial] of [[{},'b'.repeat(64),false],[{inactive:true},scope,false],[{scopeChangedAtCommit:true},scope,true]]){
   const h=harness(opt);const r=await h.invoke('trial',{method:'POST',body:{caseId:'baja-revisar'},tag});
   assert.equal(r.statusCode,409);assert.equal(h.calls.some(c=>c[0]==='trial'),expectTrial);assert.equal(r.data.receiptId,undefined);
 }
});
test('server computes result + evidence hash and persists only that finite allowlisted trial',async()=>{
 const h=harness();const r=await h.invoke('trial',{method:'POST',body:{caseId:'baja-revisar'}});
 assert.equal(r.statusCode,200);assert.equal(r.data.receiptId,receipt);assert.deepEqual(r.data.result,result);
 const cmds=h.calls.filter(c=>c[0]==='sql');assert.deepEqual(cmds.map(c=>c[3]),['status','trial']);
 assert.equal(cmds[1][8],createHash('sha256').update(JSON.stringify(result)).digest('hex'));assert.equal(cmds[1][6],'passed');
});
test('practice is precisely bounded and authenticates as the real operator on both reads/writes',async()=>{
 const h=harness();
 assert.equal((await h.invoke('practice')).statusCode,200);
 assert.equal((await h.invoke('practice',{method:'POST',body:{step:'draft',expectedRevision:0,amount:'0.00'}})).statusCode,200);
 assert.equal((await h.invoke('practice',{method:'POST',body:{step:'approve',expectedRevision:1,amount:'20'}})).statusCode,400);
 assert.deepEqual(h.calls.filter(c=>c[0]==='practice').map(c=>c.slice(1)),[[ctx,null,'read',null,null],[ctx,scope,'draft',0,'0.00']]);
});
