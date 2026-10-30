import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getGrhSourceProfile,defaultGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {stableJson} from '../scripts/lib/canonical-import.mjs';
import {validateMultirunManifest,parseMultirunCandidateArgs} from '../scripts/verify-grh-multirun-candidate.mjs';
import {successorCandidateProfile,buildSuccessorDelta,sealSuccessorPackage,verifySuccessorPackage,verifyStagingSuccessorPackage,successorPackageSummary,SUCCESSOR_ENTITIES,SUCCESSOR_LIMITS} from '../scripts/lib/grh-successor-package.mjs';
import {prepareCuratedImport,importCuratedRrhh} from '../scripts/import-rrhh-neon.mjs';
import {buildFriendlySourceAggregate} from '../scripts/generate-friendly-source-aggregate.mjs';
import {executeSuccessorStage} from '../scripts/stage-grh-successor.mjs';
import {executeFinalSourceRevision,parseFinalSourceRevisionArgs} from '../scripts/prepare-grh-final-source-revision.mjs';

const ID='grh-junin-2026-10-14',CORE='grh-core-junin-2026-10-14-multirun';
const profile=()=>getGrhSourceProfile(ID,{allowCandidateRead:true});
const sha=value=>createHash('sha256').update(stableJson(value)).digest('hex');
// Aggregate source identity from the complete offline CRC/EOF/structural read.
// Preflight proof SHA256:09b8a585b9b362af6de0f07cfa1ec0b27284f26e780a99e6ed80fd5d1e64bff2.
// No private artifact, dump, nominal fixture or database is read by these tests.
const SOURCE={sha256:'3EFA61A77E5B160DFF14DBB53A3634054DBC70A284C3F5101ACD98EE9B5AECF4',
  logicalBytes:786688674,gzipSha256:'F5F11A9B1A1ACF6266F10064E30E12652F4E9FC5180EE4F7E5EB8C72348B6B64',
  gzipBytes:45315019,cutoff:'2026-10-14T15:18:17'};
const PRIOR_PINS={
  'grh-junin-2026-08-06':'bd00109d0dd8730b843873e5a4dfe03ede39fa4852805512b2a3e2a711a96a55',
  'grh-junin-2026-09-10':'9f17ef7621b3c8a519e09a198661595d855463bb7e11b39dbc2b9d815bc13810',
  'grh-junin-2026-09-22':'da09e292da977af03b7d6274b12d5d89cbbe62fbda4738ad8aa826d6a044ac60',
  'grh-junin-2026-10-01':'4849b48bc96c400a094793ab4ac0ea2ae90c6edc8920dca82dc9421b22522d88',
};
// Aggregate-only fictional manifest. Passing this stage never accepts source rows.
function manifest(){
  const p=profile();
  return {schemaVersion:2,profile:CORE,sourceProfileId:ID,profileVersion:p.profileVersion,
    source:{...structuredClone(p.source),container:'gzip',physicalSha256:p.source.gzipSha256,
      physicalBytes:p.source.gzipBytes,currentPayrollRuns:structuredClone(p.core.currentRuns)},
    sourceCounts:structuredClone(p.core.expectedCounts),reconciliation:structuredClone(p.core.expectedReconciliation),
    quality:{strictSnapshot:true,crossSourceJoinByIdPersona:0,moneySemantics:'Synthetic technical sum is never a financial KPI',
      publication:{candidateOnly:true,databaseWrites:0,v1ImporterCompatible:false,reason:'MULTIRUN_REQUIRES_VERSIONED_DATABASE_PUBLICATION'},
      payrollRunClosure:{statuses:structuredClone(p.core.expectedClosureStatusCounts),currentRun:'mixed',latestClosedDate:'2026-10-31'}}};
}
const packageSource=id=>{const p=getGrhSourceProfile(id,{allowCandidateRead:true});return {
  profileId:p.id,sourceSha256:p.source.sha256.toLowerCase(),cutoff:p.source.cutoff,
  coreManifestSha256:'b'.repeat(64),curatedManifestSha256:'c'.repeat(64),
};};
async function emptyCandidatePackage(){
  const results=[];
  for(const entity of SUCCESSOR_ENTITIES)results.push(await buildSuccessorDelta(entity,{baseline:()=>[],candidate:()=>[]}));
  return sealSuccessorPackage({baseline:packageSource('grh-junin-2026-09-10'),candidate:packageSource(ID),results});
}

test('October14 remains the exact predecessor of October28 and preserves every earlier profile and default in full',()=>{
  const registry=JSON.parse(readFileSync(new URL('../scripts/lib/grh-source-profiles.json',import.meta.url),'utf8'));
  assert.equal(registry.version,'grh-source-profiles.v1');assert.equal(defaultGrhSourceProfile().id,'grh-junin-2026-08-06');
  assert.deepEqual(registry.profiles.map(p=>p.id),[...Object.keys(PRIOR_PINS),ID,'grh-junin-2026-10-28']);
  for(const [id,pin] of Object.entries(PRIOR_PINS))assert.equal(sha(getGrhSourceProfile(id,{allowCandidateRead:true})),pin,id);
  for(const id of[ID,CORE]){
    assert.throws(()=>getGrhSourceProfile(id),{code:'GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ'});
    assert.equal(getGrhSourceProfile(id,{allowCandidateRead:true}),profile());
  }
  for(const id of['latest','grh-junin-2026-10-15','October14','',null])assert.throws(()=>getGrhSourceProfile(id,{allowCandidateRead:true}),{code:'GRH_SOURCE_PROFILE_UNSUPPORTED'});
});

test('candidate pins logical and physical bytes independently and cannot be mutated through a returned reference',()=>{
  const p=profile();assert.equal(p.publicationMode,'candidate_only');assert.equal(p.profileVersion,'3.0.0');
  for(const [field,expected] of Object.entries(SOURCE))assert.equal(p.source[field],expected,field);
  assert.notEqual(p.source.sha256,p.source.gzipSha256);assert.equal(p.source.database,'grh_junin');
  assert.throws(()=>{p.source.cutoff='2026-10-15T15:18:17';},TypeError);
  assert.throws(()=>{p.curated.expectedCounts.legajo=855;},TypeError);
  assert.throws(()=>{p.core.currentRuns[0].closureStatus='closed';},TypeError);
  assert.throws(()=>p.core.snapshotCohorts.push({}),TypeError);
  assert.doesNotThrow(()=>validateMultirunManifest(manifest(),p));
});

test('October current M/O remain open while V is closed; latest monthly close stays September',()=>{
  const p=profile();assert.equal(p.source.currentPayrollDate,'2026-10-31');assert.equal(p.source.currentPayrollClosureStatus,'mixed');
  assert.equal(p.source.latestClosedPayrollDate,'2026-10-31');assert.equal(p.source.latestClosedMonthlyPayrollDate,'2026-09-30');
  assert.deepEqual(p.core.expectedClosureStatusCounts,{closed:525,open:2,unknown:101});
  assert.deepEqual(p.core.currentRunTypes,['M','O','V']);
  assert.deepEqual(p.core.currentRuns.map(r=>[r.payrollType,r.closureStatus]),[['M','open'],['O','open'],['V','closed']]);
  assert.deepEqual(p.core.snapshotCohorts,[{period:2026,month:10,payrollType:'M',payrollDate:'2026-10-31',rows:844}]);
  assert.deepEqual(p.core.expectedReconciliation,{administrativeActive:871,liquidatedCurrent:844,activeAndLiquidated:844,activeNotLiquidated:27,liquidatedNotActive:0});
});

test('all curated and core expectations retain exact aggregate coverage without substituting the 855 adoption cohort',()=>{
  const p=profile();assert.deepEqual(p.core.expectedCounts,{calculo:4452474,concepto:294,histocal:634,histolegajo:844,legajo:2458,legamov:499656});
  assert.deepEqual(p.curated.expectedCounts,{ausencia:31819,cargo:5,catego:156,convenio:14,familia:3655,gremio:6,legagremio:845,legajo:2458,licencia:3448,motause:27,motibaja:19,organiza:83,persona:2357,revista:3,sectores:36,vinculo:9});
  assert.deepEqual(p.curated.expectedOutputCounts,{employees:2458,absences:31819,leaves:3448,familyMembers:3655,sectors:36,categories:156,unions:6,unionMemberships:845,agreements:14,absenceReasons:27,familyRelationships:9,jobRoles:5,organizations:83,exitReasons:19,employmentStatuses:3});
  assert.equal(Object.hasOwn(p,'adoption'),false);assert.equal(Object.hasOwn(p,'targetBinding'),false);
});

for(const [name,mutate] of Object.entries({
  logicalHash:m=>{m.source.sha256=m.source.physicalSha256;},physicalHash:m=>{m.source.physicalSha256=m.source.sha256;},
  logicalLength:m=>{m.source.logicalBytes++;},physicalLength:m=>{m.source.physicalBytes++;},
  cutoff:m=>{m.source.cutoff='2026-10-14T15:18:18';},database:m=>{m.source.database='another';},
  currentDate:m=>{m.source.currentPayrollDate='2026-09-30';},sourceCount:m=>{m.sourceCounts.legajo=855;},
  activeCount:m=>{m.reconciliation.administrativeActive=855;},allOctoberClosed:m=>{m.source.currentPayrollRuns[0].closureStatus='closed';},
  monthlyClose:m=>{m.source.latestClosedMonthlyPayrollDate='2026-10-31';},closureCounts:m=>{m.quality.payrollRunClosure.statuses.open=0;},
  drift:m=>{m.quality.strictSnapshot=false;},publication:m=>{m.quality.publication.databaseWrites=1;},
}))test('strict aggregate manifest rejects altered '+name,()=>{const m=manifest();mutate(m);assert.throws(()=>validateMultirunManifest(m,profile()),/^Error: V2_/);});

test('adding a read profile grants no source publication, staging or legacy import authority',async()=>{
  assert.throws(()=>prepareCuratedImport({manifest:{profile:ID}}),{code:'GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ'});
  assert.throws(()=>buildFriendlySourceAggregate({profileId:ID}),{code:'GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ'});
  let connections=0,queries=0;
  await assert.rejects(importCuratedRrhh({client:{connect(){connections++;},query(){queries++;}},source:{manifest:{profile:ID}}}),{code:'RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED'});
  assert.equal(connections,0);assert.equal(queries,0);
  assert.throws(()=>parseMultirunCandidateArgs(['private/core','--profile='+ID]),{code:'V2_USAGE'});
  assert.equal(successorCandidateProfile().id,'grh-junin-2026-09-22');
  assert.equal(successorCandidateProfile('grh-junin-2026-10-01').id,'grh-junin-2026-10-01');
});

test('October14 explicitly permits a ten-domain offline candidate without widening package limits',async()=>{
  assert.equal(successorCandidateProfile(ID),profile());
  assert.deepEqual(SUCCESSOR_LIMITS,{rowsPerEntity:1000000,changes:100000,bytes:24*1024*1024});
  const pack=await emptyCandidatePackage(),summary=successorPackageSummary(pack);
  assert.equal(verifySuccessorPackage(pack),pack);assert.equal(Object.keys(pack.entities).length,10);
  assert.equal(summary.candidate.profileId,ID);assert.equal(summary.baseline.profileId,'grh-junin-2026-09-10');
  assert.equal(summary.changeRows,0);assert.equal(summary.databaseQueries,0);assert.equal(summary.databaseWrites,0);
  assert.equal(summary.operational,false);assert.equal(summary.sourcePromoted,false);assert.equal(summary.containsPersonalRecords,false);
  for(const id of['latest','grh-junin-2026-10-15',CORE,null,42])assert.throws(()=>successorCandidateProfile(id),{code:'SUCCESSOR_CANDIDATE_PROFILE_INVALID'});
});

test('October14 retains staging refusal and requires an explicit final-review target before connecting',async()=>{
  const pack=await emptyCandidatePackage();let connections=0,queries=0;
  const connect=()=>{connections++;return {query(){queries++;}};};
  assert.throws(()=>verifyStagingSuccessorPackage(pack),{code:'SUCCESSOR_STAGE_SOURCE_NOT_SUPPORTED'});
  await assert.rejects(executeSuccessorStage({connect,prepared:pack,expectedPackageSha256:pack.payloadSha256}),{code:'SUCCESSOR_STAGE_SOURCE_NOT_SUPPORTED'});
  await assert.rejects(executeFinalSourceRevision({connect,prepared:pack,expectedPackageSha256:pack.payloadSha256}),{code:'SUCCESSOR_TARGET_INVALID'});
  assert.throws(()=>parseFinalSourceRevisionArgs(['--candidate-profile='+ID]),{code:'GRH_FINAL_REVISION_ARGUMENT'});
  assert.equal(connections,0);assert.equal(queries,0);
});
