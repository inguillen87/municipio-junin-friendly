import test from 'node:test';
import assert from 'node:assert/strict';
import {getGrhSourceProfile,defaultGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {validateMultirunManifest,runIdentity} from '../scripts/verify-grh-multirun-candidate.mjs';
const p=getGrhSourceProfile('grh-junin-2026-09-22', { allowCandidateRead: true });
const fixture=()=>({schemaVersion:2,profile:p.core.profileId,sourceProfileId:p.id,profileVersion:p.profileVersion,
 source:{...structuredClone(p.source),container:'gzip',physicalSha256:p.source.gzipSha256,physicalBytes:p.source.gzipBytes,currentPayrollRuns:structuredClone(p.core.currentRuns)},
 sourceCounts:structuredClone(p.core.expectedCounts),reconciliation:structuredClone(p.core.expectedReconciliation),
 quality:{strictSnapshot:true,crossSourceJoinByIdPersona:0,moneySemantics:'technicalSourceAmountSum is never a financial KPI',
 publication:{candidateOnly:true,databaseWrites:0,v1ImporterCompatible:false,reason:'MULTIRUN_REQUIRES_VERSIONED_DATABASE_PUBLICATION'},
 payrollRunClosure:{statuses:structuredClone(p.core.expectedClosureStatusCounts),currentRun:p.source.currentPayrollClosureStatus,latestClosedDate:p.source.latestClosedPayrollDate}}});
test('v2 evidence is explicit and the default published baseline is unchanged',()=>{
 assert.equal(defaultGrhSourceProfile().id,'grh-junin-2026-08-06');assert.equal(p.publicationMode,'candidate_only');
 assert.doesNotThrow(()=>validateMultirunManifest(fixture(),p));assert.equal(p.core.expectedCounts.histolegajo,850);assert.equal(p.core.expectedReconciliation.liquidatedCurrent,849);
});
for(const [name,mutate] of Object.entries({
 schema:m=>m.schemaVersion=1,hash:m=>m.source.sha256='0'.repeat(64),count:m=>m.sourceCounts.histolegajo=849,
 scope:m=>m.quality.publication.candidateOnly=false,strict:m=>m.quality.strictSnapshot=false,
 close:m=>m.source.currentPayrollRuns[0].closureStatus='closed',monthly:m=>m.source.latestClosedMonthlyPayrollDate='2026-09-30',
 container:m=>m.source.physicalBytes++,contract:m=>m.reconciliation.liquidatedCurrent=850
}))test('reject altered '+name,()=>{const m=fixture();mutate(m);assert.throws(()=>validateMultirunManifest(m,p),/V2_/)});
test('run identity includes company, source period, month, type and date without normalization',()=>{
 const k=runIdentity({companyCode:'101',payrollDate:'2026-09-30',period:26,month:8,payrollType:'M'});
 assert.equal(k.period,26);assert.equal(k.month,8);assert.throws(()=>runIdentity({...k,payrollDate:'2026-02-30'}),/V2_DATE_INVALID/);
});

// Knowing a new source must not accidentally enable legacy writers or public aggregates.
import {prepareCuratedImport} from '../scripts/import-rrhh-neon.mjs';
import {buildFriendlySourceAggregate} from '../scripts/generate-friendly-source-aggregate.mjs';
test('a candidate-only profile cannot enter the legacy curated writer',()=>assert.throws(()=>prepareCuratedImport({manifest:{profile:p.curated.profileId}}),/GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ/));
test('a candidate-only profile cannot enter the legacy public aggregate projection',()=>assert.throws(()=>buildFriendlySourceAggregate({profileId:p.id}),/GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ/));

test('all ordinary profile consumers reject a candidate without explicit read-only opt-in',()=>{assert.throws(()=>getGrhSourceProfile(p.id),/GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ/);assert.throws(()=>getGrhSourceProfile(p.id,{allowCandidateRead:'true'}),/GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ/);});
