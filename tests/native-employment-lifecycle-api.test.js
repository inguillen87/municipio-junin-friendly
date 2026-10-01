import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {LIFECYCLE_VERSION, lifecycleProposalInput, lifecycleReviewInput, validateLifecycleBootstrap, validateLifecycleProposal, validateLifecycleReceipt} from '../assets/native-employment-lifecycle-model.js';
import {employmentLifecycleOperation, employmentLifecycleError, EMPLOYMENT_LIFECYCLE_MAX_BYTES} from '../lib/internal-employment-lifecycle.js';
import {createEmploymentLifecycleHandler} from '../api/internal-employment-lifecycle.js';
import {readCatalogBody} from '../api/internal-employment-catalog.js';
import {ID, CONTRACT, TENANT, principal as employeePrincipal, session, catalog as sourceCatalog} from './fixtures/native-employee-synthetic.js';

const baseVersion = 'b'.repeat(64), scopeVersion = 'd'.repeat(64), identityToken = 'e'.repeat(64), catalogVersion = 'c'.repeat(64);
const subject = () => ({contractId:CONTRACT, legajo:'5001', employeeName:'PERSONA SINTÉTICA QA', identityToken, sourceCutoff:null, origin:'MUNICONTROL', registrationId:ID, registeredAt:'2026-09-23T12:00:00Z'});
const proposalInput = () => ({contractId:CONTRACT, identityToken, scopeVersion, baseVersion, movement:'terminate', date:'2026-10-01', legalReference:'Resolución sintética QA', reason:'Rectificación administrativa sintética QA'});
const reviewInput = () => ({contractId:CONTRACT, proposalId:ID, scopeVersion, decision:'approve', reason:'Revisión independiente sintética QA'});
const summary = (patch={}) => ({id:ID,status:'pending',movement:'terminate',date:'2026-10-01',reason:'Motivo sintético QA',legalReference:'Resolución QA',createdAt:'2026-09-23T12:00:00Z',authorLabel:'preparador@example.invalid',baseVersion,canReview:true,...patch});
const bootstrap = () => ({version:LIFECYCLE_VERSION,scopeVersion,subject:subject(),employment:{intervals:[{"startDate":"2026-09-21","endDate":null}],version:baseVersion,revision:0,appliedAt:null,today:'2026-10-01',status:'active'},permissions:{canPropose:true,canReview:true},proposals:[summary()],historyTruncated:false});
const proposal = () => ({version:LIFECYCLE_VERSION,proposal:{...summary(),contractId:CONTRACT,subject:subject(),before:{intervals:[{"startDate":"2026-09-21","endDate":null}]},after:{intervals:[{"startDate":"2026-09-21","endDate":"2026-10-01"}]},review:null}});
const receipt = (patch={}) => ({version:LIFECYCLE_VERSION,operation:'propose',contractId:CONTRACT,proposalId:ID,status:'pending',employmentVersion:baseVersion,revision:0,replayed:false,payrollModified:false,...patch});
const principal = {...employeePrincipal,tenant:{...employeePrincipal.tenant,effectiveCapabilities:['workforce.employee.read','employee.record.propose','employee.record.approve']}};
const mockSql = result => ({calls:[],async query(query,params){this.calls.push({query,params});return [{result}];}});

const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(v){this.payload=v;return this;}});
const request=()=>({method:'POST',url:'/api/internal-employment-lifecycle',query:{},headers:{origin:'https://municipio.example','sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':ID},body:JSON.stringify({operation:'propose',payload:proposalInput()})});
const get=q=>({method:'GET',url:'/api/internal-employment-lifecycle?'+new URLSearchParams(q),query:q,headers:{}});
function setup(options={}){const sql=mockSql(options.result??receipt()),stats={connections:0};const handler=createEmploymentLifecycleHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},sessionFor:()=>session,requireAccess:async(_req,res,gates)=>{stats.gates=gates;if(options.anonymous){res.status(401).json({ok:false});return null;}return options.access??{mode:'managed',principal};},getSql:async()=>{stats.connections++;return sql;}});return{handler,sql,stats};}
test('API requires certified managed authority and returns a private receipt',async()=>{const{handler,stats}=setup(),res=response();await handler(request(),res);assert.equal(res.statusCode,201);assert.match(res.headers['Cache-Control'],/no-store/);assert.equal(stats.gates.requireCertifiedDataBinding,true);assert.equal(stats.gates.allowLegacy,false);});
test('invalid managed session is rejected before consuming the body or opening SQL',async()=>{
 let reads=0,connections=0;const req=request(),res=response();Object.defineProperty(req,'body',{get(){reads++;throw Error('must not consume');}});
 const handler=createEmploymentLifecycleHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>{throw Object.assign(Error('Sesión QA vencida'),{code:'NATIVE_EMPLOYEE_SESSION_INVALID'});},getSql:async()=>{connections++;throw Error('must not connect');}});
 await handler(req,res);assert.equal(res.statusCode,401);assert.equal(reads,0);assert.equal(connections,0);assert.match(res.headers['Cache-Control'],/no-store/);
});
test('anonymous bodies are not consumed and employee creation does not confer rectification permission',async()=>{
 for(const options of [{anonymous:true},{access:{mode:'managed',principal:employeePrincipal}}]){const{handler,stats}=setup(options),req=request(),res=response();if(options.anonymous)Object.defineProperty(req,'body',{get(){throw Error('must not read');}});await handler(req,res);assert.equal(res.statusCode,options.anonymous?401:403);assert.equal(stats.connections,0);}
});
for(const[label,mutate]of[
 ['cross-origin',r=>r.headers.origin='https://evil.invalid'],['wrong media',r=>r.headers['content-type']='text/plain'],['large declared body',r=>r.headers['content-length']=String(EMPLOYMENT_LIFECYCLE_MAX_BYTES+1)],
 ['duplicate query',r=>{r.method='GET';r.query={resource:'bootstrap',contractId:CONTRACT};r.url+='?'+new URLSearchParams(r.query)+'&contractId='+CONTRACT;}],
 ['client tenant',r=>{r.query={tenantId:TENANT};r.url+='?tenantId='+TENANT;}],['unsupported method',r=>r.method='DELETE'],['duplicate command',r=>r.body='{"operation":"propose","operati\\u006fn":"review","payload":{}}'],
 ['invalid utf8',r=>r.body=Buffer.from([0xff])],['unknown command',r=>r.body=JSON.stringify({operation:'erase',payload:proposalInput()})],['oversize whitespace without length',r=>r.body=' '.repeat(EMPLOYMENT_LIFECYCLE_MAX_BYTES)+r.body]
])test('API refuses '+label,async()=>{const{handler,sql}=setup(),req=request(),res=response();mutate(req);await handler(req,res);assert.ok(res.statusCode>=400);assert.equal(sql.calls.length,0);});
test('GET recovery is bound to contract and immutable original attempt',async()=>{const{handler,sql}=setup({result:receipt({replayed:true})}),res=response();await handler(get({resource:'attempt',contractId:CONTRACT,key:ID}),res);assert.equal(res.statusCode,200);assert.equal(res.headers['Idempotency-Replayed'],'true');assert.deepEqual(sql.calls[0].params.slice(1),[CONTRACT,ID]);});
test('Vercel raw reader ignores lossy body getter, enforces exact byte count and 32KiB stream bound',async()=>{
 for(const source of ['{"operation":"propose","operati\\u006fn":"review","payload":{}}',' '.repeat(EMPLOYMENT_LIFECYCLE_MAX_BYTES)+request().body]){
  const req=request(),stream=new PassThrough();let reads=0;Object.defineProperty(req,'body',{get(){reads++;throw Error('lossy getter');}});req.on=(n,l)=>stream.on(n,l);req.read=()=>null;req.complete=true;
  const{handler,sql}=setup(),res=response(),done=handler(req,res);stream.end(Buffer.from(source));await done;assert.equal(reads,0);assert.ok(res.statusCode>=400);assert.equal(sql.calls.length,0);
 }
 await assert.rejects(readCatalogBody({headers:{'content-length':'1'},body:request().body},{maxBytes:EMPLOYMENT_LIFECYCLE_MAX_BYTES}),{status:400});
 for(const maxBytes of [0,-1,1.5,2**30])await assert.rejects(readCatalogBody({headers:{},body:request().body},{maxBytes}),{status:400});
});
