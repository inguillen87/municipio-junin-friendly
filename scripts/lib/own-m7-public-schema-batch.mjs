// Public institutional batch for the M7 schema tail that the existing builders
// already close from sources. Pure planning: no connection, SQL execution,
// business command, QA seed, actor, capability seed or inverse relocation.
// Order fixed by the source map:192→193→194→196→197→200. Stages that need the
// QA foundation (201,213-215) or a live admission (208/209) are NOT composed here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';
import {MONTHLY193_PREREQUISITES,buildOwnMonthlyDayDeclarationInstallation,assertOwnMonthlyDayDeclarationDurability} from './own-monthly-day-declaration-installation.mjs';
import {buildMonthlyDayPolicyInstallation} from './own-monthly-day-policy-installation.mjs';
import {assertMonthlyDayInstallationDurability} from './own-monthly-day-policy-qa.mjs';
import {buildOwnMonthlyDayEngineSourceInstallation,assertOwnMonthlyDayEngineSourceDurability} from './own-monthly-day-engine-source-installation.mjs';
import {buildMonthlyDayFixedCompositionInstallation,assertMonthlyDayFixedCompositionDurability} from './own-monthly-day-fixed-composition-installation.mjs';
import {buildOwnNoveltySuccessionInstallation,assertOwnNoveltySuccessionDurability} from './own-novelty-succession-installation.mjs';
import {buildOwnReportCensusInstallation,assertOwnReportCensusDurability,OWN_REPORT_CENSUS_SIGNATURE} from './own-payroll-report-census-installation.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from '../prepare-own-payroll-installation.mjs';

export const OWN_M7_PUBLIC_BATCH_VERSION='own-m7-public-schema-batch.v1';
export const OWN_M7_STAGE_IDS=Object.freeze(['policy192','declaration193','engine194','fixed196','novelty197','census200']);
export const OWN_M7_REHEARSAL_CODE='OWN_M7_REHEARSAL_ROLLBACK';
export const OWN_M7_RUNTIME_ROLE='municontrol_actions_runtime_app';
// Public lineage of the eight193 prerequisites: last source that defines each one.
// native_salary_administrative_context_v1 is JS-held by its own institutional installer.
export const OWN_M7_PREREQUISITE_SOURCES=Object.freeze([
 'scripts/migrations/007-action-center-read-facades.sql',
 'scripts/migrations/112-native-salary-definitions.sql',
 'scripts/migrations/122-own-payroll-programs.sql',
 'scripts/migrations/157-own-period-participation.sql'
]);
const hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>String(v).replace(/\r\n?/g,'\n');
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const definitionsOf=sql=>splitPostgresStatements(sql).map(clean).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION /.test(s));
const prerequisiteName=d=>{const m=/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?([a-z0-9_]+)\(/.exec(d);return m?m[1]:null;};
// GRANT/REVOKE statements of the same sources decide runtime membership; the
// signature list is split at ')' boundaries and whitespace-normalised. Unqualified
// names (007) resolve to public, like the builders' own regex does.
const aclSignatures=list=>list.replace(/\s+/g,' ').split(/\)\s*,\s*/).map((part,i,all)=>(i<all.length-1?part+')':part).trim()).map(s=>s.replace(/\s*\(\s*/,'(').replace(/\s*\)\s*$/,')').replace(/\s*,\s*/g,',')).map(s=>/^[a-z_][a-z0-9_]*\./i.test(s)?s:'public.'+s);
export const OWN_M7_ADMINISTRATIVE_SOURCE='scripts/lib/salary-administrative-identity-installation.mjs';
export function publicPrerequisiteAclEvidence(sources,origins=sources.map((_,i)=>'source['+i+']')){
 const evidence=new Map();assert.equal(sources.length,origins.length);
 for(let index=0;index<sources.length;index++)for(const statement of splitPostgresStatements(sources[index]).map(clean)){
  const sql=statement.replace(/;\s*$/,'');
  if(!/^(?:GRANT|REVOKE)\b/.test(sql)||!sql.includes(' ON FUNCTION '))continue;
  const m=/^(GRANT EXECUTE|REVOKE ALL(?: PRIVILEGES)?) ON FUNCTION ([\s\S]+?) (?:TO|FROM) ([a-zA-Z_,\s]+)$/.exec(sql);
  assert.ok(m,'OWN_M7_ACL_STATEMENT_SOURCE_PENDING');
  const roles=m[3].split(',').map(s=>s.trim());
  for(const signature of aclSignatures(m[2])){
   const row=evidence.get(signature)??{};
   for(const role of roles)if(role==='PUBLIC'||role===OWN_M7_RUNTIME_ROLE)row[role]={granted:m[1]==='GRANT EXECUTE',source:origins[index],statement:sql};
   evidence.set(signature,row);
  }
 }
 return evidence;
}
export function publicPrerequisiteRuntime(sources){
 return new Set([...publicPrerequisiteAclEvidence(sources)].filter(([,row])=>row[OWN_M7_RUNTIME_ROLE]?.granted===true).map(([signature])=>signature));
}
export function publicPrerequisiteDefinitions(read){
 const sources=OWN_M7_PREREQUISITE_SOURCES.map(file=>lf(read(file)));
 const administrative=lf(read(OWN_M7_ADMINISTRATIVE_SOURCE));
 // Read the actual mutation literal from its pinned institutional source.
 // No invented REVOKE or absent grant is treated as evidence of owner-only ACL.
 const declarations=[...administrative.matchAll(/const mutations=\[SALARY_ADMINISTRATIVE_CONTEXT,'([^']+)',\.\.\.changed\];/g)];
 assert.equal(declarations.length,1,'OWN_M7_ADMINISTRATIVE_ACL_SOURCE_PENDING');
 const adminAcl=declarations[0][1];
 assert.equal(adminAcl,'REVOKE ALL ON FUNCTION public.native_salary_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app','OWN_M7_ADMINISTRATIVE_ACL_SOURCE_PENDING');
 const wanted=new Set(MONTHLY193_PREREQUISITES),found=new Map();
 for(const d of [...sources.flatMap(definitionsOf),clean(SALARY_ADMINISTRATIVE_CONTEXT)]){
  const name=prerequisiteName(d);if(!name||!wanted.has(name))continue;
  const previous=found.get(name);if(previous)assert.deepEqual(ownInstallationFunctionPin(previous),ownInstallationFunctionPin(d),'OWN_M7_AMBIGUOUS_PREREQUISITE:'+name);else found.set(name,d);
 }
 assert.deepEqual([...found.keys()].sort(),[...MONTHLY193_PREREQUISITES].sort(),'OWN_M7_PREREQUISITE_SOURCE_MISSING');
 const evidence=publicPrerequisiteAclEvidence([...sources,adminAcl],[...OWN_M7_PREREQUISITE_SOURCES,OWN_M7_ADMINISTRATIVE_SOURCE]);
 const prerequisiteDefinitions=Object.freeze([...found.values()]),prerequisiteRuntime=[],aclEvidence=[];
 for(const definition of prerequisiteDefinitions){
  const signature=ownInstallationFunctionPin(definition).signature,row=evidence.get(signature);
  assert.equal(typeof row?.PUBLIC?.granted,'boolean','OWN_M7_PUBLIC_ACL_SOURCE_PENDING:'+signature);
  assert.equal(row.PUBLIC.granted,false,'OWN_M7_PUBLIC_EXECUTE_SOURCE_PENDING:'+signature);
  assert.equal(typeof row?.[OWN_M7_RUNTIME_ROLE]?.granted,'boolean','OWN_M7_RUNTIME_ACL_SOURCE_PENDING:'+signature);
  if(row[OWN_M7_RUNTIME_ROLE].granted)prerequisiteRuntime.push(signature);
  aclEvidence.push({signature,public:row.PUBLIC,runtime:row[OWN_M7_RUNTIME_ROLE]});
 }
 return Object.freeze({prerequisiteDefinitions,prerequisiteRuntime:Object.freeze(prerequisiteRuntime),aclEvidence:Object.freeze(aclEvidence),
  sourceHashes:Object.freeze({...Object.fromEntries(OWN_M7_PREREQUISITE_SOURCES.map((file,i)=>[file,hash(sources[i])])),[OWN_M7_ADMINISTRATIVE_SOURCE]:hash(administrative)})});
}

// Six finite source-contract extractions, not a general JavaScript parser.
// Whole-source reviewed pins reject any grammar/body drift before planning.
// The existing durability asserters remain byte-identical and are called last.
const OWN_M7_ASSERT_SOURCE=Object.freeze({
 policy192:['scripts/lib/own-monthly-day-policy-qa.mjs','assertMonthlyDayInstallationDurability','f3f0634b734cba71fd516410fd6d8637e6bf743493ff786a1f3699822e55a5bb'],
 declaration193:['scripts/lib/own-monthly-day-declaration-installation.mjs','assertOwnMonthlyDayDeclarationDurability','f916ef4687638fdd565e5f02cba25178beedbe8ce234418ea650c0728829d680'],
 engine194:['scripts/lib/own-monthly-day-engine-source-installation.mjs','assertOwnMonthlyDayEngineSourceDurability','1c0194f1321c6297b5fcea011ccc3a077a7c670a53469ae401fefc26cc13afb9'],
 fixed196:['scripts/lib/own-monthly-day-fixed-composition-installation.mjs','assertMonthlyDayFixedCompositionDurability','cb5811ef8e7614c3dfc05ff4e9de16e05abb64a1c013a30000f3ec16405771de'],
 novelty197:['scripts/lib/own-novelty-succession-installation.mjs','assertOwnNoveltySuccessionDurability','627ffea8e252311f31b87abe46346bd76578e583de34b606a74aa53eacb494d0'],
 census200:['scripts/lib/own-payroll-report-census-installation.mjs','assertOwnReportCensusDurability','120667a2488524cfa226fbf3620adf94bd980be62404e5b3ae08dcd6f4338f2f']
});
const contractWords=literal=>[...literal.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map(m=>m[1]);
export function ownM7SourcePhaseContract(stageId,read,stageBatch){
 const sourceEntry=OWN_M7_ASSERT_SOURCE[stageId];assert.ok(sourceEntry,'OWN_M7_UNKNOWN_STAGE');
 const [file,name,reviewedSha256]=sourceEntry,source=lf(read(file)),anchor='export function '+name+'(',at=source.indexOf(anchor);assert.equal(hash(source),reviewedSha256,'OWN_M7_ASSERT_REVIEWED_SOURCE_CHANGED:'+stageId);
 assert.ok(at>=0&&source.indexOf(anchor,at+anchor.length)<0,'OWN_M7_ASSERT_SOURCE_PENDING');const code=source.slice(at);
 let counters=[...source.matchAll(/const (?:counts|counters)=\{([^{}]*)\}/g)];
 if(!counters.length)counters=[...code.matchAll(/Object\.entries\(\{([^{}]*)\}\)/g)];
 assert.equal(counters.length,1,'OWN_M7_ASSERT_COUNTER_SOURCE_PENDING:'+stageId);
 const counts={};for(const entry of counters[0][1].split(',')){const m=/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*(\d+)\s*$/.exec(entry);assert.ok(m,'OWN_M7_ASSERT_LITERAL_COUNTER_PENDING');assert.equal(Object.hasOwn(counts,m[1]),false);counts[m[1]]=Number(m[2]);}
 if(stageBatch.counters)assert.deepEqual(counts,stageBatch.counters,'OWN_M7_ASSERT_BATCH_COUNTER_DRIFT');
 const hashLoops=[...code.matchAll(/for\s*\(\s*const\s+\w+\s+of\s*(\[[^\]]*\])\s*\)\s*assert\.match\(/g)];assert.equal(hashLoops.length,1,'OWN_M7_ASSERT_HASH_SOURCE_PENDING:'+stageId);
 const hashes=contractWords(hashLoops[0][1]);assert.ok(hashes.length>=2&&hashes.includes('preservationSha256'));
 const equal=new Set([...code.matchAll(/assert\.equal\(\s*\w+\.(\w+)\s*,\s*installed\.\1\s*\)/g)].map(m=>m[1]));
 for(const m of code.matchAll(/for\s*\(\s*const\s+(\w+)\s+of\s*(\[[^\]]*\])\s*\)\s*assert\.equal\(\s*\w+\[\1\]\s*,\s*installed\[\1\]/g))for(const key of contractWords(m[2]))equal.add(key);
 for(const m of code.matchAll(/for\s*\(\s*const\s+(\w+)\s+of\s*(\[[^\]]*\])\s*\)\s*assert\.equal\(\s*installed\[\1\]\s*,\s*durable\[\1\]/g))for(const key of contractWords(m[2]))equal.add(key);
 assert.ok(equal.size>=2,'OWN_M7_ASSERT_EQUALITY_SOURCE_PENDING:'+stageId);
 const fields=/(?:const (?:fields|keys)|,keys)=\[([\s\S]*?)\]\.sort\(\);/.exec(code),exactKeys=fields?[...new Set([...contractWords(fields[1]),...Object.keys(counts)])]:null;
 const sqlHash=/\.sqlSha256\b/.test(code),baseline=/\.operationalPairBaseline\b/.test(code),preserved=code.includes('transactionDataPreserved'),census=stageId==='census200';
 if(preserved){const compact=code.replace(/\s+/g,'');for(const triple of["[installed,'install',true]","[durable,'verify',false]","[repeated,'verify',true]"])assert.ok(compact.includes(triple),'OWN_M7_ASSERT_PHASE_SOURCE_PENDING');}
 assert.equal(preserved,!census,'OWN_M7_ASSERT_PHASE_KIND_PENDING');
 return Object.freeze({stageId,source:file,sourceSha256:hash(source),asserter:name,counts,hashes,equal:[...equal],exactKeys,sqlHash,baseline,preserved,census});
}
export function assertOwnM7StageProof(stageId,{phase,receipt,batch,installed,contract}){
 assert.equal(contract?.stageId,stageId,'OWN_M7_PHASE_SOURCE_CONTRACT_REQUIRED');
 assert.ok(['installation','durable','repetition'].includes(phase),'OWN_M7_UNKNOWN_PROOF_PHASE');
 assert.ok(receipt&&typeof receipt==='object'&&!Array.isArray(receipt),'OWN_M7_PROOF_REQUIRED');
 assert.equal(receipt.version,batch.version);assert.equal(receipt.sourceCommit,batch.sourceCommit);assert.equal(receipt.mode,phase==='installation'?'install':'verify');
 if(contract.sqlHash)assert.equal(receipt.sqlSha256,batch.sqlSha256);else assert.deepEqual(receipt.sourceHashes,batch.sourceHashes);
 if(contract.baseline)assert.equal(receipt.operationalPairBaseline,batch.operationalPairBaseline);
 for(const[key,value]of Object.entries(contract.counts))assert.equal(receipt[key],value,key);
 for(const key of contract.hashes)assert.match(receipt[key],/^[a-f0-9]{64}$/);
 if(contract.census){assert.notEqual(phase,'repetition');assert.ok(Number.isSafeInteger(receipt.eventRows)&&receipt.eventRows>=0);if(phase==='installation')assert.equal(receipt.beforeFingerprint,receipt.preservationSha256);}
 else assert.equal(receipt.transactionDataPreserved,phase!=='durable');
 if(contract.exactKeys)assert.deepEqual(Reflect.ownKeys(receipt).sort(),[...contract.exactKeys].sort(),'OWN_M7_PHASE_PROOF_SHAPE_CHANGED');
 if(phase!=='installation'){assert.ok(installed,'OWN_M7_REAL_INSTALL_RECEIPT_REQUIRED');for(const key of contract.equal)assert.equal(receipt[key],installed[key],key);}
 return{phaseValidated:true,stage:stageId,phase};
}
export function isOwnM7RehearsalRollback(error,code=OWN_M7_REHEARSAL_CODE){
 return error!==null&&typeof error==='object'&&error.code==='P0001'&&error.message===code;
}

const readOnlyGuard=`DO $m7_public_readonly$ BEGIN IF current_setting('transaction_read_only')<>'on' OR current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWN_M7_READONLY_REQUIRED';END IF;END $m7_public_readonly$`;
const rehearsalFault=`DO $m7_public_rehearsal$ BEGIN RAISE EXCEPTION '${OWN_M7_REHEARSAL_CODE}';END $m7_public_rehearsal$`;
const censusAbsent=`DO $m7_census_absent$ BEGIN IF to_regprocedure('${OWN_REPORT_CENSUS_SIGNATURE}') IS NOT NULL THEN RAISE EXCEPTION 'OWN_M7_CENSUS_ALREADY_PRESENT';END IF;END $m7_census_absent$`;
const frozenList=v=>Object.freeze(v.map(s=>{assert.equal(typeof s,'string');return s;}));

export function composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.ok(['pre107','published107'].includes(operationalPairBaseline),'OWN_M7_EXPLICIT_BASELINE_REQUIRED');
 const prerequisites=publicPrerequisiteDefinitions(read);
 const shared={read,sourceCommit,operationalPairBaseline,prerequisiteDefinitions:[...prerequisites.prerequisiteDefinitions],prerequisiteRuntime:[...prerequisites.prerequisiteRuntime]};
 const policy192=buildMonthlyDayPolicyInstallation({read,sourceCommit,operationalPairBaseline});
 const declaration193=buildOwnMonthlyDayDeclarationInstallation({read,sourceCommit,prerequisiteDefinitions:shared.prerequisiteDefinitions,prerequisiteRuntime:shared.prerequisiteRuntime});
 const engine194=buildOwnMonthlyDayEngineSourceInstallation(shared);
 const fixed196=buildMonthlyDayFixedCompositionInstallation(shared);
 const novelty197=buildOwnNoveltySuccessionInstallation(shared);
 const census200=buildOwnReportCensusInstallation({read,sourceCommit});
 // Each top builder recomposes its ancestors internally. The separately built
 // stage batches must be byte-identical to those internal compositions, so the
 // installed predecessor is exactly what the successor expects.
 assert.equal(engine194.previous.afterCheck,policy192.afterCheck,'OWN_M7_192_COMPOSITION_DRIFT');
 assert.equal(engine194.declaration.afterCheck,declaration193.afterCheck,'OWN_M7_193_COMPOSITION_DRIFT');
 assert.equal(fixed196.days.afterCheck,engine194.afterCheck,'OWN_M7_194_COMPOSITION_DRIFT');
 assert.equal(novelty197.previous.afterCheck,fixed196.afterCheck,'OWN_M7_196_COMPOSITION_DRIFT');
 assert.deepEqual(declaration193.prerequisitePins,engine194.declaration.prerequisitePins,'OWN_M7_PREREQUISITE_PINS_DRIFT');
 const stages=[
  {id:'policy192',version:policy192.version,batch:policy192,preflight:[policy192.beforeCheck],rehearsal:policy192.rehearsal,installation:policy192.installation,repetition:policy192.repetition,verification:policy192.verification,durability:'assertMonthlyDayInstallationDurability'},
  {id:'declaration193',version:declaration193.version,batch:declaration193,preflight:[policy192.afterCheck,declaration193.beforeCheck],rehearsal:[policy192.afterCheck,...declaration193.rehearsal],installation:[policy192.afterCheck,...declaration193.installation],repetition:declaration193.repetition,verification:declaration193.verification,durability:'assertOwnMonthlyDayDeclarationDurability'},
  {id:'engine194',version:engine194.version,batch:engine194,preflight:[engine194.beforeCheck],rehearsal:engine194.rehearsal,installation:engine194.installation,repetition:engine194.repetition,verification:engine194.verification,durability:'assertOwnMonthlyDayEngineSourceDurability'},
  {id:'fixed196',version:fixed196.version,batch:fixed196,preflight:[fixed196.beforeCheck],rehearsal:fixed196.rehearsal,installation:fixed196.installation,repetition:fixed196.repetition,verification:fixed196.verification,durability:'assertMonthlyDayFixedCompositionDurability'},
  {id:'novelty197',version:novelty197.version,batch:novelty197,preflight:[novelty197.beforeCheck],rehearsal:novelty197.rehearsal,installation:novelty197.installation,repetition:novelty197.repetition,verification:novelty197.verification,durability:'assertOwnNoveltySuccessionDurability'},
  {id:'census200',version:census200.version,batch:census200,preflight:[novelty197.afterCheck,census200.contextCheck,census200.prerequisiteCheck,censusAbsent],rehearsal:[novelty197.afterCheck,...census200.statements],installation:[novelty197.afterCheck,...census200.statements],repetition:null,verification:census200.verification,durability:'assertOwnReportCensusDurability'}
 ];
 assert.deepEqual(stages.map(s=>s.id),[...OWN_M7_STAGE_IDS]);
 const phaseContracts=Object.fromEntries(stages.map(stage=>[stage.id,ownM7SourcePhaseContract(stage.id,read,stage.batch)]));
 const sourceHashes={...prerequisites.sourceHashes};
 for(const contract of Object.values(phaseContracts)){if(Object.hasOwn(sourceHashes,contract.source))assert.equal(sourceHashes[contract.source],contract.sourceSha256,'OWN_M7_PHASE_SOURCE_HASH_CONFLICT');sourceHashes[contract.source]=contract.sourceSha256;}
 for(const stage of stages)for(const [file,digest] of Object.entries(stage.batch.sourceHashes??{})){if(Object.hasOwn(sourceHashes,file))assert.equal(sourceHashes[file],digest,'OWN_M7_SOURCE_HASH_CONFLICT:'+file);sourceHashes[file]=digest;}
 const targets=OWN_RELEASE_TARGETS.map(t=>Object.freeze({...t,stages:Object.freeze(stages.map(stage=>Object.freeze({
  id:stage.id,version:stage.version,durability:stage.durability,
  preflight:frozenList(['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),readOnlyGuard,...stage.preflight]),
  rehearsal:frozenList([...ownInstallationSettings,ownInstallationDestination(t),...stage.rehearsal,rehearsalFault]),
  installation:frozenList([...ownInstallationSettings,ownInstallationDestination(t),...stage.installation]),
  durableVerification:frozenList(['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...stage.verification]),
  repetition:stage.repetition?frozenList([...ownInstallationSettings,ownInstallationDestination(t),...stage.repetition]):null
 })))}));
 return Object.freeze({version:OWN_M7_PUBLIC_BATCH_VERSION,sourceCommit,operationalPairBaseline,sourceHashes:Object.freeze(sourceHashes),
  prerequisitePins:Object.freeze(declaration193.prerequisitePins),prerequisiteRuntime:prerequisites.prerequisiteRuntime,prerequisiteAclEvidence:prerequisites.aclEvidence,phaseContracts:Object.freeze(phaseContracts),
  stageOrder:[...OWN_M7_STAGE_IDS],rehearsalCode:OWN_M7_REHEARSAL_CODE,
  counts:Object.freeze({policy192:{newFunctions:2,adaptedFunctions:4},declaration193:{newTables:1,newFunctions:12,runtimeFacades:4},engine194:{adaptedFunctions:4},fixed196:{newFunctions:3,adaptedFunctions:6},novelty197:novelty197.counters,census200:{newFunctions:1,runtimeFacades:1}}),
  stageBatches:Object.freeze(Object.fromEntries(stages.map(s=>[s.id,s.batch]))),
  targets,notComposed:Object.freeze(['201','213','214','215','208','209','195']),
  connects:false,executesSql:false,businessOperations:0,roleAssignmentsAdded:0,capabilityDefinitionsAdded:0,qaSeedCopied:false,inverseRelocation:false});
}
// Durability dispatch: the stage's own exported asserter over the three receipts
// (installed, durable RO, repeated RR/RW in verify mode); census200 has no repetition.
export function assertOwnM7StageDurability(stageId,{installed,durable,repeated,batch}){
 const asserters={assertMonthlyDayInstallationDurability,assertOwnMonthlyDayDeclarationDurability,assertOwnMonthlyDayEngineSourceDurability,assertMonthlyDayFixedCompositionDurability,assertOwnNoveltySuccessionDurability,assertOwnReportCensusDurability};
 const name={policy192:'assertMonthlyDayInstallationDurability',declaration193:'assertOwnMonthlyDayDeclarationDurability',engine194:'assertOwnMonthlyDayEngineSourceDurability',fixed196:'assertMonthlyDayFixedCompositionDurability',novelty197:'assertOwnNoveltySuccessionDurability',census200:'assertOwnReportCensusDurability'}[stageId];
 assert.ok(name,'OWN_M7_UNKNOWN_STAGE:'+stageId);
 if(stageId==='census200'){assert.equal(repeated,undefined);return asserters[name]({installed,durable,batch});}
 assert.ok(repeated,'OWN_M7_REPETITION_RECEIPT_REQUIRED:'+stageId);return asserters[name]({installed,durable,repeated,batch});
}
