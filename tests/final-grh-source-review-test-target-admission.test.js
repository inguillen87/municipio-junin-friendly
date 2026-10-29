// Pure causal proposals. Synthetic metadata only; no native execution or SQL.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {createContext,runInContext} from 'node:vm';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const denied=()=>{throw Error('FINAL_REVIEW_TEST_TARGET_IO_FORBIDDEN');};for(const[module,names]of[[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['get','request','createServer']],[https,['get','request','createServer']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const name of names)module[name]=denied;globalThis.fetch=denied;syncBuiltinESMExports();
const targetModule=await import('../scripts/lib/final-grh-source-review-test-target-admission.mjs');
const {prepareFinalReviewTestTargetAdmission,requireFinalReviewTestTargetAdmission,FINAL_REVIEW_TEST_TARGET:T,FINAL_REVIEW_TEST_CHECK_SHA256}=targetModule;
const {buildFinalGrhSourceReviewAdmissionInstallation,buildFinalGrhSourceReviewAdmissionTestPrerequisite}=await import('../scripts/lib/final-grh-source-review-admission-installation.mjs');
const oct=await import('../scripts/lib/final-grh-source-review-admission-october28-installation.mjs');
const {buildFinalGrhSourceReviewAdmissionOctober28,buildFinalGrhSourceReviewAdmissionOctober28Test,assertOctober28AdmissionProof,assertOctober28TestAdmissionProof,OCT28_TEST_PROOF_VERSION,OCT28_PROOF_VERSION,OCT28_SOURCE_PINS,OCT28_REVIEW_ADMISSION_FILE,OCT28_REVIEW_ADMISSION_SQL_SHA256,OCT28_EXPECTED_MODE,OCT28_EXPECTED_TUPLE_STATE,OCT28_ADMITTED_PROFILES}=oct;
const {projectFinalReviewTestSourceParent,FINAL_REVIEW_TEST_SOURCE_SUCCESSION}=await import('./fixtures/final-review-test-target-source-succession.js');
const {splitPostgresStatements}=await import('../scripts/lib/sql-statements.mjs');const {finalSourcePrerequisite}=await import('../scripts/lib/final-contract-adoption-installation.mjs');const {preservationSnapshot}=await import('../scripts/lib/native-leave-installation.mjs');const {OWN_RELEASE_TARGETS}=await import('../scripts/lib/own-payroll-release-target.mjs');const {ownInstallationDestination,ownInstallationSettings}=await import('../scripts/prepare-own-payroll-installation.mjs');const {projectOctober28RegistryParent}=await import('../scripts/lib/grh-october28-candidate-registry-source.mjs');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),hash=value=>createHash('sha256').update(value).digest('hex'),sourceCommit='a'.repeat(40),observationSourceCommit='b'.repeat(40);
const BASE='scripts/lib/final-grh-source-review-admission-installation.mjs',OCT='scripts/lib/final-grh-source-review-admission-october28-installation.mjs',TARGET='scripts/lib/final-grh-source-review-test-target-admission.mjs';
function observation(){return{version:'root-oct28-existing-test-native-readonly-preflight.v1',sourceCommit:observationSourceCommit,projectId:T.projectId,branch:{id:T.branchId,name:'codex-annul-ddl-post215-20261028-r1',parent:T.parentBranchId,currentState:'ready',primary:false,default:false,protected:false},compute:[{id:T.endpointId,branchId:T.branchId,projectId:T.projectId,host:T.host,type:'read_write',state:'idle'}],proof:{version:'oct28-test-native-identity-preflight.v1',branchId:T.branchId,database:T.database,guardOid:String(T.guardOid),readOnly:true,isolation:'repeatable read',projectId:T.projectId,endpointId:T.endpointId,catalogOnly:true,currentUser:T.role,databaseOid:String(T.databaseOid),serverMajor:T.major,sessionUser:T.role,managedConstraints:[{name:'grh_final_source_revision_source_tuple_check',local:true,validated:true,expressionSha256:FINAL_REVIEW_TEST_CHECK_SHA256['183']}],runtimeRolePresent:true,finalRevisionPresent:true},expectedTuple183Sha256:FINAL_REVIEW_TEST_CHECK_SHA256['183'],expectedTuple218Sha256:FINAL_REVIEW_TEST_CHECK_SHA256['218'],observedExact183:true,testAdmissionGranted:false,ddlStatementsExecuted:0,nominalRowsReturned:0,businessWrites:0,productionCalls:0};}
function admitted(change=()=>{}){const value=observation();change(value);const raw=Buffer.from(JSON.stringify(value),'utf8'),digest=hash(raw),capability=prepareFinalReviewTestTargetAdmission({sourceCommit,nativeObservationRaw:raw,nativeObservationSha256:digest});return{capability,raw,digest};}
const build=capability=>buildFinalGrhSourceReviewAdmissionOctober28Test({read,sourceCommit,testTargetAdmission:capability});
const labels=Object.keys(OCT28_EXPECTED_TUPLE_STATE),RO=['durable','preflight'];
const statements=(batch,label)=>({install:batch.transactions.install.statements,repeat:batch.transactions.repeat.statements,durable:batch.transactions.durable.statements,preflight:batch.preflight,rollback:batch.guardedRollback.statements})[label];
function proofFor(batch,label,digest){const state=OCT28_EXPECTED_TUPLE_STATE[label];return{version:OCT28_TEST_PROOF_VERSION,sourceCommit,sqlSha256:OCT28_REVIEW_ADMISSION_SQL_SHA256,historicalSqlSha256:batch.historical.sql183Sha256,baselineSqlSha256:batch.historical.sql144Sha256,targetMajor:T.major,mode:OCT28_EXPECTED_MODE[label],allChecksPassed:true,newTables:0,newFunctions:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,revisionWritten:false,activationOrAdoption:false,expectedTupleState:state,tupleState:state,admittedProfiles:[...OCT28_ADMITTED_PROFILES[state]],priorTableCount:215,transactionDataPreserved:!RO.includes(label),priorFingerprint:'c'.repeat(64),managedConstraintSha256:'d'.repeat(64),...(RO.includes(label)?{}:{beforeFingerprint:'c'.repeat(64)}),targetKind:'test',projectId:T.projectId,branchId:T.branchId,endpointId:T.endpointId,database:T.database,databaseOid:T.databaseOid,guardOid:T.guardOid,serverMajor:T.major,currentUser:T.role,sessionUser:T.role,testTargetObservationSha256:digest,testTargetObservationSourceCommit:observationSourceCommit};}

test('TEST source admission has original-object custody and distinct observation/construction commits; no execution authority',()=>{
 const {capability,raw,digest}=admitted(),scope=requireFinalReviewTestTargetAdmission(capability,{sourceCommit});assert.equal(scope.sourceCommit,sourceCommit);assert.equal(scope.observationSourceCommit,observationSourceCommit);assert.equal(scope.observationSha256,digest);assert.equal(scope.observedTupleState,'183');assert.equal(scope.executionAdmitted,false);assert.equal(scope.connects,false);assert.equal(scope.executesSql,false);assert.ok(Object.isFrozen(scope)&&Object.isFrozen(T));
 assert.throws(()=>requireFinalReviewTestTargetAdmission({...capability},{sourceCommit}),/ORIGINAL_CAPABILITY/);assert.throws(()=>requireFinalReviewTestTargetAdmission(capability,{sourceCommit:'f'.repeat(40)}),/CONSTRUCTION_SOURCE/);
 assert.throws(()=>prepareFinalReviewTestTargetAdmission({sourceCommit,nativeObservationRaw:raw,nativeObservationSha256:'0'.repeat(64)}),/OBSERVATION_SHA/);assert.throws(()=>prepareFinalReviewTestTargetAdmission({sourceCommit,nativeObservationRaw:raw.toString('utf8'),nativeObservationSha256:digest}),/RAW_REQUIRED/);
 const repeat=admitted(o=>{o.proof.managedConstraints[0].expressionSha256=FINAL_REVIEW_TEST_CHECK_SHA256['218'];o.observedExact183=false;});assert.equal(requireFinalReviewTestTargetAdmission(repeat.capability,{sourceCommit}).observedTupleState,'218');
});

test('negative metadata: foreign/Production target, missing protections, fabricated native identity, mixed CHECK or side effects refuse construction',()=>{
 const changes=[o=>o.branch.id=T.parentBranchId,o=>o.branch.parent='br-foreign',o=>o.branch.name='foreign',o=>o.branch.currentState='init',o=>o.branch.primary=true,o=>o.branch.default=true,o=>o.branch.protected=true,o=>o.compute.push({...o.compute[0]}),o=>o.compute[0].id='ep-foreign',o=>o.compute[0].host='localhost',o=>o.compute[0].projectId='foreign',o=>o.compute[0].type='read_only',o=>o.compute[0].state='broken',o=>o.proof.branchId=T.parentBranchId,o=>o.proof.endpointId='ep-foreign',o=>o.proof.serverMajor=18,o=>o.proof.databaseOid='16396',o=>o.proof.guardOid='1',o=>o.proof.currentUser='postgres',o=>o.proof.sessionUser='postgres',o=>o.proof.database='other',o=>o.proof.readOnly=false,o=>o.proof.isolation='serializable',o=>o.proof.catalogOnly=false,o=>o.proof.runtimeRolePresent=false,o=>o.proof.finalRevisionPresent=false,o=>o.proof.managedConstraints.push({...o.proof.managedConstraints[0]}),o=>o.proof.managedConstraints[0].expressionSha256='0'.repeat(64),o=>o.proof.managedConstraints[0].local=false,o=>o.proof.managedConstraints[0].validated=false,o=>o.observedExact183=false,o=>o.testAdmissionGranted=true,o=>o.ddlStatementsExecuted=1,o=>o.businessWrites=1,o=>o.nominalRowsReturned=1,o=>o.productionCalls=1,o=>o.passed=true,o=>o.proof.passed=true];for(const change of changes)assert.throws(()=>admitted(change));
 for(const path of ['projectId','sourceCommit','proof','compute','expectedTuple183Sha256'])assert.throws(()=>admitted(o=>{delete o[path];}),path);
});

test('TEST is selected before shared construction; exposes no183 executor and preserves canonical SQL218 and all guards',()=>{
 const {capability}=admitted(),base=buildFinalGrhSourceReviewAdmissionTestPrerequisite({read,sourceCommit,testTargetAdmission:capability}),b=build(capability);
 for(const key of ['migration','transactions','installation','guardedRollback','preflight','initial'])assert.equal(Object.hasOwn(base,key),false,key);assert.equal(base.version,'final-grh-source-review-test-prerequisite.v1');assert.equal(b.version,'final-grh-source-review-admission-october28.v1+test');assert.deepEqual(b.target,T);assert.equal(b.testConstruction.executionAdmitted,false);assert.equal(b.transactions.rehearsal.completion,'ROLLBACK');assert.equal(b.transactions.install.completion,'COMMIT');assert.equal(b.transactions.durable.readOnly,true);assert.equal(hash(read(OCT28_REVIEW_ADMISSION_FILE)),OCT28_REVIEW_ADMISSION_SQL_SHA256);assert.equal(b.migration.length,1);
 for(const literal of [T.branchId,T.endpointId,T.projectId,T.role,T.database,String(T.guardOid),String(T.databaseOid),'FINAL_REVIEW_TEST_SESSION_USER','OWN_INSTALL_DESTINATION_MISMATCH','runtime_app'])assert.ok(base.destination.includes(literal),literal);assert.ok(!base.destination.includes(T.parentBranchId));
 for(const label of labels){const sql=statements(b,label);assert.ok(sql.includes(base.destination),label);assert.ok(sql.includes('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'),label);assert.equal(sql.filter(s=>s===b.migration[0]).length,['install','repeat'].includes(label)?1:0);}
 for(const[file,digest]of Object.entries(b.sourceHashes))assert.equal(hash(read(file)),digest,file);assert.equal(b.sourceHashes[BASE],OCT28_SOURCE_PINS[BASE]);assert.equal(b.sourceHashes[TARGET],hash(read(TARGET)));
 for(const file of [TARGET,BASE])assert.throws(()=>buildFinalGrhSourceReviewAdmissionOctober28Test({sourceCommit,testTargetAdmission:capability,read:path=>read(path)+(path===file?'\n':'')}),/SOURCE_CHANGED/);
 assert.throws(()=>build({...capability}),/ORIGINAL_CAPABILITY/);
});

test('TEST proof observes native identifiers, rejects original Production version and every missing/foreign identity; no proof relabeling',()=>{
 const {capability,digest}=admitted(),b=build(capability);for(const label of labels){const proof=proofFor(b,label,digest),options={label,sourceCommit,testTargetAdmission:capability};assert.equal(assertOctober28TestAdmissionProof(proof,options),true);assert.throws(()=>assertOctober28AdmissionProof(proof,{label,sourceCommit,major:T.major}));
  for(const key of Object.keys(proof)){const partial={...proof};delete partial[key];assert.throws(()=>assertOctober28TestAdmissionProof(partial,options),label+' missing '+key);}
  for(const patch of [{version:OCT28_PROOF_VERSION},{targetKind:'production'},{branchId:T.parentBranchId},{endpointId:'ep-other'},{projectId:'other'},{database:'other'},{databaseOid:T.databaseOid+1},{guardOid:T.guardOid+1},{serverMajor:18},{currentUser:'postgres'},{sessionUser:'postgres'},{testTargetObservationSha256:'0'.repeat(64)},{testTargetObservationSourceCommit:sourceCommit},{mode:'arbitrary'},{expectedTupleState:'unknown'},{tupleState:'mixed'},{businessWrites:1},{extra:true}])assert.throws(()=>assertOctober28TestAdmissionProof({...proof,...patch},options),label+' '+Object.keys(patch));
  const sql=statements(b,label).at(-1);for(const literal of [OCT28_TEST_PROOF_VERSION,"'branchId',current_setting('neon.branch_id',true)","'endpointId',current_setting('neon.endpoint_id',true)","'database',current_database()","oid::bigint FROM pg_database","to_regprocedure('public.native_employee_contract_guard_v1()')::oid::bigint","'currentUser',current_user","'sessionUser',session_user",digest,observationSourceCommit])assert.ok(sql.includes(literal),label+' '+literal);
 }
});

test('closed whole-source succession retains exact183 and218 parents and rejects one-byte drift or prior parent input',()=>{
 assert.equal(FINAL_REVIEW_TEST_SOURCE_SUCCESSION.length,2);assert.ok(Object.isFrozen(FINAL_REVIEW_TEST_SOURCE_SUCCESSION));for(const file of FINAL_REVIEW_TEST_SOURCE_SUCCESSION){assert.ok(Object.isFrozen(file)&&Object.isFrozen(file.operations)&&file.operations.every(Object.isFrozen));assert.throws(()=>{file.afterSha256='0'.repeat(64);});const raw=Buffer.from(read(file.path),'utf8'),parent=projectFinalReviewTestSourceParent(file.path,raw);assert.equal(hash(parent),file.beforeSha256);assert.equal(parent.length,file.beforeBytes);assert.throws(()=>projectFinalReviewTestSourceParent(file.path,Buffer.concat([raw,Buffer.from('\n')])));assert.throws(()=>projectFinalReviewTestSourceParent(file.path,parent));}
});

// Validate before JSON crosses VM realms. Inspect descriptors rather than values
// so accessors are rejected without calling them. Shared acyclic objects are
// valid JSON data; an active-ancestor set rejects cycles without rejecting aliases.
function assertLosslessJsonData(value,path='$',ancestors=new Set()){
 const label='FINAL_REVIEW_PROD_COMPARISON_JSON_DATA: '+path;
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){assert.ok(Number.isFinite(value)&&!Object.is(value,-0),label+' number');return;}
 assert.equal(typeof value,'object',label+' primitive');assert.ok(!ancestors.has(value),label+' cycle');
 const intrinsicPrototype=(prototype,constructor)=>{
  assert.ok(prototype!==null&&typeof prototype==='object',label+' prototype');
  const descriptor=Object.getOwnPropertyDescriptor(prototype,'constructor');
  assert.ok(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='function',label+' constructor');
  assert.equal(Function.prototype.toString.call(descriptor.value),Function.prototype.toString.call(constructor),label+' intrinsic constructor');
  const constructorPrototype=Object.getOwnPropertyDescriptor(descriptor.value,'prototype');
  assert.ok(constructorPrototype&&Object.hasOwn(constructorPrototype,'value')&&constructorPrototype.value===prototype,label+' intrinsic prototype');
  assert.equal(Object.getOwnPropertyDescriptor(prototype,'toJSON'),undefined,label+' inherited toJSON');
 };
 const prototype=Object.getPrototypeOf(value),array=Array.isArray(value);
 if(array){intrinsicPrototype(prototype,Array);const parent=Object.getPrototypeOf(prototype);intrinsicPrototype(parent,Object);assert.equal(Object.getPrototypeOf(parent),null,label+' array parent');}
 else if(prototype!==null){intrinsicPrototype(prototype,Object);assert.equal(Object.getPrototypeOf(prototype),null,label+' object parent');}
 const keys=Reflect.ownKeys(value);ancestors.add(value);
 const field=key=>{assert.equal(typeof key,'string',label+' symbol key');const descriptor=Object.getOwnPropertyDescriptor(value,key);assert.ok(descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable===true,label+' data descriptor '+key);assertLosslessJsonData(descriptor.value,path+'['+JSON.stringify(key)+']',ancestors);};
 try{
  if(array){const length=Object.getOwnPropertyDescriptor(value,'length');assert.ok(length&&Object.hasOwn(length,'value')&&length.enumerable===false&&Number.isSafeInteger(length.value)&&length.value>=0,label+' length');assert.equal(keys.length,length.value+1,label+' dense array without extras');for(let index=0;index<length.value;index++){assert.equal(keys[index],String(index),label+' dense array index');field(keys[index]);}assert.equal(keys.at(-1),'length',label+' array own keys');}
  else for(const key of keys)field(key);
 }finally{ancestors.delete(value);}
}

test('comparison guard rejects properties and values that JSON would hide or change',()=>{
 const hidden=Object.defineProperty({kept:1},'hidden',{value:2,enumerable:false}),symbolKey={kept:1,[Symbol('hidden')]:2},extraArray=Object.assign([1],{extra:2});
 const cases=[[{kept:1,lost:undefined},{kept:1}],[{kept:1,lost:()=>2},{kept:1}],[{kept:1,lost:Symbol('hidden')},{kept:1}],[hidden,{kept:1}],[symbolKey,{kept:1}],[extraArray,[1]],[[,1],[null,1]],[[NaN,Infinity,-Infinity,-0],[null,null,null,0]],[{date:new Date('2026-10-29T00:00:00Z')},{date:'2026-10-29T00:00:00.000Z'}],[{map:new Map([['kept',1]])},{map:{}}]];
 const roundtrip=value=>JSON.parse(JSON.stringify(value));for(const[lossy,apparentlyEqual]of cases){assert.deepEqual(roundtrip(lossy),roundtrip(apparentlyEqual),'the old JSON-only comparator masks this difference');assert.throws(()=>assertLosslessJsonData(lossy),/FINAL_REVIEW_PROD_COMPARISON_JSON_DATA/);assertLosslessJsonData(apparentlyEqual);}
 let getterCalls=0,toJsonCalls=0;const accessor=Object.defineProperty({},'value',{enumerable:true,get(){getterCalls++;return 1;}}),withToJSON=Object.defineProperty({},'toJSON',{value(){toJsonCalls++;return {};},enumerable:false});
 for(const value of [accessor,withToJSON])assert.throws(()=>assertLosslessJsonData(value),/FINAL_REVIEW_PROD_COMPARISON_JSON_DATA/);assert.equal(getterCalls,0);assert.equal(toJsonCalls,0);
 const objectCycle={};objectCycle.self=objectCycle;const arrayCycle=[];arrayCycle.push(arrayCycle);const arrayHidden=[1];Object.defineProperty(arrayHidden,'hidden',{value:2,enumerable:false});const arraySymbol=[1];arraySymbol[Symbol('hidden')]=2;const nonEnumerableIndex=[1];Object.defineProperty(nonEnumerableIndex,'0',{enumerable:false});
 for(const value of [undefined,()=>1,Symbol('value'),1n,NaN,Infinity,-Infinity,-0,objectCycle,arrayCycle,arrayHidden,arraySymbol,nonEnumerableIndex,new Set([1]),new Number(1),new String('value'),new Uint8Array([1]),Object.create({inherited:1})])assert.throws(()=>assertLosslessJsonData(value),/FINAL_REVIEW_PROD_COMPARISON_JSON_DATA/);
});

test('comparison guard accepts complete JSON values across realms, frozen data and shared acyclic references',()=>{
 const shared={nested:[null,true,false,'text',0,1.25]},value={first:shared,second:shared,frozen:Object.freeze([Object.freeze({key:'value'})]),nullPrototype:Object.assign(Object.create(null),{safe:true})};assertLosslessJsonData(value);
 const foreign=runInContext('({object:{key:"value"},array:[null,true,false,"text",0,1.25]})',createContext({}));assertLosslessJsonData(foreign);
 const foreignDate=runInContext('new Date(0)',createContext({})),foreignMap=runInContext('new Map([["key",1]])',createContext({}));for(const object of [foreignDate,foreignMap])assert.throws(()=>assertLosslessJsonData(object),/FINAL_REVIEW_PROD_COMPARISON_JSON_DATA/);
});

test('Production PG17/18 complete protocols equal exact prior constructors after removing only current sourceHash metadata',()=>{
 const context=createContext({assert,createHash,splitPostgresStatements,finalSourcePrerequisite,preservationSnapshot,OWN_RELEASE_TARGETS,ownInstallationDestination,ownInstallationSettings,projectOctober28RegistryParent});
 const compile=(path,exports)=>{const raw=projectFinalReviewTestSourceParent(path,Buffer.from(read(path),'utf8')).toString('utf8'),source=raw.replace(/^import[^\n]*\n/gm,'').replace(/\bexport (?=(?:const|function)\b)/g,'');return runInContext('(()=>{'+source+'\nreturn {'+exports.join(',')+'};})()',context,{timeout:10000});};
 const previous183=compile(BASE,['buildFinalGrhSourceReviewAdmissionInstallation','FINAL_REVIEW_ADMISSION_FILE','FINAL_REVIEW_ADMISSION_SQL_SHA256','FINAL_REVIEW_ADMISSION_PROFILES','FINAL_REVIEW_ADMISSION_REGISTRY_PARENT_SHA256']);Object.assign(context,previous183);const previous218=compile(OCT,['buildFinalGrhSourceReviewAdmissionOctober28']);
 const historicalRead=path=>[BASE,OCT].includes(path)?projectFinalReviewTestSourceParent(path,Buffer.from(read(path),'utf8')).toString('utf8'):read(path),plain=object=>JSON.parse(JSON.stringify(object));
 for(const major of [17,18])for(const[current,previous]of [[buildFinalGrhSourceReviewAdmissionInstallation,previous183.buildFinalGrhSourceReviewAdmissionInstallation],[buildFinalGrhSourceReviewAdmissionOctober28,previous218.buildFinalGrhSourceReviewAdmissionOctober28]]){
  const actualRaw=current({read,sourceCommit,major}),parentRaw=previous({read:historicalRead,sourceCommit,major});
  assertLosslessJsonData(actualRaw,'actual PG'+major);assertLosslessJsonData(parentRaw,'parent PG'+major);
  const actual=plain(actualRaw),parent=plain(parentRaw);
  for(const[file,digest]of Object.entries(actual.sourceHashes))assert.equal(hash(read(file)),digest,file);
  delete actual.sourceHashes;delete parent.sourceHashes;
  assert.deepEqual(actual,parent,'complete Production protocol '+major);assert.equal(Object.hasOwn(actual,'testConstruction'),false);
 }
});
