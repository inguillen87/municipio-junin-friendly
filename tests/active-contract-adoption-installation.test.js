import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildActiveContractAdoptionInstallation} from '../scripts/lib/active-contract-adoption-installation.mjs';
import {prepareActiveContractAdoption} from '../scripts/prepare-active-contract-adoption.mjs';
const options={read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit:'a'.repeat(40)};
test('preparation only generates reviewable SQL for the two existing destinations',()=>{
 const b=prepareActiveContractAdoption(options);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.deepEqual(b.targets.map(t=>[t.projectId,t.major]),[['noisy-poetry-54471701',17],['wild-cake-87689498',18]]);
 for(const t of b.targets)for(const phase of ['preflight','installation','verification'])assert.ok(t[phase].some(s=>s.includes('OWN_INSTALL_DESTINATION_MISMATCH')&&s.includes(t.projectId)&&s.includes(t.branchId)));
});
test('active schema increment has exactly three new functions, seven body changes and no business operation',()=>{
 const b=buildActiveContractAdoptionInstallation(options);assert.equal(b.newPins.length,3);assert.equal(b.afterPins.length,7);assert.equal(b.newPins.filter(p=>p.runtime).length,1);
 assert.deepEqual(b.newPins.filter(p=>p.runtime).map(p=>p.name),['employment_adoption_active_bootstrap_v1']);
 b.beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...b.afterPins[n],sha256:null}));
 assert.match(b.proof,/'newTables',0/);assert.match(b.proof,/'businessOperations',0/);
 assert.doesNotMatch(b.migration.join('\n'),/CREATE TABLE|ALTER ROLE|DISABLE TRIGGER|DROP TRIGGER|session_replication_role/);
});
test('the full final source is verified before active projection and no date or page truncates it',()=>{
 const b=buildActiveContractAdoptionInstallation(options),d=b.newDefinitions[0];
 assert.match(d,/employment_adoption_final_source_v1/);assert.match(d,/active_total\+archived_total/);assert.match(d,/'sourceRowNumber'/);
 assert.match(d,/NOT IN\('active','inactive'\)/);assert.doesNotMatch(d,/LIMIT|startDate.*>|interval|OFFSET/i);
 for(const s of [b.initial,b.afterCheck,b.afterDefinitions.at(-1)])assert.match(s,/FINAL_ADOPTION_SOURCE_METADATA/);
 assert.match(b.afterDefinitions.at(-1),/ACTIVE_ADOPTION_NEW_METADATA/);
});
test('old proposal replay occurs before new source reconstruction and both final scopes remain explicit',()=>{
 const b=buildActiveContractAdoptionInstallation(options),p=b.afterDefinitions[0];
 assert.ok(p.indexOf('IF FOUND THEN')<p.indexOf('raw:=CASE'));
 assert.match(p,/employment-adoption-input.v4.*employment_adoption_active_source_v1/);assert.match(p,/employment-adoption-input.v3.*employment_adoption_final_source_v1/);
 assert.match(p,/body_value-ARRAY\['version','finalSource','cohort'\]/);
 assert.match(b.afterDefinitions[2],/candidate->>'status' IS DISTINCT FROM 'active'/);
 assert.match(b.afterDefinitions[5],/ARRAY\['finalRevision','operationalCohort'\]/);
});
