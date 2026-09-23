import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {CHANGE_VERSION, changeValues, changeProposalInput, changeReviewInput, changeDiff, validateChangeBootstrap, validateChangeProposal, validateChangeReceipt} from '../assets/native-employment-change-model.js';
import {employmentChangeOperation, employmentChangeError, EMPLOYMENT_CHANGE_MAX_BYTES} from '../lib/internal-employment-changes.js';
import {createEmploymentChangesHandler} from '../api/internal-employment-changes.js';
import {readCatalogBody} from '../api/internal-employment-catalog.js';
import {ID, CONTRACT, TENANT, principal as employeePrincipal, session, catalog as sourceCatalog} from './fixtures/native-employee-synthetic.js';

const baseVersion = 'b'.repeat(64), scopeVersion = 'd'.repeat(64), identityToken = 'e'.repeat(64), catalogVersion = 'c'.repeat(64);
const values = () => ({agreementCode:'1', categoryCode:'6', organizationId:'7', sectorCode:'2', jobTitle:'Administrativo QA'});
const labels = () => ({agreementName:'Convenio QA', categoryName:'Clase QA', organizationName:'Sector QA', sectorName:'Repartición QA'});
const subject = () => ({contractId:CONTRACT, legajo:'5001', employeeName:'PERSONA SINTÉTICA QA', identityToken, sourceCutoff:null, origin:'MUNICONTROL', registrationId:ID, registeredAt:'2026-09-23T12:00:00Z'});
const proposalInput = () => ({contractId:CONTRACT, identityToken, scopeVersion, baseVersion, catalogVersion, values:values(), legalReference:'Resolución sintética QA', reason:'Rectificación administrativa sintética QA'});
const reviewInput = () => ({contractId:CONTRACT, proposalId:ID, scopeVersion, decision:'approve', reason:'Revisión independiente sintética QA'});
const summary = (patch={}) => ({id:ID,status:'pending',reason:'Motivo sintético QA',legalReference:'Resolución QA',createdAt:'2026-09-23T12:00:00Z',authorLabel:'preparador@example.invalid',baseVersion,canReview:true,...patch});
const bootstrap = () => ({version:CHANGE_VERSION,scopeVersion,subject:subject(),employment:{values:values(),labels:labels(),version:baseVersion,revision:0,appliedAt:null},catalog:{items:sourceCatalog.items.map((r,i)=>({...r,key:`source-${i}`,agreementCode:r.agreementCode??null})),version:catalogVersion,origin:'GRH',revision:0,publishedAt:null},permissions:{canPropose:true,canReview:true},proposals:[summary()],historyTruncated:false});
const proposal = () => ({version:CHANGE_VERSION,proposal:{...summary(),contractId:CONTRACT,subject:subject(),catalogVersion,before:{values:values(),labels:labels()},after:{values:{...values(),jobTitle:'Técnico QA'},labels:labels()},review:null}});
const receipt = (patch={}) => ({version:CHANGE_VERSION,operation:'propose',contractId:CONTRACT,proposalId:ID,status:'pending',employmentVersion:baseVersion,revision:0,replayed:false,payrollModified:false,...patch});
const principal = {...employeePrincipal,tenant:{...employeePrincipal.tenant,effectiveCapabilities:['workforce.employee.read','employee.record.propose','employee.record.approve']}};
const mockSql = result => ({calls:[],async query(query,params){this.calls.push({query,params});return [{result}];}});

test('proposal preserves string codes, normalizes text and limits scope to classification',()=>{
  const input=proposalInput(); input.values.jobTitle='  Te\u0301cnico QA  '; const copy=structuredClone(input);
  assert.equal(changeProposalInput(input).values.jobTitle,'Técnico QA'); assert.deepEqual(input,copy);
  for(const field of ['salary','effectiveDate','endDate','employeeName','tenantId','actorEmail']) assert.throws(()=>changeProposalInput({...input,[field]:'injected'}));
  assert.deepEqual(changeDiff(values(),{...values(),jobTitle:'Nuevo cargo QA'}),[{field:'jobTitle',before:'Administrativo QA',after:'Nuevo cargo QA'}]);
});
for(const [label,mutate] of [
 ['missing identity',p=>delete p.identityToken],['missing source version',p=>delete p.catalogVersion],['missing scope',p=>delete p.scopeVersion],
 ['stale-shaped base',p=>p.baseVersion='unknown'],['legajo instead of contract',p=>p.contractId='5001'],['numeric code',p=>p.values.agreementCode=1],
 ['extra nested field',p=>p.values.salary=100],['empty category',p=>p.values.categoryCode=''],['reason too short',p=>p.reason='Cambio'],
 ['missing legal basis',p=>p.legalReference=''],['markup',p=>p.reason='<img src=x>'],['control',p=>p.values.jobTitle='Cargo\nQA'],
]) test('input rejects '+label,()=>{const p=proposalInput();mutate(p);assert.throws(()=>changeProposalInput(p));});
test('empty cargo and Unicode character limits are consistent with SQL',()=>{
 assert.equal(changeValues({...values(),jobTitle:''}).jobTitle,'');
 const p=proposalInput();p.reason='😀'.repeat(1000);p.values.jobTitle='😀'.repeat(120);changeProposalInput(p);p.values.jobTitle+='😀';assert.throws(()=>changeProposalInput(p));
});
test('review cannot carry replacement values or an arbitrary decision',()=>{
 assert.equal(changeReviewInput(reviewInput()).decision,'approve');
 for(const p of [{...reviewInput(),values:values()},{...reviewInput(),decision:'publish'},{...reviewInput(),scopeVersion:''}])assert.throws(()=>changeReviewInput(p));
});
test('bootstrap validates native identity, current revision, catalog and bounded unique history',()=>{
 validateChangeBootstrap(bootstrap(),CONTRACT);
 for(const mutate of [b=>b.subject.contractId=TENANT,b=>b.subject.origin='GRH',b=>b.subject.sourceCutoff='2026-08-31',b=>b.employment.revision=1,b=>b.catalog.origin='MUNICONTROL',b=>b.permissions.canPropose='yes',b=>b.proposals.push(summary()),b=>b.proposals[0].status='approved']){
  const b=bootstrap();mutate(b);assert.throws(()=>validateChangeBootstrap(b,CONTRACT));
 }
});
test('detail and receipts cannot be reassociated with another employee or decision',()=>{
 validateChangeProposal(proposal(),CONTRACT,ID);validateChangeReceipt(receipt(),CONTRACT);
 for(const mutate of [p=>p.proposal.contractId=TENANT,p=>p.proposal.subject.contractId=TENANT,p=>p.proposal.id=TENANT,p=>p.proposal.status='approved']){const p=proposal();mutate(p);assert.throws(()=>validateChangeProposal(p,CONTRACT,ID));}
 for(const patch of [{contractId:TENANT},{payrollModified:true},{status:'approved'},{operation:'review'},{employmentVersion:'invalid'},{revision:-1}])assert.throws(()=>validateChangeReceipt(receipt(patch),CONTRACT));
});
test('response contracts reject impossible timestamps, unknown fields and out-of-range revisions',()=>{
 for(const timestamp of ['2026-02-30T12:00:00Z','2026-09-23T12:00:00','2026-09-23T24:00:00Z']){const b=bootstrap();b.subject.registeredAt=timestamp;assert.throws(()=>validateChangeBootstrap(b,CONTRACT));}
 for(const timestamp of ['2024-02-29T12:00:00.123456Z','2026-09-23T09:00:00-03:00']){const b=bootstrap();b.subject.registeredAt=timestamp;validateChangeBootstrap(b,CONTRACT);}
 for(const mutate of [b=>b.subject.salary=1,b=>b.extra=true,b=>b.employment.revision=101,b=>{b.catalog.origin='MUNICONTROL';b.catalog.revision=1001;b.catalog.publishedAt='2026-09-23T12:00:00Z';}]){const b=bootstrap();mutate(b);assert.throws(()=>validateChangeBootstrap(b,CONTRACT));}
 assert.throws(()=>validateChangeReceipt(receipt({revision:101}),CONTRACT));assert.throws(()=>validateChangeReceipt(receipt({extra:true}),CONTRACT));
 const b=bootstrap();b.proposals.push(summary({id:TENANT}));validateChangeBootstrap(b,CONTRACT);
});
test('all five SQL operations parameterize the native UUID and derive authority from session',async()=>{
 const p=proposalInput();p.reason="Resolución QA O'Connor";
 for(const [operation,input,result] of [
 ['bootstrap',{contractId:CONTRACT},bootstrap()],['proposal',{contractId:CONTRACT,id:ID},proposal()],['attempt',{contractId:CONTRACT,key:ID},receipt({replayed:true})],
 ['propose',{key:ID,body:p},receipt()],['review',{key:ID,body:reviewInput()},receipt({operation:'review',status:'approved',revision:1,employmentVersion:'f'.repeat(64)})]]){
  const sql=mockSql(result);assert.equal(await employmentChangeOperation(sql,principal,session,operation,input),result);
  assert.match(sql.calls[0].query,new RegExp('native_employment_change_'+operation+'_v1'));assert.doesNotMatch(sql.calls[0].query,/Connor/);
  assert.equal(JSON.parse(sql.calls[0].params[0]).tenantId,TENANT);assert.equal(sql.calls.length,1);
 }
});
test('invalid identity, attempt or operation never queries SQL',async()=>{
 for(const [actor,operation,input] of [[{...session,email:'other@example.invalid'},'bootstrap',{contractId:CONTRACT}],[session,'bootstrap',{contractId:'5001'}],[session,'attempt',{contractId:CONTRACT,key:'bad'}],[session,'erase',{contractId:CONTRACT}]]){
 const sql=mockSql(receipt());await assert.rejects(employmentChangeOperation(sql,principal,actor,operation,input));assert.equal(sql.calls.length,0);}
});
test('typed native session failures retain 401 even when the message contains no error identifier',async()=>{
 const sql=mockSql(bootstrap());
 await assert.rejects(employmentChangeOperation(sql,principal,{...session,email:'other@example.invalid'},'bootstrap',{contractId:CONTRACT}),{status:401,code:'NATIVE_EMPLOYMENT_CHANGE_SESSION_INVALID'});
 assert.equal(sql.calls.length,0);
 assert.equal(employmentChangeError(Object.assign(Error('Sesión vencida'),{code:'NATIVE_EMPLOYEE_SESSION_INVALID'})).status,401);
 assert.equal(employmentChangeError(Object.assign(Error('Sin permiso'),{code:'NATIVE_EMPLOYEE_FORBIDDEN'})).status,403);
});
test('misassociated or stale confirmations never report successful mutation',async()=>{
 for(const bad of [receipt({contractId:TENANT}),receipt({employmentVersion:'f'.repeat(64)})])await assert.rejects(employmentChangeOperation(mockSql(bad),principal,session,'propose',{key:ID,body:proposalInput()}),{status:503});
 for(const bad of [receipt(),receipt({operation:'review',status:'rejected'}),receipt({operation:'review',status:'approved',revision:1,proposalId:TENANT})])await assert.rejects(employmentChangeOperation(mockSql(bad),principal,session,'review',{key:ID,body:reviewInput()}),{status:503});
});
test('known failures are actionable and internal errors disclose no database content',()=>{
 for(const [message,status] of [['NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED',409],['NATIVE_EMPLOYMENT_CHANGE_NO_CHANGE',422],['NATIVE_EMPLOYMENT_CHANGE_MAKER_CHECKER_REQUIRED',403],['NATIVE_EMPLOYEE_SESSION_INVALID',401],['PAYROLL_FIXED_IDENTITY_CHANGED',409],['NATIVE_EMPLOYMENT_CHANGE_APPLY_FAILED',503],['password=secret SELECT',503]]){const e=employmentChangeError(Error(message));assert.equal(e.status,status);assert.doesNotMatch(e.message,/password|secret|SELECT/);}
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(v){this.payload=v;return this;}});
const request=()=>({method:'POST',url:'/api/internal-employment-changes',query:{},headers:{origin:'https://municipio.example','sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':ID},body:JSON.stringify({operation:'propose',payload:proposalInput()})});
const get=q=>({method:'GET',url:'/api/internal-employment-changes?'+new URLSearchParams(q),query:q,headers:{}});
function setup(options={}){const sql=mockSql(options.result??receipt()),stats={connections:0};const handler=createEmploymentChangesHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},sessionFor:()=>session,requireAccess:async(_req,res,gates)=>{stats.gates=gates;if(options.anonymous){res.status(401).json({ok:false});return null;}return options.access??{mode:'managed',principal};},getSql:async()=>{stats.connections++;return sql;}});return{handler,sql,stats};}
test('API requires certified managed authority and returns a private receipt',async()=>{const{handler,stats}=setup(),res=response();await handler(request(),res);assert.equal(res.statusCode,201);assert.match(res.headers['Cache-Control'],/no-store/);assert.equal(stats.gates.requireCertifiedDataBinding,true);assert.equal(stats.gates.allowLegacy,false);});
test('anonymous bodies are not consumed and employee creation does not confer rectification permission',async()=>{
 for(const options of [{anonymous:true},{access:{mode:'managed',principal:employeePrincipal}}]){const{handler,stats}=setup(options),req=request(),res=response();if(options.anonymous)Object.defineProperty(req,'body',{get(){throw Error('must not read');}});await handler(req,res);assert.equal(res.statusCode,options.anonymous?401:403);assert.equal(stats.connections,0);}
});
for(const[label,mutate]of[
 ['cross-origin',r=>r.headers.origin='https://evil.invalid'],['wrong media',r=>r.headers['content-type']='text/plain'],['large declared body',r=>r.headers['content-length']=String(EMPLOYMENT_CHANGE_MAX_BYTES+1)],
 ['duplicate query',r=>{r.method='GET';r.query={resource:'bootstrap',contractId:CONTRACT};r.url+='?'+new URLSearchParams(r.query)+'&contractId='+CONTRACT;}],
 ['client tenant',r=>{r.query={tenantId:TENANT};r.url+='?tenantId='+TENANT;}],['unsupported method',r=>r.method='DELETE'],['duplicate command',r=>r.body='{"operation":"propose","operati\\u006fn":"review","payload":{}}'],
 ['invalid utf8',r=>r.body=Buffer.from([0xff])],['unknown command',r=>r.body=JSON.stringify({operation:'erase',payload:proposalInput()})],['oversize whitespace without length',r=>r.body=' '.repeat(EMPLOYMENT_CHANGE_MAX_BYTES)+r.body]
])test('API refuses '+label,async()=>{const{handler,sql}=setup(),req=request(),res=response();mutate(req);await handler(req,res);assert.ok(res.statusCode>=400);assert.equal(sql.calls.length,0);});
test('GET recovery is bound to contract and immutable original attempt',async()=>{const{handler,sql}=setup({result:receipt({replayed:true})}),res=response();await handler(get({resource:'attempt',contractId:CONTRACT,key:ID}),res);assert.equal(res.statusCode,200);assert.equal(res.headers['Idempotency-Replayed'],'true');assert.deepEqual(sql.calls[0].params.slice(1),[CONTRACT,ID]);});
test('Vercel raw reader ignores lossy body getter, enforces exact byte count and 32KiB stream bound',async()=>{
 for(const source of ['{"operation":"propose","operati\\u006fn":"review","payload":{}}',' '.repeat(EMPLOYMENT_CHANGE_MAX_BYTES)+request().body]){
  const req=request(),stream=new PassThrough();let reads=0;Object.defineProperty(req,'body',{get(){reads++;throw Error('lossy getter');}});req.on=(n,l)=>stream.on(n,l);req.read=()=>null;req.complete=true;
  const{handler,sql}=setup(),res=response(),done=handler(req,res);stream.end(Buffer.from(source));await done;assert.equal(reads,0);assert.ok(res.statusCode>=400);assert.equal(sql.calls.length,0);
 }
 await assert.rejects(readCatalogBody({headers:{'content-length':'1'},body:request().body},{maxBytes:EMPLOYMENT_CHANGE_MAX_BYTES}),{status:400});
 for(const maxBytes of [0,-1,1.5,2**30])await assert.rejects(readCatalogBody({headers:{},body:request().body},{maxBytes}),{status:400});
});
