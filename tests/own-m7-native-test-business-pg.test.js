// Recording constructors only. Ban network/children BEFORE importing transport
// dependencies. No SQL execution, native TLS, provider or business is proved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const forbidden=()=>{throw Error('M7_BUSINESS_UNIT_EXTERNAL_IO_FORBIDDEN');};
globalThis.fetch=forbidden;net.connect=net.createConnection=net.Socket.prototype.connect=forbidden;tls.connect=forbidden;
http.request=http.get=https.request=https.get=forbidden;
for(const key of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])child[key]=forbidden;
syncBuiltinESMExports();
const{createOwnM7NativeTestBusinessSession:createSession,ownM7NativeTestBusinessFailureObservation:failureObservation,OWN_M7_NATIVE_TEST_RPC_STATEMENTS:rpc,OWN_M7_NATIVE_TEST_POLICY_SQL:policySql}=await import('../scripts/lib/own-m7-native-test-business-pg.mjs');
const sha=value=>createHash('sha256').update(value).digest('hex'),secret='UNIT_SYNTHETIC_BUSINESS_PASSWORD';
const base={major:17,projectId:'noisy-poetry-54471701',branchId:'br-plain-dust-acpjgebb',endpointId:'ep-shiny-cherry-actlyudg',database:'neondb',role:'neondb_owner',guardOid:532699,host:'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech'};
const target={...base,kind:'test',parentBranchId:base.branchId,branchId:'br-business-unit-test',endpointId:'ep-business-unit-test',host:'ep-business-unit-test.sa-east-1.aws.neon.tech'};
const runtime='municontrol_actions_runtime_app',id='00000000-0000-4000-8000-000000000001';
const service='SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result',serviceValues=['{"actor":"unit"}','{"period":"2026-10","opaque":"public. $1 ; quote\u0027"}',id,'a'.repeat(64)];
function provider(){return{branch:{id:target.branchId,project_id:base.projectId,parent_id:base.branchId,primary:false,default:false},computes:[{id:target.endpointId,host:target.host,project_id:base.projectId,branch_id:target.branchId,type:'read_write',disabled:false,pooler_enabled:false}]};}
function metadata(value=provider()){const raw=Buffer.from(JSON.stringify(value));return{branchCreationRaw:raw,branchCreationSha256:sha(raw)};}
const packet=statements=>({expectedSha256:sha(JSON.stringify(statements))});
const seed=[{text:'INSERT INTO public.internal_users(email,display_name) VALUES($1::text,$2::text)',values:['unit@example.invalid','Actor sintético']}];
const observer=[{text:'SELECT count(*)::integer AS remaining FROM public.internal_users WHERE email=$1::text',values:['unit@example.invalid']}];
const policyValues=[id,'00000000-0000-4000-8000-000000000002','a'.repeat(40),'own-m7-unit-run-maker@example.invalid','own-m7-test-unit-run','own_m7_test_unit_run',700000001];
function fixture({postgresSsl=false,duplicate=false,mutateClient,identityChange}={}){
 const f={clients:[],queries:[],events:[],hook:null,alive:0,maxAlive:0};
 class Client{
  constructor(config){this.config=config;this.index=f.clients.length;this.connectionParameters={...config};this.ssl=config.ssl;this.handlers=new Map();this.role=config.user;this.isolation=null;this.readOnly=null;this.ended=false;f.clients.push(this);
   this.stream={encrypted:true,authorized:true,authorizationError:null,destroyed:false,writable:true,servername:config.host,getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({raw:Buffer.from('UNIT BUSINESS CERTIFICATE BYTES'),subjectaltname:'DNS:'+config.host})};
   this.connection={ssl:config.ssl,stream:this.stream};if(mutateClient)mutateClient(this);
  }
  on(name,fn){this.handlers.set(name,fn);return this;}
  async connect(){f.alive++;f.maxAlive=Math.max(f.maxAlive,f.alive);f.events.push(['connect',this.index]);}
  async end(){if(this.endError)throw this.endError;if(!this.ended){this.ended=true;f.alive--;f.events.push(['end',this.index]);}}
  async query(config){assert.equal(config.queryMode,'extended');assert.ok(Array.isArray(config.values));const{text,values}=config;f.queries.push({index:this.index,text,values});f.events.push(['query',this.index,text]);
   let result={command:'SELECT',rowCount:1,rows:[{result:{version:'unit-result',id}}]};
   if(text.startsWith('BEGIN ')){this.isolation=this.index?'repeatable read':'read committed';this.readOnly=this.index?'on':'off';result={command:'BEGIN',rowCount:null,rows:[]};}
   else if(text.startsWith('SET LOCAL ROLE ')){this.role=runtime;result={command:'SET',rowCount:null,rows:[]};}
   else if(text==='RESET ROLE'){this.role=base.role;result={command:'RESET',rowCount:null,rows:[]};}
   else if(text.startsWith('SET '))result={command:'SET',rowCount:null,rows:[]};
   else if(text==='ROLLBACK'||text==='COMMIT')result={command:text,rowCount:null,rows:[]};
   else if(text.startsWith('INSERT '))result={command:'INSERT',rowCount:1,rows:[]};
   else if(text===policySql)result={command:'UPDATE',rowCount:1,rows:[]};
   else if(text.startsWith('DO '))result={command:'DO',rowCount:null,rows:[]};
   else if(text===observer[0].text)result={command:'SELECT',rowCount:1,rows:[{remaining:0}]};
   if(text.includes(' AS "postgresSsl"')){
    const actual={major:base.major,projectId:base.projectId,branchId:target.branchId,endpointId:target.endpointId,database:'neondb',role:this.role,sessionUser:base.role,guardOid:String(base.guardOid),isolation:this.isolation,readOnly:this.readOnly,standardConformingStrings:'on',postgresSsl,native:{pid:duplicate?9000:9000+this.index,backendStart:'2026-10-28T10:00:00.000001+00:00',serverVersionNum:'170011'}};
    if(identityChange)identityChange(actual,this);result={command:'SELECT',rowCount:1,rows:[actual]};
   }
   if(f.hook){const changed=await f.hook({client:this,text,values,result});if(changed!==undefined)result=changed;}return result;
  }
 }
 f.Client=Client;f.options={major:17,Client,connectionValue:'postgresql://'+base.role+':'+secret+'@'+target.host+'/neondb?sslmode=verify-full',...metadata()};return f;
}
async function opened(options){const f=fixture(options),bundle=await createSession(f.options);return{f,bundle};}
async function running(options){const openedSession=await opened(options);await openedSession.bundle.beginFixture();return openedSession;}
async function inRuntime(options){const value=await running(options);await value.bundle.switchRoleRuntime();return value;}
async function stopped(bundle,f,operation,predicate){let original;try{await operation();}catch(error){original=error;}assert.ok(original);if(predicate)predicate(original);const before=f.queries.length,safe=failureObservation(original);assert.equal(safe.uncertain,true);assert.equal(safe.noFurtherSql,true);await assert.rejects(()=>bundle.sql.query(service,serviceValues),error=>error===original);assert.equal(f.queries.length,before);await bundle.close().catch(()=>{});return original;}

test('TEST workflow uses real identity fields, unchanged parameterized facades, literal rollback and a later independent RO observer',async()=>{
 const{f,bundle}=await opened();assert.equal(f.clients.length,1);assert.equal(f.queries.length,0);assert.equal(bundle.target.database,'neondb');assert.equal(bundle.target.parentBranchId,base.branchId);assert.equal(bundle.completeAuth,false);assert.equal(bundle.noeliaReady,false);
 const begin=await bundle.beginFixture();assert.equal(begin.identity.role,base.role);assert.equal(begin.identity.sessionUser,base.role);assert.equal(begin.identity.isolation,'read committed');assert.equal(begin.identity.readOnly,'off');
 const inserted=await bundle.seedOwner(seed,packet(seed));assert.equal(inserted[0].rowCount,1);const switched=await bundle.switchRoleRuntime();assert.equal(switched.role,runtime);assert.equal(switched.sessionUser,base.role);
 const result=await bundle.sql.query(service,serviceValues);assert.deepEqual(result,[{result:{version:'unit-result',id}}]);assert.deepEqual(f.queries.find(row=>row.text===service).values,serviceValues);
 await bundle.resetRoleOwner();await bundle.seedOwner(seed,packet(seed));await bundle.switchRoleRuntime();
 let beforeEnd;const rolled=await bundle.rollback({onBeforeEnd:snapshot=>{beforeEnd=snapshot;assert.equal(snapshot.end,'ROLLBACK');assert.equal(snapshot.readOnly,false);assert.equal(snapshot.role,runtime);assert.ok(Object.isFrozen(snapshot.rows));assert.ok(Object.isFrozen(snapshot.rows[1][0].result));assert.equal(f.queries.at(-1).text.includes('postgresSsl'),true);f.events.push(['persist','ROLLBACK']);}});
 assert.equal(rolled.rollbackObserved,true);assert.equal(rolled.commitObserved,false);assert.deepEqual(rolled.preEnd,beforeEnd);assert.equal(f.clients.length,1);
 const read=await bundle.observeRollback({statements:observer,...packet(observer),onBeforeEnd:snapshot=>{assert.equal(snapshot.slot,'observer');assert.equal(snapshot.readOnly,true);assert.deepEqual(snapshot.rows,[[{remaining:0}]]);f.events.push(['persist','COMMIT']);}});
 assert.equal(read.observerCommitObserved,true);assert.equal(f.clients.length,2);assert.equal(f.maxAlive,2);
 const observed=bundle.observation();assert.equal(observed.identities.command.native.pid,9000);assert.equal(observed.identities.observer.native.pid,9001);assert.ok(observed.tlsObservations.every(row=>row.postgresSsl===false&&row.clientTls.authorized));assert.equal(JSON.stringify(observed).includes(secret),false);
 for(const client of f.clients)assert.deepEqual(client.config.ssl,{rejectUnauthorized:true,servername:target.host,minVersion:'TLSv1.2'});
 for(const end of ['ROLLBACK','COMMIT'])assert.ok(f.events.findIndex(row=>row[0]==='persist'&&row[1]===end)<f.events.findIndex(row=>row[0]==='query'&&row[2]===end));
 assert.equal(f.queries.filter(row=>row.text==='COMMIT').length,1);assert.equal(f.queries.find(row=>row.text==='COMMIT').index,1);assert.equal(f.queries.filter(row=>row.text==='ROLLBACK').length,1);await bundle.close();assert.equal(f.alive,0);assert.equal(bundle.observation().ownedSessionsClosed,true);
});

test('all production destinations, foreign parent/project, pooled endpoint and changed raw metadata fail before constructor acquisition',async()=>{
 for(const change of [v=>{v.branch.id=base.branchId;v.computes[0].branch_id=base.branchId;},v=>{v.computes[0].id=base.endpointId;v.computes[0].host=base.host;},v=>{v.branch.parent_id='br-foreign';},v=>{v.branch.project_id='foreign';},v=>{v.computes[0].pooler_enabled=true;},v=>{v.branch.primary=true;},v=>{v.passed=true;}]){const f=fixture(),value=provider();change(value);await assert.rejects(()=>createSession({...f.options,...metadata(value)}));assert.equal(f.clients.length,0);}
 const f=fixture();await assert.rejects(()=>createSession({...f.options,branchCreationSha256:'0'.repeat(64)}),/RAW_CHANGED/);await assert.rejects(()=>createSession({...f.options,connectionValue:f.options.connectionValue.replace(target.host,base.host)}));assert.equal(f.clients.length,0);
});

test('strict TLS/certificate/effective constructor settings are checked before the first SQL',async()=>{
 for(const mutateClient of [c=>{c.stream.authorized=false;},c=>{c.stream.encrypted=false;},c=>{c.stream.getProtocol=()=> 'TLSv1.1';},c=>{c.stream.getPeerCertificate=()=>({raw:Buffer.from('unit'),subjectaltname:'DNS:foreign.invalid'});},c=>{c.connectionParameters={...c.connectionParameters,ssl:{...c.ssl,minVersion:'TLSv1'}};}]){const f=fixture({mutateClient});await assert.rejects(()=>createSession(f.options));assert.equal(f.queries.length,0);assert.equal(f.alive,0);}
});

test('real database, role, session_user, guard, isolation and backend SSL must be observed rather than mapped',async()=>{
 for(const change of [a=>{a.database='own_payroll_run_qa';},a=>{a.branchId=base.branchId;},a=>{a.role='postgres';},a=>{a.sessionUser=runtime;},a=>{a.guardOid=0;},a=>{a.readOnly='on';},a=>{a.isolation='repeatable read';},a=>{a.standardConformingStrings='off';},a=>{a.postgresSsl=null;},a=>{a.password=secret;}]){const{f,bundle}=await opened({identityChange:change});await stopped(bundle,f,()=>bundle.beginFixture());assert.equal(f.alive,0);}
 for(const postgresSsl of [true,false]){const{bundle}=await running({postgresSsl});assert.equal(bundle.observation().tlsObservations[0].postgresSsl,postgresSsl);await bundle.close();}
});

test('owner fixture batches are hash-pinned INSERT-only in finite tables and cannot perform transaction control or DDL',async()=>{
 const invalid=[{text:'INSERT INTO public.internal_users(email) VALUES($1); COMMIT',values:['unit']},{text:'INSERT INTO public.internal_users(email) VALUES($1) -- comment',values:['unit']},{text:'INSERT INTO public.grh_catalog_rows(id) VALUES($1::uuid)',values:[id]},{text:'CREATE TABLE public.unit(a int)',values:['unit']},{text:'INSERT INTO public.internal_users(email) VALUES($1) RETURNING public.own_run_complete_v1($1)',values:['unit']}];
 for(const statement of invalid){const{f,bundle}=await running(),before=f.queries.length;await stopped(bundle,f,()=>bundle.seedOwner([statement],packet([statement])),()=>assert.equal(f.queries.length,before));}
 const{f,bundle}=await running(),before=f.queries.length;await stopped(bundle,f,()=>bundle.seedOwner(seed,{expectedSha256:'0'.repeat(64)}),error=>{assert.match(error.message,/BATCH_CHANGED/);assert.equal(f.queries.length,before);});
});

test('owner seeding and business queries require the corresponding actually verified role',async()=>{
 const a=await running(),before=a.f.queries.length;await stopped(a.bundle,a.f,()=>a.bundle.sql.query(service,serviceValues),()=>assert.equal(a.f.queries.length,before));
 const b=await inRuntime(),at=b.f.queries.length;await stopped(b.bundle,b.f,()=>b.bundle.seedOwner(seed,packet(seed)),()=>assert.equal(b.f.queries.length,at));
 const c=await running();c.f.hook=({text,result})=>{if(text.includes(' AS "postgresSsl"'))result.rows[0].role=base.role;};await stopped(c.bundle,c.f,()=>c.bundle.switchRoleRuntime(),error=>assert.match(error.message,/CURRENT_ROLE_CHANGED/));
});

test('service binder admits only finite exact SELECT public facade texts and dense typed parameters',async()=>{
 const sparse=[...serviceValues];delete sparse[1];
 for(const[text,values]of [[service+'; COMMIT',serviceValues],[service.replace('public.',''),serviceValues],[service.replace('own_run_capture_v1','own_run_context_v1'),serviceValues],['toString',[]],[service,serviceValues.slice(1)],[service,sparse],[service,[{},...serviceValues.slice(1)]],[service,['[]',...serviceValues.slice(1)]],[service,[...serviceValues.slice(0,2),'bad-uuid',serviceValues[3]]]]){const{f,bundle}=await inRuntime(),before=f.queries.length;await stopped(bundle,f,()=>bundle.sql.query(text,values),()=>assert.equal(f.queries.length,before));}
 assert.ok(Object.isFrozen(rpc));assert.ok(Object.keys(rpc).length>40);
});

test('literal rollback is required before creating an observer and no command COMMIT option exists',async()=>{
 const a=await running(),before=a.f.queries.length;await stopped(a.bundle,a.f,()=>a.bundle.observeRollback({statements:observer,...packet(observer),onBeforeEnd:()=>{}}),()=>{assert.equal(a.f.queries.length,before);assert.equal(a.f.clients.length,1);});
 const b=await running(),at=b.f.queries.length;await stopped(b.bundle,b.f,()=>b.bundle.rollback({onBeforeEnd:()=>{},end:'COMMIT'}),()=>assert.equal(b.f.queries.length,at));assert.equal(Object.hasOwn(b.bundle,'commit'),false);
});

test('original frozen native errors stop all SQL, preserve safe diagnostics and close only owned sessions',async()=>{
 const{f,bundle}=await inRuntime(),original=Object.freeze(Object.assign(Error(secret),{code:'42601',detail:secret}));f.hook=({text})=>{if(text===service)throw original;};
 const caught=await stopped(bundle,f,()=>bundle.sql.query(service,serviceValues),error=>assert.strictEqual(error,original));const safe=failureObservation(caught);assert.equal(safe.transaction.endRequested,false);assert.equal(safe.transaction.sessionTerminated,true);assert.equal(safe.transaction.ownedSessionsClosed,true);assert.equal(JSON.stringify(safe).includes(secret),false);assert.equal(f.queries.some(row=>row.text==='ROLLBACK'||row.text==='COMMIT'),false);
});

test('pre-end persistence is mandatory, deep-frozen and failure prevents submitting rollback',async()=>{
 const{f,bundle}=await inRuntime();await bundle.sql.query(service,serviceValues);const original=Object.freeze(Error('UNIT_PERSIST_FAILURE')),before=f.queries.length;
 await stopped(bundle,f,()=>bundle.rollback({onBeforeEnd:snapshot=>{assert.throws(()=>{snapshot.rows[0][0].result.id='mutated';},TypeError);throw original;}}),error=>{assert.strictEqual(error,original);assert.equal(failureObservation(error).transaction.endRequested,false);assert.equal(f.queries.length,before);});
});

test('ROLLBACK transport loss stays uncertain and cannot start observer SQL or a new business attempt',async()=>{
 const{f,bundle}=await running(),original=Object.assign(Error('UNIT_SOCKET_LOSS'),{code:'ECONNRESET'});f.hook=({text})=>{if(text==='ROLLBACK')throw original;};
 await stopped(bundle,f,()=>bundle.rollback({onBeforeEnd:()=>{}}),error=>{assert.strictEqual(error,original);const safe=failureObservation(error).transaction;assert.equal(safe.endRequested,true);assert.equal(safe.endCommand,null);assert.equal(safe.rollbackObserved,false);});assert.equal(f.clients.length,1);
});

test('wrong end tag preserves the actual observation without claiming rollback; observed rollback plus TLS loss still stops',async()=>{
 const a=await running();a.f.hook=({text,result})=>text==='ROLLBACK'?{...result,command:'COMMIT'}:undefined;
 await stopped(a.bundle,a.f,()=>a.bundle.rollback({onBeforeEnd:()=>{}}),error=>{assert.equal(failureObservation(error).transaction.endCommand,'COMMIT');assert.equal(failureObservation(error).transaction.rollbackObserved,false);});
 const b=await running();b.f.hook=({client,text})=>{if(text==='ROLLBACK')client.stream.authorized=false;};await stopped(b.bundle,b.f,()=>b.bundle.rollback({onBeforeEnd:()=>{}}),error=>{const safe=failureObservation(error).transaction;assert.equal(safe.endCommand,'ROLLBACK');assert.equal(safe.rollbackObserved,true);assert.equal(safe.uncertain,true);});assert.equal(b.f.clients.length,1);
});

test('TLS is checked before and after every awaited query and after pre-end persistence',async()=>{
 const a=await inRuntime(),before=a.f.queries.length;a.f.clients[0].stream.authorized=false;await stopped(a.bundle,a.f,()=>a.bundle.sql.query(service,serviceValues),()=>assert.equal(a.f.queries.length,before));
 const b=await inRuntime();b.f.hook=({text,client})=>{if(text===service)client.stream.getPeerCertificate=()=>({raw:Buffer.from('CHANGED CERT'),subjectaltname:'DNS:'+target.host});};await stopped(b.bundle,b.f,()=>b.bundle.sql.query(service,serviceValues),error=>assert.match(error.message,/TLS_SESSION_CHANGED/));
 const c=await running(),at=c.f.queries.length;await stopped(c.bundle,c.f,()=>c.bundle.rollback({onBeforeEnd:()=>{c.f.clients[0].stream.authorized=false;}}),error=>{assert.equal(failureObservation(error).transaction.endRequested,false);assert.equal(c.f.queries.length,at);});
});

test('a concurrent operation fails closed before its SQL and the first awaited operation cannot continue',async()=>{
 const{f,bundle}=await inRuntime();let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 f.hook=async({text})=>{if(text===service){entered();await gate;}};const first=bundle.sql.query(service,serviceValues);await started;const before=f.queries.length;let concurrent;
 try{await bundle.resetRoleOwner();}catch(error){concurrent=error;}assert.ok(concurrent);assert.match(concurrent.message,/CONCURRENT/);release();await assert.rejects(()=>first,error=>error===concurrent);assert.equal(f.queries.length,before);await bundle.close();
});

test('idle socket error closes the owned client and prevents any subsequent SQL',async()=>{
 const{f,bundle}=await inRuntime(),original=Object.freeze(Error('UNIT_IDLE_LOSS')),before=f.queries.length;f.clients[0].handlers.get('error')(original);await stopped(bundle,f,()=>bundle.sql.query(service,serviceValues),error=>assert.strictEqual(error,original));assert.equal(f.queries.length,before);assert.equal(f.alive,0);
});

test('observer has distinct physical identity and must validate/persist its RO results before the only COMMIT',async()=>{
 const a=await running({duplicate:true});await a.bundle.rollback({onBeforeEnd:()=>{}});await stopped(a.bundle,a.f,()=>a.bundle.observeRollback({statements:observer,...packet(observer),onBeforeEnd:()=>{}}),error=>assert.match(error.message,/TWO_PHYSICAL_BACKENDS/));assert.equal(a.f.queries.some(row=>row.text===observer[0].text),false);
 const b=await running();await b.bundle.rollback({onBeforeEnd:()=>{}});const original=Object.freeze(Error('UNIT_OBSERVER_PROOF_FAILURE'));
 await stopped(b.bundle,b.f,()=>b.bundle.observeRollback({statements:observer,...packet(observer),onBeforeEnd:()=>{throw original;}}),error=>{assert.strictEqual(error,original);assert.equal(failureObservation(error).transaction.endRequested,false);});assert.equal(b.f.queries.some(row=>row.text==='COMMIT'),false);
});

test('observer statement errors stop without COMMIT and a close failure remains uncertain without retry',async()=>{
 const a=await running();await a.bundle.rollback({onBeforeEnd:()=>{}});a.f.hook=({text})=>{if(text===observer[0].text)throw Object.assign(Error('UNIT_OBSERVER_ERROR'),{code:'P0001'});};await stopped(a.bundle,a.f,()=>a.bundle.observeRollback({statements:observer,...packet(observer),onBeforeEnd:()=>{}}));assert.equal(a.f.queries.some(row=>row.text==='COMMIT'),false);
 const b=await running();b.f.clients[0].endError=Error('UNIT_END_ERROR');await assert.rejects(()=>b.bundle.close(),/OWNED_CONNECTION_CLOSE_FAILED/);const before=b.f.queries.length;await assert.rejects(()=>b.bundle.sql.query(service,serviceValues));assert.equal(b.f.queries.length,before);assert.equal(b.bundle.observation().ownedSessionsClosed,false);
});

test('only the exact new synthetic tenant policy setup is admitted, once, with one actual affected row',async()=>{
 const{f,bundle}=await running(),statements=[...seed,{text:policySql,values:policyValues}];const result=await bundle.seedOwner(statements,packet(statements));assert.deepEqual(result.map(row=>[row.command,row.rowCount]),[['INSERT',1],['UPDATE',1]]);
 assert.ok(policySql.includes('p.version=1')&&policySql.includes('p.certified_release_sha IS NULL')&&policySql.includes("t.tenant_kind='sandbox'"));
 for(const guard of ['p.updated_at=transaction_timestamp()','t.created_at=transaction_timestamp()','b.created_at=transaction_timestamp()'])assert.ok(policySql.includes(guard));
 const before=f.queries.length;await stopped(bundle,f,()=>bundle.seedOwner([{text:policySql,values:policyValues}],packet([{text:policySql,values:policyValues}])),error=>{assert.match(error.message,/POLICY_SINGLE_USE/);assert.equal(f.queries.length,before);});
 for(const rowCount of [0,2]){const next=await running();next.f.hook=({text,result})=>text===policySql?{...result,rowCount}:undefined;const single=[{text:policySql,values:policyValues}];await stopped(next.bundle,next.f,()=>next.bundle.seedOwner(single,packet(single)),error=>assert.match(error.message,/NEW_POLICY_EXACTLY_ONE_ROW/));assert.equal(next.f.queries.some(row=>row.text==='ROLLBACK'||row.text==='COMMIT'),false);}
});

test('policy UPDATE drift, inherited-scope names and malformed run coordinates are rejected before SQL',async()=>{
 const variants=[{text:policySql+' ',values:policyValues},{text:policySql.replace('p.version=1','p.version>0'),values:policyValues},{text:policySql.replace(' AND p.updated_at=transaction_timestamp()',''),values:policyValues},{text:'UPDATE public.tenant_identity_policy SET version=2 WHERE tenant_id=$1::uuid',values:[id]}];
 for(const patch of [v=>{v[0]=v[1];},v=>{v[2]='not-a-commit';},v=>{v[3]='person@example.invalid';},v=>{v[4]='municipio-real';},v=>{v[5]='another_database';},v=>{v[6]=101;},v=>{v[6]='700000001';},v=>{v[4]='own-m7-test-unit--run';},v=>{v.push('extra');}]){const values=[...policyValues];patch(values);variants.push({text:policySql,values});}
 for(const statement of variants){const{f,bundle}=await running(),before=f.queries.length;await stopped(bundle,f,()=>bundle.seedOwner([statement],packet([statement])),()=>assert.equal(f.queries.length,before));}
});

test('both frames apply finite LOCAL statement and lock timeouts before identity or fixture statements',async()=>{
 const{f,bundle}=await running();assert.deepEqual(f.queries.slice(0,4).map(row=>row.text),['BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE',"SET LOCAL statement_timeout='45s'","SET LOCAL lock_timeout='5s'","SET LOCAL timezone='UTC'"]);
 await bundle.rollback({onBeforeEnd:()=>{}});await bundle.observeRollback({statements:observer,...packet(observer),onBeforeEnd:()=>{}});
 assert.deepEqual(f.queries.filter(row=>row.index===1).slice(0,4).map(row=>row.text),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',"SET LOCAL statement_timeout='45s'","SET LOCAL lock_timeout='5s'","SET LOCAL timezone='UTC'"]);await bundle.close();
});

test('map covers the SQL actually emitted by native employee create and receipt preview services',async()=>{
 const{employeeOperation}=await import('../lib/internal-native-employees.js');const{ownReceiptOperation}=await import('../lib/internal-own-payroll-receipts.js');
 const native=await import('./fixtures/native-employee-synthetic.js');const{emptyOwnReceiptParams}=await import('../assets/own-payroll-receipt-model.js');
 const emissions=[],sentinel=Error('UNIT_RECORD_EMISSION_ONLY'),sql={query:async(text,values)=>{emissions.push({text,values});throw sentinel;}};
 await assert.rejects(()=>employeeOperation(sql,native.principal,native.session,'create',{key:native.ID,body:{draft:native.draft(),catalogVersion:native.catalog.version}}));
 const params={...emptyOwnReceiptParams('2026-10'),issuer:{name:'Emisor exclusivamente sintético',taxId:'30990000006',address:'Domicilio exclusivamente sintético'}};
 await assert.rejects(()=>ownReceiptOperation(sql,native.principal,native.session,'preview',{params}));assert.equal(emissions.length,2);
 assert.equal(emissions[0].text,'SELECT public.native_employee_create_v1($1::jsonb,$2::jsonb,$3::text,$4::uuid) AS result');assert.equal(emissions[1].text,'SELECT public.own_receipt_preview_v1($1::jsonb,$2::jsonb) AS result');
 const{f,bundle}=await inRuntime();for(const emission of emissions){assert.ok(Object.hasOwn(rpc,emission.text));await bundle.sql.query(emission.text,emission.values);assert.deepEqual(f.queries.at(-1).values,emission.values);}await bundle.close();
 // Static SQL literals from every admitted existing service are covered too;
 // dynamic completion names are listed explicitly in the transport's map.
 for(const file of ['internal-native-employees','internal-employment-catalog','internal-native-salary','internal-own-payroll-program','internal-own-payroll-run','internal-own-payroll-liquidation','internal-own-payroll-annulment','internal-own-payroll-annulment-preparation','internal-own-payroll-close','internal-own-payroll-receipts']){
  const source=fs.readFileSync(new URL('../lib/'+file+'.js',import.meta.url),'utf8');
  for(const match of source.matchAll(/SELECT public\.[a-z0-9_]+\(\$[0-9]+::[a-z0-9]+(?:,\$[0-9]+::[a-z0-9]+)*\) AS result/g))assert.ok(Object.hasOwn(rpc,match[0]),file+':'+match[0]);
 }
});

test('observation preserves the original redacted pg failure when a real service replaces it with a domain Error',async()=>{
 const{ownRunOperation}=await import('../lib/internal-own-payroll-run.js'),native=await import('./fixtures/native-employee-synthetic.js');const{f,bundle}=await inRuntime();
 const message='UNIT_NATIVE_PRIVATE '+secret,original=Object.freeze(Object.assign(Error(message),{name:'DatabaseError',code:'P0001',detail:secret}));
 f.hook=({text})=>{if(text==='SELECT public.own_run_bootstrap_v1($1::jsonb) AS result')throw original;};
 await assert.rejects(()=>ownRunOperation(bundle.sql,native.principal,native.session,'bootstrap'),error=>{assert.notStrictEqual(error,original);assert.equal(error.code,'OWN_RUN_UNAVAILABLE');return true;});
 const before=f.queries.length,safe=bundle.observation();assert.equal(safe.uncertain,true);assert.equal(safe.noFurtherSql,true);assert.equal(safe.failure.error.code,'P0001');assert.equal(safe.failure.error.type,'DatabaseError');assert.equal(safe.failure.error.fields.message.sha256,sha(message));assert.equal(safe.failure.transaction.phase,'service-query');assert.equal(safe.failure.transaction.endRequested,false);assert.equal(safe.failure.transaction.ownedSessionsClosed,true);assert.equal(JSON.stringify(safe).includes(secret),false);
 assert.equal(f.queries.length,before);await assert.rejects(()=>bundle.rollback({onBeforeEnd:()=>{}}),error=>error===original);assert.equal(f.queries.length,before);await bundle.close();
});
