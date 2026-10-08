import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildInactiveJurisdictionInstallation} from '../scripts/lib/adoption-inactive-jurisdiction-installation.mjs';
import {buildInactiveJurisdictionQa,relocateInactiveJurisdictionInstallation} from '../scripts/lib/adoption-inactive-jurisdiction-qa.mjs';
import {buildOwnJurisdictionInstallation} from '../scripts/lib/own-payroll-jurisdiction-installation.mjs';
import {buildAdoptedOwnNoveltyInstallation} from '../scripts/lib/adopted-own-novelties-installation.mjs';
import {relocateNoeliaNoveltyInstallation,relocateNoeliaJurisdictionInstallation} from '../scripts/lib/noelia-payroll-circuit-qa.mjs';
import {prepareInactiveJurisdictionInstallation} from '../scripts/prepare-adoption-inactive-jurisdiction.mjs';
const options={sourceCommit:'1'.repeat(40),read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')};
test('review binds only the two existing destinations and exact transaction settings',()=>{
 const batch=prepareInactiveJurisdictionInstallation(options);assert.equal(batch.targets.length,2);assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);
 for(const target of batch.targets){assert.equal(target.database,'neondb');assert.ok([17,18].includes(target.major));assert.ok(target.installation.includes('SET LOCAL search_path=pg_catalog, public, pg_temp'));assert.match(target.installation.join('\n'),/OWN_INSTALL_DESTINATION_MISMATCH/);assert.equal(target.verification[0],'SET TRANSACTION READ ONLY');}
});
test('installation changes six reviewed bodies and preserves every other function attribute',()=>{
 const batch=buildInactiveJurisdictionInstallation(options);
 assert.equal(batch.beforePins.length,6);assert.equal(batch.afterPins.length,6);
 for(let n=0;n<6;n++){assert.notEqual(batch.beforePins[n].sha256,batch.afterPins[n].sha256);assert.deepEqual({...batch.beforePins[n],sha256:null},{...batch.afterPins[n],sha256:null});}
 assert.equal(batch.installation.length,9);
 assert.doesNotMatch(batch.installation.join('\n'),/\b(?:GRANT|REVOKE|CREATE TABLE|ALTER TABLE|TRUNCATE|DELETE FROM)\b/i);
 assert.match(batch.audit,/PRIOR_STATE_CHANGED/);assert.match(batch.state,/PARTIAL_STATE/);
 assert.match(batch.afterDefinitions[1],/IS NOT DISTINCT FROM 'employment-adoption-input.v2'/);
 assert.match(batch.afterDefinitions[4],/IF c.jurisdiction_code IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_JURISDICTION_REQUIRED'/);
});
test('source drift is refused before generating an installation',()=>{
 assert.throws(()=>buildInactiveJurisdictionInstallation({...options,sourceCommit:'not-a-commit'}));
 assert.throws(()=>buildInactiveJurisdictionInstallation({...options,read:p=>options.read(p).replace("'version','employment-adoption-preparation.v1','rawReview'","'changed','rawReview'")}));
});
for(const major of [17,18])test('synthetic PG'+major+' fixture retains 57 rows and normalized metadata guards',()=>{
 const qa=buildInactiveJurisdictionQa(major),previous=relocateNoeliaNoveltyInstallation(buildAdoptedOwnNoveltyInstallation(options),qa),jurisdiction=relocateNoeliaJurisdictionInstallation(buildOwnJurisdictionInstallation(options),qa,previous),batch=relocateInactiveJurisdictionInstallation(buildInactiveJurisdictionInstallation(options),qa,jurisdiction);
 assert.match(qa.sql,/FOR fixture_n IN 1\.\.54 LOOP/);assert.match(qa.sql,/end_date='2020-01-01',jurisdiction_code=NULL/);
 assert.equal(batch.installation.length,9);assert.match(batch.installation[0],/municipal_adoption_ready_v1/);assert.ok(batch.installation[0].includes(jurisdiction.readyPin.sha256));assert.ok(batch.installation[0].includes(batch.readyPin.sha256));
});
