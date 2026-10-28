// Constructor/recording tests only. No provider, TLS handshake, SQL execution,
// installation, rollback, durable commit or municipal operation is proved here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OWN_RELEASE_TARGETS} from '../scripts/lib/own-payroll-release-target.mjs';
import {createOwnReleaseAnnulmentAtomicSessions as production,createOwnReleaseAnnulmentAtomicTestSessions as testing,prepareOwnReleaseAnnulmentAtomicTestTarget as prepareTest,ownReleaseAnnulmentAtomicFailureObservation as failureObservation,OWN_RELEASE_ANNULMENT_ATOMIC_SLOTS as slots} from '../scripts/lib/own-payroll-release-annulment-atomic-pg.mjs';
const base=OWN_RELEASE_TARGETS.find(target=>target.major===17),sha=value=>createHash('sha256').update(value).digest('hex');
const secret='SYNTHETIC_ATOMIC_PASSWORD_ONLY';
const connection=target=>'postgresql://'+target.role+':'+secret+'@'+target.host+'/'+target.database+'?sslmode=verify-full';
function branchEvidence(){return{version:'unit-provider-shaped-test-observation',branch:{id:'br-synthetic-atomic-test',project_id:base.projectId,parent_id:base.branchId,primary:false,default:false},computes:[{id:'ep-synthetic-atomic-test',host:'ep-synthetic-atomic-test.sa-east-1.aws.neon.tech',project_id:base.projectId,branch_id:'br-synthetic-atomic-test',type:'read_write',disabled:false,pooler_enabled:false}]};}
function admission(value=branchEvidence()){const raw=Buffer.from(JSON.stringify(value));return prepareTest({major:17,branchCreationRaw:raw,branchCreationSha256:sha(raw)});}
function fixture(target=base,{duplicate=false,postgresSsl=false,mutateClient}={}){
 const f={clients:[],queries:[],events:[],ready:false,queryHook:null,alive:0,maxAlive:0};
 class Client{
  constructor(config){this.config=config;this.connectionParameters={...config};this.ssl=config.ssl;this.index=f.clients.length;this.handlers=new Map();this.ended=false;f.clients.push(this);
   this.stream={encrypted:true,authorized:true,authorizationError:null,destroyed:false,writable:true,servername:config.host,getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({raw:Buffer.from('UNIT ATOMIC CERTIFICATE BYTES'),subjectaltname:'DNS:'+config.host})};
   this.connection={ssl:config.ssl,stream:this.stream};if(mutateClient)mutateClient(this);
  }
  on(name,handler){this.handlers.set(name,handler);return this;}
  async connect(){f.alive++;f.maxAlive=Math.max(f.maxAlive,f.alive);f.events.push(['connect',this.index]);}
  async end(){if(this.endError)throw this.endError;if(!this.ended){this.ended=true;f.alive--;f.events.push(['end',this.index]);}}
  async query(text){
   f.queries.push({client:this.index,text});f.events.push(['query',this.index,text]);
   let result={command:text.startsWith('BEGIN ')?'BEGIN':text==='COMMIT'?'COMMIT':text==='ROLLBACK'?'ROLLBACK':text.startsWith('SET ')?'SET':'SELECT',rows:text==='unit proof'?[{proof:{unit:true}}]:[]};
   if(text.includes(' AS "postgresSsl"'))result={command:'SELECT',rows:[{major:target.major,projectId:target.projectId,branchId:target.branchId,endpointId:target.endpointId,database:target.database,role:target.role,guardOid:String(target.guardOid),isolation:'repeatable read',readOnly:'on',standardConformingStrings:'on',postgresSsl,native:{pid:duplicate?5000:5000+this.index,backendStart:'2026-10-28T10:00:00.000001+00:00',serverVersionNum:String(target.major*10000+11)}}]};
   if(f.queryHook){const changed=await f.queryHook({client:this,text,result});if(changed!==undefined)result=changed;}
   return result;
  }
 }
 f.Client=Client;f.connectionValue=connection(target);return f;
}
async function opened(options){const f=fixture(base,options),bundle=await production({major:17,Client:f.Client,connectionValue:f.connectionValue});f.ready=true;return{f,bundle};}
const optionsFor=slot=>({readOnly:!['rehearsal','installation'].includes(slot),end:slot==='rehearsal'?'ROLLBACK':'COMMIT',onBeforeEnd:()=>{}});
async function rejectsThenStops(bundle,f,slot,statements,options,check){let caught;try{await bundle.transactionObserved(slot,statements,options);}catch(error){caught=error;}assert.ok(caught);if(check)check(caught);const context=structuredClone(failureObservation(caught).transaction),before=f.queries.length;await assert.rejects(()=>bundle.transactionObserved('durable',['unit forbidden after error'],optionsFor('durable')),error=>error===caught);assert.equal(f.queries.length,before);assert.deepEqual(failureObservation(caught).transaction,context,'later attempted calls cannot overwrite the original end observation');await bundle.close();return caught;}

test('production transport retains five real-recording identities, strict client TLS and the actual false backend observation',async()=>{
 const {f,bundle}=await opened();assert.equal(bundle.version,'own-release-annulment-atomic-pg.v1');assert.equal(bundle.target.kind,'production');assert.equal(f.maxAlive,5);assert.equal(f.alive,5);
 assert.deepEqual(Object.keys(bundle.identities),slots);assert.equal(new Set(Object.values(bundle.identities).map(value=>value.pid+':'+value.backendStart)).size,5);
 assert.equal(Object.hasOwn(bundle,'transaction'),false);assert.equal(typeof bundle.transactionObserved,'function');
 for(const client of f.clients){assert.equal(Object.hasOwn(client.config,'connectionString'),false);assert.deepEqual(client.config.ssl,{rejectUnauthorized:true,servername:base.host,minVersion:'TLSv1.2'});assert.equal(client.config.keepAlive,true);}
 for(const row of bundle.tlsObservations){assert.equal(row.postgresSsl,false);assert.equal(row.clientTls.authorized,true);assert.equal(row.clientTls.peerCertificateSha256,sha('UNIT ATOMIC CERTIFICATE BYTES'));}
 assert.equal(JSON.stringify(bundle).includes(secret),false);assert.equal(bundle.credentialsExposed,false);await bundle.close();assert.equal(f.alive,0);
});

test('all atomic slots have a closed RO/end profile; end callback precedes the literal requested end',async()=>{
 const {f,bundle}=await opened();
 for(const slot of slots){const options=optionsFor(slot);options.onBeforeEnd=intent=>{assert.deepEqual(Object.keys(intent).sort(),['slot','end','rows','statementCommands','native','readOnly','beginCommand'].sort());assert.equal(intent.slot,slot);assert.equal(intent.end,options.end);assert.equal(intent.readOnly,options.readOnly);assert.equal(intent.beginCommand,'BEGIN');assert.deepEqual(intent.native,bundle.identities[slot]);assert.deepEqual(intent.rows,[[{proof:{unit:true}}]]);assert.deepEqual(intent.statementCommands,['SELECT']);assert.ok(Object.isFrozen(intent));assert.ok(Object.isFrozen(intent.rows[0][0].proof));f.events.push(['persist-end',slot,options.end]);};
  const before=f.queries.length,result=await bundle.transactionObserved(slot,['unit proof'],options);
  assert.equal(result.beginCommand,'BEGIN');assert.equal(result.endRequested,true);assert.equal(result.endCommand,options.end);assert.equal(result.commitObserved,options.end==='COMMIT');assert.equal(result.rollbackObserved,options.end==='ROLLBACK');assert.deepEqual(result.rows,[[{proof:{unit:true}}]]);
  const queries=f.queries.slice(before);assert.equal(queries[0].text,'BEGIN ISOLATION LEVEL REPEATABLE READ '+(options.readOnly?'READ ONLY':'READ WRITE'));assert.equal(queries.at(-1).text,options.end);
  const persisted=f.events.findLastIndex(event=>event[0]==='persist-end'&&event[1]===slot),sent=f.events.findLastIndex(event=>event[0]==='query'&&event[1]===slots.indexOf(slot)&&event[2]===options.end);assert.ok(persisted<sent);
 }
 await bundle.close();assert.equal(f.alive,0);
});

test('wrong slot, mode, end or missing persistence callback fails before SQL and stops the whole bundle',async()=>{
 const invalid=[['repetition',optionsFor('durable')],['epoch',{...optionsFor('epoch'),readOnly:false}],['rehearsal',{...optionsFor('rehearsal'),end:'COMMIT'}],['installation',{...optionsFor('installation'),end:'ROLLBACK'}],['durable',{...optionsFor('durable'),end:'ROLLBACK'}],['installation',{...optionsFor('installation'),onBeforeEnd:null}]];
 for(const [slot,options]of invalid){const {f,bundle}=await opened(),before=f.queries.length;await rejectsThenStops(bundle,f,slot,['unit forbidden'],options,error=>{assert.equal(f.queries.length,before);assert.equal(failureObservation(error).transaction.endRequested,false);});}
});

test('each RW slot is single use even after an observed end; RO remains a separate profile',async()=>{
 for(const slot of ['rehearsal','installation']){const {f,bundle}=await opened();await bundle.transactionObserved(slot,['unit first'],optionsFor(slot));const before=f.queries.length;await rejectsThenStops(bundle,f,slot,['unit repeated'],optionsFor(slot),error=>{assert.match(error.message,/RW_SLOT_SINGLE_USE/);assert.equal(f.queries.length,before);});}
});

test('wrong BEGIN tag stops before payload and callback; the observed tag is recorded without an end request',async()=>{
 const {f,bundle}=await opened();let callbacks=0;f.queryHook=({text,result})=>text.startsWith('BEGIN ')?{...result,command:'ROLLBACK'}:undefined;
 const before=f.queries.length;await rejectsThenStops(bundle,f,'installation',['unit forbidden'],{...optionsFor('installation'),onBeforeEnd:()=>{callbacks++;}},error=>{const observed=failureObservation(error);assert.equal(observed.uncertain,true);assert.equal(observed.transaction.beginCommand,'ROLLBACK');assert.equal(observed.transaction.endRequested,false);assert.equal(observed.transaction.sessionTerminated,true);assert.equal(callbacks,0);assert.equal(f.queries.length,before+1);});
});

test('callback persistence failure keeps the original frozen exception and never submits the end',async()=>{
 const {f,bundle}=await opened(),original=Object.freeze(Error('UNIT_PERSISTENCE_FAILURE')),before=f.queries.length;
 await rejectsThenStops(bundle,f,'installation',['unit proof'],{...optionsFor('installation'),onBeforeEnd:()=>{throw original;}},error=>{assert.strictEqual(error,original);const observed=failureObservation(error);assert.equal(observed.transaction.endRequested,false);assert.equal(observed.transaction.commitObserved,false);assert.equal(observed.transaction.sessionTerminated,true);assert.deepEqual(f.queries.slice(before).map(row=>row.text),['BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE','unit proof']);});
});

test('pre-end proof snapshot is deep-frozen, detached from driver objects and identical to the successful return',async()=>{
 const {f,bundle}=await opened();let rawProof,seen;
 f.queryHook=({text,result})=>{if(text==='unit proof'){rawProof=result.rows[0].proof;result.rows[0].proof.nested={values:[1,2]};}};
 const result=await bundle.transactionObserved('installation',['unit proof'],{...optionsFor('installation'),onBeforeEnd:snapshot=>{
  seen=snapshot;assert.deepEqual(snapshot.rows,[[{proof:{unit:true,nested:{values:[1,2]}}}]]);
  for(const change of [()=>{snapshot.rows[0][0].proof.unit=false;},()=>{snapshot.rows[0][0].proof.nested.values.push(3);},()=>{snapshot.statementCommands.push('COMMIT');},()=>{snapshot.native.pid=1;},()=>{snapshot.end='ROLLBACK';}])assert.throws(change,TypeError);
  rawProof.unit=false;assert.equal(snapshot.rows[0][0].proof.unit,true);
 }});
 assert.strictEqual(result.rows,seen.rows);assert.strictEqual(result.statementCommands,seen.statementCommands);assert.strictEqual(result.native,seen.native);assert.ok(Object.isFrozen(result));await bundle.close();
});

test('proof validation failure in the pre-end callback prevents COMMIT and persists the original callback error context',async()=>{
 const {f,bundle}=await opened(),before=f.queries.length;
 f.queryHook=({text,result})=>{if(text==='unit proof')result.rows[0].proof.unit=false;};
 await rejectsThenStops(bundle,f,'installation',['unit proof'],{...optionsFor('installation'),onBeforeEnd:snapshot=>{assert.equal(snapshot.rows.at(-1)[0].proof.unit,true,'UNIT_PROOF_MISMATCH');}},error=>{
  assert.match(error.message,/UNIT_PROOF_MISMATCH/);assert.equal(failureObservation(error).transaction.endRequested,false);assert.deepEqual(f.queries.slice(before).map(row=>row.text),['BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE','unit proof']);
 });
});

test('non-JSON proof objects, cycles and getters fail before the callback/end without invoking getters',async()=>{
 for(const value of [new Date('2026-10-28T00:00:00Z'),Buffer.from('unit'),undefined,NaN]){
  const {f,bundle}=await opened();let callbacks=0;f.queryHook=({text,result})=>{if(text==='unit proof')result.rows[0].proof.value=value;};
  await rejectsThenStops(bundle,f,'installation',['unit proof'],{...optionsFor('installation'),onBeforeEnd:()=>{callbacks++;}},error=>{assert.equal(callbacks,0);assert.equal(failureObservation(error).transaction.endRequested,false);});
 }
 const cycle=await opened();cycle.f.queryHook=({text,result})=>{if(text==='unit proof')result.rows[0].proof.self=result.rows[0].proof;};await rejectsThenStops(cycle.bundle,cycle.f,'installation',['unit proof'],optionsFor('installation'),error=>assert.match(error.message,/PROOF_CYCLE/));
 const getter=await opened();let getterCalls=0;getter.f.queryHook=({text,result})=>{if(text==='unit proof')Object.defineProperty(result.rows[0].proof,'secret',{enumerable:true,get(){getterCalls++;return secret;}});};
 await rejectsThenStops(getter.bundle,getter.f,'installation',['unit proof'],optionsFor('installation'),error=>{assert.match(error.message,/PROOF_DATA_PROPERTY/);assert.equal(getterCalls,0);});
});

test('native statement error is preserved; no automatic ROLLBACK, later statement or other slot SQL follows',async()=>{
 const {f,bundle}=await opened(),original=Object.assign(Error('UNIT_NATIVE_ERROR'),{code:'42601'}),before=f.queries.length;
 f.queryHook=({text})=>{if(text==='unit native failure')throw original;};
 await rejectsThenStops(bundle,f,'installation',['unit native failure','unit forbidden'],optionsFor('installation'),error=>{assert.strictEqual(error,original);const observed=failureObservation(error);assert.equal(observed.transaction.endRequested,false);assert.equal(observed.transaction.sessionTerminated,true);assert.equal(observed.uncertain,true);assert.deepEqual(f.queries.slice(before).map(row=>row.text),['BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE','unit native failure']);});
});

test('COMMIT transport loss records endRequested true and preserves uncertainty without durable SQL',async()=>{
 const {f,bundle}=await opened(),original=Object.assign(Error('UNIT_COMMIT_SOCKET_LOSS'),{code:'ECONNRESET'});
 f.queryHook=({text})=>{if(text==='COMMIT')throw original;};
 await rejectsThenStops(bundle,f,'installation',['unit proof'],optionsFor('installation'),error=>{assert.strictEqual(error,original);const observed=failureObservation(error);assert.equal(observed.transaction.endRequested,true);assert.equal(observed.transaction.endCommand,null);assert.equal(observed.transaction.commitObserved,false);assert.equal(observed.uncertain,true);});
});

test('COMMIT responded ROLLBACK records the actual end and never claims a commit or definitive classification',async()=>{
 const {f,bundle}=await opened();f.queryHook=({text,result})=>text==='COMMIT'?{...result,command:'ROLLBACK'}:undefined;
 await rejectsThenStops(bundle,f,'installation',['unit proof'],optionsFor('installation'),error=>{const observed=failureObservation(error);assert.equal(observed.transaction.requestedEnd,'COMMIT');assert.equal(observed.transaction.endRequested,true);assert.equal(observed.transaction.endCommand,'ROLLBACK');assert.equal(observed.transaction.commitObserved,false);assert.equal(observed.uncertain,true);assert.equal(JSON.stringify(observed).includes('NOT_COMMITTED'),false);});
});

test('observed COMMIT followed by TLS failure remains uncertain while retaining the real COMMIT response tag',async()=>{
 const {f,bundle}=await opened();f.queryHook=({client,text})=>{if(text==='COMMIT')client.stream.authorized=false;};
 await rejectsThenStops(bundle,f,'installation',['unit proof'],optionsFor('installation'),error=>{const observed=failureObservation(error);assert.equal(observed.transaction.endRequested,true);assert.equal(observed.transaction.endCommand,'COMMIT');assert.equal(observed.transaction.commitObserved,true);assert.equal(observed.uncertain,true);});
});

test('TLS loss or changed certificate before a transaction blocks BEGIN and closes only its owned session',async()=>{
 for(const change of [client=>{client.stream.authorized=false;},client=>{client.stream.getPeerCertificate=()=>({raw:Buffer.from('changed unit certificate'),subjectaltname:'DNS:'+base.host});}]){
  const {f,bundle}=await opened(),before=f.queries.length;change(f.clients[3]);await rejectsThenStops(bundle,f,'installation',['unit forbidden'],optionsFor('installation'),error=>{assert.equal(f.queries.length,before);assert.equal(f.alive,4);assert.equal(failureObservation(error).transaction.endRequested,false);});
 }
});

test('TLS is checked between awaited statements and after the end-persistence callback',async()=>{
 const {f,bundle}=await opened(),before=f.queries.length;f.queryHook=({client,text})=>{if(text==='unit first')client.stream.authorized=false;};
 await rejectsThenStops(bundle,f,'installation',['unit first','unit forbidden'],optionsFor('installation'),()=>{assert.deepEqual(f.queries.slice(before).map(row=>row.text),['BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE','unit first']);});
 const second=await opened(),at=second.f.queries.length;
 await rejectsThenStops(second.bundle,second.f,'installation',['unit proof'],{...optionsFor('installation'),onBeforeEnd:()=>{second.f.clients[3].stream.authorized=false;}},error=>{assert.equal(failureObservation(error).transaction.endRequested,false);assert.equal(second.f.queries.length,at+2);});
});

test('idle socket errors stop every slot without issuing another SQL',async()=>{
 const {f,bundle}=await opened(),original=Object.assign(Error('UNIT_IDLE_SOCKET_LOSS'),{code:'ECONNRESET'}),before=f.queries.length;f.clients[2].handlers.get('error')(original);
 await rejectsThenStops(bundle,f,'installation',['unit forbidden'],optionsFor('installation'),error=>{assert.strictEqual(error,original);assert.equal(f.queries.length,before);});
});

test('factory refuses invalid TLS/certificate/configuration before the first SQL',async()=>{
 for(const mutateClient of [c=>{c.stream.encrypted=false;},c=>{c.stream.authorized=false;},c=>{c.stream.getProtocol=()=> 'TLSv1.1';},c=>{c.stream.getPeerCertificate=()=>({raw:Buffer.from('unit certificate'),subjectaltname:'DNS:foreign.invalid'});},c=>{c.connectionParameters={...c.connectionParameters,ssl:{...c.ssl,rejectUnauthorized:false}};}]){
  const f=fixture(base,{mutateClient});await assert.rejects(()=>production({major:17,Client:f.Client,connectionValue:f.connectionValue}));assert.equal(f.queries.length,0);assert.equal(f.alive,0);
 }
});

test('true/false backend flags are preserved, while non-booleans and duplicate physical identities fail factory admission',async()=>{
 for(const postgresSsl of [true,false]){const {f,bundle}=await opened({postgresSsl});assert.ok(bundle.tlsObservations.every(row=>row.postgresSsl===postgresSsl));await bundle.close();assert.equal(f.alive,0);}
 for(const options of [{postgresSsl:null},{postgresSsl:'false'},{duplicate:true}]){const f=fixture(base,options);await assert.rejects(()=>production({major:17,Client:f.Client,connectionValue:f.connectionValue}));assert.equal(f.alive,0);}
});

test('real identity and guard must equal the selected target; mapping a test branch to production never passes',async()=>{
 for(const change of [r=>{r.rows[0].branchId='br-foreign';},r=>{r.rows[0].endpointId='ep-foreign';},r=>{r.rows[0].guardOid=0;},r=>{r.rows[0].role='foreign_role';},r=>{r.rows[0].standardConformingStrings='off';}]){const f=fixture();f.queryHook=({text,result})=>{if(text.includes(' AS "postgresSsl"'))change(result);};await assert.rejects(()=>production({major:17,Client:f.Client,connectionValue:f.connectionValue}));assert.equal(f.alive,0);}
 const a=admission(),f=fixture(a.target);f.queryHook=({text,result})=>{if(text.includes(' AS "postgresSsl"'))result.rows[0].branchId=base.branchId;};await assert.rejects(()=>testing({testTargetAdmission:a,Client:f.Client,connectionValue:f.connectionValue}));assert.equal(f.alive,0);
});

test('test conversion uses pinned provider bytes, real parent and direct compute; test bundles carry a distinct version and kind',async()=>{
 const a=admission(),f=fixture(a.target),bundle=await testing({testTargetAdmission:a,Client:f.Client,connectionValue:f.connectionValue});assert.equal(bundle.version,'own-release-annulment-atomic-pg.v1+test');assert.equal(bundle.target.kind,'test');assert.equal(bundle.target.parentBranchId,base.branchId);assert.equal(a.target.parentBranchId,a.parentBranchId);assert.equal(Object.hasOwn(base,'parentBranchId'),false);assert.notEqual(bundle.target.branchId,base.branchId);assert.equal(bundle.target.branchId,'br-synthetic-atomic-test');assert.equal(bundle.identities.epoch.pid,5000);await bundle.close();assert.equal(f.alive,0);
 for(const change of [v=>{v.passed=true;},v=>{v.branch.parent_id='br-foreign';},v=>{v.branch.project_id='foreign';},v=>{v.branch.id=base.branchId;v.computes[0].branch_id=base.branchId;},v=>{v.computes[0].id=base.endpointId;v.computes[0].host=base.host;},v=>{v.computes[0].branch_id='br-foreign';},v=>{v.computes[0].pooler_enabled=true;},v=>{v.branch.primary=true;}]){const value=branchEvidence();change(value);assert.throws(()=>admission(value));}
 const raw=Buffer.from(JSON.stringify(branchEvidence()));assert.throws(()=>prepareTest({major:17,branchCreationRaw:raw,branchCreationSha256:'0'.repeat(64)}),/RAW_CHANGED/);
});

test('production and test factories reject each other targets and cloned/unminted admissions before Client acquisition',async()=>{
 const a=admission(),f=fixture(a.target);await assert.rejects(()=>production({major:17,Client:f.Client,connectionValue:f.connectionValue}));assert.equal(f.clients.length,0);
 await assert.rejects(()=>production({major:17,Client:f.Client,connectionValue:connection(base),testTargetAdmission:a}));assert.equal(f.clients.length,0);
 for(const testTargetAdmission of [{...a},{passed:true,target:base},{...a,target:{...base,kind:'test'}}])await assert.rejects(()=>testing({testTargetAdmission,Client:f.Client,connectionValue:f.connectionValue}));assert.equal(f.clients.length,0);
 await assert.rejects(()=>testing({testTargetAdmission:a,Client:f.Client,connectionValue:connection(base)}));assert.equal(f.clients.length,0);
});

test('payload transaction controls, sparse arrays and named properties cannot bypass the owned end',async()=>{
 const sparse=new Array(1),named=['unit proof'];named.extra=true;
 for(const statements of [['COMMIT'],['unit first;ROLLBACK'],['-- comment\nCOMMIT'],['/* outer /* inner */ done */ ROLLBACK'],sparse,named]){const {f,bundle}=await opened(),before=f.queries.length;await rejectsThenStops(bundle,f,'installation',statements,optionsFor('installation'),()=>assert.equal(f.queries.length,before));}
 const {bundle}=await opened();await bundle.transactionObserved('rehearsal',["DO $x$ BEGIN PERFORM 'COMMIT';END $x$"],optionsFor('rehearsal'));await bundle.close();
});

test('local lexer rejects comment-separated transaction keywords and end commands hidden between escaped E-strings',async()=>{
 const payloads=[
  'PREPARE/*comment*/TRANSACTION \'unit\'',
  'START/*outer /*nested*/ done*/TRANSACTION',
  'RELEASE/*comment*/SAVEPOINT unit',
  '-- prefix\n/* outer /* nested */ done */ COMMIT',
  String.raw`SELECT E'\''; COMMIT; SELECT E'\'';`,
  String.raw`SELECT e'\''; ROLLBACK; SELECT e'\'';`,
  String.raw`SELECT E'\''; PREPARE/*gap*/TRANSACTION 'unit'; SELECT E'\'';`,
  'SELECT (1;COMMIT)',
  'SELECT (1',
  'DO $body$ BEGIN PERFORM 1;END',
  "SELECT E'unclosed\\'",
  String.raw`SELECT '\''; COMMIT; SELECT '\'';`
 ];
 for(const payload of payloads){const {f,bundle}=await opened(),before=f.queries.length;await rejectsThenStops(bundle,f,'installation',[payload],optionsFor('installation'),()=>assert.equal(f.queries.length,before));}
});

test('lexer keeps strings/dollar bodies opaque and accepts balanced expressions and harmless multiple commands',async()=>{
 for(const payload of [
  String.raw`SELECT E'\''; SELECT E'\'';`,
  String.raw`SELECT E'a; COMMIT; b\\c';`,
  "SELECT 'a; COMMIT; b''c'",
  '/* outer /* nested */ end */ SELECT (1+(2*3)); -- trailing',
  'DO $body$ BEGIN PERFORM \'COMMIT;\';END $body$; SELECT (1)',
  'SELECT "a""b"; SELECT 2',
  'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'
 ]){const {bundle}=await opened();const result=await bundle.transactionObserved('rehearsal',[payload],optionsFor('rehearsal'));assert.equal(result.endCommand,'ROLLBACK');await bundle.close();}
});

test('payload cannot change the transaction read-only profile or ambient string-escape rules',async()=>{
 const payloads=['SET/*gap*/TRANSACTION/*gap*/READ/*gap*/WRITE','SET LOCAL transaction_read_only=off','SET LOCAL "transaction_read_only" TO off','SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE','RESET ALL','RESET standard_conforming_strings','SET standard_conforming_strings=off','SET TRANSACTION READ ONLY'];
 for(const payload of payloads){const {f,bundle}=await opened(),before=f.queries.length;await rejectsThenStops(bundle,f,'installation',[payload],optionsFor('installation'),()=>assert.equal(f.queries.length,before));}
 const {bundle}=await opened();await bundle.transactionObserved('epoch',['SET TRANSACTION READ ONLY'],optionsFor('epoch'));await bundle.close();
});

test('the protocol prefix may reaffirm only the closed LOCAL standard_conforming_strings ON literal',async()=>{
 for(const payload of ['SET LOCAL standard_conforming_strings=on','set local standard_conforming_strings = ON;']){
  const {bundle}=await opened();const result=await bundle.transactionObserved('rehearsal',[payload],optionsFor('rehearsal'));assert.equal(result.endCommand,'ROLLBACK');await bundle.close();
 }
 for(const payload of ['SET LOCAL standard_conforming_strings=off','SET LOCAL standard_conforming_strings=true','SET LOCAL standard_conforming_strings=1',"SET LOCAL standard_conforming_strings='on'",'SET LOCAL standard_conforming_strings="on"','SET SESSION standard_conforming_strings=on','SET standard_conforming_strings=on','RESET standard_conforming_strings','SET LOCAL "standard_conforming_strings"=on','SET LOCAL standard_conforming_strings=on; SELECT 1']){
  const {f,bundle}=await opened(),before=f.queries.length;await rejectsThenStops(bundle,f,'installation',[payload],optionsFor('installation'),()=>assert.equal(f.queries.length,before));
 }
});

test('owned close failure does not replace the original native exception or trigger SQL cleanup/retry',async()=>{
 const {f,bundle}=await opened(),original=Object.assign(Error('UNIT_NATIVE_FAILURE'),{code:'P0001'});f.clients[3].endError=Error('UNIT_CLOSE_FAILURE');f.queryHook=({text})=>{if(text==='unit fault')throw original;};
 await assert.rejects(()=>bundle.transactionObserved('installation',['unit fault'],optionsFor('installation')),error=>error===original);assert.equal(failureObservation(original).transaction.sessionTerminated,false);
 const before=f.queries.length;await assert.rejects(()=>bundle.close(),/OWNED_SESSION_CLOSE_FAILED/);assert.equal(f.queries.length,before);assert.equal(f.clients[3].ended,false);
});

test('only closed safe failure context is serializable; native error fields, URI and callback arguments expose no credentials',async()=>{
 const {f,bundle}=await opened(),uri=connection(base),original=Object.assign(Error(uri),{name:uri,code:'ECONNRESET',detail:secret,where:uri,arbitrary:{password:secret}});
 f.queryHook=({text})=>{if(text==='unit fault')throw original;};
 await rejectsThenStops(bundle,f,'installation',['unit fault'],optionsFor('installation'),error=>{assert.strictEqual(error,original);assert.equal(Object.prototype.propertyIsEnumerable.call(error,'ownAtomicTransaction'),false);const raw=JSON.stringify(failureObservation(error));for(const fragment of [secret,uri,'postgresql://'])assert.equal(raw.includes(fragment),false);assert.equal(failureObservation(error).transaction.kind,'production');});
});
