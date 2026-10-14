import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnPeriodClassificationHandler} from '../api/internal-own-period-classification.js';
import {periodClassificationFingerprint} from '../lib/internal-own-period-classification.js';
import {PERIOD_CLASSIFICATION_VERSION as VERSION, preparePeriodClassification} from '../assets/own-period-classification-model.js';

// Every actor, fact and immutable source anchor in this file is synthetic.
const id = n => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = c => c.repeat(64), period = '2026-09', reason = 'Encuadre retrospectivo exclusivamente sintético QA';
const caps = ['workforce.employee.read', 'payroll.parameter.read', 'payroll.parameter.prepare', 'payroll.parameter.approve'];
const principal = {user:{email:'period-classification-qa@example.invalid'}, tenant:{source:'membership', id:id(1), membershipId:id(12), effectiveCapabilities:caps}};
const session = {email:principal.user.email, id:id(13), version:1, releaseSha:'a'.repeat(40)};
const scope = () => ({tenantId:id(1), bindingId:id(2), companyId:901});
const definition = () => ({agreementCode:'01', categoryCode:'007', organizationId:'008', sectorCode:'009', jurisdictionCode:'42', startDate:'2020-01-01', endDate:null, effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', documentDate:'2026-10-14', documentReference:'Constancia exclusivamente sintética QA'});
const source = () => ({version:hash('2'), scope:scope(), period, subject:{origin:'MUNICONTROL', contractId:id(3), personId:id(4), registrationId:id(5), identityToken:hash('3')}, provenance:{kind:'native_registration', registrationId:id(5), requestSha256:hash('a')}});
const classification = () => ({version:hash('4'), items:[
 {kind:'agreements', key:'qa-agreement', code:'01', label:'Convenio sintético', agreementCode:null, registrationAllowed:false},
 {kind:'categories', key:'qa-category', code:'007', label:'Clase sintética', agreementCode:'01', registrationAllowed:false},
 {kind:'organizations', key:'qa-organization', code:'008', label:'Sector sintético', agreementCode:null, registrationAllowed:false},
 {kind:'sectors', key:'qa-department', code:'009', label:'Repartición sintética', agreementCode:null, registrationAllowed:false},
]});
const preparation = () => ({version:VERSION, scope:scope(), contractId:id(3), period, scopeVersion:hash('5'), baseVersion:hash('6'), source:source(), classification:classification(), canPropose:true});
const command = () => preparePeriodClassification(preparation(), definition(), reason);
const configuration = () => ({version:hash('6'), revision:0, definition:null, proposalId:null, approvalId:null, sourceVersion:null, identityToken:null, provenance:null, classificationVersion:null});
const summary = () => ({id:id(6), requestSha256:periodClassificationFingerprint(command()), baseVersion:hash('6'), sourceVersion:hash('2'), classificationVersion:hash('4'), reason, createdAt:'2026-10-14T10:00:00+00:00', authorLabel:'Autor sintético QA', canReview:true, status:'pending', decision:null});
const bootstrap = () => ({version:VERSION, preparation:preparation(), configuration:configuration(), proposals:[summary()], permissions:{canPropose:true, canReview:true}, complete:true, payrollCalculated:false, payrollPosted:false});
const detail = () => ({version:VERSION, scopeVersion:hash('5'), proposal:summary(), body:command(), baseDefinition:null, source:source(), classification:classification(), current:true});
const decision = kind => ({...command(), command:kind, scopeVersion:hash('7'), identityToken:null, provenance:null, definition:null, proposalId:id(6), proposalSha256:summary().requestSha256, reason:'Revisión independiente exclusivamente sintética QA', reviewConfirmed:true});
function receipt(body = command(), key = id(20), patch = {}) {
 const propose = body.command === 'propose';
 return {version:VERSION, eventId:propose?id(6):id(7), proposalId:propose?id(6):body.proposalId, requestKey:key, requestSha256:periodClassificationFingerprint(body), body, status:({propose:'pending', approve:'approved', reject:'rejected'})[body.command], revision:body.command==='approve'?1:0, configurationVersion:body.command==='approve'?hash('8'):body.baseVersion, replayed:false, payrollCalculated:false, payrollPosted:false, ...patch};
}
const response = () => ({headers:{}, setHeader(key,value){this.headers[key]=value;}, status(status){this.statusCode=status;return this;}, json(value){this.value=value;return this;}});
const request = (body = command(), key = id(20)) => ({method:'POST', url:'/api/internal-own-period-classification', query:{}, headers:{origin:'https://municipio.example', 'content-type':'application/json', 'idempotency-key':key}, body:JSON.stringify({operation:'command', payload:body})});
function readRequest(query) {return {method:'GET', url:'/api/internal-own-period-classification?'+new URLSearchParams(query), query, headers:{}};}
function setup(overrides = {}, result = receipt()) {
 const calls = [], stats = {connections:0}, accessOptions = [];
 const handler = createOwnPeriodClassificationHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'}, requireAccess:async(_req,_res,options)=>{accessOptions.push(options);return {mode:'managed',principal};}, sessionFor:()=>session, getSql:async()=>{stats.connections++;return {query:async(query,values)=>{calls.push({query,values});return [{result}];}};}, ...overrides});
 return {handler,calls,stats,accessOptions};
}

test('normal proposal sends only the real six-field session context and preserves exact body/key', async()=>{
 const a = setup(), res = response(); await a.handler(request(),res);
 assert.equal(res.statusCode,201); assert.equal(a.calls.length,1); assert.match(a.calls[0].query,/^SELECT public\.own_period_classification_command_v1\(/);
 assert.deepEqual(JSON.parse(a.calls[0].values[0]),{actorEmail:session.email,actorSessionId:session.id,actorSessionVersion:1,releaseSha:session.releaseSha,tenantId:principal.tenant.id,membershipId:principal.tenant.membershipId});
 assert.deepEqual(JSON.parse(a.calls[0].values[1]),command()); assert.equal(a.calls[0].values[2],id(20)); assert.deepEqual(res.value.data.body,command());
 assert.equal(res.value.data.payrollCalculated,false); assert.equal(res.value.data.payrollPosted,false); assert.match(res.headers['Cache-Control'],/no-store/);
 assert.equal(a.accessOptions[0].allowLegacy,false); assert.equal(a.accessOptions[0].requireDataPlaneReady,true); assert.equal(a.accessOptions[0].requireCertifiedDataBinding,true);
});
test('approve and reject retain original proposal hashes and require only their existing review capability', async()=>{
 for (const kind of ['approve','reject']) {const body=decision(kind), a=setup({},receipt(body)), res=response(); await a.handler(request(body),res); assert.equal(res.statusCode,201); assert.deepEqual(JSON.parse(a.calls[0].values[1]),body); assert.equal(res.value.data.body.proposalSha256,summary().requestSha256); assert.equal(res.value.data.body.provenance,null);}
 const noReview={...principal,tenant:{...principal.tenant,effectiveCapabilities:caps.filter(c=>c!=='payroll.parameter.approve')}};
 const a=setup({requireAccess:async()=>({mode:'managed',principal:noReview})}), res=response();await a.handler(request(decision('reject')),res);assert.equal(res.statusCode,403);assert.equal(a.stats.connections,0);
});
test('read-only account consults an explicit contract/month without prepare or calculation capabilities', async()=>{
 const readPrincipal={...principal,tenant:{...principal.tenant,effectiveCapabilities:caps.slice(0,2)}}, value=bootstrap();value.permissions={canPropose:false,canReview:false};value.preparation.canPropose=false;value.proposals[0].canReview=false;
 const a=setup({requireAccess:async()=>({mode:'managed',principal:readPrincipal})},value), res=response();await a.handler(readRequest({resource:'bootstrap',contractId:id(3),period}),res);
 assert.equal(res.statusCode,200);assert.match(a.calls[0].query,/own_period_classification_bootstrap_v1/);assert.deepEqual(a.calls[0].values.slice(1),[id(3),period]);assert.equal(res.value.data.configuration.definition,null);
});
test('revoked reading capabilities, legacy mode and invalid sessions stop before reading the body or connecting', async()=>{
 for (const overrides of [
  {requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}}})},
  {requireAccess:async()=>({mode:'legacy',principal})},
  {requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,source:'legacy'}}})},
  {sessionFor:()=>({...session,id:null})}, {sessionFor:()=>({...session,email:'different@example.invalid'})},
 ]) {const a=setup(overrides), req=request(), res=response();let reads=0;Object.defineProperty(req,'body',{get(){reads++;throw Error('body must not be read');}});await a.handler(req,res);assert.ok([401,403].includes(res.statusCode));assert.equal(reads,0);assert.equal(a.stats.connections,0);}
});
for (const [label,change] of [
 ['foreign origin',r=>r.headers.origin='https://foreign.invalid'], ['wrong MIME',r=>r.headers['content-type']='text/plain'],
 ['missing key',r=>delete r.headers['idempotency-key']], ['uppercase key',r=>r.headers['idempotency-key']=id(20).toUpperCase()],
 ['duplicate escaped JSON key',r=>r.body='{"operation":"command","operati\\u006fn":"command"}'], ['invalid UTF8',r=>r.body=Buffer.from([0xff])],
 ['DELETE',r=>r.method='DELETE'], ['query on write',r=>{r.query={resource:'command'};r.url+='?resource=command';}],
 ['forged actor',r=>r.body=JSON.stringify({operation:'command',payload:{...command(),actorPersonId:id(90)}})],
 ['extra nominal source',r=>r.body=JSON.stringify({operation:'command',payload:{...command(),provenance:{...command().provenance,dni:'synthetic-private'}}})],
 ['numeric code',r=>r.body=JSON.stringify({operation:'command',payload:{...command(),definition:{...definition(),categoryCode:7}}})],
 ['approval with new facts',r=>r.body=JSON.stringify({operation:'command',payload:{...decision('approve'),definition:definition()}})],
 ['oversized whole input',r=>r.body=JSON.stringify({operation:'command',payload:{...command(),reason:'x'.repeat(33000)}})],
 ]) test('rejects '+label+' before any SQL connection',async()=>{const a=setup(), req=request(), res=response();change(req);await a.handler(req,res);assert.ok(res.statusCode>=400);assert.equal(a.stats.connections,0);assert.equal(a.calls.length,0);});
test('query ambiguity, unrequested resources and invalid contract/month cannot initiate a nominal search',async()=>{
 for (const req of [readRequest({resource:'list'}),readRequest({resource:'bootstrap',contractId:id(3),period:'2026-13'}),readRequest({resource:'bootstrap',contractId:'private name',period}),{...readRequest({resource:'attempt',key:id(20)}),url:'/api/internal-own-period-classification?resource=attempt&key='+id(20)+'&key='+id(21)}]) {const a=setup(),res=response();await a.handler(req,res);assert.ok(res.statusCode>=400);assert.equal(a.stats.connections,0);}
});
test('bootstrap and detail must correlate exactly with the requested contract/month/proposal',async()=>{
 const req=readRequest({resource:'bootstrap',contractId:id(3),period}), good=setup({},bootstrap()), ok=response();await good.handler(req,ok);assert.equal(ok.statusCode,200);
 const bad=bootstrap();bad.preparation.contractId=id(99);bad.preparation.source.subject.contractId=id(99);const a=setup({},bad),out=response();await a.handler(req,out);assert.equal(out.statusCode,503);
 const d=setup({},detail()),res=response();await d.handler(readRequest({resource:'detail',id:id(6)}),res);assert.equal(res.statusCode,200);assert.match(d.calls[0].query,/detail_v1/);
 const wrong=setup({},detail()), denied=response();await wrong.handler(readRequest({resource:'detail',id:id(99)}),denied);assert.equal(denied.statusCode,503);
});
test('recovery and replay return original saved bytes without a new command or automatic POST retry',async()=>{
 const value=receipt(command(),id(20),{replayed:true}), a=setup({},value), res=response();await a.handler(readRequest({resource:'attempt',key:id(20)}),res);
 assert.equal(res.statusCode,200);assert.match(a.calls[0].query,/attempt_v1/);assert.equal(a.calls.length,1);assert.deepEqual(res.value.data.body,command());assert.equal(res.headers['Idempotency-Replayed'],'true');
 const replay=setup({},value), out=response();await replay.handler(request(),out);assert.equal(out.statusCode,200);assert.equal(replay.calls.length,1);
 let calls=0;const busy=setup({getSql:async()=>({query:async()=>{calls++;throw Error('PERIOD_CLASSIFICATION_BUSY');}})}), failed=response();await busy.handler(request(),failed);assert.equal(failed.statusCode,409);assert.equal(calls,1);
});
test('corrupt receipts, substituted body/key, invalid source and invented payroll effects fail closed',async()=>{
 for (const patch of [{requestSha256:hash('f')},{requestKey:id(99)},{payrollCalculated:true},{payrollPosted:true},{status:'approved'},{eventId:id(99)},{body:{...command(),period:'2026-10'}}]) {const a=setup({},receipt(command(),id(20),patch)),res=response();await a.handler(request(),res);assert.equal(res.statusCode,503);}
 const different={...command(),reason:'Otro fundamento exclusivamente sintético QA'}, a=setup({},receipt(different)),res=response();await a.handler(request(),res);assert.equal(res.statusCode,503);
 const broken=bootstrap();broken.preparation.source.subject.origin='GRH';const b=setup({},broken),out=response();await b.handler(readRequest({resource:'bootstrap',contractId:id(3),period}),out);assert.equal(out.statusCode,503);
});
test('SQL errors remain specific and safe without exposing database details or private values',async()=>{
 for (const [message,status,code] of [['PERIOD_CLASSIFICATION_INDEPENDENT_REQUIRED private@example.invalid',403,'INDEPENDENT_REQUIRED'],['PERIOD_CLASSIFICATION_SOURCE_CHANGED secret',409,'SOURCE_CHANGED'],['PERIOD_CLASSIFICATION_INCOMPLETE secret',422,'INCOMPLETE'],['PERIOD_CLASSIFICATION_SESSION_INVALID secret',401,'SESSION_INVALID'],['password secret unexpected',503,'UNAVAILABLE']]) {
  const a=setup({getSql:async()=>({query:async()=>{throw Error(message);}})}),res=response();await a.handler(request(),res);assert.equal(res.statusCode,status);assert.equal(res.value.code,'PERIOD_CLASSIFICATION_'+code);assert.ok(!JSON.stringify(res.value).includes('secret'));assert.ok(!JSON.stringify(res.value).includes('@'));
 }
});
