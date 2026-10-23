// Real proposed API + service, using finite synthetic callbacks only. No HTTP
// listener, DB adapter, IAM provider, SQL constructor or municipal identities.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createOwnAnnulPreparationHandler} from '../api/internal-own-payroll-annulment-preparation.js';
import {OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';
import {syntheticAnnulPreparation,prepUuid,prepHash} from './fixtures/own-payroll-annulment-preparation-synthetic.js';

const endpoint='/api/internal-own-payroll-annulment-preparation',origin='https://municipio.example';
const principal={user:{email:'third-preparer-api@example.invalid'},tenant:{source:'membership',id:prepUuid(50),membershipId:prepUuid(51),effectiveCapabilities:OWN_RUN_PREPARE}};
const session={email:principal.user.email,id:prepUuid(52),version:1,releaseSha:'d'.repeat(40)};
function response({stream=true}={}){
 const r=new EventEmitter();Object.assign(r,{headers:{},chunks:[],statusCode:null,headersSent:false,destroyed:false,setHeader(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},json(value){this.value=value;return this;},destroy(){this.destroyed=true;}});
 if(stream)Object.assign(r,{write(chunk){this.headersSent=true;this.chunks.push(Buffer.from(chunk));return true;},end(){this.ended=true;this.value=JSON.parse(Buffer.concat(this.chunks).toString('utf8'));}});
 return r;
}
function request(value=syntheticAnnulPreparation(),accept='application/json'){
 const query={resource:'detail',id:value.source.id};return{method:'GET',query,url:endpoint+'?'+new URLSearchParams(query),headers:{accept}};
}
function setup(value,{caps=OWN_RUN_PREPARE,mode='managed',source='membership',currentSession=session,authorizeNull=false,onCall=()=>{},onAuthorize=()=>{}}={}){
 const calls=[],stats={authorize:0,connect:0,session:0};
 const handler=createOwnAnnulPreparationHandler({env:{INTERNAL_APP_ORIGIN:origin},requireAccess:async(req,res,options)=>{
  stats.authorize++;assert.deepEqual(options.requiredCapabilities,OWN_RUN_PREPARE);assert.equal(options.capabilityMode,'all');assert.equal(options.requireDataPlaneReady,true);assert.equal(options.requireCertifiedDataBinding,true);assert.equal(options.allowLegacy,false);
  onAuthorize(req);
  if(authorizeNull){res.status(401).json({ok:false,code:'AUTH_TEST_DENIED'});return null;}
  return{mode,principal:{...principal,tenant:{...principal.tenant,source,effectiveCapabilities:caps}}};
 },sessionFor:()=>{stats.session++;return currentSession;},getSql:async env=>{
  stats.connect++;assert.deepEqual(env,{INTERNAL_APP_ORIGIN:origin});return{query:async(statement,values)=>{
   calls.push({statement,values});onCall(calls.length,statement,values);
   if(statement==='SELECT public.own_run_bootstrap_v2($1::jsonb) AS result')return[{result:{version:'own-payroll-bootstrap.v2',scopeVersion:value.scopeVersion,programVersion:prepHash('Invented programme'),canCalculate:true,runs:[],complete:true}}];
   assert.ok(['SELECT public.own_annul_preparation_v1($1::jsonb,$2::uuid) AS result','SELECT public.own_annul_preparation_full_v1($1::jsonb,$2::uuid) AS result'].includes(statement));return[{result:structuredClone(value)}];
  }};
 }});return{handler,calls,stats};
}
for(const accept of ['application/json',OWN_RUN_FULL_JSON])for(const receiptVersion of ['own-annul-receipt.v1','own-annul-receipt.v2'])test('GET '+receiptVersion+' '+accept+' returns the exact complete projection without a command',async()=>{
 const value=syntheticAnnulPreparation({receiptVersion}),s=setup(value),r=response();await s.handler(request(value,accept),r);
 assert.equal(r.statusCode,200);assert.deepEqual(r.value,{ok:true,data:value});assert.equal(s.calls.length,3);assert.equal(s.stats.authorize,1);assert.equal(s.stats.connect,1);assert.equal(s.stats.session,1);assert.match(r.headers['Cache-Control'],/no-store/);assert.equal(r.headers['Referrer-Policy'],'no-referrer');assert.equal(r.headers['X-Content-Type-Options'],'nosniff');
 if(accept===OWN_RUN_FULL_JSON){assert.equal(r.ended,true);assert.equal(r.headers['Content-Type'],OWN_RUN_FULL_JSON+'; charset=utf-8');assert.equal(Number(r.headers['X-MuniControl-JSON-Bytes']),Buffer.concat(r.chunks).length);}else assert.equal(r.ended,undefined);
 assert.equal(r.value.data.affected.length,6);assert.equal(r.value.data.dateGroups.length,3);assert.equal(r.value.data.dateGroups[0].liquidationDate,null);assert.ok(!Object.hasOwn(r.value.data,'key'));assert.ok(!Object.hasOwn(r.value.data,'receipt'));
 assert.ok(s.calls.every(call=>!/(?:command|complete|capture|attempt|liquidation_detail)/.test(call.statement)));
});
test('all non-GET methods reject before private body, header getters, authorization or connection',async()=>{
 for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS']){
  const value=syntheticAnnulPreparation(),s=setup(value),q={method},r=response();let reads=0;for(const key of ['body','headers','query'])Object.defineProperty(q,key,{get(){reads++;throw Error('PRIVATE_INPUT_READ');}});
  await s.handler(q,r);assert.equal(r.statusCode,405);assert.equal(r.headers.Allow,'GET');assert.equal(reads,0);assert.equal(s.stats.authorize,0);assert.equal(s.stats.connect,0);assert.equal(s.calls.length,0);
 }
});
test('GET does not inspect a decoded body getter or attach request stream listeners',async()=>{
 const value=syntheticAnnulPreparation(),s=setup(value),q=request(value),r=response();let reads=0;for(const key of ['body','on','once'])Object.defineProperty(q,key,{get(){reads++;throw Error('PRIVATE_BODY_READ');}});await s.handler(q,r);assert.equal(r.statusCode,200);assert.equal(reads,0);assert.equal(s.calls.length,3);
});
test('the reference verified from raw query is fixed before asynchronous authorization',async()=>{
 const value=syntheticAnnulPreparation(),s=setup(value,{onAuthorize:req=>{req.query.id=prepUuid(999);}}),r=response();await s.handler(request(value),r);assert.equal(r.statusCode,200);assert.equal(s.calls[1].values[1],value.source.id);assert.equal(r.value.data.source.id,value.source.id);
});
test('every missing prepare or nominal capability fails before obtaining SQL',async()=>{
 for(const cap of OWN_RUN_PREPARE){const value=syntheticAnnulPreparation(),s=setup(value,{caps:OWN_RUN_PREPARE.filter(item=>item!==cap)}),r=response();await s.handler(request(value),r);assert.equal(r.statusCode,403,cap);assert.equal(s.stats.session,0);assert.equal(s.stats.connect,0);assert.equal(s.calls.length,0);}
});
test('legacy and non-membership contexts cannot read a projected preparation',async()=>{
 for(const options of [{mode:'legacy'},{source:'legacy'}]){const value=syntheticAnnulPreparation(),s=setup(value,options),r=response();await s.handler(request(value),r);assert.equal(r.statusCode,403);assert.equal(s.stats.connect,0);assert.equal(s.calls.length,0);}
});
test('denied gateway response remains terminal with no session or SQL call',async()=>{
 const value=syntheticAnnulPreparation(),s=setup(value,{authorizeNull:true}),r=response();await s.handler(request(value),r);assert.equal(r.statusCode,401);assert.deepEqual(r.value,{ok:false,code:'AUTH_TEST_DENIED'});assert.equal(s.stats.session,0);assert.equal(s.stats.connect,0);assert.equal(s.calls.length,0);
});
test('invalid current session fails before SQL without exposing identity',async()=>{
 const value=syntheticAnnulPreparation(),s=setup(value,{currentSession:{...session,email:'foreign@example.invalid'}}),r=response();await s.handler(request(value),r);assert.equal(r.statusCode,401);assert.equal(s.stats.connect,0);assert.equal(s.calls.length,0);assert.ok(!r.value.error.includes('foreign@example.invalid'));
});
test('query is exactly resource detail and one canonical UUID',async()=>{
 for(const query of [null,[],{resource:'attempt',id:prepUuid(900)},{resource:'detail',id:'bad'},{resource:'detail',id:[prepUuid(900)]},{resource:'detail',id:prepUuid(900),key:prepUuid(1)},{resource:'detail'}]){
  const value=syntheticAnnulPreparation(),s=setup(value),q=request(value),r=response();q.query=query;q.url=endpoint;await s.handler(q,r);assert.equal(r.statusCode,400);assert.equal(s.stats.authorize,0);assert.equal(s.calls.length,0);
 }
});
test('raw repeated, escaped duplicate, mismatched and missing query keys are refused before access',async()=>{
 for(const rewrite of [url=>url+'&id='+prepUuid(900),url=>url+'&%69d='+prepUuid(900),url=>url.replace(prepUuid(900),prepUuid(901)),()=>endpoint+'?resource=detail']){
  const value=syntheticAnnulPreparation(),s=setup(value),q=request(value),r=response();q.url=rewrite(q.url);await s.handler(q,r);assert.equal(r.statusCode,400);assert.equal(s.stats.authorize,0);assert.equal(s.calls.length,0);
 }
});
test('unsupported and ambiguous Accept profiles are rejected without authorization',async()=>{
 for(const headers of [{accept:'text/html'},{accept:'application/json, '+OWN_RUN_FULL_JSON},{accept:['application/json',OWN_RUN_FULL_JSON]},{accept:OWN_RUN_FULL_JSON,Accept:'application/json'}]){
  const value=syntheticAnnulPreparation(),s=setup(value),q=request(value),r=response();q.headers=headers;await s.handler(q,r);assert.ok([400,406].includes(r.statusCode));assert.equal(s.stats.authorize,0);assert.equal(s.calls.length,0);
 }
 const value=syntheticAnnulPreparation(),s=setup(value),q=request(value),r=response();q.rawHeaders=['Accept','application/json','aCcEpT',OWN_RUN_FULL_JSON];await s.handler(q,r);assert.equal(r.statusCode,400);assert.equal(s.stats.authorize,0);
});
test('full negotiation needs response streaming before authorization',async()=>{
 const value=syntheticAnnulPreparation(),s=setup(value),r=response({stream:false});await s.handler(request(value,OWN_RUN_FULL_JSON),r);assert.equal(r.statusCode,503);assert.equal(s.stats.authorize,0);assert.equal(s.stats.connect,0);assert.equal(s.calls.length,0);
});
test('native state changes are409 and unknown errors return sanitized503',async()=>{
 for(const message of ['OWN_ANNUL_PREPARATION_CURRENT_STATE_CHANGED PRIVATE_SQL_SENTINEL','XX000 PRIVATE_SQL_SENTINEL']){
  const value=syntheticAnnulPreparation(),s=setup(value,{onCall:n=>{if(n===2)throw Error(message);}}),r=response();await s.handler(request(value),r);assert.equal(r.statusCode,message.startsWith('XX000')?503:409);assert.equal(r.value.ok,false);assert.ok(!JSON.stringify(r.value).includes('PRIVATE_SQL_SENTINEL'));assert.equal(s.calls.length,2);assert.equal(r.ended,undefined);
 }
});
test('a closed full stream is destroyed without sending a second JSON error',async()=>{
 const value=syntheticAnnulPreparation(),s=setup(value),r=response();let jsonCalls=0;r.json=function(v){jsonCalls++;this.value=v;return this;};r.write=function(chunk){this.headersSent=true;throw Error('PRIVATE_WRITE_SENTINEL');};await s.handler(request(value,OWN_RUN_FULL_JSON),r);assert.equal(r.destroyed,true);assert.equal(jsonCalls,0);assert.equal(s.calls.length,3);
});


for(const at of [1,3])test('native bootstrap permission and capacity errors keep the safe HTTP status at read'+at,async()=>{
 for(const [message,code,status]of [['OWN_RUN_FORBIDDEN','FORBIDDEN',403],['OWN_RUN_LIMIT','LIMIT',422]]){
  const value=syntheticAnnulPreparation(),s=setup(value,{onCall:n=>{if(n===at)throw Error(message+' PRIVATE_BOOTSTRAP_SENTINEL');}}),r=response();
  await s.handler(request(value),r);assert.equal(r.statusCode,status);assert.equal(r.value.ok,false);assert.equal(r.value.code,'OWN_ANNUL_PREPARATION_'+code);
  assert.ok(!JSON.stringify(r.value).includes('PRIVATE_BOOTSTRAP_SENTINEL'));assert.equal(s.calls.length,at);assert.equal(r.ended,undefined);
 }
});
