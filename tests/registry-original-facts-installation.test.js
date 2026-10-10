import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildRegistryOriginalFactsInstallation,registryOriginalFactsDefinitions} from '../scripts/lib/registry-original-facts-installation.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
const options={sourceCommit:'688988dc4f57117ced5882c91339d5e6e9d71d76',read:p=>fs.readFileSync(p,'utf8'),legacyIdentityComparison:true};
test('registry increment extends seven pinned functions, adds two functions and no table or nominal operation',()=>{
 const b=buildRegistryOriginalFactsInstallation(options);assert.equal(b.newPins.length,2);assert.equal(b.afterPins.length,7);assert.equal(b.newPins[0].runtime,false);assert.equal(b.newPins[1].runtime,true);
 assert.deepEqual(b.beforePins,b.previous.afterPins);assert.equal(b.beforeCheck,b.previous.afterCheck);
 for(let n=0;n<7;n++){assert.equal(b.afterPins[n].signature,b.beforePins[n].signature);assert.equal(b.afterPins[n].runtime,b.beforePins[n].runtime);assert.notEqual(b.afterPins[n].sha256,b.beforePins[n].sha256);}
 assert.ok(b.migration.every(s=>!/^CREATE TABLE|^ALTER TABLE|^INSERT INTO|^UPDATE |^DELETE /m.test(s)));
 assert.match(b.audit,/REGISTRY_PRIOR_STATE_CHANGED/);assert.match(b.state,/REGISTRY_PARTIAL_STATE/);assert.match(b.state,/repeatable read/);
 assert.match(b.migration.at(-2),/REVOKE ALL/);assert.equal(b.migration.at(-1),'GRANT EXECUTE ON FUNCTION public.employment_adoption_registry_bootstrap_v1(jsonb,uuid,text) TO municontrol_actions_runtime_app');
});
test('new schema definitions preserve exact issue-to-NULL correspondence and frozen original jurisdictions',()=>{
 const b=buildRegistryOriginalFactsInstallation(options);assert.match(b.afterDefinitions[0],/sourceFactsPolicy/);assert.match(b.afterDefinitions[0],/jurisdictionCode' IS DISTINCT FROM raw/);
 assert.match(b.afterDefinitions[1],/registry_eligible_v1\(x.candidate\)/);assert.match(b.afterDefinitions[2],/registry_eligible_v1\(candidate\)/);
 assert.match(b.afterDefinitions[3],/before_row.jurisdiction_code IS NULL/);assert.match(b.afterDefinitions[3],/to_jsonb\(after_row\)=public.employment_adoption_final_after_v1/);
 for(const definition of registryOriginalFactsDefinitions())assert.ok(ownInstallationFunctionPin(definition).sha256);
 assert.match(b.newDefinitions[0],/count\(DISTINCT x\)/);assert.match(b.newDefinitions[0],/CLASSIFICATION_MISSING/);
 assert.match(b.newDefinitions[1],/municipal_adoption_ready_v1/);
});
