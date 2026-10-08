import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildActiveAdoptionSerializationInstallation} from '../scripts/lib/active-adoption-serialization-installation.mjs';
import {prepareActiveAdoptionSerialization} from '../scripts/prepare-active-adoption-serialization.mjs';
const options={read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit:'a'.repeat(40)};
test('canonical serialization only changes adoption hashing without replacing salary definitions or data',()=>{
 const b=buildActiveAdoptionSerializationInstallation(options);assert.equal(b.newPins.length,1);assert.equal(b.afterPins.length,3);assert.equal(b.newPins[0].runtime,false);
 b.beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...b.afterPins[n],sha256:null}));
 assert.deepEqual(b.afterPins.map(p=>p.name),['employment_adoption_hash_v1','employment_adoption_final_rows_v1','municipal_adoption_ready_v1']);
 assert.doesNotMatch(b.migration.join('\n'),/CREATE TABLE|ALTER TABLE|CREATE OR REPLACE FUNCTION public.native_salary_|ALTER ROLE|DISABLE TRIGGER|session_replication_role/);
 assert.match(b.newDefinitions[0],/ORDER BY k COLLATE "C"/);assert.match(b.newDefinitions[0],/ORDER BY n/);assert.match(b.newDefinitions[0],/ELSE RETURN v::text/);
 assert.match(b.initial,/ADOPTION_SERIALIZATION_BEFORE_METADATA/);assert.match(b.initial,/ADOPTION_SERIALIZATION_AFTER_METADATA/);assert.match(b.afterDefinitions.at(-1),/ADOPTION_SERIALIZATION_NEW_METADATA/);
 assert.match(b.afterDefinitions[1],/contracts_grouped AS MATERIALIZED/);assert.match(b.afterDefinitions[1],/coalesce\(ec.n,0\) AS contract_count/);assert.match(b.afterDefinitions[1],/coalesce\(cr.n,0\) AS core_count/);
});
test('exact serialization batch only prepares the two existing guarded destinations',()=>{
 const b=prepareActiveAdoptionSerialization(options);assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.targets.length,2);
 for(const t of b.targets){assert.equal(t.preflight[0],'SET TRANSACTION READ ONLY');assert.equal(t.verification[0],'SET TRANSACTION READ ONLY');assert.ok(t.installation.some(s=>s.includes('pg_advisory_xact_lock(132148)')));assert.ok(t.installation.some(s=>s.includes('ADOPTION_SERIALIZATION_PRIOR_STATE_CHANGED')));const destination=t.installation.find(s=>s.includes('OWN_INSTALL_DESTINATION_MISMATCH'));assert.ok(destination.includes(t.projectId)&&destination.includes(t.branchId)&&destination.includes(t.endpointId));}
});
