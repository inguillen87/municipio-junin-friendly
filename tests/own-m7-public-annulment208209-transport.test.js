// Proposed pure SOURCE/recording-transport tests. No object below is evidence
// of a real PostgreSQL receipt, TLS connection, installation or rollback.
import {mockedCompleteM7Tail,syntheticReleaseTlsObservations} from './fixtures/own-m10-institutional-receipt-mocks.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {OWN_RELEASE_TARGETS} from '../scripts/lib/own-payroll-release-target.mjs';
import {ownReleasePgDependencySource,createOwnReleaseAnnulmentSessions,ownReleaseErrorObservation,ownReleaseErrorCode,ownReleaseReceiptObservation,assertOwnReleaseTlsObservations} from '../scripts/lib/own-payroll-release-annulment-pg.mjs';
import {composeOwnM7PublicSchemaBatch,OWN_M7_STAGE_IDS} from '../scripts/lib/own-m7-public-schema-batch.mjs';
import {composeOwnM7PublicSchemaBatchWithAnnulment,executeOwnM7PublicAnnulmentTail,assertOwnM7AnnulmentRehearsalDetail,OWN_M7_ANNULMENT_TAIL_STAGE,OWN_M7_STAGES_WITH_ANNULMENT,assertOwnM7PublicAnnulmentTailRecord} from '../scripts/lib/own-m7-public-annulment208209.mjs';
import {OWN_ANNUL_REVIEW208_SQL_SHA256} from '../scripts/lib/own-m7-public-annulment208-source.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),sourceCommit='a'.repeat(40);
const pgVersion='8.23.1',pgIntegrity='sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==';
function dependencyInput(){return{packageJson:JSON.stringify({dependencies:{pg:pgVersion}}),packageLock:JSON.stringify({lockfileVersion:3,packages:{'':{dependencies:{pg:pgVersion}},'node_modules/pg':{version:pgVersion,resolved:'https://registry.npmjs.org/pg/-/pg-'+pgVersion+'.tgz',integrity:pgIntegrity}}})};}
let cached;const batch=()=>cached??=composeOwnM7PublicSchemaBatchWithAnnulment({read,sourceCommit,operationalPairBaseline:'published107'});
const pair=()=>batch().targets.find(t=>t.major===17).stageBatches[OWN_M7_ANNULMENT_TAIL_STAGE];
function native(pid,major=17){return{pid,backendStart:'2026-10-27T00:00:00.'+String(pid).padStart(6,'0')+'+00:00',serverVersionNum:major===17?'170011':'180001'};}
function bundleDto({duplicate=false,foreign=false}={}){
 const p=pair(),identities=Object.fromEntries(['epoch','rehearsal','installation','durable','repetition'].map((slot,i)=>[slot,native(duplicate?21:21+i)]));
 return{version:'own-release-annulment-dedicated-pg.v2',target:{...p.target,...(foreign?{endpointId:'unit-foreign-endpoint'}:{}),transport:'postgres_tls_dedicated'},identities,tlsObservations:syntheticReleaseTlsObservations(identities,p.target),credentialsExposed:false,automaticRetry:false,close:async()=>{}};
}
function proofDto(stage,value){return{version:'own-annulment-review208-installation-proof.v1',sourceCommit:stage.sourceCommit,sourceSqlSha256:OWN_ANNUL_REVIEW208_SQL_SHA256,sourceHashes:{...stage.sourceHashes},predecessorPinsSha256:stage.predecessorPinsSha256,mode:'install',newFunctions:7,privateHelpers:3,runtimeFacades:4,newTables:0,adaptedFunctions:0,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,priorStateSha256:'1'.repeat(64),beforeStateSha256:'1'.repeat(64),objectSha256:'2'.repeat(64),transactionDataPreserved:true,native:value};}
function rehearsalError(stage,bundle){const error=Object.assign(Error(stage.rehearsalFault.code),{code:'P0001',detail:JSON.stringify({version:'public-annul-native-rehearsal-detail.v1',stage:208,sourceCommit:stage.sourceCommit,proof:proofDto(stage,bundle.identities.rehearsal)})});Object.defineProperty(error,'ownDedicatedSession',{value:{slot:'rehearsal',native:bundle.identities.rehearsal,sessionTerminated:true}});return error;}
function epochDto(stage,bundle,digest='1'.repeat(64)){return{version:'public-annul-source-epoch.v1',stage:stage.stage,sourceCommit:stage.sourceCommit,sourceHashes:{...stage.sourceHashes},predecessorPinsSha256:stage.predecessorPinsSha256,priorStateSha256:digest,newFunctions:0,native:bundle.identities.epoch};}

test('the dedicated driver accepts only the reviewed official exact pg dependency and immutable lock integrity',()=>{
 const input=dependencyInput(),pin=ownReleasePgDependencySource(input);assert.equal(pin.version,pgVersion);assert.equal(pin.integrity,pgIntegrity);
 for(const mutate of[
  v=>{v.packageJson=JSON.stringify({dependencies:{pg:'^'+pgVersion}});},
  v=>{const lock=JSON.parse(v.packageLock);lock.packages['node_modules/pg'].integrity='sha512-'+'a'.repeat(86)+'==';v.packageLock=JSON.stringify(lock);},
  v=>{const lock=JSON.parse(v.packageLock);lock.packages['node_modules/pg'].resolved='https://unit-foreign.invalid/pg.tgz';v.packageLock=JSON.stringify(lock);}
 ]){const changed=structuredClone(input);mutate(changed);assert.throws(()=>ownReleasePgDependencySource(changed));}
});

test('the pure public review appends one closed two-stage tail while all ten existing HTTP stage descriptors remain exact',()=>{
 const p=batch(),base=composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline:'published107'});
 assert.deepEqual(p.stageOrder,[...OWN_M7_STAGES_WITH_ANNULMENT]);assert.deepEqual(p.notComposed,['195']);
 for(const target of p.targets){
  const before=base.targets.find(t=>t.major===target.major);assert.deepEqual(target.stages.slice(0,OWN_M7_STAGE_IDS.length),before.stages);
  const tail=target.stageBatches[OWN_M7_ANNULMENT_TAIL_STAGE];assert.equal(tail.target.major,target.major);assert.deepEqual(tail.subStageOrder,[208,209]);assert.equal(tail.receipt208FileAccepted,false);
  assert.equal(tail.review208.rehearsalFault.wholeInverse,true);assert.equal(tail.preparation209.rehearsalFault.wholeInverse,true);
  assert.equal(tail.review208.faults.length,2);assert.equal(tail.preparation209.faults.length,3);
  assert.ok(tail.preparation209.statements.some(s=>s.includes('ANNUL209_NOT_IMMEDIATE208_EPOCH')));
  assert.ok(tail.preparation209.statements.some(s=>s.includes('PUBLIC209_PREDECESSOR_METADATA_CHANGED')));
  assert.ok(tail.preparation209.statements.some(s=>s.includes('PUBLIC209_IMMUTABLE_TRIGGER_SOURCE_CHANGED')));
 }
});

test('the existing pre107 review remains the same ten-stage plan and does not claim a209 admission',()=>{
 const actual=composeOwnM7PublicSchemaBatchWithAnnulment({read,sourceCommit,operationalPairBaseline:'pre107'});
 const original=composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline:'pre107'});
 assert.equal(JSON.stringify(actual),JSON.stringify(original));assert.deepEqual(actual.notComposed,['208','209','195']);
});

test('the native DETAIL decoder validates the original proof contract and never treats P0001 alone as a returned proof',()=>{
 const stage=pair().review208,bundle=bundleDto(),error=rehearsalError(stage,bundle),detail=error.detail;
 assert.equal(assertOwnM7AnnulmentRehearsalDetail({error,stage,bundle}).native.pid,bundle.identities.rehearsal.pid);assert.equal(error.detail,detail);
 assert.throws(()=>assertOwnM7AnnulmentRehearsalDetail({error,stage:{...stage},bundle}),/MINTED_STAGE/);
 for(const patch of[{code:'ECONNRESET'},{message:'prefix '+error.message},{detail:undefined},{detail:'not-json'},{detail:JSON.stringify({...JSON.parse(detail),stage:209})},{detail:JSON.stringify({...JSON.parse(detail),proof:{...JSON.parse(detail).proof,businessWrites:1}})}]){
  const changed=Object.assign(Error(error.message),{code:error.code,detail:error.detail},patch);Object.defineProperty(changed,'ownDedicatedSession',{value:error.ownDedicatedSession});
  assert.throws(()=>assertOwnM7AnnulmentRehearsalDetail({error:changed,stage,bundle}));
 }
});

test('an ambiguous first fault stops every later SQL, including the independent RO rollback check',async()=>{
 const calls=[],records=[];let acquired=0,closed=0;
 const client=async()=>{acquired++;const bundle=bundleDto();bundle.close=async()=>{closed++;};bundle.transaction=async(slot)=>{calls.push(slot);if(slot==='epoch')return[[{epoch:epochDto(pair().review208,bundle)}]];throw Object.assign(Error('unit ambiguous transport'),{code:'ECONNRESET'});};return bundle;};
 await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client,record:r=>records.push(structuredClone(r))}));
 assert.deepEqual(calls,['epoch','rehearsal']);assert.equal(acquired,1);assert.equal(closed,1);assert.equal(records.at(-1).state,'UNCERTAIN');assert.equal(records.at(-1).noFurtherSql,true);assert.equal(records.at(-1).durabilityVerified,false);
});

test('duplicate physical backends or a foreign endpoint are refused before even the baseline query',async()=>{
 for(const options of[{duplicate:true},{foreign:true}]){let queries=0;const client=async()=>({...bundleDto(options),transaction:async()=>{queries++;throw Error('must not query');}});
  await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client,record:()=>{}}));assert.equal(queries,0);
 }
});

test('a native expected rollback with a changed independent epoch cannot proceed to installation',async()=>{
 const calls=[],records=[];let reads=0,acquired=0;
 const client=async()=>{acquired++;const bundle=bundleDto();bundle.transaction=async(slot)=>{calls.push(slot);if(slot==='epoch')return[[{epoch:epochDto(pair().review208,bundle,++reads===1?'1'.repeat(64):'2'.repeat(64))}]];const e=Object.assign(Error('ANNUL208_LATE_INSTALL_FAILURE'),{code:'P0001'});Object.defineProperty(e,'ownDedicatedSession',{value:{slot:'rehearsal',native:bundle.identities.rehearsal,sessionTerminated:true}});throw e;};return bundle;};
 await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client,record:r=>records.push(structuredClone(r))}),/NEGATIVE_NOT_ROLLED_BACK/);
 assert.deepEqual(calls,['epoch','rehearsal','epoch']);assert.equal(acquired,1);assert.equal(records.at(-1).state,'UNCERTAIN');
});

test('initial receipt persistence failure prevents client acquisition, and cloned source pairs cannot issue208 authority',async()=>{
 let acquired=0;const client=async()=>{acquired++;throw Error('must not connect');};
 await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client,record:()=>{throw Error('unit receipt persistence failure');}}),/receipt persistence/);assert.equal(acquired,0);
 const original=batch(),changed={...original,targets:original.targets.map(t=>t.major===17?{...t,stageBatches:{...t.stageBatches,[OWN_M7_ANNULMENT_TAIL_STAGE]:{...pair()}}}:t)};
 await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:changed,major:17,client,record:()=>{}}),/RECOMPOSED_PAIR/);assert.equal(acquired,0);
});

test('a RAW source change after preparation is refused before client acquisition or a new SQL intent',async()=>{
 let changed=false,acquired=0;const reader=file=>read(file)+(changed&&file==='scripts/migrations/209-own-annulment-preparation-projection.sql'?'\n':'');
 const prepared=composeOwnM7PublicSchemaBatchWithAnnulment({read:reader,sourceCommit,operationalPairBaseline:'published107'});changed=true;
 await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:prepared,major:17,client:async()=>{acquired++;throw Error('must not connect');},record:()=>{}}),/RAW_SOURCE_BOOKEND_CHANGED|SOURCE_DRIFT|SOURCE_BOOKEND_CHANGED/);
 assert.equal(acquired,0);
});

function recordingPg({postgresSsl=false,duplicate=false,mutateClient}={}){
 const target=OWN_RELEASE_TARGETS.find(t=>t.major===17),clients=[],queries=[];let alive=0,maxAlive=0;
 class Client{
  constructor(config){this.config=config;this.number=clients.length;clients.push(this);this.ended=false;this.handlers=new Map();
   this.connectionParameters={...config};this.ssl=config.ssl;
   this.socket={encrypted:true,authorized:true,authorizationError:null,destroyed:false,writable:true,servername:config.host,
    getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({raw:Buffer.from('SYNTHETIC CERTIFICATE BYTES ONLY'),subjectaltname:'DNS:'+config.host})};
   this.connection={ssl:config.ssl,stream:this.socket};if(mutateClient)mutateClient(this);
  }
  on(event,handler){this.handlers.set(event,handler);return this;}
  async connect(){alive++;maxAlive=Math.max(maxAlive,alive);}
  async end(){if(!this.ended){this.ended=true;alive--;}}
  async query(statement){queries.push({client:this.number,statement});if(statement==='unit native fault')throw Object.assign(Error('unit native error'),{code:'P0001',detail:'unit original detail'});
   if(statement.includes(' AS native'))return{rows:[{...Object.fromEntries(['major','projectId','branchId','endpointId','database','role'].map(k=>[k,target[k]])),ssl:postgresSsl,native:native(duplicate?41:41+this.number)}]};
   return{rows:[]};
  }
 }
 const connectionValue='postgresql://'+target.role+':unit-only@'+target.host+'/'+target.database+'?sslmode=verify-full';
 return{Client,connectionValue,clients,queries,get alive(){return alive;},get maxAlive(){return maxAlive;}};
}
test('the dedicated pg adapter retains five actual recording sessions and hard-codes strict TLS without URL option override',async()=>{
 const f=recordingPg(),bundle=await createOwnReleaseAnnulmentSessions({major:17,Client:f.Client,connectionValue:f.connectionValue});
 assert.equal(f.maxAlive,5);assert.equal(f.alive,5);assert.equal(new Set(Object.values(bundle.identities).map(n=>n.pid+':'+n.backendStart)).size,5);
 for(const client of f.clients){assert.equal(Object.hasOwn(client.config,'connectionString'),false);assert.equal(client.config.ssl.rejectUnauthorized,true);assert.equal(client.config.ssl.servername,OWN_RELEASE_TARGETS[0].host);assert.equal(client.config.ssl.minVersion,'TLSv1.2');assert.equal(client.config.port,5432);}
 assert.ok(bundle.tlsObservations.every(row=>row.postgresSsl===false&&row.clientTls.encrypted&&row.clientTls.authorized&&row.clientTls.protocol==='TLSv1.3'));
 await bundle.transaction('durable',['SELECT 1'],{readOnly:true});assert.ok(f.queries.some(r=>r.statement==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 await bundle.close();assert.equal(f.alive,0);
});

test('the dedicated pg adapter preserves a native error, sends no automatic ROLLBACK, and closes only owned sessions',async()=>{
 const f=recordingPg(),bundle=await createOwnReleaseAnnulmentSessions({major:17,Client:f.Client,connectionValue:f.connectionValue});let observed;
 try{await bundle.transaction('rehearsal',['unit native fault'],{readOnly:false});}catch(error){observed=error;}
 assert.equal(observed.message,'unit native error');assert.equal(observed.detail,'unit original detail');assert.equal(observed.ownDedicatedSession.sessionTerminated,true);assert.equal(observed.ownDedicatedSession.slot,'rehearsal');
 assert.equal(f.queries.some(r=>/ROLLBACK/.test(r.statement)),false);assert.equal(f.alive,4);await bundle.close();assert.equal(f.alive,0);
 const idle=recordingPg(),held=await createOwnReleaseAnnulmentSessions({major:17,Client:idle.Client,connectionValue:idle.connectionValue}),failure=Object.assign(Error('unit idle disconnect'),{code:'ECONNRESET'});
 const before=idle.queries.length;idle.clients[0].handlers.get('error')(failure);
 await assert.rejects(()=>held.transaction('installation',['must never execute'],{readOnly:false}),error=>error===failure);
 assert.equal(idle.queries.length,before);assert.equal(failure.ownDedicatedTransportFailure.slot,'epoch');assert.deepEqual(failure.ownDedicatedTransportFailure.native,held.identities.epoch);await held.close();assert.equal(idle.alive,0);
});

test('the pg adapter refuses invalid backend observations, same backend IDs or an unapproved destination before emitting stage SQL',async()=>{
 for(const options of[{postgresSsl:null},{postgresSsl:'false'},{duplicate:true}]){const f=recordingPg(options);await assert.rejects(()=>createOwnReleaseAnnulmentSessions({major:17,Client:f.Client,connectionValue:f.connectionValue}));assert.equal(f.alive,0);assert.equal(f.queries.some(r=>r.statement==='unit native fault'),false);}
 const f=recordingPg();await assert.rejects(()=>createOwnReleaseAnnulmentSessions({major:17,Client:f.Client,connectionValue:f.connectionValue.replace('sslmode=verify-full','sslmode=disable')}));assert.equal(f.clients.length,0);
});

test('client TLS is verified from the effective configuration and certificate before the first SQL',async()=>{
 const changes=[
  c=>{c.socket.encrypted=false;},c=>{c.socket.authorized=false;},c=>{c.socket.authorizationError='UNIT_UNTRUSTED';},
  c=>{c.socket.destroyed=true;},c=>{c.socket.writable=false;},c=>{c.socket.servername='foreign.invalid';},
  c=>{c.socket.getProtocol=()=> 'TLSv1.1';},c=>{c.socket.getProtocol=undefined;},
  c=>{c.socket.getPeerCertificate=undefined;},c=>{c.socket.getPeerCertificate=()=>({});},
  c=>{c.socket.getPeerCertificate=()=>({raw:Buffer.from('unit certificate'),subjectaltname:'DNS:foreign.invalid'});},
  c=>{c.connectionParameters={...c.connectionParameters,host:'foreign.invalid'};},
  c=>{c.connectionParameters={...c.connectionParameters,port:6432};},
  c=>{c.connectionParameters={...c.connectionParameters,user:'foreign_role'};},
  c=>{c.connectionParameters={...c.connectionParameters,database:'foreign_database'};},
  c=>{c.connectionParameters={...c.connectionParameters,ssl:{...c.ssl,rejectUnauthorized:false}};},
  c=>{c.connectionParameters={...c.connectionParameters,ssl:{...c.ssl,minVersion:'TLSv1'}};},
  c=>{c.connectionParameters={...c.connectionParameters,ssl:{rejectUnauthorized:true,servername:c.config.host}};},
  c=>{c.ssl={...c.ssl,servername:'foreign.invalid'};},
  c=>{c.connection.ssl={...c.ssl,checkServerIdentity:()=>undefined};}
 ];
 for(const mutateClient of changes){
  const f=recordingPg({mutateClient});await assert.rejects(()=>createOwnReleaseAnnulmentSessions({major:17,Client:f.Client,connectionValue:f.connectionValue}));
  assert.equal(f.queries.length,0);assert.equal(f.alive,0);assert.equal(f.clients.length,1);
 }
});

test('backend true and false stay observations; both supported client TLS protocols retain certificate fingerprints',async()=>{
 for(const postgresSsl of [true,false])for(const protocol of ['TLSv1.2','TLSv1.3']){
  const f=recordingPg({postgresSsl,mutateClient:c=>{c.socket.getProtocol=()=>protocol;}});
  const bundle=await createOwnReleaseAnnulmentSessions({major:17,Client:f.Client,connectionValue:f.connectionValue});
  assert.equal(bundle.version,'own-release-annulment-dedicated-pg.v2');
  for(const row of bundle.tlsObservations){assert.equal(row.postgresSsl,postgresSsl);assert.equal(Object.hasOwn(row,'ssl'),false);assert.equal(row.clientTls.protocol,protocol);assert.equal(row.clientTls.hostnameVerified,true);assert.equal(row.clientTls.peerCertificateSha256,createHash('sha256').update('SYNTHETIC CERTIFICATE BYTES ONLY').digest('hex'));}
  await bundle.close();assert.equal(f.alive,0);
 }
});

test('TLS loss or a changed certificate on a retained session prevents another SQL and closes only that owned session',async()=>{
 for(const change of [c=>{c.socket.authorized=false;},c=>{c.socket.getPeerCertificate=()=>({raw:Buffer.from('changed unit certificate'),subjectaltname:'DNS:'+c.config.host});}]){
  const f=recordingPg(),bundle=await createOwnReleaseAnnulmentSessions({major:17,Client:f.Client,connectionValue:f.connectionValue});
  change(f.clients[2]);const before=f.queries.length;
  await assert.rejects(()=>bundle.transaction('installation',['unit forbidden stage'],{readOnly:false}),error=>error.ownDedicatedSession?.slot==='installation'&&error.ownDedicatedSession.sessionTerminated===true);
  assert.equal(f.queries.length,before);assert.equal(f.alive,4);assert.equal(f.clients[2].ended,true);await bundle.close();assert.equal(f.alive,0);
 }
});

test('TLS is checked between awaited statements so loss during a query cannot reach the next statement or COMMIT',async()=>{
 const f=recordingPg(),bundle=await createOwnReleaseAnnulmentSessions({major:17,Client:f.Client,connectionValue:f.connectionValue}),client=f.clients[2],original=client.query.bind(client);
 client.query=async statement=>{const result=await original(statement);if(statement==='unit first stage')client.socket.authorized=false;return result;};
 const before=f.queries.length;
 await assert.rejects(()=>bundle.transaction('installation',['unit first stage','unit forbidden second stage'],{readOnly:false}));
 assert.deepEqual(f.queries.slice(before).map(row=>row.statement),['BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE','unit first stage']);
 assert.equal(f.alive,4);await bundle.close();assert.equal(f.alive,0);
});

test('closed TLS observations reject duplicate slots and invalid channels before the coordinator baseline',async()=>{
 const changes=[
  b=>{b.version='own-release-annulment-dedicated-pg.v1';},
  b=>{b.tlsObservations[1]=structuredClone(b.tlsObservations[0]);},
  b=>{b.tlsObservations[0].clientTls.encrypted=false;},b=>{b.tlsObservations[0].clientTls.authorized=false;},
  b=>{b.tlsObservations[0].clientTls.hostnameVerified=false;},b=>{b.tlsObservations[0].clientTls.rejectUnauthorized=false;},
  b=>{b.tlsObservations[0].clientTls.protocol='TLSv1.1';},b=>{b.tlsObservations[0].clientTls.servername='foreign.invalid';},
  b=>{b.tlsObservations[0].clientTls.peerCertificateSha256='invalid';},b=>{b.tlsObservations[0].postgresSsl='false';},
  b=>{b.tlsObservations[0].clientTls.unreviewed=true;},b=>{b.tlsObservations[0].native={...b.tlsObservations[0].native,pid:999};}
 ];
 const valid=bundleDto();assert.equal(assertOwnReleaseTlsObservations({tlsObservations:valid.tlsObservations,identities:valid.identities,target:pair().target}),true);
 for(const change of changes){let queries=0;const b=bundleDto();change(b);b.transaction=async()=>{queries++;throw Error('must not query');};
  await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client:async()=>b,record:()=>{}}));assert.equal(queries,0);
 }
});

const digest=value=>createHash('sha256').update(value).digest('hex');
const privateUri='postgresql://synthetic_user:SYNTHETIC_PASSWORD_ONLY@synthetic.invalid/unit?token=SYNTHETIC_TOKEN_ONLY';
const privateFragments=[privateUri,'SYNTHETIC_PASSWORD_ONLY','SYNTHETIC_TOKEN_ONLY','postgresql://'];
function poisonError(message=privateUri){
 const error=Object.assign(Error(message),{name:privateUri,code:privateUri,severity:privateUri,detail:privateUri,hint:privateUri,where:privateUri,internalQuery:privateUri,stack:privateUri});
 // V8 may keep Error.stack as a lazy accessor even after assignment.
 // This fixture deliberately models a native data field; accessor coverage follows below.
 Object.defineProperty(error,"stack",{value:privateUri,writable:true,configurable:true});
 return error;
}
function assertRedacted(value){const text=JSON.stringify(value);for(const fragment of privateFragments)assert.equal(text.includes(fragment),false,fragment);}

test('HTTP release-target stays byteexact and pg lives in a separate source entry',()=>{
 assert.equal(digest(read('scripts/lib/own-payroll-release-target.mjs')),'85c1f346424ee97279434701245bb50bf819850a3114405d0647fe846721d448');
 assert.ok(read('scripts/lib/own-m7-public-successors213215.mjs').includes("'scripts/lib/own-payroll-release-target.mjs':'85c1f346424ee97279434701245bb50bf819850a3114405d0647fe846721d448'"));
 assert.ok(!read('scripts/lib/own-payroll-release-target.mjs').includes('ownReleaseAnnulmentClient'));
 assert.ok(read('scripts/lib/own-m7-public-annulment208209.mjs').includes("from './own-payroll-release-annulment-pg.mjs'"));
 assert.ok(read('scripts/prepare-own-m7-schema-batch-installation.mjs').includes("'scripts/lib/own-payroll-release-annulment-pg.mjs'"));
});

test('unexpected exception fields become hashes and lengths; codes are finite and getters or cause never serialize',()=>{
 const error=poisonError();error.cause={password:privateUri};let getterCalls=0;
 Object.defineProperty(error,'routine',{get(){getterCalls++;return privateUri;}});
 const observation=ownReleaseErrorObservation(error);assertRedacted(observation);assert.equal(getterCalls,0);
 assert.equal(observation.code,'PUBLIC_ANNUL_UNCLASSIFIED_ERROR');
 for(const key of ['name','message','stack','code','detail','hint','where','internalQuery'])assert.deepEqual(observation.fields[key],{type:'string',bytes:Buffer.byteLength(privateUri),sha256:digest(privateUri)});
 assert.deepEqual(observation.fields.routine,{type:'accessor',contentPersisted:false});
 let stackCalls=0;const accessorError=poisonError();
 Object.defineProperty(accessorError,"stack",{get(){stackCalls++;return privateUri;},configurable:true});
 const accessorObservation=ownReleaseErrorObservation(accessorError);assertRedacted(accessorObservation);
 assert.equal(stackCalls,0);assert.deepEqual(accessorObservation.fields.stack,{type:'accessor',contentPersisted:false});
 assert.equal(ownReleaseErrorCode({code:'P0001'}),'P0001');assert.equal(ownReleaseErrorCode({code:'SYNTHETIC_TOKEN_ONLY'}),'OWN_M7_INSTALL_FAILED');
 assert.equal(error.detail,privateUri);assert.equal(error.stack,privateUri);
 const cli={ok:false,stage:'installation',code:ownReleaseErrorCode(error),automaticRetry:false};assertRedacted(cli);
 assert.ok(read('scripts/install-own-m7-schema-batch.mjs').includes("code:ownReleaseErrorCode(e,'OWN_M7_INSTALL_FAILED')"));
});

test('client acquisition failure preserves the original cause in memory and stores no message, stack, DETAIL or URI',async()=>{
 const records=[],error=poisonError();let acquired=0;
 await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client:async()=>{acquired++;throw error;},record:value=>records.push(structuredClone(value))}),observed=>observed===error);
 assert.equal(acquired,1);assertRedacted(records);assert.equal(records.at(-1).state,'UNCERTAIN');assert.equal(records.at(-1).noFurtherSql,true);
 assert.equal(records.at(-1).failure.fields.detail.sha256,digest(privateUri));assert.equal(error.detail,privateUri);
});

// This finite fake observes coordinator ordering and admission, never PostgreSQL.
// Its source-shaped DTOs are intentionally not exported as native receipts.
function fullProof(stage,bundle,slot,mode,write,{objectDrift=false,extra=false}={}){
 const is208=stage.stage===208,prior=is208?'1'.repeat(64):'3'.repeat(64),object=is208?'2'.repeat(64):'4'.repeat(64);
 return{version:is208?'own-annulment-review208-installation-proof.v1':'own-annul-preparation209-installation-proof.v1',
  sourceCommit:stage.sourceCommit,sourceSqlSha256:is208?OWN_ANNUL_REVIEW208_SQL_SHA256:stage.sourceHashes['scripts/migrations/209-own-annulment-preparation-projection.sql'],sourceHashes:{...stage.sourceHashes},predecessorPinsSha256:stage.predecessorPinsSha256,
  mode,newFunctions:is208?7:3,privateHelpers:is208?3:1,runtimeFacades:is208?4:2,newTables:0,adaptedFunctions:0,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,
  transactionDataPreserved:write,priorStateSha256:prior,objectSha256:objectDrift?'f'.repeat(64):object,native:bundle.identities[slot],
  ...(write?{beforeStateSha256:prior}:{}),...(!is208?{epoch208PriorStateSha256:'1'.repeat(64)}:{}),...(extra?{unexpected:privateUri}:{})};
}
function fullProtocol({invalidDetail=false,invalidRows=false,durableDrift=false}={}){
 const calls=[],records=[],nativeErrors=[],closed=[];let acquisitions=0;
 const schedule=[[208,'late'],[208,'defaults'],[208,'main'],[209,'early'],[209,'late'],[209,'defaults'],[209,'main']];
 const client=async()=>{
  const invocation=acquisitions++,[id,purpose]=schedule[invocation]??[];assert.ok(id,'unexpected eighth acquisition');
  const stage=id===208?pair().review208:pair().preparation209,bundle=bundleDto();
  bundle.identities=Object.fromEntries(['epoch','rehearsal','installation','durable','repetition'].map((slot,index)=>[slot,native(100+invocation*10+index)]));
  bundle.tlsObservations=syntheticReleaseTlsObservations(bundle.identities,pair().target);
  bundle.close=async()=>closed.push(invocation);
  bundle.transaction=async(slot,statements)=>{
   calls.push({invocation,id,purpose,slot});
   if(slot==='epoch'&&statements.some(statement=>statement.includes('own-annulment-review208-function-bookend.v1'))){
    const s=pair().review208;return[[{proof:{version:'own-annulment-review208-function-bookend.v1',sourceCommit:s.sourceCommit,sourceSqlSha256:OWN_ANNUL_REVIEW208_SQL_SHA256,predecessorPinsSha256:s.predecessorPinsSha256,objectSha256:'2'.repeat(64)}}]];
   }
   if(slot==='epoch')return[[{epoch:epochDto(stage,bundle,id===208?'1'.repeat(64):'3'.repeat(64))}]];
   if(slot==='rehearsal'){
    const token=purpose==='main'?stage.rehearsalFault.code:stage.faults.find(fault=>fault.name===purpose).code;
    const error=Object.assign(poisonError(token),{code:'P0001'});
    if(purpose==='main')error.detail=JSON.stringify({version:'public-annul-native-rehearsal-detail.v1',stage:id,sourceCommit:stage.sourceCommit,proof:fullProof(stage,bundle,'rehearsal','install',true,{extra:invalidDetail&&id===208})});
    Object.defineProperty(error,'ownDedicatedSession',{value:{slot:'rehearsal',native:bundle.identities.rehearsal,sessionTerminated:true}});nativeErrors.push(error);throw error;
   }
   const mode=slot==='installation'?'install':'verify',write=slot!=='durable';
   return[[{proof:fullProof(stage,bundle,slot,mode,write,{extra:invalidRows&&id===208&&slot==='installation',objectDrift:durableDrift&&id===208&&slot==='durable'})}]];
  };return bundle;
 };
 return{client,calls,records,nativeErrors,closed,record:value=>records.push(structuredClone(value)),get acquisitions(){return acquisitions;}};
}

test('complete finite208→209 protocol observes eight proofs on four distinct backends per stage and the in-process208 gate',async()=>{
 const f=fullProtocol(),result=await executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client:f.client,record:f.record});
 assert.equal(f.acquisitions,7);assert.equal(f.closed.length,7);assert.equal(result.state,'VALIDATED');assert.equal(result.validatedNativeProofs,8);assert.equal(result.real208AdmissionUsed,true);
 assert.deepEqual(result.installedStages,[208,209]);assert.equal(result.review208DurabilityVerified,true);assert.equal(result.preparation209DurabilityVerified,true);
 for(const stage of[208,209]){
  const proofs=result.proofs[stage];assert.equal(new Set(['rehearsal','installed','durable','repeated'].map(key=>proofs[key].native.pid+':'+proofs[key].native.backendStart)).size,4);
  const observation=result.rehearsalObservations[stage];assert.match(observation.validatedDetail.detailSha256,/^[a-f0-9]{64}$/);assert.equal(observation.validatedDetail.detailSha256,observation.fields.detail.sha256);
  for(const receipt of Object.values(result.phaseReceiptObservations[stage]))assert.deepEqual(Object.keys(receipt).sort(),['bytes','sha256','version']);
 }
 const first209=f.records.find(record=>record.phase.startsWith('209-'));assert.equal(first209.review208DurabilityVerified,true);
 assertRedacted(f.records);assert.ok(f.nativeErrors.every(error=>error.stack===privateUri&&error.hint===privateUri));
});

test('a rehearsal DETAIL with an unrecognized proof field is hashed before rejection and cannot trigger another SQL',async()=>{
 const f=fullProtocol({invalidDetail:true});await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client:f.client,record:f.record}),error=>{assert.match(error.message,/PUBLIC_ANNUL_PROOF_FIELDS/);assert.strictEqual(error.cause,f.nativeErrors.at(-1));return true;});
 assert.equal(f.acquisitions,3);assert.deepEqual(f.calls.filter(call=>call.invocation===2).map(call=>call.slot),['epoch','rehearsal']);assertRedacted(f.records);
 const observation=f.records.at(-1).rehearsalObservations[208],original=f.nativeErrors.at(-1);
 assert.equal(observation.fields.detail.sha256,digest(original.detail));assert.equal(Object.hasOwn(observation,'validatedDetail'),false);assert.ok(original.detail.includes(privateUri));
 assert.equal(f.records.at(-1).proofs[208],undefined);assert.equal(f.records.at(-1).noFurtherSql,true);
});

test('unexpected SELECT proof data is only a byte digest before typed validation, with no durable SQL after rejection',async()=>{
 const f=fullProtocol({invalidRows:true});await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client:f.client,record:f.record}),/PUBLIC_ANNUL_PROOF_FIELDS/);
 assert.equal(f.acquisitions,3);assert.deepEqual(f.calls.filter(call=>call.invocation===2).map(call=>call.slot),['epoch','rehearsal','epoch','installation']);assertRedacted(f.records);
 assert.match(f.records.at(-1).phaseReceiptObservations[208].installation.sha256,/^[a-f0-9]{64}$/);
 assert.equal(Object.hasOwn(f.records.at(-1).proofs[208]??{},'installed'),false);
 assert.deepEqual(ownReleaseReceiptObservation([[{untrusted:privateUri}]]),{version:'own-release-receipt-bytes.v1',bytes:Buffer.byteLength(JSON.stringify([[{untrusted:privateUri}]])),sha256:digest(JSON.stringify([[{untrusted:privateUri}]]))});
});

test('a durable208 mismatch cannot mint the WeakMap admission, repeat or acquire any209 connection',async()=>{
 const f=fullProtocol({durableDrift:true});await assert.rejects(()=>executeOwnM7PublicAnnulmentTail({batch:batch(),major:17,client:f.client,record:f.record}),/PUBLIC_ANNUL_IMMEDIATE_DURABILITY_CHANGED:objectSha256/);
 assert.equal(f.acquisitions,3);assert.ok(!f.calls.some(call=>call.id===209||call.slot==='repetition'));assert.equal(f.records.at(-1).review208DurabilityVerified,undefined);
 assert.equal(f.records.at(-1).state,'UNCERTAIN');assertRedacted(f.records);
});

test('a later schema consumer revalidates all eight stored proofs without minting208 or querying209 again',async()=>{
 const record=await mockedCompleteM7Tail(batch()),checked=assertOwnM7PublicAnnulmentTailRecord({batch:batch(),major:17,record});assert.equal(checked.validatedOriginalNativeProofs,8);assert.equal(checked.queriesExecuted,0);assert.equal(checked.native208AdmissionMinted,false);assert.equal(checked.current209EpochReplayed,false);
 for(const mutate of [r=>r.state='UNCERTAIN',r=>delete r.proofs[209].durable,r=>r.proofs[209].installed.epoch208PriorStateSha256='9'.repeat(64),r=>r.proofs[208].installed.businessWrites=1,r=>r.negativeObservations.pop(),r=>r.real208FunctionBookend.objectSha256='9'.repeat(64),r=>r.transportObservations[0].tlsObservations[0].clientTls.authorized=false,r=>{r.transportObservations[0].tlsObservations[1]=structuredClone(r.transportObservations[0].tlsObservations[0]);},r=>r.transportObservations[0].tlsObservations[0].postgresSsl='false',r=>r.rehearsalObservations[208].validatedDetail.proofSha256='9'.repeat(64)]){
  const changed=structuredClone(record);mutate(changed);assert.throws(()=>assertOwnM7PublicAnnulmentTailRecord({batch:batch(),major:17,record:changed}));
 }
});
