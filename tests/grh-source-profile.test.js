import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getGrhSourceProfile, defaultGrhSourceProfile } from '../scripts/lib/grh-source-profile.mjs';
import { readAndVerifySources, prepareCuratedImport, importCuratedRrhh } from '../scripts/import-rrhh-neon.mjs';

const outputNames = { employees:'employees',absences:'absences',leaves:'leaves',familyMembers:'family-members',
  sectors:'sectors',categories:'categories',unions:'unions',unionMemberships:'union-memberships',agreements:'agreements',
  absenceReasons:'absence-reasons',familyRelationships:'family-relationships',jobRoles:'job-roles',organizations:'organizations',
  exitReasons:'exit-reasons',employmentStatuses:'employment-statuses' };

async function fixture(t, profileId, mutate = () => {}) {
  const profile = getGrhSourceProfile(profileId);
  const directory = await mkdtemp(path.join(tmpdir(), 'grh-profile-unit-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.match(path.basename(directory), /^grh-profile-unit-/);
    await rm(directory, { recursive:true, force:true });
  });
  const dataDir=pathToFileURL(directory+path.sep);
  const manifest={ schemaVersion:'1.0.0',profile:profile.curated.profileId,
    source:{sha256:profile.source.sha256,dumpCompletedAt:profile.source.cutoff.replace('T',' '),
      database:profile.source.database,sizeBytes:profile.source.logicalBytes},
    validation:{strictSnapshot:true,sourceCounts:Object.fromEntries(Object.entries(profile.curated.expectedCounts)
      .map(([key,expected])=>[key,{expected,actual:expected,distinctPrimaryKeys:expected,duplicatePrimaryKeyRows:0}]))},outputs:{} };
  for(const [name,count] of Object.entries(profile.curated.expectedOutputCounts)) {
    const rows=Array.from({length:count},()=>({}));
    if(name==='employees') rows[0].unionMemberships=Array.from({length:profile.curated.expectedOutputCounts.unionMemberships},()=>({}));
    const content=JSON.stringify(rows), file=`curated-${outputNames[name]}.json`;
    await writeFile(new URL(file,dataDir),content);
    manifest.outputs[name]={file,records:count,bytes:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex').toUpperCase()};
  }
  mutate(manifest);
  await writeFile(new URL('curated-manifest.json',dataDir),JSON.stringify(manifest));
  return dataDir;
}

test('closed registry resolves exact domain profiles and keeps August as default', () => {
  assert.equal(defaultGrhSourceProfile().id,'grh-junin-2026-08-06');
  const september=getGrhSourceProfile('grh-core-junin-2026-09');
  assert.equal(september.id,'grh-junin-2026-09-10');
  assert.equal(september.core.expectedCounts.legajo,2452);
  assert.equal(september.source.currentPayrollDate,'2026-09-30');
  assert.equal(september.source.latestClosedPayrollDate,'2026-08-31');
  assert.notEqual(september.source.sha256,september.source.gzipSha256);
  assert.throws(()=>{september.curated.expectedOutputCounts.employees=0;},TypeError);
  for(const id of ['latest','september','',undefined]) assert.throws(()=>getGrhSourceProfile(id),{code:'GRH_SOURCE_PROFILE_UNSUPPORTED'});
});

test('September curated source requires explicit selection and produces its own expected counts',async(t)=>{
  const dataDir=await fixture(t,'grh-junin-2026-09-10');
  await assert.rejects(readAndVerifySources(dataDir),{code:'RRHH_IMPORT_SOURCE_PROFILE_MISMATCH'});
  const source=await readAndVerifySources(dataDir,{profileId:'grh-junin-2026-09-10'});
  const prepared=prepareCuratedImport(source);
  assert.equal(prepared.expectedCounts.employees,2452);
  assert.equal(prepared.expectedCounts.family,3649);
  assert.equal(prepared.expectedCounts.absences,31702);
  assert.equal(prepared.expected.tableCounts.critical.employees,2452);
  await assert.rejects(importCuratedRrhh({client:{connect(){assert.fail('no connection');}},source}),
    {code:'RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED'});
});

test('August curated artifacts retain the existing default profile',async(t)=>{
  const dataDir=await fixture(t,'grh-junin-2026-08-06');
  assert.equal((await readAndVerifySources(dataDir)).profileId,'grh-junin-2026-08-06');
});

for(const [name,mutate,code] of [
  ['container SHA substituted for logical SQL SHA',m=>{m.source.sha256=getGrhSourceProfile(m.profile).source.gzipSha256;},'PROFILE'],
  ['changed cutoff',m=>{m.source.dumpCompletedAt='2026-09-11T15:17:30';},'PROFILE'],
  ['another database',m=>{m.source.database='another';},'PROFILE'],
  ['source drift override',m=>{m.validation.strictSnapshot=false;},'PROFILE'],
  ['changed source count',m=>{m.validation.sourceCounts.persona.actual++;},'COUNTS'],
  ['duplicate source key',m=>{m.validation.sourceCounts.legajo.duplicatePrimaryKeyRows=1;},'COUNTS'],
]) test(`closed September profile rejects ${name}`,async(t)=>{
  const dataDir=await fixture(t,'grh-junin-2026-09-10',mutate);
  await assert.rejects(readAndVerifySources(dataDir,{profileId:'grh-junin-2026-09-10'}),
    {code:`RRHH_IMPORT_SOURCE_${code}_MISMATCH`});
});
