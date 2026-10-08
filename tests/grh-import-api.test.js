import test from 'node:test';import assert from 'node:assert/strict';
import {createInternalPayrollNoveltiesHandler} from '../api/internal-payroll-novelties.js';
import {fixture,id,principal,session} from './fixtures/grh-import-synthetic.js';
function setup(count=1){const f=fixture(count),p=principal(),s=session(),state={accessCalls:0,readerCalls:0,denied:false};p.tenant.certifiedReleaseSha=s.releaseSha;
 const handler=createInternalPayrollNoveltiesHandler({env:{NODE_ENV:'production',IDENTITY_APP_ORIGIN:'https://qa.invalid',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:s.releaseSha},getInternalSql:async()=>f.runtime,getGrhReadSql:async()=>{state.readerCalls++;return f.readSql;},requireCompatibleInternalAccess:async(req,res)=>{state.accessCalls++;if(state.denied){res.status(401).json({ok:false,code:'SESSION_REQUIRED'});return null;}return{mode:'managed',principal:p,session:s};}});
 const request=(command='grhPreview',patch={})=>({method:'POST',url:'/api/internal-payroll-novelties',query:{},headers:{origin:'https://qa.invalid','content-type':'application/json','sec-fetch-site':'same-origin','idempotency-key':id(90)},body:{command,payload:structuredClone(f.payload)},...patch});
 async function send(req=request()){const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(v){this.statusCode=v;return this;},json(v){this.payload=v;return this;}};await handler(req,res);return res;}
 return{f,p,s,state,request,send};}
test('HTTP preview to guarded prepare keeps all twelve rows and returns an uncalculated draft',async()=>{const a=setup(12),preview=await a.send();assert.equal(preview.statusCode,200);assert.equal(preview.payload.data.inputRows,12);assert.equal(a.f.state.writes,0);a.f.payload.previewToken=preview.payload.data.previewToken;const result=await a.send(a.request('grhPrepare'));assert.equal(result.statusCode,201);assert.equal(result.payload.data.savedRows,12);assert.equal(result.payload.data.omittedRows,0);assert.equal(result.payload.data.batch.status,'draft');assert.equal(result.payload.data.payrollCalculated,false);assert.equal(a.f.state.writes,1);assert.match(result.headers['cache-control'],/no-store/);assert.equal(result.headers.vary,'Cookie, Origin');});
for(const capability of ['payroll.novelty.prepare','payroll.novelty.nominal.read','workforce.employee.read'])test('missing '+capability+' prevents the scoped source reader',async()=>{const a=setup();a.p.tenant.effectiveCapabilities=a.p.tenant.effectiveCapabilities.filter(v=>v!==capability);const r=await a.send();assert.equal(r.statusCode,403);assert.equal(a.state.readerCalls,0);assert.equal(a.f.state.writes,0);});
test('an unauthenticated request never opens the source reader',async()=>{const a=setup();a.state.denied=true;const r=await a.send();assert.equal(r.statusCode,401);assert.equal(a.state.readerCalls,0);assert.equal(a.f.state.runtimeCalls.length,0);});
for(const patch of [{origin:'https://other.invalid'},{'sec-fetch-site':'cross-site'}])test('cross-origin input stays denied '+JSON.stringify(patch),async()=>{const a=setup(),r=a.request();Object.assign(r.headers,patch);const result=await a.send(r);assert.equal(result.statusCode,403);assert.equal(a.state.accessCalls,0);assert.equal(a.state.readerCalls,0);});
test('JSON and idempotency contracts still apply to the import endpoint',async()=>{const a=setup();let r=a.request();r.headers['content-type']='text/plain';assert.equal((await a.send(r)).statusCode,415);r=a.request('grhPrepare');delete r.headers['idempotency-key'];assert.equal((await a.send(r)).statusCode,428);assert.equal(a.f.state.writes,0);});
test('native individual version cannot accidentally select the GRH import writer',async()=>{const a=setup(),r=a.request();r.query={version:'2'};r.url+='?version=2';assert.equal((await a.send(r)).statusCode,400);assert.equal(a.state.readerCalls,0);});
test('malformed original rows return line-level errors without original nominal contents',async()=>{const a=setup();a.f.payload.contentBase64=Buffer.from('PRIVATE-DNI-OR-NAME').toString('base64');const r=await a.send();assert.equal(r.statusCode,422);assert.equal(r.payload.code,'PAYROLL_NOVELTY_GRH_INPUT_INVALID');assert.equal(r.payload.details.issues[0].line,1);assert.doesNotMatch(JSON.stringify(r.payload),/PRIVATE-DNI-OR-NAME/);assert.equal(a.f.state.writes,0);});
test('a source publication change prevents preparation',async()=>{const a=setup();a.f.state.afterCandidates=()=>{a.f.state.sourceToken='d'.repeat(64);};const r=await a.send();assert.equal(r.statusCode,409);assert.equal(r.payload.code,'GRH_SOURCE_CHANGED');assert.equal(a.f.state.writes,0);});
test('unknown command and excessive body are rejected before any source query',async()=>{const a=setup();assert.equal((await a.send(a.request('anything'))).statusCode,400);const r=a.request();r.headers['content-length']='524289';assert.equal((await a.send(r)).statusCode,413);assert.equal(a.state.readerCalls,0);});
test('a 501-row original cannot result in a successful first 500 rows',async()=>{const a=setup(501),p=await a.send();assert.equal(p.payload.data.inputRows,501);assert.equal(p.payload.data.readyToPrepare,false);a.f.payload.previewToken=p.payload.data.previewToken;const r=await a.send(a.request('grhPrepare'));assert.equal(r.statusCode,422);assert.equal(a.f.state.writes,0);});
test('guard failure returns conflict, not a misleading saved-file receipt',async()=>{const a=setup(),p=await a.send();a.f.payload.previewToken=p.payload.data.previewToken;a.f.state.guardFailure=true;const r=await a.send(a.request('grhPrepare'));assert.equal(r.statusCode,409);assert.equal(r.payload.code,'PAYROLL_NOVELTY_IDENTITY_CHANGED');assert.equal(r.payload.data,undefined);});

test('SQL bootstrap projects novelty capabilities; HTTP reports the current employee-read authority needed by the TXT panel',async()=>{
 const a=setup(),sqlResult=(await a.f.runtime.query('SELECT payroll_novelty_bootstrap_v1($1::jsonb) AS result',[]))[0].result;
 assert.equal(sqlResult.principal.capabilities.includes('workforce.employee.read'),false);
 const response=await a.send({method:'GET',query:{resource:'bootstrap'},headers:{}});
 assert.equal(response.statusCode,200);assert.equal(response.payload.ok,true);
 assert.deepEqual(response.payload.principal.capabilities,[...a.p.tenant.effectiveCapabilities].sort());
 assert.equal(sqlResult.principal.capabilities.includes('workforce.employee.read'),false);
 assert.equal(a.f.state.writes,0);assert.equal(a.state.readerCalls,0);assert.match(response.headers['cache-control'],/no-store/);
});

test('a revoked employee-read authority is never restored by a stale SQL projection or an operational-role label',async()=>{
 const a=setup();a.p.tenant.roleKey='PLATFORM_OWNER_OPERATIVO_INTEGRAL';
 a.p.tenant.effectiveCapabilities=a.p.tenant.effectiveCapabilities.filter(c=>c!=='workforce.employee.read');
 const query=a.f.runtime.query;a.f.runtime.query=async(...args)=>{const result=await query(...args);if(args[0].includes('SELECT payroll_novelty_bootstrap_v1'))result[0].result.principal.capabilities.push('workforce.employee.read');return result;};
 const response=await a.send({method:'GET',query:{resource:'bootstrap'},headers:{}});
 assert.equal(response.statusCode,200);assert.equal(response.payload.principal.capabilities.includes('workforce.employee.read'),false);
 assert.equal((await a.send()).statusCode,403);assert.equal(a.state.readerCalls,0);assert.equal(a.f.state.writes,0);
});
