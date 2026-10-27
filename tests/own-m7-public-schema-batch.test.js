import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {composeOwnM7PublicSchemaBatch,publicPrerequisiteDefinitions,publicPrerequisiteRuntime,OWN_M7_STAGE_IDS,OWN_M7_REHEARSAL_CODE,ownM7SourcePhaseContract} from '../scripts/lib/own-m7-public-schema-batch.mjs';
import {executeOwnM7Stage} from '../scripts/install-own-m7-schema-batch.mjs';
import {MONTHLY193_PREREQUISITES} from '../scripts/lib/own-monthly-day-declaration-installation.mjs';
import {ownInstallationSettings} from '../scripts/prepare-own-payroll-installation.mjs';
import {ownM7CommittedSourceClosure,assertOwnM7ReviewBytes,OWN_M7_SOURCE_REVIEW_ENTRIES} from '../scripts/prepare-own-m7-schema-batch-installation.mjs';
import {createRecordingSourceReader} from '../scripts/lib/owner-qa-source-closure-reader.mjs';
const root=path.resolve(import.meta.dirname,'..'),sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('public prerequisites come from the eight single public definers and no runtime grant',()=>{
 const p=publicPrerequisiteDefinitions(read);
 assert.deepEqual(p.prerequisiteDefinitions.map(d=>/FUNCTION (?:public\.)?([a-z0-9_]+)\(/.exec(d)[1]).sort(),[...MONTHLY193_PREREQUISITES].sort());
 assert.deepEqual(p.prerequisiteRuntime,[]);
 assert.deepEqual(publicPrerequisiteRuntime(['GRANT EXECUTE ON FUNCTION public.a(jsonb),b(text, uuid) TO municontrol_actions_runtime_app;','REVOKE ALL PRIVILEGES ON FUNCTION b(text, uuid)\n FROM municontrol_actions_runtime_app;']),new Set(['public.a(jsonb)']));
});
test('composition is deterministic, ordered and byte-consistent with the top builders',()=>{
 const a=composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline:'published107'}),b=composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline:'published107'});
 assert.equal(JSON.stringify(a),JSON.stringify(b));assert.deepEqual(a.stageOrder,[...OWN_M7_STAGE_IDS]);assert.equal(a.connects,false);assert.equal(a.executesSql,false);
 assert.equal(a.targets.length,2);for(const target of a.targets){assert.ok([17,18].includes(target.major));assert.deepEqual(target.stages.map(s=>s.id),[...OWN_M7_STAGE_IDS]);}
});
test('every target array carries the institutional settings/destination guard and the rehearsal ends in the fixed fault',()=>{
 const batch=composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline:'published107'});
 for(const target of batch.targets)for(const stage of target.stages){
  for(const key of ['preflight','durableVerification'])assert.equal(stage[key][0],'SET TRANSACTION READ ONLY');
  for(const key of ['preflight','rehearsal','installation','durableVerification',...(stage.repetition?['repetition']:[])]){const list=stage[key],offset=key==='preflight'||key==='durableVerification'?1:0;assert.deepEqual(list.slice(offset,offset+ownInstallationSettings.length),[...ownInstallationSettings]);assert.match(list[offset+ownInstallationSettings.length],/^DO \$destination\$/);}
  assert.match(stage.rehearsal.at(-1),new RegExp(OWN_M7_REHEARSAL_CODE));assert.deepEqual(stage.rehearsal.slice(0,-1),[...stage.installation]);
  for(const list of Object.values(stage).filter(Array.isArray))for(const s of list)assert.ok(!/mc_qa_fixed_092_/.test(s),'OWN_M7_QA_SCHEMA_LEAK:'+stage.id);
 }
 assert.deepEqual(batch.notComposed,['201','213','214','215','208','209','195']);
});
test('a baseline other than the two reviewed ones or a missing prerequisite source is refused before any batch',()=>{
 assert.throws(()=>composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline:'main'}),/OWN_M7_EXPLICIT_BASELINE_REQUIRED/);
 assert.throws(()=>publicPrerequisiteDefinitions(file=>file.endsWith('157-own-period-participation.sql')?'':read(file)),/OWN_M7_PREREQUISITE_SOURCE_MISSING/);
});

test('each193 ACL decision requires explicit PUBLIC and runtime source evidence',()=>{
 const source='scripts/lib/salary-administrative-identity-installation.mjs';
 assert.throws(()=>publicPrerequisiteDefinitions(file=>file===source?read(file).replace("'REVOKE ALL ON FUNCTION public.native_salary_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app'","'GRANT EXECUTE ON FUNCTION public.native_salary_administrative_context_v1(jsonb) TO municontrol_actions_runtime_app'"):read(file)),/OWN_M7_ADMINISTRATIVE_ACL_SOURCE_PENDING/);
 const file007='scripts/migrations/007-action-center-read-facades.sql';
 assert.throws(()=>publicPrerequisiteDefinitions(file=>file===file007?read(file).replace(/REVOKE ALL PRIVILEGES ON FUNCTION action_center_context_has_capability\(jsonb, text\)\s+FROM municontrol_actions_runtime_app;/,''):read(file)),/OWN_M7_RUNTIME_ACL_SOURCE_PENDING/);
});
function recordedStage({failure=null,badInstalled=false,badDurable=false,badRepeated=false,writeFailure=false}={}){
 const sourceCommit='a'.repeat(40),sourceHashes={'test/source':'b'.repeat(64)},target={major:17,projectId:'synthetic-project',branchId:'synthetic-branch',endpointId:'synthetic-endpoint',database:'synthetic-db',role:'synthetic-owner',host:'synthetic.invalid'};
 const stageBatch={version:'own-monthly-day-policy-installation.v1',sourceCommit,sourceHashes};
 const installed={...stageBatch,mode:'install',newTables:0,newFunctions:2,adaptedFunctions:4,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,transactionDataPreserved:true,preservationSha256:'c'.repeat(64),priorMetadataSha256:'d'.repeat(64),objectSha256:'e'.repeat(64)};
 const stage={id:'policy192',version:stageBatch.version,preflight:['preflight'],rehearsal:['rehearsal'],installation:['installation'],durableVerification:['durable'],repetition:['repetition']};
 const batch={targets:[{...target,stages:[stage]}],stageBatches:{policy192:stageBatch},phaseContracts:{policy192:ownM7SourcePhaseContract('policy192',read,stageBatch)},rehearsalCode:OWN_M7_REHEARSAL_CODE},calls=[],records=[];let clients=0;
 const client=async()=>{clients++;return{target,sql:{query:s=>s,transaction:async list=>{calls.push(list[0]);switch(list[0]){case'preflight':return[];case'rehearsal':throw failure??Object.assign(Error(OWN_M7_REHEARSAL_CODE),{code:'P0001'});case'installation':return[[{proof:{...installed,...(badInstalled?{mode:'verify'}:{})}}]];case'durable':return[[{proof:{...installed,mode:'verify',transactionDataPreserved:false,...(badDurable?{objectSha256:'f'.repeat(64)}:{})}}]];case'repetition':return[[{proof:{...installed,mode:'verify',...(badRepeated?{objectSha256:'f'.repeat(64)}:{})}}]];default:throw Error('UNEXPECTED_TEST_PHASE');}}}};};
 const record=value=>{if(writeFailure)throw Error('SYNTHETIC_FS_FAILURE');records.push(structuredClone(value));};
 return{batch,client,record,calls,records,get clients(){return clients;}};
}
test('transport mentioning the token never permits a rollback probe or install',async()=>{
 const fixture=recordedStage({failure:Object.assign(Error('transport: '+OWN_M7_REHEARSAL_CODE),{code:'ECONNRESET'})});
 await assert.rejects(()=>executeOwnM7Stage({...fixture,stageId:'policy192',major:17}),/REHEARSAL_UNCERTAIN/);
 assert.deepEqual(fixture.calls,['preflight','rehearsal']);assert.equal(fixture.records.at(-1).state,'UNCERTAIN');assert.equal(fixture.records.at(-1).durabilityVerified,false);
});
test('bad installed or durable proof stops BEFORE another SQL and never reports durable',async()=>{
 for(const[options,calls]of[[{badInstalled:true},['preflight','rehearsal','preflight','installation']],[{badDurable:true},['preflight','rehearsal','preflight','installation','durable']],[{badRepeated:true},['preflight','rehearsal','preflight','installation','durable','repetition']]]){
  const fixture=recordedStage(options);await assert.rejects(()=>executeOwnM7Stage({...fixture,stageId:'policy192',major:17}));assert.deepEqual(fixture.calls,calls);assert.equal(fixture.records.at(-1).durabilityVerified,false);assert.equal(fixture.records.at(-1).state,'UNCERTAIN');
 }
});
test('only exact P0001/token plus THREE real receipts admits durability',async()=>{
 const fixture=recordedStage(),result=await executeOwnM7Stage({...fixture,stageId:'policy192',major:17});
 assert.deepEqual(fixture.calls,['preflight','rehearsal','preflight','installation','durable','repetition']);assert.equal(result.durabilityVerified,true);assert.equal(result.state,'VALIDATED');
 assert.ok(fixture.records.slice(0,-1).every(row=>row.durabilityVerified===false));
});
test('failure to persist the initial invocation prevents even client acquisition',async()=>{
 const fixture=recordedStage({writeFailure:true});await assert.rejects(()=>executeOwnM7Stage({...fixture,stageId:'policy192',major:17}),/SYNTHETIC_FS_FAILURE/);assert.equal(fixture.clients,0);assert.deepEqual(fixture.calls,[]);
});

test('all six monophase contracts retain reviewed source and fixed196 exact shape',()=>{
 for(const stageId of OWN_M7_STAGE_IDS){
  const contract=ownM7SourcePhaseContract(stageId,read,{});
  assert.match(contract.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(Object.keys(contract.counts).length>=7);
  assert.throws(()=>ownM7SourcePhaseContract(stageId,file=>read(file)+'\n// unreviewed asserter drift',{}),/OWN_M7_ASSERT_REVIEWED_SOURCE_CHANGED/);
 }
 const fixed=ownM7SourcePhaseContract('fixed196',read,{});assert.ok(fixed.exactKeys.includes('sourceHashes'));assert.ok(fixed.exactKeys.includes('operationalPairBaseline'));
});
test('wrong SQLSTATE or a nonexact PostgreSQL message never permits another SQL',async()=>{
 for(const failure of[Error(OWN_M7_REHEARSAL_CODE),Object.assign(Error(OWN_M7_REHEARSAL_CODE),{code:'P0002'}),Object.assign(Error('prefix '+OWN_M7_REHEARSAL_CODE),{code:'P0001'})]){
  const fixture=recordedStage({failure});await assert.rejects(()=>executeOwnM7Stage({...fixture,stageId:'policy192',major:17}),/REHEARSAL_UNCERTAIN/);assert.deepEqual(fixture.calls,['preflight','rehearsal']);assert.equal(fixture.records.at(-1).durabilityVerified,false);
 }
});

// Synthetic committed-byte witnesses; these snippets are parsed, never executed.
function sourceGateFixture(){
 const files=new Map(OWN_M7_SOURCE_REVIEW_ENTRIES.map(file=>[file,Buffer.from(file.endsWith('.json')?'{}\n':'export const fixture = true;\n')]));
 files.set('scripts/lib/own-m7-public-schema-batch.mjs',Buffer.from("export {value} from '../../lib/in-scope.mjs';\n"));
 files.set('lib/in-scope.mjs',Buffer.from('export const value = 1;\n'));
 files.set('scripts/migrations/read-input.sql',Buffer.from('-- sintético ñ\nSELECT 1;  \n\n','utf8'));
 const committed=new Map([...files].map(([file,bytes])=>[file,Buffer.from(bytes)]));
 const readBytes=file=>{assert.ok(files.has(file),'UNEXPECTED_SOURCE_READ:'+file);return Buffer.from(files.get(file));};
 const committedBytes=file=>{assert.ok(committed.has(file),'SOURCE_NOT_COMMITTED:'+file);return Buffer.from(committed.get(file));};
 const recorder=createRecordingSourceReader({root,readBytes});
 return{files,committed,readBytes,committedBytes,recorder,verify(){return ownM7CommittedSourceClosure({root,sourceCommit,consumed:recorder.consumed(),readBytes,committedBytes});}};
}
test('source gate preserves outside WIP and binds imports plus actual read bytes',()=>{
 const f=sourceGateFixture(),foreign=Buffer.from('foreign work remains untouched\n');
 f.files.set('scripts/migrations/212-native-employment-lifecycle-history.sql',foreign);
 const text=f.recorder.read('scripts/migrations/read-input.sql');assert.equal(text,'-- sintético ñ\nSELECT 1;  \n\n');
 const result=f.verify();assert.equal(result.sourceBookend.committedBytesVerified,true);assert.equal(result.consumedBinding.consumedRawBytesMatched,true);
 assert.ok(Object.hasOwn(result.sourceClosure.files,'lib/in-scope.mjs'));assert.ok(Object.hasOwn(result.sourceClosure.files,'scripts/migrations/read-input.sql'));
 assert.equal(Object.hasOwn(result.sourceClosure.files,'scripts/migrations/212-native-employment-lifecycle-history.sql'),false);
 assert.deepEqual(f.files.get('scripts/migrations/212-native-employment-lifecycle-history.sql'),foreign);
});
test('source gate rejects WIP in imports or consumed inputs instead of excluding it',()=>{
 for(const file of ['lib/in-scope.mjs','scripts/migrations/read-input.sql']){
  const f=sourceGateFixture();f.files.set(file,Buffer.concat([f.files.get(file),Buffer.from('// uncommitted WIP\n')]));
  f.recorder.read('scripts/migrations/read-input.sql');
  assert.throws(()=>f.verify(),/OWNER_QA_COMMITTED_SOURCE_CHANGED/);
 }
 const untracked=sourceGateFixture();untracked.committed.delete('lib/in-scope.mjs');
 assert.throws(()=>untracked.verify(),/SOURCE_NOT_COMMITTED/);
 const changedAfterRead=sourceGateFixture();changedAfterRead.recorder.read('scripts/migrations/read-input.sql');
 const different=Buffer.from('SELECT 2;\n');changedAfterRead.files.set('scripts/migrations/read-input.sql',different);changedAfterRead.committed.set('scripts/migrations/read-input.sql',different);
 assert.throws(()=>changedAfterRead.verify(),/OWNER_QA_SOURCE_CONSUMED_BYTES_CHANGED/);
});
test('whole review JSON binds RAW UTF8 and SQL trailing whitespace byte for byte',()=>{
 const source=sourceGateFixture(),sql=source.recorder.read('scripts/migrations/read-input.sql');source.verify();
 const review={sourceCommit,targets:[{statements:[sql]}]},bytes=Buffer.from(JSON.stringify(review,null,2)+'\n','utf8');
 assert.doesNotThrow(()=>assertOwnM7ReviewBytes(bytes,review));assert.equal(JSON.parse(bytes).targets[0].statements[0],sql);
 const reformatted=Buffer.from(JSON.stringify(review)+'\n','utf8');assert.deepEqual(JSON.parse(reformatted),review);
 assert.throws(()=>assertOwnM7ReviewBytes(reformatted,review),/OWN_M7_REVIEW_BYTES_CHANGED/);
 const changed={...review,targets:[{statements:[sql.trimEnd()+'\n']}]};
 assert.throws(()=>assertOwnM7ReviewBytes(bytes,changed),/OWN_M7_REVIEW_BYTES_CHANGED/);
});
