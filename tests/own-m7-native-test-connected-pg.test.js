// Recording constructors only. Network/children are forbidden before imports.
// These tests do not establish native SQL, provider, TLS or workflow outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const forbidden=()=>{throw Error('M7_CONNECTED_UNIT_EXTERNAL_IO_FORBIDDEN');};globalThis.fetch=forbidden;net.connect=net.createConnection=net.Socket.prototype.connect=forbidden;tls.connect=forbidden;http.request=http.get=https.request=https.get=forbidden;for(const key of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])child[key]=forbidden;syncBuiltinESMExports();
const{createOwnM7NativeTestConnectedSessions:createSessions,ownM7NativeTestConnectedFailureObservation:failureObservation,assertOwnM7NativeTestConnectedBusiness:assertBusiness}=await import('../scripts/lib/own-m7-native-test-connected-pg.mjs');
const{OWN_M7_NATIVE_TEST_POLICY_SQL:policySql}=await import('../scripts/lib/own-m7-native-test-business-pg.mjs');
const hash=value=>createHash('sha256').update(value).digest('hex'),owner='neondb_owner',runtime='municontrol_actions_runtime_app',ownerSecret='UNIT_OWNER_PASSWORD',runtimeSecret='UNIT_RUNTIME_PASSWORD';
const prod={major:17,projectId:'noisy-poetry-54471701',branchId:'br-plain-dust-acpjgebb',endpointId:'ep-shiny-cherry-actlyudg',database:'neondb',role:owner,guardOid:532699,host:'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech'};
const target={...prod,branchId:'br-connected-unit-test',endpointId:'ep-connected-unit-test',host:'ep-connected-unit-test.sa-east-1.aws.neon.tech'};
const id='00000000-0000-4000-8000-000000000001',service='SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result',parameters=['{"actor":"unit"}','{"opaque":"public. $1 ; O\u0027Connor"}',id,'a'.repeat(64)];
const seed=[{text:'INSERT INTO public.internal_users(email,display_name) VALUES($1::text,$2::text)',values:['unit@example.invalid','Actor sintético']}];
const observed=[{text:'SELECT count(*)::integer AS seed_count FROM public.internal_users WHERE email=$1::text',values:['unit@example.invalid']}];
const batch=statements=>({statements,expectedSha256:hash(JSON.stringify(statements))}),seedInput=(onBeforeEnd=()=>{})=>({...batch(seed),expectedRowCounts:[1],onBeforeEnd}),readInput=(onBeforeEnd=()=>{})=>({...batch(observed),onBeforeEnd});
function metadata(change=null){const value={branch:{id:target.branchId,project_id:prod.projectId,parent_id:prod.branchId,primary:false,default:false},computes:[{id:target.endpointId,host:target.host,project_id:prod.projectId,branch_id:target.branchId,type:'read_write',disabled:false,pooler_enabled:false}]};if(change)change(value);const raw=Buffer.from(JSON.stringify(value));return{branchCreationRaw:raw,branchCreationSha256:hash(raw)};}
const connection=(role,password)=>'postgresql://'+role+':'+password+'@'+target.host+'/neondb?sslmode=verify-full';
function fixture({postgresSsl=false,mutateClient,mutateIdentity,duplicate=false}={}){
 const f={clients:[],queries:[],events:[],hook:null,alive:0,maxAlive:0};
 class Client{
  constructor(config){this.config=config;this.index=f.clients.length;this.slot=config.application_name.split('-').at(-1);this.connectionParameters={...config};this.ssl=config.ssl;this.handlers=new Map();this.ended=false;this.isolation=null;this.readOnly=null;f.clients.push(this);this.stream={encrypted:true,authorized:true,authorizationError:null,destroyed:false,writable:true,servername:config.host,getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({raw:Buffer.from('UNIT CONNECTED CERTIFICATE'),subjectaltname:'DNS:'+config.host})};this.connection={ssl:config.ssl,stream:this.stream};if(mutateClient)mutateClient(this);}
  on(name,handler){this.handlers.set(name,handler);return this;}
  async connect(){f.alive++;f.maxAlive=Math.max(f.alive,f.maxAlive);f.events.push(['connect',this.slot]);}
  async end(){if(this.endError)throw this.endError;if(!this.ended){this.ended=true;f.alive--;f.events.push(['end',this.slot]);}}
  async query(config){assert.equal(config.queryMode,'extended');const{text,values}=config;f.queries.push({slot:this.slot,text,values});f.events.push(['query',this.slot,text]);let result={command:'SELECT',rowCount:1,rows:[{result:{unit:true,id}}]};
   if(text.startsWith('BEGIN ')){this.readOnly=text.endsWith('READ ONLY')?'on':'off';this.isolation=this.readOnly==='on'?'repeatable read':'read committed';result={command:'BEGIN',rowCount:null,rows:[]};}
   else if(text.startsWith('SET '))result={command:'SET',rowCount:null,rows:[]};
   else if(text==='COMMIT'||text==='ROLLBACK')result={command:text,rowCount:null,rows:[]};
   else if(text.startsWith('INSERT '))result={command:'INSERT',rowCount:1,rows:[]};
   else if(text===policySql)result={command:'UPDATE',rowCount:1,rows:[]};
   else if(text===observed[0].text)result={command:'SELECT',rowCount:1,rows:[{seed_count:1}]};
   else if(text.startsWith('DO '))result={command:'DO',rowCount:null,rows:[]};
   if(text.includes(' AS "postgresSsl"')){const actual={major:17,projectId:prod.projectId,branchId:target.branchId,endpointId:target.endpointId,database:'neondb',role:this.config.user,sessionUser:this.config.user,guardOid:String(prod.guardOid),isolation:this.isolation,readOnly:this.readOnly,standardConformingStrings:'on',postgresSsl,native:{pid:duplicate?7000:7000+this.index,backendStart:'2026-10-28T12:00:00.000001+00:00',serverVersionNum:'170011'}};if(mutateIdentity)mutateIdentity(actual,this);result={command:'SELECT',rowCount:1,rows:[actual]};}
   if(f.hook){const value=await f.hook({client:this,text,values,result});if(value!==undefined)result=value;}return result;
  }
 }
 f.options={major:17,Client,ownerConnectionValue:connection(owner,ownerSecret),runtimeConnectionValue:connection(runtime,runtimeSecret),...metadata(),seedRetentionExpected:true};return f;
}
async function opened(options){const f=fixture(options),bundle=await createSessions(f.options);return{f,bundle};}
async function committed(options){const value=await opened(options);await value.bundle.commitSeed(seedInput());return value;}
async function seedObserved(options){const value=await committed(options);await value.bundle.observeSeed(readInput());return value;}
async function business(options){const value=await seedObserved(options);await value.bundle.beginBusiness();return value;}
async function stopped(bundle,f,operation,predicate){let failure;try{await operation();}catch(error){failure=error;}assert.ok(failure);if(predicate)predicate(failure);const before=f.queries.length;assert.equal(bundle.observation().uncertain,true);await assert.rejects(()=>bundle.sql.query(service,parameters),error=>error===failure);assert.equal(f.queries.length,before);await bundle.close().catch(()=>{});return failure;}

test('retained TEST seed and rollback-only workflow use three actual LOGIN identities without SET ROLE or GRANT',async()=>{
 const{f,bundle}=await opened();assert.equal(f.clients.length,1);assert.equal(f.queries.length,0);assert.equal(bundle.target.role,owner);assert.equal(bundle.target.kind,'test');assert.equal(bundle.seedRetentionExpected,true);assert.equal(bundle.completeAuth,false);
 const seedResult=await bundle.commitSeed(seedInput(snapshot=>{assert.equal(snapshot.end,'COMMIT');assert.equal(snapshot.slot,'owner');assert.equal(snapshot.identity.role,owner);assert.equal(snapshot.identity.sessionUser,owner);assert.equal(snapshot.readOnly,false);assert.ok(Object.isFrozen(snapshot.rows));assert.deepEqual(snapshot.statementResults,[{command:'INSERT',rowCount:1,rows:[]}]);assert.ok(Object.isFrozen(snapshot.statementResults[0]));f.events.push(['persist','seed']);}));assert.equal(seedResult.end.commitObserved,true);assert.equal(f.clients.length,1);
 await bundle.observeSeed(readInput(snapshot=>{assert.equal(snapshot.phase,'seedObserver');assert.equal(snapshot.readOnly,true);assert.deepEqual(snapshot.rows,[[{seed_count:1}]]);f.events.push(['persist','seedObserver']);}));assert.equal(f.clients.length,2);assert.ok(!f.clients.some(c=>c.slot==='runtime'));
 const begin=await bundle.beginBusiness();assert.equal(begin.identity.role,runtime);assert.equal(begin.identity.sessionUser,runtime);assert.equal(begin.identity.database,'neondb');assert.equal(f.clients.length,3);
 const rows=await bundle.sql.query(service,parameters);assert.deepEqual(rows,[{result:{unit:true,id}}]);assert.deepEqual(f.queries.find(row=>row.text===service),{slot:'runtime',text:service,values:parameters});
 const rolled=await bundle.rollbackBusiness({onBeforeEnd:snapshot=>{assert.equal(snapshot.end,'ROLLBACK');assert.equal(snapshot.identity.role,runtime);assert.ok(Object.isFrozen(snapshot.rows[0][0].result));f.events.push(['persist','business']);}});assert.equal(rolled.end.rollbackObserved,true);assert.equal(rolled.end.commitObserved,false);
 await bundle.observeRollback(readInput(snapshot=>{assert.equal(snapshot.phase,'rollbackObserver');assert.equal(snapshot.identity.native.pid,7001);f.events.push(['persist','rollbackObserver']);}));
 const evidence=bundle.observation();assert.equal(evidence.state,'observed');assert.equal(evidence.uncertain,false);assert.equal(evidence.ownedSessions,3);assert.equal(f.maxAlive,3);assert.equal(evidence.identities.owner.role,owner);assert.equal(evidence.identities.runtime.role,runtime);assert.equal(evidence.identities.observer.role,owner);assert.equal(new Set(Object.values(evidence.identities).map(row=>row.native.pid)).size,3);assert.equal(evidence.tlsObservations.length,4);assert.ok(evidence.tlsObservations.every(row=>row.postgresSsl===false));assert.equal(evidence.target.role,owner);
 assert.equal(f.queries.filter(row=>row.text==='COMMIT'&&row.slot==='runtime').length,0);assert.equal(f.queries.filter(row=>row.text==='ROLLBACK'&&row.slot==='runtime').length,1);assert.equal(f.queries.filter(row=>row.slot==='observer'&&row.text.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')).length,2);assert.equal(f.queries.some(row=>/^(?:SET.*ROLE|RESET ROLE|GRANT|REVOKE)/.test(row.text)),false);
 assert.equal(JSON.stringify(evidence).includes(ownerSecret),false);assert.equal(JSON.stringify(evidence).includes(runtimeSecret),false);await bundle.close();assert.equal(f.alive,0);
});

test('factory requires explicit retained-seed declaration and separate real runtime LOGIN URL before opening clients',async()=>{
 for(const change of [o=>{o.seedRetentionExpected=false;},o=>{delete o.seedRetentionExpected;},o=>{o.runtimeConnectionValue=o.ownerConnectionValue;},o=>{o.ownerConnectionValue=o.runtimeConnectionValue;},o=>{o.runtimeConnectionValue=o.runtimeConnectionValue.replace(target.host,prod.host);},o=>{o.runtimeConnectionValue=o.runtimeConnectionValue.replace('verify-full','require');}]){const f=fixture();change(f.options);await assert.rejects(()=>createSessions(f.options));assert.equal(f.clients.length,0);}
});

test('test metadata rejects production identifiers, foreign parent/project and forged passed flags',async()=>{
 for(const change of [v=>{v.branch.id=prod.branchId;v.computes[0].branch_id=prod.branchId;},v=>{v.computes[0].id=prod.endpointId;v.computes[0].host=prod.host;},v=>{v.branch.parent_id='br-foreign';},v=>{v.branch.project_id='foreign';},v=>{v.computes[0].pooler_enabled=true;},v=>{v.passed=true;}]){const f=fixture();await assert.rejects(()=>createSessions({...f.options,...metadata(change)}));assert.equal(f.clients.length,0);}
});

test('runtime cannot open before seed COMMIT and independent observer completion',async()=>{
 const a=await opened();await stopped(a.bundle,a.f,()=>a.bundle.beginBusiness());assert.equal(a.f.clients.length,1);
 const b=await committed();await stopped(b.bundle,b.f,()=>b.bundle.beginBusiness());assert.equal(b.f.clients.length,1);
 const c=await opened();await stopped(c.bundle,c.f,()=>c.bundle.observeSeed(readInput()));assert.equal(c.f.clients.length,1);
});

test('seed prevalidation, row counts and mandatory immutable persistence prevent an unvalidated COMMIT',async()=>{
 for(const input of [{...seedInput(),expectedSha256:'0'.repeat(64)},{...seedInput(),expectedRowCounts:[0]},{...seedInput(),onBeforeEnd:null},{...batch([{text:'UPDATE public.internal_users SET active=false',values:[]}]),expectedRowCounts:[1],onBeforeEnd:()=>{}}]){const a=await opened();await stopped(a.bundle,a.f,()=>a.bundle.commitSeed(input));assert.equal(a.f.queries.length,0);}
 const b=await opened();b.f.hook=({text,result})=>text===seed[0].text?{...result,rowCount:0}:undefined;await stopped(b.bundle,b.f,()=>b.bundle.commitSeed(seedInput()));assert.equal(b.f.queries.some(row=>row.text==='COMMIT'),false);
 const c=await opened(),original=Object.freeze(Error('UNIT_SEED_PERSIST_FAILURE'));await stopped(c.bundle,c.f,()=>c.bundle.commitSeed(seedInput(snapshot=>{assert.throws(()=>{snapshot.rows.push([]);},TypeError);throw original;})),error=>{assert.strictEqual(error,original);assert.equal(failureObservation(error).transaction.endRequested,false);});assert.equal(c.f.clients.length,1);
});

test('seed inputs and persistence callback are detached before awaits',async()=>{
 const a=await opened();let originalCalls=0,replacedCalls=0;const statements=structuredClone(seed),input={...batch(statements),expectedRowCounts:[1],onBeforeEnd:()=>{originalCalls++;}};
 a.f.hook=({text})=>{if(text.startsWith('BEGIN ')){input.expectedRowCounts[0]=0;input.onBeforeEnd=()=>{replacedCalls++;};statements[0].values[0]='mutated@example.invalid';}};
 await a.bundle.commitSeed(input);assert.equal(originalCalls,1);assert.equal(replacedCalls,0);assert.equal(a.f.queries.find(row=>row.text===seed[0].text).values[0],seed[0].values[0]);await a.bundle.close();
});

test('seed COMMIT transport loss or wrong response tag remains UNCERTAIN and never creates an observer/runtime',async()=>{
 for(const kind of ['loss','wrong','tls-after']){const a=await opened(),original=Object.assign(Error('UNIT_SEED_COMMIT_LOSS'),{code:'ECONNRESET'});a.f.hook=({client,text,result})=>{if(text==='COMMIT'){if(kind==='loss')throw original;if(kind==='wrong')return{...result,command:'ROLLBACK'};client.stream.authorized=false;}};
  await stopped(a.bundle,a.f,()=>a.bundle.commitSeed(seedInput()),error=>{const safe=failureObservation(error).transaction;assert.equal(safe.endRequested,true);assert.equal(safe.endCommand,kind==='loss'?null:kind==='wrong'?'ROLLBACK':'COMMIT');assert.equal(safe.seedCommitObserved,kind==='tls-after');assert.equal(safe.uncertain,true);});assert.equal(a.f.clients.length,1);
 }
});

test('strict TLS is checked for owner/runtime/observer using each actual socket role',async()=>{
 for(const mutateClient of [c=>{c.stream.authorized=false;},c=>{c.stream.getProtocol=()=> 'TLSv1.1';},c=>{c.stream.getPeerCertificate=()=>({raw:Buffer.from('unit'),subjectaltname:'DNS:foreign.invalid'});},c=>{c.connectionParameters.ssl={...c.ssl,rejectUnauthorized:false};}]){const f=fixture({mutateClient});await assert.rejects(()=>createSessions(f.options));assert.equal(f.queries.length,0);assert.equal(f.alive,0);}
 const a=await seedObserved();a.f.hook=({client,text})=>{if(client.slot==='runtime'&&text.startsWith('BEGIN '))client.stream.authorized=false;};await stopped(a.bundle,a.f,()=>a.bundle.beginBusiness());assert.equal(a.f.queries.some(row=>row.slot==='runtime'&&row.text.includes('postgresSsl')),false);
 const b=await seedObserved({mutateClient:c=>{if(c.slot==='runtime')c.connectionParameters.user=owner;}});await stopped(b.bundle,b.f,()=>b.bundle.beginBusiness());assert.equal(b.f.queries.some(row=>row.slot==='runtime'),false);
});

test('current_user=session_user runtime is mandatory; owner impersonation and destination mapping fail',async()=>{
 for(const change of [(a,c)=>{if(c.slot==='runtime')a.role=owner;},(a,c)=>{if(c.slot==='runtime')a.sessionUser=owner;},a=>{a.database='own_payroll_run_qa';},a=>{a.branchId=prod.branchId;},a=>{a.postgresSsl=null;}]){const a=await opened({mutateIdentity:change});if(change.toString().includes("slot==='runtime'")){await a.bundle.commitSeed(seedInput());await a.bundle.observeSeed(readInput());await stopped(a.bundle,a.f,()=>a.bundle.beginBusiness());}else await stopped(a.bundle,a.f,()=>a.bundle.commitSeed(seedInput()));}
});

test('all three physical identities are distinct while observer identity stays stable across its two frames',async()=>{
 const a=await committed({duplicate:true});await stopped(a.bundle,a.f,()=>a.bundle.observeSeed(readInput()),error=>assert.match(error.message,/DISTINCT_BACKENDS/));
 const b=await business();await b.bundle.rollbackBusiness({onBeforeEnd:()=>{}});b.f.hook=({client,text,result})=>{if(client.slot==='observer'&&text.includes('postgresSsl'))result.rows[0].native.pid=9999;};await stopped(b.bundle,b.f,()=>b.bundle.observeRollback(readInput()),error=>assert.match(error.message,/BACKEND_CHANGED/));
});

test('runtime SQL is restricted to the exact existing RPC map and can never request COMMIT or arbitrary DDL',async()=>{
 for(const[text,values]of [[service+'; COMMIT',parameters],['COMMIT',[]],['SET ROLE neondb_owner',[]],['CREATE TABLE public.unit(a int)',[]],[service.replace('public.',''),parameters],[service,parameters.slice(1)],[service,[{},...parameters.slice(1)]]]){const a=await business(),before=a.f.queries.length;await stopped(a.bundle,a.f,()=>a.bundle.sql.query(text,values),()=>assert.equal(a.f.queries.length,before));}
});

test('business rollback persistence, native failure and uncertain end prevent all observer recovery SQL',async()=>{
 const a=await business(),original=Object.freeze(Object.assign(Error('UNIT_NATIVE_PRIVATE '+runtimeSecret),{code:'42601'}));a.f.hook=({text})=>{if(text===service)throw original;};await stopped(a.bundle,a.f,()=>a.bundle.sql.query(service,parameters),error=>{assert.strictEqual(error,original);assert.equal(failureObservation(error).transaction.endRequested,false);});assert.equal(a.f.queries.some(row=>row.slot==='runtime'&&row.text==='ROLLBACK'),false);assert.equal(JSON.stringify(a.bundle.observation()).includes(runtimeSecret),false);
 for(const mode of ['persist','loss','wrong','tls-after']){const b=await business(),error=Object.freeze(Error('UNIT_BUSINESS_END'));b.f.hook=({client,text,result})=>{if(text==='ROLLBACK'){if(mode==='loss')throw error;if(mode==='wrong')return{...result,command:'COMMIT'};if(mode==='tls-after')client.stream.authorized=false;}};const before=b.f.queries.filter(row=>row.slot==='observer').length;
  await stopped(b.bundle,b.f,()=>b.bundle.rollbackBusiness({onBeforeEnd:()=>{if(mode==='persist')throw error;}}),caught=>{const safe=failureObservation(caught).transaction;assert.equal(safe.endRequested,mode!=='persist');assert.equal(safe.seedCommitObserved,true);assert.equal(safe.businessRollbackObserved,mode==='tls-after');});assert.equal(b.f.queries.filter(row=>row.slot==='observer').length,before);
 }
});

test('observer callback is mandatory before each RO COMMIT and failure after seed retention remains explicit',async()=>{
 const a=await committed(),original=Object.freeze(Error('UNIT_DURABLE_SEED_PROOF'));await stopped(a.bundle,a.f,()=>a.bundle.observeSeed(readInput(()=>{throw original;})),error=>{assert.strictEqual(error,original);assert.equal(failureObservation(error).transaction.seedCommitObserved,true);assert.equal(failureObservation(error).transaction.endRequested,false);});assert.equal(a.f.clients.length,2);assert.equal(a.f.clients.some(c=>c.slot==='runtime'),false);
 const b=await business();await b.bundle.rollbackBusiness({onBeforeEnd:()=>{}});await stopped(b.bundle,b.f,()=>b.bundle.observeRollback(readInput(()=>{throw original;})));assert.equal(b.bundle.observation().seedRetentionExpected,true);assert.equal(b.f.queries.filter(row=>row.slot==='observer'&&row.text==='COMMIT').length,1);
});

test('TLS/certificate changes and concurrent or idle socket errors close owned sessions without extra SQL',async()=>{
 const a=await business(),at=a.f.queries.length;a.f.clients.find(c=>c.slot==='runtime').stream.authorized=false;await stopped(a.bundle,a.f,()=>a.bundle.sql.query(service,parameters),()=>assert.equal(a.f.queries.length,at));
 const b=await business();let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});b.f.hook=async({text})=>{if(text===service){entered();await gate;}};const first=b.bundle.sql.query(service,parameters);await started;let concurrent;try{await b.bundle.rollbackBusiness({onBeforeEnd:()=>{}});}catch(error){concurrent=error;}release();await assert.rejects(()=>first,error=>error===concurrent);assert.match(concurrent.message,/CONCURRENT/);await b.bundle.close();
 const c=await business(),original=Object.freeze(Error('UNIT_IDLE_OWNER_SOCKET')),before=c.f.queries.length;c.f.clients[0].handlers.get('error')(original);await stopped(c.bundle,c.f,()=>c.bundle.sql.query(service,parameters),error=>assert.strictEqual(error,original));assert.equal(c.f.queries.length,before);assert.equal(c.f.alive,0);
});

test('safe original PG observation survives a real domain service replacing the Error',async()=>{
 const{ownRunOperation}=await import('../lib/internal-own-payroll-run.js'),native=await import('./fixtures/native-employee-synthetic.js');const a=await business(),message='UNIT_PRIVATE '+runtimeSecret,original=Object.freeze(Object.assign(Error(message),{name:'DatabaseError',code:'P0001'}));a.f.hook=({text})=>{if(text==='SELECT public.own_run_bootstrap_v1($1::jsonb) AS result')throw original;};await assert.rejects(()=>ownRunOperation(a.bundle.sql,native.principal,native.session,'bootstrap'),error=>error!==original&&error.code==='OWN_RUN_UNAVAILABLE');const before=a.f.queries.length,safe=a.bundle.observation();assert.equal(safe.failure.error.code,'P0001');assert.equal(safe.failure.error.fields.message.sha256,hash(message));assert.equal(safe.failure.transaction.socketExpectedRole,runtime);assert.equal(safe.failure.transaction.endRequested,false);assert.equal(safe.failure.transaction.seedCommitObserved,true);assert.equal(safe.failure.transaction.ownedSessionsClosed,true);assert.equal(JSON.stringify(safe).includes(runtimeSecret),false);assert.equal(a.f.queries.length,before);
});

test('non-JSON proof accessors are not invoked and close failure does not pretend full cleanup',async()=>{
 const a=await business();let getters=0;a.f.hook=({text,result})=>{if(text===service)Object.defineProperty(result.rows[0].result,'private',{enumerable:true,get(){getters++;return runtimeSecret;}});};await stopped(a.bundle,a.f,()=>a.bundle.sql.query(service,parameters),error=>assert.match(error.message,/DATA_PROPERTY/));assert.equal(getters,0);
 const b=await opened();b.f.clients[0].endError=Error('UNIT_END_FAILED');await assert.rejects(()=>b.bundle.close(),/OWNED_CLOSE_FAILED/);assert.equal(b.bundle.observation().uncertain,true);assert.equal(b.bundle.observation().ownedSessionsClosed,false);assert.equal(b.bundle.observation().frames.seed.commitObserved,false);
});

test('minted business binding is pure, rejects clones and requires the live runtime business phase',async()=>{
 const a=await opened(),before=a.f.queries.length;assert.throws(()=>assertBusiness(a.bundle),/BUSINESS_NOT_ACTIVE/);assert.equal(a.f.queries.length,before);assert.throws(()=>assertBusiness({...a.bundle}),/UNMINTED_SESSION/);assert.throws(()=>assertBusiness({sql:{query:()=>{}},state:'business'}),/UNMINTED_SESSION/);
 await a.bundle.commitSeed(seedInput());await a.bundle.observeSeed(readInput());await a.bundle.beginBusiness();const at=a.f.queries.length,proof=assertBusiness(a.bundle);assert.equal(proof.identity.role,runtime);assert.equal(proof.identity.sessionUser,runtime);assert.equal(proof.identity.database,'neondb');assert.equal(proof.target.role,owner);assert.equal(proof.businessRollbackOnly,true);assert.equal(proof.completeAuth,false);assert.equal(a.f.queries.length,at);
 await a.bundle.rollbackBusiness({onBeforeEnd:()=>{}});assert.throws(()=>assertBusiness(a.bundle),/BUSINESS_NOT_ACTIVE/);await a.bundle.close();assert.throws(()=>assertBusiness(a.bundle),/CLOSED/);
});

test('safe diagnostics distinguish the last capture/complete RPC and seed/observer index without SQL or values',async()=>{
 const a=await business();await a.bundle.sql.query(service,parameters);const completion='SELECT public.own_run_complete_full_v1($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result',original=Object.freeze(Object.assign(Error('UNIT_COMPLETION '+runtimeSecret),{code:'P0001'}));a.f.hook=({text})=>{if(text===completion)throw original;};
 await stopped(a.bundle,a.f,()=>a.bundle.sql.query(completion,[parameters[0],id,'{}','{}','a'.repeat(64)]),error=>{const safe=failureObservation(error).transaction;assert.equal(safe.serviceName,'own_run_complete_full_v1');assert.equal(safe.lastStatementSha256,hash(completion));assert.equal(safe.lastStatementRequested,true);assert.equal(safe.batchIndex,null);assert.equal(safe.endRequested,false);});assert.equal(JSON.stringify(a.bundle.observation()).includes(completion),false);assert.equal(JSON.stringify(a.bundle.observation()).includes(runtimeSecret),false);
 const b=await opened();b.f.hook=({text})=>{if(text===seed[0].text)throw Object.assign(Error('UNIT_SEED_ERROR'),{code:'23505'});};await stopped(b.bundle,b.f,()=>b.bundle.commitSeed(seedInput()),error=>{const safe=failureObservation(error).transaction;assert.equal(safe.batchIndex,0);assert.equal(safe.serviceName,null);assert.equal(safe.lastStatementSha256,hash(seed[0].text));});
 const c=await committed();c.f.hook=({text})=>{if(text===observed[0].text)throw Object.assign(Error('UNIT_OBSERVER_ERROR'),{code:'P0001'});};await stopped(c.bundle,c.f,()=>c.bundle.observeSeed(readInput()),error=>{const safe=failureObservation(error).transaction;assert.equal(safe.batchIndex,0);assert.equal(safe.serviceName,null);assert.equal(safe.lastStatementSha256,hash(observed[0].text));assert.equal(safe.seedCommitObserved,true);});
});
