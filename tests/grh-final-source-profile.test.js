import test from 'node:test';import assert from 'node:assert/strict';
import {getGrhSourceProfile,defaultGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {successorCandidateProfile,sealSuccessorPackage,verifySuccessorPackage,buildSuccessorDelta,SUCCESSOR_ENTITIES} from '../scripts/lib/grh-successor-package.mjs';
import {prepareSuccessorPackage} from '../scripts/lib/grh-successor-package-source.mjs';
import {validateMultirunManifest,parseMultirunCandidateArgs} from '../scripts/verify-grh-multirun-candidate.mjs';
import {prepareCuratedImport,importCuratedRrhh} from '../scripts/import-rrhh-neon.mjs';
import {buildFriendlySourceAggregate} from '../scripts/generate-friendly-source-aggregate.mjs';
import {stageSuccessorWithinTransaction} from '../scripts/lib/grh-successor-staging-load.mjs';
import {executeSuccessorStage} from '../scripts/stage-grh-successor.mjs';
import {target} from './fixtures/successor-operational-synthetic.js';
const profile=()=>getGrhSourceProfile('grh-junin-2026-10-01',{allowCandidateRead:true});
const source=id=>{const p=getGrhSourceProfile(id,{allowCandidateRead:true});return {profileId:p.id,sourceSha256:p.source.sha256.toLowerCase(),cutoff:p.source.cutoff,coreManifestSha256:'b'.repeat(64),curatedManifestSha256:'c'.repeat(64)};};
async function emptyPackage(id){const results=[];for(const entity of SUCCESSOR_ENTITIES)results.push(await buildSuccessorDelta(entity,{baseline:()=>[],candidate:()=>[]}));return sealSuccessorPackage({baseline:source('grh-junin-2026-09-10'),candidate:source(id),results});}
function manifest(){const p=profile();return {schemaVersion:2,profile:p.core.profileId,sourceProfileId:p.id,profileVersion:p.profileVersion,source:{...structuredClone(p.source),container:'gzip',physicalSha256:p.source.gzipSha256,physicalBytes:p.source.gzipBytes,currentPayrollRuns:structuredClone(p.core.currentRuns)},sourceCounts:structuredClone(p.core.expectedCounts),reconciliation:structuredClone(p.core.expectedReconciliation),quality:{strictSnapshot:true,crossSourceJoinByIdPersona:0,moneySemantics:'technical sum is never a financial KPI',publication:{candidateOnly:true,databaseWrites:0,v1ImporterCompatible:false,reason:'MULTIRUN_REQUIRES_VERSIONED_DATABASE_PUBLICATION'},payrollRunClosure:{statuses:structuredClone(p.core.expectedClosureStatusCounts),currentRun:p.source.currentPayrollClosureStatus,latestClosedDate:p.source.latestClosedPayrollDate}}};}
test('el respaldo final identifica bytes físicos/lógicos y corte exactos sin cambiar la base publicada',()=>{
 const p=profile();assert.equal(defaultGrhSourceProfile().id,'grh-junin-2026-08-06');assert.equal(p.publicationMode,'candidate_only');assert.notEqual(p.source.sha256,p.source.gzipSha256);assert.equal(p.source.cutoff,'2026-10-01T15:17:29');assert.equal(p.source.logicalBytes,783030719);assert.equal(p.source.gzipBytes,45105372);assert.equal(p.core.expectedCounts.histolegajo,842);assert.equal(p.curated.expectedCounts.legajo,2452);assert.throws(()=>{p.source.cutoff='2026-10-02';},TypeError);
});
test('el corte contiene septiembre cerrado y octubre abierto, sin inferir cierre del mes de octubre',()=>{
 const p=profile();assert.equal(p.source.currentPayrollDate,'2026-10-31');assert.equal(p.source.currentPayrollClosureStatus,'open');assert.equal(p.source.latestClosedMonthlyPayrollDate,'2026-09-30');assert.equal(p.core.snapshotCohorts[0].month,10);assert.deepEqual(p.core.currentRuns.map(r=>[r.payrollType,r.closureStatus]),[['M','open'],['O','open']]);assert.doesNotThrow(()=>validateMultirunManifest(manifest(),p));
});
for(const [name,mutate]of Object.entries({compressedAsLogical:m=>m.source.sha256=m.source.physicalSha256,wrongCut:m=>m.source.cutoff='2026-10-01T15:17:30',changedCount:m=>m.sourceCounts.histolegajo++,forcedClosed:m=>m.source.currentPayrollRuns[0].closureStatus='closed',oldMonth:m=>m.source.currentPayrollDate='2026-09-30',oldMonthlyClose:m=>m.source.latestClosedMonthlyPayrollDate='2026-08-31'}))test('el lector estricto rechaza '+name,()=>{const m=manifest();mutate(m);assert.throws(()=>validateMultirunManifest(m,profile()),/V2_/);});
test('las herramientas exigen candidato conocido explícito y conservan22/09 como opción anterior',()=>{
 assert.equal(successorCandidateProfile().id,'grh-junin-2026-09-22');assert.equal(successorCandidateProfile(profile().id).id,profile().id);
 for(const id of ['latest','grh-junin-2026-10-02','grh-junin-2026-08-06',null,42])assert.throws(()=>successorCandidateProfile(id),{code:'SUCCESSOR_CANDIDATE_PROFILE_INVALID'});
});
test('perfil final no habilita escritores anteriores ni agregados públicos',async()=>{
 const p=profile();assert.throws(()=>getGrhSourceProfile(p.id),/GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ/);assert.throws(()=>prepareCuratedImport({manifest:{profile:p.id}}),/GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ/);assert.throws(()=>buildFriendlySourceAggregate({profileId:p.id}),/GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ/);
 let connects=0;await assert.rejects(importCuratedRrhh({client:{connect(){connects++;}},source:{manifest:{profile:p.id}}}),{code:'RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED'});assert.equal(connects,0);
});
test('rechaza selector desconocido antes de leer directorios',async()=>{
 await assert.rejects(prepareSuccessorPackage({baselineCore:process.cwd(),candidateCore:process.cwd(),baselineCurated:process.cwd(),candidateCurated:process.cwd(),candidateProfileId:'latest'}),{code:'SUCCESSOR_CANDIDATE_PROFILE_INVALID'});
});
test('la CLI conserva el comando anterior y exige selección explícita del respaldo final',()=>{
 assert.deepEqual(parseMultirunCandidateArgs(['private/core']),{dataDir:'private/core',profileId:'grh-junin-2026-09-22'});
 assert.deepEqual(parseMultirunCandidateArgs(['private/core','--profile=grh-junin-2026-10-01']),{dataDir:'private/core',profileId:profile().id});
 assert.deepEqual(parseMultirunCandidateArgs(['--profile',profile().id,'private/core']),{dataDir:'private/core',profileId:profile().id});
 for(const args of [[],['a','b'],['a','--profile=latest'],['a','--profile=grh-junin-2026-09-10'],['a','--profile'],['a','--allow-source-drift'],['a','--fixture']])assert.throws(()=>parseMultirunCandidateArgs(args),{code:'V2_USAGE'});
});
test('paquete final completo es verificable sin convertirlo en una operación',async()=>{
 for(const id of ['grh-junin-2026-09-22',profile().id]){const pack=await emptyPackage(id);assert.equal(verifySuccessorPackage(pack),pack);assert.equal(Object.keys(pack.entities).length,10);assert.equal(pack.operational,false);assert.equal(pack.sourcePromoted,false);}
});
test('staging anterior rechaza perfil final antes de consultar o escribir SQL',async()=>{
 const pack=await emptyPackage(profile().id);let queries=0;
 await assert.rejects(stageSuccessorWithinTransaction({client:{query(){queries++;}},prepared:pack,target,expectedPackageSha256:pack.payloadSha256}),{code:'SUCCESSOR_STAGE_SOURCE_NOT_SUPPORTED'});assert.equal(queries,0);
});
test('el ejecutor de staging rechaza01/10 antes de abrir una conexión',async()=>{
 const pack=await emptyPackage(profile().id);let connections=0;
 await assert.rejects(executeSuccessorStage({connect(){connections++;},prepared:pack,target,expectedPackageSha256:pack.payloadSha256}),{code:'SUCCESSOR_STAGE_SOURCE_NOT_SUPPORTED'});assert.equal(connections,0);
});
